/* =========================================================
   Study Buddy - API Client Layer (public/js/api.js)
========================================================= */

async function apiRequest(endpoint, method = "GET", body = null) {
    const options = {
        method,
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(endpoint, options);
        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch {
            return { raw: text, ok: response.ok, status: response.status };
        }
    } catch (error) {
        console.error(`API Error on ${endpoint}:`, error);
        return { error: error.message };
    }
}

const API = {
    // Auth
    login: (username, password) => apiRequest("/login", "POST", { username, password }),
    register: (username, password) => apiRequest("/register", "POST", { username, password }),
    logout: () => fetch("/logout"),
    getAuthStatus: () => apiRequest("/api/auth/status"),

    // Profile
    getProfile: () => apiRequest("/api/profile"),
    saveProfile: (name) => apiRequest("/api/save-profile", "POST", { name }),
    updateSettings: (name, newPassword) => apiRequest("/api/profile/settings", "POST", { name, newPassword }),

    // Tasks
    getTasks: () => apiRequest("/api/tasks"),
    addTask: (subject, task) => apiRequest("/api/tasks", "POST", { subject, task }),
    toggleTask: (id) => apiRequest(`/api/tasks/${id}/toggle`, "PUT"),
    deleteTask: (id) => apiRequest(`/api/tasks/${id}`, "DELETE"),

    // Notes
    getNotes: () => apiRequest("/api/notes"),
    saveNote: (note) => apiRequest("/api/notes", "POST", { note }),
    deleteNote: (id) => apiRequest(`/api/notes/${id}`, "DELETE"),
    generateNotes: (subject, topic) => apiRequest("/api/generate-notes", "POST", { subject, topic }),

    // Planner
    generatePlan: (subjects) => apiRequest("/api/planner", "POST", { subjects }),
    generateTimetable: (subjects) => apiRequest("/api/timetable", "POST", { subjects }),
    summarizePlan: (plan) => apiRequest("/api/summarize", "POST", { plan }),
    generatePlanQuestions: (plan) => apiRequest("/api/questions", "POST", { plan }),
    explainPlan: (plan) => apiRequest("/api/explain", "POST", { plan }),

    // Quiz & ML
    generateQuiz: (subject, topic) => apiRequest("/api/generate-quiz", "POST", { subject, topic }),
    saveQuizResult: (data) => apiRequest("/api/ml/quiz-result", "POST", data),
    saveStudySession: (data) => apiRequest("/api/ml/study-session", "POST", data),
    getMLAnalysis: () => apiRequest("/api/ml/analysis")
};

