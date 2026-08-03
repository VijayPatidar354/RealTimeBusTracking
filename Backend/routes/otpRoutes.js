const express = require("express");
const router = express.Router();
const { sendOtp, verifyOtp } = require("../controllers/otpController");
const { authLimiter } = require("../middleware/rateLimiters");

router.post("/send", authLimiter, sendOtp);
router.post("/verify", authLimiter, verifyOtp);

module.exports = router;
