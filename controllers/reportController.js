
const Payment = require("../models/Payment");
const Reservation = require("../models/Reservation");

// ==========================================
// TIMEZONE CONFIGURATION
// ==========================================

const TIMEZONE = "Asia/Manila";
const TIMEZONE_OFFSET = 8 * 60 * 60 * 1000;

// Get date/time parts in Philippine timezone.
const getManilaParts = (date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    }).formatToParts(date);

    const result = {};

    parts.forEach((part) => {
        if (part.type !== "literal") {
            result[part.type] = Number(part.value);
        }
    });

    return result;
};

// ==========================================
// DATE HELPERS
// ==========================================

const pad = (value) => String(value).padStart(2, "0");

// Convert a date into YYYY-MM-DD using Manila time.
const toDateKey = (date) => {
    const parts = getManilaParts(date);

    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
};

// Parse YYYY-MM-DD without depending on server timezone.
const parseDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
        return null;
    }

    const [year, month, day] = value.split("-").map(Number);

    const test = new Date(Date.UTC(year, month - 1, day));

    if (
        test.getUTCFullYear() !== year ||
        test.getUTCMonth() !== month - 1 ||
        test.getUTCDate() !== day
    ) {
        return null;
    }

    return { year, month, day };
};

// Convert Philippine calendar date/time into a UTC Date.
// Philippines has no daylight-saving time and uses UTC+8.
const manilaDate = (year, month, day, hour = 0) => {
    return new Date(
        Date.UTC(year, month - 1, day, hour) - TIMEZONE_OFFSET
    );
};

// Add calendar days without using the server timezone.
const addCalendarDays = (date, days) => {
    const result = new Date(
        Date.UTC(date.year, date.month - 1, date.day + days)
    );

    return {
        year: result.getUTCFullYear(),
        month: result.getUTCMonth() + 1,
        day: result.getUTCDate()
    };
};

// ==========================================
// REPORT DATE RANGE
// ==========================================

const getPeriodRange = (period, selectedDate) => {
    let startDate;
    let endDate;

    if (period === "daily") {
        startDate = selectedDate;
        endDate = addCalendarDays(selectedDate, 1);
    }

    else if (period === "weekly") {
        const selected = new Date(
            Date.UTC(
                selectedDate.year,
                selectedDate.month - 1,
                selectedDate.day
            )
        );

        const day = selected.getUTCDay();

        // Monday is the first day of the week.
        const difference = day === 0 ? -6 : 1 - day;

        startDate = addCalendarDays(selectedDate, difference);
        endDate = addCalendarDays(startDate, 7);
    }

    else if (period === "monthly") {
        startDate = {
            year: selectedDate.year,
            month: selectedDate.month,
            day: 1
        };

        const nextMonth = new Date(
            Date.UTC(
                selectedDate.year,
                selectedDate.month,
                1
            )
        );

        endDate = {
            year: nextMonth.getUTCFullYear(),
            month: nextMonth.getUTCMonth() + 1,
            day: 1
        };
    }

    else {
        return null;
    }

    return {
        start: manilaDate(
            startDate.year,
            startDate.month,
            startDate.day
        ),

        end: manilaDate(
            endDate.year,
            endDate.month,
            endDate.day
        ),

        startDate,
        endDate
    };
};

// ==========================================
// CHART BUCKETS
// ==========================================

