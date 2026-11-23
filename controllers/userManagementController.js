
const User = require("../models/User");
const bcrypt = require("bcryptjs");

// ==========================================
// HELPER: ALLOWED MANAGED ROLES
// ==========================================

const MANAGED_ROLES = ["admin", "staff"];

const normalizeRole = (role) =>
    String(role || "").trim().toLowerCase();

const isValidRole = (role) =>
    MANAGED_ROLES.includes(normalizeRole(role));

// ==========================================
// HELPER: USER RESPONSE
// ==========================================

const getUserResponse = (user) => ({
    _id: user._id,
    fullName: user.fullName,
    username: user.username,
    phone: user.phone,
    role: normalizeRole(user.role),
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
});

// ==========================================
// HELPER: MANAGED USER FILTER
// ==========================================

// $expr with $toLower handles role capitalization
// and whitespace in existing MongoDB documents.
const managedUserFilter = {
    $expr: {
        $in: [
            {
                $toLower: {
                    $trim: {
                        input: { $ifNull: ["$role", ""] }
                    }
                }
            },
            MANAGED_ROLES
        ]
    }
};

// ==========================================
// GET ALL ADMIN AND STAFF USERS
// GET /api/admin/users
// ==========================================

const getUsers = async (req, res) => {
    try {
        const {
            search = "",
            role = "",
            status = "",
            page = 1,
            limit = 10
        } = req.query;

        const currentPage = Math.max(1, Number(page) || 1);
        const pageLimit = Math.min(100, Math.max(1, Number(limit) || 10));

        // --------------------------------------
        // DATABASE DIAGNOSTICS
        // --------------------------------------

        console.log("\n========== USER MANAGEMENT ==========");
        console.log("Database:", User.db.name);
        console.log("Collection:", User.collection.name);

        // --------------------------------------
        // BUILD FILTER
        // --------------------------------------

        const filter = { ...managedUserFilter };

        // Search by name, username, or phone.
        if (search.trim()) {
            const escapedSearch = search.trim().replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );

            const searchRegex = new RegExp(escapedSearch, "i");

            filter.$or = [
                { fullName: searchRegex },
                { username: searchRegex },
                { phone: searchRegex }
            ];
        }

        // Role filter.
        if (role && isValidRole(role)) {
            filter.$expr = {
                $eq: [
                    {
                        $toLower: {
                            $trim: {
                                input: { $ifNull: ["$role", ""] }
                            }
                        }
                    },
                    normalizeRole(role)
                ]
            };
        }

        // Account status filter.
        if (status === "active") {
            filter.isActive = true;
        } else if (status === "inactive") {
            filter.isActive = false;
        }

        // --------------------------------------
        // GET USERS AND PAGINATION
        // --------------------------------------

        const [total, users] = await Promise.all([
            User.countDocuments(filter),

            User.find(filter)
                .select("-password")
                .sort({ createdAt: -1 })
                .skip((currentPage - 1) * pageLimit)
                .limit(pageLimit)
                .lean()
        ]);

        // --------------------------------------
        // CALCULATE SUMMARY
        // --------------------------------------

        const summaryResults = await User.aggregate([
            {
                $match: managedUserFilter
            },
            {
                $group: {
                    _id: null,

                    totalUsers: {
                        $sum: 1
                    },

                    totalAdmins: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        {
                                            $toLower: {
                                                $trim: {
                                                    input: {
                                                        $ifNull: ["$role", ""]
                                                    }
                                                }
                                            }
                                        },
                                        "admin"
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },

                    totalStaff: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        {
                                            $toLower: {
                                                $trim: {
                                                    input: {
                                                        $ifNull: ["$role", ""]
                                                    }
                                                }
                                            }
                                        },
                                        "staff"
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },

                    activeUsers: {
                        $sum: {
                            $cond: [
                                { $eq: ["$isActive", true] },
                                1,
                                0
                            ]
                        }
                    },

                    inactiveUsers: {
                        $sum: {
                            $cond: [
                                { $eq: ["$isActive", false] },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalUsers: 1,
                    totalAdmins: 1,
                    totalStaff: 1,
                    activeUsers: 1,
                    inactiveUsers: 1
                }
            }
        ]);

        const summary = summaryResults[0] || {
            totalUsers: 0,
            totalAdmins: 0,
            totalStaff: 0,
            activeUsers: 0,
            inactiveUsers: 0
        };

        // --------------------------------------
        // DEBUG OUTPUT
        // --------------------------------------

        console.log("Summary:", summary);
        console.log("Filtered users:", total);
        console.log("Returned users:", users.length);
        console.log("=====================================\n");

        // --------------------------------------
        // RESPONSE
        // --------------------------------------

        return res.status(200).json({
            success: true,
            users: users.map(getUserResponse),
            summary,
            pagination: {
                total,
                page: currentPage,
                limit: pageLimit,
                totalPages: Math.ceil(total / pageLimit)
            }
        });

    } catch (error) {
        console.error("Get users error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve users.",
            error: process.env.NODE_ENV === "development"
                ? error.message
                : undefined
        });
    }
};

