// ================================================================
//  ETA SERVICE — Realtime Adaptive ETA Prediction
//  services/etaService.js
//
//  Calculates estimated arrival times for upcoming bus stops
//  based on ACTUAL bus movement speed rather than a fixed constant.
//
//  SPEED CALCULATION
//  -----------------
//  Every GPS ping is recorded. Speed is derived from consecutive
//  Haversine distances divided by the elapsed time.
//
//  GPS NOISE PROTECTION
//  --------------------
//  1. Ignore pings with Δt < MIN_TIME_DELTA_SEC (too frequent)
//  2. Ignore pings with Δd < MIN_DISTANCE_DELTA_M (GPS jitter)
//  3. Ignore speeds > MAX_BUS_SPEED_KMPH (unrealistic spikes)
//  4. Moving average over SPEED_WINDOW_SIZE samples smooths noise
//  5. If smoothed speed < MIN_MOVING_SPEED_MPS → use fallback
//
//  FALLBACK SPEED
//  --------------
//  Used when: first GPS update, stationary bus, insufficient
//  history, invalid timestamps, or speed below minimum threshold.
//
//  CUMULATIVE ETA
//  --------------
//  ETAs respect stop_order sequence. Distance is accumulated
//  segment-by-segment (bus→stop1, stop1→stop2, stop2→stop3…),
//  NOT straight-line from bus to each stop independently.
//
//  THROTTLING
//  ----------
//  Socket emissions are throttled to at most once per
//  EMIT_THROTTLE_MS per bus to avoid flooding clients.
//
//  FUTURE COMPATIBILITY
//  --------------------
//  Structured so later additions (traffic-aware ETA, ML models,
//  Google Maps routing, historical speed analysis, congestion)
//  can replace or augment the speed/distance calculations without
//  touching the rest of the pipeline.
// ================================================================

'use strict';

const pool                   = require('../config/db');
const { getIO }              = require('../socket');
const { haversineDistance }   = require('../utils/haversine');

// ── Configurable constants ───────────────────────────────────────
const DEFAULT_BUS_SPEED_KMPH = 30;                          // fallback speed
const DEFAULT_BUS_SPEED_MPS  = DEFAULT_BUS_SPEED_KMPH / 3.6; // ≈ 8.33 m/s

const MAX_BUS_SPEED_KMPH     = 100;                          // reject spikes above this
const MAX_BUS_SPEED_MPS      = MAX_BUS_SPEED_KMPH / 3.6;    // ≈ 27.78 m/s

const MIN_MOVING_SPEED_MPS   = 1.0;   // below this → treat as stationary → use fallback
const MIN_TIME_DELTA_SEC     = 3;     // ignore pings closer than 3 seconds
const MIN_DISTANCE_DELTA_M   = 5;     // ignore movement smaller than 5 metres
const SPEED_WINDOW_SIZE      = 5;     // moving average window
const EMIT_THROTTLE_MS       = 10000; // 10 seconds between socket emissions per bus
const DB_WRITE_THROTTLE_MS   = 30000; // 30 seconds between DB speed writes per bus

// ── Per-bus in-memory state ──────────────────────────────────────
// Key:   busId (number)
// Value:
//   prevLat        {number}   Last accepted latitude
//   prevLon        {number}   Last accepted longitude
//   prevTimestamp  {number}   epoch ms of last accepted ping
//   speedHistory   {number[]} Moving-average window (m/s)
//   lastEmitTime   {number}   epoch ms of last socket emission
//   lastDbWrite    {number}   epoch ms of last DB speed write
//
// Structured for future extensibility — add fields here when
// historical analytics, ML features, or traffic data is needed.
const busState = new Map();

