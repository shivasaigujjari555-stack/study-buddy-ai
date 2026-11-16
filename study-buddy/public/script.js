
/* =========================================================
   STUDY BUDDY - UNIFIED CLIENT CONTROLLER
   COMPLETE REPLACEMENT - PART 1 OF 4
   Core functions, theme, planner and Today's Plan
========================================================= */

/* ================= SAFE FETCH HELPER ================= */

async function safeFetch(url, options = {}) {
    try {
        const response = await fetch(url, {
            credentials: "same-origin",
            ...options
        });

        const text = await response.text();
        let data;

        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { message: text };
        }

        if (!response.ok) {
            console.error("API request failed:", {
                url,
                status: response.status,
                response: data
            });
        }

        return {
            ...(data && typeof data === "object" ? data : {}),
            ok: response.ok,
            status: response.status
        };
    } catch (error) {
        console.error("API fetch error:", error);

        return {
            ok: false,
            status: 0,
            message: error.message || "Network error"
        };
    }
}

/* ================= SHARED HELPERS ================= */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    }[character]));
}

function decodeSafely(value) {
    const text = String(value ?? "");

    try {
        return decodeURIComponent(text);
    } catch {
        return text;
    }
}

/* ================= THEME ================= */

function applyStoredTheme() {
    const isDark = localStorage.getItem("theme") === "dark";

    document.body.classList.toggle("dark-mode", isDark);

    const button = document.getElementById("darkModeBtn");

    if (button) {
        button.textContent = isDark ? "☀️ Light Mode" : "🌙 Dark Mode";
    }
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle("dark-mode");

    localStorage.setItem("theme", isDark ? "dark" : "light");

    const button = document.getElementById("darkModeBtn");

    if (button) {
        button.textContent = isDark ? "☀️ Light Mode" : "🌙 Dark Mode";
    }
}

/* ================= NAVIGATION ================= */

function goBack() {
    const previousPage = sessionStorage.getItem("previousPage");

    if (
        previousPage &&
        previousPage.startsWith("/") &&
        !previousPage.startsWith("//")
    ) {
        sessionStorage.removeItem("previousPage");
        window.location.href = previousPage;
    } else {
        window.location.href = "/dashboard";
    }
}


async function logout() {
    if (typeof window.stopSharedStudyTimerForLogout === "function") {
        window.stopSharedStudyTimerForLogout();
    }

    try {
        await safeFetch("/logout", { method: "GET" });
    } catch (error) {
        console.error("Logout request failed:", error);
    }

    window.location.href = "/login.html";
}


/* ================= INITIALIZATION ================= */

document.addEventListener("DOMContentLoaded", () => {
    applyStoredTheme();

    if (document.getElementById("planOutput")) loadSavedPlan();
    if (document.getElementById("quizBox")) loadQuiz();
    if (document.getElementById("taskList")) loadTasks();
    if (document.getElementById("notesBox")) loadNotesFromAI();
    if (document.getElementById("notesList")) loadSavedNotes();
    if (document.getElementById("userName")) loadProfile();
    if (document.getElementById("todayPlanBox")) loadTodayPlan();
    if (document.getElementById("timetableGrid")) loadSavedTimeTable();
});

/* ================= STUDY PLANNER ================= */

async function generatePlan() {
    const input = document.getElementById("subjects");
    const output = document.getElementById("planOutput");

    if (!input || !output) return;

    const subjects = input.value.trim();

    if (!subjects) {
        output.textContent = "Please enter at least one subject.";
        return;
    }

    output.textContent = "⏳ Generating your study plan...";

    try {
        const data = await safeFetch("/api/planner", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subjects })
        });

        if (!data.ok || !data.plan) {
            output.textContent =
                data.message ||
                data.error ||
                "Failed to generate the study plan. Please try again.";
            return;
        }

        // Save the plan and render it in the Planner.
        localStorage.setItem("lastPlan", data.plan);
        renderPlan(data.plan);

        // Split the plan into individual day entries.
        const lines = String(data.plan)
            .split(/(?=DAY\s*\d+)/i)
            .map(line => line.trim())
            .filter(Boolean);

        // Parse both emoji-style and dash-separated plan formats.
        const entries = lines.map((line, index) => {
            let day;
            let subject = "";
            let time = "";
            let topic = "";

            // Format example:
            // DAY 1 📘 Java ⏱ 2 hrs Learn core concepts 📖 Notes 🧠 Quiz
            const emojiMatch = line.match(
                /^DAY\s*(\d+)\s*📘\s*(.*?)\s*⏱\s*(.*?)\s+(.+?)\s*(?:📖\s*Notes)?\s*(?:🧠\s*Quiz)?\s*$/i
            );

            if (emojiMatch) {
                day = Number(emojiMatch[1]);
                subject = emojiMatch[2].trim();
                time = emojiMatch[3].trim();
                topic = emojiMatch[4].trim();
            } else {
                // Format example:
                // Day 1 - Java - 2 hrs - Learn core concepts
                const parts = line.split(/\s+-\s+/);
                const dayMatch = parts[0]?.match(/DAY\s*(\d+)/i);

                if (dayMatch) {
                    day = Number(dayMatch[1]);
                    subject = parts[1] || "";
                    time = parts[2] || "";
                    topic = parts.slice(3).join(" - ") || "";
                } else {
                    return null;
                }
            }

            topic = topic
                .replace(/📖\s*Notes/gi, "")
                .replace(/🧠\s*Quiz/gi, "")
                .trim();

            return {
                day: day || index + 1,
                subject,
                time,
                topic
            };
        }).filter(entry => entry && entry.subject && entry.topic);

        // Synchronize generated plan items with the checklist.
        if (entries.length > 0) {
            const syncResult = await safeFetch(
                "/api/tasks/sync-planner",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ entries })
                }
            );

            if (!syncResult.ok) {
                console.error(
                    "Planner checklist sync failed:",
                    syncResult.message || syncResult.error
                );

                output.textContent +=
                    "\n\n⚠️ Plan generated, but checklist tasks could not be synced.";
            }
        } else {
            console.warn(
                "Planner output did not match the expected task format:",
                data.plan
            );
        }
    } catch (error) {
        console.error("Planner generation failed:", error);
        output.textContent =
            "Unable to generate your study plan. Please try again.";
    }
}

/* Accepts:
   Day 1 - Java - 1 hr - Core Theory
   Also supports older entries without a duration.
*/

function parsePlanLine(line) {
    const text = String(line || "").trim();

    let match = text.match(
        /^Day\s*(\d+)\s*-\s*(.+?)\s*-\s*(\d+(?:\.\d+)?\s*(?:hr|hrs|hour|hours|min|mins|minutes))\s*-\s*(.+)$/i
    );

    if (match) {
        return {
            day: Number(match[1]),
            subject: match[2].trim(),
            duration: match[3].trim(),
            topic: match[4].trim()
        };
    }

    match = text.match(
        /^Day\s*(\d+)\s*-\s*(.+?)\s*-\s*(.+)$/i
    );

    if (match) {
        return {
            day: Number(match[1]),
            subject: match[2].trim(),
            duration: "",
            topic: match[3].trim()
        };
    }

    return null;
}

