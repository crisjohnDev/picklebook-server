
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const Reservation = require("../models/Reservation");
const Court = require("../models/Court");
const User = require("../models/User");

const logActivity = require("../utils/activityLogger");

const {
    getBookingSettings,
    validateBookingRules,
    calculateBookingAmount,
    isCancellationAllowed
} = require("../utils/bookingSettings");

// ==========================================
// HELPER FUNCTIONS
// ==========================================

const timeToMinutes = (time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
};

const calculateDuration = (startTime, endTime) => {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);

    return (end - start) / 60;
};

const getDateRange = (date) => {
    const selectedDate = new Date(date);

    if (Number.isNaN(selectedDate.getTime())) {
        return null;
    }

    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return { start, end };
};

const hasReservationConflict = async ({
    courtId,
    reservationDate,
    startTime,
    endTime,
    excludeId = null
}) => {
    const dateRange = getDateRange(reservationDate);

    if (!dateRange) {
        throw new Error("Invalid reservation date.");
    }

    const query = {
        court: courtId,
        reservationDate: {
            $gte: dateRange.start,
            $lt: dateRange.end
        },
        status: {
            $in: ["Pending", "Confirmed", "Completed"]
        },
        startTime: { $lt: endTime },
        endTime: { $gt: startTime }
    };

    if (excludeId) {
        query._id = { $ne: excludeId };
    }

    const existingReservation = await Reservation.findOne(query);

    return Boolean(existingReservation);
};

// ==========================================
// SAFE ACTIVITY LOGGER
// ==========================================

// Activity logging must never interrupt a successful booking.
// The logger should also catch its own database errors, but this
// wrapper provides an additional safety layer.

const safeLogActivity = async (activityData) => {
    try {
        await logActivity(activityData);
    } catch (error) {
        console.error("Activity Logging Failed:", error.message);
    }
};

// ==========================================
// RESERVATION ACTIVITY
// ==========================================

const recordReservationActivity = async ({
    req,
    reservation,
    action,
    description,
    notificationTitle,
    notificationMessage,
    metadata = {}
}) => {
    if (!reservation?._id) {
        return;
    }

    await safeLogActivity({
        actor: req.user,
        action,
        description,
        category: "reservation",
        relatedId: reservation._id,
        relatedModel: "Reservation",
        metadata,
        notificationTitle,
        notificationMessage,
        recipientRole: "admin",
        link: "/admin/reservations"
    });
};

// ==========================================
// CUSTOMER ACTIVITY
// ==========================================

const recordCustomerActivity = async ({
    req,
    customer,
    action,
    description,
    notificationTitle,
    notificationMessage,
    metadata = {}
}) => {
    if (!customer?._id) {
        return;
    }

    await safeLogActivity({
        actor: req.user,
        action,
        description,
        category: "customer",
        relatedId: customer._id,
        relatedModel: "User",
        metadata,
        notificationTitle,
        notificationMessage,
        recipientRole: "admin",
        link: "/admin/customers"
    });
};

// ==========================================
// GET ALL RESERVATIONS
// ==========================================

const getReservations = async (req, res) => {
    try {
        const {
            search,
            status,
            paymentStatus,
            date
        } = req.query;

        const query = {};

        if (status && status !== "All") {
            query.status = status;
        }

        if (paymentStatus && paymentStatus !== "All") {
            query.paymentStatus = paymentStatus;
        }

        if (date) {
            const dateRange = getDateRange(date);

            if (!dateRange) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid date filter."
                });
            }

            query.reservationDate = {
                $gte: dateRange.start,
                $lt: dateRange.end
            };
        }

        let reservations = await Reservation.find(query)
            .populate("customer", "fullName username phone")
            .populate("court", "name courtNumber hourlyRate")
            .populate("createdBy", "fullName username")
            .sort({ reservationDate: -1, startTime: 1 });

        if (search) {
            const keyword = search.toLowerCase();

            reservations = reservations.filter((reservation) => {
                const customerName =
                    reservation.customer?.fullName?.toLowerCase() || "";

                const username =
                    reservation.customer?.username?.toLowerCase() || "";

                const courtName =
                    reservation.court?.name?.toLowerCase() || "";

                const courtNumber =
                    reservation.court?.courtNumber?.toLowerCase() || "";

                return (
                    customerName.includes(keyword) ||
                    username.includes(keyword) ||
                    courtName.includes(keyword) ||
                    courtNumber.includes(keyword)
                );
            });
        }

        return res.status(200).json({
            success: true,
            count: reservations.length,
            reservations
        });

    } catch (error) {
        console.error("Get Reservations Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve reservations.",
            error: error.message
        });
    }
};

