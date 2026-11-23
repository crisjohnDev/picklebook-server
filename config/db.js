
const mongoose = require("mongoose");

// Connect to MongoDB database
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);

        console.log(`MongoDB Connected: ${conn.connection.host}`);

    } catch (error) {
        console.error("MongoDB Connection Error:", error.message);

        // Stop the application if database connection fails
        process.exit(1);
    }
};

// Export database connection function
module.exports = connectDB;