function renderPlan(text) {
    const output = document.getElementById("planOutput");
    if (!output) return;

    const entries = String(text || "")
        .split(/\r?\n/)
        .map(parsePlanLine)
        .filter(Boolean);

    if (!entries.length) {
        output.textContent =
            "No valid plan entries found. Please generate your plan again.";
        return;
    }

    output.innerHTML = entries.map(entry => `
        <div class="plan-card">
            <span style="color:#0a84ff;font-weight:700;font-size:13px;">
                DAY ${entry.day}
            </span>

            <h3 style="margin:6px 0 4px;">
                📘 ${escapeHTML(entry.subject)}
            </h3>

            ${entry.duration ? `
                <p>⏱ ${escapeHTML(entry.duration)}</p>
            ` : ""}

            <p style="color:#64748b;font-size:14px;margin-bottom:14px;">
                ${escapeHTML(entry.topic)}
            </p>

            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button
                    type="button"
                    data-action="notes"
                    data-subject="${encodeURIComponent(entry.subject)}"
                    data-topic="${encodeURIComponent(entry.topic)}">
                    📖 Notes
                </button>

                <button
                    type="button"
                    data-action="quiz"
                    data-subject="${encodeURIComponent(entry.subject)}"
                    data-topic="${encodeURIComponent(entry.topic)}">
                    🧠 Quiz
                </button>
            </div>
        </div>
    `).join("");

    output.querySelectorAll("[data-action]").forEach(button => {
        button.addEventListener("click", () => {
            const subject = button.dataset.subject;
            const topic = button.dataset.topic;

            if (button.dataset.action === "notes") {
                openNotes(subject, topic);
            } else {
                startQuiz(subject, topic);
            }
        });
    });
}

function loadSavedPlan() {
    const saved = localStorage.getItem("lastPlan");

    if (saved) renderPlan(saved);
}

/* ================= PLANNER AI TOOLS ================= */

async function summarizePlan() {
    const box = document.getElementById("aiPlanOutput");
    const plan = localStorage.getItem("lastPlan") || "";

    if (!box) return;

    if (!plan) {
        box.textContent = "Generate a study plan first.";
        return;
    }

    box.style.display = "block";
    box.textContent = "⏳ Generating plan summary...";

    const data = await safeFetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan })
    });

    box.textContent = data.summary ||
        data.message ||
        "Could not summarize the plan.";
}

async function generatePlanQuestions() {
    const box = document.getElementById("aiPlanOutput");
    const plan = localStorage.getItem("lastPlan") || "";

    if (!box) return;

    if (!plan) {
        box.textContent = "Generate a study plan first.";
        return;
    }

    box.style.display = "block";
    box.textContent = "⏳ Generating questions...";

    const data = await safeFetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan })
    });

    box.textContent = data.questions ||
        data.message ||
        "Could not generate questions.";
}

async function explainPlan() {
    const box = document.getElementById("aiPlanOutput");
    const plan = localStorage.getItem("lastPlan") || "";

    if (!box) return;

    if (!plan) {
        box.textContent = "Generate a study plan first.";
        return;
    }

    box.style.display = "block";
    box.textContent = "⏳ Generating study strategy...";

    const data = await safeFetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan })
    });

    box.textContent = data.explanation ||
        data.message ||
        "Could not explain the plan.";
}

/* ================= TODAY'S PLAN ================= */

function loadTodayPlan() {
    const box = document.getElementById("todayPlanBox");
    if (!box) return;

    const plan = localStorage.getItem("lastPlan");

    if (!plan) {
        box.innerHTML = `
            <div style="padding:10px;">
                <p>You haven't generated a study plan yet.</p>
                <button type="button" id="openStudyPlannerBtn">
                    🚀 Open Study Planner
                </button>
            </div>
        `;

        document.getElementById("openStudyPlannerBtn")
            ?.addEventListener("click", () => {
                window.location.href = "/planner.html";
            });

        return;
    }

    const entries = String(plan)
        .split(/\r?\n/)
        .map(parsePlanLine)
        .filter(Boolean);

    if (!entries.length) {
        box.textContent = "Your saved plan could not be read.";
        return;
    }

    let day = new Date().getDay();
    day = day === 0 ? 7 : day;

    const entry =
        entries.find(item => item.day === day) || entries[0];

    box.innerHTML = `
        <span style="color:#0a84ff;font-weight:700;">
            Today's Target — Day ${entry.day}
        </span>

        <h2 style="margin:10px 0 6px;">
            📘 ${escapeHTML(entry.subject)}
        </h2>

        ${entry.duration ? `
            <p>⏱ ${escapeHTML(entry.duration)}</p>
        ` : ""}

        <p style="color:#64748b;margin-bottom:16px;">
            ${escapeHTML(entry.topic)}
        </p>

        <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
            <button type="button" id="todayNotesBtn">📖 Open AI Notes</button>
            <button type="button" id="todayQuizBtn">🧠 Practice Quiz</button>
        </div>
    `;

    document.getElementById("todayNotesBtn")
        ?.addEventListener("click", () => {
            openNotes(
                encodeURIComponent(entry.subject),
                encodeURIComponent(entry.topic)
            );
        });

    document.getElementById("todayQuizBtn")
        ?.addEventListener("click", () => {
            startQuiz(
                encodeURIComponent(entry.subject),
                encodeURIComponent(entry.topic)
            );
        });
}

async function markDone() {
    const button = document.getElementById("markDoneBtn");

    if (button) {
        button.disabled = true;
        button.textContent = "⏳ Saving...";
    }

    const subject = typeof getStudySubject === "function"
        ? getStudySubject()
        : "Study Plan";

    const result = await safeFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            subject,
            task: "Today's Study Plan Completed",
            time: "Today"
        })
    });

    if (!result.ok) {
        if (button) {
            button.disabled = false;
            button.textContent = "Mark Done";
        }

        alert(result.message || "Could not save your completed task.");
        return;
    }

    if (button) {
        button.textContent = "🎉 Completed for Today!";
        button.style.background = "#10b981";
    }

    alert("🎉 Today's study goal has been recorded.");
}

/* =========================================================
   PART 2 OF 4 — NOTES CENTER AND QUIZ ENGINE
========================================================= */

/* ================= NOTES CENTER ================= */

function openNotes(subject, topic) {
    localStorage.setItem("subject", decodeSafely(subject));
    localStorage.setItem("topic", decodeSafely(topic));

    sessionStorage.setItem("previousPage", window.location.pathname);
    window.location.href = "/notes.html";
}

