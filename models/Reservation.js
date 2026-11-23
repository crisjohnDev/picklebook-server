
const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema(
    {
        // Customer who owns the reservation
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Customer is required"]
        },

        // Court being reserved
        court: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Court",
            required: [true, "Court is required"]
        },

        // Date of the reservation
        reservationDate: {
            type: Date,
            required: [true, "Reservation date is required"]
        },

        // Reservation time using 24-hour format (HH:mm)
        startTime: {
            type: String,
            required: [true, "Start time is required"],
            match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid start time"]
        },

        endTime: {
            type: String,
            required: [true, "End time is required"],
            match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid end time"]
        },

        // Total number of reserved hours
        duration: {
            type: Number,
            required: true,
            min: [0.5, "Minimum reservation duration is 30 minutes"]
        },

        // Price calculated using the court's hourly rate
        totalAmount: {
            type: Number,
            required: true,
            min: [0, "Total amount cannot be negative"]
        },

        // Reservation status
        status: {
            type: String,
            enum: ["Pending", "Confirmed", "Cancelled", "Completed"],
            default: "Pending"
        },

        // Payment status
        paymentStatus: {
            type: String,
            enum: ["Unpaid", "Paid", "Refunded"],
            default: "Unpaid"
        },

        // Optional notes from the administrator
        notes: {
            type: String,
            trim: true,
            maxlength: 500,
            default: ""
        },

        // Administrator who created the reservation
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        }
    },
    {
        timestamps: true
    }
);

// Indexes for faster reservation searches
reservationSchema.index({
    court: 1,
    reservationDate: 1,
    status: 1
});

reservationSchema.index({
    customer: 1,
    reservationDate: -1
});

module.exports = mongoose.model("Reservation", reservationSchema);
