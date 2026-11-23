
const mongoose = require("mongoose");

const Payment = require("../models/Payment");
const Reservation = require("../models/Reservation");

// ==========================================
// GET STAFF PAYMENTS
// GET /api/staff/payments
// ==========================================

const getStaffPayments = async (req, res) => {
    try {
        const {
            search = "",
            status = "",
            date = "",
            page = 1,
            limit = 10
        } = req.query;

        const currentPage = Math.max(1, Number(page) || 1);
        const perPage = Math.min(100, Math.max(1, Number(limit) || 10));

        const filter = {};

        if (["Pending", "Paid", "Rejected", "Refunded"].includes(status)) {
            filter.status = status;
        }

        if (date) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return res.status(400).json({
                    message: "Invalid date format."
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
                    message: "Invalid date."
                });
            }

            filter.paymentDate = {
                $gte: startDate,
                $lt: endDate
            };
        }

        if (search.trim()) {
            const regex = new RegExp(
                search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                "i"
            );

            const matchingPayments = await Payment.find({
                $or: [
                    { receiptNumber: regex },
                    { referenceNumber: regex }
                ]
            }).select("_id");

            const matchingReservations = await Reservation.find({
                $or: [
                    { notes: regex }
                ]
            }).select("_id");

            const matchingPaymentIds = matchingPayments.map(item => item._id);

            const customerPayments = await Payment.find({
                customer: {
                    $exists: true
                }
            })
                .populate({
                    path: "customer",
                    match: {
                        $or: [
                            { fullName: regex },
                            { username: regex },
                            { phone: regex }
                        ]
                    },
                    select: "_id"
                })
                .select("_id customer");

            const customerPaymentIds = customerPayments
                .filter(item => item.customer)
                .map(item => item._id);

            filter.$or = [
                { _id: { $in: matchingPaymentIds } },
                { _id: { $in: customerPaymentIds } },
                { reservation: { $in: matchingReservations.map(item => item._id) } }
            ];
        }

        const [payments, total, summary] = await Promise.all([
            Payment.find(filter)
                .populate("customer", "fullName username phone")
                .populate("reservation", "reservationDate startTime endTime status totalAmount")
                .populate("receivedBy", "fullName username")
                .sort({ paymentDate: -1, createdAt: -1 })
                .skip((currentPage - 1) * perPage)
                .limit(perPage),

            Payment.countDocuments(filter),

            Payment.aggregate([
                {
                    $group: {
                        _id: null,

                        totalPayments: { $sum: 1 },

                        paidCount: {
                            $sum: {
                                $cond: [{ $eq: ["$status", "Paid"] }, 1, 0]
                            }
                        },

                        pendingCount: {
                            $sum: {
                                $cond: [{ $eq: ["$status", "Pending"] }, 1, 0]
                            }
                        },

                        rejectedCount: {
                            $sum: {
                                $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0]
                            }
                        },

                        refundedCount: {
                            $sum: {
                                $cond: [{ $eq: ["$status", "Refunded"] }, 1, 0]
                            }
                        },

                        collectedRevenue: {
                            $sum: {
                                $cond: [
                                    { $eq: ["$status", "Paid"] },
                                    "$amount",
                                    0
                                ]
                            }
                        }
                    }
                }
            ])
        ]);

        return res.status(200).json({
            success: true,
            payments,
            summary: summary[0] || {
                totalPayments: 0,
                paidCount: 0,
                pendingCount: 0,
                rejectedCount: 0,
                refundedCount: 0,
                collectedRevenue: 0
            },
            pagination: {
                total,
                page: currentPage,
                limit: perPage,
                totalPages: Math.ceil(total / perPage)
            }
        });

    } catch (error) {
        console.error("Get Staff Payments Error:", error);

        return res.status(500).json({
            message: "Failed to retrieve payments."
        });
    }
};

// ==========================================
// CREATE PAYMENT
// POST /api/staff/payments
// ==========================================