const createBuckets = (period, range) => {
    const buckets = [];

    // Daily: 24 hourly buckets.
    if (period === "daily") {
        for (let hour = 0; hour < 24; hour++) {
            buckets.push({
                key: String(hour),

                label: `${hour % 12 || 12} ${
                    hour < 12 ? "AM" : "PM"
                }`,

                revenue: 0,
                bookings: 0
            });
        }

        return buckets;
    }

    // Weekly/monthly: one bucket per calendar day.
    const current = { ...range.startDate };

    while (
        current.year < range.endDate.year ||
        (
            current.year === range.endDate.year &&
            (
                current.month < range.endDate.month ||
                (
                    current.month === range.endDate.month &&
                    current.day < range.endDate.day
                )
            )
        )
    ) {
        const key = [
            current.year,
            pad(current.month),
            pad(current.day)
        ].join("-");

        const calendarDate = new Date(
            Date.UTC(
                current.year,
                current.month - 1,
                current.day
            )
        );

        buckets.push({
            key,

            label: period === "weekly"
                ? calendarDate.toLocaleDateString("en-PH", {
                    weekday: "short",
                    timeZone: "UTC"
                })
                : String(current.day),

            revenue: 0,
            bookings: 0
        });

        const next = addCalendarDays(current, 1);
        Object.assign(current, next);
    }

    return buckets;
};

// ==========================================
// BUCKET KEY
// ==========================================

const getBucketKey = (date, period) => {
    const parts = getManilaParts(date);

    if (period === "daily") {
        return String(parts.hour);
    }

    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
};

// ==========================================
// NORMALIZE STATUS
// ==========================================

const normalizeStatus = (status) => {
    return String(status || "").trim().toLowerCase();
};

// ==========================================
// SAFE NUMBER
// ==========================================

const toNumber = (value) => {
    const number = Number(value);

    return Number.isFinite(number) ? number : 0;
};

// ==========================================
// GET RESERVATION START HOUR
// ==========================================

const getReservationHour = (startTime) => {
    if (!startTime) {
        return null;
    }

    const match = String(startTime).match(/^(\d{1,2}):\d{2}/);

    if (!match) {
        return null;
    }

    const hour = Number(match[1]);

    return hour >= 0 && hour <= 23 ? hour : null;
};

// ==========================================
// GET REPORTS
// GET /api/reports?period=daily&date=2026-11-24
// ==========================================

