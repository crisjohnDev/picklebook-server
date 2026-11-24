
const Payment = require("../models/Payment");
const Reservation = require("../models/Reservation");

// ==========================================
// DATE HELPERS
// ==========================================

// Add leading zero to month, day, and hour values.
const pad = (value) => String(value).padStart(2, "0");

// Convert a Date object into YYYY-MM-DD.
// Uses local date values to avoid UTC date shifting.
const toDateKey = (date) => {
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join("-");
};

// Parse YYYY-MM-DD as a local date.
const parseDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
        return null;
    }

    const [year, month, day] = value.split("-").map(Number);

    const date = new Date(year, month - 1, day);

    // Reject invalid dates such as February 30.
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
};

// ==========================================
// REPORT DATE RANGE
// ==========================================

const getPeriodRange = (period, selectedDate) => {
    const date = new Date(selectedDate);

    if (period === "daily") {
        const start = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
        );

        const end = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate() + 1
        );

        return { start, end };
    }

    if (period === "weekly") {
        const start = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
        );

        // Monday is the first day of the week.
        const day = start.getDay();
        const difference = day === 0 ? -6 : 1 - day;

        start.setDate(start.getDate() + difference);

        const end = new Date(start);
        end.setDate(end.getDate() + 7);

        return { start, end };
    }

    if (period === "monthly") {
        const start = new Date(
            date.getFullYear(),
            date.getMonth(),
            1
        );

        const end = new Date(
            date.getFullYear(),
            date.getMonth() + 1,
            1
        );

        return { start, end };
    }

    return null;
};

// ==========================================
// CHART BUCKETS
// ==========================================

const createBuckets = (period, start, end) => {
    const buckets = [];

    // Daily report: 24 hourly buckets.
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

    // Weekly and monthly reports: one bucket per day.
    const current = new Date(start);

    while (current < end) {
        const key = toDateKey(current);

        buckets.push({
            key,

            label: period === "weekly"
                ? current.toLocaleDateString("en-PH", {
                    weekday: "short"
                })
                : String(current.getDate()),

            revenue: 0,
            bookings: 0
        });

        current.setDate(current.getDate() + 1);
    }

    return buckets;
};

// ==========================================
// BUCKET KEY
// ==========================================

const getBucketKey = (date, period) => {
    if (period === "daily") {
        return String(date.getHours());
    }

    return toDateKey(date);
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
        // VALIDATE REPORT PERIOD
        // --------------------------------------

        if (!["daily", "weekly", "monthly"].includes(period)) {
            return res.status(400).json({
                success: false,
                message: "Invalid report period."
            });
        }

        // --------------------------------------
        // VALIDATE SELECTED DATE
        // --------------------------------------

        const selectedDate = parseDate(date);

        if (!selectedDate) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid date in YYYY-MM-DD format."
            });
        }

        // --------------------------------------
        // GET REPORT DATE RANGE
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
        // GET DATABASE RECORDS
        // --------------------------------------
        // IMPORTANT:
        // This assumes your Payment model uses
        // paymentDate and your Reservation model
        // uses reservationDate.
        //
        // These field names must match your schemas.

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

        console.log("========== REPORT DEBUG ==========");
        console.log("Period:", period);
        console.log("Start:", start);
        console.log("End:", end);
        console.log("Payments found:", payments.length);
        console.log("Reservations found:", reservations.length);
        console.log("==================================");

        // --------------------------------------
        // CREATE CHART BUCKETS
        // --------------------------------------

        const buckets = createBuckets(period, start, end);

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

            // ----------------------------------
            // PAID PAYMENTS
            // ----------------------------------

            if (status === "paid") {
                totalRevenue += amount;
                paidPayments += 1;

                if (bucket) {
                    bucket.revenue += amount;
                }
            }

            // ----------------------------------
            // PENDING PAYMENTS
            // ----------------------------------

            else if (status === "pending") {
                pendingPayments += 1;
            }

            // ----------------------------------
            // REJECTED PAYMENTS
            // ----------------------------------

            else if (status === "rejected") {
                rejectedPayments += 1;
            }

            // ----------------------------------
            // REFUNDED PAYMENTS
            // ----------------------------------

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

            // ----------------------------------
            // DAILY REPORT USES RESERVATION HOUR
            // ----------------------------------

            let key;

            if (period === "daily") {
                const hour = Number(
                    String(reservation.startTime || "0:0").split(":")[0]
                );

                key = String(hour);
            } else {
                key = getBucketKey(reservationDate, period);
            }

            const bucket = bucketMap.get(key);

            if (bucket) {
                bucket.bookings += 1;
            }

            // ----------------------------------
            // RESERVATION STATUS
            // ----------------------------------

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

            const amount = toNumber(payment.amount);

            paymentMethods[method].count += 1;

            // Only paid payments contribute to collected amount.
            if (normalizeStatus(payment.status) === "paid") {
                paymentMethods[method].amount += amount;
            }
        });

        // ======================================
        // FINAL RESPONSE
        // ======================================

        return res.status(200).json({
            success: true,

            period,

            selectedDate: toDateKey(selectedDate),

            dateRange: {
                start: toDateKey(start),

                // Display inclusive ending date.
                end: toDateKey(
                    new Date(end.getTime() - 1)
                )
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
// EXPORT CONTROLLER
// ==========================================

module.exports = {
    getReports
};
