const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getIO } = require("../socket");
const {
  validateEmail,
  validatePassword,
  validateName,
  validateId,
  safeErrorResponse,
} = require("../utils/validators");
const { runValidations } = require("../utils/runValidations");
const {
  BUS_STATUSES,
  normalizeBusStatus,
  validateBusStatus,
} = require("../utils/busStatus");
const etaService = require("../services/etaService");

const loginOwner = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (runValidations(res, validateEmail(email), validatePassword(password)))
      return;

    const result = await pool.query(`SELECT * FROM owners WHERE email = $1`, [
      email.trim().toLowerCase(),
    ]);

    if (result.rows.length === 0) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }
    const owner = result.rows[0];
    const isMatch = await bcrypt.compare(password, owner.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }
    const token = jwt.sign(
      { ownerId: owner.id, role: "owner" },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );
    res.json({ success: true, token });
  } catch (error) {
    safeErrorResponse(res, error, "Owner");
  }
};

const createBus = async (req, res) => {
  try {
    const ownerId = req.owner.ownerId;
    let { bus_number, bus_type } = req.body;

    // Required fields
    if (!bus_number || !bus_type) {
      return res.status(400).json({
        success: false,
        message: "bus_number and bus_type are required",
      });
    }

    // Normalize registration number
    bus_number = bus_number.trim().toUpperCase().replace(/[\s-]/g, "");

    // Indian RTO Registration Number Validation
    const busNumberRegex = /^[A-Z]{2}[- ]?\d{1,2}[- ]?[A-Z]{1,3}[- ]?\d{4}$/;

    if (!busNumberRegex.test(bus_number)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid Indian vehicle registration number. Example: TN45AB1234",
      });
    }

    const result = await pool.query(
      `INSERT INTO buses (bus_number, bus_type, owner_id)
             VALUES ($1, $2, $3)
             RETURNING id, bus_number, bus_type, owner_id, driver_id, route_id, status, current_stop_order`,
      [bus_number, bus_type, ownerId],
    );

    res.status(201).json({
      success: true,
      bus: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Bus number already exists",
      });
    }

    safeErrorResponse(res, error, "Owner");
  }
};

