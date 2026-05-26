const express = require('express');
const router  = express.Router();

const {
    registerDriver,
    getDrivers,
    loginDriver,
    getDriverProfile,
    updateLocation,
    getRouteStops
} = require('../controllers/driverController');

const {
    driverGetWaitingCounts,
    driverGetAllWaiting,
    markStopReached
} = require('../controllers/passengerController');

const verifyDriver = require('../middleware/authMiddleware');

// ── AUTH ──────────────────────────────────────────────────────────
router.post('/register', registerDriver);
router.post('/login',    loginDriver);
router.get('/',          getDrivers);

// ── DRIVER PROFILE & LOCATION ─────────────────────────────────────
router.get('/profile',             verifyDriver, getDriverProfile);
router.put('/update-location',     verifyDriver, updateLocation);

// ── WAITING VISIBILITY ────────────────────────────────────────────
// Next stop only (immediate panel)
router.get('/route/waiting',       verifyDriver, driverGetWaitingCounts);
// All upcoming stops with waiting counts
router.get('/route/all-waiting',   verifyDriver, driverGetAllWaiting);
// Mark stop as reached → clears waiting + advances progression
router.post('/route/stop-reached', verifyDriver, markStopReached);
router.get('/route/stops', verifyDriver, getRouteStops);

module.exports = router;
