const express = require('express');
const router  = express.Router();

const {
    registerPassenger,
    loginPassenger,
    getAllRoutes,
    getRouteById,
    getLiveBuses,
    getBusesNearStop,
    getBusById,
    registerWaiting,
    getWaitingCountsForRoute,
    boardBus,
    cancelWaiting,
    getMyWaiting,
    getRouteETA,
    searchRoute,
    getMyTrips
} = require('../controllers/passengerController');

const verifyPassenger = require('../middleware/passengerAuthMiddleware');

// ── AUTH ──────────────────────────────────────────────────────────
router.post('/register', registerPassenger);
router.post('/login',    loginPassenger);

// ── ROUTE BROWSING (public) ───────────────────────────────────────
router.get('/routes',     getAllRoutes);
router.get('/routes/:id', getRouteById);

// ── LIVE TRACKING (public) ────────────────────────────────────────
router.get('/buses/live',          getLiveBuses);
router.get('/stops/:stopId/buses', getBusesNearStop);
router.get('/buses/:id',           getBusById);

// ── WAITING SYSTEM ────────────────────────────────────────────────
router.post('/waiting',              verifyPassenger, registerWaiting);
router.get('/routes/:id/waiting',    getWaitingCountsForRoute);
router.post('/waiting/:id/board',    verifyPassenger, boardBus);
router.delete('/waiting/:id/cancel', verifyPassenger, cancelWaiting);
router.get('/my-waiting',            verifyPassenger, getMyWaiting);

// ── ETA (public) ──────────────────────────────────────────────────
router.get('/routes/:routeId/eta', getRouteETA);
router.get('/search-route',        searchRoute);
router.get('/my-trips',           verifyPassenger, getMyTrips);
module.exports = router;
