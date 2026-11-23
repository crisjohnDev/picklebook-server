
const express = require("express");
const router = express.Router();

// ==========================================
// PAYMENT CONTROLLER
// ==========================================

const {
    getPayments,
    getPaymentById,
    createPayment,
    updatePaymentStatus
} = require("../controllers/paymentController");

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================

const {
    protect,
    authorize
} = require("../middleware/authMiddleware");

// ==========================================
// AUTHENTICATION & AUTHORIZATION
// Admin and Staff can access payment management
// ==========================================

router.use(protect);
router.use(authorize("admin", "staff"));

// ==========================================
// PAYMENT ROUTES
// ==========================================

// GET: Retrieve all payments
router.get("/", getPayments);

// GET: Retrieve a specific payment
router.get("/:id", getPaymentById);

// POST: Create a payment
router.post("/", createPayment);

// PATCH: Update payment status
router.patch("/:id/status", updatePaymentStatus);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
