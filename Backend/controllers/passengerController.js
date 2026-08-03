const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getIO } = require("../socket");
const { haversineDistance } = require("../utils/haversine");
const etaService = require("../services/etaService");
const {
  validateEmail,
  validatePhone,
  validatePassword,
  validateName,
  validateId,
  safeErrorResponse,
} = require("../utils/validators");
const { runValidations } = require("../utils/runValidations");

// ================================================================
//  SHARED HELPER — getNextStopInfo
// ================================================================
async function getNextStopInfo(routeId, currentStopOrder) {
  const stopResult = await pool.query(
    `SELECT s.id AS stop_id, s.stop_name, s.stop_order, s.stop_lat, s.stop_lon
         FROM   stops s
         WHERE  s.route_id   = $1
           AND  s.stop_order = $2
         LIMIT 1`,
    [routeId, currentStopOrder],
  );
  if (stopResult.rows.length === 0) return null;
  const stop = stopResult.rows[0];
  const countResult = await pool.query(
    `SELECT COUNT(id)::INTEGER AS waiting_count
         FROM passenger_waiting
         WHERE stop_id = $1 AND route_id = $2`,
    [stop.stop_id, routeId],
  );
  return {
    stop_id: stop.stop_id,
    next_stop_name: stop.stop_name,
    next_stop_order: stop.stop_order,
    stop_lat: stop.stop_lat,
    stop_lon: stop.stop_lon,
    waiting_count: countResult.rows[0].waiting_count,
  };
}

// ================================================================
//  SHARED HELPER — getUpcomingStopsWaiting
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
    [routeId, currentStopOrder],
  );
  return result.rows;
}

// ── AUTH ──────────────────────────────────────────────────────────

const loginPassenger = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (runValidations(res, validateEmail(email), validatePassword(password)))
      return;

    const result = await pool.query(
      `SELECT * FROM passengers WHERE email = $1`,
      [email.trim().toLowerCase()],
    );

    if (result.rows.length === 0) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }
    const passenger = result.rows[0];
    const isMatch = await bcrypt.compare(password, passenger.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { passengerId: passenger.id, role: "passenger" },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );
    res.status(200).json({ success: true, token });
  } catch (error) {
    safeErrorResponse(res, error, "loginPassenger");
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
             GROUP BY r.id ORDER BY r.id ASC`,
    );
    res
      .status(200)
      .json({ success: true, total: result.rows.length, routes: result.rows });
  } catch (error) {
    safeErrorResponse(res, error, "getAllRoutes");
  }
};

const getRouteById = async (req, res) => {
  try {
    const { id } = req.params;
    if (runValidations(res, validateId(id, "Route ID"))) return;

    const routeResult = await pool.query(
      `SELECT id, route_name, source, destination FROM routes WHERE id = $1`,
      [id],
    );
    if (routeResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Route not found" });
    }
    const stopsResult = await pool.query(
      `SELECT id, stop_name, stop_order FROM stops WHERE route_id = $1 ORDER BY stop_order ASC`,
      [id],
    );
    const busesResult = await pool.query(
      `SELECT b.id AS bus_id, b.bus_number, b.bus_type, b.current_stop_order,
                    d.id AS driver_id, d.driver_name, d.phone AS driver_phone,
                    d.latitude, d.longitude
             FROM buses b
             LEFT JOIN drivers d ON b.driver_id = d.id
             WHERE b.route_id = $1 ORDER BY b.id ASC`,
      [id],
    );
    res.status(200).json({
      success: true,
      route: {
        ...routeResult.rows[0],
        total_stops: stopsResult.rows.length,
        stops: stopsResult.rows,
        buses: busesResult.rows,
      },
    });
  } catch (error) {
    safeErrorResponse(res, error, "getRouteById");
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
             ORDER BY b.id ASC`,
    );
    res
      .status(200)
      .json({ success: true, total: result.rows.length, buses: result.rows });
  } catch (error) {
    safeErrorResponse(res, error, "getLiveBuses");
  }
};

const getBusesNearStop = async (req, res) => {
  try {
    const { stopId } = req.params;
    if (runValidations(res, validateId(stopId, "Stop ID"))) return;

    const stopResult = await pool.query(
      `SELECT s.id, s.stop_name, s.stop_order, s.route_id,
                    r.route_name, r.source, r.destination
             FROM stops s JOIN routes r ON s.route_id = r.id
             WHERE s.id = $1`,
      [stopId],
    );
    if (stopResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Stop not found" });
    }
    const stop = stopResult.rows[0];
    const busesResult = await pool.query(
      `SELECT b.id AS bus_id, b.bus_number, b.bus_type, b.current_stop_order,
                    d.id AS driver_id, d.driver_name, d.phone AS driver_phone,
                    d.latitude, d.longitude
             FROM buses b
             LEFT JOIN drivers d ON b.driver_id = d.id
             WHERE b.route_id = $1 ORDER BY b.id ASC`,
      [stop.route_id],
    );
    res.status(200).json({
      success: true,
      stop: {
        id: stop.id,
        stop_name: stop.stop_name,
        stop_order: stop.stop_order,
      },
      route: {
        id: stop.route_id,
        route_name: stop.route_name,
        source: stop.source,
        destination: stop.destination,
      },
      total_buses: busesResult.rows.length,
      buses: busesResult.rows,
    });
  } catch (error) {
    safeErrorResponse(res, error, "getBusesNearStop");
  }
};

