const express = require("express");
const router = express.Router();
const profileController = require("../controllers/profileController");

router.get("/", profileController.getProfile);
router.post("/save", profileController.saveProfile);
router.post("/settings", profileController.updateSettings);

module.exports = router;

/* =========================================================
   Study Buddy - Profile Module (public/js/profile.js)
========================================================= */

async function fetchProfileData() {
    try {
        const res = await fetch("/api/profile");
        return await res.json();
    } catch (err) {
        console.error("Profile fetch error:", err);
        return null;
    }
}

async function updateProfileName(name) {
    if (!name || !name.trim()) return null;

    try {
        const res = await fetch("/api/save-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name.trim() })
        });
        return await res.json();
    } catch (err) {
        console.error("Profile update error:", err);
        return null;
    }
}

async function saveAccountSettings(name, newPassword) {
    try {
        const res = await fetch("/api/profile/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, newPassword })
        });
        return await res.json();
    } catch (err) {
        console.error("Settings save error:", err);
        return null;
    }
}

