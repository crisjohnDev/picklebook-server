
const ActivityLog = require("../models/ActivityLog");
const Notification = require("../models/Notification");

// ==========================================
// ACTIVITY LOGGER
// ==========================================

const logActivity = async ({
    actor = null,
    actorName = null,
    actorRole = "system",

    action,
    description,
    category = "system",

    relatedId = null,
    relatedModel = null,

    metadata = {},

    // Notification settings
    notificationTitle = null,
    notificationMessage = null,
    recipient = null,
    recipientRole = "admin",
    link = null
}) => {
    try {
        // Get actor information
        const actorId = actor?._id || actor?.id || null;

        const resolvedActorName =
            actorName ||
            actor?.fullName ||
            actor?.username ||
            actor?.name ||
            "System";

        const resolvedActorRole =
            actor?.role || actorRole || "system";

        // ======================================
        // SAVE ACTIVITY LOG
        // ======================================

        const activity = await ActivityLog.create({
            actor: actorId,
            actorName: resolvedActorName,
            actorRole: resolvedActorRole,

            action,
            description,
            category,

            relatedId,
            relatedModel,

            metadata
        });

        // ======================================
        // CREATE NOTIFICATION
        // ======================================

        if (notificationTitle && notificationMessage) {
            try {
                await Notification.create({
                    recipient,
                    recipientRole,

                    title: notificationTitle,
                    message: notificationMessage,

                    type: category,

                    relatedId,
                    relatedModel,

                    link,

                    isRead: false
                });
            } catch (notificationError) {
                console.error(
                    "Notification creation failed:",
                    notificationError
                );
            }
        }

        return activity;

    } catch (error) {
        console.error("Activity logging failed:", error);

        // Do not interrupt the main business operation
        return null;
    }
};

module.exports = logActivity;
