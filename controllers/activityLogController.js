
const ActivityLog = require("../models/ActivityLog");

// ==========================================
// GET ACTIVITY LOGS
// GET /api/activity-logs
// ADMIN ONLY
// ==========================================

const getActivities = async (req, res) => {
    try {
        // --------------------------------------
        // 1. PAGINATION
        // --------------------------------------

        const page = Math.max(
            1,
            parseInt(req.query.page, 10) || 1
        );

        const limit = Math.min(
            50,
            Math.max(
                1,
                parseInt(req.query.limit, 10) || 20
            )
        );

        const skip = (page - 1) * limit;

        // --------------------------------------
        // 2. FILTERS
        // --------------------------------------

        const filter = {};

        // Category filter
        const allowedCategories = [
            "reservation",
            "payment",
            "customer",
            "court",
            "schedule",
            "user",
            "system"
        ];

        if (req.query.category) {
            if (!allowedCategories.includes(req.query.category)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid activity category."
                });
            }

            filter.category = req.query.category;
        }

        // Search filter
        if (req.query.search?.trim()) {
            const search = req.query.search.trim();

            const escapedSearch = search.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );

            filter.$or = [
                {
                    actorName: {
                        $regex: escapedSearch,
                        $options: "i"
                    }
                },
                {
                    action: {
                        $regex: escapedSearch,
                        $options: "i"
                    }
                },
                {
                    description: {
                        $regex: escapedSearch,
                        $options: "i"
                    }
                }
            ];
        }

        // --------------------------------------
        // 3. DATE FILTER
        // --------------------------------------

        if (req.query.startDate || req.query.endDate) {
            filter.createdAt = {};

            if (req.query.startDate) {
                const startDate = new Date(req.query.startDate);

                if (Number.isNaN(startDate.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid start date."
                    });
                }

                filter.createdAt.$gte = startDate;
            }

            if (req.query.endDate) {
                const endDate = new Date(req.query.endDate);

                if (Number.isNaN(endDate.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid end date."
                    });
                }

                endDate.setHours(23, 59, 59, 999);

                filter.createdAt.$lte = endDate;
            }
        }

        // --------------------------------------
        // 4. FETCH ACTIVITY LOGS
        // --------------------------------------

        const [activities, total] = await Promise.all([
            ActivityLog.find(filter)
                .populate("actor", "fullName username role")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),

            ActivityLog.countDocuments(filter)
        ]);

        // --------------------------------------
        // 5. RESPONSE
        // --------------------------------------

        return res.status(200).json({
            success: true,
            activities,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error("Get Activities Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve activity logs.",
            error: process.env.NODE_ENV === "development"
                ? error.message
                : undefined
        });
    }
};

// ==========================================
// EXPORT CONTROLLER
// ==========================================

module.exports = {
    getActivities
};
