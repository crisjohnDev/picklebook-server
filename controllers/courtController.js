
const Court = require("../models/Court");

// @desc    Get all courts
// @route   GET /api/courts
// @access  Admin, Staff
const getCourts = async (req, res) => {
    try {
        const { search, status, type } = req.query;

        const filter = {};

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { courtNumber: { $regex: search, $options: "i" } }
            ];
        }

        if (status === "active") filter.isActive = true;
        if (status === "inactive") filter.isActive = false;

        if (type && ["indoor", "outdoor"].includes(type)) {
            filter.courtType = type;
        }

        const courts = await Court.find(filter).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: courts.length,
            courts
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to retrieve courts",
            error: error.message
        });
    }
};

// @desc    Get one court
// @route   GET /api/courts/:id
// @access  Admin, Staff
const getCourtById = async (req, res) => {
    try {
        const court = await Court.findById(req.params.id);

        if (!court) {
            return res.status(404).json({
                success: false,
                message: "Court not found"
            });
        }

        res.status(200).json({
            success: true,
            court
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: "Invalid court ID"
        });
    }
};

// @desc    Create a court
// @route   POST /api/courts
// @access  Admin
const createCourt = async (req, res) => {
    try {
        const {
            name,
            courtNumber,
            description,
            courtType,
            surfaceType,
            hourlyRate
        } = req.body;

        if (!name || !courtNumber || hourlyRate === undefined) {
            return res.status(400).json({
                success: false,
                message: "Name, court number, and hourly rate are required"
            });
        }

        const parsedRate = Number(hourlyRate);

        if (!Number.isFinite(parsedRate) || parsedRate < 0) {
            return res.status(400).json({
                success: false,
                message: "Hourly rate must be a valid non-negative number"
            });
        }

        const existingCourt = await Court.findOne({
            courtNumber: courtNumber.trim().toUpperCase()
        });

        if (existingCourt) {
            return res.status(409).json({
                success: false,
                message: "Court number already exists"
            });
        }

        const court = await Court.create({
            name,
            courtNumber,
            description,
            courtType,
            surfaceType,
            hourlyRate: parsedRate
        });

        res.status(201).json({
            success: true,
            message: "Court created successfully",
            court
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Update a court
// @route   PUT /api/courts/:id
// @access  Admin
const updateCourt = async (req, res) => {
    try {
        const allowedFields = [
            "name",
            "courtNumber",
            "description",
            "courtType",
            "surfaceType",
            "hourlyRate"
        ];

        const updates = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        if (updates.hourlyRate !== undefined) {
            updates.hourlyRate = Number(updates.hourlyRate);

            if (!Number.isFinite(updates.hourlyRate) || updates.hourlyRate < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Hourly rate must be a valid non-negative number"
                });
            }
        }

        if (updates.courtNumber) {
            updates.courtNumber = updates.courtNumber.trim().toUpperCase();

            const duplicate = await Court.findOne({
                courtNumber: updates.courtNumber,
                _id: { $ne: req.params.id }
            });

            if (duplicate) {
                return res.status(409).json({
                    success: false,
                    message: "Court number already exists"
                });
            }
        }

        const court = await Court.findByIdAndUpdate(
            req.params.id,
            updates,
            {
                new: true,
                runValidators: true
            }
        );

        if (!court) {
            return res.status(404).json({
                success: false,
                message: "Court not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Court updated successfully",
            court
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Activate or deactivate a court
// @route   PATCH /api/courts/:id/status
// @access  Admin
const updateCourtStatus = async (req, res) => {
    try {
        const { isActive } = req.body;

        if (typeof isActive !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "isActive must be true or false"
            });
        }

        const court = await Court.findByIdAndUpdate(
            req.params.id,
            { isActive },
            { new: true, runValidators: true }
        );

        if (!court) {
            return res.status(404).json({
                success: false,
                message: "Court not found"
            });
        }

        res.status(200).json({
            success: true,
            message: `Court ${isActive ? "activated" : "deactivated"} successfully`,
            court
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: "Unable to update court status"
        });
    }
};

module.exports = {
    getCourts,
    getCourtById,
    createCourt,
    updateCourt,
    updateCourtStatus
};
