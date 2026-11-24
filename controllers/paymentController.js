
const mongoose = require("mongoose");
const crypto = require("crypto");

const Payment = require("../models/Payment");
const Reservation = require("../models/Reservation");
const User = require("../models/User");

const logActivity = require("../utils/activityLogger");

// ==========================================
// SAFE ACTIVITY LOGGER
// ==========================================

// Activity logging should never interrupt payment processing.
const safeLogActivity = async (activityData) => {
    try {
        await logActivity(activityData);
    } catch (error) {
        console.error(
            "Payment Activity Logging Failed:",
            error.message
        );
    }
};

// ==========================================
// GET CUSTOMER DISPLAY NAME
// ==========================================

const getCustomerName = async (customerValue) => {
    try {
        if (!customerValue) {
            return "Unknown Customer";
        }

        // Handle an already-populated customer object.
        if (
            typeof customerValue === "object" &&
            !mongoose.isValidObjectId(customerValue)
        ) {
            const fullName =
                customerValue.fullName ||
                customerValue.name ||
                [
                    customerValue.firstName,
                    customerValue.lastName
                ].filter(Boolean).join(" ");

            return (
                fullName ||
                customerValue.username ||
                "Unknown Customer"
            );
        }

        // Resolve the customer ID.
        const customerId =
            typeof customerValue === "object"
                ? customerValue._id || customerValue.id
                : customerValue;

        if (!mongoose.isValidObjectId(customerId)) {
            return "Unknown Customer";
        }

        const customer = await User.findById(customerId)
            .select("fullName name firstName lastName username")
            .lean();

        if (!customer) {
            return "Unknown Customer";
        }

        const fullName =
            customer.fullName ||
            customer.name ||
            [
                customer.firstName,
                customer.lastName
            ].filter(Boolean).join(" ");

        return (
            fullName ||
            customer.username ||
            "Unknown Customer"
        );

    } catch (error) {
        console.error(
            "Get Customer Name Error:",
            error.message
        );

        return "Unknown Customer";
    }
};

// ==========================================
// GENERATE RECEIPT NUMBER
// ==========================================

const generateReceiptNumber = () => {
    const date = new Date();

    const datePart = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("");

    const randomPart = crypto
        .randomBytes(3)
        .toString("hex")
        .toUpperCase();

    return `PB-${datePart}-${randomPart}`;
};

// ==========================================
// GET ALL PAYMENTS
// GET /api/payments
// ==========================================

const getPayments = async (req, res) => {
    try {
        const {
            search = "",
            status = "",
            method = "",
            page = 1,
            limit = 10
        } = req.query;

        // Pagination.
        const currentPage = Math.max(
            Number(page) || 1,
            1
        );

        const perPage = Math.min(
            Math.max(Number(limit) || 10, 1),
            100
        );

        // Build database filter.
        const filter = {};

        // Filter by payment status.
        if (
            status &&
            ["Pending", "Paid", "Rejected", "Refunded"].includes(status)
        ) {
            filter.status = status;
        }

        // Filter by payment method.
        if (
            method &&
            ["Cash", "GCash", "Bank Transfer", "Card", "Other"].includes(method)
        ) {
            filter.paymentMethod = method;
        }

        // Search payments.
        if (search.trim()) {
            const escapedSearch = search.trim().replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );

            const regex = new RegExp(
                escapedSearch,
                "i"
            );

            const matchingCustomers = await User.find({
                role: "customer",
                $or: [
                    { fullName: regex },
                    { name: regex },
                    { username: regex }
                ]
            }).select("_id");

            const searchConditions = [
                { receiptNumber: regex },
                { referenceNumber: regex },
                {
                    customer: {
                        $in: matchingCustomers.map(
                            (user) => user._id
                        )
                    }
                }
            ];

            // Search using MongoDB ObjectId when valid.
            if (mongoose.isValidObjectId(search.trim())) {
                searchConditions.push({
                    _id: search.trim()
                });
            }

            filter.$or = searchConditions;
        }

        // Get total matching records.
        const total = await Payment.countDocuments(filter);

        // Retrieve payment records.
        const payments = await Payment.find(filter)
            .populate(
                "customer",
                "fullName name firstName lastName username phone"
            )
            .populate({
                path: "reservation",
                select: "reservationDate startTime endTime duration totalAmount status court",
                populate: {
                    path: "court",
                    select: "name courtNumber"
                }
            })
            .populate(
                "receivedBy",
                "fullName username"
            )
            .sort({
                paymentDate: -1,
                createdAt: -1
            })
            .skip((currentPage - 1) * perPage)
            .limit(perPage);

        // Calculate payment summary.
        const summary = await Payment.aggregate([
            {
                $match: filter
            },
            {
                $group: {
                    _id: "$status",
                    count: {
                        $sum: 1
                    },
                    amount: {
                        $sum: "$amount"
                    }
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            payments,
            pagination: {
                total,
                page: currentPage,
                limit: perPage,
                totalPages: Math.ceil(total / perPage)
            },
            summary
        });

    } catch (error) {
        console.error("Get Payments Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve payment records."
        });
    }
};

