
const mongoose = require("mongoose");

const operatingHourSchema = new mongoose.Schema(
    {
        day: {
            type: String,
            enum: [
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday"
            ],
            required: true
        },
        isOpen: {
            type: Boolean,
            default: true
        },
        openingTime: {
            type: String,
            default: "08:00",
            match: /^([01]\d|2[0-3]):([0-5]\d)$/
        },
        closingTime: {
            type: String,
            default: "22:00",
            match: /^([01]\d|2[0-3]):([0-5]\d)$/
        }
    },
    { _id: false }
);

const peakHourSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            trim: true,
            maxlength: 50,
            default: "Peak Hours"
        },
        startTime: {
            type: String,
            required: true,
            match: /^([01]\d|2[0-3]):([0-5]\d)$/
        },
        endTime: {
            type: String,
            required: true,
            match: /^([01]\d|2[0-3]):([0-5]\d)$/
        },
        hourlyRate: {
            type: Number,
            required: true,
            min: 0
        },
        isActive: {
            type: Boolean,
            default: true
        }
    },
    { _id: false }
);

const systemSettingSchema = new mongoose.Schema(
    {
        settingKey: {
            type: String,
            default: "picklebook",
            unique: true,
            immutable: true
        },

        operatingHours: {
            type: [operatingHourSchema],
            default: [
                { day: "Monday", isOpen: true, openingTime: "08:00", closingTime: "22:00" },
                { day: "Tuesday", isOpen: true, openingTime: "08:00", closingTime: "22:00" },
                { day: "Wednesday", isOpen: true, openingTime: "08:00", closingTime: "22:00" },
                { day: "Thursday", isOpen: true, openingTime: "08:00", closingTime: "22:00" },
                { day: "Friday", isOpen: true, openingTime: "08:00", closingTime: "22:00" },
                { day: "Saturday", isOpen: true, openingTime: "08:00", closingTime: "22:00" },
                { day: "Sunday", isOpen: true, openingTime: "08:00", closingTime: "22:00" }
            ]
        },

        pricing: {
            currency: {
                type: String,
                default: "PHP",
                enum: ["PHP"]
            },
            defaultHourlyRate: {
                type: Number,
                default: 300,
                min: 0
            },
            peakHours: {
                type: [peakHourSchema],
                default: []
            }
        },

        bookingRules: {
            minAdvanceHours: {
                type: Number,
                default: 0,
                min: 0,
                max: 8760
            },
            maxAdvanceDays: {
                type: Number,
                default: 30,
                min: 1,
                max: 365
            },
            minDurationMinutes: {
                type: Number,
                default: 60,
                enum: [30, 60, 90, 120]
            },
            maxDurationMinutes: {
                type: Number,
                default: 240,
                min: 30,
                max: 720
            },
            cancellationCutoffHours: {
                type: Number,
                default: 24,
                min: 0,
                max: 720
            },
            allowSameDayBookings: {
                type: Boolean,
                default: true
            }
        },

        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        }
    },
    { timestamps: true }
);

systemSettingSchema.pre("validate", function () {
    const days = this.operatingHours.map((item) => item.day);

    if (new Set(days).size !== 7 || days.length !== 7) {
        this.invalidate(
            "operatingHours",
            "Operating hours must contain exactly one entry for each day."
        );
    }

    for (const item of this.operatingHours) {
        if (!item.isOpen) continue;

        const [openHour, openMinute] = item.openingTime.split(":").map(Number);
        const [closeHour, closeMinute] = item.closingTime.split(":").map(Number);

        if (closeHour * 60 + closeMinute <= openHour * 60 + openMinute) {
            this.invalidate(
                "operatingHours",
                `Closing time must be later than opening time for ${item.day}.`
            );
        }
    }

    if (
        this.bookingRules &&
        this.bookingRules.maxDurationMinutes < this.bookingRules.minDurationMinutes
    ) {
        this.invalidate(
            "bookingRules.maxDurationMinutes",
            "Maximum booking duration must be at least the minimum duration."
        );
    }

    for (const peak of this.pricing.peakHours) {
        const [startHour, startMinute] = peak.startTime.split(":").map(Number);
        const [endHour, endMinute] = peak.endTime.split(":").map(Number);

        if (endHour * 60 + endMinute <= startHour * 60 + startMinute) {
            this.invalidate(
                "pricing.peakHours",
                `Peak-hour end time must be later than its start time (${peak.name}).`
            );
        }
    }
});

module.exports = mongoose.model("SystemSetting", systemSettingSchema);
