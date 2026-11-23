
const express = require("express");
const router = express.Router();

const {
    createAdminUser,
    getAdminUsers
} = require("../controllers/adminController");

const {
    protect,
    authorize
} = require("../middleware/authMiddleware");

// All routes require an authenticated admin
router.use(protect, authorize("admin"));

// Create admin or staff account
router.post("/users", createAdminUser);

// Retrieve all users
router.get("/users", getAdminUsers);

module.exports = router;
