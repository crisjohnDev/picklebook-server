
const express = require("express");
const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
    getReservations,
    getReservationById,
    createReservation,
    updateReservation,
    updateReservationStatus
} = require("../controllers/reservationController");

const {
    createWalkInReservation
} = require("../controllers/walkInReservationController");

const {
    getSchedule
} = require("../controllers/scheduleController");

// ==========================================
// MIDDLEWARE
// ==========================================

const {
    protect,
    authorize
} = require("../middleware/authMiddleware");

// ==========================================
// AUTHENTICATION
// All routes require a logged-in user.
// ==========================================

router.use(protect);

// ==========================================
// CALENDAR AND AVAILABILITY
// Admin and staff can view schedules.
// ==========================================

// GET /api/reservations/schedule
router.get(
    "/schedule",
    authorize("admin", "staff"),
    getSchedule
);

// ==========================================
// WALK-IN CUSTOMER BOOKING
// Admin and staff can create walk-in bookings.
// ==========================================

// POST /api/reservations/walk-in
router.post(
    "/walk-in",
    authorize("admin", "staff"),
    createWalkInReservation
);

// ==========================================
// RESERVATION MANAGEMENT
// Admin only.
// ==========================================

// GET /api/reservations
router.get(
    "/",
    authorize("admin"),
    getReservations
);

// GET /api/reservations/:id
router.get(
    "/:id",
    authorize("admin"),
    getReservationById
);

// POST /api/reservations
router.post(
    "/",
    authorize("admin"),
    createReservation
);

// PUT /api/reservations/:id
router.put(
    "/:id",
    authorize("admin"),
    updateReservation
);

// PATCH /api/reservations/:id/status
router.patch(
    "/:id/status",
    authorize("admin"),
    updateReservationStatus
);

module.exports = router;
