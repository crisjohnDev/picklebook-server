
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ==========================================
// PROTECT ROUTES
// Verify JWT and identify logged-in user
// ==========================================

const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        // Check authorization header
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Authentication required. Please log in."
            });
        }

        // Extract JWT token
        const token = authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Authentication token is missing."
            });
        }

        // Verify token
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        if (!decoded.id) {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication token."
            });
        }

        // Find user in database
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Account not found."
            });
        }

        // Check account status
        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: "Your account is inactive."
            });
        }

        // Attach user to request
        req.user = user;

        // Authentication log
        console.log("\n========== AUTHENTICATED USER ==========");
        console.log({
            id: user._id,
            username: user.username,
            role: user.role,
            isActive: user.isActive
        });
        console.log("========================================\n");

        next();

    } catch (error) {
        console.error("Authentication error:", error.message);

        return res.status(401).json({
            success: false,
            message: "Invalid or expired token."
        });
    }
};


// ==========================================
// ROLE AUTHORIZATION
// Check whether user has permission
// ==========================================

const authorize = (...roles) => {
    return (req, res, next) => {

        // Check authentication
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        // Check user role
        if (!roles.includes(req.user.role)) {

            // Detailed debugging
            console.log("\n========== AUTHORIZATION DENIED ==========");
            console.log({
                method: req.method,
                url: req.originalUrl,
                username: req.user.username,
                userRole: req.user.role,
                allowedRoles: roles
            });
            console.log("===========================================\n");

            return res.status(403).json({
                success: false,
                message: "Access denied. You do not have permission to access this resource."
            });
        }

        // Authorization successful
        console.log("Authorization successful:", {
            username: req.user.username,
            role: req.user.role,
            url: req.originalUrl
        });

        next();
    };
};


// ==========================================
// EXPORT MIDDLEWARE
// ==========================================

module.exports = {
    protect,
    authorize
};
