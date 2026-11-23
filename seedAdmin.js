
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

const User = require("./models/User");

dotenv.config();

const seedAdmin = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);

        console.log("MongoDB connected.");

        // Initial administrator credentials
        const adminData = {
            fullName: "PickleBook Administrator",
            username: "admin",
            password: "Admin123456!",
            role: "admin"
        };

        // Check if admin already exists
        const existingAdmin = await User.findOne({
            username: adminData.username
        });

        if (existingAdmin) {
            console.log("Admin account already exists.");
            return;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(
            adminData.password,
            12
        );

        // Create administrator
        await User.create({
            fullName: adminData.fullName,
            username: adminData.username,
            password: hashedPassword,
            role: adminData.role,
            isActive: true
        });

        console.log("================================");
        console.log("ADMIN ACCOUNT CREATED");
        console.log("================================");
        console.log("Username: admin");
        console.log("Password: Admin123456!");
        console.log("Role: admin");
        console.log("================================");

    } catch (error) {
        console.error("Admin Seed Error:", error.message);
        process.exitCode = 1;

    } finally {
        await mongoose.disconnect();
    }
};

seedAdmin();
