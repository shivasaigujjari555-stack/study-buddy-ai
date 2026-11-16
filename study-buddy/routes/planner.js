const express = require("express");
const router = express.Router();
const plannerController = require("../controllers/plannerController");

router.post("/plan", plannerController.generatePlan);
router.post("/timetable", plannerController.generateTimetable);
router.post("/summarize", plannerController.summarizePlan);
router.post("/questions", plannerController.generatePlanQuestions);
router.post("/explain", plannerController.explainPlan);

module.exports = router;

/* =========================================================
   Study Buddy - Planner Module (public/js/planner.js)
========================================================= */

async function initPlanner() {
    const saved = localStorage.getItem("lastPlan");
    if (saved && typeof renderPlan === "function") {
        renderPlan(saved);
    }
}

async function requestStudyPlan(subjects) {
    if (!subjects || !subjects.trim()) {
        return { error: "Please enter subjects" };
    }

    try {
        const response = await fetch("/api/planner", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subjects: subjects.trim() })
        });
        return await response.json();
    } catch (err) {
        console.error("Planner error:", err);
        return { error: err.message };
    }
}

