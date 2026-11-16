/* =========================================================
   Study Buddy - Dashboard Module (public/js/dashboard.js)
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    applyStoredTheme();
    loadDashboardUser();
});

async function loadDashboardUser() {
    try {
        const res = await fetch("/api/profile");
        const data = await res.json();

        const nameEl = document.getElementById("userName");
        if (nameEl && data && data.name) {
            nameEl.innerText = data.name;
        }
    } catch (err) {
        console.error("Dashboard user load error:", err);
    }
}

