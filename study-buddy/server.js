require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const db = require("./db");

const authRoutes = require("./routes/auth");
const taskRoutes = require("./routes/tasks");
const notesRoutes = require("./routes/notes");
const plannerRoutes = require("./routes/planner");
const profileRoutes = require("./routes/profile");

const authController = require("./controllers/authController");
const taskController = require("./controllers/taskController");
const notesController = require("./controllers/notesController");
const plannerController = require("./controllers/plannerController");
const profileController = require("./controllers/profileController");
const { requireAuth } = require("./middleware/authMiddleware");

const app = express();
const PORT = process.env.PORT || 3000;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";
const AI_MODEL = process.env.AI_MODEL || "nvidia/nemotron-3.5-lightning:free";
const AI_FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL || "liquid/lfm-2.5-2.6b:free";

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || require("crypto").randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  })
);

// Protected HTML pages check
const protectedPages = [
  "/dashboard.html",
  "/dashboard",
  "/planner.html",
  "/todays plan.html",
  "/notes.html",
  "/quiz.html",
  "/time table.html",
  "/study assist.html",
  "/profile.html",
  "/profile"
];

app.use((req, res, next) => {
  const isProtected = protectedPages.some((page) => req.path === page || req.path === page.replace(".html", ""));
  if (isProtected && (!req.session || !req.session.currentUser)) {
    return res.redirect("/login");
  }
  next();
});

app.use(express.static(path.join(__dirname, "public")));

/* =========================================================
   PAGE ROUTES
========================================================= */

app.get("/", (req, res) => {
  if (req.session && req.session.currentUser) {
    return res.redirect("/dashboard");
  }
  res.sendFile(path.join(__dirname, "public", "cover.html"));
});

app.get("/login", (req, res) => {
  if (req.session && req.session.currentUser) {
    return res.redirect("/dashboard");
  }
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/register", (req, res) => {
  if (req.session && req.session.currentUser) {
    return res.redirect("/dashboard");
  }
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

app.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/profile", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "profile.html"));
});

/* =========================================================
   MODULAR API ROUTES (MVC Architecture)
========================================================= */

app.use("/api/auth", authRoutes);

// Sync generated timetable sessions into the study checklist
console.log("DEBUG: Study Buddy sync route file loaded");
app.post(
    "/api/tasks/sync-timetable",
    requireAuth,
    taskController.syncTimetableTasks
);

