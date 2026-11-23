
const User = require("../models/User");
const bcrypt = require("bcryptjs");

// @desc    Create an admin or staff account
// @route   POST /api/admin/users
// @access  Admin only
const createAdminUser = async (req, res) => {
    try {
        const {
            fullName,
            username,
            phone,
            password,
            role
        } = req.body;

        // Validate required fields
        if (!fullName || !username || !password || !role) {
            return res.status(400).json({
                success: false,
                message: "Please complete all required fields."
            });
        }

        // Only allow admin or staff roles
        if (!["admin", "staff"].includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Only admin or staff accounts can be created here."
            });
        }

        // Validate password
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters."
            });
        }

        // Normalize username
        const normalizedUsername = username.trim().toLowerCase();

        if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
            return res.status(400).json({
                success: false,
                message: "Username must contain 3-30 letters, numbers, or underscores."
            });
        }

        // Check existing username
        const existingUser = await User.findOne({
            username: normalizedUsername
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Username is already registered."
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create account
        const user = await User.create({
            fullName,
            username: normalizedUsername,
            phone: phone || "",
            password: hashedPassword,
            role,
            isActive: true
        });

        res.status(201).json({
            success: true,
            message: `${role} account created successfully.`,
            user: {
                id: user._id,
                fullName: user.fullName,
                username: user.username,
                phone: user.phone,
                role: user.role,
                isActive: user.isActive
            }
        });

    } catch (error) {
        console.error("Create Admin User Error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to create user account."
        });
    }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Admin only
const getAdminUsers = async (req, res) => {
    try {
        const users = await User.find()
            .select("-password")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: users.length,
            users
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Unable to retrieve users."
        });
    }
};

module.exports = {
    createAdminUser,
    getAdminUsers
};
