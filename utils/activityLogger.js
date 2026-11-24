
const ActivityLog = require("../models/ActivityLog");
const Notification = require("../models/Notification");

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

    notificationTitle = null,
    notificationMessage = null,
    recipient = null,
    recipientRole = "admin",
    link = null
}) => {
    console.log("[ACTIVITY LOGGER] Called:", {
        action,
        category,
        relatedModel
    });

    try {
        const actorId = actor?._id || actor?.id || null;

        const resolvedActorName =
            actorName ||
            actor?.fullName ||
            actor?.username ||
            actor?.name ||
            "System";

        const resolvedActorRole =
            actor?.role || actorRole || "system";

        console.log("[ACTIVITY LOGGER] Saving activity...");

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

        console.log("[ACTIVITY LOGGER] SAVED:", {
            id: activity._id.toString(),
            action: activity.action,
            category: activity.category
        });

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

                console.log("[ACTIVITY LOGGER] Notification saved.");
            } catch (notificationError) {
                console.error(
                    "[ACTIVITY LOGGER] Notification failed:",
                    notificationError.message
                );
            }
        }

        return activity;

    } catch (error) {
        console.error("[ACTIVITY LOGGER] DATABASE SAVE FAILED:", {
            name: error.name,
            code: error.code,
            message: error.message,
            errors: error.errors
                ? Object.keys(error.errors)
                : undefined
        });

        return null;
    }
};

module.exports = logActivity;
