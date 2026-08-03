const express = require('express');
const router  = express.Router();
const { authLimiter, gpsLimiter } = require('../middleware/rateLimiter');

const reg = require('../controllers/registrationController');

const {
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
const verifyAdmin  = require('../middleware/adminAuthMiddleware');

// ── AUTH ──────────────────────────────────────────────────────────
router.post('/register',        authLimiter, reg.initiateRegistration('driver'));
router.post('/verify-register', authLimiter, reg.verifyAndRegister('driver'));
router.post('/resend-otp',      authLimiter, reg.resendOtp('driver'));
router.post('/login',    authLimiter, loginDriver);
// Protected: only admins can list all drivers (never public — contains PII)
router.get('/',          verifyAdmin, getDrivers);


// ── DRIVER PROFILE & LOCATION ─────────────────────────────────────
router.get('/profile',             verifyDriver, getDriverProfile);
router.put('/update-location',     verifyDriver, gpsLimiter, updateLocation);

// ── WAITING VISIBILITY ────────────────────────────────────────────
// Next stop only (immediate panel)
router.get('/route/waiting',       verifyDriver, driverGetWaitingCounts);
// All upcoming stops with waiting counts
router.get('/route/all-waiting',   verifyDriver, driverGetAllWaiting);
// Mark stop as reached → clears waiting + advances progression
router.post('/route/stop-reached', verifyDriver, markStopReached);
router.get('/route/stops', verifyDriver, getRouteStops);

module.exports = router;
