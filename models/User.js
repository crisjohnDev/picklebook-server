
const mongoose = require("mongoose");

// Define the User schema
const userSchema = new mongoose.Schema(
    {
        // Complete name of the user
        fullName: {
            type: String,
            required: [true, "Full name is required"],
            trim: true,
            maxlength: 100
        },

        // Username used for login
        username: {
            type: String,
            required: [true, "Username is required"],
            unique: true,
            lowercase: true,
            trim: true,
            minlength: 3,
            maxlength: 30
        },

        // Contact number
        phone: {
            type: String,
            trim: true,
            default: ""
        },

        // Hashed password
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: 8,
            select: false
        },

        // User role
        role: {
            type: String,
            enum: ["admin", "staff", "customer"],
            default: "customer",
            required: true
        },

        // Account status
        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

// Create and export the User model
module.exports = mongoose.model("User", userSchema);
