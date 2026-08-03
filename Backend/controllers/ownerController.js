const pool   = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { getIO } = require('../socket');
const { validateEmail, validatePassword, validateName, safeErrorResponse } = require('../utils/validators');
const { runValidations } = require('../utils/runValidations');

const loginOwner = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (runValidations(res, validateEmail(email), validatePassword(password))) return;

        const result = await pool.query(`SELECT * FROM owners WHERE email = $1`, [email.trim().toLowerCase()]);

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        const owner   = result.rows[0];
        const isMatch = await bcrypt.compare(password, owner.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        const token = jwt.sign({ ownerId: owner.id, role: 'owner' }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token });
    } catch (error) {
        safeErrorResponse(res, error, 'Owner');
    }
};

const createBus = async (req, res) => {
    try {
        const ownerId              = req.owner.ownerId;
        const { bus_number, bus_type } = req.body;
        if (!bus_number || !bus_type) {
            return res.status(400).json({ success: false, message: "bus_number and bus_type are required" });
        }
        const result = await pool.query(
            `INSERT INTO buses (bus_number, bus_type, owner_id) VALUES ($1, $2, $3)
             RETURNING id, bus_number, bus_type, owner_id, driver_id`,
            [bus_number, bus_type, ownerId]
        );
        res.status(201).json({ success: true, bus: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ success: false, message: "Bus number already exists" });
        }
        safeErrorResponse(res, error, 'Owner');
    }
};

const assignDriver = async (req, res) => {
    try {
        const ownerId          = req.owner.ownerId;
        const { busId }        = req.params;
        const { driver_id }    = req.body;
        if (!driver_id) {
            return res.status(400).json({ success: false, message: "driver_id is required" });
        }
        const busCheck = await pool.query(`SELECT id FROM buses WHERE id = $1 AND owner_id = $2`, [busId, ownerId]);
        if (busCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Bus not found or does not belong to you" });
        }
        const driverCheck = await pool.query(`SELECT id FROM drivers WHERE id = $1`, [driver_id]);
        if (driverCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Driver not found" });
        }

        // Guard: driver not already assigned to another owner's bus
        const alreadyAssigned = await pool.query(
            `SELECT b.id, b.bus_number, o.owner_name
             FROM buses b JOIN owners o ON b.owner_id = o.id
             WHERE b.driver_id = $1 AND b.owner_id != $2`,
            [driver_id, ownerId]
        );
        if (alreadyAssigned.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: `Driver is already assigned to another owner's bus`
            });
        }

        const result = await pool.query(
            `UPDATE buses SET driver_id = $1 WHERE id = $2
             RETURNING id, bus_number, bus_type, owner_id, driver_id`,
            [driver_id, busId]
        );
        res.status(200).json({ success: true, message: "Driver assigned successfully", bus: result.rows[0] });
    } catch (error) {
        safeErrorResponse(res, error, 'Owner');
    }
};

const getMyBuses = async (req, res) => {
    try {
        const ownerId = req.owner.ownerId;
        const result  = await pool.query(
            `SELECT
                b.id         AS bus_id,
                b.bus_number,
                b.bus_type,
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
            [ownerId]
        );
        res.status(200).json({ success: true, buses: result.rows });
    } catch (error) {
        safeErrorResponse(res, error, 'Owner');
    }
};
module.exports = {
    loginOwner,
    createBus, assignDriver, getMyBuses
};
