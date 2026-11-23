
const mongoose = require("mongoose");

const User = require("../models/User");
const Reservation = require("../models/Reservation");

// Escape special characters before using search text in a regex.
const escapeRegex = (value) => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// GET ALL CUSTOMERS
const getCustomers = async (req, res) => {
    try {
        const {
            search = "",
            status = "All",
            page = 1,
            limit = 10
        } = req.query;

        const pageNumber = Math.max(1, Number(page) || 1);
        const limitNumber = Math.min(100, Math.max(1, Number(limit) || 10));

        const query = {
            role: "customer"
        };

        if (status === "Active") {
            query.isActive = true;
        } else if (status === "Inactive") {
            query.isActive = false;
        }

        if (search.trim()) {
            const searchRegex = new RegExp(
                escapeRegex(search.trim()),
                "i"
            );

            query.$or = [
                { fullName: searchRegex },
                { username: searchRegex },
                { phone: searchRegex }
            ];
        }

        const totalCustomers = await User.countDocuments(query);

        const customers = await User.find(query)
            .select("-password")
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * limitNumber)
            .limit(limitNumber)
            .lean();

        // Get reservation counts for the customers on this page.
        const customerIds = customers.map((customer) => customer._id);

        const bookingStats = await Reservation.aggregate([
            {
                $match: {
                    customer: { $in: customerIds }
                }
            },
            {
                $group: {
                    _id: "$customer",
                    totalBookings: { $sum: 1 },
                    completedBookings: {
                        $sum: {
                            $cond: [
                                { $eq: ["$status", "Completed"] },
                                1,
                                0
                            ]
                        }
                    },
                    cancelledBookings: {
                        $sum: {
                            $cond: [
                                { $eq: ["$status", "Cancelled"] },
                                1,
                                0
                            ]
                        }
                    },
                    totalSpent: {
                        $sum: {
                            $cond: [
                                { $eq: ["$paymentStatus", "Paid"] },
                                "$totalAmount",
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        const statsMap = new Map(
            bookingStats.map((item) => [
                item._id.toString(),
                item
            ])
        );

        const customersWithStats = customers.map((customer) => {
            const stats = statsMap.get(customer._id.toString());

            return {
                ...customer,
                totalBookings: stats?.totalBookings || 0,
                completedBookings: stats?.completedBookings || 0,
                cancelledBookings: stats?.cancelledBookings || 0,
                totalSpent: stats?.totalSpent || 0
            };
        });

        return res.status(200).json({
            success: true,
            customers: customersWithStats,
            pagination: {
                total: totalCustomers,
                page: pageNumber,
                limit: limitNumber,
                totalPages: Math.ceil(totalCustomers / limitNumber)
            }
        });

    } catch (error) {
        console.error("Get Customers Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve customers."
        });
    }
};

// GET CUSTOMER PROFILE AND BOOKING HISTORY
const getCustomerById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid customer ID."
            });
        }

        const customer = await User.findOne({
            _id: id,
            role: "customer"
        })
            .select("-password")
            .lean();

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found."
            });
        }

        const reservations = await Reservation.find({
            customer: id
        })
            .populate("court", "name courtNumber courtType hourlyRate")
            .populate("createdBy", "fullName username")
            .sort({ reservationDate: -1, startTime: -1 })
            .lean();

        const totalBookings = reservations.length;

        const completedBookings = reservations.filter(
            (reservation) => reservation.status === "Completed"
        ).length;

        const cancelledBookings = reservations.filter(
            (reservation) => reservation.status === "Cancelled"
        ).length;

        const pendingBookings = reservations.filter(
            (reservation) => reservation.status === "Pending"
        ).length;

        const confirmedBookings = reservations.filter(
            (reservation) => reservation.status === "Confirmed"
        ).length;

        // Count only reservations marked as Paid.
        const totalSpent = reservations
            .filter((reservation) => reservation.paymentStatus === "Paid")
            .reduce(
                (total, reservation) => total + Number(reservation.totalAmount || 0),
                0
            );

        return res.status(200).json({
            success: true,
            customer,
            statistics: {
                totalBookings,
                completedBookings,
                cancelledBookings,
                pendingBookings,
                confirmedBookings,
                totalSpent
            },
            reservations
        });

    } catch (error) {
        console.error("Get Customer Profile Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve customer profile."
        });
    }
};

// UPDATE CUSTOMER ACCOUNT STATUS
const updateCustomerStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid customer ID."
            });
        }

        if (typeof isActive !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "isActive must be true or false."
            });
        }

        const customer = await User.findOneAndUpdate(
            {
                _id: id,
                role: "customer"
            },
            { isActive },
            {
                new: true,
                runValidators: true
            }
        ).select("-password");

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: `Customer account ${isActive ? "activated" : "deactivated"} successfully.`,
            customer
        });

    } catch (error) {
        console.error("Update Customer Status Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update customer status."
        });
    }
};

module.exports = {
    getCustomers,
    getCustomerById,
    updateCustomerStatus
};