async function loadNotesFromAI() {
    const subject = localStorage.getItem("subject");
    const topic = localStorage.getItem("topic");
    const box = document.getElementById("notesBox");
    const title = document.getElementById("topicTitle");

    if (!box) return;

    if (!subject || !topic) {
        box.textContent =
            "Select a topic from your planner or enter one above to generate notes.";

        if (title) {
            title.textContent = "Select or Enter a Topic to Generate Notes";
        }
        return;
    }

    if (title) title.textContent = `Topic: ${subject} - ${topic}`;

    box.textContent = `⏳ Generating study notes for ${topic}...`;

    const data = await safeFetch("/api/generate-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, topic })
    });

    box.textContent = data.notes ||
        data.message ||
        "Could not generate notes. Please try again.";
}

async function generateCustomNotes() {
    const subjectInput = document.getElementById("customSubjectInput");
    const topicInput = document.getElementById("customTopicInput");

    if (!subjectInput || !topicInput) return;

    const subject = subjectInput.value.trim();
    const topic = topicInput.value.trim();

    if (!subject || !topic) {
        alert("Please enter both a subject and a topic.");
        return;
    }

    localStorage.setItem("subject", subject);
    localStorage.setItem("topic", topic);

    await loadNotesFromAI();
}

async function copyNotes() {
    const box = document.getElementById("notesBox");

    if (!box || !box.innerText.trim()) {
        alert("No notes to copy.");
        return;
    }

    try {
        await navigator.clipboard.writeText(box.innerText);
        alert("📋 Notes copied to clipboard!");
    } catch (error) {
        console.error("Copy notes failed:", error);
        alert("Could not copy notes automatically. Check browser clipboard permissions.");
    }
}

async function saveCurrentAINote() {
    const box = document.getElementById("notesBox");
    const subject = localStorage.getItem("subject") || "Study";
    const topic = localStorage.getItem("topic") || "Notes";

    if (
        !box ||
        !box.innerText.trim() ||
        box.innerText.includes("Select a topic") ||
        box.innerText.includes("Generating study notes")
    ) {
        alert("Generate notes before saving.");
        return;
    }

    const note = `[${subject} - ${topic}]\n${box.innerText.trim()}`;

    const result = await safeFetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note })
    });

    if (result.ok && result.success) {
        alert("✅ AI note saved!");
        await loadSavedNotes();
    } else {
        alert(result.message || "Could not save the note.");
    }
}

async function addNote() {
    const input = document.getElementById("noteText");
    if (!input) return;

    const note = input.value.trim();

    if (!note) {
        alert("Please enter some notes before saving.");
        return;
    }

    const result = await safeFetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note })
    });

    if (result.ok && result.success) {
        input.value = "";
        await loadSavedNotes();
        alert("💾 Note saved to your account!");
    } else {
        alert(result.message || "Failed to save the note.");
    }
}

async function loadSavedNotes() {
    const box = document.getElementById("notesList");
    if (!box) return;

    box.textContent = "Loading saved notes...";

    const result = await safeFetch("/api/notes");

    if (!result.ok) {
        box.textContent = result.message || "Could not load saved notes.";
        return;
    }

    const notes = Array.isArray(result.notes) ? result.notes : [];

    if (!notes.length) {
        box.innerHTML =
            "<p style='color:#64748b;'>📭 No saved notes yet.</p>";
        return;
    }

    box.innerHTML = notes.map(note => `
        <div class="card" style="padding:14px 18px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
            <div style="white-space:pre-wrap;line-height:1.5;font-size:14px;flex:1;">
                ${escapeHTML(note.note)}
            </div>

            <button
                type="button"
                data-delete-note="${Number(note.id)}"
                style="background:#ef4444;padding:6px 12px;font-size:12px;">
                Delete
            </button>
        </div>
    `).join("");

    box.querySelectorAll("[data-delete-note]").forEach(button => {
        button.addEventListener("click", () => {
            deleteNote(Number(button.dataset.deleteNote));
        });
    });
}

async function deleteNote(id) {
    if (!Number.isInteger(id) || id <= 0) return;
    if (!confirm("Are you sure you want to delete this note?")) return;

    const result = await safeFetch(`/api/notes/${id}`, {
        method: "DELETE"
    });

    if (result.ok && result.success) {
        await loadSavedNotes();
    } else {
        alert(result.message || "Failed to delete the note.");
    }
}

/* ================= QUIZ ENGINE ================= */

let quizData = [];
let quizStartTime = null;
let quizTimerInterval = null;
let quizGenerationInProgress = false;
let quizRequestNumber = 0;
let quizSubmitted = false;

function startQuiz(subject, topic) {
    localStorage.setItem("quizSubject", decodeSafely(subject));
    localStorage.setItem("quizTopic", decodeSafely(topic));

    sessionStorage.setItem("previousPage", window.location.pathname);
    window.location.href = "/quiz.html";
}

function startCustomQuiz() {
    const subjectInput = document.getElementById("customQuizSubject");
    const topicInput = document.getElementById("customQuizTopic");

    if (!subjectInput || !topicInput) return;

    const subject = subjectInput.value.trim();
    const topic = topicInput.value.trim();

    if (!subject || !topic) {
        alert("Please enter both a subject and a topic.");
        return;
    }

    localStorage.setItem("quizSubject", subject);
    localStorage.setItem("quizTopic", topic);

    loadQuiz();
}

async function loadQuiz() {
    if (quizGenerationInProgress) return;

    const box = document.getElementById("quizBox");
    const heading = document.getElementById("quizTopicHeading");

    if (!box) return;

    const subject = localStorage.getItem("quizSubject") || "General Knowledge";
    const topic = localStorage.getItem("quizTopic") || "Fundamentals";

    quizGenerationInProgress = true;
    const requestNumber = ++quizRequestNumber;
    quizSubmitted = false;
    quizData = [];

    clearInterval(quizTimerInterval);
    quizTimerInterval = null;

    const reloadButton = Array.from(document.querySelectorAll("button"))
        .find(button => /Reload Questions/i.test(button.textContent));

    if (reloadButton) {
        reloadButton.disabled = true;
        reloadButton.textContent = "⏳ Generating...";
    }

    if (heading) {
        heading.textContent = `Quiz: ${subject} - ${topic}`;
    }

    box.textContent = "⏳ Creating quiz questions...";

    const resultBox = document.getElementById("quizResult");
    if (resultBox) resultBox.innerHTML = "";

    try {
        const result = await safeFetch("/api/generate-quiz", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                subject,
                topic,
                variation: `${Date.now()}-${Math.random().toString(36).slice(2)}`
            })
        });

        if (requestNumber !== quizRequestNumber) return;

        if (!result.ok || !result.quiz) {
            box.textContent =
                result.message || "Quiz generation failed. Please try again.";
            return;
        }

        renderQuiz(result.quiz);

        if (quizData.length > 0) {
            quizStartTime = Date.now();
            startQuizTimer();
        }
    } catch (error) {
        console.error("Quiz generation failed:", error);
        box.textContent = "Unable to generate questions. Please try again.";
    } finally {
        if (requestNumber === quizRequestNumber) {
            quizGenerationInProgress = false;

            if (reloadButton) {
                reloadButton.disabled = false;
                reloadButton.textContent = "🔄 Reload Questions";
            }
        }
    }
}

