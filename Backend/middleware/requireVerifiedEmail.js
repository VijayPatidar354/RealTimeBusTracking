const pool = require("../config/db");

const requireVerifiedPassengerEmail = async (req, res, next) => {
  const result = await pool.query(
    `SELECT email_verified FROM passengers WHERE id = $1`,
    [req.passenger.passengerId],
  );
  if (!result.rows[0]?.email_verified) {
    return res
      .status(403)
      .json({ success: false, message: "Please verify your email first" });
  }
  next();
};

const requireVerifiedOwnerEmail = async (req, res, next) => {
  const result = await pool.query(
    `SELECT email_verified FROM owners WHERE id = $1`,
    [req.owner.ownerId],
  );
  if (!result.rows[0]?.email_verified) {
    return res
      .status(403)
      .json({ success: false, message: "Please verify your email first" });
  }
  next();
};

module.exports = { requireVerifiedPassengerEmail, requireVerifiedOwnerEmail };
