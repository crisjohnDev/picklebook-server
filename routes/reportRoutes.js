
const express = require("express");
const router = express.Router();

// Import report controller
const { getReports } = require("../controllers/reportController");

// Import authentication middleware
const {
    protect,
    authorize
} = require("../middleware/authMiddleware");

// ==========================================
// REPORT ROUTES
// ==========================================

// All report routes require an authenticated admin.
router.use(protect, authorize("admin"));

// Prevent browser and proxy caching.
// This helps ensure reports are requested fresh.
router.use((req, res, next) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    next();
});

// GET /api/reports
// Retrieve dashboard reports.
router.get("/", getReports);

module.exports = router;