/* Parse questions, options and answer keys safely.
   Expected format:
   Q1) Question text
   A) Option one
   B) Option two
   C) Option three
   D) Option four
   Answer: C
*/

function renderQuiz(text) {
    const box = document.getElementById("quizBox");
    if (!box) return;

    quizData = [];
    let current = null;

    function finishQuestion() {
        if (!current) return;

        const letters = current.options.map(option => option.letter);

        const valid =
            current.question &&
            ["A", "B", "C", "D"].every(letter => letters.includes(letter)) &&
            new Set(letters).size === 4 &&
            ["A", "B", "C", "D"].includes(current.answer);

        if (valid) {
            quizData.push({
                question: current.question,
                options: current.options,
                answer: current.answer
            });
        }

        current = null;
    }

    for (const rawLine of String(text || "").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;

        const questionMatch = line.match(
            /^(?:\*\*)?(?:Q\s*\d+\s*[\).:]?|\d+\s*[.)]|Question\s+\d+\s*[:.)]?)\s*(.*?)(?:\*\*)?$/i
        );

        if (questionMatch) {
            finishQuestion();

            current = {
                question: questionMatch[1].replace(/\*\*/g, "").trim(),
                options: [],
                answer: ""
            };

            continue;
        }

        if (!current) continue;

        const answerMatch = line.match(
            /^(?:\*\*)?Answer\s*:\s*([A-D])\s*(?:\*\*)?$/i
        );

        if (answerMatch) {
            current.answer = answerMatch[1].toUpperCase();
            continue;
        }

        const optionMatch = line.match(
            /^\s*([A-D])\s*[\).:]\s*(.+?)\s*$/
        );

        if (optionMatch) {
            current.options.push({
                letter: optionMatch[1].toUpperCase(),
                text: optionMatch[2].replace(/\*\*/g, "").trim()
            });
        }
    }

    finishQuestion();

    if (!quizData.length) {
        box.textContent =
            "❌ The quiz response couldn't be parsed. Click Reload Questions to try again.";
        return;
    }

    box.innerHTML = quizData.map((question, index) => `
        <div class="card" style="padding:18px 20px;">
            <b class="quiz-q" style="font-size:15px;color:#0f172a;">
                ${escapeHTML(question.question)}
            </b>

            <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
                ${question.options.map(option => `
                    <label style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:14px;">
                        <input
                            type="radio"
                            name="q${index}"
                            value="${option.letter}"
                            style="width:auto;margin:3px 0 0;">
                        <span>${option.letter}) ${escapeHTML(option.text)}</span>
                    </label>
                `).join("")}
            </div>
        </div>
    `).join("");
}

/* ================= QUIZ TIMER ================= */

function startQuizTimer() {
    let timeLeft = 60;
    const timer = document.getElementById("timer");

    if (timer) timer.textContent = String(timeLeft);

    clearInterval(quizTimerInterval);

    quizTimerInterval = setInterval(() => {
        timeLeft--;

        if (timer) timer.textContent = String(Math.max(0, timeLeft));

        if (timeLeft <= 0) {
            clearInterval(quizTimerInterval);
            quizTimerInterval = null;

            if (!quizSubmitted) {
                alert("⏰ Time is up! Submitting your answers.");
                submitQuiz();
            }
        }
    }, 1000);
}

/* ================= SUBMIT QUIZ ================= */

async function submitQuiz() {
    if (!quizData.length) {
        alert("The quiz hasn't loaded yet.");
        return;
    }

    if (quizSubmitted) return;

    quizSubmitted = true;

    clearInterval(quizTimerInterval);
    quizTimerInterval = null;

    const submitButton = document.getElementById("submitQuizBtn");
    if (submitButton) submitButton.disabled = true;

    let score = 0;

    quizData.forEach((question, index) => {
        const selected = document.querySelector(
            `input[name="q${index}"]:checked`
        );

        if (selected && selected.value === question.answer) {
            score++;
        }
    });

    const total = quizData.length;
    const percentage = Math.round((score / total) * 100);
    const timeTaken = quizStartTime
        ? Math.round((Date.now() - quizStartTime) / 1000)
        : 0;

    const resultBox = document.getElementById("quizResult");

    if (resultBox) {
        resultBox.innerHTML = `
            <div class="card center" style="margin-top:20px;border:2px solid #0a84ff;">
                <h2>🎯 Quiz Results</h2>
                <h1 style="font-size:42px;color:${percentage >= 60 ? "#10b981" : "#ef4444"};margin:12px 0;">
                    ${percentage}%
                </h1>
                <p style="font-size:16px;font-weight:600;">
                    Score: ${score} / ${total} Correct
                </p>
                <p style="color:#64748b;margin-top:4px;">
                    ⏱ Time Taken: ${timeTaken} seconds
                </p>
                <p id="quizSaveStatus" style="margin-top:10px;">
                    ⏳ Saving result...
                </p>
            </div>
        `;
    }

    const subject = localStorage.getItem("quizSubject") || "General Study";
    const topic = localStorage.getItem("quizTopic") || "";

    const saveStatus = document.getElementById("quizSaveStatus");

    const result = await safeFetch("/api/ml/quiz-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            subject,
            topic,
            score,
            total_questions: total
        })
    });

    if (result.ok) {
        if (saveStatus) {
            saveStatus.textContent = "✅ Result saved to your learning profile.";
            saveStatus.style.color = "#10b981";
        }
    } else {
        if (saveStatus) {
            saveStatus.textContent =
                "⚠️ Result could not be saved. Your score is displayed above.";
            saveStatus.style.color = "#ef4444";
        }

        console.error("Quiz result save failed:", result);
    }
}

/* =========================================================
   PART 3 — TIMETABLE, TASKS, PROFILE & ML ANALYSIS
========================================================= */


/* ================= TIMETABLE ================= */

async function generateTimeTable() {
const subjectsInput = document.getElementById("subjects");
const durationInput = document.getElementById("timetableDuration");
const output = document.getElementById("timetableGrid");

    if (!subjectsInput || !durationInput || !output) {
        console.error("Timetable elements were not found.");
        return;
    }

    const subjects = subjectsInput.value
        .split(/[,;\n]+/)
        .map(subject => subject.trim())
        .filter(Boolean);

    const duration = Number(durationInput.value);

    if (subjects.length === 0) {
        alert("Please enter at least one subject.");
        return;
    }

    if (![1, 7, 14, 21, 30].includes(duration)) {
        alert("Please select a valid timetable duration.");
        return;
    }

    output.textContent = "Generating your timetable...";

    try {
        const response = await safeFetch("/api/timetable", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subjects, duration })
        });

        if (!response.ok) {
            throw new Error(
                response.data?.error ||
                response.data?.message ||
                `Could not generate timetable (HTTP ${response.status}).`
            );
        }

