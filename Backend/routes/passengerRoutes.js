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
    getRouteETA
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

// ── ETA (public) ──────────────────────────────────────────────────
router.get('/routes/:routeId/eta',   getRouteETA);

module.exports = router;