// ==========================================
// GET SINGLE RESERVATION
// ==========================================

const getReservationById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid reservation ID."
            });
        }

        const reservation = await Reservation.findById(id)
            .populate("customer", "fullName username phone")
            .populate("court", "name courtNumber hourlyRate")
            .populate("createdBy", "fullName username");

        if (!reservation) {
            return res.status(404).json({
                success: false,
                message: "Reservation not found."
            });
        }

        return res.status(200).json({
            success: true,
            reservation
        });

    } catch (error) {
        console.error("Get Reservation Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve reservation.",
            error: error.message
        });
    }
};

// ==========================================
// CREATE RESERVATION
// ==========================================

const createReservation = async (req, res) => {
    try {
        const {
            customerId,
            courtId,
            reservationDate,
            startTime,
            endTime,
            notes
        } = req.body;

        if (
            !customerId ||
            !courtId ||
            !reservationDate ||
            !startTime ||
            !endTime
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Customer, court, date, start time, and end time are required."
            });
        }

        if (
            !mongoose.Types.ObjectId.isValid(customerId) ||
            !mongoose.Types.ObjectId.isValid(courtId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid customer or court ID."
            });
        }

        const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

        if (
            !timePattern.test(startTime) ||
            !timePattern.test(endTime)
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide valid times in HH:mm format."
            });
        }

        const duration = calculateDuration(startTime, endTime);

        if (duration <= 0) {
            return res.status(400).json({
                success: false,
                message: "End time must be later than start time."
            });
        }

        const dateRange = getDateRange(reservationDate);

        if (!dateRange) {
            return res.status(400).json({
                success: false,
                message: "Invalid reservation date."
            });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateRange.start < today) {
            return res.status(400).json({
                success: false,
                message: "Past reservation dates are not allowed."
            });
        }

        const customer = await User.findOne({
            _id: customerId,
            role: "customer",
            isActive: true
        });

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Active customer account not found."
            });
        }

        const court = await Court.findOne({
            _id: courtId,
            isActive: true
        });

        if (!court) {
            return res.status(404).json({
                success: false,
                message: "Active court not found."
            });
        }

        const settings = await getBookingSettings();

        const bookingError = validateBookingRules({
            reservationDate: dateRange.start,
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

        const conflict = await hasReservationConflict({
            courtId,
            reservationDate: dateRange.start,
            startTime,
            endTime
        });

        if (conflict) {
            return res.status(409).json({
                success: false,
                message:
                    "This court already has a reservation during the selected time."
            });
        }

        const totalAmount = calculateBookingAmount({
            startTime,
            endTime,
            court,
            settings
        });

        const reservation = await Reservation.create({
            customer: customerId,
            court: courtId,
            reservationDate: dateRange.start,
            startTime,
            endTime,
            duration,
            totalAmount,
            notes: notes || "",
            createdBy: req.user._id || req.user.id
        });

        const populatedReservation = await Reservation.findById(
            reservation._id
        )
            .populate("customer", "fullName username phone")
            .populate(
                "court",
                "name courtNumber hourlyRate openingTime closingTime"
            )
            .populate("createdBy", "fullName username");

        await recordReservationActivity({
            req,
            reservation,
            action: "reservation_created",
            description:
                `Created a reservation for ${customer.fullName} ` +
                `at ${court.name}.`,
            notificationTitle: "New Reservation",
            notificationMessage:
                `${customer.fullName} booked ${court.name}.`,
            metadata: {
                customerName: customer.fullName,
                courtName: court.name,
                reservationDate: reservation.reservationDate,
                startTime,
                endTime,
                totalAmount
            }
        });

        return res.status(201).json({
            success: true,
            message: "Reservation created successfully.",
            reservation: populatedReservation
        });

    } catch (error) {
        console.error("Create Reservation Error:", error);

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to create reservation.",
            error: error.message
        });
    }
};

