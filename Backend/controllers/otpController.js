const pool = require("../config/db");
const { sendOtpEmail } = require("../services/emailService");
const { validateEmail, safeErrorResponse } = require("../utils/validators");
const { runValidations } = require("../utils/runValidations");

const TABLE_MAP = { passenger_verify: "passengers", owner_verify: "owners" };

const sendOtp = async (req, res) => {
  try {
    const { email, purpose } = req.body;

    if (runValidations(res, validateEmail(email))) return;
    const table = TABLE_MAP[purpose];
    if (!table) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid purpose" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const userCheck = await pool.query(
      `SELECT id FROM ${table} WHERE email = $1`,
      [cleanEmail],
    );
    if (userCheck.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No account with this email" });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await pool.query(
      `INSERT INTO otp_codes (email, code, purpose, expires_at)
             VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')`,
      [cleanEmail, code, purpose],
    );
    await sendOtpEmail(cleanEmail, code);

    res.json({ success: true, message: "OTP sent to your email" });
  } catch (error) {
    safeErrorResponse(res, error, "sendOtp");
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { email, code, purpose } = req.body;

    if (runValidations(res, validateEmail(email))) return;
    const table = TABLE_MAP[purpose];
    if (!table) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid purpose" });
    }
    if (!code || typeof code !== "string" || !/^\d{6}$/.test(code)) {
      return res
        .status(400)
        .json({ success: false, message: "A valid 6-digit code is required" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const row = await pool.query(
      `SELECT * FROM otp_codes WHERE email = $1 AND purpose = $2 ORDER BY id DESC LIMIT 1`,
      [cleanEmail, purpose],
    );

    if (row.rows.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No OTP requested for this email" });
    }
    const otp = row.rows[0];

    if (new Date(otp.expires_at) < new Date()) {
      return res
        .status(400)
        .json({
          success: false,
          message: "OTP expired, please request a new one",
        });
    }
    if (otp.attempts >= 5) {
      return res
        .status(429)
        .json({
          success: false,
          message: "Too many attempts, request a new OTP",
        });
    }
    if (otp.code !== code) {
      await pool.query(
        `UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`,
        [otp.id],
      );
      return res
        .status(400)
        .json({ success: false, message: "Incorrect code" });
    }

    await pool.query(
      `UPDATE ${table} SET email_verified = TRUE WHERE email = $1`,
      [cleanEmail],
    );
    await pool.query(
      `DELETE FROM otp_codes WHERE email = $1 AND purpose = $2`,
      [cleanEmail, purpose],
    );

    res.json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    safeErrorResponse(res, error, "verifyOtp");
  }
};

module.exports = { sendOtp, verifyOtp };
