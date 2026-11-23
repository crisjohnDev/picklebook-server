
const express = require("express");
const router = express.Router();

const {
    getCourts,
    getCourtById,
    createCourt,
    updateCourt,
    updateCourtStatus
} = require("../controllers/courtController");

const { protect, authorize } = require("../middleware/authMiddleware");

// All routes require an authenticated admin or staff member
router.use(protect, authorize("admin", "staff"));

router.get("/", getCourts);
router.get("/:id", getCourtById);

// Only admins can modify court records
router.post("/", authorize("admin"), createCourt);
router.put("/:id", authorize("admin"), updateCourt);
router.patch("/:id/status", authorize("admin"), updateCourtStatus);

module.exports = router;
