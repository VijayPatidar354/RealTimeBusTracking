const pool   = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { getIO } = require('../socket');

// ================================================================
//  HAVERSINE DISTANCE — server-side geofence calculation
//  Returns distance in METRES between two lat/lon coordinates.
//  Used in markStopReached to validate bus is at the stop.
//  This runs on the server — cannot be bypassed by the client.
// ================================================================
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R  = 6371000; // Earth radius in metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a  = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
               Math.cos(φ1) * Math.cos(φ2) *
               Math.sin(Δλ/2) * Math.sin(Δλ/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ================================================================
//  SHARED HELPER — getNextStopInfo
//  Fetches next stop + waiting count for a given bus.
// ================================================================
async function getNextStopInfo(routeId, currentStopOrder) {
    const stopResult = await pool.query(
        `SELECT s.id AS stop_id, s.stop_name, s.stop_order
         FROM   stops s
         WHERE  s.route_id   = $1
           AND  s.stop_order = $2
         LIMIT 1`,
        [routeId, currentStopOrder]
    );
    if (stopResult.rows.length === 0) return null;
    const stop = stopResult.rows[0];
    const countResult = await pool.query(
        `SELECT COUNT(id)::INTEGER AS waiting_count
         FROM passenger_waiting
         WHERE stop_id = $1 AND route_id = $2`,
        [stop.stop_id, routeId]
    );
    return {
        stop_id:         stop.stop_id,
        next_stop_name:  stop.stop_name,
        next_stop_order: stop.stop_order,
        waiting_count:   countResult.rows[0].waiting_count
    };
}

// ================================================================
//  SHARED HELPER — getUpcomingStopsWaiting
//  Returns all upcoming stops (stop_order >= currentStopOrder)
//  with waiting counts and is_next_stop flag.
//  Used by driverGetAllWaiting AND the route-waiting-updated emitter.
// ================================================================
async function getUpcomingStopsWaiting(routeId, currentStopOrder) {
    const result = await pool.query(
        `
        SELECT
            s.id          AS stop_id,
            s.stop_name,
            s.stop_order,
            s.stop_lat,
            s.stop_lon,
            COUNT(pw.id)::INTEGER AS waiting_count,
            (s.stop_order = $2)   AS is_next_stop

        FROM  stops s

        LEFT JOIN passenger_waiting pw
               ON pw.stop_id  = s.id
              AND pw.route_id  = $1

        WHERE s.route_id    = $1
          AND s.stop_order >= $2

        GROUP BY s.id
        ORDER BY s.stop_order ASC
        `,
        [routeId, currentStopOrder]
    );
    return result.rows;
}

// ── AUTH ──────────────────────────────────────────────────────────

const registerPassenger = async (req, res) => {
    try {
        const { passenger_name, phone, email, password } = req.body;
        if (!passenger_name || !phone || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "passenger_name, phone, email, and password are required"
            });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO passengers (passenger_name, phone, email, password)
             VALUES ($1, $2, $3, $4)
             RETURNING id, passenger_name, phone, email, created_at`,
            [passenger_name, phone, email, hashedPassword]
        );
        res.status(201).json({ success: true, passenger: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            const field = error.constraint.includes('phone') ? 'phone' : 'email';
            return res.status(409).json({ success: false, message: `A passenger with this ${field} already exists` });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

const loginPassenger = async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query(`SELECT * FROM passengers WHERE email = $1`, [email]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Passenger not found" });
        }
        const passenger = result.rows[0];
        const isMatch   = await bcrypt.compare(password, passenger.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        const token = jwt.sign({ passengerId: passenger.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(200).json({ success: true, token });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── ROUTE BROWSING ────────────────────────────────────────────────

const getAllRoutes = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.id, r.route_name, r.source, r.destination,
                    COUNT(DISTINCT s.id)::INTEGER AS total_stops,
                    COUNT(DISTINCT b.id)::INTEGER AS total_buses
             FROM routes r
             LEFT JOIN stops s ON r.id = s.route_id
             LEFT JOIN buses b ON r.id = b.route_id
             GROUP BY r.id ORDER BY r.id ASC`
        );
        res.status(200).json({ success: true, total: result.rows.length, routes: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getRouteById = async (req, res) => {
    try {
        const { id } = req.params;
        const routeResult = await pool.query(
            `SELECT id, route_name, source, destination FROM routes WHERE id = $1`, [id]
        );
        if (routeResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Route not found" });
        }
        const stopsResult = await pool.query(
            `SELECT id, stop_name, stop_order FROM stops WHERE route_id = $1 ORDER BY stop_order ASC`, [id]
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

// ── LIVE TRACKING ─────────────────────────────────────────────────

const getLiveBuses = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT b.id AS bus_id, b.bus_number, b.bus_type, b.current_stop_order,
                    r.id AS route_id, r.route_name, r.source, r.destination,
                    d.id AS driver_id, d.driver_name, d.phone AS driver_phone,
                    d.latitude, d.longitude
             FROM buses b
             JOIN  routes  r ON b.route_id  = r.id
             LEFT JOIN drivers d ON b.driver_id = d.id
             ORDER BY b.id ASC`
        );
        res.status(200).json({ success: true, total: result.rows.length, buses: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getBusesNearStop = async (req, res) => {
    try {
        const { stopId } = req.params;
        const stopResult = await pool.query(
            `SELECT s.id, s.stop_name, s.stop_order, s.route_id,
                    r.route_name, r.source, r.destination
             FROM stops s JOIN routes r ON s.route_id = r.id
             WHERE s.id = $1`, [stopId]
        );
        if (stopResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Stop not found" });
        }
        const stop = stopResult.rows[0];
        const busesResult = await pool.query(
            `SELECT b.id AS bus_id, b.bus_number, b.bus_type, b.current_stop_order,
                    d.id AS driver_id, d.driver_name, d.phone AS driver_phone,
                    d.latitude, d.longitude
             FROM buses b
             LEFT JOIN drivers d ON b.driver_id = d.id
             WHERE b.route_id = $1 ORDER BY b.id ASC`, [stop.route_id]
        );
        res.status(200).json({
            success: true,
            stop:  { id: stop.id, stop_name: stop.stop_name, stop_order: stop.stop_order },
            route: { id: stop.route_id, route_name: stop.route_name, source: stop.source, destination: stop.destination },
            total_buses: busesResult.rows.length,
            buses: busesResult.rows
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getBusById = async (req, res) => {
    try {
        const { id } = req.params;
        const busResult = await pool.query(
            `SELECT b.id AS bus_id, b.bus_number, b.bus_type, b.current_stop_order,
                    r.id AS route_id, r.route_name, r.source, r.destination,
                    d.id AS driver_id, d.driver_name, d.phone AS driver_phone,
                    d.latitude, d.longitude
             FROM buses b
             LEFT JOIN routes  r ON b.route_id  = r.id
             LEFT JOIN drivers d ON b.driver_id = d.id
             WHERE b.id = $1`, [id]
        );
        if (busResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Bus not found" });
        }
        const bus = busResult.rows[0];
        let stops = [];
        if (bus.route_id) {
            const stopsResult = await pool.query(
                `SELECT id, stop_name, stop_order FROM stops WHERE route_id = $1 ORDER BY stop_order ASC`,
                [bus.route_id]
            );
            stops = stopsResult.rows;
        }
        res.status(200).json({
            success: true,
            bus: {
                bus_id: bus.bus_id, bus_number: bus.bus_number, bus_type: bus.bus_type,
                current_stop_order: bus.current_stop_order,
                live_location: { latitude: bus.latitude, longitude: bus.longitude },
                driver: { driver_id: bus.driver_id, driver_name: bus.driver_name, driver_phone: bus.driver_phone },
                route: bus.route_id ? {
                    route_id: bus.route_id, route_name: bus.route_name,
                    source: bus.source, destination: bus.destination,
                    total_stops: stops.length, stops
                } : null
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── WAITING SYSTEM ────────────────────────────────────────────────

const registerWaiting = async (req, res) => {
    try {
        const passengerId          = req.passenger.passengerId;
        const { stop_id, route_id } = req.body;

        if (!stop_id || !route_id) {
            return res.status(400).json({ success: false, message: "stop_id and route_id are required" });
        }

        // Guard 1 — stop belongs to route
        const stopCheck = await pool.query(
            `SELECT id, stop_name, stop_order FROM stops WHERE id = $1 AND route_id = $2`,
            [stop_id, route_id]
        );
        if (stopCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Stop does not belong to this route" });
        }
        const stop = stopCheck.rows[0];

        // Guard 2 — not the final stop
        const maxOrderResult = await pool.query(
            `SELECT MAX(stop_order) AS max_order FROM stops WHERE route_id = $1`, [route_id]
        );
        if (stop.stop_order === maxOrderResult.rows[0].max_order) {
            return res.status(400).json({ success: false, message: "Cannot register waiting at the final stop (destination)" });
        }

        // Guard 3 — stop is still ahead of at least one active bus on this route
        //   Query counts total active buses and how many have already passed this stop.
        //   "Passed" means current_stop_order > stop.stop_order (bus has moved beyond it).
        //   If every active bus has passed, the passenger would never be picked up.
        const busStatusResult = await pool.query(
            `SELECT
                COUNT(id)::INTEGER                                          AS total_active,
                COUNT(CASE WHEN current_stop_order > $2 THEN 1 END)::INTEGER AS already_passed
             FROM buses
             WHERE route_id = $1 AND driver_id IS NOT NULL`,
            [route_id, stop.stop_order]
        );
        const { total_active, already_passed } = busStatusResult.rows[0];
        if (total_active > 0 && already_passed === total_active) {
            return res.status(400).json({
                success: false,
                message: `All active buses have already passed "${stop.stop_name}". Cannot register waiting at a stop the bus has passed.`
            });
        }

        // Insert
        const result = await pool.query(
            `INSERT INTO passenger_waiting (passenger_id, stop_id, route_id)
             VALUES ($1, $2, $3)
             RETURNING id, passenger_id, stop_id, route_id, created_at`,
            [passengerId, stop_id, route_id]
        );

        // Updated count for this specific stop
        const countResult = await pool.query(
            `SELECT COUNT(id)::INTEGER AS total_waiting
             FROM passenger_waiting WHERE stop_id = $1 AND route_id = $2`,
            [stop_id, route_id]
        );
        const totalWaiting = countResult.rows[0].total_waiting;

        // Find all buses on this route
        const busesOnRoute = await pool.query(
            `SELECT b.driver_id, b.id AS bus_id, b.current_stop_order
             FROM buses b WHERE b.route_id = $1 AND b.driver_id IS NOT NULL`,
            [route_id]
        );

        // ── Emit waiting:updated to passengers on this route ──────
        const waitingPayload = {
            event:         'waiting:updated',
            route_id:      parseInt(route_id),
            stop_id:       parseInt(stop_id),
            stop_name:     stop.stop_name,
            stop_order:    stop.stop_order,
            total_waiting: totalWaiting,
            timestamp:     new Date().toISOString()
        };
        getIO().to(`route:${route_id}`).emit('waiting:updated', waitingPayload);

        // ── For each driver: emit next-stop-updated + route-waiting-updated
        for (const bus of busesOnRoute.rows) {
            // next-stop-updated only if this IS their next stop
            if (bus.current_stop_order === stop.stop_order) {
                getIO().to(`driver:${bus.driver_id}`).emit('next-stop-updated', {
                    event:           'next-stop-updated',
                    route_id:        parseInt(route_id),
                    next_stop_name:  stop.stop_name,
                    next_stop_order: stop.stop_order,
                    waiting_count:   totalWaiting,
                    timestamp:       new Date().toISOString()
                });
            }

            // route-waiting-updated — full upcoming stops for driver panel
            const upcomingStops = await getUpcomingStopsWaiting(route_id, bus.current_stop_order);
            getIO().to(`driver:${bus.driver_id}`).emit('route-waiting-updated', {
                event:              'route-waiting-updated',
                route_id:           parseInt(route_id),
                current_stop_order: bus.current_stop_order,
                stops:              upcomingStops,
                timestamp:          new Date().toISOString()
            });
        }

        res.status(201).json({
            success: true,
            message: `Waiting registered at "${stop.stop_name}"`,
            waiting: result.rows[0]
        });

    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ success: false, message: "You are already registered as waiting at this stop for this route" });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

const getWaitingCountsForRoute = async (req, res) => {
    try {
        const { id } = req.params;
        const routeCheck = await pool.query(`SELECT id, route_name FROM routes WHERE id = $1`, [id]);
        if (routeCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Route not found" });
        }
        const result = await pool.query(
            `SELECT s.id AS stop_id, s.stop_name, s.stop_order,
                    COUNT(pw.id)::INTEGER AS total_waiting
             FROM stops s
             LEFT JOIN passenger_waiting pw ON s.id = pw.stop_id AND pw.route_id = $1
             WHERE s.route_id = $1
             GROUP BY s.id ORDER BY s.stop_order ASC`,
            [id]
        );
        res.status(200).json({
            success:    true,
            route_id:   parseInt(id),
            route_name: routeCheck.rows[0].route_name,
            stops:      result.rows
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ================================================================
//  DRIVER: GET NEXT STOP ONLY
//  GET /api/driver/route/waiting
//  Protected: verifyDriver
//  Returns: next stop name + waiting count for that stop only
// ================================================================
const driverGetWaitingCounts = async (req, res) => {
    try {
        const driverId = req.driver.id;
        const busResult = await pool.query(
            `SELECT b.id AS bus_id, b.route_id, b.current_stop_order, r.route_name
             FROM buses b
             LEFT JOIN routes r ON b.route_id = r.id
             WHERE b.driver_id = $1 LIMIT 1`,
            [driverId]
        );
        if (busResult.rows.length === 0 || !busResult.rows[0].route_id) {
            return res.status(404).json({ success: false, message: "No bus or route assigned to you" });
        }
        const { bus_id, route_id, current_stop_order, route_name } = busResult.rows[0];
        const maxResult = await pool.query(
            `SELECT MAX(stop_order) AS max_order FROM stops WHERE route_id = $1`, [route_id]
        );
        if (current_stop_order > maxResult.rows[0].max_order) {
            return res.status(200).json({ success: true, route_id, route_name, trip_status: 'completed', message: 'Bus has completed all stops' });
        }
        const nextStop = await getNextStopInfo(route_id, current_stop_order);
        if (!nextStop) {
            return res.status(200).json({ success: true, route_id, route_name, trip_status: 'completed', message: 'No more stops remaining' });
        }
        res.status(200).json({
            success: true, route_id, route_name, trip_status: 'active',
            next_stop_name: nextStop.next_stop_name,
            next_stop_order: nextStop.next_stop_order,
            waiting_count: nextStop.waiting_count
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ================================================================
//  DRIVER: GET ALL UPCOMING STOPS WITH WAITING COUNTS  ← NEW
//  GET /api/driver/route/all-waiting
//  Protected: verifyDriver
//
//  Returns:
//    - route info
//    - current_stop_order
//    - all upcoming stops (stop_order >= current_stop_order)
//    - waiting count per stop
//    - is_next_stop flag on the first upcoming stop
// ================================================================
const driverGetAllWaiting = async (req, res) => {
    try {
        const driverId = req.driver.id;

        // Get driver's bus + route + current_stop_order
        const busResult = await pool.query(
            `SELECT b.id AS bus_id, b.route_id, b.current_stop_order,
                    r.route_name, r.source, r.destination
             FROM buses b
             LEFT JOIN routes r ON b.route_id = r.id
             WHERE b.driver_id = $1 LIMIT 1`,
            [driverId]
        );

        if (busResult.rows.length === 0 || !busResult.rows[0].route_id) {
            return res.status(404).json({ success: false, message: "No bus or route assigned to you" });
        }

        const { bus_id, route_id, current_stop_order, route_name, source, destination } = busResult.rows[0];

        // Check trip completion
        const maxResult = await pool.query(
            `SELECT MAX(stop_order) AS max_order FROM stops WHERE route_id = $1`, [route_id]
        );
        const maxOrder = maxResult.rows[0].max_order;

        if (current_stop_order > maxOrder) {
            return res.status(200).json({
                success:            true,
                route_id,
                route_name,
                source,
                destination,
                current_stop_order,
                trip_status:        'completed',
                stops:              [],
                message:            'Bus has completed all stops on this route'
            });
        }

        // Single query: all upcoming stops with waiting counts + is_next_stop
        const upcomingStops = await getUpcomingStopsWaiting(route_id, current_stop_order);

        res.status(200).json({
            success:            true,
            route_id,
            route_name,
            source,
            destination,
            current_stop_order,
            trip_status:        'active',
            stops:              upcomingStops
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ================================================================
//  DRIVER: MARK STOP REACHED — with progression + full emit
//  POST /api/driver/route/stop-reached
//  Body: { stop_id }
//  Protected: verifyDriver
// ================================================================
const markStopReached = async (req, res) => {
    try {
        const driverId    = req.driver.id;
        const { stop_id } = req.body;

        if (!stop_id) {
            return res.status(400).json({ success: false, message: "stop_id is required" });
        }

        const busResult = await pool.query(
            `SELECT b.id AS bus_id, b.route_id, b.current_stop_order, o.id AS owner_id
             FROM buses b
             LEFT JOIN owners o ON b.owner_id = o.id
             WHERE b.driver_id = $1 LIMIT 1`,
            [driverId]
        );
        if (busResult.rows.length === 0 || !busResult.rows[0].route_id) {
            return res.status(404).json({ success: false, message: "No bus or route assigned to you" });
        }
        const { bus_id, route_id, current_stop_order, owner_id } = busResult.rows[0];

        const stopCheck = await pool.query(
            `SELECT id, stop_name, stop_order, stop_lat, stop_lon
             FROM stops WHERE id = $1 AND route_id = $2`,
            [stop_id, route_id]
        );
        if (stopCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Stop does not belong to your assigned route" });
        }
        const reachedStop = stopCheck.rows[0];

        // Guard 1 — must match current_stop_order (sequential progression)
        if (reachedStop.stop_order !== current_stop_order) {
            return res.status(400).json({
                success: false,
                message: `Expected stop_order ${current_stop_order} but got ${reachedStop.stop_order}. Mark stops in sequence.`
            });
        }

        // ── Guard 2: BACKEND GEOFENCE VALIDATION ─────────────────
        // Only enforced when stop has coordinates.
        // Frontend distance check is NOT trusted — any client can call
        // this endpoint directly. We re-compute distance server-side.
        if (reachedStop.stop_lat !== null && reachedStop.stop_lon !== null) {

            // Fetch driver's current GPS coordinates from drivers table
            const driverLocResult = await pool.query(
                `SELECT latitude, longitude FROM drivers WHERE id = $1`,
                [driverId]
            );

            const driverLoc = driverLocResult.rows[0];

            if (!driverLoc || driverLoc.latitude === null || driverLoc.longitude === null) {
                return res.status(400).json({
                    success: false,
                    message: "Your current location is not available. Update your GPS first."
                });
            }

            // Haversine distance in metres (server-side, cannot be spoofed)
            const GEOFENCE_RADIUS = 50;
            const distMetres = haversineDistance(
                parseFloat(driverLoc.latitude),
                parseFloat(driverLoc.longitude),
                parseFloat(reachedStop.stop_lat),
                parseFloat(reachedStop.stop_lon)
            );

            if (distMetres > GEOFENCE_RADIUS) {
                return res.status(403).json({
                    success:          false,
                    message:          `You are ${Math.round(distMetres)}m away from this stop. Must be within ${GEOFENCE_RADIUS}m to mark as reached.`,
                    distance_metres:  Math.round(distMetres),
                    required_metres:  GEOFENCE_RADIUS
                });
            }
        }
        // ── END GEOFENCE VALIDATION ───────────────────────────────

        // Clear waiting entries
        const deleted = await pool.query(
            `DELETE FROM passenger_waiting WHERE stop_id = $1 AND route_id = $2`,
            [stop_id, route_id]
        );

        // ── Emit waiting:updated with count=0 so passenger UI resets immediately ──
        getIO().to(`route:${route_id}`).emit('waiting:updated', {
            event:         'waiting:updated',
            route_id:      parseInt(route_id),
            stop_id:       parseInt(stop_id),
            stop_name:     reachedStop.stop_name,
            stop_order:    reachedStop.stop_order,
            total_waiting: 0,
            timestamp:     new Date().toISOString()
        });

        // Check last stop
        const maxResult = await pool.query(
            `SELECT MAX(stop_order) AS max_order FROM stops WHERE route_id = $1`, [route_id]
        );
        const maxOrder      = maxResult.rows[0].max_order;
        const newStopOrder  = current_stop_order + 1;
        const tripCompleted = newStopOrder > maxOrder;

        // Increment current_stop_order
        await pool.query(
            `UPDATE buses SET current_stop_order = $1 WHERE id = $2`,
            [newStopOrder, bus_id]
        );

        // ── Emit: stop:reached ────────────────────────────────────
        const stopReachedPayload = {
            event:            'stop:reached',
            bus_id, route_id,
            stop_id:          parseInt(stop_id),
            stop_name:        reachedStop.stop_name,
            stop_order:       reachedStop.stop_order,
            passengers_reset: deleted.rowCount,
            timestamp:        new Date().toISOString()
        };
        getIO().to(`route:${route_id}`).emit('stop:reached',  stopReachedPayload);
        getIO().to(`driver:${driverId}`).emit('stop:reached', stopReachedPayload);
        getIO().to(`owner:${owner_id}`).emit('stop:reached',  stopReachedPayload);
        getIO().to('admin').emit('stop:reached',               stopReachedPayload);

        if (!tripCompleted) {
            const nextStop      = await getNextStopInfo(route_id, newStopOrder);
            const upcomingStops = await getUpcomingStopsWaiting(route_id, newStopOrder);

            if (nextStop) {
                const nextStopPayload = {
                    event:           'next-stop-updated',
                    bus_id, route_id,
                    next_stop_name:  nextStop.next_stop_name,
                    next_stop_order: nextStop.next_stop_order,
                    waiting_count:   nextStop.waiting_count,
                    timestamp:       new Date().toISOString()
                };
                getIO().to(`driver:${driverId}`).emit('next-stop-updated', nextStopPayload);
                getIO().to(`route:${route_id}`).emit('next-stop-updated',  nextStopPayload);
                getIO().to(`owner:${owner_id}`).emit('next-stop-updated',  nextStopPayload);
                getIO().to('admin').emit('next-stop-updated',               nextStopPayload);
            }

            // ── Emit: route-waiting-updated — full upcoming list ──
            const routeWaitingPayload = {
                event:              'route-waiting-updated',
                bus_id, route_id,
                current_stop_order: newStopOrder,
                stops:              upcomingStops,
                timestamp:          new Date().toISOString()
            };
            getIO().to(`driver:${driverId}`).emit('route-waiting-updated', routeWaitingPayload);
            getIO().to(`route:${route_id}`).emit('route-waiting-updated',  routeWaitingPayload);
            getIO().to(`owner:${owner_id}`).emit('route-waiting-updated',  routeWaitingPayload);
            getIO().to('admin').emit('route-waiting-updated',               routeWaitingPayload);

            return res.status(200).json({
                success:          true,
                message:          `Reached "${reachedStop.stop_name}" — progressing to next stop`,
                passengers_reset: deleted.rowCount,
                reached_stop:     reachedStop.stop_name,
                next_stop:        nextStop ? nextStop.next_stop_name  : null,
                next_stop_order:  nextStop ? nextStop.next_stop_order : null,
                waiting_count:    nextStop ? nextStop.waiting_count   : 0,
                upcoming_stops:   upcomingStops
            });
        }

        // Trip completed
        getIO().to(`route:${route_id}`).emit('trip:completed', {
            event: 'trip:completed', bus_id, route_id,
            message: 'Bus has completed all stops on this route',
            timestamp: new Date().toISOString()
        });

        res.status(200).json({
            success:          true,
            message:          `Reached final stop "${reachedStop.stop_name}" — trip completed`,
            passengers_reset: deleted.rowCount,
            trip_status:      'completed'
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    registerPassenger, loginPassenger,
    getAllRoutes, getRouteById,
    getLiveBuses, getBusesNearStop, getBusById,
    registerWaiting, getWaitingCountsForRoute,
    driverGetWaitingCounts, driverGetAllWaiting, markStopReached
};


