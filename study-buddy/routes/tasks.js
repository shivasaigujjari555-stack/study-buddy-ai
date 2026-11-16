const express = require("express");
const router = express.Router();
const taskController = require("../controllers/taskController");
const { requireAuth } = require("../middleware/authMiddleware");

router.use(requireAuth);

router.get("/", taskController.getTasks);
router.post("/", taskController.addTask);
router.put("/:id/toggle", taskController.toggleTask);
router.patch("/:id/toggle", taskController.toggleTask);
router.delete("/:id", taskController.deleteTask);
router.post("/sync-timetable", taskController.syncTimetableTasks);
router.post("/sync-planner", taskController.syncPlannerTasks);

module.exports = router;

