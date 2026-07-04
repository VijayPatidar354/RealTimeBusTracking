const jwt = require('jsonwebtoken');

const verifyDriver = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        // Check if token exists
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "No token provided"
            });
        }

        // Extract token from "Bearer <token>"
        const token   = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // ── Role guard ───────────────────────────────────────────
        // Only tokens issued by loginDriver carry role === 'driver'.
        // Passenger / owner / admin tokens must never pass this gate.
        if (!decoded.id || decoded.role !== 'driver') {
            return res.status(403).json({
                success: false,
                message: "Access denied: driver token required"
            });
        }

        // Attach driver info to request
        req.driver = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
        });
    }
};

module.exports = verifyDriver;