app.use("/api/tasks", taskRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/planner", plannerRoutes);
app.use("/api/profile", profileRoutes);

/* =========================================================
   BACKWARD-COMPATIBLE DIRECT ENDPOINTS
========================================================= */

// Auth
app.post("/login", authController.login);
app.post("/register", authController.register);
app.get("/logout", authController.logout);

// Profile
app.get("/api/profile", profileController.getProfile);
app.post("/api/save-profile", profileController.saveProfile);
app.post("/api/settings", profileController.updateSettings);

// Tasks (Direct aliases for frontend convenience)
app.get("/api/tasks", requireAuth, taskController.getTasks);
app.post("/api/tasks", requireAuth, taskController.addTask);
app.put("/api/tasks/:id/toggle", requireAuth, taskController.toggleTask);
app.delete("/api/tasks/:id", requireAuth, taskController.deleteTask);

// Notes
app.post("/api/generate-notes", notesController.generateNotes);
app.get("/api/notes", requireAuth, notesController.getNotes);
app.post("/api/notes", requireAuth, notesController.saveNote);
app.delete("/api/notes/:id", requireAuth, notesController.deleteNote);

// Planner & Timetable
app.post("/api/planner", plannerController.generatePlan);
app.post("/api/timetable", plannerController.generateTimetable);

// My Notes
app.post("/api/summarize", plannerController.summarizePlan);
app.post("/api/questions", plannerController.generatePlanQuestions);
app.post("/api/explain", plannerController.explainPlan);

/* =========================================================
   AI QUIZ GENERATOR
========================================================= */




app.post("/api/generate-quiz", async (req, res) => {
    const { topic, subject, variation } = req.body || {};

    const targetSubject = String(subject || "General Studies").trim();
    const targetTopic = String(topic || subject || "General Studies").trim();

    if (!process.env.OPENROUTER_API_KEY) {
        return res.status(500).json({
            success: false,
            message: "Quiz generation is not configured. Check the server setup."
        });
    }

    const quizSeed =
        variation || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const prompt = `
Create exactly 5 accurate, topic-specific multiple-choice questions.

Subject: ${targetSubject}
Specific topic: ${targetTopic}
Quiz variation ID: ${quizSeed}

Requirements:
- Test actual knowledge of the specified topic.
- Use varied concepts and question wording.
- Include exactly 4 options (A, B, C, D) per question.
- Include exactly one correct answer per question.
- Distribute correct answers across A, B, C and D where possible.
- Do not include explanations or introductory text.
- Do not use Markdown code fences.

Use exactly this format:

Q1) Question text?
A) Option 1
B) Option 2
C) Option 3
D) Option 4
Answer: A

Continue through Q5 using the same format.
`.trim();

    const models = [
        process.env.AI_MODEL || "openrouter/free",
        process.env.AI_FALLBACK_MODEL || "nvidia/nemotron-3.5-lightning:free"
    ].filter((model, index, arr) =>
        model && arr.indexOf(model) === index
    );

    for (const model of models) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        try {
            console.log(`[AI QUIZ] Trying model: ${model}`);

            const response = await fetch(
                "https://openrouter.ai/api/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    signal: controller.signal,
                    body: JSON.stringify({
                        model,
                        messages: [
                            {
                                role: "system",
                                content:
                                    "You generate accurate educational quizzes. Return only the requested five-question quiz in the exact format."
                            },
                            {
                                role: "user",
                                content: prompt
                            }
                        ],
                        temperature: 0.5,
                        max_tokens: 3000
                    })
                }
            );

            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                console.error(
                    `[AI QUIZ] HTTP ${response.status} from ${model}:`,
                    errorText.slice(0, 500)
                );
                continue;
            }

            const data = await response.json();
            const rawContent = data?.choices?.[0]?.message?.content;

            const content = typeof rawContent === "string"
                ? rawContent.trim()
                : Array.isArray(rawContent)
                    ? rawContent
                        .map(part =>
                            typeof part === "string" ? part : part?.text || ""
                        )
                        .join("\n")
                        .trim()
                    : "";

            if (!content) {
                console.warn(`[AI QUIZ] Empty content from ${model}`);
                continue;
            }

            // Validate questions, options and answer keys.
            const questionCount =
                (content.match(/^\s*Q[1-5][).]\s*.+$/gmi) || []).length;

            const answerCount =
                (content.match(/^\s*Answer:\s*[A-D]\s*$/gmi) || []).length;

            const optionCount =
                (content.match(/^\s*[A-D][).]\s*.+$/gmi) || []).length;

            console.log(
                `[AI QUIZ] ${model} — questions: ${questionCount}, ` +
                `options: ${optionCount}, answers: ${answerCount}`
            );

            if (
                questionCount === 5 &&
                optionCount === 20 &&
                answerCount === 5
            ) {
                console.log(`[AI QUIZ] Quiz generated successfully using ${model}`);

                return res.json({
                    success: true,
                    quiz: content
                });
            }

            console.warn(`[AI QUIZ] Invalid quiz format from ${model}`);
        } catch (error) {
    if (error.name === "AbortError") {
        console.error(
            `[AI QUIZ] ${model} timed out or was aborted. ` +
            `Timeout configured: 30000ms`
        );
    } else {
        console.error(
            `[AI QUIZ] Request failed for ${model}:`,
            error.name,
            error.message
        );
    }
}finally {
            clearTimeout(timeout);
        }
    }

    console.error("[AI QUIZ] All configured models failed.");

    return res.status(503).json({
        success: false,
        message: "Quiz generation failed. Please try again shortly."
    });
});

/* =========================================================
   ML DATA COLLECTION & ANALYSIS
========================================================= */

// SAVE QUIZ RESULT


