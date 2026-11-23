
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
    {
        reservation: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Reservation",
            required: true,
            index: true
        },

        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        amount: {
            type: Number,
            required: [true, "Payment amount is required"],
            min: [0.01, "Payment amount must be greater than zero"]
        },

        paymentMethod: {
            type: String,
            enum: ["Cash", "GCash", "Bank Transfer", "Card", "Other"],
            required: true
        },

        referenceNumber: {
            type: String,
            trim: true,
            default: ""
        },

        status: {
            type: String,
            enum: ["Pending", "Paid", "Rejected", "Refunded"],
            default: "Pending",
            index: true
        },

        receiptNumber: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },

        paymentDate: {
            type: Date,
            default: Date.now
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 500,
            default: ""
        },

        receivedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        verifiedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

paymentSchema.index({ status: 1, paymentDate: -1 });
paymentSchema.index({ customer: 1, paymentDate: -1 });

module.exports = mongoose.model("Payment", paymentSchema);