const getBusById = async (req, res) => {
  try {
    const { id } = req.params;
    if (runValidations(res, validateId(id, "Bus ID"))) return;

    const busResult = await pool.query(
      `SELECT b.id AS bus_id, b.bus_number, b.bus_type, b.current_stop_order,
                    r.id AS route_id, r.route_name, r.source, r.destination,
                    d.id AS driver_id, d.driver_name, d.phone AS driver_phone,
                    d.latitude, d.longitude
             FROM buses b
             LEFT JOIN routes  r ON b.route_id  = r.id
             LEFT JOIN drivers d ON b.driver_id = d.id
             WHERE b.id = $1`,
      [id],
    );
    if (busResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Bus not found" });
    }
    const bus = busResult.rows[0];
    let stops = [];
    if (bus.route_id) {
      const stopsResult = await pool.query(
        `SELECT id, stop_name, stop_order FROM stops WHERE route_id = $1 ORDER BY stop_order ASC`,
        [bus.route_id],
      );
      stops = stopsResult.rows;
    }
    res.status(200).json({
      success: true,
      bus: {
        bus_id: bus.bus_id,
        bus_number: bus.bus_number,
        bus_type: bus.bus_type,
        current_stop_order: bus.current_stop_order,
        live_location: { latitude: bus.latitude, longitude: bus.longitude },
        driver: {
          driver_id: bus.driver_id,
          driver_name: bus.driver_name,
          driver_phone: bus.driver_phone,
        },
        route: bus.route_id
          ? {
              route_id: bus.route_id,
              route_name: bus.route_name,
              source: bus.source,
              destination: bus.destination,
              total_stops: stops.length,
              stops,
            }
          : null,
      },
    });
  } catch (error) {
    safeErrorResponse(res, error, "getBusById");
  }
};

// ── WAITING SYSTEM ────────────────────────────────────────────────

