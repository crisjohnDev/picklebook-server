
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ==========================================
// GENERATE JWT TOKEN
// ==========================================

const generateToken = (userId) => {
    return jwt.sign(
        { id: userId },
        process.env.JWT_SECRET,
        {
            expiresIn: "7d"
        }
    );
};


// ==========================================
// FORMAT USER RESPONSE
// Remove sensitive information
// ==========================================

const formatUser = (user) => {
    return {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
};


// ==========================================
// REGISTER CUSTOMER
// POST /api/auth/register
// ACCESS: PUBLIC
// ==========================================

const registerUser = async (req, res) => {
    try {
        const {
            fullName,
            username,
            phone,
            password
        } = req.body;

        // Validate required fields
        if (!fullName?.trim() || !username?.trim() || !password) {
            return res.status(400).json({
                success: false,
                message: "Full name, username, and password are required."
            });
        }

        // Validate full name
        if (fullName.trim().length > 100) {
            return res.status(400).json({
                success: false,
                message: "Full name cannot exceed 100 characters."
            });
        }

        // Normalize username
        const normalizedUsername = username.trim().toLowerCase();

        // Validate username format
        if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
            return res.status(400).json({
                success: false,
                message: "Username must be 3-30 characters and contain only letters, numbers, and underscores."
            });
        }

        // Validate password
        if (typeof password !== "string" || password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters."
            });
        }

        // Check existing username
        const existingUser = await User.findOne({
            username: normalizedUsername
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Username is already taken."
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create customer account
        // Never accept role from public registration
        const user = await User.create({
            fullName: fullName.trim(),
            username: normalizedUsername,
            phone: phone?.trim() || "",
            password: hashedPassword,
            role: "customer",
            isActive: true
        });

        // Generate authentication token
        const token = generateToken(user._id);

        return res.status(201).json({
            success: true,
            message: "Registration successful.",
            token,
            user: formatUser(user)
        });

    } catch (error) {
        console.error("Registration Error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Username is already taken."
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
            message: "Registration failed."
        });
    }
};


// ==========================================
// LOGIN USER
// POST /api/auth/login
// ACCESS: PUBLIC
// ==========================================

const loginUser = async (req, res) => {
    try {
        const {
            username,
            password
        } = req.body;

        // Validate required fields
        if (!username?.trim() || !password) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required."
            });
        }

        // Normalize username
        const normalizedUsername = username.trim().toLowerCase();

        // Find user and include password
        const user = await User.findOne({
            username: normalizedUsername
        }).select("+password");

        // Check if account exists
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        // Check account status
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: "Your account is deactivated. Contact the administrator."
            });
        }

        // Verify password
        const isPasswordCorrect = await bcrypt.compare(
            password,
            user.password
        );

        if (!isPasswordCorrect) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        // Generate JWT
        const token = generateToken(user._id);

        return res.status(200).json({
            success: true,
            message: "Login successful.",
            token,
            user: formatUser(user)
        });

    } catch (error) {
        console.error("Login Error:", error);

        return res.status(500).json({
            success: false,
            message: "Login failed."
        });
    }
};


// ==========================================
// GET CURRENT LOGGED-IN USER
// GET /api/auth/me
// ACCESS: PRIVATE
// ==========================================

const getMe = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "User authentication required."
            });
        }

        return res.status(200).json({
            success: true,
            user: formatUser(req.user)
        });

    } catch (error) {
        console.error("Get Profile Error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve profile."
        });
    }
};


// ==========================================
// UPDATE PROFILE
// PUT /api/auth/profile
// ACCESS: PRIVATE
// ==========================================

const updateProfile = async (req, res) => {
    try {
        const {
            fullName,
            username,
            phone
        } = req.body;

        // Validate required fields
        if (
            typeof fullName !== "string" ||
            typeof username !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Full name and username are required."
            });
        }

        const normalizedFullName = fullName.trim();
        const normalizedUsername = username.trim().toLowerCase();
        const normalizedPhone =
            typeof phone === "string" ? phone.trim() : "";

        // Validate full name
        if (!normalizedFullName || normalizedFullName.length > 100) {
            return res.status(400).json({
                success: false,
                message: "Full name is required and cannot exceed 100 characters."
            });
        }

        // Validate username
        if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
            return res.status(400).json({
                success: false,
                message: "Username must be 3-30 characters and contain only letters, numbers, and underscores."
            });
        }

        // Validate phone length
        if (normalizedPhone.length > 20) {
            return res.status(400).json({
                success: false,
                message: "Phone number cannot exceed 20 characters."
            });
        }

        // Check if username belongs to another user
        const existingUser = await User.findOne({
            username: normalizedUsername,
            _id: { $ne: req.user._id }
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Username is already taken."
            });
        }

        // Update only editable profile fields
        const user = await User.findByIdAndUpdate(
            req.user._id,
            {
                $set: {
                    fullName: normalizedFullName,
                    username: normalizedUsername,
                    phone: normalizedPhone
                }
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User account not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully.",
            user: formatUser(user)
        });

    } catch (error) {
        console.error("Update Profile Error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Username is already taken."
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
            message: "Unable to update profile."
        });
    }
};


// ==========================================
// CHANGE PASSWORD
// PUT /api/auth/change-password
// ACCESS: PRIVATE
// ==========================================

const changePassword = async (req, res) => {
    try {
        const {
            currentPassword,
            newPassword,
            confirmPassword
        } = req.body;

        // Validate required fields
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "All password fields are required."
            });
        }

        // Validate new password length
        if (
            typeof newPassword !== "string" ||
            newPassword.length < 8
        ) {
            return res.status(400).json({
                success: false,
                message: "New password must be at least 8 characters."
            });
        }

        // Confirm new password
        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "New password and confirmation do not match."
            });
        }

        // Prevent reusing the current password
        if (currentPassword === newPassword) {
            return res.status(400).json({
                success: false,
                message: "New password must be different from your current password."
            });
        }

        // Fetch user with password field
        const user = await User.findById(req.user._id).select("+password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User account not found."
            });
        }

        // Verify current password
        const isPasswordCorrect = await bcrypt.compare(
            currentPassword,
            user.password
        );

        if (!isPasswordCorrect) {
            return res.status(400).json({
                success: false,
                message: "Your current password is incorrect."
            });
        }

        // Hash new password
        user.password = await bcrypt.hash(newPassword, 12);

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password changed successfully. Please use your new password next time you log in."
        });

    } catch (error) {
        console.error("Change Password Error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to change password."
        });
    }
};


// ==========================================
// EXPORT CONTROLLERS
// ==========================================

module.exports = {
    registerUser,
    loginUser,
    getMe,
    updateProfile,
    changePassword
};