// ==========================================
// CREATE WALK-IN CUSTOMER AND RESERVATION
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

        // 1. Validate required fields
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
                message:
                    "Customer name, phone, court, date, start time, and end time are required."
            });
        }

        // 2. Validate customer information
        const customerName = String(fullName).trim();
        const customerPhone = String(phone).trim();

        if (customerName.length < 2 || customerName.length > 100) {
            return res.status(400).json({
                success: false,
                message:
                    "Customer name must be between 2 and 100 characters."
            });
        }

        if (customerPhone.length < 7 || customerPhone.length > 20) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid contact number."
            });
        }

        // 3. Validate court ID
        if (!mongoose.Types.ObjectId.isValid(courtId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid court ID."
            });
        }

        // 4. Validate time format
        const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

        if (
            !timePattern.test(startTime) ||
            !timePattern.test(endTime)
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide valid times in HH:mm format."
            });
        }

        const duration = calculateDuration(startTime, endTime);

        if (duration <= 0) {
            return res.status(400).json({
                success: false,
                message: "End time must be later than start time."
            });
        }

        // 5. Validate reservation date
        const dateRange = getDateRange(reservationDate);

        if (!dateRange) {
            return res.status(400).json({
                success: false,
                message: "Invalid reservation date."
            });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateRange.start < today) {
            return res.status(400).json({
                success: false,
                message: "Past reservation dates are not allowed."
            });
        }

        // 6. Find active court
        const court = await Court.findOne({
            _id: courtId,
            isActive: true
        });

        if (!court) {
            return res.status(404).json({
                success: false,
                message: "Active court not found."
            });
        }

        // 7. Load booking settings
        const settings = await getBookingSettings();

        // 8. Validate booking rules
        const bookingError = validateBookingRules({
            reservationDate: dateRange.start,
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

        // 9. Check court availability
        const conflict = await hasReservationConflict({
            courtId,
            reservationDate: dateRange.start,
            startTime,
            endTime
        });

        if (conflict) {
            return res.status(409).json({
                success: false,
                message:
                    "This court already has a reservation during the selected time."
            });
        }

        // 10. Calculate total amount
        const totalAmount = calculateBookingAmount({
            startTime,
            endTime,
            court,
            settings
        });

        // 11. Generate private customer credentials
        const randomSuffix = crypto.randomBytes(6).toString("hex");

        const username =
            `walkin_${Date.now().toString(36)}_${randomSuffix}`;

        const randomPassword = crypto.randomBytes(32).toString("hex");

        const hashedPassword = await bcrypt.hash(randomPassword, 12);

        // 12. Create walk-in customer
        createdCustomer = await User.create({
            fullName: customerName,
            username,
            phone: customerPhone,
            password: hashedPassword,
            role: "customer",
            isActive: true
        });

        // 13. Create reservation
        createdReservation = await Reservation.create({
            customer: createdCustomer._id,
            court: courtId,
            reservationDate: dateRange.start,
            startTime,
            endTime,
            duration,
            totalAmount,
            notes: notes || "Walk-in booking",
            createdBy: req.user._id || req.user.id
        });

        // 14. Record CUSTOMER activity
        // This creates a separate ActivityLog document.
        await recordCustomerActivity({
            req,
            customer: createdCustomer,
            action: "walk_in_customer_created",
            description:
                `Registered a new walk-in customer: ${customerName}.`,
            notificationTitle: "New Walk-in Customer",
            notificationMessage:
                `${customerName} was registered as a walk-in customer.`,
            metadata: {
                customerName,
                customerId: createdCustomer._id.toString(),
                source: "walk-in reservation"
            }
        });

        // 15. Record RESERVATION activity
        await recordReservationActivity({
            req,
            reservation: createdReservation,
            action: "walk_in_reservation_created",
            description:
                `Created a walk-in reservation for ${customerName} ` +
                `at ${court.name}.`,
            notificationTitle: "New Walk-in Reservation",
            notificationMessage:
                `${customerName} was registered for a walk-in booking ` +
                `at ${court.name}.`,
            metadata: {
                customerName,
                courtName: court.name,
                reservationDate: createdReservation.reservationDate,
                startTime,
                endTime,
                totalAmount,
                bookingType: "walk-in"
            }
        });

        // 16. Populate reservation details
        const populatedReservation = await Reservation.findById(
            createdReservation._id
        )
            .populate("customer", "fullName username phone")
            .populate("court", "name courtNumber hourlyRate")
            .populate("createdBy", "fullName username");

        // 17. Return success
        return res.status(201).json({
            success: true,
            message:
                "Walk-in customer and reservation created successfully.",
            customer: {
                _id: createdCustomer._id,
                fullName: createdCustomer.fullName,
                phone: createdCustomer.phone,
                role: createdCustomer.role
            },
            reservation: populatedReservation
        });

    } catch (error) {
        console.error("Walk-In Reservation Error:", error);

        // Clean up only records created by this failed request.
        if (createdReservation?._id) {
            try {
                await Reservation.findByIdAndDelete(
                    createdReservation._id
                );
            } catch (cleanupError) {
                console.error(
                    "Walk-In Reservation Cleanup Error:",
                    cleanupError.message
                );
            }
        }

        if (createdCustomer?._id) {
            try {
                await User.findByIdAndDelete(createdCustomer._id);
            } catch (cleanupError) {
                console.error(
                    "Walk-In Customer Cleanup Error:",
                    cleanupError.message
                );
            }
        }

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message:
                    "A duplicate customer record was detected. Please try again."
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message
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
// UPDATE RESERVATION
// ==========================================

const updateReservation = async (req, res) => {
    try {
        const { id } = req.params;

        const {
            customerId,
            courtId,
            reservationDate,
            startTime,
            endTime,
            notes
        } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid reservation ID."
            });
        }

        const reservation = await Reservation.findById(id);

        if (!reservation) {
            return res.status(404).json({
                success: false,
                message: "Reservation not found."
            });
        }

        if (
            reservation.status === "Cancelled" ||
            reservation.status === "Completed"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Cancelled or completed reservations cannot be edited."
            });
        }

        const nextCustomerId =
            customerId || reservation.customer.toString();

        const nextCourtId =
            courtId || reservation.court.toString();

        const nextDate =
            reservationDate || reservation.reservationDate;

        const nextStartTime =
            startTime || reservation.startTime;

        const nextEndTime =
            endTime || reservation.endTime;

        if (
            !mongoose.Types.ObjectId.isValid(nextCustomerId) ||
            !mongoose.Types.ObjectId.isValid(nextCourtId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid customer or court ID."
            });
        }

        const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

        if (
            !timePattern.test(nextStartTime) ||
            !timePattern.test(nextEndTime)
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide valid times in HH:mm format."
            });
        }

        const duration = calculateDuration(
            nextStartTime,
            nextEndTime
        );

        if (duration < 0.5) {
            return res.status(400).json({
                success: false,
                message:
                    "End time must be later than start time and the minimum duration is 30 minutes."
            });
        }

        const dateRange = getDateRange(nextDate);

        if (!dateRange) {
            return res.status(400).json({
                success: false,
                message: "Invalid reservation date."
            });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateRange.start < today) {
            return res.status(400).json({
                success: false,
                message: "Past reservation dates are not allowed."
            });
        }

        const customer = await User.findOne({
            _id: nextCustomerId,
            role: "customer",
            isActive: true
        });

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Active customer account not found."
            });
        }

        const court = await Court.findOne({
            _id: nextCourtId,
            isActive: true
        });

        if (!court) {
            return res.status(404).json({
                success: false,
                message: "Active court not found."
            });
        }

        const conflict = await hasReservationConflict({
            courtId: nextCourtId,
            reservationDate: nextDate,
            startTime: nextStartTime,
            endTime: nextEndTime,
            excludeId: id
        });

        if (conflict) {
            return res.status(409).json({
                success: false,
                message:
                    "This court already has a reservation during the selected time."
            });
        }

        const previousValues = {
            customer: reservation.customer.toString(),
            court: reservation.court.toString(),
            reservationDate: reservation.reservationDate,
            startTime: reservation.startTime,
            endTime: reservation.endTime,
            totalAmount: reservation.totalAmount
        };

        reservation.customer = nextCustomerId;
        reservation.court = nextCourtId;
        reservation.reservationDate = dateRange.start;
        reservation.startTime = nextStartTime;
        reservation.endTime = nextEndTime;
        reservation.duration = duration;

        reservation.totalAmount = Number(
            (duration * court.hourlyRate).toFixed(2)
        );

        if (notes !== undefined) {
            reservation.notes = notes;
        }

        await reservation.save();

        const updatedReservation = await Reservation.findById(id)
            .populate("customer", "fullName username phone")
            .populate("court", "name courtNumber hourlyRate")
            .populate("createdBy", "fullName username");

        await recordReservationActivity({
            req,
            reservation,
            action: "reservation_updated",
            description:
                `Updated the reservation for ` +
                `${updatedReservation.customer?.fullName || "a customer"} ` +
                `at ${updatedReservation.court?.name || "a court"}.`,
            notificationTitle: "Reservation Updated",
            notificationMessage:
                `A reservation for ` +
                `${updatedReservation.customer?.fullName || "a customer"} ` +
                `has been updated.`,
            metadata: {
                previousValues,
                updatedValues: {
                    customerName:
                        updatedReservation.customer?.fullName,
                    courtName:
                        updatedReservation.court?.name,
                    reservationDate:
                        updatedReservation.reservationDate,
                    startTime: updatedReservation.startTime,
                    endTime: updatedReservation.endTime,
                    totalAmount: updatedReservation.totalAmount
                }
            }
        });

        return res.status(200).json({
            success: true,
            message: "Reservation updated successfully.",
            reservation: updatedReservation
        });

    } catch (error) {
        console.error("Update Reservation Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update reservation.",
            error: error.message
        });
    }
};