// ================================================================
//  recordGPSUpdate — called on every GPS ping from the driver
//
//  Records the new position and calculates instantaneous speed.
//  Applies noise filters and updates the moving average.
//
//  @param {number} busId
//  @param {number} latitude
//  @param {number} longitude
//  @param {number} timestamp — Date.now() epoch milliseconds
// ================================================================
function recordGPSUpdate(busId, latitude, longitude, timestamp) {
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon) || isNaN(timestamp)) return;

    const state = busState.get(busId);

    if (!state) {
        // First ping for this bus — store and wait for second
        busState.set(busId, {
            prevLat:       lat,
            prevLon:       lon,
            prevTimestamp: timestamp,
            speedHistory:  [],
            lastEmitTime:  0,
            lastDbWrite:   0
        });
        return;
    }

    // ── Time delta guard ─────────────────────────────────────────
    const deltaTimeSec = (timestamp - state.prevTimestamp) / 1000;
    if (deltaTimeSec < MIN_TIME_DELTA_SEC) {
        // Too frequent — skip this ping entirely (don't even update prev coords)
        return;
    }

    // ── Distance delta ───────────────────────────────────────────
    const deltaDistM = haversineDistance(state.prevLat, state.prevLon, lat, lon);

    // Update stored coords regardless (so next delta is relative to this point)
    state.prevLat       = lat;
    state.prevLon       = lon;
    state.prevTimestamp  = timestamp;

    // ── Noise guard — too small a movement ───────────────────────
    if (deltaDistM < MIN_DISTANCE_DELTA_M) {
        return; // GPS jitter — don't record speed from this sample
    }

    // ── Instantaneous speed ──────────────────────────────────────
    const speedMPS = deltaDistM / deltaTimeSec;

    // ── Max speed cap — reject unrealistic GPS spikes ────────────
    if (speedMPS > MAX_BUS_SPEED_MPS) {
        return; // e.g. 600 km/h glitch — discard
    }

    // ── Push to moving average window ────────────────────────────
    state.speedHistory.push(speedMPS);
    if (state.speedHistory.length > SPEED_WINDOW_SIZE) {
        state.speedHistory.shift(); // drop oldest
    }

    // ── Persist validated smoothed speed to DB (throttled) ───────
    // Only write AFTER smoothing — never raw/rejected/jitter values.
    // Throttled to DB_WRITE_THROTTLE_MS to avoid excessive writes.
    const now = Date.now();
    if (now - state.lastDbWrite >= DB_WRITE_THROTTLE_MS) {
        state.lastDbWrite = now;
        const smoothedKmph = Math.round(getSmoothedSpeed(busId) * 3.6);
        // Fire-and-forget: non-blocking, errors logged but not thrown
        pool.query(
            `UPDATE buses SET current_speed_kmph = $1 WHERE id = $2`,
            [smoothedKmph, busId]
        ).catch(err => console.error('[ETA] DB speed write failed:', err.message));
    }
}

// ================================================================
//  getSmoothedSpeed — returns the smoothed speed in m/s
//
//  Uses the moving average of recent valid speed samples.
//  Falls back to DEFAULT_BUS_SPEED_MPS when:
//    - No speed history exists
//    - Smoothed speed is below MIN_MOVING_SPEED_MPS (stationary)
//
//  @param  {number} busId
//  @returns {number} speed in metres/second
// ================================================================
function getSmoothedSpeed(busId) {
    const state = busState.get(busId);

    if (!state || state.speedHistory.length === 0) {
        return DEFAULT_BUS_SPEED_MPS;
    }

    const sum     = state.speedHistory.reduce((a, b) => a + b, 0);
    const average = sum / state.speedHistory.length;

    // ── Stationary guard — bus stopped in traffic ────────────────
    // If moving average is effectively zero, return fallback to
    // avoid infinity/huge ETAs.
    if (average < MIN_MOVING_SPEED_MPS) {
        return DEFAULT_BUS_SPEED_MPS;
    }

    return average;
}

// ================================================================
//  getSpeedKmph — returns current smoothed speed in km/h (display)
//  @param  {number} busId
//  @returns {number} speed in km/h, rounded integer
// ================================================================
function getSpeedKmph(busId) {
    return Math.round(getSmoothedSpeed(busId) * 3.6);
}