const createStaffPayment = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const {
            reservationId,
            paymentMethod,
            referenceNumber = "",
            notes = ""
        } = req.body;

        if (!mongoose.Types.ObjectId.isValid(reservationId)) {
            return res.status(400).json({
                message: "Invalid reservation ID."
            });
        }

        const allowedMethods = [
            "Cash",
            "GCash",
            "Bank Transfer",
            "Card",
            "Other"
        ];

        if (!allowedMethods.includes(paymentMethod)) {
            return res.status(400).json({
                message: "Invalid payment method."
            });
        }

        if (
            typeof referenceNumber !== "string" ||
            referenceNumber.trim().length > 100 ||
            typeof notes !== "string" ||
            notes.trim().length > 500
        ) {
            return res.status(400).json({
                message: "Invalid payment reference or notes."
            });
        }

        let createdPayment;

        await session.withTransaction(async () => {
            const reservation = await Reservation.findById(
                reservationId
            ).session(session);

            if (!reservation) {
                throw new Error("RESERVATION_NOT_FOUND");
            }

            if (reservation.status === "Cancelled") {
                throw new Error("RESERVATION_CANCELLED");
            }

            if (reservation.paymentStatus === "Paid") {
                throw new Error("ALREADY_PAID");
            }

            if (
                !Number.isFinite(reservation.totalAmount) ||
                reservation.totalAmount <= 0
            ) {
                throw new Error("INVALID_AMOUNT");
            }

            // Prevent multiple active payment records for one reservation.
            const existingPayment = await Payment.findOne({
                reservation: reservation._id,
                status: "Paid"
            }).session(session);

            if (existingPayment) {
                throw new Error("ALREADY_PAID");
            }

            const [payment] = await Payment.create(
                [{
                    reservation: reservation._id,
                    customer: reservation.customer,
                    amount: reservation.totalAmount,
                    paymentMethod,
                    referenceNumber: referenceNumber.trim(),
                    status: "Paid",
                    paymentDate: new Date(),
                    receivedBy: req.user._id,
                    verifiedAt: new Date(),
                    notes: notes.trim()
                }],
                { session }
            );

            reservation.paymentStatus = "Paid";
            await reservation.save({ session });

            createdPayment = payment;
        });

        const populatedPayment = await Payment.findById(
            createdPayment._id
        )
            .populate("customer", "fullName username phone")
            .populate("reservation", "reservationDate startTime endTime totalAmount")
            .populate("receivedBy", "fullName username");

        return res.status(201).json({
            success: true,
            message: "Payment recorded successfully.",
            payment: populatedPayment
        });

    } catch (error) {
        console.error("Create Staff Payment Error:", error);

        const errors = {
            RESERVATION_NOT_FOUND: [404, "Reservation not found."],
            RESERVATION_CANCELLED: [400, "Cancelled reservations cannot be paid."],
            ALREADY_PAID: [409, "This reservation has already been paid."],
            INVALID_AMOUNT: [400, "Invalid reservation amount."]
        };

        if (errors[error.message]) {
            return res.status(errors[error.message][0]).json({
                message: errors[error.message][1]
            });
        }

        return res.status(500).json({
            message: "Failed to record payment."
        });

    } finally {
        await session.endSession();
    }
};


// ==========================================
// GET UNPAID RESERVATIONS
// GET /api/staff/payments/unpaid-reservations
// ==========================================

const getUnpaidReservations = async (req, res) => {
    try {
        const reservations = await Reservation.find({
            paymentStatus: "Unpaid",
            status: { $ne: "Cancelled" }
        })
            .populate("customer", "fullName phone")
            .populate("court", "name courtNumber")
            .sort({ reservationDate: -1, startTime: 1 });

        return res.status(200).json({
            success: true,
            reservations
        });

    } catch (error) {
        console.error("Get Unpaid Reservations Error:", error);

        return res.status(500).json({
            message: "Failed to retrieve unpaid reservations."
        });
    }
};


module.exports = {
    getStaffPayments,
    createStaffPayment,
    getUnpaidReservations
};
