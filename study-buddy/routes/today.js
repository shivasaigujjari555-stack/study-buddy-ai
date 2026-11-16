/* =========================================================
   Study Buddy - Today's Plan & Timer (public/js/today.js)
========================================================= */

async function recordStudySession(subject, durationMinutes) {
    try {
        const res = await fetch("/api/ml/study-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                subject,
                duration_minutes: durationMinutes
            })
        });
        return await res.json();
    } catch (err) {
        console.error("Study session record error:", err);
        return null;
    }
}

