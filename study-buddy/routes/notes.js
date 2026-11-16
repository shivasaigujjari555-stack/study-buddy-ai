const express = require("express");
const router = express.Router();
const notesController = require("../controllers/notesController");
const { requireAuth } = require("../middleware/authMiddleware");

// AI notes generator can be called with or without auth, but saving requires auth
router.post("/generate", notesController.generateNotes);

router.get("/", requireAuth, notesController.getNotes);
router.post("/", requireAuth, notesController.saveNote);
router.delete("/:id", requireAuth, notesController.deleteNote);

module.exports = router;

/* =========================================================
   Study Buddy - Notes Module (public/js/notes.js)
========================================================= */

async function fetchUserNotes() {
    try {
        const res = await fetch("/api/notes");
        const data = await res.json();
        return data?.notes || [];
    } catch (err) {
        console.error("Fetch notes error:", err);
        return [];
    }
}

async function createUserNote(noteText) {
    if (!noteText || !noteText.trim()) return null;

    try {
        const res = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ note: noteText.trim() })
        });
        return await res.json();
    } catch (err) {
        console.error("Create note error:", err);
        return null;
    }
}

async function removeUserNote(id) {
    try {
        const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
        return await res.json();
    } catch (err) {
        console.error("Delete note error:", err);
        return null;
    }
}

