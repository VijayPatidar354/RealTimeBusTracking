const pool   = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { getIO } = require('../socket');
const { checkAndProgressStop } = require('../services/autoStopService');
const etaService = require('../services/etaService');
const { validatePhone, validatePassword, validateName, validateCoordinates, safeErrorResponse, validateLicenseNumber } = require('../utils/validators');
const { runValidations } = require('../utils/runValidations');

const loginDriver = async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (runValidations(res, validatePhone(phone), validatePassword(password))) return;

        const result = await pool.query(`SELECT * FROM drivers WHERE phone = $1`, [phone.trim()]);

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        const driver  = result.rows[0];
        const isMatch = await bcrypt.compare(password, driver.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        const token = jwt.sign(
            { id: driver.id, role: "driver" },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
        );
        res.status(200).json({ success: true, token });
    } catch (error) {
        safeErrorResponse(res, error, 'Driver');
    }
};

const getDrivers = async (req, res) => {
    try {
        // Explicit column list — password is intentionally excluded.
        // Even with auth protection this is defence-in-depth: the password
        // hash can never leak through this endpoint regardless of future
        // middleware changes.
        const result = await pool.query(
            `SELECT id, driver_name, phone, license_number,
                    latitude, longitude, created_at
             FROM drivers
             ORDER BY id ASC`
        );
        res.status(200).json({ success: true, total: result.rows.length, drivers: result.rows });
    } catch (error) {
        safeErrorResponse(res, error, 'Driver');
    }
};

const getDriverProfile = async (req, res) => {
    try {
        const driverId = req.driver.id;
        const result = await pool.query(
            `
            SELECT
                d.id, d.driver_name, d.phone, d.license_number,
                d.latitude, d.longitude,
                b.bus_number, b.bus_type,
                COALESCE(b.current_speed_kmph, 30)::INTEGER AS current_speed_kmph
            FROM drivers d
            LEFT JOIN buses b ON d.id = b.driver_id
            WHERE d.id = $1
            `,
            [driverId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Driver not found" });
        }
        res.status(200).json({ success: true, driver: result.rows[0] });
    } catch (error) {
        safeErrorResponse(res, error, 'Driver');
    }
};

// ================================================================
//  UPDATE LOCATION  ← emits bus:location_updated
//  PUT /api/driver/update-location
//  Body: { latitude, longitude }
//  Protected: verifyDriver
//
//  After DB update, emits to route:{routeId} so all passengers
//  tracking that route receive the new coordinates instantly.
// ================================================================
const updateLocation = async (req, res) => {
    try {
        const driverId          = req.driver.id;
        const { latitude, longitude } = req.body;

        const coordError = validateCoordinates(latitude, longitude);
        if (coordError) {
            return res.status(400).json({ success: false, message: coordError });
        }

        // Update driver's coordinates
        const result = await pool.query(
            `
            UPDATE drivers
            SET    latitude  = $1,
                   longitude = $2
            WHERE  id = $3
            RETURNING id, driver_name, latitude, longitude
            `,
            [latitude, longitude, driverId]
        );

        // Get the bus + route assigned to this driver
        const busResult = await pool.query(
            `
            SELECT b.id AS bus_id, b.bus_number, b.bus_type, b.route_id
            FROM   buses b
            WHERE  b.driver_id = $1
            LIMIT  1
            `,
            [driverId]
        );

        // Emit only if bus has an assigned route
        if (busResult.rows.length > 0 && busResult.rows[0].route_id) {
            const bus = busResult.rows[0];

            // ── EVENT: bus:location_updated ───────────────────────
            // Room: route:{routeId}
            // Receivers: passengers tracking this route
            getIO().to(`route:${bus.route_id}`).emit('bus:location_updated', {
                event:     'bus:location_updated',
                bus_id:    bus.bus_id,
                bus_number: bus.bus_number,
                route_id:  bus.route_id,
                driver_id: driverId,
                latitude,
                longitude,
                timestamp: new Date().toISOString()
            });

            // Also emit to owner room and admin for fleet monitoring
            getIO().to('admin').emit('bus:location_updated', {
                event:     'bus:location_updated',
                bus_id:    bus.bus_id,
                bus_number: bus.bus_number,
                route_id:  bus.route_id,
                driver_id: driverId,
                latitude,
                longitude,
                timestamp: new Date().toISOString()
            });

            // ── AUTO STOP DETECTION ───────────────────────────────
            // Runs asynchronously — does NOT block the HTTP response.
            // Internally handles all guards (no bus, no route, no coords,
            // duplicate pings, trip completed) and never throws.
            checkAndProgressStop(driverId, latitude, longitude)
                .catch(err => console.error('[AutoStop] Unexpected error:', err.message));

            // ── ETA UPDATE ─────────────────────────────────────────────
            // Record GPS for speed calculation, then emit throttled
            // ETA updates. Non-blocking — does NOT affect response.
            etaService.recordGPSUpdate(bus.bus_id, latitude, longitude, Date.now());
            etaService.emitETAUpdate(bus.bus_id, bus.route_id, driverId)
                .catch(err => console.error('[ETA] Unexpected error:', err.message));
        }

        res.status(200).json({
            success: true,
            message: "Location updated successfully",
            driver:  result.rows[0]
        });

    } catch (error) {
        safeErrorResponse(res, error, 'Driver');
    }
};

const getRouteStops = async (req, res) => {
    try {
        const driverId = req.driver.id;

        // Get bus + route for this driver
        const busResult = await pool.query(
            `SELECT b.id AS bus_id, b.route_id, b.current_stop_order,
                    r.route_name, r.source, r.destination
             FROM buses b
             LEFT JOIN routes r ON b.route_id = r.id
             WHERE b.driver_id = $1 LIMIT 1`,
            [driverId]
        );

        if (busResult.rows.length === 0 || !busResult.rows[0].route_id) {
            return res.status(404).json({
                success: false,
                message: 'No bus or route assigned to you'
            });
        }

        const { route_id, current_stop_order, route_name, source, destination } = busResult.rows[0];

        // Fetch ALL stops on route ordered by stop_order
        const stopsResult = await pool.query(
            `SELECT
                id          AS stop_id,
                stop_name,
                stop_order,
                stop_lat,
                stop_lon
             FROM stops
             WHERE route_id = $1
             ORDER BY stop_order ASC`,
            [route_id]
        );

        res.status(200).json({
            success:            true,
            route_id,
            route_name,
            source,
            destination,
            current_stop_order,
            stops:              stopsResult.rows
        });

    } catch (error) {
        safeErrorResponse(res, error, 'Driver');
    }
};

module.exports = {
    getDrivers,
    loginDriver,
    getDriverProfile,
    updateLocation,
    getRouteStops,
};