const data = response?.data ?? response ?? {};
let planText = "";

if (Array.isArray(data)) {
    planText = data.map(String).join("\n");
} else if (typeof data === "string") {
    planText = data;
} else if (data && typeof data === "object") {
    planText =
        data.plan ??
        data.timetable ??
        data.result ??
        data.message ??
        "";

    if (!planText && Array.isArray(data.entries)) {
        planText = data.entries.map(entry => {
            if (typeof entry === "string") return entry;

            return [
                `Day ${entry.day ?? entry.day_number ?? 1}`,
                entry.subject ?? "General",
                entry.time ?? entry.duration ?? "1 hr",
                entry.topic ?? entry.task ?? "Study and revision"
            ].join(" - ");
        }).join("\n");
    }
}

        if (typeof data === "string") {
            planText = data;
        } else {
            planText =
                data.plan ||
                data.timetable ||
                data.result ||
                data.message ||
                "";
        }

        if (!planText && Array.isArray(data.entries)) {
            planText = data.entries.map(entry => {
                if (typeof entry === "string") return entry;

                return [
                    `Day ${entry.day || entry.day_number || 1}`,
                    entry.subject || "General",
                    entry.time || entry.duration || "1 hr",
                    entry.topic || entry.task || "Revision"
                ].join(" - ");
            }).join("\n");
        }

        if (!planText) {
            throw new Error("The server returned an empty timetable.");
        }
// Sync generated timetable sessions into the study checklist
const timetableEntries = planText
    .split(/\r?\n/)
    .map((line, index) => {
        const parts = line.trim().split(/\s+-\s+/);
        const dayMatch = parts[0]?.match(/Day\s*(\d+)/i);

        return {
            day: dayMatch ? Number(dayMatch[1]) : index + 1,
            subject: parts[1] || "",
            time: parts[2] || "",
            topic: parts.slice(3).join(" - ") || ""
        };
    })
    .filter(entry => entry.subject && entry.topic);

if (timetableEntries.length > 0) {
    const syncResult = await safeFetch("/api/tasks/sync-timetable", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ entries: timetableEntries })
    });

    if (!syncResult.ok) {
        console.warn(
            "Timetable generated, but checklist sync failed:",
            syncResult.message || syncResult.error
        );
    }
}

localStorage.setItem("lastTimetable", planText);
localStorage.setItem("lastTimetableDuration", String(duration));

renderTimeTable(planText);
    } catch (error) {
        console.error("Timetable generation failed:", error);
        output.textContent =
            error.message || "Unable to generate timetable. Please try again.";
    }
}


function renderTimeTable(text) {
    const output = document.getElementById("timetableGrid");

    if (!output) return;

    const lines = String(text)
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        output.textContent = "No timetable entries were found.";
        return;
    }

    const entries = lines.map((line, index) => {
        const parts = line.split(/\s+-\s+/);

        const dayMatch = parts[0]?.match(/Day\s*(\d+)/i);
        const day = dayMatch ? Number(dayMatch[1]) : index + 1;

        return {
            day,
            subject: parts[1] || "General",
            time: parts[2] || "1 hr",
            topic: parts.slice(3).join(" - ") || "Study and revision"
        };
    });

    output.innerHTML = entries.map(entry => `
        <div class="timetable-card">
            <h3>Day ${entry.day}</h3>
            <p><strong>Subject:</strong> ${escapeHTML(entry.subject)}</p>
            <p><strong>Duration:</strong> ${escapeHTML(entry.time)}</p>
            <p><strong>Topic:</strong> ${escapeHTML(entry.topic)}</p>
        </div>
    `).join("");
}


function loadSavedTimeTable() {
    const saved = localStorage.getItem("lastTimetable");

    if (saved) {
        renderTimeTable(saved);
    }

    const savedDuration = localStorage.getItem("lastTimetableDuration");
    const durationInput = document.getElementById("timetableDuration");

    if (savedDuration && durationInput) {
        durationInput.value = savedDuration;
    }
}


/* ================= STUDY TASKS ================= */

async function loadTasks() {
    const container = document.getElementById("taskList");

    if (!container) return;

    try {
        const response = await safeFetch("/api/tasks");

if (!response.ok) {
    throw new Error(
        response.error ||
        response.message ||
        `Could not load tasks (HTTP ${response.status}).`
    );
}

        const data = response ?? {};

        const tasks = Array.isArray(data)
            ? data
            : Array.isArray(data.tasks)
            ? data.tasks
            : [];

        localStorage.setItem("tasks", JSON.stringify(tasks));

        if (tasks.length === 0) {
            container.innerHTML = "<p>No tasks yet. Add your first study task!</p>";
            return;
        }

        container.innerHTML = tasks.map(task => {
            const id = escapeHTML(String(task.id ?? ""));
            const description = escapeHTML(
                task.task || task.title || task.subject || "Study task"
            );
            const completed =
                task.completed === true ||
                task.completed === 1 ||
                task.status === "completed";

            return `
                <div class="task-item">
                    <span>${description}</span>
                    <button type="button"
                        data-task-action="toggle"
                        data-task-id="${id}">
                        ${completed ? "Undo" : "Complete"}
                    </button>
                    <button type="button"
                        data-task-action="delete"
                        data-task-id="${id}">
                        Delete
                    </button>
                </div>
            `;
        }).join("");

        if (!container.dataset.taskEventsAttached) {
            container.addEventListener("click", event => {
                const button = event.target.closest("button[data-task-action]");
                if (!button) return;

                const id = button.dataset.taskId;
                if (!id) return;

                if (button.dataset.taskAction === "toggle") {
                    toggleTask(id);
                } else if (button.dataset.taskAction === "delete") {
                    deleteTask(id);
                }
            });

            container.dataset.taskEventsAttached = "true";
        }
    } catch (error) {
        console.error("Loading tasks failed:", error);

        const saved = JSON.parse(localStorage.getItem("tasks") || "[]");

        if (saved.length) {
            container.innerHTML = saved.map(task => `
                <div class="task-item">
                    ${escapeHTML(task.task || task.title || "Study task")}
                </div>
            `).join("");
        } else {
            container.textContent = "Could not load tasks. Please refresh.";
        }
    }
}


