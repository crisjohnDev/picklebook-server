
const mongoose = require("mongoose");

const Court = require("../models/Court");
const Reservation = require("../models/Reservation");

const timeToMinutes = (time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
};

const minutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const getSchedule = async (req, res) => {
    try {
        const { courtId, date } = req.query;

        if (!courtId || !mongoose.Types.ObjectId.isValid(courtId)) {
            return res.status(400).json({
                success: false,
                message: "A valid court ID is required."
            });
        }

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                message: "A valid date is required (YYYY-MM-DD)."
            });
        }

        const [year, month, day] = date.split("-").map(Number);
        const selectedDate = new Date(year, month - 1, day);

        if (
            selectedDate.getFullYear() !== year ||
            selectedDate.getMonth() !== month - 1 ||
            selectedDate.getDate() !== day
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid calendar date."
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

        const startOfDay = new Date(year, month - 1, day);
        const endOfDay = new Date(year, month - 1, day + 1);

        const reservations = await Reservation.find({
            court: courtId,
            reservationDate: {
                $gte: startOfDay,
                $lt: endOfDay
            },
            status: {
                $nin: ["Cancelled"]
            }
        })
            .populate("customer", "fullName username")
            .sort({ startTime: 1 });

        const openingMinutes = timeToMinutes(court.openingTime);
        const closingMinutes = timeToMinutes(court.closingTime);
        const slotDuration = court.slotDurationMinutes;

        const now = new Date();

        const slots = [];

        for (
            let start = openingMinutes;
            start + slotDuration <= closingMinutes;
            start += slotDuration
        ) {
            const end = start + slotDuration;

            const startTime = minutesToTime(start);
            const endTime = minutesToTime(end);

            const overlappingReservation = reservations.find((reservation) => {
                const reservationStart = timeToMinutes(reservation.startTime);
                const reservationEnd = timeToMinutes(reservation.endTime);

                return start < reservationEnd && end > reservationStart;
            });

            const slotDateTime = new Date(
                year,
                month - 1,
                day,
                Math.floor(start / 60),
                start % 60
            );

            let status = "Available";

            if (overlappingReservation) {
                status = "Reserved";
            } else if (slotDateTime < now) {
                status = "Past";
            }

            slots.push({
                startTime,
                endTime,
                status,
                reservation: overlappingReservation || null,
                hourlyRate: court.hourlyRate,
                amount: (court.hourlyRate * slotDuration) / 60
            });
        }

        return res.status(200).json({
            success: true,
            date,
            court: {
                _id: court._id,
                name: court.name,
                courtNumber: court.courtNumber,
                openingTime: court.openingTime,
                closingTime: court.closingTime,
                slotDurationMinutes: court.slotDurationMinutes,
                hourlyRate: court.hourlyRate
            },
            totalSlots: slots.length,
            availableSlots: slots.filter(
                (slot) => slot.status === "Available"
            ).length,
            reservedSlots: slots.filter(
                (slot) => slot.status === "Reserved"
            ).length,
            slots
        });

    } catch (error) {
        console.error("Get Schedule Error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve court schedule."
        });
    }
};

module.exports = {
    getSchedule
};
