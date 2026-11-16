
const db = require("../db");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const AI_MODEL =
  process.env.AI_MODEL || "nvidia/nemotron-3.5-lightning:free";

const AI_FALLBACK_MODEL =
  process.env.AI_FALLBACK_MODEL || "liquid/lfm-2.5-2.6b:free";

// ==========================================
// OPENROUTER AI HELPER WITH FALLBACK
// ==========================================


async function callOpenRouter(prompt, maxTokens = 600) {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        console.warn("OPENROUTER_API_KEY is missing.");
        return null;
    }

    const models = [...new Set([AI_MODEL, AI_FALLBACK_MODEL])];

    for (const model of models) {
        const controller = new AbortController();

        // Prevent one model request from waiting indefinitely.
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, 12000);

        try {
            const response = await fetch(
                "https://openrouter.ai/api/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: "user", content: prompt }
                        ],
                        temperature: 0.7,
                        max_tokens: maxTokens
                    }),
                    signal: controller.signal
                }
            );

            if (!response.ok) {
                console.warn(
                    `OpenRouter model ${model} returned status ${response.status}`
                );
                continue;
            }

            const data = await response.json();
            const result =
                data?.choices?.[0]?.message?.content?.trim();

            if (result) {
                return result;
            }

            console.warn(`OpenRouter model ${model} returned no content.`);
        } catch (error) {
            console.warn(
                `OpenRouter request failed for ${model}:`,
                error.name === "AbortError"
                    ? "Request timed out after 12 seconds."
                    : error.message
            );
        } finally {
            clearTimeout(timeoutId);
        }
    }

    // Existing server-side fallback logic will handle this.
    return null;
}
  

  // ==========================================
  // GENERATE TIMETABLE
  // ==========================================