const assignDriver = async (req, res) => {
  try {
    const ownerId = req.owner.ownerId;
    const { busId } = req.params;
    const { driver_id } = req.body;
    if (runValidations(res, validateId(busId, "Bus ID"))) return;
    if (!driver_id) {
      return res
        .status(400)
        .json({ success: false, message: "driver_id is required" });
    }
    if (runValidations(res, validateId(driver_id, "driver_id"))) return;
    const busCheck = await pool.query(
      `SELECT id FROM buses WHERE id = $1 AND owner_id = $2`,
      [busId, ownerId],
    );
    if (busCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Bus not found or does not belong to you",
      });
    }
    const driverCheck = await pool.query(
      `SELECT id FROM drivers WHERE id = $1`,
      [driver_id],
    );
    if (driverCheck.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });
    }

    // Guard: driver not already assigned to another owner's bus
    // Check whether the driver is already assigned to another bus
    // Exclude the current bus so assigning the same driver to the same bus again is allowed.
    const alreadyAssigned = await pool.query(
      `SELECT id, bus_number
   FROM buses
   WHERE driver_id = $1
     AND id <> $2`,
      [driver_id, busId],
    );

    if (alreadyAssigned.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Driver is already assigned to Bus ${alreadyAssigned.rows[0].bus_number}. Unassign the driver before assigning them to another bus.`,
      });
    }

    const result = await pool.query(
      `UPDATE buses SET driver_id = $1 WHERE id = $2
             RETURNING id, bus_number, bus_type, owner_id, driver_id, route_id, status, current_stop_order`,
      [driver_id, busId],
    );
    res.status(200).json({
      success: true,
      message: "Driver assigned successfully",
      bus: result.rows[0],
    });
  } catch (error) {
    safeErrorResponse(res, error, "Owner");
  }
};

const getMyBuses = async (req, res) => {
  try {
    const ownerId = req.owner.ownerId;
    const result = await pool.query(
      `SELECT
                b.id         AS bus_id,
                b.bus_number,
                b.bus_type,
                b.status,
                b.route_id,
                b.current_stop_order,
                d.id         AS driver_id,
                d.driver_name,
                d.phone,
                d.license_number,
                d.latitude,
                d.longitude
             FROM buses b
             LEFT JOIN drivers d ON b.driver_id = d.id
             WHERE b.owner_id = $1
             ORDER BY b.id`,
      [ownerId],
    );
    res.status(200).json({ success: true, buses: result.rows });
  } catch (error) {
    safeErrorResponse(res, error, "Owner");
  }
};
const updateBusStatus = async (req, res) => {
  try {
    const ownerId = req.owner.ownerId;
    const { busId } = req.params;
    const status = normalizeBusStatus(req.body.status);

    if (runValidations(res, validateId(busId, "Bus ID"))) return;

    const statusError = validateBusStatus(status);
    if (statusError) {
      return res.status(400).json({ success: false, message: statusError });
    }

    const busCheck = await pool.query(
      `SELECT id, bus_number, status, route_id
       FROM buses
       WHERE id = $1 AND owner_id = $2`,
      [busId, ownerId],
    );

    if (busCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Bus not found or does not belong to you",
      });
    }

    const bus = busCheck.rows[0];
    const statusChanged = bus.status !== status;

    const result = await pool.query(
      `UPDATE buses
       SET status = $1,
           current_speed_kmph = CASE WHEN $1 = 'ACTIVE' THEN current_speed_kmph ELSE NULL END
       WHERE id = $2 AND owner_id = $3
       RETURNING id, bus_number, bus_type, owner_id, driver_id, route_id, status, current_stop_order, current_speed_kmph`,
      [status, busId, ownerId],
    );

    if (status !== BUS_STATUSES.ACTIVE) {
      etaService.clearBusState(bus.id);
    }

    const updatedBus = result.rows[0];
    if (status !== BUS_STATUSES.ACTIVE && bus.route_id) {
      const waitingPassengers = await pool.query(
        `SELECT pw.id, pw.stop_id, s.stop_name
           FROM passenger_waiting pw
           JOIN stops s ON s.id = pw.stop_id
           WHERE pw.route_id = $1`,
        [bus.route_id],
      );
      if (waitingPassengers.rows.length > 0) {
        getIO()
          .to(`route:${bus.route_id}`)
          .emit("waiting:updated", {
            event: "waiting:updated",
            route_id: bus.route_id,
            bus_unavailable: true,
            bus_status: status,
            message: `Bus ${updatedBus.bus_number} is now ${status} — it will not reach remaining stops`,
            timestamp: new Date().toISOString(),
          });
      }
    }
    const payload = {
      event: "bus:status_updated",
      bus_id: updatedBus.id,
      bus_number: updatedBus.bus_number,
      route_id: updatedBus.route_id,
      status: updatedBus.status,
      bus_status: updatedBus.status,
      previous_status: bus.status,
      timestamp: new Date().toISOString(),
    };

    getIO().to(`owner:${ownerId}`).emit("bus:status_updated", payload);
    getIO().to("admin").emit("bus:status_updated", payload);
    if (updatedBus.route_id) {
      getIO()
        .to(`route:${updatedBus.route_id}`)
        .emit("bus:status_updated", payload);
    }

    res.status(200).json({
      success: true,
      message: statusChanged
        ? `Bus status changed from ${bus.status} to ${updatedBus.status}`
        : `Bus status is already ${updatedBus.status}`,
      bus: updatedBus,
    });
  } catch (error) {
    safeErrorResponse(res, error, "Owner");
  }
};
module.exports = {
  loginOwner,
  createBus,
  assignDriver,
  updateBusStatus,
  getMyBuses,
};
