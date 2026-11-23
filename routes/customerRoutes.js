
const express = require("express");
const router = express.Router();

const {
    getCustomers,
    getCustomerById,
    updateCustomerStatus
} = require("../controllers/customerController");

const {
    protect,
    authorize
} = require("../middleware/authMiddleware");

// ADMIN ONLY
router.use(protect, authorize("admin"));

// GET all customers
// GET /api/customers
router.get("/", getCustomers);

// GET customer profile and booking history
// GET /api/customers/:id
router.get("/:id", getCustomerById);

// ACTIVATE / DEACTIVATE customer
// PATCH /api/customers/:id/status
router.patch("/:id/status", updateCustomerStatus);

module.exports = router;
