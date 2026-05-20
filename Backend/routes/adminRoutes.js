const express = require('express');
const router  = express.Router();

const {
    registerAdmin,
    loginAdmin,
    getAllDrivers,
    getSingleDriver
} = require('../controllers/adminController');

const {
    adminGetAllRoutes,
    adminGetRouteById
} = require('../controllers/routeController');

const verifyAdmin = require('../middleware/adminAuthMiddleware.js');

// ── AUTH ──────────────────────────────────────────────────────────
router.post('/register', registerAdmin);
router.post('/login',    loginAdmin);

// ── DRIVER MANAGEMENT ────────────────────────────────────────────
router.get('/drivers',     verifyAdmin, getAllDrivers);
router.get('/drivers/:id', verifyAdmin, getSingleDriver);

// ── ROUTE OVERSIGHT (read-only) ───────────────────────────────────
router.get('/routes',     verifyAdmin, adminGetAllRoutes);
router.get('/routes/:id', verifyAdmin, adminGetRouteById);

module.exports = router;