async function addTask() {
    const subjectInput = document.getElementById("taskSubject");
    const taskInput = document.getElementById("taskInput");
    const timeInput = document.getElementById("taskTime");

    const subject = subjectInput?.value.trim() || "";
    const task = taskInput?.value.trim() || "";
    const time = timeInput?.value.trim() || "";

    if (!task) {
        alert("Please enter a task.");
        return;
    }

    try {
        const response = await safeFetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                subject: subject || "General",
                task,
                time: time || task
            })
        });

        if (!response.ok || response.data?.success === false) {
            throw new Error(
                response.data?.message || "Could not add task."
            );
        }

        if (taskInput) taskInput.value = "";
        if (subjectInput) subjectInput.value = "";
        if (timeInput) timeInput.value = "";

        await loadTasks();
        await loadProfile();
    } catch (error) {
        console.error("Adding task failed:", error);
        alert(error.message || "Unable to add task.");
    }
}


async function toggleTask(id) {
    try {
        const response = await safeFetch(
            `/api/tasks/${encodeURIComponent(id)}/toggle`,
            { method: "PUT" }
        );

        if (!response.ok || response.data?.success === false) {
            throw new Error("Could not update this task.");
        }

        await loadTasks();
        await loadProfile();
    } catch (error) {
        console.error("Updating task failed:", error);
        alert(error.message || "Unable to update task.");
    }
}


async function deleteTask(id) {
    if (!confirm("Are you sure you want to delete this task?")) return;

    try {
        const response = await safeFetch(
            `/api/tasks/${encodeURIComponent(id)}`,
            { method: "DELETE" }
        );

        if (!response.ok || response.data?.success === false) {
            throw new Error("Could not delete this task.");
        }

        await loadTasks();
        await loadProfile();
    } catch (error) {
        console.error("Deleting task failed:", error);
        alert(error.message || "Unable to delete task.");
    }
}


/* ================= PROFILE ================= */


async function loadProfile() {
    try {
        const response = await safeFetch("/api/profile");

        if (!response.ok) {
            console.error("Could not load profile:", response);
            return;
        }

        // IMPORTANT: safeFetch returns data directly, not inside response.data
        const data = response;

        const userName = document.getElementById("userName");
        const greetingName = document.getElementById("dashboardGreetingName");
        const topbarName = document.getElementById("topbarUserName");
        const greetingText = document.getElementById("dashboardGreetingText");

        let displayName = data.name || "Student";

        // Display the username
        if (userName) userName.textContent = displayName;
        if (greetingName) greetingName.textContent = displayName;
        if (topbarName) topbarName.textContent = displayName;

        // Set the correct welcome message
        if (greetingText) {
            greetingText.textContent = data.firstTime
                ? "Welcome to Study Buddy AI,"
                : "Welcome back,";
        }

        // Ask for a display name for a first-time user
        if (data.firstTime) {
            const enteredName = prompt(
                "Welcome to Study Buddy AI! What should we call you?",
                displayName
            );

            if (enteredName && enteredName.trim()) {
                const saveResponse = await safeFetch("/api/save-profile", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        name: enteredName.trim()
                    })
                });

                if (saveResponse.ok && saveResponse.success) {
                    displayName = saveResponse.name;

                    if (userName) userName.textContent = displayName;
                    if (greetingName) greetingName.textContent = displayName;
                    if (topbarName) topbarName.textContent = displayName;
                }
            }
        }

        const hours = document.getElementById("hours");
        const tasks = document.getElementById("tasks");
        const streak = document.getElementById("streak");

        if (hours) hours.textContent = data.hours ?? 0;
        if (tasks) tasks.textContent = data.tasks ?? 0;
        if (streak) streak.textContent = data.streak ?? 0;

    } catch (error) {
        console.error("Profile loading error:", error);
    }
}


/* ================= SETTINGS ================= */

function openSettings() {
    const box = document.getElementById("settingsBox");
    const nameInput = document.getElementById("settingNameInput");
    const nameElement = document.getElementById("userName");

    if (box) box.style.display = "block";

    if (nameInput && nameElement) {
        nameInput.value = nameElement.textContent.trim();
    }
}


function closeSettings() {
    const box = document.getElementById("settingsBox");

    if (box) box.style.display = "none";
}


async function saveSettings() {
    const nameInput = document.getElementById("settingNameInput");
    const passwordInput = document.getElementById("settingPasswordInput");

    const name = nameInput?.value.trim() || "";
    const newPassword = passwordInput?.value || "";

    if (!name) {
        alert("Please enter your name.");
        return;
    }

    try {
        const response = await safeFetch("/api/profile/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, newPassword })
        });

        if (!response.ok || response.data?.success === false) {
            throw new Error(
                response.data?.message || "Could not save settings."
            );
        }

        alert("Settings saved successfully.");

        if (passwordInput) passwordInput.value = "";

        closeSettings();
        await loadProfile();
    } catch (error) {
        console.error("Saving settings failed:", error);
        alert(error.message || "Unable to save settings.");
    }
}


/* ================= ML PERFORMANCE ANALYSIS ================= */




