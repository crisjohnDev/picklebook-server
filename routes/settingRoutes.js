
const express = require("express");
const router = express.Router();

const {
    getSettings,
    updateSettings
} = require("../controllers/settingController");

const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"));

router.get("/", getSettings);
router.put("/", updateSettings);

module.exports = router;
