'use strict';

// ================================================================
//  RATE LIMITING MIDDLEWARE
//  middleware/rateLimiter.js
//
//  Two limiters:
//   • authLimiter  — protects login/register from brute-force
//   • gpsLimiter   — prevents GPS update flooding
//
//  Usage in routes:
//    const { authLimiter, gpsLimiter } = require('../middleware/rateLimiter');
//    router.post('/login', authLimiter, loginHandler);
// ================================================================

const rateLimit = require('express-rate-limit');

// ── Auth Limiter ─────────────────────────────────────────────────
// 10 login/register attempts per 15-minute window per IP.
// After exhaustion, requests are rejected with 429 until the window resets.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 10,
    message: {
        success: false,
        message: 'Too many attempts. Please try again in 15 minutes.'
    },
    standardHeaders: true,      // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false,       // Disable `X-RateLimit-*` headers
});

// ── GPS Limiter ──────────────────────────────────────────────────
// 60 location updates per minute per IP.
// Prevents a rogue client from flooding the server with GPS pings.
const gpsLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1 minute
    max: 60,                     // 1 request per second average
    message: {
        success: false,
        message: 'GPS update rate exceeded. Slow down updates.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = { authLimiter, gpsLimiter };
