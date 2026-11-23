
const express = require("express");
const router = express.Router();

// ==========================================
// AUTH CONTROLLERS
// ==========================================

const {
    registerUser,
    loginUser,
    getMe,
    updateProfile,
    changePassword
} = require("../controllers/authController");

// ==========================================
// AUTH MIDDLEWARE
// ==========================================

const {
    protect
} = require("../middleware/authMiddleware");

// ==========================================
// PUBLIC ROUTES
// ==========================================

// Register customer account
router.post("/register", registerUser);

// Login user
router.post("/login", loginUser);

// ==========================================
// PROTECTED ROUTES
// All routes below require authentication
// ==========================================

// Get current logged-in user
router.get("/me", protect, getMe);

// Update profile information
router.put("/profile", protect, updateProfile);

// Change account password
router.put("/change-password", protect, changePassword);

module.exports = router;
