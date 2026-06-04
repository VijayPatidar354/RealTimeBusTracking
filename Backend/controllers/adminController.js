const pool   = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

// ── AUTH ──────────────────────────────────────────────────────────
const registerAdmin = async (req, res) => {
    try {
        const { admin_name, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO admins (admin_name, email, password)
             VALUES ($1, $2, $3)
             RETURNING id, admin_name, email`,
            [admin_name, email, hashedPassword]
        );
        res.status(201).json({ success: true, admin: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query(`SELECT * FROM admins WHERE email = $1`, [email]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }
        const admin   = result.rows[0];
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        const token = jwt.sign(
            { id: admin.id, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.status(200).json({
            success: true,
            token,
            admin: { id: admin.id, admin_name: admin.admin_name, email: admin.email }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ================================================================
//  SYSTEM STATS
//  GET /api/admin/stats
//  Returns platform-wide counts in a single query for stat cards.
// ================================================================
const getSystemStats = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                (SELECT COUNT(*)::INTEGER FROM buses)                           AS total_buses,
                (SELECT COUNT(*)::INTEGER FROM buses WHERE driver_id IS NOT NULL
                    AND id IN (SELECT DISTINCT bus_id FROM (
                        SELECT b.id AS bus_id FROM buses b
                        JOIN drivers d ON b.driver_id = d.id
                        WHERE d.latitude IS NOT NULL
                    ) sub))                                                     AS live_buses,
                (SELECT COUNT(*)::INTEGER FROM drivers)                         AS total_drivers,
                (SELECT COUNT(*)::INTEGER FROM routes)                          AS total_routes,
                (SELECT COUNT(*)::INTEGER FROM passengers)                      AS total_passengers,
                (SELECT COUNT(*)::INTEGER FROM owners)                          AS total_owners,
                (SELECT COUNT(*)::INTEGER FROM passenger_waiting)               AS active_waiting,
                (SELECT COUNT(*)::INTEGER FROM buses WHERE driver_id IS NULL)   AS idle_buses
        `);
        res.status(200).json({ success: true, stats: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ================================================================
//  GET ALL BUSES (with live GPS + route + driver)
//  GET /api/admin/buses
//  Used for the live fleet map and buses tab.
// ================================================================
const getAllBuses = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                b.id          AS bus_id,
                b.bus_number,
                b.bus_type,
                b.current_stop_order,
                b.route_id,
                r.route_name,
                r.source,
                r.destination,
                d.id          AS driver_id,
                d.driver_name,
                d.phone       AS driver_phone,
                d.latitude,
                d.longitude,
                o.id          AS owner_id,
                o.owner_name
            FROM buses b
            LEFT JOIN routes  r ON b.route_id  = r.id
            LEFT JOIN drivers d ON b.driver_id  = d.id
            LEFT JOIN owners  o ON b.owner_id   = o.id
            ORDER BY b.id ASC
        `);
        res.status(200).json({ success: true, total: result.rows.length, buses: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ================================================================
//  GET ALL DRIVERS
//  GET /api/admin/drivers
// ================================================================
const getAllDrivers = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                d.id,
                d.driver_name,
                d.phone,
                d.license_number,
                d.latitude,
                d.longitude,
                b.id          AS bus_id,
                b.bus_number,
                b.bus_type,
                r.id          AS route_id,
                r.route_name,
                r.source,
                r.destination
            FROM drivers d
            LEFT JOIN buses   b ON d.id = b.driver_id
            LEFT JOIN routes  r ON b.route_id = r.id
            ORDER BY d.id ASC
        `);
        res.status(200).json({ success: true, total: result.rows.length, drivers: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ================================================================
//  GET SINGLE DRIVER
//  GET /api/admin/drivers/:id
// ================================================================
const getSingleDriver = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT
                d.id, d.driver_name, d.phone, d.license_number,
                d.latitude, d.longitude,
                b.id AS bus_id, b.bus_number, b.bus_type, b.current_stop_order,
                r.id AS route_id, r.route_name, r.source, r.destination
            FROM drivers d
            LEFT JOIN buses  b ON d.id = b.driver_id
            LEFT JOIN routes r ON b.route_id = r.id
            WHERE d.id = $1
        `, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }
        res.status(200).json({ success: true, driver: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ================================================================
//  GET ALL OWNERS
//  GET /api/admin/owners
// ================================================================
const getAllOwners = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                o.id,
                o.owner_name,
                o.email,
                COUNT(DISTINCT b.id)::INTEGER AS total_buses,
                COUNT(DISTINCT r.id)::INTEGER AS total_routes
            FROM owners o
            LEFT JOIN buses  b ON b.owner_id  = o.id
            LEFT JOIN routes r ON r.owner_id  = o.id
            GROUP BY o.id
            ORDER BY o.id ASC
        `);
        res.status(200).json({ success: true, total: result.rows.length, owners: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ================================================================
//  GET WAITING OVERVIEW
//  GET /api/admin/waiting
//  Returns waiting count grouped by route+stop for admin overview.
// ================================================================
const getWaitingOverview = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                r.id          AS route_id,
                r.route_name,
                r.source,
                r.destination,
                s.id          AS stop_id,
                s.stop_name,
                s.stop_order,
                COUNT(pw.id)::INTEGER AS waiting_count
            FROM passenger_waiting pw
            JOIN stops  s ON pw.stop_id  = s.id
            JOIN routes r ON pw.route_id = r.id
            GROUP BY r.id, r.route_name, r.source, r.destination,
                     s.id, s.stop_name, s.stop_order
            HAVING COUNT(pw.id) > 0
            ORDER BY waiting_count DESC, r.id, s.stop_order
        `);
        res.status(200).json({ success: true, total: result.rows.length, waiting: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    registerAdmin,
    loginAdmin,
    getSystemStats,
    getAllBuses,
    getAllDrivers,
    getSingleDriver,
    getAllOwners,
    getWaitingOverview,
};
