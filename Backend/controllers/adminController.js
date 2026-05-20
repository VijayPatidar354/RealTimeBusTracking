const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// REGISTER ADMIN
const registerAdmin = async (req, res) => {
    try {
        const {
            admin_name,
            email,
            password
        } = req.body;
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `
            INSERT INTO admins
            (admin_name, email, password)
            VALUES ($1, $2, $3)
            RETURNING id, admin_name, email
            `,
            [admin_name, email, hashedPassword]
        );
        res.status(201).json({
            success: true,
            admin: result.rows[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
// LOGIN ADMIN
const loginAdmin = async (req, res) => {
    try {
        const {
            email,
            password
        } = req.body;

        const result = await pool.query(
            `
            SELECT * FROM admins
            WHERE email = $1
            `,
            [email]
        );
        // Admin not found
        if (result.rows.length === 0) {

            return res.status(404).json({
                success: false,
                message: "Admin not found"
            });
        }
        const admin = result.rows[0];
        // Compare passwords
        const isMatch = await bcrypt.compare(
            password,
            admin.password
        );
        if (!isMatch) {

            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });

        }
        // Generate JWT
        const token = jwt.sign(
            {
                id: admin.id,
                role: "admin"
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );
        res.status(200).json({
            success: true,
            token
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
// GET ALL DRIVERS
const getAllDrivers = async (req, res) => {

    try {

        const result = await pool.query(
            `
            SELECT 
                d.id,
                d.driver_name,
                d.phone,
                d.license_number,

                b.bus_number,
                b.bus_type

            FROM drivers d

            LEFT JOIN buses b
            ON d.id = b.driver_id
            `
        );

        res.status(200).json({
            success: true,
            drivers: result.rows
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};
// GET SINGLE DRIVER
const getSingleDriver = async (req, res) => {

    try {
        const { id } = req.params;
        const result = await pool.query(
            `
            SELECT 
                d.id,
                d.driver_name,
                d.phone,
                d.license_number,

                b.bus_number,
                b.bus_type

            FROM drivers d

            LEFT JOIN buses b
            ON d.id = b.driver_id

            WHERE d.id = $1
            `,
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }
        res.status(200).json({
            success: true,
            driver: result.rows[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
module.exports = {
    registerAdmin,
    loginAdmin,
    getAllDrivers,
    getSingleDriver
};