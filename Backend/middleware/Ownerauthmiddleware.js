const jwt = require('jsonwebtoken');

const verifyOwner = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        // Check if token exists
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "No token provided"
            });
        }

        // Extract token
        const token = authHeader.split(' ')[1];

        // Verify token
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // Owner token payload uses ownerId (see loginOwner)
        if (!decoded.ownerId || decoded.role !== 'owner') {
            return res.status(403).json({
                success: false,
                message: "Access denied: not an owner token"
            });
        }

        // Attach owner info to request
        req.owner = decoded;
        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid token"
        });
    }
};

module.exports = verifyOwner;