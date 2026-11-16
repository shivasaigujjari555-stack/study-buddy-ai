const db = require("../db");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const AI_MODEL = process.env.AI_MODEL || "nvidia/nemotron-3.5-lightning:free";
const AI_FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL || "liquid/lfm-2.5-2.6b:free";

// GET user notes
exports.getNotes = (req, res) => {
  const username = req.session ? req.session.currentUser : null;
  if (!username) {
    return res.status(401).json({ success: false, message: "Not logged in" });
  }

  db.query(
    "SELECT * FROM notes WHERE username = ? ORDER BY id DESC",
    [username],
    (err, rows) => {
      if (err) {
        console.error("Get Notes Error:", err);
        return res.status(500).json({ success: false, message: "DB error" });
      }

      res.json({ success: true, notes: rows });
    }
  );
};

// SAVE user note
exports.saveNote = (req, res) => {
  const username = req.session ? req.session.currentUser : null;
  if (!username) {
    return res.status(401).json({ success: false, message: "Not logged in" });
  }

  const { note } = req.body;
  if (!note || !note.trim()) {
    return res.status(400).json({ success: false, message: "Note text is required" });
  }

  db.query(
    "INSERT INTO notes (username, note) VALUES (?, ?)",
    [username, note.trim()],
    (err, result) => {
      if (err) {
        console.error("Save Note Error:", err);
        return res.status(500).json({ success: false, message: "DB error" });
      }

      res.json({
        success: true,
        note: {
          id: result.insertId,
          username,
          note: note.trim()
        }
      });
    }
  );
};

// DELETE user note
exports.deleteNote = (req, res) => {
  const username = req.session ? req.session.currentUser : null;
  if (!username) {
    return res.status(401).json({ success: false, message: "Not logged in" });
  }

  const noteId = req.params.id;

  db.query(
    "DELETE FROM notes WHERE id = ? AND username = ?",
    [noteId, username],
    (err) => {
      if (err) {
        console.error("Delete Note Error:", err);
        return res.status(500).json({ success: false, message: "DB error" });
      }

      res.json({ success: true, message: "Note deleted" });
    }
  );
};

// GENERATE AI notes
exports.generateNotes = async (req, res) => {
  const { subject, topic } = req.body;

  if (!subject || !topic) {
    return res.status(400).json({ notes: "❌ Missing subject or topic" });
  }

  const prompt = `Create comprehensive, easy-to-understand study notes for the topic "${topic}" in the subject "${subject}".
Include:
1. Core Definition & Key Concepts
2. Important Principles / Formulas / Highlights (in clear bullet points)
3. Real-world example or practical application
4. Quick Summary & Exam Tips`;

  try {
    const callAI = async (model) => {
      return fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 800
        })
      });
    };

    let response = await callAI(AI_MODEL);
    let data = await response.json();

    if (!data?.choices?.[0]?.message?.content) {
      console.warn("Primary AI model returned empty, trying fallback model...");
      response = await callAI(AI_FALLBACK_MODEL);
      data = await response.json();
    }

    const content = data?.choices?.[0]?.message?.content?.trim();

    if (content) {
      return res.json({ notes: content });
    }

    throw new Error("AI returned no content");
  } catch (err) {
    console.error("Generate Notes Error:", err.message);

    // High quality structured fallback
    const fallbackNotes = `📘 Smart Study Notes: ${subject} - ${topic}

1. Overview:
- ${topic} is a fundamental concept in ${subject}.
- Focus on understanding the core mechanisms and rules.

2. Key Concepts & Takeaways:
- Master the primary definitions and terminology associated with ${topic}.
- Break complex problems down into step-by-step components.
- Practice active recall by writing down what you remember without looking.

3. Study & Revision Tip:
- Review this topic today for 25 minutes using the Pomodoro technique.
- Take the practice quiz in Study Buddy to test your knowledge retention!`;

    res.json({ notes: fallbackNotes });
  }
};

