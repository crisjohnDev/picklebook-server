
const express = require("express");
const router = express.Router();

const {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    changeUserPassword,
    updateUserStatus
} = require("../controllers/userManagementController");

const {
    protect,
    authorize
} = require("../middleware/authMiddleware");

// All user-management routes require an authenticated admin
router.use(protect, authorize("admin"));

// GET /api/admin/users
router.get("/", getUsers);

// POST /api/admin/users
router.post("/", createUser);

// GET /api/admin/users/:id
router.get("/:id", getUserById);

// PUT /api/admin/users/:id
router.put("/:id", updateUser);

// PATCH /api/admin/users/:id/password
router.patch("/:id/password", changeUserPassword);

// PATCH /api/admin/users/:id/status
router.patch("/:id/status", updateUserStatus);

module.exports = router;