// ================================================================
//  calculateUpcomingETAs
//
//  Fetches upcoming stops for the route and computes cumulative
//  segment-by-segment distances and ETAs.
//
//  @param {number} busId
//  @param {number} busLat
//  @param {number} busLon
//  @param {number} routeId
//  @param {number} currentStopOrder
//  @returns {Promise<Array>} upcoming stops with ETA
// ================================================================
async function calculateUpcomingETAs(busId, busLat, busLon, routeId, currentStopOrder) {
    // Fetch upcoming stops (only those not yet crossed)
    const result = await pool.query(
        `SELECT id AS stop_id, stop_name, stop_order, stop_lat, stop_lon
         FROM   stops
         WHERE  route_id    = $1
           AND  stop_order >= $2
         ORDER BY stop_order ASC`,
        [routeId, currentStopOrder]
    );

    const stops    = result.rows;
    const speedMPS = getSmoothedSpeed(busId);

    let cumulativeDistance = 0;
    let prevLat = parseFloat(busLat);
    let prevLon = parseFloat(busLon);

    const etaStops = [];

    for (const stop of stops) {
        const stopLat = parseFloat(stop.stop_lat);
        const stopLon = parseFloat(stop.stop_lon);

        if (!isNaN(stopLat) && !isNaN(stopLon) && stop.stop_lat !== null && stop.stop_lon !== null) {
            // Segment distance from previous point to this stop
            const segmentDist = haversineDistance(prevLat, prevLon, stopLat, stopLon);
            cumulativeDistance += segmentDist;

            // Update previous point to this stop's coordinates
            prevLat = stopLat;
            prevLon = stopLon;
        }
        // If stop has no coordinates, skip distance accumulation
        // (cumulative distance stays the same — ETA is based on
        //  the last known coordinate pair)

        const etaSeconds = cumulativeDistance / speedMPS;
        // ── Never show 0 min while still moving ──────────────────
        // Math.max(1, Math.ceil(...)) ensures minimum 1 min display
        const etaMinutes = cumulativeDistance < 1
            ? 0                                             // truly at the stop (< 1 metre)
            : Math.max(1, Math.ceil(etaSeconds / 60));      // at least 1 minute otherwise

        etaStops.push({
            stop_name:       stop.stop_name,
            stop_order:      stop.stop_order,
            distance_metres: Math.round(cumulativeDistance),
            eta_minutes:     etaMinutes
        });
    }

    return etaStops;
}

// ================================================================
//  calculateUpcomingETAsWithSpeed
//
//  Same as calculateUpcomingETAs but accepts an EXPLICIT speedMPS
//  instead of looking up in-memory busState. Used by
//  generateETAPayload to support the fallback speed chain:
//    realtime in-memory → DB persisted → default constant
//
//  @param {number} busLat
//  @param {number} busLon
//  @param {number} routeId
//  @param {number} currentStopOrder
//  @param {number} speedMPS  — explicit speed in metres/second
//  @returns {Promise<Array>} upcoming stops with ETA
// ================================================================
async function calculateUpcomingETAsWithSpeed(busLat, busLon, routeId, currentStopOrder, speedMPS) {
    const result = await pool.query(
        `SELECT id AS stop_id, stop_name, stop_order, stop_lat, stop_lon
         FROM   stops
         WHERE  route_id    = $1
           AND  stop_order >= $2
         ORDER BY stop_order ASC`,
        [routeId, currentStopOrder]
    );

    const stops = result.rows;
    let cumulativeDistance = 0;
    let prevLat = parseFloat(busLat);
    let prevLon = parseFloat(busLon);
    const etaStops = [];

    for (const stop of stops) {
        const stopLat = parseFloat(stop.stop_lat);
        const stopLon = parseFloat(stop.stop_lon);

        if (!isNaN(stopLat) && !isNaN(stopLon) && stop.stop_lat !== null && stop.stop_lon !== null) {
            const segmentDist = haversineDistance(prevLat, prevLon, stopLat, stopLon);
            cumulativeDistance += segmentDist;
            prevLat = stopLat;
            prevLon = stopLon;
        }

        const etaSeconds = cumulativeDistance / speedMPS;
        const etaMinutes = cumulativeDistance < 1
            ? 0
            : Math.max(1, Math.ceil(etaSeconds / 60));

        etaStops.push({
            stop_name:       stop.stop_name,
            stop_order:      stop.stop_order,
            distance_metres: Math.round(cumulativeDistance),
            eta_minutes:     etaMinutes
        });
    }

    return etaStops;
}

