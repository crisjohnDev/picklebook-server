
const mongoose = require("mongoose");

const Reservation = require("../models/Reservation");

// ==========================================
// GET STAFF RESERVATIONS
// ==========================================

const getStaffReservations = async (req, res) => {
    try {
        const {
            search = "",
            status = "",
            paymentStatus = "",
            date = "",
            page = 1,
            limit = 10
        } = req.query;

        // Build reservation filters.
        const filter = {};

        if (status && status !== "All") {
            filter.status = status;
        }

        if (paymentStatus && paymentStatus !== "All") {
            filter.paymentStatus = paymentStatus;
        }

        // Filter reservations by a selected local calendar date.
        if (date) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid reservation date."
                });
            }

            const [year, month, day] = date.split("-").map(Number);
            const startDate = new Date(year, month - 1, day);
            const endDate = new Date(year, month - 1, day + 1);

            if (
                startDate.getFullYear() !== year ||
                startDate.getMonth() !== month - 1 ||
                startDate.getDate() !== day
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid reservation date."
                });
            }

            filter.reservationDate = {
                $gte: startDate,
                $lt: endDate
            };
        }

        // Escape special regular-expression characters.
        const safeSearch = String(search).trim().replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

        // Search customer name, phone, or reservation ID.
        if (safeSearch) {
            const matchingUsers = await mongoose.model("User").find({
                $or: [
                    { fullName: { $regex: safeSearch, $options: "i" } },
                    { phone: { $regex: safeSearch, $options: "i" } }
                ]
            }).select("_id");

            const matchingCustomerIds = matchingUsers.map(
                (user) => user._id
            );

            const searchConditions = [
                { customer: { $in: matchingCustomerIds } }
            ];

            if (mongoose.Types.ObjectId.isValid(search)) {
                searchConditions.push({
                    _id: new mongoose.Types.ObjectId(search)
                });
            }

            filter.$or = searchConditions;
        }

        // Pagination.
        const currentPage = Math.max(1, Number(page) || 1);
        const pageSize = Math.min(
            100,
            Math.max(1, Number(limit) || 10)
        );

        const skip = (currentPage - 1) * pageSize;

        const [reservations, total] = await Promise.all([
            Reservation.find(filter)
                .populate("customer", "fullName username phone")
                .populate("court", "name courtNumber courtType")
                .populate("createdBy", "fullName username")
                .sort({ reservationDate: -1, startTime: -1 })
                .skip(skip)
                .limit(pageSize)
                .lean(),

            Reservation.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            reservations,
            pagination: {
                total,
                page: currentPage,
                limit: pageSize,
                totalPages: Math.ceil(total / pageSize)
            }
        });

    } catch (error) {
        console.error("Get staff reservations error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve reservations."
        });
    }
};

module.exports = {
    getStaffReservations
};
