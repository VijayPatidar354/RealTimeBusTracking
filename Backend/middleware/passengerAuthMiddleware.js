const jwt = require('jsonwebtoken');

// Passenger token payload: { passengerId }  (set in loginPassenger)
const verifyPassenger = (req, res, next) => {
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

        if (!decoded.passengerId || decoded.role !== 'passenger') {
            return res.status(403).json({
                success: false,
                message: "Access denied: not a passenger token"
            });
        }

        req.passenger = decoded;   // { passengerId }
        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid token"
        });
    }
};

module.exports = verifyPassenger;