exports.generateTimetable = async (req, res) => {
    try {
        const body = req.body || {};
        const duration = Number(body.duration ?? 7);

        const allowedDurations = [1, 7, 14, 21, 30];

        // Accept both an array and a comma/newline-separated string.
        const rawSubjects = Array.isArray(body.subjects)
            ? body.subjects
            : typeof body.subjects === "string"
                ? body.subjects.split(/[,;\n]+/)
                : [];

        const subjectList = [
            ...new Set(
                rawSubjects
                    .filter(subject => typeof subject === "string")
                    .map(subject => subject.trim())
                    .filter(Boolean)
            )
        ];

        if (subjectList.length === 0) {
            return res.status(400).json({
                error: "Please enter at least one subject."
            });
        }

        if (!allowedDurations.includes(duration)) {
            return res.status(400).json({
                error: "Choose a duration of 1, 7, 14, 21, or 30 days."
            });
        }

        const slotsPerDay = Math.max(2, subjectList.length);
        const totalSlots = duration * slotsPerDay;

        const prompt = `
Create a ${duration}-day study timetable.

Subjects:
${subjectList.map(subject => `- ${subject}`).join("\n")}

Requirements:
- Output exactly ${duration} days, numbered 1 to ${duration}.
- Output exactly ${slotsPerDay} sessions for each day.
- Include every supplied subject.
- Distribute subjects fairly.
- If there is one subject, use different relevant topics.
- Use session durations between 30 minutes and 2 hours.
- Include theory, practice, problem-solving, and revision.
- Do not include headings, introductions, or explanations.
- Output exactly ${totalSlots} session lines.
- Use this exact format:

Day 1 - Subject Name - 1 hr - Specific Topic
Day 1 - Subject Name - 45 mins - Another Topic
Day 2 - Subject Name - 1 hr - Specific Topic

Continue through Day ${duration}.
`.trim();

        let aiResponse = "";

        try {
            aiResponse = await callOpenRouter(
                prompt,
                Math.min(5000, Math.max(1200, totalSlots * 45))
            );
        } catch (aiError) {
            console.error("AI timetable generation failed:", aiError.message);
        }

        // Parse AI output using valid regular expressions.
        const pattern =
            /^Day\s+(\d+)\s*-\s*(.+?)\s*-\s*(\d+(?:\.\d+)?\s*(?:hrs?|hours?|mins?|minutes))\s*-\s*(.+)$/i;

        let entries = String(aiResponse || "")
            .split(/\r?\n/)
            .map(line => {
                const match = line.trim().match(pattern);

                if (!match) return null;

                return {
                    day: Number(match[1]),
                    subject: match[2].trim(),
                    time: match[3].trim(),
                    topic: match[4].trim()
                };
            })
            .filter(Boolean);

        const counts = new Map();

        for (const entry of entries) {
            counts.set(entry.day, (counts.get(entry.day) || 0) + 1);
        }

        const allDaysValid = Array.from(
            { length: duration },
            (_, index) => index + 1
        ).every(day => counts.get(day) === slotsPerDay);

        const allSubjectsIncluded = subjectList.every(subject =>
            entries.some(
                entry =>
                    entry.subject.toLowerCase() === subject.toLowerCase()
            )
        );

        const validAI =
            entries.length === totalSlots &&
            allDaysValid &&
            allSubjectsIncluded &&
            entries.every(
                entry =>
                    entry.day >= 1 &&
                    entry.day <= duration &&
                    entry.subject.length > 0 &&
                    entry.topic.length > 0
            );

        if (!validAI) {
            console.warn(
                `AI timetable incomplete. Using fallback for ${duration} day(s).`
            );

            const topics = [
                "Core Concepts and Theory",
                "Important Definitions and Principles",
                "Worked Examples and Problem Solving",
                "Practice Questions",
                "Application-Based Exercises",
                "Revision and Self-Assessment",
                "Mock Test and Error Review",
                "Key Concepts Recap"
            ];

            entries = [];

            for (let day = 1; day <= duration; day++) {
                for (let slot = 0; slot < slotsPerDay; slot++) {
                    const subject =
                        subjectList[(day - 1 + slot) % subjectList.length];

                    const topicIndex =
                        ((day - 1) * slotsPerDay + slot) % topics.length;

                    entries.push({
                        day,
                        subject,
                        time: slot % 2 === 0 ? "1 hr" : "45 mins",
                        topic: topics[topicIndex]
                    });
                }
            }
        }

        if (
            entries.length !== totalSlots ||
            entries.some(entry => entry.day < 1 || entry.day > duration)
        ) {
            throw new Error("The timetable failed final validation.");
        }

        const plan = entries
            .sort((a, b) => a.day - b.day)
            .map(
                entry =>
                    `Day ${entry.day} - ${entry.subject} - ${entry.time} - ${entry.topic}`
            )
            .join("\n");

        console.log(
            `Timetable generated: ${duration} day(s), ${entries.length} sessions.`
        );

        return res.json({ plan, duration });
    } catch (error) {
        console.error("Timetable generation error:", error);

        return res.status(500).json({
            error: "Unable to generate the timetable. Please try again."
        });
    }
};



/* ==========================================
   GENERATE STUDY PLAN
========================================== */

exports.generatePlan = async (req, res) => {
    try {
        const subjects = req.body?.subjects;

        if (typeof subjects !== "string" || !subjects.trim()) {
            return res.status(400).json({
                error: "Please enter your subjects."
            });
        }

        const subjectList = [
            ...new Set(
                subjects
                    .split(/[,\n]/)
                    .map(subject => subject.trim())
                    .filter(Boolean)
            )
        ];

        const prompt = `
Create a practical 7-day study plan for a student.

Subjects:
${subjectList.map(subject => `- ${subject}`).join("\n")}

Requirements:
- Include all the subjects.
- Organize the plan by day.
- Include theory, practice, revision, and self-assessment.
- Give specific topics or activities for each session.
- Keep the plan clear and realistic.
- Return plain text, with one task per line.
- Format each line as:
Day 1 - Subject - Duration - Topic or activity

Create the plan for all seven days.
`;

        const aiPlan = await callOpenRouter(prompt, 1800);

        if (aiPlan) {
            return res.json({
                plan: aiPlan,
                duration: 7
            });
        }

        // Fallback if the AI service is unavailable.
        const activities = [
            "Learn core concepts and theory",
            "Practise important questions",
            "Review difficult topics",
            "Solve application-based problems",
            "Revise key definitions and formulas",
            "Complete a self-assessment",
            "Review mistakes and recap the week"
        ];

        const plan = Array.from({ length: 7 }, (_, index) => {
            const subject = subjectList[index % subjectList.length];

            return `Day ${index + 1} - ${subject} - 1 hr - ${activities[index]}`;
        }).join("\n");

        return res.json({
            plan,
            duration: 7
        });

    } catch (error) {
        console.error("Study plan generation error:", error);

        return res.status(500).json({
            error: "Unable to generate the study plan. Please try again."
        });
    }
};

