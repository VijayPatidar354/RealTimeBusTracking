'use strict';

const pool = require('../config/db');

// ================================================================
//  SHARED HELPER -- getUpcomingStopsWaiting
//  Returns all stops (stop_order >= currentStopOrder) on a given
//  route, each with its live passenger waiting_count and an
//  is_next_stop flag.
//
//  Used by:
//    - passengerController.js  (markStopReached, registerWaiting,
//                               boardBus, cancelWaiting, autoExpire)
//    - autoStopService.js      (after geofence-triggered progression)
// ================================================================

/**
 * @param {number} routeId
 * @param {number} currentStopOrder - only stops at or after this order are returned
 * @returns {Promise<Array>}
 */
async function getUpcomingStopsWaiting(routeId, currentStopOrder) {
    const result = await pool.query(
        `SELECT
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
        ORDER BY s.stop_order ASC`,
        [routeId, currentStopOrder],
    );
    return result.rows;
}

module.exports = { getUpcomingStopsWaiting };
