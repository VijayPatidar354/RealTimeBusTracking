'use strict';

// ================================================================
//  REGISTRATION CONTROLLER — Verify-Before-Create
//  controllers/registrationController.js
//
//  Handles the 2-step registration flow for ALL roles:
//    Step 1: initiateRegistration → validate + store pending + send OTP
//    Step 2: verifyAndRegister   → verify OTP + create real account
//    Extra:  resendOtp           → regenerate OTP for pending entry
//
//  Usage in routes (factory pattern):
//    const reg = require('../controllers/registrationController');
//    router.post('/register',        authLimiter, reg.initiateRegistration('passenger'));
//    router.post('/verify-register', authLimiter, reg.verifyAndRegister('passenger'));
//    router.post('/resend-otp',      authLimiter, reg.resendOtp('passenger'));
// ================================================================

const pool   = require('../config/db');
const bcrypt = require('bcryptjs');
const { sendOtpEmail }   = require('../services/emailServices');
const { safeErrorResponse } = require('../utils/validators');
const {
    validateEmail,
    validatePhone,
    validatePassword,
    validateName,
    validateLicenseNumber,
} = require('../utils/validators');
const { runValidations } = require('../utils/runValidations');

// ── Role-specific configuration ──────────────────────────────────
const ROLE_CONFIG = {
    passenger: {
        table: 'passengers',
        uniqueFields: [
            { column: 'email',  label: 'email' },
            { column: 'phone',  label: 'phone number' },
        ],
        validate(body) {
            return [
                validateName(body.passenger_name, 'Passenger name'),
                validatePhone(body.phone),
                validateEmail(body.email),
                validatePassword(body.password),
            ];
        },
        buildInsert(data) {
            return {
                sql: `INSERT INTO passengers (passenger_name, phone, email, password)
                      VALUES ($1, $2, $3, $4)
                      RETURNING id, passenger_name, phone, email, created_at`,
                params: [
                    data.passenger_name.trim(),
                    data.phone.trim(),
                    data.email.trim().toLowerCase(),
                    data.hashedPassword,
                ],
            };
        },
    },
    driver: {
        table: 'drivers',
        uniqueFields: [
            { column: 'email',  label: 'email' },
            { column: 'phone',  label: 'phone number' },
        ],
        validate(body) {
            return [
                validateName(body.driver_name, 'Driver name'),
                validatePhone(body.phone),
                validateEmail(body.email),
                validatePassword(body.password),
                validateLicenseNumber(body.license_number),
            ];
        },
        buildInsert(data) {
            return {
                sql: `INSERT INTO drivers (driver_name, phone, email, license_number, password)
                      VALUES ($1, $2, $3, $4, $5)
                      RETURNING id, driver_name, phone, email, license_number`,
                params: [
                    data.driver_name.trim(),
                    data.phone.trim(),
                    data.email.trim().toLowerCase(),
                    data.license_number.trim(),
                    data.hashedPassword,
                ],
            };
        },
    },
    owner: {
        table: 'owners',
        uniqueFields: [
            { column: 'email',  label: 'email' },
        ],
        validate(body) {
            return [
                validateName(body.owner_name, 'Owner name'),
                validateEmail(body.email),
                validatePassword(body.password),
            ];
        },
        buildInsert(data) {
            return {
                sql: `INSERT INTO owners (owner_name, email, password)
                      VALUES ($1, $2, $3)
                      RETURNING id, owner_name, email`,
                params: [
                    data.owner_name.trim(),
                    data.email.trim().toLowerCase(),
                    data.hashedPassword,
                ],
            };
        },
    },
};

// ── Helper: generate 6-digit OTP ─────────────────────────────────
function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

// ================================================================
//  STEP 1 — Initiate Registration
//  Validates input, checks for duplicates, hashes password,
//  stores everything in pending_registrations, sends OTP email.
// ================================================================
function initiateRegistration(role) {
    const config = ROLE_CONFIG[role];
    if (!config) throw new Error(`Unknown role: ${role}`);

    return async (req, res) => {
        try {
            const { password, ...rest } = req.body;

            // ── Validate all fields ──
            const errors = config.validate(req.body);
            if (runValidations(res, ...errors)) return;

            const email = (req.body.email || '').trim().toLowerCase();

            // ── Check duplicates in REAL table ──
            for (const field of config.uniqueFields) {
                const val = (req.body[field.column] || '').trim().toLowerCase();
                const dup = await pool.query(
                    `SELECT id FROM ${config.table} WHERE LOWER(${field.column}) = $1`,
                    [val],
                );
                if (dup.rows.length > 0) {
                    return res.status(409).json({
                        success: false,
                        message: `A ${role} with this ${field.label} already exists`,
                    });
                }
            }

            // ── Hash password ──
            const hashedPassword = await bcrypt.hash(password, 10);

            // ── Build JSONB data (all registration fields + hashed pw) ──
            const data = { ...rest, hashedPassword };
            // Normalize email in data
            if (data.email) data.email = email;

            // ── Generate OTP ──
            const otpCode = generateOtp();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

            // ── Upsert into pending_registrations ──
            await pool.query(
                `INSERT INTO pending_registrations (role, email, data, otp_code, otp_expires, attempts)
                 VALUES ($1, $2, $3, $4, $5, 0)
                 ON CONFLICT (email, role)
                 DO UPDATE SET data = $3, otp_code = $4, otp_expires = $5, attempts = 0, created_at = NOW()`,
                [role, email, JSON.stringify(data), otpCode, expiresAt],
            );

            // ── Send OTP email ──
            await sendOtpEmail(email, otpCode);

            res.status(200).json({
                success: true,
                message: 'Verification code sent to your email. Please check your inbox.',
            });
        } catch (error) {
            safeErrorResponse(res, error, `initiateRegistration(${role})`);
        }
    };
}

