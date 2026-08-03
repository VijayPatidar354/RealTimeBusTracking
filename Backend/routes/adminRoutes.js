const express = require('express');
const router  = express.Router();
const { authLimiter } = require('../middleware/rateLimiter');

const {
   // registerAdmin,
    loginAdmin,
    getSystemStats,
    getAllBuses,
    getAllDrivers,
    getSingleDriver,
    getAllOwners,
    getWaitingOverview,
} = require('../controllers/adminController');

const {
    adminGetAllRoutes,
    adminGetRouteById,
} = require('../controllers/routeController');

const verifyAdmin = require('../middleware/adminAuthMiddleware.js');

// ── AUTH ──────────────────────────────────────────────────────────
//router.post('/register', registerAdmin);
router.post('/login',    authLimiter, loginAdmin);

// ── STATS ─────────────────────────────────────────────────────────
router.get('/stats',   verifyAdmin, getSystemStats);

// ── FLEET ─────────────────────────────────────────────────────────
router.get('/buses',   verifyAdmin, getAllBuses);

// ── DRIVER MANAGEMENT ────────────────────────────────────────────
router.get('/drivers',     verifyAdmin, getAllDrivers);
router.get('/drivers/:id', verifyAdmin, getSingleDriver);

// ── OWNER OVERSIGHT ───────────────────────────────────────────────
router.get('/owners',  verifyAdmin, getAllOwners);

// ── ROUTE OVERSIGHT ───────────────────────────────────────────────
router.get('/routes',     verifyAdmin, adminGetAllRoutes);
router.get('/routes/:id', verifyAdmin, adminGetRouteById);

// ── WAITING OVERVIEW ──────────────────────────────────────────────
router.get('/waiting', verifyAdmin, getWaitingOverview);

module.exports = router;