// ==========================================
// GET SINGLE ADMIN OR STAFF USER
// GET /api/admin/users/:id
// ==========================================

const getUserById = async (req, res) => {
    try {
        const user = await User.findOne({
            _id: req.params.id,
            ...managedUserFilter
        }).select("-password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User account not found."
            });
        }

        return res.status(200).json({
            success: true,
            user: getUserResponse(user)
        });

    } catch (error) {
        if (error.name === "CastError") {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID."
            });
        }

        console.error("Get user details error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve user details."
        });
    }
};

// ==========================================
// CREATE ADMIN OR STAFF ACCOUNT
// POST /api/admin/users
// ==========================================

const createUser = async (req, res) => {
    try {
        const {
            fullName,
            username,
            phone,
            password,
            role
        } = req.body;

        if (
            !fullName?.trim() ||
            !username?.trim() ||
            !password ||
            !role
        ) {
            return res.status(400).json({
                success: false,
                message: "Full name, username, password, and role are required."
            });
        }

        const normalizedRole = normalizeRole(role);

        if (!isValidRole(normalizedRole)) {
            return res.status(400).json({
                success: false,
                message: "Only admin and staff accounts can be created."
            });
        }

        if (fullName.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: "Full name must contain at least 2 characters."
            });
        }

        if (username.trim().length < 3) {
            return res.status(400).json({
                success: false,
                message: "Username must contain at least 3 characters."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 8 characters."
            });
        }

        const normalizedUsername = username.trim().toLowerCase();

        const existingUser = await User.findOne({
            username: normalizedUsername
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Username is already taken."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const user = await User.create({
            fullName: fullName.trim(),
            username: normalizedUsername,
            phone: phone?.trim() || "",
            password: hashedPassword,
            role: normalizedRole,
            isActive: true
        });

        return res.status(201).json({
            success: true,
            message: `${normalizedRole === "admin" ? "Admin" : "Staff"} account created successfully.`,
            user: getUserResponse(user)
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Username is already taken."
            });
        }

        console.error("Create user error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create user account."
        });
    }
};

// ==========================================
// UPDATE ADMIN OR STAFF ACCOUNT
// PUT /api/admin/users/:id
// ==========================================