// ==========================================
// SUMMARIZE PLAN
// ==========================================

exports.summarizePlan = async (req, res) => {
  try {
    const body = req.body || {};
    const plan = body.plan || body.text || "";

    if (typeof plan !== "string" || !plan.trim()) {
      return res.json({
        summary:
          "📌 Summary:\nNo active plan to summarize. Create a study plan first!"
      });
    }

    const prompt = `
Summarize this student study plan into four clear bullet points.
Cover the main subjects, study goals, and revision targets.
Keep the response concise and encouraging.

Study plan:
${plan}
`;

    const aiSummary = await callOpenRouter(prompt, 400);

    if (aiSummary) {
      return res.json({
        summary: `📌 Smart Summary:\n${aiSummary}`
      });
    }

    const lines = plan
      .split("\n")
      .filter((line) => line.trim());

    const subjects = [
      ...new Set(
        lines
          .map((line) => line.split("-")[1]?.trim())
          .filter(Boolean)
      )
    ];

    return res.json({
      summary: `📌 Study Plan Overview:
• Covered Subjects: ${subjects.join(", ") || "General Study"}
• Total Study Sessions: ${lines.length}
• Focus: Learn concepts and practise regularly.
• Goal: Review difficult topics and track your progress.`
    });
  } catch (error) {
    console.error("Plan summary error:", error);

    return res.status(500).json({
      error: "Unable to summarize the plan."
    });
  }
};

// ==========================================
// GENERATE PLAN QUESTIONS
// ==========================================

exports.generatePlanQuestions = async (req, res) => {
  try {
    const body = req.body || {};
    const plan = body.plan || body.text || "";

    const prompt = `
Based on the study plan below, create four useful self-assessment
questions that test understanding of its main subjects and topics.

Return numbered questions only.

Study plan:
${plan || "Mathematics, Science, Computer Science"}
`;

    const aiQuestions = await callOpenRouter(prompt, 450);

    if (aiQuestions) {
      return res.json({
        questions: `❓ Key Assessment Questions:\n\n${aiQuestions}`
      });
    }

    return res.json({
      questions: `❓ Recommended Assessment Questions:
1. What are the most important concepts you studied?
2. Which topics require more practice?
3. Can you explain a difficult concept in your own words?
4. What should you revise before your next test?`
    });
  } catch (error) {
    console.error("Plan questions error:", error);

    return res.status(500).json({
      error: "Unable to generate study questions."
    });
  }
};

// ==========================================
// EXPLAIN PLAN TOPICS
// ==========================================

exports.explainPlan = async (req, res) => {
  try {
    const body = req.body || {};
    const plan =
      body.plan ||
      body.text ||
      body.topic ||
      "";

    const prompt = `
Explain how a student can effectively learn the following
subjects or topics. Give practical, clear, age-appropriate
study strategies and explain difficult ideas simply.

Subjects or topics:
${plan || "General study planning and revision"}
`;

    const aiExplain = await callOpenRouter(prompt, 500);

    if (aiExplain) {
      return res.json({
        explanation: `💡 Topic Strategy & Insights:\n\n${aiExplain}`
      });
    }

    return res.json({
      explanation: `💡 Effective Study Strategy:
• Learn one concept at a time.
• Write short notes in your own words.
• Practise questions after studying each concept.
• Review difficult concepts regularly.
• Use short breaks to maintain concentration.`
    });
  } catch (error) {
    console.error("Topic explanation error:", error);

    return res.status(500).json({
      error: "Unable to explain the selected topics."
    });
  }
};