async function loadMLAnalysis() {
    const box = document.getElementById("mlAnalysisBox");
    const container = document.getElementById("mlAnalysisContent");
    const chart = document.getElementById("performanceChartContent");

    if (!box || !container || !chart) {
        console.warn("Performance chart HTML elements are missing.");
        return;
    }

    box.style.display = "block";
    container.textContent = "Loading performance analysis...";
    chart.textContent = "Loading charts...";

    try {
        const response = await safeFetch("/api/ml/analysis");

        if (!response.ok || response.success === false) {
            throw new Error(
                response.message || "Could not load performance data."
            );
        }

        const analysis = Array.isArray(response.analysis)
            ? response.analysis
            : [];

        if (!analysis.length) {
            container.innerHTML = `
                <div class="card">
                    <h3>📊 Your Performance</h3>
                    <p>No performance data is available yet.</p>
                    <p>Complete a quiz and mark some study tasks as completed.
                    Your charts will update when your data is available.</p>
                </div>
            `;

            chart.innerHTML = `
                <div class="card" style="padding:24px;text-align:center;">
                    <h3>📈 Student Performance Dashboard</h3>
                    <p>Complete your first quiz to start building your graphs.</p>
                    <div style="font-size:48px;margin:18px;">📊</div>
                    <p>Quiz scores, task completion and study time will appear here.</p>
                </div>
            `;
            return;
        }

        const safeNumber = (value, max = Infinity) =>
            Math.max(0, Math.min(max, Number(value) || 0));

        const escapeText = value =>
            String(value ?? "").replace(/[&<>"']/g, character => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            })[character]);

        const colors = ["#4f46e5", "#0ea5e9", "#10b981",
                        "#f59e0b", "#ec4899", "#8b5cf6"];

        // Summary cards
        container.innerHTML = analysis.map(item => {
            const subject = escapeText(item.subject || "General Study");
            const average = safeNumber(item.quiz_average, 100);
            const best = safeNumber(item.best_score, 100);
            const completion = safeNumber(item.task_completion_rate, 100);
            const hours = safeNumber(item.study_hours);

            return `
                <div class="card" style="margin:12px 0;padding:18px;">
                    <h3>📘 ${subject}</h3>
                    <p>Quiz average: <strong>${average}%</strong></p>
                    <p>Best quiz score: <strong>${best}%</strong></p>
                    <p>Task completion: <strong>${completion}%</strong></p>
                    <p>Study time: <strong>${hours} hours</strong></p>
                    <p>Quiz attempts:
                        <strong>${safeNumber(item.quiz_attempts)}</strong>
                    </p>
                    <p>Performance level:
                        <strong>${escapeText(item.level || "Not Tested")}</strong>
                    </p>
                    <p>${escapeText(
                        item.recommendation || "Keep practising regularly."
                    )}</p>
                </div>
            `;
        }).join("");

        // BAR CHART: compare quiz average, best score and task completion.
        const barCharts = analysis.map(item => {
            const subject = escapeText(item.subject || "General Study");

            const metrics = [
                { label: "Quiz Average", value: safeNumber(item.quiz_average, 100),
                  color: "#4f46e5" },
                { label: "Best Score", value: safeNumber(item.best_score, 100),
                  color: "#0ea5e9" },
                { label: "Task Completion", value: safeNumber(item.task_completion_rate, 100),
                  color: "#10b981" }
            ];

            return `
                <div class="card" style="padding:20px;margin-bottom:18px;">
                    <h3>📊 ${subject} — Bar Chart</h3>

                    ${metrics.map(metric => `
                        <div style="margin:18px 0;">
                            <div style="display:flex;justify-content:space-between;
                                        gap:12px;margin-bottom:7px;">
                                <span>${metric.label}</span>
                                <strong>${metric.value}%</strong>
                            </div>

                            <div style="height:22px;background:#e2e8f0;
                                        border-radius:6px;overflow:hidden;">
                                <div role="img"
                                     aria-label="${metric.label}: ${metric.value}%"
                                     style="width:${metric.value}%;height:100%;
                                            background:${metric.color};
                                            border-radius:6px;
                                            transition:width .5s;">
                                </div>
                            </div>
                        </div>
                    `).join("")}

                    <div style="display:flex;justify-content:space-between;
                                font-size:12px;color:#64748b;">
                        <span>0%</span><span>50%</span><span>100%</span>
                    </div>
                </div>
            `;
        }).join("");

        // PIE CHARTS: completed vs remaining percentage.
        const pieCharts = analysis.map((item, index) => {
            const subject = escapeText(item.subject || "General Study");
            const average = safeNumber(item.quiz_average, 100);
            const completion = safeNumber(item.task_completion_rate, 100);
            const color = colors[index % colors.length];

            return `
                <div class="card" style="padding:20px;margin-bottom:18px;">
                    <h3>🥧 ${subject} — Pie Charts</h3>

                    <div style="display:flex;flex-wrap:wrap;gap:28px;
                                justify-content:space-around;margin-top:22px;">

                        <div style="text-align:center;min-width:130px;">
                            <div role="img"
                                 aria-label="Quiz average ${average}% and remaining ${100 - average}%"
                                 style="width:140px;height:140px;border-radius:50%;
                                        margin:auto;
                                        background:conic-gradient(
                                            ${color} 0% ${average}%,
                                            #e2e8f0 ${average}% 100%);
                                        display:grid;place-items:center;">
                                <div style="width:88px;height:88px;border-radius:50%;
                                            background:var(--card-bg, white);
                                            display:grid;place-items:center;
                                            font-size:20px;font-weight:700;">
                                    ${average}%
                                </div>
                            </div>
                            <p><strong>Quiz Average</strong></p>
                            <p style="font-size:13px;color:#64748b;">
                                Remaining: ${100 - average}%
                            </p>
                        </div>

                        <div style="text-align:center;min-width:130px;">
                            <div role="img"
                                 aria-label="Tasks completed ${completion}% and remaining ${100 - completion}%"
                                 style="width:140px;height:140px;border-radius:50%;
                                        margin:auto;
                                        background:conic-gradient(
                                            #10b981 0% ${completion}%,
                                            #e2e8f0 ${completion}% 100%);
                                        display:grid;place-items:center;">
                                <div style="width:88px;height:88px;border-radius:50%;
                                            background:var(--card-bg, white);
                                            display:grid;place-items:center;
                                            font-size:20px;font-weight:700;">
                                    ${completion}%
                                </div>
                            </div>
                            <p><strong>Task Completion</strong></p>
                            <p style="font-size:13px;color:#64748b;">
                                Remaining: ${100 - completion}%
                            </p>
                        </div>
                    </div>

                    <p style="font-size:12px;color:#64748b;margin-top:18px;">
                        Grey represents the percentage remaining.
                    </p>
                </div>
            `;
        }).join("");

        chart.innerHTML = `
            <div style="display:grid;grid-template-columns:
                        repeat(auto-fit,minmax(min(100%,320px),1fr));
                        gap:18px;">
                <div style="grid-column:1/-1;">
                    <h2>📈 Student Performance Dashboard</h2>
                    <p>Compare quiz scores, task completion and progress by subject.</p>
                </div>
                ${barCharts}
                ${pieCharts}
            </div>
        `;

    } catch (error) {
        console.error("Performance analysis failed:", error);

        container.textContent =
            error.message || "Unable to load performance analysis.";

        chart.innerHTML = `
            <div class="card" style="padding:20px;">
                <h3>⚠️ Charts could not be loaded</h3>
                <p>${escapeText(error.message || "Please try again.")}</p>
            </div>
        `;
    }
}




/* =========================================================
   PART 4 — AI ASSISTANT, SHARED TIMER & TODAY'S PLAN POPUP
========================================================= */


/* ================= GENERAL AI ASSISTANT ================= */

async function summarizeNotes() {
    const input = document.getElementById("assistInput");
    const output = document.getElementById("assistOutput");
    const text = input?.value.trim() || "";

    if (!text) {
        alert("Please enter some text to summarize.");
        return;
    }

    if (output) output.textContent = "Summarizing...";

    try {
        const response = await safeFetch("/api/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            throw new Error("Unable to summarize the text.");
        }

        const result = response.data;
        const summary = result.summary || result.result || result.message;

        if (output) {
            output.textContent = summary || "No summary was returned.";
        }
    } catch (error) {
        console.error("Summarization failed:", error);
        if (output) {
            output.textContent = error.message || "Summarization failed.";
        }
    }
}


async function generateQuestions() {
    const input = document.getElementById("assistInput");
    const output = document.getElementById("assistOutput");
    const text = input?.value.trim() || "";

    if (!text) {
        alert("Please enter some text to generate questions.");
        return;
    }

    if (output) output.textContent = "Generating questions...";

    try {
        const response = await safeFetch("/api/questions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            throw new Error("Unable to generate questions.");
        }

        const result = response.data;
        const questions = result.questions || result.result || result.message;

        if (output) {
            output.textContent = questions || "No questions were returned.";
        }
    } catch (error) {
        console.error("Question generation failed:", error);
        if (output) {
            output.textContent = error.message || "Question generation failed.";
        }
    }
}


async function explainTopic() {
    const input = document.getElementById("assistInput");
    const output = document.getElementById("assistOutput");
    const text = input?.value.trim() || "";

    if (!text) {
        alert("Please enter a topic to explain.");
        return;
    }

    if (output) output.textContent = "Preparing an explanation...";

    try {
        const response = await safeFetch("/api/explain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            throw new Error("Unable to explain this topic.");
        }

        const result = response.data;
        const explanation =
            result.explanation || result.result || result.message;

        if (output) {
            output.textContent =
                explanation || "No explanation was returned.";
        }
    } catch (error) {
        console.error("Topic explanation failed:", error);
        if (output) {
            output.textContent = error.message || "Explanation failed.";
        }
    }
}


/* ================= SHARED STUDY TIMER ================= */


(() => {
    const KEY = "studyBuddySharedTimer";

    let displayInterval = null;
    let initialized = false;

    function readState() {
        try {
            const stored = localStorage.getItem(KEY);
            if (stored) return JSON.parse(stored);
        } catch (error) {
            console.error("Could not read study timer:", error);
        }

        return {
            elapsed: 0,
            startedAt: null,
            running: false,
            finished: false,
            subject: "General Study"
        };
    }

    function saveState(state) {
        localStorage.setItem(KEY, JSON.stringify(state));
    }

    function elapsedSeconds(state) {
        let elapsed = Math.max(0, Number(state.elapsed) || 0);

        if (state.running && state.startedAt) {
            elapsed += Math.max(
                0,
                Math.floor((Date.now() - state.startedAt) / 1000)
            );
        }

        return elapsed;
    }

    function formatTime(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return [hours, minutes, seconds]
            .map(value => String(value).padStart(2, "0"))
            .join(":");
    }

    function render() {
        const state = readState();

        const timerElement =
            document.getElementById("dashboardStudyTimer");
        const subjectElement =
            document.getElementById("dashboardTimerSubject");
        const statusElement =
            document.getElementById("dashboardTimerStatus");
        const pauseButton =
            document.getElementById("dashboardPauseTimerBtn");
        const finishButton =
            document.getElementById("dashboardFinishTimerBtn");

        if (timerElement) {
            timerElement.textContent = formatTime(elapsedSeconds(state));
        }

        if (subjectElement) {
            subjectElement.textContent = state.subject || "General Study";
        }

        if (statusElement) {
            statusElement.textContent = state.finished
                ? "Session finished"
                : state.running
                    ? "Study session running"
                    : "Study session paused";
        }

        if (pauseButton) {
            pauseButton.textContent = state.running ? "Pause" : "Resume";
            pauseButton.disabled = Boolean(state.finished);
        }

        if (finishButton) {
            finishButton.disabled = Boolean(state.finished);
        }
    }

    function pauseTimer() {
        const state = readState();

        if (!state.running || state.finished) return;

        state.elapsed = elapsedSeconds(state);
        state.startedAt = null;
        state.running = false;

        saveState(state);
        render();
    }

    function resumeTimer() {
        const state = readState();

        if (state.running || state.finished) return;

        state.startedAt = Date.now();
        state.running = true;

        saveState(state);
        render();
    }

    function startFreshSession() {
        const state = {
            elapsed: 0,
            startedAt: Date.now(),
            running: true,
            finished: false,
            subject: "General Study"
        };

        saveState(state);
        render();
    }

    async function finishTimer() {
        const state = readState();

        if (state.finished) return;

        state.elapsed = elapsedSeconds(state);
        state.startedAt = null;
        state.running = false;
        state.finished = true;

        saveState(state);
        render();

        const durationMinutes = Math.floor(state.elapsed / 60);

        if (durationMinutes <= 0) {
            alert("Study session finished. No full minute was recorded.");
            return;
        }

        try {
            const response = await safeFetch("/api/ml/study-session", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    subject: state.subject || "General Study",
                    duration_minutes: durationMinutes
                })
            });

            if (!response.ok || response.success === false) {
                throw new Error(
                    response.message || "The session could not be saved."
                );
            }

            alert("Study session saved successfully!");
        } catch (error) {
            console.error("Saving study session failed:", error);

            alert(
                "The timer has stopped, but the session may not have been saved."
            );
        }
    }

    function stopTimerForLogout() {
        pauseTimer();
    }

    function initialize() {
        if (initialized) return;
        initialized = true;

        const path = window.location.pathname.toLowerCase();

        if (
            path.includes("login") ||
            path.includes("register") ||
            path.includes("signup")
        ) {
            return;
        }

        // Preserve an existing session instead of resetting it.
        let state = readState();

        if (!localStorage.getItem(KEY)) {
            if (path.includes("dashboard")) {
                startFreshSession();
            }
        } else {
            render();
        }

        const pauseButton =
            document.getElementById("dashboardPauseTimerBtn");

        const finishButton =
            document.getElementById("dashboardFinishTimerBtn");

        if (pauseButton && !pauseButton.dataset.timerAttached) {
            pauseButton.addEventListener("click", () => {
                const currentState = readState();

                if (currentState.running) {
                    pauseTimer();
                } else {
                    resumeTimer();
                }
            });

            pauseButton.dataset.timerAttached = "true";
        }

        if (finishButton && !finishButton.dataset.timerAttached) {
            finishButton.addEventListener("click", finishTimer);
            finishButton.dataset.timerAttached = "true";
        }

        if (displayInterval) {
            clearInterval(displayInterval);
        }

        render();
        displayInterval = setInterval(render, 1000);
    }

    window.stopSharedStudyTimerForLogout = stopTimerForLogout;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, {
            once: true
        });
    } else {
        initialize();
    }
})();



/* ================= TODAY'S PLAN POPUP ================= */

function openTodayPlanPopup() {
    const popup = document.getElementById("todayPlanPopup");

    if (popup) {
        popup.style.display = "flex";

        if (typeof loadTodayPlan === "function") {
            loadTodayPlan();
        }
    }
}


function closeTodayPlanPopup() {
    const popup = document.getElementById("todayPlanPopup");

    if (popup) {
        popup.style.display = "none";
    }
}


document.addEventListener("click", event => {
    const popup = document.getElementById("todayPlanPopup");

    if (popup && event.target === popup) {
        closeTodayPlanPopup();
    }
});


document.addEventListener("DOMContentLoaded", () =>  {
    const popup = document.getElementById("todayPlanPopup");

    if (popup && popup.dataset.autoOpen === "true") {
        openTodayPlanPopup();
    }
});