// ================================================================
//  generateETAPayload — full payload for API and socket emission
//
//  Speed priority:
//    1. In-memory smoothed speed  (realtime, most accurate)
//    2. DB-persisted speed        (survives server restart/refresh)
//    3. DEFAULT_BUS_SPEED_KMPH   (cold-start fallback)
//
//  @param {number} busId
//  @param {number} routeId
//  @returns {Promise<Object|null>} payload or null if no data
// ================================================================
async function generateETAPayload(busId, routeId) {
    // Fetch bus's current location, stop order, and persisted speed
    const busResult = await pool.query(
        `SELECT b.id           AS bus_id,
                b.route_id,
                b.current_stop_order,
                COALESCE(b.current_speed_kmph, $3)::INTEGER AS persisted_speed_kmph,
                d.latitude,
                d.longitude
         FROM   buses b
         LEFT JOIN drivers d ON b.driver_id = d.id
         WHERE  b.id       = $1
           AND  b.route_id = $2
         LIMIT  1`,
        [busId, routeId, DEFAULT_BUS_SPEED_KMPH]
    );

    if (busResult.rows.length === 0) return null;

    const bus = busResult.rows[0];

    if (!bus.latitude || !bus.longitude) return null;

    const busLat = parseFloat(bus.latitude);
    const busLon = parseFloat(bus.longitude);

    // ── Speed resolution: realtime → persisted → default ─────────
    const state = busState.get(busId);
    const hasRealtimeSpeed = state && state.speedHistory.length > 0;
    const displaySpeedKmph = hasRealtimeSpeed
        ? getSpeedKmph(busId)                      // realtime adaptive
        : (bus.persisted_speed_kmph || DEFAULT_BUS_SPEED_KMPH);  // DB fallback

    // For ETA calculation use the same resolved speed
    const resolvedSpeedMPS = displaySpeedKmph / 3.6;

    const upcomingStops = await calculateUpcomingETAsWithSpeed(
        busLat, busLon, routeId, bus.current_stop_order, resolvedSpeedMPS
    );

    return {
        event:              'eta-updated',
        route_id:           parseInt(routeId),
        bus_id:             parseInt(busId),
        current_speed_kmph: displaySpeedKmph,
        current_location:   {
            latitude:  busLat,
            longitude: busLon
        },
        upcoming_stops:     upcomingStops,
        timestamp:          new Date().toISOString()
    };
}

// ================================================================
//  emitETAUpdate — throttled Socket.IO emission
//
//  Called after every GPS update. Checks throttle gate before
//  actually computing and emitting.
//
//  @param {number} busId
//  @param {number} routeId
//  @param {number} driverId
// ================================================================
async function emitETAUpdate(busId, routeId, driverId) {
    const state = busState.get(busId);
    if (!state) return;

    // ── Throttle gate ────────────────────────────────────────────
    const now = Date.now();
    if (now - state.lastEmitTime < EMIT_THROTTLE_MS) return;
    state.lastEmitTime = now;

    // ── Generate and emit ────────────────────────────────────────
    const payload = await generateETAPayload(busId, routeId);
    if (!payload) return;

    const io = getIO();
    io.to(`route:${routeId}`).emit('eta-updated',   payload);
    io.to(`driver:${driverId}`).emit('eta-updated',  payload);
}

// ================================================================
//  clearBusState — cleanup when bus finishes trip or is reassigned
//  @param {number} busId
// ================================================================
function clearBusState(busId) {
    busState.delete(busId);
}

// ================================================================
// CALCULATE ETA FOR A SINGLE TARGET STOP
// Used by route search system
// ================================================================

async function calculateETAForSingleStop({
    routeId,
    busLatitude,
    busLongitude,
    targetStopOrder
}) {

    const stopsResult = await pool.query(
        `
        SELECT
            stop_name,
            stop_order,
            stop_lat,
            stop_lon

        FROM stops

        WHERE
              route_id = $1
          AND stop_order <= $2

        ORDER BY stop_order ASC
        `,
        [routeId, targetStopOrder]
    );

    const stops = stopsResult.rows;

    if (!stops.length) {
        return {
            eta_minutes: 999,
            distance_metres: 0
        };
    }

    let totalDistance = 0;

    // ------------------------------------------------------------
    // BUS → FIRST STOP
    // ------------------------------------------------------------

    totalDistance += haversineDistance(
        parseFloat(busLatitude),
        parseFloat(busLongitude),

        parseFloat(stops[0].stop_lat),
        parseFloat(stops[0].stop_lon)
    );

    // ------------------------------------------------------------
    // CUMULATIVE STOP DISTANCE
    // ------------------------------------------------------------

    for (let i = 0; i < stops.length - 1; i++) {

        totalDistance += haversineDistance(

            parseFloat(stops[i].stop_lat),
            parseFloat(stops[i].stop_lon),

            parseFloat(stops[i + 1].stop_lat),
            parseFloat(stops[i + 1].stop_lon)
        );
    }

    // ------------------------------------------------------------
    // SPEED
    // ------------------------------------------------------------

    const AVG_BUS_SPEED_MPS = 8.33; // 30 km/h

    const etaSeconds =
        totalDistance / AVG_BUS_SPEED_MPS;

    return {

        eta_minutes:
            Math.max(1, Math.ceil(etaSeconds / 60)),

        distance_metres:
            Math.round(totalDistance)
    };
}

module.exports = {
    recordGPSUpdate,
    getSmoothedSpeed,
    getSpeedKmph,
    calculateUpcomingETAs,
    calculateUpcomingETAsWithSpeed,
    generateETAPayload,
    emitETAUpdate,
    clearBusState,
    calculateETAForSingleStop
};
