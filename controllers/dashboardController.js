
const Reservation = require("../models/Reservation");
const User = require("../models/User");
const Court = require("../models/Court");
const SystemSetting = require("../models/SystemSetting");

const getStartOfDay = (date = new Date()) => {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
};

const formatDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
};

// GET /api/dashboard
const getDashboard = async (req, res) => {
    try {
        const now = new Date();
        const todayStart = getStartOfDay(now);
        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);

        // Seven-day chart range, including today.
        const sevenDaysStart = new Date(todayStart);
        sevenDaysStart.setDate(sevenDaysStart.getDate() - 6);

        const todayKey = formatDateKey(now);
        const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
            now.getMinutes()
        ).padStart(2, "0")}`;

        // ==========================================
        // 1. TOTAL BOOKINGS
        // ==========================================

        const [
            totalBookings,
            todayBookings,
            pendingBookings,
            confirmedBookings
        ] = await Promise.all([
            Reservation.countDocuments(),
            Reservation.countDocuments({
                reservationDate: {
                    $gte: todayStart,
                    $lt: tomorrowStart
                }
            }),
            Reservation.countDocuments({
                status: "Pending"
            }),
            Reservation.countDocuments({
                status: "Confirmed"
            })
        ]);

        // ==========================================
        // 2. REVENUE
        // Only Paid reservations are counted.
        // ==========================================

        const revenueResult = await Reservation.aggregate([
            {
                $match: {
                    paymentStatus: "Paid"
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: {
                        $sum: "$totalAmount"
                    }
                }
            }
        ]);

        const todayRevenueResult = await Reservation.aggregate([
            {
                $match: {
                    paymentStatus: "Paid",
                    reservationDate: {
                        $gte: todayStart,
                        $lt: tomorrowStart
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: {
                        $sum: "$totalAmount"
                    }
                }
            }
        ]);

        const totalRevenue = revenueResult[0]?.totalRevenue || 0;
        const todayRevenue = todayRevenueResult[0]?.totalRevenue || 0;

        // ==========================================
        // 3. CUSTOMERS
        // ==========================================

        const [
            totalCustomers,
            activeCustomers,
            newCustomersToday
        ] = await Promise.all([
            User.countDocuments({
                role: "customer"
            }),
            User.countDocuments({
                role: "customer",
                isActive: true
            }),
            User.countDocuments({
                role: "customer",
                createdAt: {
                    $gte: todayStart,
                    $lt: tomorrowStart
                }
            })
        ]);

        // ==========================================
        // 4. COURT AVAILABILITY
        // ==========================================

        const activeCourts = await Court.find({
            isActive: true
        }).select(
            "name courtNumber openingTime closingTime hourlyRate"
        );

        const systemSettings = await SystemSetting.findOne({
            settingKey: "picklebook"
        });

        const dayNames = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday"
        ];

        const facilityHours = systemSettings?.operatingHours?.find(
            (item) => item.day === dayNames[now.getDay()]
        );

        const facilityIsOpen =
            !systemSettings ||
            !facilityHours ||
            facilityHours.isOpen;

        const currentReservations = await Reservation.find({
            reservationDate: {
                $gte: todayStart,
                $lt: tomorrowStart
            },
            status: {
                $in: ["Pending", "Confirmed"]
            },
            startTime: {
                $lte: currentTime
            },
            endTime: {
                $gt: currentTime
            }
        }).select("court startTime endTime status");

        const occupiedCourtIds = new Set(
            currentReservations.map((reservation) =>
                reservation.court.toString()
            )
        );

        const courtAvailability = activeCourts.map((court) => {
            const withinCourtHours =
                currentTime >= court.openingTime &&
                currentTime < court.closingTime;

            const isOccupied = occupiedCourtIds.has(
                court._id.toString()
            );

            const isAvailable =
                facilityIsOpen &&
                withinCourtHours &&
                !isOccupied;

            return {
                _id: court._id,
                name: court.name,
                courtNumber: court.courtNumber,
                status: !facilityIsOpen || !withinCourtHours
                    ? "Closed"
                    : isOccupied
                        ? "Occupied"
                        : "Available",
                isAvailable
            };
        });

        const availableCourts = courtAvailability.filter(
            (court) => court.isAvailable
        ).length;

        const occupiedCourts = courtAvailability.filter(
            (court) => court.status === "Occupied"
        ).length;

        const closedCourts = courtAvailability.filter(
            (court) => court.status === "Closed"
        ).length;

        // ==========================================
        // 5. LAST SEVEN DAYS CHART DATA
        // ==========================================

        const recentReservations = await Reservation.find({
            reservationDate: {
                $gte: sevenDaysStart,
                $lt: tomorrowStart
            }
        })
            .select("reservationDate totalAmount paymentStatus status")
            .lean();

        const chartData = [];

        for (let i = 0; i < 7; i++) {
            const date = new Date(sevenDaysStart);
            date.setDate(date.getDate() + i);

            const dateKey = formatDateKey(date);

            const dayReservations = recentReservations.filter(
                (reservation) =>
                    formatDateKey(new Date(reservation.reservationDate)) === dateKey
            );

            const paidRevenue = dayReservations
                .filter((reservation) => reservation.paymentStatus === "Paid")
                .reduce(
                    (total, reservation) =>
                        total + Number(reservation.totalAmount || 0),
                    0
                );

            chartData.push({
                date: dateKey,
                label: date.toLocaleDateString("en-PH", {
                    weekday: "short"
                }),
                bookings: dayReservations.length,
                revenue: Number(paidRevenue.toFixed(2))
            });
        }

        // ==========================================
        // 6. RECENT RESERVATIONS
        // ==========================================

        const latestReservations = await Reservation.find()
            .populate("customer", "fullName username")
            .populate("court", "name courtNumber")
            .sort({
                createdAt: -1
            })
            .limit(5)
            .lean();

        // ==========================================
        // 7. RESPONSE
        // ==========================================

        return res.status(200).json({
            success: true,
            dashboard: {
                summary: {
                    totalBookings,
                    todayBookings,
                    pendingBookings,
                    confirmedBookings,

                    totalRevenue: Number(totalRevenue.toFixed(2)),
                    todayRevenue: Number(todayRevenue.toFixed(2)),

                    totalCustomers,
                    activeCustomers,
                    newCustomersToday,

                    totalCourts: activeCourts.length,
                    availableCourts,
                    occupiedCourts,
                    closedCourts
                },

                courtAvailability,

                charts: {
                    weekly: chartData
                },

                recentReservations: latestReservations
            }
        });

    } catch (error) {
        console.error("Dashboard Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load dashboard data.",
            error: error.message
        });
    }
};


// ==========================================
// GET STAFF DASHBOARD
// GET /api/dashboard/staff
// ==========================================
const getStaffDashboard = async (req, res) => {
    try {
        const now = new Date();

        const todayStart = getStartOfDay(now);
        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);

        const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
            now.getMinutes()
        ).padStart(2, "0")}`;

        const staffId = req.user._id;

        // ==========================================
        // 1. TODAY'S RESERVATIONS
        // Facility-wide schedule for staff operations.
        // ==========================================
        const [
            todayBookings,
            todayWalkIns,
            todayPendingPayments,
            todayReservations
        ] = await Promise.all([
            Reservation.countDocuments({
                reservationDate: {
                    $gte: todayStart,
                    $lt: tomorrowStart
                },
                status: { $ne: "Cancelled" }
            }),

            // Reservations created by this staff member today.
            Reservation.countDocuments({
                createdBy: staffId,
                createdAt: {
                    $gte: todayStart,
                    $lt: tomorrowStart
                },
                status: { $ne: "Cancelled" }
            }),

            Reservation.find({
                reservationDate: {
                    $gte: todayStart,
                    $lt: tomorrowStart
                },
                paymentStatus: "Unpaid",
                status: { $ne: "Cancelled" }
            }).select("totalAmount"),

            Reservation.find({
                reservationDate: {
                    $gte: todayStart,
                    $lt: tomorrowStart
                },
                status: {
                    $in: ["Pending", "Confirmed", "Completed"]
                }
            })
                .populate("customer", "fullName username phone")
                .populate("court", "name courtNumber")
                .sort({ startTime: 1 })
                .lean()
        ]);

        const pendingPaymentAmount = todayPendingPayments.reduce(
            (total, reservation) =>
                total + Number(reservation.totalAmount || 0),
            0
        );

        // ==========================================
        // 2. COURT AVAILABILITY
        // ==========================================
        const activeCourts = await Court.find({
            isActive: true
        }).select(
            "name courtNumber openingTime closingTime"
        );

        const systemSettings = await SystemSetting.findOne({
            settingKey: "picklebook"
        });

        const dayNames = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday"
        ];

        const facilityHours = systemSettings?.operatingHours?.find(
            (item) => item.day === dayNames[now.getDay()]
        );

        const facilityIsOpen =
            !systemSettings ||
            !facilityHours ||
            facilityHours.isOpen;

        const currentReservations = await Reservation.find({
            reservationDate: {
                $gte: todayStart,
                $lt: tomorrowStart
            },
            status: {
                $in: ["Pending", "Confirmed"]
            },
            startTime: {
                $lte: currentTime
            },
            endTime: {
                $gt: currentTime
            }
        }).select("court");

        const occupiedCourtIds = new Set(
            currentReservations.map((reservation) =>
                reservation.court.toString()
            )
        );

        const courtAvailability = activeCourts.map((court) => {
            const withinCourtHours =
                currentTime >= court.openingTime &&
                currentTime < court.closingTime;

            const isOccupied = occupiedCourtIds.has(
                court._id.toString()
            );

            let status = "Available";

            if (!facilityIsOpen || !withinCourtHours) {
                status = "Closed";
            } else if (isOccupied) {
                status = "Occupied";
            }

            return {
                _id: court._id,
                name: court.name,
                courtNumber: court.courtNumber,
                status
            };
        });

        const availableCourts = courtAvailability.filter(
            (court) => court.status === "Available"
        ).length;

        const occupiedCourts = courtAvailability.filter(
            (court) => court.status === "Occupied"
        ).length;

        const closedCourts = courtAvailability.filter(
            (court) => court.status === "Closed"
        ).length;

        // ==========================================
        // 3. RECENT ACTIVITY BY LOGGED-IN STAFF
        // ==========================================
        const recentActivity = await Reservation.find({
            createdBy: staffId
        })
            .populate("customer", "fullName username")
            .populate("court", "name courtNumber")
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        // ==========================================
        // 4. RESPONSE
        // ==========================================
        return res.status(200).json({
            success: true,
            dashboard: {
                summary: {
                    todayBookings,
                    todayWalkIns,
                    totalCourts: activeCourts.length,
                    availableCourts,
                    occupiedCourts,
                    closedCourts,
                    pendingPayments: todayPendingPayments.length,
                    pendingPaymentAmount: Number(
                        pendingPaymentAmount.toFixed(2)
                    )
                },

                courtAvailability,

                todayReservations,

                recentActivity
            }
        });

    } catch (error) {
        console.error("Staff Dashboard Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load staff dashboard."
        });
    }
};


module.exports = {
    getDashboard,
    getStaffDashboard
};