const registerWaiting = async (req, res) => {
  try {
    const passengerId = req.passenger.passengerId;
    const { stop_id, route_id } = req.body;

    if (
      runValidations(
        res,
        validateId(stop_id, "stop_id"),
        validateId(route_id, "route_id"),
      )
    )
      return;

    const stopCheck = await pool.query(
      `SELECT id, stop_name, stop_order, stop_lat, stop_lon FROM stops WHERE id = $1 AND route_id = $2`,
      [stop_id, route_id],
    );
    if (stopCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Stop does not belong to this route",
      });
    }
    const stop = stopCheck.rows[0];

    const maxOrderResult = await pool.query(
      `SELECT MAX(stop_order) AS max_order FROM stops WHERE route_id = $1`,
      [route_id],
    );
    if (stop.stop_order === maxOrderResult.rows[0].max_order) {
      return res.status(400).json({
        success: false,
        message: "Cannot register waiting at the final stop (destination)",
      });
    }

    const busStatusResult = await pool.query(
      `SELECT
                COUNT(id)::INTEGER                                          AS total_active,
                COUNT(CASE WHEN current_stop_order > $2 THEN 1 END)::INTEGER AS already_passed
             FROM buses
             WHERE route_id = $1 AND driver_id IS NOT NULL`,
      [route_id, stop.stop_order],
    );
    const { total_active, already_passed } = busStatusResult.rows[0];
    if (total_active > 0 && already_passed === total_active) {
      return res.status(400).json({
        success: false,
        message: `All active buses have already passed "${stop.stop_name}". Cannot register waiting at a stop the bus has passed.`,
      });
    }

    // Guard 4 — optional proximity check (only if passenger sends GPS)
    const { latitude, longitude } = req.body;
    if (
      latitude != null &&
      longitude != null &&
      stop.stop_lat &&
      stop.stop_lon
    ) {
      const dist = haversineDistance(
        Number(latitude),
        Number(longitude),
        Number(stop.stop_lat),
        Number(stop.stop_lon),
      );
      if (dist > 500) {
        return res.status(400).json({
          success: false,
          message: `You are ${Math.round(dist)}m from "${stop.stop_name}". Must be within 500m to register.`,
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO passenger_waiting (passenger_id, stop_id, route_id)
             VALUES ($1, $2, $3)
             RETURNING id, passenger_id, stop_id, route_id, created_at`,
      [passengerId, stop_id, route_id],
    );

    const countResult = await pool.query(
      `SELECT COUNT(id)::INTEGER AS total_waiting
             FROM passenger_waiting WHERE stop_id = $1 AND route_id = $2`,
      [stop_id, route_id],
    );
    const totalWaiting = countResult.rows[0].total_waiting;

    const busesOnRoute = await pool.query(
      `SELECT b.driver_id, b.id AS bus_id, b.current_stop_order
             FROM buses b WHERE b.route_id = $1 AND b.driver_id IS NOT NULL`,
      [route_id],
    );

    const waitingPayload = {
      event: "waiting:updated",
      route_id: parseInt(route_id),
      stop_id: parseInt(stop_id),
      stop_name: stop.stop_name,
      stop_order: stop.stop_order,
      total_waiting: totalWaiting,
      timestamp: new Date().toISOString(),
    };
    getIO().to(`route:${route_id}`).emit("waiting:updated", waitingPayload);

    for (const bus of busesOnRoute.rows) {
      if (bus.current_stop_order === stop.stop_order) {
        getIO()
          .to(`driver:${bus.driver_id}`)
          .emit("next-stop-updated", {
            event: "next-stop-updated",
            route_id: parseInt(route_id),
            next_stop_name: stop.stop_name,
            next_stop_order: stop.stop_order,
            waiting_count: totalWaiting,
            timestamp: new Date().toISOString(),
          });
      }

      const upcomingStops = await getUpcomingStopsWaiting(
        route_id,
        bus.current_stop_order,
      );
      getIO()
        .to(`driver:${bus.driver_id}`)
        .emit("route-waiting-updated", {
          event: "route-waiting-updated",
          route_id: parseInt(route_id),
          current_stop_order: bus.current_stop_order,
          stops: upcomingStops,
          timestamp: new Date().toISOString(),
        });
    }

    res.status(201).json({
      success: true,
      message: `Waiting registered at "${stop.stop_name}"`,
      waiting: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "You are already registered as waiting at this stop for this route",
      });
    }
    safeErrorResponse(res, error, "registerWaiting");
  }
};

const getWaitingCountsForRoute = async (req, res) => {
  try {
    const { id } = req.params;
    if (runValidations(res, validateId(id, "Route ID"))) return;

    const routeCheck = await pool.query(
      `SELECT id, route_name FROM routes WHERE id = $1`,
      [id],
    );
    if (routeCheck.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Route not found" });
    }
    const result = await pool.query(
      `SELECT s.id AS stop_id, s.stop_name, s.stop_order,
                    COUNT(pw.id)::INTEGER AS total_waiting
             FROM stops s
             LEFT JOIN passenger_waiting pw ON s.id = pw.stop_id AND pw.route_id = $1
             WHERE s.route_id = $1
             GROUP BY s.id ORDER BY s.stop_order ASC`,
      [id],
    );
    res.status(200).json({
      success: true,
      route_id: parseInt(id),
      route_name: routeCheck.rows[0].route_name,
      stops: result.rows,
    });
  } catch (error) {
    safeErrorResponse(res, error, "getWaitingCountsForRoute");
  }
};

// ================================================================
//  DRIVER: GET NEXT STOP ONLY
// ================================================================
const driverGetWaitingCounts = async (req, res) => {
  try {
    const driverId = req.driver.id;
    const busResult = await pool.query(
      `SELECT b.id AS bus_id, b.route_id, b.current_stop_order, r.route_name
             FROM buses b
             LEFT JOIN routes r ON b.route_id = r.id
             WHERE b.driver_id = $1 LIMIT 1`,
      [driverId],
    );
    if (busResult.rows.length === 0 || !busResult.rows[0].route_id) {
      return res
        .status(404)
        .json({ success: false, message: "No bus or route assigned to you" });
    }
    const { bus_id, route_id, current_stop_order, route_name } =
      busResult.rows[0];
    const maxResult = await pool.query(
      `SELECT MAX(stop_order) AS max_order FROM stops WHERE route_id = $1`,
      [route_id],
    );
    if (current_stop_order > maxResult.rows[0].max_order) {
      return res.status(200).json({
        success: true,
        route_id,
        route_name,
        trip_status: "completed",
        message: "Bus has completed all stops",
      });
    }
    const nextStop = await getNextStopInfo(route_id, current_stop_order);
    if (!nextStop) {
      return res.status(200).json({
        success: true,
        route_id,
        route_name,
        trip_status: "completed",
        message: "No more stops remaining",
      });
    }
    res.status(200).json({
      success: true,
      route_id,
      route_name,
      trip_status: "active",
      next_stop_name: nextStop.next_stop_name,
      next_stop_order: nextStop.next_stop_order,
      waiting_count: nextStop.waiting_count,
    });
  } catch (error) {
    safeErrorResponse(res, error, "driverGetWaitingCounts");
  }
};

// ================================================================
//  DRIVER: GET ALL UPCOMING STOPS WITH WAITING COUNTS
// ================================================================
const driverGetAllWaiting = async (req, res) => {
  try {
    const driverId = req.driver.id;

    const busResult = await pool.query(
      `SELECT b.id AS bus_id, b.route_id, b.current_stop_order,
                    r.route_name, r.source, r.destination
             FROM buses b
             LEFT JOIN routes r ON b.route_id = r.id
             WHERE b.driver_id = $1 LIMIT 1`,
      [driverId],
    );

    if (busResult.rows.length === 0 || !busResult.rows[0].route_id) {
      return res
        .status(404)
        .json({ success: false, message: "No bus or route assigned to you" });
    }

    const {
      bus_id,
      route_id,
      current_stop_order,
      route_name,
      source,
      destination,
    } = busResult.rows[0];

    const maxResult = await pool.query(
      `SELECT MAX(stop_order) AS max_order FROM stops WHERE route_id = $1`,
      [route_id],
    );
    const maxOrder = maxResult.rows[0].max_order;

    if (current_stop_order > maxOrder) {
      return res.status(200).json({
        success: true,
        route_id,
        route_name,
        source,
        destination,
        current_stop_order,
        trip_status: "completed",
        stops: [],
        message: "Bus has completed all stops on this route",
      });
    }

    const upcomingStops = await getUpcomingStopsWaiting(
      route_id,
      current_stop_order,
    );

    res.status(200).json({
      success: true,
      route_id,
      route_name,
      source,
      destination,
      current_stop_order,
      trip_status: "active",
      stops: upcomingStops,
    });
  } catch (error) {
    safeErrorResponse(res, error, "driverGetAllWaiting");
  }
};

// ================================================================
//  DRIVER: MARK STOP REACHED
// ================================================================
const markStopReached = async (req, res) => {
  try {
    const driverId = req.driver.id;
    const { stop_id } = req.body;

    if (runValidations(res, validateId(stop_id, "stop_id"))) return;

    const busResult = await pool.query(
      `SELECT b.id AS bus_id, b.route_id, b.current_stop_order, o.id AS owner_id
             FROM buses b
             LEFT JOIN owners o ON b.owner_id = o.id
             WHERE b.driver_id = $1 LIMIT 1`,
      [driverId],
    );
    if (busResult.rows.length === 0 || !busResult.rows[0].route_id) {
      return res
        .status(404)
        .json({ success: false, message: "No bus or route assigned to you" });
    }
    const { bus_id, route_id, current_stop_order, owner_id } =
      busResult.rows[0];

    const stopCheck = await pool.query(
      `SELECT id, stop_name, stop_order, stop_lat, stop_lon
             FROM stops WHERE id = $1 AND route_id = $2`,
      [stop_id, route_id],
    );
    if (stopCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Stop does not belong to your assigned route",
      });
    }
    const reachedStop = stopCheck.rows[0];

    if (reachedStop.stop_order < current_stop_order) {
      // Bus already progressed past this stop (e.g. auto-detect fired first) —
      // treat as already-reached rather than an error.
      return res.status(200).json({
        success: true,
        message: `"${reachedStop.stop_name}" was already marked reached`,
        already_progressed: true,
      });
    }
    if (reachedStop.stop_order > current_stop_order) {
      return res.status(400).json({
        success: false,
        message: `Expected stop_order ${current_stop_order} but got ${reachedStop.stop_order}. Mark stops in sequence.`,
      });
    }

    if (reachedStop.stop_lat !== null && reachedStop.stop_lon !== null) {
      const driverLocResult = await pool.query(
        `SELECT latitude, longitude FROM drivers WHERE id = $1`,
        [driverId],
      );
      const driverLoc = driverLocResult.rows[0];

      if (
        !driverLoc ||
        driverLoc.latitude === null ||
        driverLoc.longitude === null
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Your current location is not available. Update your GPS first.",
        });
      }

      const GEOFENCE_RADIUS = 50;
      const distMetres = haversineDistance(
        parseFloat(driverLoc.latitude),
        parseFloat(driverLoc.longitude),
        parseFloat(reachedStop.stop_lat),
        parseFloat(reachedStop.stop_lon),
      );

      if (distMetres > GEOFENCE_RADIUS) {
        return res.status(403).json({
          success: false,
          message: `You are ${Math.round(distMetres)}m away from this stop. Must be within ${GEOFENCE_RADIUS}m to mark as reached.`,
          distance_metres: Math.round(distMetres),
          required_metres: GEOFENCE_RADIUS,
        });
      }
    }

    await pool.query(
      `UPDATE passenger_waiting
             SET bus_arrived_at = NOW()
             WHERE stop_id = $1 AND route_id = $2 AND bus_arrived_at IS NULL`,
      [stop_id, route_id],
    );

    const waitingAfterArrival = await pool.query(
      `SELECT COUNT(id)::INTEGER AS total_waiting
             FROM passenger_waiting WHERE stop_id = $1 AND route_id = $2`,
      [stop_id, route_id],
    );
    const currentWaiting = waitingAfterArrival.rows[0].total_waiting;

    getIO()
      .to(`route:${route_id}`)
      .emit("waiting:updated", {
        event: "waiting:updated",
        route_id: parseInt(route_id),
        stop_id: parseInt(stop_id),
        stop_name: reachedStop.stop_name,
        stop_order: reachedStop.stop_order,
        total_waiting: currentWaiting,
        bus_arrived: true,
        timestamp: new Date().toISOString(),
      });

    const maxResult = await pool.query(
      `SELECT MAX(stop_order) AS max_order FROM stops WHERE route_id = $1`,
      [route_id],
    );
    const maxOrder = maxResult.rows[0].max_order;
    const newStopOrder = current_stop_order + 1;
    const tripCompleted = newStopOrder > maxOrder;

    await pool.query(`UPDATE buses SET current_stop_order = $1 WHERE id = $2`, [
      newStopOrder,
      bus_id,
    ]);

    const stopReachedPayload = {
      event: "stop:reached",
      bus_id,
      route_id,
      stop_id: parseInt(stop_id),
      stop_name: reachedStop.stop_name,
      stop_order: reachedStop.stop_order,
      timestamp: new Date().toISOString(),
    };
    getIO().to(`route:${route_id}`).emit("stop:reached", stopReachedPayload);
    getIO().to(`driver:${driverId}`).emit("stop:reached", stopReachedPayload);
    getIO().to(`owner:${owner_id}`).emit("stop:reached", stopReachedPayload);
    getIO().to("admin").emit("stop:reached", stopReachedPayload);

    if (!tripCompleted) {
      const nextStop = await getNextStopInfo(route_id, newStopOrder);
      const upcomingStops = await getUpcomingStopsWaiting(
        route_id,
        newStopOrder,
      );

      if (nextStop) {
        const nextStopPayload = {
          event: "next-stop-updated",
          bus_id,
          route_id,
          stop_id: nextStop.stop_id,
          next_stop_name: nextStop.next_stop_name,
          next_stop_order: nextStop.next_stop_order,
          stop_lat: nextStop.stop_lat,
          stop_lon: nextStop.stop_lon,
          waiting_count: nextStop.waiting_count,
          timestamp: new Date().toISOString(),
        };
        getIO()
          .to(`driver:${driverId}`)
          .emit("next-stop-updated", nextStopPayload);
        getIO()
          .to(`route:${route_id}`)
          .emit("next-stop-updated", nextStopPayload);
        getIO()
          .to(`owner:${owner_id}`)
          .emit("next-stop-updated", nextStopPayload);
        getIO().to("admin").emit("next-stop-updated", nextStopPayload);
      }

      const routeWaitingPayload = {
        event: "route-waiting-updated",
        bus_id,
        route_id,
        current_stop_order: newStopOrder,
        stops: upcomingStops,
        timestamp: new Date().toISOString(),
      };
      getIO()
        .to(`driver:${driverId}`)
        .emit("route-waiting-updated", routeWaitingPayload);
      getIO()
        .to(`route:${route_id}`)
        .emit("route-waiting-updated", routeWaitingPayload);
      getIO()
        .to(`owner:${owner_id}`)
        .emit("route-waiting-updated", routeWaitingPayload);
      getIO().to("admin").emit("route-waiting-updated", routeWaitingPayload);

      return res.status(200).json({
        success: true,
        message: `Reached "${reachedStop.stop_name}" — progressing to next stop`,
        reached_stop: reachedStop.stop_name,
        next_stop: nextStop ? nextStop.next_stop_name : null,
        next_stop_order: nextStop ? nextStop.next_stop_order : null,
        waiting_count: nextStop ? nextStop.waiting_count : 0,
        upcoming_stops: upcomingStops,
      });
    }

    // ── TRIP COMPLETED — Auto-assign reverse route ──
    const currentRouteResult = await pool.query(
      `SELECT id, route_name, source, destination, owner_id
             FROM routes WHERE id = $1`,
      [route_id],
    );
    const currentRoute = currentRouteResult.rows[0];

    const currentStopsResult = await pool.query(
      `SELECT id, stop_name, stop_order, stop_lat, stop_lon
             FROM stops WHERE route_id = $1
             ORDER BY stop_order ASC`,
      [route_id],
    );
    const currentStops = currentStopsResult.rows;

    const reverseSource = currentRoute.destination;
    const reverseDestination = currentRoute.source;
    const reverseRouteName = `${reverseSource} to ${reverseDestination}`;

    const existingReverseResult = await pool.query(
      `SELECT id, route_name, source, destination
             FROM routes
             WHERE source = $1 AND destination = $2 AND owner_id = $3
             LIMIT 1`,
      [reverseSource, reverseDestination, currentRoute.owner_id],
    );

    let reverseRouteId;

    if (existingReverseResult.rows.length > 0) {
      reverseRouteId = existingReverseResult.rows[0].id;
    } else {
      const newRouteResult = await pool.query(
        `INSERT INTO routes (route_name, source, destination, owner_id)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id`,
        [
          reverseRouteName,
          reverseSource,
          reverseDestination,
          currentRoute.owner_id,
        ],
      );
      reverseRouteId = newRouteResult.rows[0].id;

      const totalStops = currentStops.length;
      for (let i = 0; i < currentStops.length; i++) {
        const originalStop = currentStops[totalStops - 1 - i];
        const newStopOrder = i + 1;
        await pool.query(
          `INSERT INTO stops (route_id, stop_name, stop_order, stop_lat, stop_lon)
                     VALUES ($1, $2, $3, $4, $5)`,
          [
            reverseRouteId,
            originalStop.stop_name,
            newStopOrder,
            originalStop.stop_lat || null,
            originalStop.stop_lon || null,
          ],
        );
      }
    }

    await pool.query(
      `UPDATE buses SET route_id = $1, current_stop_order = 1 WHERE id = $2`,
      [reverseRouteId, bus_id],
    );

    const firstStopResult = await pool.query(
      `SELECT s.id AS stop_id, s.stop_name, s.stop_order,
                    COUNT(pw.id)::INTEGER AS waiting_count
             FROM stops s
             LEFT JOIN passenger_waiting pw
                    ON pw.stop_id = s.id AND pw.route_id = $1
             WHERE s.route_id = $1 AND s.stop_order = 1
             GROUP BY s.id`,
      [reverseRouteId],
    );
    const firstStop = firstStopResult.rows[0] || null;

    getIO().to(`route:${route_id}`).emit("trip:completed", {
      event: "trip:completed",
      bus_id,
      route_id,
      next_route_id: reverseRouteId,
      next_route_name: reverseRouteName,
      message: "Bus has completed all stops on this route",
      timestamp: new Date().toISOString(),
    });

    const routeAssignedPayload = {
      event: "bus:route_assigned",
      bus_id,
      route_id: reverseRouteId,
      route_name: reverseRouteName,
      source: reverseSource,
      destination: reverseDestination,
      auto_reversed: true,
      timestamp: new Date().toISOString(),
    };
    getIO()
      .to(`driver:${driverId}`)
      .emit("bus:route_assigned", routeAssignedPayload);
    getIO()
      .to(`owner:${owner_id}`)
      .emit("bus:route_assigned", routeAssignedPayload);
    getIO().to("admin").emit("bus:route_assigned", routeAssignedPayload);

    if (firstStop) {
      const nextStopPayload = {
        event: "next-stop-updated",
        bus_id,
        route_id: reverseRouteId,
        next_stop_name: firstStop.stop_name,
        next_stop_order: firstStop.stop_order,
        waiting_count: firstStop.waiting_count,
        timestamp: new Date().toISOString(),
      };
      getIO()
        .to(`driver:${driverId}`)
        .emit("next-stop-updated", nextStopPayload);
      getIO()
        .to(`owner:${owner_id}`)
        .emit("next-stop-updated", nextStopPayload);
      getIO().to("admin").emit("next-stop-updated", nextStopPayload);
    }

    res.status(200).json({
      success: true,
      message: `Reached final stop "${reachedStop.stop_name}" — trip completed`,
      trip_status: "completed",
      next_route_id: reverseRouteId,
      next_route_name: reverseRouteName,
      auto_reversed: true,
    });
  } catch (error) {
    safeErrorResponse(res, error, "markStopReached");
  }
};

// ================================================================
//  PASSENGER: GET REALTIME ETA FOR A ROUTE
// ================================================================
const getRouteETA = async (req, res) => {
  try {
    const { routeId } = req.params;
    if (runValidations(res, validateId(routeId, "Route ID"))) return;

    const routeCheck = await pool.query(
      `SELECT id, route_name FROM routes WHERE id = $1`,
      [routeId],
    );
    if (routeCheck.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Route not found" });
    }

    const busResult = await pool.query(
      `SELECT b.id AS bus_id, b.route_id, b.current_stop_order,
                    COALESCE(b.current_speed_kmph, 30)::INTEGER AS current_speed_kmph,
                    d.id AS driver_id, d.latitude, d.longitude
             FROM   buses b
             JOIN   drivers d ON b.driver_id = d.id
             WHERE  b.route_id = $1
               AND  d.latitude IS NOT NULL
               AND  d.longitude IS NOT NULL
             ORDER BY b.id ASC
             LIMIT  1`,
      [routeId],
    );

    if (busResult.rows.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No active bus with GPS on this route",
        route_id: parseInt(routeId),
        bus_id: null,
        current_location: null,
        current_speed_kmph: null,
        upcoming_stops: [],
      });
    }

    const bus = busResult.rows[0];
    const payload = await etaService.generateETAPayload(
      bus.bus_id,
      bus.route_id,
    );

    if (!payload) {
      return res.status(200).json({
        success: true,
        message: "ETA data not yet available",
        route_id: parseInt(routeId),
        bus_id: bus.bus_id,
        current_location: null,
        current_speed_kmph: null,
        upcoming_stops: [],
      });
    }

    res.status(200).json({
      success: true,
      route_id: payload.route_id,
      bus_id: payload.bus_id,
      current_location: payload.current_location,
      current_speed_kmph: payload.current_speed_kmph,
      upcoming_stops: payload.upcoming_stops,
    });
  } catch (error) {
    safeErrorResponse(res, error, "getRouteETA");
  }
};

// ================================================================
//  SEARCH ROUTE
// ================================================================
const searchRoute = async (req, res) => {
  try {
    const from = (req.query.from || "").trim();
    const to = (req.query.to || "").trim();

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'Both "from" and "to" query parameters are required',
      });
    }

    const routeResult = await pool.query(
      `SELECT DISTINCT
                r.id           AS route_id,
                r.route_name,
                src.stop_name  AS source_stop,
                src.stop_order AS source_order,
                dst.stop_name  AS destination_stop,
                dst.stop_order AS destination_order
             FROM routes r
             JOIN stops src ON src.route_id = r.id
             JOIN stops dst ON dst.route_id = r.id
             WHERE src.stop_name ILIKE $1
               AND dst.stop_name ILIKE $2
               AND src.stop_order < dst.stop_order
             ORDER BY r.id ASC`,
      [`%${from}%`, `%${to}%`],
    );

    if (routeResult.rows.length === 0) {
      return res.status(200).json({
        success: true,
        from,
        to,
        message: "No routes found matching this source and destination",
        routes: [],
      });
    }

    const routes = [];

    for (const route of routeResult.rows) {
      const busResult = await pool.query(
        `SELECT b.id AS bus_id, b.bus_number, b.bus_type,
                        b.current_stop_order,
                        COALESCE(b.current_speed_kmph, 30)::INTEGER AS current_speed_kmph,
                        d.id AS driver_id, d.latitude, d.longitude
                 FROM   buses b
                 JOIN   drivers d ON b.driver_id = d.id
                 WHERE  b.route_id = $1
                   AND  d.latitude  IS NOT NULL
                   AND  d.longitude IS NOT NULL
                 ORDER BY b.id ASC`,
        [route.route_id],
      );

      const stopsResult = await pool.query(
        `SELECT stop_name, stop_order
                 FROM   stops
                 WHERE  route_id   = $1
                   AND  stop_order >= $2
                   AND  stop_order <= $3
                 ORDER BY stop_order ASC`,
        [route.route_id, route.source_order, route.destination_order],
      );
      const segmentStops = stopsResult.rows.map((s) => s.stop_name);

      const busesWithETA = [];

      for (const bus of busResult.rows) {
        const sourceETA = await etaService.calculateETAForSingleStop({
          routeId: route.route_id,
          busLatitude: parseFloat(bus.latitude),
          busLongitude: parseFloat(bus.longitude),
          targetStopOrder: route.source_order,
        });

        const destinationETA = await etaService.calculateETAForSingleStop({
          routeId: route.route_id,
          busLatitude: parseFloat(bus.latitude),
          busLongitude: parseFloat(bus.longitude),
          targetStopOrder: route.destination_order,
        });

        busesWithETA.push({
          bus_id: bus.bus_id,
          bus_number: bus.bus_number,
          bus_type: bus.bus_type,
          current_speed_kmph: bus.current_speed_kmph,
          current_location: {
            latitude: parseFloat(bus.latitude),
            longitude: parseFloat(bus.longitude),
          },
          eta_to_source_minutes: sourceETA.eta_minutes,
          eta_to_destination_minutes: destinationETA.eta_minutes,
        });
      }

      busesWithETA.sort((a, b) => {
        if (a.eta_to_source_minutes === null) return 1;
        if (b.eta_to_source_minutes === null) return -1;
        return a.eta_to_source_minutes - b.eta_to_source_minutes;
      });

      const nearestBus = busesWithETA[0] || null;

      routes.push({
        route_id: route.route_id,
        route_name: route.route_name,
        source_stop: route.source_stop,
        destination_stop: route.destination_stop,
        nearest_bus: nearestBus,
        all_buses: busesWithETA,
        eta_minutes: nearestBus ? nearestBus.eta_to_source_minutes : null,
        upcoming_stops: segmentStops,
      });
    }

    routes.sort((a, b) => {
      if (!a.nearest_bus && b.nearest_bus) return 1;
      if (a.nearest_bus && !b.nearest_bus) return -1;
      if (!a.eta_minutes && b.eta_minutes) return 1;
      if (a.eta_minutes && !b.eta_minutes) return -1;
      return (a.eta_minutes || 999) - (b.eta_minutes || 999);
    });

    res.status(200).json({
      success: true,
      from,
      to,
      total: routes.length,
      routes,
    });
  } catch (error) {
    safeErrorResponse(res, error, "searchRoute");
  }
};

// ================================================================
//  PASSENGER: CONFIRM BOARDED
// ================================================================
const boardBus = async (req, res) => {
  try {
    const passengerId = req.passenger.passengerId;
    const { id } = req.params;

    if (runValidations(res, validateId(id, "Waiting entry ID"))) return;

    const rowResult = await pool.query(
      `SELECT pw.id, pw.stop_id, pw.route_id, s.stop_name, s.stop_order
             FROM   passenger_waiting pw
             JOIN   stops s ON s.id = pw.stop_id
             WHERE  pw.id = $1 AND pw.passenger_id = $2`,
      [id, passengerId],
    );

    if (rowResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Waiting entry not found or does not belong to you",
      });
    }

    const row = rowResult.rows[0];

    await pool.query(`DELETE FROM passenger_waiting WHERE id = $1`, [id]);

    await pool.query(
      `INSERT INTO trip_history
                (passenger_id, stop_id, route_id, stop_name, route_name, source, destination, status, created_at)
             SELECT $1, $2, $3, s.stop_name, r.route_name, r.source, r.destination, 'boarded', NOW()
             FROM   stops s JOIN routes r ON r.id = $3
             WHERE  s.id = $2`,
      [passengerId, row.stop_id, row.route_id],
    );

    const countResult = await pool.query(
      `SELECT COUNT(id)::INTEGER AS total_waiting
             FROM passenger_waiting WHERE stop_id = $1 AND route_id = $2`,
      [row.stop_id, row.route_id],
    );
    const totalWaiting = countResult.rows[0].total_waiting;

    const waitingPayload = {
      event: "waiting:updated",
      route_id: row.route_id,
      stop_id: row.stop_id,
      stop_name: row.stop_name,
      stop_order: row.stop_order,
      total_waiting: totalWaiting,
      timestamp: new Date().toISOString(),
    };
    getIO().to(`route:${row.route_id}`).emit("waiting:updated", waitingPayload);

    const busesOnRoute = await pool.query(
      `SELECT driver_id, id AS bus_id, current_stop_order
             FROM buses WHERE route_id = $1 AND driver_id IS NOT NULL`,
      [row.route_id],
    );

    for (const bus of busesOnRoute.rows) {
      if (bus.current_stop_order === row.stop_order) {
        getIO().to(`driver:${bus.driver_id}`).emit("next-stop-updated", {
          event: "next-stop-updated",
          route_id: row.route_id,
          next_stop_name: row.stop_name,
          next_stop_order: row.stop_order,
          waiting_count: totalWaiting,
          timestamp: new Date().toISOString(),
        });
      }

      const upcomingStops = await getUpcomingStopsWaiting(
        row.route_id,
        bus.current_stop_order,
      );
      getIO().to(`driver:${bus.driver_id}`).emit("route-waiting-updated", {
        event: "route-waiting-updated",
        route_id: row.route_id,
        current_stop_order: bus.current_stop_order,
        stops: upcomingStops,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({
      success: true,
      message: "Boarded confirmed — waiting entry removed",
      total_waiting: totalWaiting,
    });
  } catch (error) {
    safeErrorResponse(res, error, "boardBus");
  }
};

// ================================================================
//  AUTO-EXPIRE JOB
// ================================================================
const EXPIRE_MINUTES = 5;

async function autoExpireWaiting() {
  try {
    const expiredGroups = await pool.query(
      `SELECT pw.stop_id, pw.route_id,
                    s.stop_name, s.stop_order,
                    COUNT(pw.id)::INTEGER AS expiring_count
             FROM   passenger_waiting pw
             JOIN   stops s ON s.id = pw.stop_id
             WHERE  pw.bus_arrived_at IS NOT NULL
               AND  pw.bus_arrived_at < NOW() - ($1 * INTERVAL '1 minute')
             GROUP  BY pw.stop_id, pw.route_id, s.stop_name, s.stop_order`,
      [EXPIRE_MINUTES],
    );

    if (expiredGroups.rows.length === 0) return;

    await pool.query(
      `INSERT INTO trip_history
                (passenger_id, stop_id, route_id, stop_name, route_name, source, destination, status, created_at)
             SELECT pw.passenger_id, pw.stop_id, pw.route_id,
                    s.stop_name, r.route_name, r.source, r.destination,
                    'expired', NOW()
             FROM   passenger_waiting pw
             JOIN   stops  s ON s.id  = pw.stop_id
             JOIN   routes r ON r.id  = pw.route_id
             WHERE  pw.bus_arrived_at IS NOT NULL
               AND  pw.bus_arrived_at < NOW() - ($1 * INTERVAL '1 minute')`,
      [EXPIRE_MINUTES],
    );

    await pool.query(
      `DELETE FROM passenger_waiting
             WHERE  bus_arrived_at IS NOT NULL
               AND  bus_arrived_at < NOW() - ($1 * INTERVAL '1 minute')`,
      [EXPIRE_MINUTES],
    );

    for (const group of expiredGroups.rows) {
      const { stop_id, route_id, stop_name, stop_order } = group;

      const countResult = await pool.query(
        `SELECT COUNT(id)::INTEGER AS total_waiting
                 FROM passenger_waiting WHERE stop_id = $1 AND route_id = $2`,
        [stop_id, route_id],
      );
      const totalWaiting = countResult.rows[0].total_waiting;

      getIO().to(`route:${route_id}`).emit("waiting:updated", {
        event: "waiting:updated",
        route_id,
        stop_id,
        stop_name,
        stop_order,
        total_waiting: totalWaiting,
        expired: true,
        timestamp: new Date().toISOString(),
      });

      const busesOnRoute = await pool.query(
        `SELECT driver_id, current_stop_order
                 FROM buses WHERE route_id = $1 AND driver_id IS NOT NULL`,
        [route_id],
      );

      for (const bus of busesOnRoute.rows) {
        if (bus.current_stop_order === stop_order) {
          getIO().to(`driver:${bus.driver_id}`).emit("next-stop-updated", {
            event: "next-stop-updated",
            route_id,
            next_stop_name: stop_name,
            next_stop_order: stop_order,
            waiting_count: totalWaiting,
            timestamp: new Date().toISOString(),
          });
        }

        const upcomingStops = await getUpcomingStopsWaiting(
          route_id,
          bus.current_stop_order,
        );
        getIO().to(`driver:${bus.driver_id}`).emit("route-waiting-updated", {
          event: "route-waiting-updated",
          route_id,
          current_stop_order: bus.current_stop_order,
          stops: upcomingStops,
          timestamp: new Date().toISOString(),
        });
      }

      console.log(
        `[autoExpire] Expired ${group.expiring_count} waiting entries at stop "${stop_name}" (route ${route_id})`,
      );
    }
  } catch (err) {
    console.error("[autoExpire] Error:", err.message);
  }
}

// ================================================================
//  PASSENGER: CANCEL WAITING
// ================================================================
const cancelWaiting = async (req, res) => {
  try {
    const passengerId = req.passenger.passengerId;
    const { id } = req.params;

    if (runValidations(res, validateId(id, "Waiting entry ID"))) return;

    const rowResult = await pool.query(
      `SELECT pw.id, pw.stop_id, pw.route_id, s.stop_name, s.stop_order
             FROM   passenger_waiting pw
             JOIN   stops s ON s.id = pw.stop_id
             WHERE  pw.id = $1 AND pw.passenger_id = $2`,
      [id, passengerId],
    );

    if (rowResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Waiting entry not found or does not belong to you",
      });
    }

    const row = rowResult.rows[0];

    await pool.query(`DELETE FROM passenger_waiting WHERE id = $1`, [id]);

    await pool.query(
      `INSERT INTO trip_history
                (passenger_id, stop_id, route_id, stop_name, route_name, source, destination, status, created_at)
             SELECT $1, $2, $3, s.stop_name, r.route_name, r.source, r.destination, 'cancelled', NOW()
             FROM   stops s JOIN routes r ON r.id = $3
             WHERE  s.id = $2`,
      [passengerId, row.stop_id, row.route_id],
    );

    const countResult = await pool.query(
      `SELECT COUNT(id)::INTEGER AS total_waiting
             FROM passenger_waiting WHERE stop_id = $1 AND route_id = $2`,
      [row.stop_id, row.route_id],
    );
    const totalWaiting = countResult.rows[0].total_waiting;

    getIO().to(`route:${row.route_id}`).emit("waiting:updated", {
      event: "waiting:updated",
      route_id: row.route_id,
      stop_id: row.stop_id,
      stop_name: row.stop_name,
      stop_order: row.stop_order,
      total_waiting: totalWaiting,
      timestamp: new Date().toISOString(),
    });

    const busesOnRoute = await pool.query(
      `SELECT driver_id, id AS bus_id, current_stop_order
             FROM buses WHERE route_id = $1 AND driver_id IS NOT NULL`,
      [row.route_id],
    );

    for (const bus of busesOnRoute.rows) {
      if (bus.current_stop_order === row.stop_order) {
        getIO().to(`driver:${bus.driver_id}`).emit("next-stop-updated", {
          event: "next-stop-updated",
          route_id: row.route_id,
          next_stop_name: row.stop_name,
          next_stop_order: row.stop_order,
          waiting_count: totalWaiting,
          timestamp: new Date().toISOString(),
        });
      }

      const upcomingStops = await getUpcomingStopsWaiting(
        row.route_id,
        bus.current_stop_order,
      );
      getIO().to(`driver:${bus.driver_id}`).emit("route-waiting-updated", {
        event: "route-waiting-updated",
        route_id: row.route_id,
        current_stop_order: bus.current_stop_order,
        stops: upcomingStops,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({
      success: true,
      message: "Waiting cancelled successfully",
      total_waiting: totalWaiting,
    });
  } catch (error) {
    safeErrorResponse(res, error, "cancelWaiting");
  }
};

// ================================================================
//  PASSENGER: GET MY ACTIVE WAITING ENTRIES
// ================================================================
const getMyWaiting = async (req, res) => {
  try {
    const passengerId = req.passenger.passengerId;

    const result = await pool.query(
      `SELECT
                pw.id,
                pw.created_at,
                pw.bus_arrived_at,
                s.stop_name,
                s.stop_order,
                r.id         AS route_id,
                r.route_name,
                r.source,
                r.destination
             FROM   passenger_waiting pw
             JOIN   stops   s ON s.id  = pw.stop_id
             JOIN   routes  r ON r.id  = pw.route_id
             WHERE  pw.passenger_id = $1
             ORDER  BY pw.created_at DESC`,
      [passengerId],
    );

    res.status(200).json({
      success: true,
      waiting: result.rows,
    });
  } catch (error) {
    safeErrorResponse(res, error, "getMyWaiting");
  }
};

// ================================================================
//  PASSENGER: GET TRIP HISTORY
// ================================================================
const getMyTrips = async (req, res) => {
  try {
    const passengerId = req.passenger.passengerId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const [tripsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
                    id, stop_name, route_name, source, destination,
                    status, created_at, resolved_at
                 FROM   trip_history
                 WHERE  passenger_id = $1
                 ORDER  BY resolved_at DESC
                 LIMIT  $2 OFFSET $3`,
        [passengerId, limit, offset],
      ),
      pool.query(
        `SELECT COUNT(*)::INTEGER AS total FROM trip_history WHERE passenger_id = $1`,
        [passengerId],
      ),
    ]);

    res.status(200).json({
      success: true,
      trips: tripsResult.rows,
      total: countResult.rows[0].total,
      page,
      limit,
      total_pages: Math.ceil(countResult.rows[0].total / limit),
    });
  } catch (error) {
    safeErrorResponse(res, error, "getMyTrips");
  }
};

// Start the job — runs every 60 seconds
setInterval(autoExpireWaiting, 60 * 1000);

module.exports = {
  loginPassenger,
  getAllRoutes,
  getRouteById,
  getLiveBuses,
  getBusesNearStop,
  getBusById,
  registerWaiting,
  getWaitingCountsForRoute,
  driverGetWaitingCounts,
  driverGetAllWaiting,
  markStopReached,
  boardBus,
  cancelWaiting,
  getMyWaiting,
  getMyTrips,
  getRouteETA,
  searchRoute,
};
