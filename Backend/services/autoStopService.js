// ================================================================
//  AUTO STOP SERVICE
//  services/autoStopService.js
//
//  Called automatically after every GPS update from the driver.
//  Detects when the bus is within GEOFENCE_RADIUS_METRES of the
//  next scheduled stop and, if so, runs the full stop-reached
//  pipeline:
//
//    1. Clear passenger_waiting for that stop
//    2. Increment buses.current_stop_order
//    3. Emit all existing Socket.IO events
//
//  DUPLICATE PROTECTION — ATOMIC LOCK
//  ------------------------------------
//  GPS pings arrive concurrently. Node.js is single-threaded but
//  async/await introduces yield points. Two requests for the same
//  bus can both pass a lock check before either sets the lock if
//  there is any 'await' between the check and the set (TOCTOU).
//
//  Fix: triggeredStops.get() and triggeredStops.set() are two
//  consecutive *synchronous* statements with NO await between them.
//  The Node.js event loop guarantees nothing else executes between
//  two synchronous statements — making check-and-claim atomic.
//
//  LOCK LIFECYCLE
//  --------------
//  CLAIMED  : immediately after the duplicate check (atomic).
//  RELEASED : on every non-progression exit (no coords, outside
//             geofence, data gap) AND after successful progression
//             AND on any unexpected error.
//
//  Releasing after successful progression means the Map is empty
//  between geofence visits (O(0) at steady state) and immune to
//  route-reassignment edge cases where a bus revisits the same
//  stop_order on a newly assigned route.
//
//  MANUAL FALLBACK
//  ---------------
//  POST /api/driver/route/stop-reached remains fully intact.
//  Stops without stop_lat/stop_lon still require manual marking.
// ================================================================

'use strict';

const pool                  = require('../config/db');
const { getIO }             = require('../socket');
const { haversineDistance }  = require('../utils/haversine');
const { clearBusState }     = require('./etaService');

// ── Configurable geofence radius (metres) ────────────────────────
const GEOFENCE_RADIUS_METRES = parseInt(process.env.GEOFENCE_RADIUS || '50', 10);

// ── In-memory duplicate-trigger lock ─────────────────────────────
// Key   : busId  (number)
// Value : stop_order that was last auto-triggered (number)
// Scope : process lifetime; resets on server restart (acceptable —
//         a restart implicitly clears all in-flight progressions).
const triggeredStops = new Map();

