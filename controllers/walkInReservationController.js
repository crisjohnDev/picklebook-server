
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const mongoose = require("mongoose");

const User = require("../models/User");
const Court = require("../models/Court");
const Reservation = require("../models/Reservation");

const {
    getBookingSettings,
    validateBookingRules,
    calculateBookingAmount
} = require("../utils/bookingSettings");

const logActivity = require("../utils/activityLogger");

// ==========================================
// SAFE ACTIVITY LOGGER
// Activity logging must never cancel a booking.
// ==========================================

const safeLogActivity = async (activityData) => {
    try {
        await logActivity(activityData);
    } catch (error) {
        console.error("Activity Logging Failed:", error.message);
    }
};

// ==========================================
// TIME HELPERS
// ==========================================

// Convert HH:mm into minutes.
const timeToMinutes = (time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
};

// ==========================================
// DATE HELPERS
// ==========================================

// Validate and parse YYYY-MM-DD as a local date.
const parseLocalDate = (dateString) => {
    if (
        typeof dateString !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ) {
        return null;
    }

    const [year, month, day] = dateString
        .split("-")
        .map(Number);

    const date = new Date(year, month - 1, day);

    // Prevent invalid dates such as February 30.
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    date.setHours(0, 0, 0, 0);

    return date;
};

// ==========================================
// CREATE WALK-IN RESERVATION
// POST /api/reservations/walk-in
// ==========================================

