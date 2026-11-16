const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.post("/login", authController.login);
router.post("/register", authController.register);
router.get("/logout", authController.logout);
router.get("/status", authController.status);

module.exports = router;

/* =========================================================
   Study Buddy - Auth Frontend Module (public/js/auth.js)
========================================================= */

async function handleLogin(username, password) {
    if (!username || !password) {
        alert("⚠️ Please enter both username and password.");
        return false;
    }

    try {
        const response = await fetch("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        const text = await response.text();

        if (text === "success") {
            window.location.href = "/dashboard";
            return true;
        } else {
            alert(text);
            return false;
        }
    } catch (err) {
        alert("❌ Login server error. Please try again.");
        console.error(err);
        return false;
    }
}

async function handleRegister(username, password) {
    if (!username || !password) {
        alert("⚠️ Please fill in all fields.");
        return false;
    }

    try {
        const response = await fetch("/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        const text = await response.text();

        if (text === "success") {
            alert("✅ Account registered successfully! Please log in.");
            window.location.href = "/login";
            return true;
        } else {
            alert(text);
            return false;
        }
    } catch (err) {
        alert("❌ Registration server error.");
        console.error(err);
        return false;
    }
}

function handleLogout() {
    fetch("/logout").then(() => {
        window.location.href = "/login";
    }).catch(() => {
        window.location.href = "/login";
    });
}

