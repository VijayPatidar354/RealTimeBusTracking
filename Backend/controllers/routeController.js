const pool = require('../config/db');
const { getIO } = require('../socket');

const createRoute = async (req, res) => {
    try {
        const ownerId = req.owner.ownerId;
        const { route_name, source, destination } = req.body;
        if (!route_name || !source || !destination) {
            return res.status(400).json({ success: false, message: "route_name, source, and destination are required" });
        }
        const result = await pool.query(
            `INSERT INTO routes (route_name, source, destination, owner_id) VALUES ($1, $2, $3, $4)
             RETURNING id, route_name, source, destination, owner_id, created_at`,
            [route_name, source, destination, ownerId]
        );
        res.status(201).json({ success: true, route: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ================================================================
//  ADD STOP — now accepts optional stop_lat, stop_lon
//  POST /api/owner/routes/:routeId/stops
//  Body: { stop_name, stop_order, stop_lat?, stop_lon? }
//
//  stop_lat / stop_lon are used by the driver app for
//  automatic geofence-based stop detection.
//  If not provided, manual "Mark Arrived" button is used instead.
// ================================================================
const addStop = async (req, res) => {
    try {
        const ownerId = req.owner.ownerId;
        const { routeId } = req.params;
        const { stop_name, stop_order, stop_lat, stop_lon } = req.body;

        if (!stop_name || stop_order === undefined || stop_order === null) {
            return res.status(400).json({ success: false, message: "stop_name and stop_order are required" });
        }
        if (!Number.isInteger(Number(stop_order)) || Number(stop_order) < 1) {
            return res.status(400).json({ success: false, message: "stop_order must be a positive integer" });
        }

        // Validate coordinates if provided
        if ((stop_lat !== undefined && stop_lon === undefined) ||
            (stop_lat === undefined && stop_lon !== undefined)) {
            return res.status(400).json({ success: false, message: "Provide both stop_lat and stop_lon, or neither" });
        }

        const routeCheck = await pool.query(
            `SELECT id FROM routes WHERE id = $1 AND owner_id = $2`, [routeId, ownerId]
        );
        if (routeCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Route not found or does not belong to you" });
        }

        const result = await pool.query(
            `INSERT INTO stops (route_id, stop_name, stop_order, stop_lat, stop_lon)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, route_id, stop_name, stop_order, stop_lat, stop_lon`,
            [routeId, stop_name, stop_order, stop_lat || null, stop_lon || null]
        );
        res.status(201).json({ success: true, stop: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ success: false, message: `stop_order ${req.body.stop_order} already exists on this route` });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

const getMyRoutes = async (req, res) => {
    try {
        const ownerId = req.owner.ownerId;
        const result = await pool.query(
            `SELECT r.id, r.route_name, r.source, r.destination, r.created_at,
                    COUNT(DISTINCT s.id)::INTEGER AS total_stops,
                    COUNT(DISTINCT b.id)::INTEGER AS total_buses
             FROM routes r
             LEFT JOIN stops s ON r.id = s.route_id
             LEFT JOIN buses b ON r.id = b.route_id
             WHERE r.owner_id = $1
             GROUP BY r.id ORDER BY r.id ASC`,
            [ownerId]
        );
        res.status(200).json({ success: true, total: result.rows.length, routes: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getMyRouteById = async (req, res) => {
    try {
        const ownerId = req.owner.ownerId;
        const { id }  = req.params;
        const routeResult = await pool.query(
            `SELECT id, route_name, source, destination, owner_id, created_at
             FROM routes WHERE id = $1 AND owner_id = $2`, [id, ownerId]
        );
        if (routeResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Route not found or does not belong to you" });
        }
        const stopsResult = await pool.query(
            `SELECT id, stop_name, stop_order, stop_lat, stop_lon
             FROM stops WHERE route_id = $1 ORDER BY stop_order ASC`, [id]
        );
        const busesResult = await pool.query(
            `SELECT b.id AS bus_id, b.bus_number, b.bus_type, b.current_stop_order,
                    d.id AS driver_id, d.driver_name, d.phone AS driver_phone,
                    d.latitude, d.longitude
             FROM buses b
             LEFT JOIN drivers d ON b.driver_id = d.id
             WHERE b.route_id = $1 ORDER BY b.id ASC`, [id]
        );
        res.status(200).json({
            success: true,
            route: { ...routeResult.rows[0], total_stops: stopsResult.rows.length, stops: stopsResult.rows, buses: busesResult.rows }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ================================================================
//  ASSIGN ROUTE TO BUS — resets current_stop_order to 1
// ================================================================
const assignRoute = async (req, res) => {
    try {
        const ownerId      = req.owner.ownerId;
        const { busId }    = req.params;
        const { route_id } = req.body;
        if (!route_id) {
            return res.status(400).json({ success: false, message: "route_id is required" });
        }
        // Fetch bus and its current route (to clean up stale waiting records later)
        const busCheck = await pool.query(
            `SELECT id, route_id AS old_route_id FROM buses WHERE id = $1 AND owner_id = $2`, [busId, ownerId]
        );
        if (busCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Bus not found or does not belong to you" });
        }
        const oldRouteId = busCheck.rows[0].old_route_id;
        const routeCheck = await pool.query(
            `SELECT id, route_name, source, destination FROM routes WHERE id = $1 AND owner_id = $2`,
            [route_id, ownerId]
        );
        if (routeCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Route not found or does not belong to you" });
        }
        const result = await pool.query(
            `UPDATE buses SET route_id = $1, current_stop_order = 1 WHERE id = $2
             RETURNING id, bus_number, bus_type, owner_id, driver_id, route_id, current_stop_order`,
            [route_id, busId]
        );

        // ── Clean up stale passenger_waiting for the old route ──
        // Only delete if this was the ONLY bus on the old route.
        // If other buses remain, those waiting records are still valid for them.
        if (oldRouteId && oldRouteId !== parseInt(route_id)) {
            const otherBusesResult = await pool.query(
                `SELECT id FROM buses WHERE route_id = $1 AND id != $2 LIMIT 1`,
                [oldRouteId, busId]
            );
            if (otherBusesResult.rows.length === 0) {
                await pool.query(
                    `DELETE FROM passenger_waiting WHERE route_id = $1`,
                    [oldRouteId]
                );
            }
        }
        const bus   = result.rows[0];
        const route = routeCheck.rows[0];
        const payload = {
            event: 'bus:route_assigned',
            bus_id: bus.id, bus_number: bus.bus_number, bus_type: bus.bus_type,
            route_id: bus.route_id, route_name: route.route_name,
            source: route.source, destination: route.destination,
            current_stop_order: 1, owner_id: ownerId,
            timestamp: new Date().toISOString()
        };
        getIO().to(`route:${route_id}`).emit('bus:route_assigned', payload);
        getIO().to(`owner:${ownerId}`).emit('bus:route_assigned',  payload);
        getIO().to('admin').emit('bus:route_assigned',              payload);
        res.status(200).json({ success: true, message: "Route assigned — bus progression reset to stop 1", bus, route });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const adminGetAllRoutes = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.id, r.route_name, r.source, r.destination, r.created_at,
                    o.owner_name,
                    COUNT(DISTINCT s.id)::INTEGER AS total_stops,
                    COUNT(DISTINCT b.id)::INTEGER AS total_buses
             FROM routes r
             JOIN owners o ON r.owner_id = o.id
             LEFT JOIN stops s ON r.id = s.route_id
             LEFT JOIN buses b ON r.id = b.route_id
             GROUP BY r.id, o.owner_name ORDER BY r.id ASC`
        );
        res.status(200).json({ success: true, total: result.rows.length, routes: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const adminGetRouteById = async (req, res) => {
    try {
        const { id } = req.params;
        const routeResult = await pool.query(
            `SELECT r.id, r.route_name, r.source, r.destination, r.created_at,
                    o.id AS owner_id, o.owner_name, o.email AS owner_email
             FROM routes r JOIN owners o ON r.owner_id = o.id
             WHERE r.id = $1`, [id]
        );
        if (routeResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Route not found" });
        }
        const stopsResult = await pool.query(
            `SELECT id, stop_name, stop_order, stop_lat, stop_lon
             FROM stops WHERE route_id = $1 ORDER BY stop_order ASC`, [id]
        );
        const busesResult = await pool.query(
            `SELECT b.id AS bus_id, b.bus_number, b.bus_type, b.current_stop_order,
                    d.id AS driver_id, d.driver_name, d.phone AS driver_phone,
                    d.latitude, d.longitude
             FROM buses b
             LEFT JOIN drivers d ON b.driver_id = d.id
             WHERE b.route_id = $1 ORDER BY b.id ASC`, [id]
        );
        res.status(200).json({
            success: true,
            route: { ...routeResult.rows[0], total_stops: stopsResult.rows.length, stops: stopsResult.rows, buses: busesResult.rows }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createRoute, addStop, getMyRoutes, getMyRouteById, assignRoute,
    adminGetAllRoutes, adminGetRouteById
};
