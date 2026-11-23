
const mongoose = require("mongoose");

const User = require("../models/User");
const Reservation = require("../models/Reservation");

// ==========================================
// HELPER: ESCAPE REGULAR EXPRESSION
// ==========================================

const escapeRegex = (value) => {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// ==========================================
// GET ALL CUSTOMERS
// ==========================================

const getStaffCustomers = async (req, res) => {
    try {
        const {
            search = "",
            status = "All",
            page = 1,
            limit = 10
        } = req.query;

        // Only retrieve customer accounts.
        const filter = {
            role: "customer"
        };

        // Search by customer name, username, or phone.
        const safeSearch = String(search).trim();

        if (safeSearch) {
            const regex = new RegExp(escapeRegex(safeSearch), "i");

            filter.$or = [
                { fullName: regex },
                { username: regex },
                { phone: regex }
            ];
        }

        // Filter active/inactive accounts.
        if (status === "Active") {
            filter.isActive = true;
        } else if (status === "Inactive") {
            filter.isActive = false;
        }

        const currentPage = Math.max(1, Number(page) || 1);
        const pageSize = Math.min(
            100,
            Math.max(1, Number(limit) || 10)
        );

        const skip = (currentPage - 1) * pageSize;

        const [customers, total, activeCustomers] = await Promise.all([
            User.find(filter)
                .select("fullName username phone isActive createdAt")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageSize)
                .lean(),

            User.countDocuments(filter),

            User.countDocuments({
                role: "customer",
                isActive: true
            })
        ]);

        // Attach booking counts to the displayed customers.
        const customerIds = customers.map((customer) => customer._id);

        const bookingCounts = await Reservation.aggregate([
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
                    }
                }
            }
        ]);

        const bookingCountMap = new Map(
            bookingCounts.map((item) => [
                String(item._id),
                {
                    totalBookings: item.totalBookings,
                    completedBookings: item.completedBookings
                }
            ])
        );

        const formattedCustomers = customers.map((customer) => ({
            ...customer,
            totalBookings:
                bookingCountMap.get(String(customer._id))?.totalBookings || 0,
            completedBookings:
                bookingCountMap.get(String(customer._id))?.completedBookings || 0
        }));

        return res.status(200).json({
            success: true,
            customers: formattedCustomers,
            summary: {
                totalCustomers: await User.countDocuments({
                    role: "customer"
                }),
                activeCustomers,
                inactiveCustomers: await User.countDocuments({
                    role: "customer",
                    isActive: false
                })
            },
            pagination: {
                total,
                page: currentPage,
                limit: pageSize,
                totalPages: Math.ceil(total / pageSize)
            }
        });

    } catch (error) {
        console.error("Get staff customers error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve customers."
        });
    }
};

// ==========================================
// GET CUSTOMER PROFILE AND BOOKING HISTORY
// ==========================================

const getStaffCustomerProfile = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid customer ID."
            });
        }

        // Find only customer accounts.
        const customer = await User.findOne({
            _id: id,
            role: "customer"
        })
            .select("fullName username phone isActive createdAt")
            .lean();

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found."
            });
        }

        // Retrieve the customer's booking history.
        const reservations = await Reservation.find({
            customer: customer._id
        })
            .populate("court", "name courtNumber courtType")
            .populate("createdBy", "fullName username")
            .sort({
                reservationDate: -1,
                startTime: -1
            })
            .lean();

        // Calculate customer booking statistics.
        const totalBookings = reservations.length;

        const completedBookings = reservations.filter(
            (item) => item.status === "Completed"
        ).length;

        const confirmedBookings = reservations.filter(
            (item) => item.status === "Confirmed"
        ).length;

        const pendingBookings = reservations.filter(
            (item) => item.status === "Pending"
        ).length;

        const cancelledBookings = reservations.filter(
            (item) => item.status === "Cancelled"
        ).length;

        // Only count payments marked Paid as spending.
        const totalSpent = reservations
            .filter((item) => item.paymentStatus === "Paid")
            .reduce(
                (total, item) => total + Number(item.totalAmount || 0),
                0
            );

        return res.status(200).json({
            success: true,
            customer,
            statistics: {
                totalBookings,
                completedBookings,
                confirmedBookings,
                pendingBookings,
                cancelledBookings,
                totalSpent
            },
            reservations
        });

    } catch (error) {
        console.error("Get staff customer profile error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve customer profile."
        });
    }
};

module.exports = {
    getStaffCustomers,
    getStaffCustomerProfile
};