const getReports = async (req, res) => {
    try {
        const {
            period = "daily",
            date
        } = req.query;

        // --------------------------------------
        // VALIDATE PERIOD
        // --------------------------------------

        if (!["daily", "weekly", "monthly"].includes(period)) {
            return res.status(400).json({
                success: false,
                message: "Invalid report period."
            });
        }

        // --------------------------------------
        // VALIDATE DATE
        // --------------------------------------

        const selectedDate = parseDate(date);

        if (!selectedDate) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid date in YYYY-MM-DD format."
            });
        }

        // --------------------------------------
        // GET DATE RANGE
        // --------------------------------------

        const range = getPeriodRange(period, selectedDate);

        if (!range) {
            return res.status(400).json({
                success: false,
                message: "Unable to determine report date range."
            });
        }

        const { start, end } = range;

        // --------------------------------------
        // DATABASE QUERIES
        // --------------------------------------
        // IMPORTANT:
        // These fields must match your Mongoose schemas:
        // Payment.paymentDate
        // Reservation.reservationDate

        const [payments, reservations] = await Promise.all([
            Payment.find({
                paymentDate: {
                    $gte: start,
                    $lt: end
                }
            })
                .select("amount status paymentDate paymentMethod")
                .lean(),

            Reservation.find({
                reservationDate: {
                    $gte: start,
                    $lt: end
                }
            })
                .select(
                    "status paymentStatus totalAmount startTime reservationDate"
                )
                .lean()
        ]);

        // --------------------------------------
        // DEBUG LOGS
        // --------------------------------------

        console.log("========== REPORT DEBUG ==========");
        console.log("Period:", period);
        console.log("Selected Date:", date);
        console.log("Timezone:", TIMEZONE);
        console.log("Start:", start.toISOString());
        console.log("End:", end.toISOString());
        console.log("Payments found:", payments.length);
        console.log("Reservations found:", reservations.length);
        console.log("==================================");

        // --------------------------------------
        // CREATE CHART BUCKETS
        // --------------------------------------

        const buckets = createBuckets(period, range);

        const bucketMap = new Map(
            buckets.map((bucket) => [bucket.key, bucket])
        );

        // ======================================
        // PAYMENT STATISTICS
        // ======================================

        let totalRevenue = 0;

        let paidPayments = 0;
        let pendingPayments = 0;
        let rejectedPayments = 0;
        let refundedPayments = 0;

        let refundedAmount = 0;

        payments.forEach((payment) => {
            const status = normalizeStatus(payment.status);
            const amount = toNumber(payment.amount);

            const paymentDate = new Date(payment.paymentDate);

            const key = getBucketKey(paymentDate, period);
            const bucket = bucketMap.get(key);

            if (status === "paid") {
                totalRevenue += amount;
                paidPayments += 1;

                if (bucket) {
                    bucket.revenue += amount;
                }
            }

            else if (status === "pending") {
                pendingPayments += 1;
            }

            else if (status === "rejected") {
                rejectedPayments += 1;
            }

            else if (status === "refunded") {
                refundedPayments += 1;
                refundedAmount += amount;
            }
        });

        // ======================================
        // RESERVATION STATISTICS
        // ======================================

        let confirmedReservations = 0;
        let completedReservations = 0;
        let cancelledReservations = 0;
        let pendingReservations = 0;

        reservations.forEach((reservation) => {
            const status = normalizeStatus(reservation.status);

            const reservationDate = new Date(
                reservation.reservationDate
            );

            let key;

            if (period === "daily") {
                const hour = getReservationHour(
                    reservation.startTime
                );

                key = hour === null ? null : String(hour);
            } else {
                key = getBucketKey(reservationDate, period);
            }

            const bucket = bucketMap.get(key);

            if (bucket) {
                bucket.bookings += 1;
            }

            if (status === "confirmed") {
                confirmedReservations += 1;
            }

            else if (status === "completed") {
                completedReservations += 1;
            }

            else if (status === "cancelled") {
                cancelledReservations += 1;
            }

            else if (status === "pending") {
                pendingReservations += 1;
            }
        });

        const totalReservations = reservations.length;

        // ======================================
        // PAYMENT METHOD BREAKDOWN
        // ======================================

        const paymentMethods = {};

        payments.forEach((payment) => {
            const method = payment.paymentMethod || "Other";

            if (!paymentMethods[method]) {
                paymentMethods[method] = {
                    count: 0,
                    amount: 0
                };
            }

            paymentMethods[method].count += 1;

            if (normalizeStatus(payment.status) === "paid") {
                paymentMethods[method].amount += toNumber(
                    payment.amount
                );
            }
        });

        // ======================================
        // FINAL RESPONSE
        // ======================================

        return res.status(200).json({
            success: true,

            period,

            selectedDate: [
                selectedDate.year,
                pad(selectedDate.month),
                pad(selectedDate.day)
            ].join("-"),

            dateRange: {
                start: [
                    range.startDate.year,
                    pad(range.startDate.month),
                    pad(range.startDate.day)
                ].join("-"),

                end: [
                    range.endDate.year,
                    pad(range.endDate.month),
                    pad(range.endDate.day)
                ].join("-")
            },

            summary: {
                totalRevenue: Number(totalRevenue.toFixed(2)),

                totalReservations,

                paidPayments,
                pendingPayments,
                rejectedPayments,
                refundedPayments,

                refundedAmount: Number(
                    refundedAmount.toFixed(2)
                ),

                confirmedReservations,
                completedReservations,
                cancelledReservations,
                pendingReservations
            },

            paymentMethods,

            charts: {
                revenue: buckets.map((bucket) => ({
                    label: bucket.label,
                    value: Number(bucket.revenue.toFixed(2))
                })),

                bookings: buckets.map((bucket) => ({
                    label: bucket.label,
                    value: bucket.bookings
                }))
            }
        });

    } catch (error) {
        console.error("Get Reports Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to generate reports.",

            ...(process.env.NODE_ENV !== "production" && {
                error: error.message
            })
        });
    }
};

// ==========================================
// EXPORT
// ==========================================

module.exports = {
    getReports
};
