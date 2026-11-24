
const express = require("express");
const router = express.Router();

const {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead
} = require("../controllers/notificationController");

const {
    protect,
    authorize
} = require("../middleware/authMiddleware");

// All notification routes require authentication.
router.use(protect);

// Only admin and staff can access these notifications.
router.use(authorize("admin", "staff"));

// GET /api/notifications
router.get("/", getNotifications);

// GET /api/notifications/unread-count
router.get("/unread-count", getUnreadCount);

// PATCH /api/notifications/read-all
router.patch("/read-all", markAllAsRead);

// PATCH /api/notifications/:id/read
router.patch("/:id/read", markAsRead);

module.exports = router;