app.post("/api/ml/quiz-result", (req, res) => {
    const user = req.session?.currentUser;

    if (!user) {
        return res.status(401).json({
            success: false,
            message: "Not logged in"
        });
    }

    const { subject, topic, score, total_questions } = req.body;

    const parsedScore = Number(score);
    const parsedTotal = Number(total_questions);

    const subjectValue =
        typeof subject === "string" ? subject.trim() : "";

    const topicValue =
        typeof topic === "string" ? topic.trim() : "";

    if (
        !subjectValue ||
        !Number.isInteger(parsedScore) ||
        !Number.isInteger(parsedTotal) ||
        parsedTotal <= 0 ||
        parsedScore < 0 ||
        parsedScore > parsedTotal
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid subject, score, or question count"
        });
    }

    const percentage = (parsedScore / parsedTotal) * 100;

    db.query(
        `INSERT INTO quiz_results
            (username, subject, topic, score, total_questions, quiz_date)
         VALUES (?, ?, ?, ?, ?, CURDATE())`,
        [
            user,
            subjectValue,
            topicValue || null,
            parsedScore,
            parsedTotal
        ],
        async (err) => {
            if (err) {
                console.error("Quiz result save error:", err);

                return res.status(500).json({
                    success: false,
                    message: "Failed to save quiz result"
                });
            }

            // A score of 70% or higher can complete the
            // matching timetable task for this subject and topic.
            if (topicValue && percentage >= 70) {
                try {
                    const taskResult =
                        await taskController.completeTaskFromQuiz(
                            user,
                            subjectValue,
                            topicValue,
                            percentage
                        );

                    return res.json({
                        success: true,
                        message: "Quiz result saved successfully",
                        percentage: Math.round(percentage),
                        taskCompletion: taskResult
                    });
                } catch (taskErr) {
                    console.error(
                        "Automatic task completion error:",
                        taskErr
                    );

                    // The quiz was already saved, so don't report
                    // the saved quiz as a failed operation.
                    return res.json({
                        success: true,
                        message: "Quiz saved, but automatic task completion failed",
                        percentage: Math.round(percentage),
                        taskCompletion: {
                            completed: false,
                            reason: "task_completion_error"
                        }
                    });
                }
            }

            return res.json({
                success: true,
                message: "Quiz result saved for ML",
                percentage: Math.round(percentage),
                taskCompletion: {
                    completed: false,
                    reason: !topicValue
                        ? "topic_missing"
                        : "score_below_70"
                }
            });
        }
    );
});



// SAVE STUDY SESSION
app.post("/api/ml/study-session", (req, res) => {
  const user = req.session ? req.session.currentUser : null;
  if (!user) {
    return res.status(401).json({ success: false, message: "Not logged in" });
  }

  const { subject, duration_minutes } = req.body;

  if (!subject || duration_minutes === undefined) {
    return res.status(400).json({ success: false, message: "Missing study session data" });
  }

  db.query(
    `INSERT INTO study_sessions (username, subject, duration_minutes, session_date)
     VALUES (?, ?, ?, CURDATE())`,
    [user, subject, duration_minutes],
    (err) => {
      if (err) {
        console.error("Study ML data error:", err);
        return res.status(500).json({ success: false, message: "Failed to save study session" });
      }

      // Increment profile hours
      const addedHours = Math.round((duration_minutes / 60) * 10) / 10;
      db.query(
        "UPDATE profiles SET hours = hours + ? WHERE username = ?",
        [Math.floor(addedHours), user],
        () => {}
      );

      res.json({ success: true, message: "Study session saved for ML" });
    }
  );
});

// ML STATUS
app.get("/api/ml/status", (req, res) => {
  const user = req.session ? req.session.currentUser : null;
  res.json({
    ml_service: "connected",
    current_user: user || null,
    data_collection: true
  });
});

