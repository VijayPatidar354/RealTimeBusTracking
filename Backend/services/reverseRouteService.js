// ================================================================
//  REVERSE ROUTE SERVICE
//  services/reverseRouteService.js
//
//  Shared helper for auto-assigning a reverse route when a bus
//  completes all stops. Called by both:
//    - autoStopService  (geofence-triggered trip completion)
//    - passengerController.markStopReached (manual trip completion)
//
//  Logic:
//    1. Look up the current route + its stops.
//    2. Find an existing reverse route (same owner, source ↔ dest).
//    3. If none exists, create one with stops in reverse order.
//    4. Reassign the bus to the reverse route, reset to stop 1.
//    5. Emit socket events: trip:completed, bus:route_assigned,
//       next-stop-updated.
//
//  Returns { reverseRouteId, reverseRouteName, reverseSource,
//            reverseDestination } so callers can include the info
//            in their own HTTP responses if needed.
// ================================================================

'use strict';

const pool              = require('../config/db');
const { getIO }         = require('../socket');
const { clearBusState } = require('./etaService');
const { BUS_STATUSES }  = require('../utils/busStatus');
const { pointExpression } = require('../utils/spatialSql');

/**
 * Auto-assign a reverse route to a bus that just completed its trip.
 *
 * @param {Object} opts
 * @param {number} opts.bus_id          - Bus that completed the trip
 * @param {number} opts.route_id        - Route that was just completed
 * @param {number} opts.driverId        - Driver of the bus
 * @param {number} opts.owner_id        - Owner of the bus
 * @returns {Promise<Object>}           - { reverseRouteId, reverseRouteName,
 *                                          reverseSource, reverseDestination }
 */
async function assignReverseRoute({ bus_id, route_id, driverId, owner_id }) {
    // ── 1. Fetch current route info ──────────────────────────────
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

    // ── 2. Build reverse route identifiers ───────────────────────
    const reverseSource      = currentRoute.destination;
    const reverseDestination = currentRoute.source;
    const reverseRouteName   = `${reverseSource} to ${reverseDestination}`;

    // ── 3. Find or create the reverse route ──────────────────────
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

        // ── 4a. Reassign bus to existing reverse route ────────────
        await pool.query(
            `UPDATE buses SET route_id = $1, current_stop_order = 1 WHERE id = $2`,
            [reverseRouteId, bus_id],
        );
    } else {
        // Create route + all stops + bus reassignment atomically.
        // If the server crashes mid-loop the whole transaction rolls back,
        // leaving no partial route for future trips to reuse.
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const newRouteResult = await client.query(
                `INSERT INTO routes (route_name, source, destination, owner_id)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id`,
                [reverseRouteName, reverseSource, reverseDestination, currentRoute.owner_id],
            );
            reverseRouteId = newRouteResult.rows[0].id;

            // Copy stops in reverse order with PostGIS location geography calculation
            const totalStops = currentStops.length;
            for (let i = 0; i < currentStops.length; i++) {
                const originalStop = currentStops[totalStops - 1 - i];
                const newStopOrder = i + 1;
                await client.query(
                    `INSERT INTO stops (route_id, stop_name, stop_order, stop_lat, stop_lon, location)
                     VALUES (
                        $1, $2, $3, $4, $5,
                        CASE
                            WHEN $4::NUMERIC IS NULL OR $5::NUMERIC IS NULL THEN NULL
                            ELSE ${pointExpression('$4', '$5')}
                        END
                     )`,
                    [
                        reverseRouteId,
                        originalStop.stop_name,
                        newStopOrder,
                        originalStop.stop_lat || null,
                        originalStop.stop_lon || null,
                    ],
                );
            }

            // ── 4b. Reassign bus inside the same transaction ──────
            await client.query(
                `UPDATE buses SET route_id = $1, current_stop_order = 1 WHERE id = $2`,
                [reverseRouteId, bus_id],
            );

            await client.query('COMMIT');
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }
    }
    clearBusState(bus_id);

    // ── 5. Fetch first stop info for socket payload ──────────────
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

    // ── 6. Emit trip:completed with next-route info ──────────────
    getIO().to(`route:${route_id}`).emit('trip:completed', {
        event:           'trip:completed',
        bus_id,
        route_id,
        next_route_id:   reverseRouteId,
        next_route_name: reverseRouteName,
        message:         'Bus has completed all stops on this route',
        auto_detected:   true,
        timestamp:       new Date().toISOString(),
    });

    // ── 7. Emit bus:route_assigned ───────────────────────────────
    const routeAssignedPayload = {
        event:          'bus:route_assigned',
        bus_id,
        route_id:       reverseRouteId,
        route_name:     reverseRouteName,
        bus_status:     BUS_STATUSES.ACTIVE,
        source:         reverseSource,
        destination:    reverseDestination,
        auto_reversed:  true,
        timestamp:      new Date().toISOString(),
    };
    getIO().to(`driver:${driverId}`).emit('bus:route_assigned', routeAssignedPayload);
    getIO().to(`owner:${owner_id}`).emit('bus:route_assigned',  routeAssignedPayload);
    getIO().to('admin').emit('bus:route_assigned',               routeAssignedPayload);

    // ── 8. Emit next-stop-updated for the new route ──────────────
    if (firstStop) {
        const nextStopPayload = {
            event:           'next-stop-updated',
            bus_id,
            route_id:        reverseRouteId,
            next_stop_name:  firstStop.stop_name,
            next_stop_order: firstStop.stop_order,
            waiting_count:   firstStop.waiting_count,
            timestamp:       new Date().toISOString(),
        };
        getIO().to(`driver:${driverId}`).emit('next-stop-updated', nextStopPayload);
        getIO().to(`owner:${owner_id}`).emit('next-stop-updated',  nextStopPayload);
        getIO().to('admin').emit('next-stop-updated',               nextStopPayload);
    }

    return { reverseRouteId, reverseRouteName, reverseSource, reverseDestination };
}

module.exports = { assignReverseRoute };
