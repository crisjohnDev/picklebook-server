
const express = require("express");
const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
    getStaffPayments,
    createStaffPayment,
    getUnpaidReservations
} = require("../controllers/staffPaymentController");

// ==========================================
// MIDDLEWARE
// ==========================================

const {
    protect,
    authorize
} = require("../middleware/authMiddleware");

// ==========================================
// AUTHENTICATION
// All payment routes require login
// ==========================================

router.use(protect);

// ==========================================
// AUTHORIZATION
// Allow administrators and staff
// ==========================================

router.use(authorize("admin", "staff"));

// ==========================================
// PAYMENT ROUTES
// ==========================================

// Get reservations that still need payment
router.get(
    "/unpaid-reservations",
    getUnpaidReservations
);

// Get payment records
router.get(
    "/",
    getStaffPayments
);

// Record a new payment
router.post(
    "/",
    createStaffPayment
);

module.exports = router;
