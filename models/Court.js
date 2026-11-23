
const mongoose = require("mongoose");

const courtSchema = new mongoose.Schema(
    {
        // Basic Court Information
        name: {
            type: String,
            required: [true, "Court name is required"],
            trim: true,
            maxlength: 100
        },

        courtNumber: {
            type: String,
            required: [true, "Court number is required"],
            unique: true,
            trim: true,
            uppercase: true
        },

        description: {
            type: String,
            trim: true,
            default: ""
        },

        // Court Classification
        courtType: {
            type: String,
            enum: ["indoor", "outdoor"],
            required: true,
            default: "outdoor"
        },

        surfaceType: {
            type: String,
            trim: true,
            default: ""
        },

        // Court Pricing
        hourlyRate: {
            type: Number,
            required: [true, "Hourly rate is required"],
            min: [0, "Hourly rate cannot be negative"]
        },

        // Court Operating Hours
        openingTime: {
            type: String,
            required: true,
            default: "08:00",
            match: [
                /^([01]\d|2[0-3]):([0-5]\d)$/,
                "Invalid opening time. Use HH:mm format."
            ]
        },

        closingTime: {
            type: String,
            required: true,
            default: "22:00",
            match: [
                /^([01]\d|2[0-3]):([0-5]\d)$/,
                "Invalid closing time. Use HH:mm format."
            ]
        },

        // Scheduling Slot Duration
        slotDurationMinutes: {
            type: Number,
            required: true,
            default: 60,
            min: [30, "Minimum slot duration is 30 minutes"],
            max: [240, "Maximum slot duration is 240 minutes"],
            enum: [30, 60, 90, 120, 180, 240]
        },

        // Court Availability
        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

// Validate operating hours
courtSchema.pre("validate", function () {
    if (this.openingTime && this.closingTime) {
        const [openHour, openMinute] = this.openingTime.split(":").map(Number);
        const [closeHour, closeMinute] = this.closingTime.split(":").map(Number);

        const openingMinutes = openHour * 60 + openMinute;
        const closingMinutes = closeHour * 60 + closeMinute;

        if (closingMinutes <= openingMinutes) {
            this.invalidate(
                "closingTime",
                "Closing time must be later than opening time."
            );
        }
    }
});

// Indexes
courtSchema.index({ isActive: 1 });
courtSchema.index({ courtType: 1 });

module.exports = mongoose.model("Court", courtSchema);
