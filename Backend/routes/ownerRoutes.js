const express = require("express");
const router = express.Router();
const { authLimiter } = require("../middleware/rateLimiter");

const reg = require("../controllers/registrationController");

const {
  loginOwner,
  createBus,
  assignDriver,
  updateBusStatus,
  getMyBuses,
} = require("../controllers/ownerController");

const {
  createRoute,
  addStop,
  getMyRoutes,
  getMyRouteById,
  assignRoute,
} = require("../controllers/routeController");

const verifyOwner = require("../middleware/ownerAuthMiddleware");

// ── AUTH ──────────────────────────────────────────────────────────
router.post("/register", authLimiter, reg.initiateRegistration("owner"));
router.post("/verify-register", authLimiter, reg.verifyAndRegister("owner"));
router.post("/resend-otp", authLimiter, reg.resendOtp("owner"));
router.post("/login", authLimiter, loginOwner);

// ── BUS MANAGEMENT ───────────────────────────────────────────────
router.post("/buses", verifyOwner, createBus);
router.get("/buses", verifyOwner, getMyBuses);
router.put("/buses/:busId/status", verifyOwner, updateBusStatus);
router.put("/buses/:busId/assign-driver", verifyOwner, assignDriver);
router.put("/buses/:busId/assign-route", verifyOwner, assignRoute);

// ── ROUTE MANAGEMENT ─────────────────────────────────────────────
router.post("/routes", verifyOwner, createRoute);
router.post("/routes/:routeId/stops", verifyOwner, addStop);
router.get("/routes", verifyOwner, getMyRoutes);
router.get("/routes/:id", verifyOwner, getMyRouteById);

module.exports = router;