// ML ANALYSIS (Python ML Service with automatic database analytics fallback)
app.get("/api/ml/analysis", async (req, res) => {
  const username = req.session ? req.session.currentUser : null;

  if (!username) {
    return res.status(401).json({
      success: false,
      message: "Not logged in"
    });
  }

  // 1. First try calling the Python FastAPI ML microservice
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const pyResponse = await fetch(
      `${ML_SERVICE_URL}/student/${encodeURIComponent(username)}/analysis`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (pyResponse.ok) {
      const data = await pyResponse.json();
      return res.json({
        success: true,
        source: "ml_service",
        ...data
      });
    }
  } catch (pyErr) {
    // Python service is offline or slow, proceed to direct database analytics
  }

  // 2. Fallback: Compute analytics directly from MySQL data
  try {
    db.query(
      `SELECT subject, score, total_questions, quiz_date FROM quiz_results WHERE username = ?`,
      [username],
      (qErr, quizzes = []) => {
        db.query(
          `SELECT subject, duration_minutes, session_date FROM study_sessions WHERE username = ?`,
          [username],
          (sErr, sessions = []) => {
            db.query(
              `SELECT subject, status FROM tasks WHERE username = ?`,
              [username],
              (tErr, tasks = []) => {
                // Collect all subjects
                const subjectsSet = new Set([
                  ...quizzes.map((q) => q.subject),
                  ...sessions.map((s) => s.subject),
                  ...tasks.map((t) => t.subject)
                ]);

                if (subjectsSet.size === 0) {
                  return res.json({
                    success: true,
                    username,
                    source: "database",
                    analysis: []
                  });
                }

                const analysis = [];

                subjectsSet.forEach((subject) => {
                  const subQuizzes = quizzes.filter((q) => q.subject === subject);
                  const subSessions = sessions.filter((s) => s.subject === subject);
                  const subTasks = tasks.filter((t) => t.subject === subject);

                  const quizAttempts = subQuizzes.length;
                  let quizAvg = 0;
                  let bestScore = 0;

                  if (quizAttempts > 0) {
                    const percentages = subQuizzes.map((q) => (q.score / q.total_questions) * 100);
                    quizAvg = percentages.reduce((a, b) => a + b, 0) / quizAttempts;
                    bestScore = Math.max(...percentages);
                  }

                  const totalStudyMinutes = subSessions.reduce(
                    (sum, s) => sum + (s.duration_minutes || 0),
                    0
                  );
                  const studyHours = Math.round((totalStudyMinutes / 60) * 10) / 10;

                  const totalTasks = subTasks.length;
                  const completedTasks = subTasks.filter(
                    (t) => t.status && t.status.toLowerCase() === "completed"
                  ).length;
                  const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

                  const performanceScore = Math.round(
                    quizAvg * 0.6 + taskCompletionRate * 0.2 + bestScore * 0.2
                  );

                  let level = "Not Tested";
                  let recommendation = "Take a practice quiz to help the AI gauge your mastery.";

                  if (quizAttempts === 0) {
                    level = "Not Tested";
                    recommendation = "Take a practice quiz to help the AI gauge your mastery.";
                  } else if (performanceScore < 50) {
                    level = "Needs Attention";
                    recommendation = "Focus on fundamentals, review topic notes, and practice key concepts.";
                  } else if (performanceScore < 75) {
                    level = "Improving";
                    recommendation = "Making steady progress! Maintain consistent study sessions and revise weekly.";
                  } else {
                    level = "Strong";
                    recommendation = "Excellent performance! Keep up the momentum and challenge yourself with advanced questions.";
                  }

                  analysis.push({
                    subject,
                    quiz_average: Math.round(quizAvg),
                    quiz_attempts: quizAttempts,
                    best_score: Math.round(bestScore),
                    study_hours: studyHours,
                    task_completion_rate: Math.round(taskCompletionRate),
                    performance_score: performanceScore,
                    level,
                    recommendation
                  });
                });

                res.json({
                  success: true,
                  username,
                  source: "database",
                  analysis
                });
              }
            );
          }
        );
      }
    );
  } catch (err) {
    console.error("Analysis DB calculation error:", err);
    res.status(500).json({
      success: false,
      message: "Analysis calculation error"
    });
  }
});

/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, () => {
    console.log("DEBUG: Loaded server.js from:", __filename);
    console.log("DEBUG: Timetable sync route registered:",
        app._router?.stack?.some(layer =>
            layer.route?.path === "/api/tasks/sync-timetable"
        )
    );
    console.log(`🚀 Study Buddy Server running at http://localhost:${PORT}`);
});