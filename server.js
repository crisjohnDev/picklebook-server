
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

// ==========================================
// IMPORT DATABASE CONNECTION
// ==========================================

const connectDB = require("./config/db");

// ==========================================
// IMPORT ROUTES
// ==========================================

const authRoutes = require("./routes/authRoutes");

const courtRoutes = require("./routes/courtRoutes");
const adminRoutes = require("./routes/adminRoutes");
const reservationRoutes = require("./routes/reservationRoutes");
const customerRoutes = require("./routes/customerRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const reportRoutes = require("./routes/reportRoutes");
const settingRoutes = require("./routes/settingRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

const userManagementRoutes = require("./routes/userManagementRoutes");

const staffReservationRoutes = require("./routes/staffReservationRoutes");
const staffCustomerRoutes = require("./routes/staffCustomerRoutes");
const staffPaymentRoutes = require("./routes/staffPaymentRoutes");

// ==========================================
// LOAD ENVIRONMENT VARIABLES
// ==========================================

dotenv.config();

// ==========================================
// INITIALIZE EXPRESS APPLICATION
// ==========================================

const app = express();

// ==========================================
// GLOBAL MIDDLEWARE
// ==========================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// CONNECT TO MONGODB
// ==========================================

connectDB();

// ==========================================
// ROOT API
// ==========================================

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Welcome to PickleBook API",
        version: "1.0.0"
    });
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "PickleBook Server is running!"
    });
});

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

app.use("/api/auth", authRoutes);

// ==========================================
// GENERAL SYSTEM ROUTES
// ==========================================

app.use("/api/courts", courtRoutes);

// ==========================================
// USER MANAGEMENT ROUTES
// ==========================================

// IMPORTANT:
// Register this BEFORE /api/admin.
// This prevents general admin routes from intercepting
// requests intended for User Management.

app.use("/api/admin/users", userManagementRoutes);

// ==========================================
// ADMIN ROUTES
// ==========================================

app.use("/api/admin", adminRoutes);

// ==========================================
// RESERVATION ROUTES
// ==========================================

app.use("/api/reservations", reservationRoutes);

// ==========================================
// CUSTOMER ROUTES
// ==========================================

app.use("/api/customers", customerRoutes);

// ==========================================
// PAYMENT ROUTES
// ==========================================

app.use("/api/payments", paymentRoutes);

// ==========================================
// REPORT ROUTES
// ==========================================

app.use("/api/reports", reportRoutes);

// ==========================================
// SYSTEM SETTINGS ROUTES
// ==========================================

app.use("/api/settings", settingRoutes);

// ==========================================
// DASHBOARD ROUTES
// ==========================================

app.use("/api/dashboard", dashboardRoutes);

// ==========================================
// STAFF ROUTES
// ==========================================

app.use("/api/staff/reservations", staffReservationRoutes);
app.use("/api/staff/customers", staffCustomerRoutes);
app.use("/api/staff/payments", staffPaymentRoutes);

// ==========================================
// GLOBAL 404 HANDLER
// ==========================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`
    });
});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

app.use((error, req, res, next) => {
    console.error("Global server error:", error);

    res.status(error.status || 500).json({
        success: false,
        message: error.message || "Internal server error."
    });
});

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`PickleBook Server running on port ${PORT}`);
});