const createWalkInReservation = async (req, res) => {
    let createdCustomer = null;
    let createdReservation = null;

    try {
        const {
            fullName,
            phone,
            courtId,
            reservationDate,
            startTime,
            endTime,
            notes
        } = req.body;

        // ==========================================
        // 1. VALIDATE REQUIRED FIELDS
        // ==========================================

        if (
            !fullName ||
            !phone ||
            !courtId ||
            !reservationDate ||
            !startTime ||
            !endTime
        ) {
            return res.status(400).json({
                success: false,
                message: "Please complete all required fields."
            });
        }

        if (!mongoose.Types.ObjectId.isValid(courtId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid court selected."
            });
        }

        const customerName = String(fullName).trim();
        const customerPhone = String(phone).trim();

        if (
            customerName.length < 2 ||
            customerName.length > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Customer name must be between 2 and 100 characters."
            });
        }

        if (
            customerPhone.length < 7 ||
            customerPhone.length > 20
        ) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid phone number."
            });
        }

        // ==========================================
        // 2. VALIDATE RESERVATION DATE
        // ==========================================

        const selectedDate = parseLocalDate(reservationDate);

        if (!selectedDate) {
            return res.status(400).json({
                success: false,
                message: "Invalid reservation date. Please use YYYY-MM-DD format."
            });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (selectedDate < today) {
            return res.status(400).json({
                success: false,
                message: "Reservation date cannot be in the past."
            });
        }

        // ==========================================
        // 3. VALIDATE RESERVATION TIME
        // ==========================================

        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

        if (
            typeof startTime !== "string" ||
            typeof endTime !== "string" ||
            !timeRegex.test(startTime) ||
            !timeRegex.test(endTime)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid reservation time format."
            });
        }

        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);

        if (endMinutes <= startMinutes) {
            return res.status(400).json({
                success: false,
                message: "End time must be later than start time."
            });
        }

        const duration = (endMinutes - startMinutes) / 60;

        // ==========================================
        // 4. FIND ACTIVE COURT
        // ==========================================

        const court = await Court.findOne({
            _id: courtId,
            isActive: true
        });

        if (!court) {
            return res.status(404).json({
                success: false,
                message: "Selected court does not exist or is inactive."
            });
        }

        // ==========================================
        // 5. VALIDATE BOOKING SETTINGS
        // ==========================================

        const settings = await getBookingSettings();

        const bookingError = validateBookingRules({
            reservationDate: selectedDate,
            startTime,
            endTime,
            court,
            settings
        });

        if (bookingError) {
            return res.status(400).json({
                success: false,
                message: bookingError
            });
        }

        // ==========================================
        // 6. CHECK RESERVATION CONFLICT
        // ==========================================

        const dayStart = new Date(selectedDate);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const conflictingReservation = await Reservation.findOne({
            court: courtId,
            reservationDate: {
                $gte: dayStart,
                $lt: dayEnd
            },
            status: {
                $in: ["Pending", "Confirmed", "Completed"]
            },
            startTime: {
                $lt: endTime
            },
            endTime: {
                $gt: startTime
            }
        });

        if (conflictingReservation) {
            return res.status(409).json({
                success: false,
                message: "This court is already reserved during the selected time."
            });
        }

        // ==========================================
        // 7. CALCULATE RESERVATION AMOUNT
        // ==========================================

        const totalAmount = calculateBookingAmount({
            startTime,
            endTime,
            court,
            settings
        });

        // ==========================================
        // 8. CREATE WALK-IN CUSTOMER
        // ==========================================

        const username = `walkin_${crypto.randomBytes(8).toString("hex")}`;

        const temporaryPassword = crypto.randomBytes(32).toString("hex");

        const hashedPassword = await bcrypt.hash(
            temporaryPassword,
            12
        );

        createdCustomer = await User.create({
            fullName: customerName,
            username,
            phone: customerPhone,
            password: hashedPassword,
            role: "customer",
            isActive: true
        });

        // ==========================================
        // 9. CREATE RESERVATION
        // ==========================================

        createdReservation = await Reservation.create({
            customer: createdCustomer._id,
            court: court._id,
            reservationDate: selectedDate,
            startTime,
            endTime,
            duration,
            totalAmount,
            status: "Pending",
            paymentStatus: "Unpaid",
            notes: notes?.trim()
                ? `Walk-in booking - ${String(notes).trim()}`
                : "Walk-in booking",
            createdBy: req.user._id
        });

        // ==========================================
        // 10. RECORD CUSTOMER ACTIVITY
        // ==========================================

        await safeLogActivity({
            actor: req.user,
            action: "walk_in_customer_created",
            description: `Walk-in customer ${customerName} was created.`,
            category: "customer",
            relatedId: createdCustomer._id,
            relatedModel: "User",
            metadata: {
                customerName,
                customerId: createdCustomer._id,
                phone: customerPhone,
                source: "walk_in"
            },
            notificationTitle: "New Walk-in Customer",
            notificationMessage: `${customerName} was added as a walk-in customer.`,
            recipientRole: "admin",
            link: "/admin/customers"
        });

        // ==========================================
        // 11. RECORD RESERVATION ACTIVITY
        // ==========================================

        await safeLogActivity({
            actor: req.user,
            action: "walk_in_reservation_created",
            description: `A walk-in reservation was created for ${customerName} at ${court.name || "the selected court"}.`,
            category: "reservation",
            relatedId: createdReservation._id,
            relatedModel: "Reservation",
            metadata: {
                customerName,
                customerId: createdCustomer._id,
                reservationId: createdReservation._id,
                courtName: court.name,
                courtId: court._id,
                reservationDate,
                startTime,
                endTime,
                duration,
                totalAmount,
                bookingType: "walk_in"
            },
            notificationTitle: "New Walk-in Reservation",
            notificationMessage: `${customerName} booked ${court.name || "a court"} on ${reservationDate} from ${startTime} to ${endTime}.`,
            recipientRole: "admin",
            link: "/admin/reservations"
        });

        // ==========================================
        // 12. POPULATE RESERVATION RESPONSE
        // ==========================================

        const populatedReservation = await Reservation.findById(
            createdReservation._id
        )
            .populate("customer", "fullName username phone")
            .populate("court", "name courtNumber")
            .populate("createdBy", "fullName username")
            .lean();

        // ==========================================
        // 13. SUCCESS RESPONSE
        // ==========================================

        return res.status(201).json({
            success: true,
            message: "Walk-in reservation created successfully.",

            customer: {
                _id: createdCustomer._id,
                fullName: createdCustomer.fullName,
                phone: createdCustomer.phone
            },

            reservation: populatedReservation
        });

    } catch (error) {

        // ==========================================
        // 14. CLEANUP IF SOMETHING FAILS
        // ==========================================

        console.error("Walk-In Reservation Error:", error);

        if (createdReservation) {
            await Reservation.findByIdAndDelete(
                createdReservation._id
            ).catch((cleanupError) => {
                console.error(
                    "Reservation cleanup error:",
                    cleanupError
                );
            });
        }

        if (createdCustomer) {
            await User.findByIdAndDelete(
                createdCustomer._id
            ).catch((cleanupError) => {
                console.error(
                    "Customer cleanup error:",
                    cleanupError
                );
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to create walk-in reservation.",
            error: error.message
        });
    }
};

// ==========================================
// EXPORT CONTROLLER
// ==========================================

module.exports = {
    createWalkInReservation
};