// ================================================================
//  HELPER — fetchNextStopWithCoords
//  Returns the stop row for stop_order = currentStopOrder on
//  routeId, including stop_lat / stop_lon. Returns null if not
//  found.
// ================================================================
async function fetchNextStopWithCoords(routeId, currentStopOrder) {
    const result = await pool.query(
        `SELECT id AS stop_id, stop_name, stop_order, stop_lat, stop_lon
         FROM   stops
         WHERE  route_id   = $1
           AND  stop_order = $2
         LIMIT  1`,
        [routeId, currentStopOrder]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
}

// ================================================================
//  HELPER — fetchMaxStopOrder
//  Returns the highest stop_order for the given route.
// ================================================================
async function fetchMaxStopOrder(routeId) {
    const result = await pool.query(
        `SELECT MAX(stop_order) AS max_order FROM stops WHERE route_id = $1`,
        [routeId]
    );
    return result.rows[0].max_order; // null if route has no stops
}

// ================================================================
//  HELPER — getNextStopInfo
//  Returns next-stop name + waiting count for a given stop_order.
// ================================================================
async function getNextStopInfo(routeId, stopOrder) {
    const stopResult = await pool.query(
        `SELECT id AS stop_id, stop_name, stop_order
         FROM   stops
         WHERE  route_id   = $1
           AND  stop_order = $2
         LIMIT  1`,
        [routeId, stopOrder]
    );
    if (stopResult.rows.length === 0) return null;
    const stop = stopResult.rows[0];

    const countResult = await pool.query(
        `SELECT COUNT(id)::INTEGER AS waiting_count
         FROM   passenger_waiting
         WHERE  stop_id  = $1
           AND  route_id = $2`,
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
//  HELPER — getUpcomingStopsWaiting
//  Returns all stops (stop_order >= currentStopOrder) with
//  waiting counts and is_next_stop flag.
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

// ================================================================
//  checkAndProgressStop — MAIN EXPORTED FUNCTION
//
//  Called by driverController.updateLocation after every GPS ping.
//
//  ATOMIC LOCK PROTOCOL
//  --------------------
//  triggeredStops.get() and triggeredStops.set() are placed as two
//  consecutive synchronous statements — no 'await' between them.
//  Node.js event-loop guarantee: nothing else can run between two
//  synchronous statements, making the check-and-claim atomic.
//
//  The lock is RELEASED on every exit path:
//    - No stop data / no coordinates  → release (manual mode)
//    - Outside geofence               → release (allow retry)
//    - Successful progression         → release (Map stays clean
//                                       between stops; immune to
//                                       route-reassignment)
//    - Unexpected DB/emit error       → release (allow retry)
//    - Trip completed                 → release (bus finished)
//
//  @param {number} driverId  — authenticated driver id
//  @param {number} latitude  — freshly updated GPS latitude
//  @param {number} longitude — freshly updated GPS longitude
// ================================================================
async function checkAndProgressStop(driverId, latitude, longitude) {

    // ── 1. Fetch driver's bus, route and current progression ─────
    const busResult = await pool.query(
        `SELECT b.id           AS bus_id,
                b.route_id,
                b.current_stop_order,
                b.owner_id
         FROM   buses b
         WHERE  b.driver_id = $1
         LIMIT  1`,
        [driverId]
    );

    if (busResult.rows.length === 0) return; // driver has no bus

    const { bus_id, route_id, current_stop_order, owner_id } = busResult.rows[0];

    if (!route_id) return; // bus has no route

    // ── 2. Trip completion guard ──────────────────────────────────
    const maxOrder = await fetchMaxStopOrder(route_id);
    if (!maxOrder) return;                   // route has no stops
    if (current_stop_order > maxOrder) return; // trip already done

    // ── 3 + 4. ATOMIC lock check-and-claim ───────────────────────
    //
    //  No 'await' exists between these two lines.
    //  Node.js single-thread guarantee: no other code can execute
    //  between them → check-then-set is race-condition-free.
    //
    if (triggeredStops.get(bus_id) === current_stop_order) return; // already claimed
    triggeredStops.set(bus_id, current_stop_order);                // claim lock NOW
    //
    //  Every code path below this point MUST release the lock
    //  (triggeredStops.delete) before returning, so that future
    //  GPS pings are never permanently blocked.

    try {

        // ── 5. Fetch next stop with coordinates ──────────────────
        const nextStop = await fetchNextStopWithCoords(route_id, current_stop_order);

        if (!nextStop) {
            // Data gap in stops table — release and let next ping retry
            triggeredStops.delete(bus_id);
            return;
        }

        if (nextStop.stop_lat === null || nextStop.stop_lon === null) {
            // Stop has no GPS coordinates — manual mode for this stop.
            // Release so the manual endpoint can still advance if needed,
            // and so future pings don't pile up behind a permanent lock.
            triggeredStops.delete(bus_id);
            return;
        }

        // ── 6. Haversine distance check (synchronous) ────────────
        const distMetres = haversineDistance(
            parseFloat(latitude),
            parseFloat(longitude),
            parseFloat(nextStop.stop_lat),
            parseFloat(nextStop.stop_lon)
        );

        if (distMetres > GEOFENCE_RADIUS_METRES) {
            // Not in geofence yet — release so the next ping retries.
            triggeredStops.delete(bus_id);
            return;
        }

        // ── IN GEOFENCE — execute full progression pipeline ──────
        console.log(
            `[AutoStop] Bus ${bus_id} auto-reached stop "${nextStop.stop_name}"` +
            ` (order ${current_stop_order}) at ${Math.round(distMetres)}m — progressing`
        );

        // ── 7. Clear waiting passengers for the reached stop ─────
        const deleted = await pool.query(
            `DELETE FROM passenger_waiting
             WHERE  stop_id  = $1
               AND  route_id = $2`,
            [nextStop.stop_id, route_id]
        );

        // ── 8. Emit: waiting:updated (count = 0) ─────────────────
        getIO().to(`route:${route_id}`).emit('waiting:updated', {
            event:         'waiting:updated',
            route_id:      parseInt(route_id),
            stop_id:       nextStop.stop_id,
            stop_name:     nextStop.stop_name,
            stop_order:    nextStop.stop_order,
            total_waiting: 0,
            timestamp:     new Date().toISOString()
        });

        // ── 9. Compute new stop order and trip status ─────────────
        const newStopOrder  = current_stop_order + 1;
        const tripCompleted = newStopOrder > maxOrder;

        // ── 10. Advance bus progression in DB ────────────────────
        await pool.query(
            `UPDATE buses SET current_stop_order = $1 WHERE id = $2`,
            [newStopOrder, bus_id]
        );

        // ── 11. Emit: stop:reached ────────────────────────────────
        const stopReachedPayload = {
            event:            'stop:reached',
            bus_id,
            route_id,
            stop_id:          nextStop.stop_id,
            stop_name:        nextStop.stop_name,
            stop_order:       nextStop.stop_order,
            passengers_reset: deleted.rowCount,
            auto_detected:    true,
            timestamp:        new Date().toISOString()
        };
        getIO().to(`route:${route_id}`).emit('stop:reached',  stopReachedPayload);
        getIO().to(`driver:${driverId}`).emit('stop:reached', stopReachedPayload);
        getIO().to(`owner:${owner_id}`).emit('stop:reached',  stopReachedPayload);
        getIO().to('admin').emit('stop:reached',               stopReachedPayload);

        // ── 12. Trip completed branch ─────────────────────────────
        if (tripCompleted) {
            triggeredStops.delete(bus_id); // release — bus finished, no more stops
            clearBusState(bus_id);         // clean up ETA speed history

            const tripCompletedPayload = {
                event:         'trip:completed',
                bus_id,
                route_id,
                message:       'Bus has completed all stops on this route',
                auto_detected: true,
                timestamp:     new Date().toISOString()
            };
            getIO().to(`route:${route_id}`).emit('trip:completed',  tripCompletedPayload);
            getIO().to(`driver:${driverId}`).emit('trip:completed', tripCompletedPayload);
            getIO().to(`owner:${owner_id}`).emit('trip:completed',  tripCompletedPayload);
            getIO().to('admin').emit('trip:completed',               tripCompletedPayload);

            console.log(`[AutoStop] Bus ${bus_id} completed trip on route ${route_id}`);
            return;
        }

        // ── 13. Emit: next-stop-updated ───────────────────────────
        const nextStopInfo  = await getNextStopInfo(route_id, newStopOrder);
        const upcomingStops = await getUpcomingStopsWaiting(route_id, newStopOrder);

        if (nextStopInfo) {
            const nextStopPayload = {
                event:           'next-stop-updated',
                bus_id,
                route_id,
                next_stop_name:  nextStopInfo.next_stop_name,
                next_stop_order: nextStopInfo.next_stop_order,
                waiting_count:   nextStopInfo.waiting_count,
                auto_detected:   true,
                timestamp:       new Date().toISOString()
            };
            getIO().to(`driver:${driverId}`).emit('next-stop-updated', nextStopPayload);
            getIO().to(`route:${route_id}`).emit('next-stop-updated',  nextStopPayload);
            getIO().to(`owner:${owner_id}`).emit('next-stop-updated',  nextStopPayload);
            getIO().to('admin').emit('next-stop-updated',               nextStopPayload);
        }

        // ── 14. Emit: route-waiting-updated (full upcoming list) ──
        const routeWaitingPayload = {
            event:              'route-waiting-updated',
            bus_id,
            route_id,
            current_stop_order: newStopOrder,
            stops:              upcomingStops,
            auto_detected:      true,
            timestamp:          new Date().toISOString()
        };
        getIO().to(`driver:${driverId}`).emit('route-waiting-updated', routeWaitingPayload);
        getIO().to(`route:${route_id}`).emit('route-waiting-updated',  routeWaitingPayload);
        getIO().to(`owner:${owner_id}`).emit('route-waiting-updated',  routeWaitingPayload);
        getIO().to('admin').emit('route-waiting-updated',               routeWaitingPayload);

        // ── 15. Release lock after successful progression ─────────
        //  DB now holds current_stop_order = newStopOrder.
        //  Deleting the entry keeps the Map empty between geofence
        //  visits (O(0) at steady-state) and eliminates the edge case
        //  where a bus is reassigned to a new route that happens to
        //  share the same stop_order value — without this delete the
        //  old entry would permanently block that stop.
        triggeredStops.delete(bus_id);

    } catch (err) {
        // Any unexpected DB or socket error:
        // Release the lock so the next GPS ping can retry rather than
        // being permanently blocked behind a stale entry.
        triggeredStops.delete(bus_id);
        throw err; // re-throw so controller .catch() can log it
    }
}

module.exports = { checkAndProgressStop };
