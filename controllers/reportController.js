
const Payment = require("../models/Payment");
const Reservation = require("../models/Reservation");

const pad = (value) => String(value).padStart(2, "0");

const toDateKey = (date) => {
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join("-");
};

const parseDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
        return null;
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
};

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

const createBuckets = (period, start, end) => {
    const buckets = [];

    if (period === "daily") {
        for (let hour = 0; hour < 24; hour++) {
            buckets.push({
                key: String(hour),
                label: `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`,
                revenue: 0,
                bookings: 0
            });
        }

        return buckets;
    }

    const current = new Date(start);

    while (current < end) {
        const key = toDateKey(current);

        buckets.push({
            key,
            label: period === "weekly"
                ? current.toLocaleDateString("en-PH", { weekday: "short" })
                : String(current.getDate()),
            revenue: 0,
            bookings: 0
        });

        current.setDate(current.getDate() + 1);
    }

    return buckets;
};

const getBucketKey = (date, period) => {
    if (period === "daily") {
        return String(date.getHours());
    }

    return toDateKey(date);
};

// GET /api/reports?period=daily&date=2026-11-23
const getReports = async (req, res) => {
    try {
        const { period = "daily", date } = req.query;

        if (!["daily", "weekly", "monthly"].includes(period)) {
            return res.status(400).json({
                success: false,
                message: "Invalid report period."
            });
        }

        const selectedDate = parseDate(date);

        if (!selectedDate) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid date in YYYY-MM-DD format."
            });
        }

        const range = getPeriodRange(period, selectedDate);

        if (!range) {
            return res.status(400).json({
                success: false,
                message: "Unable to determine report date range."
            });
        }

        const { start, end } = range;

        const [payments, reservations] = await Promise.all([
            Payment.find({
                paymentDate: {
                    $gte: start,
                    $lt: end
                }
            }).select("amount status paymentDate paymentMethod"),

            Reservation.find({
                reservationDate: {
                    $gte: start,
                    $lt: end
                }
            }).select("status paymentStatus totalAmount startTime reservationDate")
        ]);

        const buckets = createBuckets(period, start, end);
        const bucketMap = new Map(
            buckets.map((bucket) => [bucket.key, bucket])
        );

        let totalRevenue = 0;
        let paidPayments = 0;
        let pendingPayments = 0;
        let rejectedPayments = 0;
        let refundedPayments = 0;
        let refundedAmount = 0;

        payments.forEach((payment) => {
            const paymentDate = new Date(payment.paymentDate);
            const key = getBucketKey(paymentDate, period);
            const bucket = bucketMap.get(key);

            if (payment.status === "Paid") {
                totalRevenue += payment.amount;
                paidPayments += 1;

                if (bucket) {
                    bucket.revenue += payment.amount;
                }
            } else if (payment.status === "Pending") {
                pendingPayments += 1;
            } else if (payment.status === "Rejected") {
                rejectedPayments += 1;
            } else if (payment.status === "Refunded") {
                refundedPayments += 1;
                refundedAmount += payment.amount;
            }
        });

        let confirmedReservations = 0;
        let completedReservations = 0;
        let cancelledReservations = 0;
        let pendingReservations = 0;

        reservations.forEach((reservation) => {
            const reservationDate = new Date(reservation.reservationDate);
            const key = period === "daily"
                ? String(
                    Number(String(reservation.startTime || "0:0").split(":")[0])
                )
                : getBucketKey(reservationDate, period);

            const bucket = bucketMap.get(key);

            if (bucket) {
                bucket.bookings += 1;
            }

            if (reservation.status === "Confirmed") {
                confirmedReservations += 1;
            } else if (reservation.status === "Completed") {
                completedReservations += 1;
            } else if (reservation.status === "Cancelled") {
                cancelledReservations += 1;
            } else if (reservation.status === "Pending") {
                pendingReservations += 1;
            }
        });

        const totalReservations = reservations.length;

        const paymentMethods = payments.reduce((result, payment) => {
            const method = payment.paymentMethod || "Other";

            if (!result[method]) {
                result[method] = {
                    count: 0,
                    amount: 0
                };
            }

            result[method].count += 1;

            if (payment.status === "Paid") {
                result[method].amount += payment.amount;
            }

            return result;
        }, {});

        res.status(200).json({
            success: true,
            period,
            selectedDate: toDateKey(selectedDate),
            dateRange: {
                start: toDateKey(start),
                end: toDateKey(new Date(end.getTime() - 1))
            },
            summary: {
                totalRevenue,
                totalReservations,
                paidPayments,
                pendingPayments,
                rejectedPayments,
                refundedPayments,
                refundedAmount,
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

        res.status(500).json({
            success: false,
            message: "Failed to generate reports."
        });
    }
};

module.exports = {
    getReports
};
