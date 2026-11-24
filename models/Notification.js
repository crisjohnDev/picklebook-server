const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        recipientRole: {
            type: String,
            enum: ["admin", "staff", "customer", "all"],
            default: "admin"
        },

        title: {
            type: String,
            required: true,
            trim: true
        },

        message: {
            type: String,
            required: true,
            trim: true
        },

        type: {
            type: String,
            enum: [
                "reservation",
                "payment",
                "customer",
                "court",
                "schedule",
                "user",
                "system"
            ],
            default: "system"
        },

        relatedId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },

        relatedModel: {
            type: String,
            enum: [
                "Reservation",
                "Payment",
                "User",
                "Court",
                "SystemSetting"
            ],
            default: null
        },

        link: {
            type: String,
            default: null
        },

        isRead: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientRole: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);