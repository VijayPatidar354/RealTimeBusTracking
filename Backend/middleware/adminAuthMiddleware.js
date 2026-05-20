const jwt = require('jsonwebtoken');

// Protects admin-only routes.
// Admin token payload: { id, role: "admin" }  (set in loginAdmin)
const verifyAdmin = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "No token provided"
            });
        }

        const token   = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded.id || decoded.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: "Access denied: admin only"
            });
        }

        req.admin = decoded;   // { id, role: "admin" }
        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid token"
        });
    }
};

module.exports = verifyAdmin;