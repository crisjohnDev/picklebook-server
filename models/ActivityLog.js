
const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
    {
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        actorName: {
            type: String,
            default: "System",
            trim: true
        },

        actorRole: {
            type: String,
            enum: ["admin", "staff", "customer", "system"],
            default: "system"
        },

        action: {
            type: String,
            required: true,
            trim: true
        },

        description: {
            type: String,
            required: true,
            trim: true
        },

        category: {
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

        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },
    {
        timestamps: true
    }
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ actor: 1, createdAt: -1 });
activityLogSchema.index({ category: 1, createdAt: -1 });

module.exports = mongoose.model("ActivityLog", activityLogSchema);