// ================================================================
//  STEP 2 — Verify OTP & Create Account
//  Checks the OTP, and on match creates the real DB record.
// ================================================================
function verifyAndRegister(role) {
    const config = ROLE_CONFIG[role];
    if (!config) throw new Error(`Unknown role: ${role}`);

    return async (req, res) => {
        try {
            const { email, otp } = req.body;

            if (runValidations(res, validateEmail(email))) return;
            if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
                return res.status(400).json({
                    success: false,
                    message: 'A valid 6-digit verification code is required',
                });
            }

            const cleanEmail = email.trim().toLowerCase();

            // ── Look up pending registration ──
            const pending = await pool.query(
                `SELECT * FROM pending_registrations WHERE email = $1 AND role = $2`,
                [cleanEmail, role],
            );
            if (pending.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No pending registration found. Please register first.',
                });
            }
            const row = pending.rows[0];

            // ── Check expiry ──
            if (new Date(row.otp_expires) < new Date()) {
                return res.status(400).json({
                    success: false,
                    message: 'Verification code expired. Please request a new one.',
                });
            }

            // ── Check attempts ──
            if (row.attempts >= 5) {
                return res.status(429).json({
                    success: false,
                    message: 'Too many attempts. Please request a new verification code.',
                });
            }

            // ── Check code ──
            if (row.otp_code !== otp) {
                await pool.query(
                    `UPDATE pending_registrations SET attempts = attempts + 1 WHERE id = $1`,
                    [row.id],
                );
                return res.status(400).json({
                    success: false,
                    message: 'Incorrect verification code',
                });
            }

            // ── OTP is correct — create the real account ──
            const data = row.data; // JSONB — already parsed by pg driver
            const { sql, params } = config.buildInsert(data);

            const result = await pool.query(sql, params);

            // ── Clean up pending row ──
            await pool.query(
                `DELETE FROM pending_registrations WHERE id = $1`,
                [row.id],
            );

            res.status(201).json({
                success: true,
                message: 'Registration complete. You can now login.',
                [role]: result.rows[0],
            });
        } catch (error) {
            // Handle unique constraint violation (rare race condition)
            if (error.code === '23505') {
                return res.status(409).json({
                    success: false,
                    message: `A ${role} with this email or phone already exists`,
                });
            }
            safeErrorResponse(res, error, `verifyAndRegister(${role})`);
        }
    };
}

// ================================================================
//  RESEND OTP
//  Generates a new OTP for an existing pending registration.
// ================================================================
function resendOtp(role) {
    return async (req, res) => {
        try {
            const { email } = req.body;
            if (runValidations(res, validateEmail(email))) return;

            const cleanEmail = email.trim().toLowerCase();

            const pending = await pool.query(
                `SELECT id FROM pending_registrations WHERE email = $1 AND role = $2`,
                [cleanEmail, role],
            );
            if (pending.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No pending registration found. Please register first.',
                });
            }

            const otpCode = generateOtp();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

            await pool.query(
                `UPDATE pending_registrations
                 SET otp_code = $1, otp_expires = $2, attempts = 0
                 WHERE email = $3 AND role = $4`,
                [otpCode, expiresAt, cleanEmail, role],
            );

            await sendOtpEmail(cleanEmail, otpCode);

            res.status(200).json({
                success: true,
                message: 'New verification code sent to your email.',
            });
        } catch (error) {
            safeErrorResponse(res, error, `resendOtp(${role})`);
        }
    };
}

// ================================================================
//  CLEANUP — Delete expired pending registrations
//  Called periodically from app.js
// ================================================================
async function cleanupExpiredPending() {
    try {
        const result = await pool.query(
            `DELETE FROM pending_registrations WHERE otp_expires < NOW() - INTERVAL '30 minutes' RETURNING id`,
        );
        if (result.rowCount > 0) {
            console.log(`[Cleanup] Removed ${result.rowCount} expired pending registration(s)`);
        }
    } catch (error) {
        console.error('[Cleanup] Error cleaning pending registrations:', error.message);
    }
}

module.exports = {
    initiateRegistration,
    verifyAndRegister,
    resendOtp,
    cleanupExpiredPending,
};
