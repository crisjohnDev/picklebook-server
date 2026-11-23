
const SystemSetting = require("../models/SystemSetting");

const getBookingSettings = async () => {
    let settings = await SystemSetting.findOne({
        settingKey: "picklebook"
    });

    if (!settings) {
        settings = await SystemSetting.create({
            settingKey: "picklebook"
        });
    }

    return settings;
};

const timeToMinutes = (time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
};

const getReservationStartDate = (reservationDate, startTime) => {
    const date = new Date(reservationDate);
    const [hours, minutes] = startTime.split(":").map(Number);

    date.setHours(hours, minutes, 0, 0);

    return date;
};

const validateBookingRules = ({
    reservationDate,
    startTime,
    endTime,
    court,
    settings
}) => {
    const rules = settings.bookingRules;
    const date = new Date(reservationDate);

    if (Number.isNaN(date.getTime())) {
        return "Invalid reservation date.";
    }

    if (!startTime || !endTime) {
        return "Reservation start and end times are required.";
    }

    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    if (endMinutes <= startMinutes) {
        return "Reservation end time must be later than start time.";
    }

    const duration = endMinutes - startMinutes;

    if (duration < rules.minDurationMinutes) {
        return `Minimum booking duration is ${rules.minDurationMinutes} minutes.`;
    }

    if (duration > rules.maxDurationMinutes) {
        return `Maximum booking duration is ${rules.maxDurationMinutes} minutes.`;
    }

    const now = new Date();
    const bookingStart = getReservationStartDate(date, startTime);
    const bookingEnd = getReservationStartDate(date, endTime);

    if (bookingStart <= now) {
        return "You cannot book a reservation in the past.";
    }

    const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();

    if (sameDay && !rules.allowSameDayBookings) {
        return "Same-day bookings are currently not allowed.";
    }

    const minimumBookingTime = new Date(
        now.getTime() + rules.minAdvanceHours * 60 * 60 * 1000
    );

    if (bookingStart < minimumBookingTime) {
        return `Bookings must be made at least ${rules.minAdvanceHours} hours in advance.`;
    }

    const maximumBookingTime = new Date(
        now.getTime() + rules.maxAdvanceDays * 24 * 60 * 60 * 1000
    );

    if (bookingStart > maximumBookingTime) {
        return `Bookings can only be made up to ${rules.maxAdvanceDays} days in advance.`;
    }

    const dayNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday"
    ];

    const dayName = dayNames[date.getDay()];

    const facilityHours = settings.operatingHours.find(
        (item) => item.day === dayName
    );

    if (!facilityHours || !facilityHours.isOpen) {
        return `The facility is closed on ${dayName}.`;
    }

    if (
        startMinutes < timeToMinutes(facilityHours.openingTime) ||
        endMinutes > timeToMinutes(facilityHours.closingTime)
    ) {
        return `Reservations must be within facility operating hours (${facilityHours.openingTime} - ${facilityHours.closingTime}).`;
    }

    // Also respect the individual court's operating hours.
    if (
        court &&
        (
            startMinutes < timeToMinutes(court.openingTime) ||
            endMinutes > timeToMinutes(court.closingTime)
        )
    ) {
        return `This court is only available from ${court.openingTime} to ${court.closingTime}.`;
    }

    // Respect the court's configured slot duration.
    if (
        court?.slotDurationMinutes &&
        duration % court.slotDurationMinutes !== 0
    ) {
        return `Booking duration must use increments of ${court.slotDurationMinutes} minutes.`;
    }

    return null;
};

const calculateBookingAmount = ({
    startTime,
    endTime,
    court,
    settings
}) => {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);

    const baseRate = Number(court.hourlyRate);
    const peakHours = settings.pricing.peakHours.filter(
        (peak) => peak.isActive
    );

    let total = 0;

    // Calculate the rate minute-by-minute so a booking crossing
    // a peak-hour boundary receives the correct price for each part.
    for (let minute = start; minute < end; minute++) {
        const peak = peakHours.find((item) => {
            const peakStart = timeToMinutes(item.startTime);
            const peakEnd = timeToMinutes(item.endTime);

            return minute >= peakStart && minute < peakEnd;
        });

        const rate = peak ? Number(peak.hourlyRate) : baseRate;
        total += rate / 60;
    }

    return Number(total.toFixed(2));
};

const isCancellationAllowed = ({
    reservationDate,
    startTime,
    settings
}) => {
    const bookingStart = getReservationStartDate(
        reservationDate,
        startTime
    );

    const cutoffTime = new Date(
        bookingStart.getTime() -
        settings.bookingRules.cancellationCutoffHours * 60 * 60 * 1000
    );

    return new Date() <= cutoffTime;
};

module.exports = {
    getBookingSettings,
    validateBookingRules,
    calculateBookingAmount,
    isCancellationAllowed
};
