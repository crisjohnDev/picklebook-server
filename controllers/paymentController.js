
const mongoose = require("mongoose");
const crypto = require("crypto");

const Payment = require("../models/Payment");
const Reservation = require("../models/Reservation");
const User = require("../models/User");

const generateReceiptNumber = () => {
    const date = new Date();
    const datePart = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("");

    const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();

    return `PB-${datePart}-${randomPart}`;
};

// GET /api/payments
const getPayments = async (req, res) => {
    try {
        const {
            search = "",
            status = "",
            method = "",
            page = 1,
            limit = 10
        } = req.query;

        const currentPage = Math.max(Number(page) || 1, 1);
        const perPage = Math.min(Math.max(Number(limit) || 10, 1), 100);

        const filter = {};

        if (status && ["Pending", "Paid", "Rejected", "Refunded"].includes(status)) {
            filter.status = status;
        }

        if (method && ["Cash", "GCash", "Bank Transfer", "Card", "Other"].includes(method)) {
            filter.paymentMethod = method;
        }

        if (search.trim()) {
            const regex = new RegExp(
                search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                "i"
            );

            const matchingCustomers = await User.find({
                role: "customer",
                $or: [
                    { fullName: regex },
                    { username: regex }
                ]
            }).select("_id");

            filter.$or = [
                { receiptNumber: regex },
                { referenceNumber: regex },
                { _id: mongoose.isValidObjectId(search) ? search : null },
                { customer: { $in: matchingCustomers.map((user) => user._id) } }
            ];
        }

        const total = await Payment.countDocuments(filter);

        const payments = await Payment.find(filter)
            .populate("customer", "fullName username phone")
            .populate({
                path: "reservation",
                select: "reservationDate startTime endTime duration totalAmount status court",
                populate: {
                    path: "court",
                    select: "name courtNumber"
                }
            })
            .populate("receivedBy", "fullName username")
            .sort({ paymentDate: -1, createdAt: -1 })
            .skip((currentPage - 1) * perPage)
            .limit(perPage);

        const summary = await Payment.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    amount: { $sum: "$amount" }
                }
            }
        ]);

        res.status(200).json({
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
        res.status(500).json({
            success: false,
            message: "Failed to retrieve payment records."
        });
    }
};

// GET /api/payments/:id
const getPaymentById = async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id)
            .populate("customer", "fullName username phone")
            .populate({
                path: "reservation",
                populate: {
                    path: "court",
                    select: "name courtNumber"
                }
            })
            .populate("receivedBy", "fullName username");

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment record not found."
            });
        }

        res.status(200).json({
            success: true,
            payment
        });
    } catch (error) {
        console.error("Get Payment Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve payment record."
        });
    }
};

// POST /api/payments
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

        if (!mongoose.isValidObjectId(reservationId)) {
            return res.status(400).json({
                success: false,
                message: "A valid reservation is required."
            });
        }

        if (!["Cash", "GCash", "Bank Transfer", "Card", "Other"].includes(paymentMethod)) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment method."
            });
        }

        if (!["Pending", "Paid"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "A new payment can only be Pending or Paid."
            });
        }

        const reservation = await Reservation.findById(reservationId);

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

        const existingPaidPayment = await Payment.findOne({
            reservation: reservation._id,
            status: "Paid"
        });

        if (existingPaidPayment || reservation.paymentStatus === "Paid") {
            return res.status(409).json({
                success: false,
                message: "This reservation already has a successful payment."
            });
        }

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

        const payment = await Payment.create({
            reservation: reservation._id,
            customer: reservation.customer,
            amount: paymentAmount,
            paymentMethod,
            referenceNumber,
            status,
            receiptNumber: status === "Paid" ? generateReceiptNumber() : undefined,
            paymentDate: new Date(),
            notes,
            receivedBy: req.user._id,
            verifiedAt: status === "Paid" ? new Date() : null
        });

        reservation.paymentStatus = status === "Paid" ? "Paid" : "Unpaid";
        await reservation.save();

        const populatedPayment = await Payment.findById(payment._id)
            .populate("customer", "fullName username phone")
            .populate({
                path: "reservation",
                populate: {
                    path: "court",
                    select: "name courtNumber"
                }
            })
            .populate("receivedBy", "fullName username");

        res.status(201).json({
            success: true,
            message: status === "Paid"
                ? "Payment recorded successfully. Receipt generated."
                : "Pending payment recorded successfully.",
            payment: populatedPayment
        });
    } catch (error) {
        console.error("Create Payment Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to record payment."
        });
    }
};

// PATCH /api/payments/:id/status
const updatePaymentStatus = async (req, res) => {
    try {
        const { status } = req.body;

        if (!["Pending", "Paid", "Rejected", "Refunded"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment status."
            });
        }

        const payment = await Payment.findById(req.params.id);

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment record not found."
            });
        }

        const allowedTransitions = {
            Pending: ["Paid", "Rejected"],
            Paid: ["Refunded"],
            Rejected: [],
            Refunded: []
        };

        if (!allowedTransitions[payment.status].includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot change payment status from ${payment.status} to ${status}.`
            });
        }

        const reservation = await Reservation.findById(payment.reservation);

        if (!reservation) {
            return res.status(404).json({
                success: false,
                message: "Related reservation not found."
            });
        }

        if (status === "Paid") {
            const anotherPaidPayment = await Payment.findOne({
                reservation: reservation._id,
                status: "Paid",
                _id: { $ne: payment._id }
            });

            if (anotherPaidPayment) {
                return res.status(409).json({
                    success: false,
                    message: "Another successful payment already exists for this reservation."
                });
            }

            payment.receiptNumber = payment.receiptNumber || generateReceiptNumber();
            payment.verifiedAt = new Date();
            reservation.paymentStatus = "Paid";
        }

        if (status === "Rejected") {
            reservation.paymentStatus = "Unpaid";
        }

        if (status === "Refunded") {
            reservation.paymentStatus = "Refunded";
        }

        payment.status = status;

        await payment.save();
        await reservation.save();

        const updatedPayment = await Payment.findById(payment._id)
            .populate("customer", "fullName username phone")
            .populate({
                path: "reservation",
                populate: {
                    path: "court",
                    select: "name courtNumber"
                }
            })
            .populate("receivedBy", "fullName username");

        res.status(200).json({
            success: true,
            message: `Payment status updated to ${status}.`,
            payment: updatedPayment
        });
    } catch (error) {
        console.error("Update Payment Status Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update payment status."
        });
    }
};

module.exports = {
    getPayments,
    getPaymentById,
    createPayment,
    updatePaymentStatus
};
