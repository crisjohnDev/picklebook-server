
const express = require("express");
const router = express.Router();

const {
    getDashboard,
    getStaffDashboard
} = require("../controllers/dashboardController");

const {
    protect,
    authorize
} = require("../middleware/authMiddleware");

// All dashboard endpoints require authentication.
router.use(protect);

// Admin dashboard
router.get(
    "/",
    authorize("admin"),
    getDashboard
);

// Staff dashboard
router.get(
    "/staff",
    authorize("staff"),
    getStaffDashboard
);

module.exports = router;
