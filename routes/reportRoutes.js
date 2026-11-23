
const express = require("express");
const router = express.Router();

const { getReports } = require("../controllers/reportController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Reports are accessible to Admin only.
router.use(protect, authorize("admin"));

router.get("/", getReports);

module.exports = router;