// ==========================================
// GET PAYMENT BY ID
// GET /api/payments/:id
// ==========================================

const getPaymentById = async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id)
            .populate(
                "customer",
                "fullName name firstName lastName username phone"
            )
            .populate({
                path: "reservation",
                populate: {
                    path: "court",
                    select: "name courtNumber"
                }
            })
            .populate(
                "receivedBy",
                "fullName username"
            );

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment record not found."
            });
        }

        return res.status(200).json({
            success: true,
            payment
        });

    } catch (error) {
        console.error("Get Payment Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve payment record."
        });
    }
};

// ==========================================
// CREATE PAYMENT
// POST /api/payments
// ==========================================

const createPayment = async (req, res) => {
    try {
        const {
            reservationId,
            amount,
            paymentMethod,
            referenceNumber = "",
            status = "Pending",
            notes = ""
        } = req.body;

        // ==========================================
        // 1. VALIDATE RESERVATION ID
        // ==========================================

        if (!mongoose.isValidObjectId(reservationId)) {
            return res.status(400).json({
                success: false,
                message: "A valid reservation is required."
            });
        }

        // ==========================================
        // 2. VALIDATE PAYMENT METHOD
        // ==========================================

        if (
            !["Cash", "GCash", "Bank Transfer", "Card", "Other"].includes(paymentMethod)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment method."
            });
        }

        // ==========================================
        // 3. VALIDATE PAYMENT STATUS
        // ==========================================

        if (!["Pending", "Paid"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "A new payment can only be Pending or Paid."
            });
        }

        // ==========================================
        // 4. FIND RESERVATION
        // ==========================================

        const reservation = await Reservation.findById(
            reservationId
        );

        if (!reservation) {
            return res.status(404).json({
                success: false,
                message: "Reservation not found."
            });
        }

        if (reservation.status === "Cancelled") {
            return res.status(400).json({
                success: false,
                message: "Cannot record payment for a cancelled reservation."
            });
        }

        // ==========================================
        // 5. VALIDATE PAYMENT AMOUNT
        // ==========================================

        const paymentAmount = Number(amount);

        if (
            !Number.isFinite(paymentAmount) ||
            paymentAmount <= 0 ||
            Math.abs(paymentAmount - reservation.totalAmount) > 0.01
        ) {
            return res.status(400).json({
                success: false,
                message: `Payment amount must match the reservation total of ${reservation.totalAmount}.`
            });
        }

        // ==========================================
        // 6. CHECK EXISTING PAID PAYMENT
        // ==========================================

        const existingPaidPayment = await Payment.findOne({
            reservation: reservation._id,
            status: "Paid"
        });

        if (
            existingPaidPayment ||
            reservation.paymentStatus === "Paid"
        ) {
            return res.status(409).json({
                success: false,
                message: "This reservation already has a successful payment."
            });
        }

        // ==========================================
        // 7. CHECK EXISTING PENDING PAYMENT
        // ==========================================

        const existingPendingPayment = await Payment.findOne({
            reservation: reservation._id,
            status: "Pending"
        });

        if (existingPendingPayment) {
            return res.status(409).json({
                success: false,
                message: "This reservation already has a pending payment record."
            });
        }

        // ==========================================
        // 8. CREATE PAYMENT
        // ==========================================

        const payment = await Payment.create({
            reservation: reservation._id,
            customer: reservation.customer,
            amount: paymentAmount,
            paymentMethod,
            referenceNumber,
            status,

            receiptNumber: status === "Paid"
                ? generateReceiptNumber()
                : undefined,

            paymentDate: new Date(),
            notes,
            receivedBy: req.user._id,

            verifiedAt: status === "Paid"
                ? new Date()
                : null
        });

        // ==========================================
        // 9. UPDATE RESERVATION PAYMENT STATUS
        // ==========================================

        reservation.paymentStatus = status === "Paid"
            ? "Paid"
            : "Unpaid";

        await reservation.save();

        // ==========================================
        // 10. RECORD PAYMENT ACTIVITY
        // ==========================================

        const customerName = await getCustomerName(
            reservation.customer
        );

        const receiptNumber =
            payment.receiptNumber || "Not yet generated";

        await safeLogActivity({
            actor: req.user,

            action: status === "Paid"
                ? "payment_received"
                : "payment_created",

            description: status === "Paid"
                ? `Payment received from ${customerName}. Receipt No: ${receiptNumber}. Amount: ₱${paymentAmount.toFixed(2)}.`
                : `Pending payment recorded for ${customerName}. Amount: ₱${paymentAmount.toFixed(2)}.`,

            category: "payment",

            relatedId: payment._id,
            relatedModel: "Payment",

            metadata: {
                paymentId: payment._id,
                reservationId: reservation._id,
                customerId: reservation.customer,

                customerName,
                receiptNumber: payment.receiptNumber || null,

                amount: paymentAmount,
                paymentMethod,
                status,
                referenceNumber
            },

            notificationTitle: status === "Paid"
                ? "Payment Received"
                : "New Pending Payment",

            notificationMessage: status === "Paid"
                ? `${customerName} paid ₱${paymentAmount.toFixed(2)}. Receipt: ${receiptNumber}.`
                : `Pending payment of ₱${paymentAmount.toFixed(2)} recorded for ${customerName}.`,

            recipientRole: "admin",
            link: "/admin/payments"
        });

        // ==========================================
        // 11. POPULATE PAYMENT RESPONSE
        // ==========================================

        const populatedPayment = await Payment.findById(
            payment._id
        )
            .populate(
                "customer",
                "fullName name firstName lastName username phone"
            )
            .populate({
                path: "reservation",
                populate: {
                    path: "court",
                    select: "name courtNumber"
                }
            })
            .populate(
                "receivedBy",
                "fullName username"
            );

        // ==========================================
        // 12. SUCCESS RESPONSE
        // ==========================================

        return res.status(201).json({
            success: true,

            message: status === "Paid"
                ? "Payment recorded successfully. Receipt generated."
                : "Pending payment recorded successfully.",

            payment: populatedPayment
        });

    } catch (error) {
        console.error("Create Payment Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to record payment."
        });
    }
};

