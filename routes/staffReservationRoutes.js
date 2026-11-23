
const express = require("express");
const router = express.Router();

const {
    getStaffReservations
} = require("../controllers/staffReservationController");

const {
    protect,
    authorize
} = require("../middleware/authMiddleware");

// All routes require an authenticated staff account.
router.use(protect);
router.use(authorize("staff"));

// GET /api/staff/reservations
router.get("/", getStaffReservations);

module.exports = router;