const updateUser = async (req, res) => {
    try {
        const {
            fullName,
            username,
            phone,
            role
        } = req.body;

        const user = await User.findOne({
            _id: req.params.id,
            ...managedUserFilter
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User account not found."
            });
        }

        const currentUserId = String(req.user._id || req.user.id);
        const targetUserId = String(user._id);

        // Prevent changing your own role.
        if (
            targetUserId === currentUserId &&
            role &&
            normalizeRole(role) !== normalizeRole(user.role)
        ) {
            return res.status(403).json({
                success: false,
                message: "You cannot change your own administrator role."
            });
        }

        if (fullName !== undefined) {
            if (!fullName.trim() || fullName.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    message: "Please enter a valid full name."
                });
            }

            user.fullName = fullName.trim();
        }

        if (username !== undefined) {
            if (!username.trim() || username.trim().length < 3) {
                return res.status(400).json({
                    success: false,
                    message: "Username must contain at least 3 characters."
                });
            }

            user.username = username.trim().toLowerCase();
        }

        if (phone !== undefined) {
            user.phone = phone.trim();
        }

        if (role !== undefined) {
            const normalizedRole = normalizeRole(role);

            if (!isValidRole(normalizedRole)) {
                return res.status(400).json({
                    success: false,
                    message: "Only admin and staff roles are allowed."
                });
            }

            // Protect the last active administrator.
            if (
                normalizeRole(user.role) === "admin" &&
                normalizedRole !== "admin" &&
                user.isActive
            ) {
                const activeAdminCount = await User.countDocuments({
                    role: "admin",
                    isActive: true
                });

                if (activeAdminCount <= 1) {
                    return res.status(400).json({
                        success: false,
                        message: "The last active admin cannot be demoted."
                    });
                }
            }

            user.role = normalizedRole;
        }

        await user.save();

        return res.status(200).json({
            success: true,
            message: "User account updated successfully.",
            user: getUserResponse(user)
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Username is already taken."
            });
        }

        if (error.name === "CastError") {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID."
            });
        }

        console.error("Update user error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update user account."
        });
    }
};

// ==========================================
// CHANGE USER PASSWORD
// PATCH /api/admin/users/:id/password
// ==========================================

const changeUserPassword = async (req, res) => {
    try {
        const { password } = req.body;

        if (!password || password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 8 characters."
            });
        }

        const user = await User.findOne({
            _id: req.params.id,
            ...managedUserFilter
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User account not found."
            });
        }

        user.password = await bcrypt.hash(password, 12);

        await user.save();

        return res.status(200).json({
            success: true,
            message: "User password updated successfully."
        });

    } catch (error) {
        if (error.name === "CastError") {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID."
            });
        }

        console.error("Change password error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to change user password."
        });
    }
};

// ==========================================
// ACTIVATE / DEACTIVATE USER
// PATCH /api/admin/users/:id/status
// ==========================================

const updateUserStatus = async (req, res) => {
    try {
        const { isActive } = req.body;

        if (typeof isActive !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "A valid account status is required."
            });
        }

        const user = await User.findOne({
            _id: req.params.id,
            ...managedUserFilter
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User account not found."
            });
        }

        const currentUserId = String(req.user._id || req.user.id);

        // Prevent self-deactivation.
        if (
            String(user._id) === currentUserId &&
            !isActive
        ) {
            return res.status(403).json({
                success: false,
                message: "You cannot deactivate your own account."
            });
        }

        // Protect the last active administrator.
        if (
            normalizeRole(user.role) === "admin" &&
            user.isActive &&
            !isActive
        ) {
            const activeAdminCount = await User.countDocuments({
                role: "admin",
                isActive: true
            });

            if (activeAdminCount <= 1) {
                return res.status(400).json({
                    success: false,
                    message: "The last active admin cannot be deactivated."
                });
            }
        }

        user.isActive = isActive;

        await user.save();

        return res.status(200).json({
            success: true,
            message: `User account ${isActive ? "activated" : "deactivated"} successfully.`,
            user: getUserResponse(user)
        });

    } catch (error) {
        if (error.name === "CastError") {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID."
            });
        }

        console.error("Update user status error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update account status."
        });
    }
};

// ==========================================
// EXPORT CONTROLLERS
// ==========================================

module.exports = {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    changeUserPassword,
    updateUserStatus
};
