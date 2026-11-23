
const express = require("express");
const router = express.Router();

const {
    getStaffCustomers,
    getStaffCustomerProfile
} = require("../controllers/staffCustomerController");

const {
    protect,
    authorize
} = require("../middleware/authMiddleware");

// All customer routes require an authenticated staff account.
router.use(protect);
router.use(authorize("staff"));

// GET /api/staff/customers
router.get("/", getStaffCustomers);

// GET /api/staff/customers/:id
router.get("/:id", getStaffCustomerProfile);

module.exports = router;