// ==========================================
// UPDATE RESERVATION STATUS
// ==========================================

const updateReservationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const allowedStatuses = [
            "Pending",
            "Confirmed",
            "Cancelled",
            "Completed"
        ];

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid reservation ID."
            });
        }

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid reservation status."
            });
        }

        const reservation = await Reservation.findById(id);

        if (!reservation) {
            return res.status(404).json({
                success: false,
                message: "Reservation not found."
            });
        }

        if (
            reservation.status === "Cancelled" ||
            reservation.status === "Completed"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "This reservation is already finalized."
            });
        }

        const previousStatus = reservation.status;

        reservation.status = status;

        await reservation.save();

        const populatedReservation = await Reservation.findById(id)
            .populate("customer", "fullName username")
            .populate("court", "name courtNumber");

        await recordReservationActivity({
            req,
            reservation,
            action: "reservation_status_updated",
            description:
                `Changed reservation status from ${previousStatus} ` +
                `to ${status}.`,
            notificationTitle: "Reservation Status Updated",
            notificationMessage:
                `Reservation status changed from ${previousStatus} ` +
                `to ${status}.`,
            metadata: {
                previousStatus,
                newStatus: status,
                customerName:
                    populatedReservation.customer?.fullName,
                courtName:
                    populatedReservation.court?.name
            }
        });

        return res.status(200).json({
            success: true,
            message: "Reservation status updated successfully.",
            reservation: populatedReservation
        });

    } catch (error) {
        console.error("Update Reservation Status Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update reservation status.",
            error: error.message
        });
    }
};

// ==========================================
// EXPORT CONTROLLER FUNCTIONS
// ==========================================

module.exports = {
    getReservations,
    getReservationById,
    createReservation,
    createWalkInReservation,
    updateReservation,
    updateReservationStatus
};
