
const SystemSetting = require("../models/SystemSetting");

const getOrCreateSettings = async () => {
    let settings = await SystemSetting.findOne({ settingKey: "picklebook" });

    if (!settings) {
        settings = await SystemSetting.create({
            settingKey: "picklebook"
        });
    }

    return settings;
};

// GET /api/settings
const getSettings = async (req, res) => {
    try {
        const settings = await getOrCreateSettings();

        res.status(200).json({
            success: true,
            settings
        });
    } catch (error) {
        console.error("Get Settings Error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve settings."
        });
    }
};

// PUT /api/settings
const updateSettings = async (req, res) => {
    try {
        const { operatingHours, pricing, bookingRules } = req.body;

        if (
            operatingHours === undefined &&
            pricing === undefined &&
            bookingRules === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: "No settings were provided."
            });
        }

        const settings = await getOrCreateSettings();

        if (operatingHours !== undefined) {
            if (!Array.isArray(operatingHours) || operatingHours.length !== 7) {
                return res.status(400).json({
                    success: false,
                    message: "Operating hours must contain all seven days."
                });
            }

            settings.operatingHours = operatingHours;
        }

        if (pricing !== undefined) {
            if (
                !pricing ||
                typeof pricing !== "object" ||
                !Number.isFinite(Number(pricing.defaultHourlyRate)) ||
                Number(pricing.defaultHourlyRate) < 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide a valid default hourly rate."
                });
            }

            settings.pricing = {
                currency: pricing.currency || "PHP",
                defaultHourlyRate: Number(pricing.defaultHourlyRate),
                peakHours: Array.isArray(pricing.peakHours)
                    ? pricing.peakHours.map((peak) => ({
                        name: peak.name,
                        startTime: peak.startTime,
                        endTime: peak.endTime,
                        hourlyRate: Number(peak.hourlyRate),
                        isActive: peak.isActive !== false
                    }))
                    : []
            };
        }

        if (bookingRules !== undefined) {
            settings.bookingRules = {
                minAdvanceHours: Number(bookingRules.minAdvanceHours),
                maxAdvanceDays: Number(bookingRules.maxAdvanceDays),
                minDurationMinutes: Number(bookingRules.minDurationMinutes),
                maxDurationMinutes: Number(bookingRules.maxDurationMinutes),
                cancellationCutoffHours: Number(bookingRules.cancellationCutoffHours),
                allowSameDayBookings: Boolean(bookingRules.allowSameDayBookings)
            };
        }

        settings.updatedBy = req.user._id;

        await settings.save();

        res.status(200).json({
            success: true,
            message: "Settings updated successfully.",
            settings
        });
    } catch (error) {
        console.error("Update Settings Error:", error);

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to update settings."
        });
    }
};

module.exports = {
    getSettings,
    updateSettings
};