// ==========================================
// UPDATE PAYMENT STATUS
// PATCH /api/payments/:id/status
// ==========================================

const updatePaymentStatus = async (req, res) => {
    try {
        const { status } = req.body;

        // ==========================================
        // 1. VALIDATE NEW STATUS
        // ==========================================

        if (
            !["Pending", "Paid", "Rejected", "Refunded"].includes(status)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment status."
            });
        }

        // ==========================================
        // 2. FIND PAYMENT
        // ==========================================

        const payment = await Payment.findById(
            req.params.id
        );

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment record not found."
            });
        }

        const previousStatus = payment.status;

        // ==========================================
        // 3. VALIDATE STATUS TRANSITION
        // ==========================================

        const allowedTransitions = {
            Pending: ["Paid", "Rejected"],
            Paid: ["Refunded"],
            Rejected: [],
            Refunded: []
        };

        if (
            !allowedTransitions[previousStatus]?.includes(status)
        ) {
            return res.status(400).json({
                success: false,
                message: `Cannot change payment status from ${previousStatus} to ${status}.`
            });
        }

        // ==========================================
        // 4. FIND RELATED RESERVATION
        // ==========================================

        const reservation = await Reservation.findById(
            payment.reservation
        );

        if (!reservation) {
            return res.status(404).json({
                success: false,
                message: "Related reservation not found."
            });
        }

        // ==========================================
        // 5. CHECK DUPLICATE SUCCESSFUL PAYMENT
        // ==========================================

        if (status === "Paid") {
            const anotherPaidPayment = await Payment.findOne({
                reservation: reservation._id,
                status: "Paid",
                _id: {
                    $ne: payment._id
                }
            });

            if (anotherPaidPayment) {
                return res.status(409).json({
                    success: false,
                    message: "Another successful payment already exists for this reservation."
                });
            }

            payment.receiptNumber =
                payment.receiptNumber || generateReceiptNumber();

            payment.verifiedAt = new Date();

            reservation.paymentStatus = "Paid";
        }

        // ==========================================
        // 6. HANDLE REJECTED PAYMENT
        // ==========================================

        if (status === "Rejected") {
            reservation.paymentStatus = "Unpaid";
        }

        // ==========================================
        // 7. HANDLE REFUNDED PAYMENT
        // ==========================================

        if (status === "Refunded") {
            reservation.paymentStatus = "Refunded";
        }

        // ==========================================
        // 8. SAVE PAYMENT AND RESERVATION
        // ==========================================

        payment.status = status;

        await payment.save();
        await reservation.save();

        // ==========================================
        // 9. RECORD PAYMENT STATUS ACTIVITY
        // ==========================================

        // Use payment.customer first, then reservation.customer.
        const customerValue =
            payment.customer || reservation.customer;

        const customerName = await getCustomerName(
            customerValue
        );

        const receiptNumber =
            payment.receiptNumber || "Not yet generated";

        await safeLogActivity({
            actor: req.user,

            action: `payment_${status.toLowerCase()}`,

            description:
                `Payment for ${customerName} changed from ${previousStatus} to ${status}. Receipt No: ${receiptNumber}. Amount: ₱${Number(payment.amount).toFixed(2)}.`,

            category: "payment",

            relatedId: payment._id,
            relatedModel: "Payment",

            metadata: {
                paymentId: payment._id,
                reservationId: reservation._id,
                customerId: customerValue,

                customerName,
                receiptNumber: payment.receiptNumber || null,

                amount: payment.amount,
                paymentMethod: payment.paymentMethod,
                previousStatus,
                newStatus: status
            },

            notificationTitle: `Payment ${status}`,

            notificationMessage:
                `${customerName}'s payment changed from ${previousStatus} to ${status}. Receipt: ${receiptNumber}.`,

            recipientRole: "admin",
            link: "/admin/payments"
        });

        // ==========================================
        // 10. POPULATE UPDATED PAYMENT
        // ==========================================

        const updatedPayment = await Payment.findById(
            payment._id
        )
            .populate(
                "customer",
                "fullName name firstName lastName username phone"
            )
            .populate({
                path: "reservation",
                populate: {
                    path: "court",
                    select: "name courtNumber"
                }
            })
            .populate(
                "receivedBy",
                "fullName username"
            );

        // ==========================================
        // 11. SUCCESS RESPONSE
        // ==========================================

        return res.status(200).json({
            success: true,

            message: `Payment status updated to ${status}.`,

            payment: updatedPayment
        });

    } catch (error) {
        console.error("Update Payment Status Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update payment status."
        });
    }
};

// ==========================================
// EXPORT CONTROLLER
// ==========================================

module.exports = {
    getPayments,
    getPaymentById,
    createPayment,
    updatePaymentStatus
};
