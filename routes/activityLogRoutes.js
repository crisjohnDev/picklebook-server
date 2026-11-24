
const express = require("express");
const router = express.Router();

// Controllers
const {
    getActivities
} = require("../controllers/activityLogController");

// Middleware
const {
    protect,
    authorize
} = require("../middleware/authMiddleware");

// ==========================================
// ACTIVITY LOG ROUTES
// Base URL: /api/activity-logs
// ==========================================

// All routes require authentication and admin role
router.use(protect);
router.use(authorize("admin"));

// GET /api/activity-logs
router.get("/", getActivities);

module.exports = router;
