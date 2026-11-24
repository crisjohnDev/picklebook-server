
const Notification = require("../models/Notification");

// ==========================================
// GET NOTIFICATIONS
// ==========================================

const getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        const notifications = await Notification.find({
            $or: [
                { recipient: userId },
                { recipient: null, recipientRole: userRole },
                { recipient: null, recipientRole: "all" }
            ]
        })
            .sort({ createdAt: -1 })
            .limit(30)
            .lean();

        res.status(200).json({
            success: true,
            count: notifications.length,
            notifications
        });
    } catch (error) {
        console.error("Get notifications error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve notifications."
        });
    }
};

// ==========================================
// GET UNREAD COUNT
// ==========================================

const getUnreadCount = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        const unreadCount = await Notification.countDocuments({
            isRead: false,
            $or: [
                { recipient: userId },
                { recipient: null, recipientRole: userRole },
                { recipient: null, recipientRole: "all" }
            ]
        });

        res.status(200).json({
            success: true,
            unreadCount
        });
    } catch (error) {
        console.error("Unread notification count error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve unread count."
        });
    }
};

// ==========================================
// MARK ONE NOTIFICATION AS READ
// ==========================================

const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        const notification = await Notification.findOneAndUpdate(
            {
                _id: id,
                $or: [
                    { recipient: userId },
                    { recipient: null, recipientRole: userRole },
                    { recipient: null, recipientRole: "all" }
                ]
            },
            {
                isRead: true
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found."
            });
        }

        res.status(200).json({
            success: true,
            message: "Notification marked as read.",
            notification
        });
    } catch (error) {
        console.error("Mark notification as read error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update notification."
        });
    }
};

// ==========================================
// MARK ALL NOTIFICATIONS AS READ
// ==========================================

const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        await Notification.updateMany(
            {
                isRead: false,
                $or: [
                    { recipient: userId },
                    { recipient: null, recipientRole: userRole },
                    { recipient: null, recipientRole: "all" }
                ]
            },
            {
                $set: { isRead: true }
            }
        );

        res.status(200).json({
            success: true,
            message: "All notifications marked as read."
        });
    } catch (error) {
        console.error("Mark all notifications as read error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update notifications."
        });
    }
};

module.exports = {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead
};
