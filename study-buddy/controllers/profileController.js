const db = require("../db");

// GET user profile with real computed statistics
exports.getProfile = (req, res) => {
  const user = req.session ? req.session.currentUser : null;

  if (!user) {
    return res.json({ firstTime: true, name: "Student", hours: 0, tasks: 0, streak: 0 });
  }

  db.query(
    "SELECT * FROM profiles WHERE username = ?",
    [user],
    (err, profileResult) => {
      if (err || profileResult.length === 0) {
        return res.json({ firstTime: true, name: user, hours: 0, tasks: 0, streak: 1 });
      }

      const displayName = profileResult[0].name || user;

      // Query real study hours from study_sessions
      db.query(
        "SELECT COALESCE(SUM(duration_minutes), 0) AS total_minutes FROM study_sessions WHERE username = ?",
        [user],
        (studyErr, studyResult) => {
          const totalMinutes = studyResult?.[0]?.total_minutes || 0;
          const studyHours = Math.round((totalMinutes / 60) * 10) / 10;

          // Query completed tasks from tasks table
          db.query(
            "SELECT COUNT(*) AS completed_tasks FROM tasks WHERE username = ? AND status = 'completed'",
            [user],
            (taskErr, taskResult) => {
              const completedTasks = taskResult?.[0]?.completed_tasks || 0;

              // Calculate active streak (days with study or quiz in last 7 days)
              db.query(
                `SELECT COUNT(DISTINCT session_date) AS active_days 
                 FROM study_sessions 
                 WHERE username = ? AND session_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
                [user],
                (streakErr, streakResult) => {
                  const activeDays = streakResult?.[0]?.active_days || 0;
                  const streak = Math.max(1, activeDays);

                  // Update profiles table cache
                  db.query(
                    "UPDATE profiles SET hours = ?, tasks = ?, streak = ? WHERE username = ?",
                    [Math.floor(studyHours), completedTasks, streak, user],
                    () => {}
                  );

                  res.json({
                    firstTime: false,
                    name: displayName,
                    hours: studyHours,
                    tasks: completedTasks,
                    streak: streak
                  });
                }
              );
            }
          );
        }
      );
    }
  );
};

// SAVE / UPDATE user profile name
exports.saveProfile = (req, res) => {
  const user = req.session ? req.session.currentUser : null;
  const { name } = req.body;

  if (!user) {
    return res.json({ success: false, msg: "Not logged in" });
  }

  if (!name || !name.trim()) {
    return res.json({ success: false, msg: "Name is required" });
  }

  const cleanName = name.trim();

  db.query(
    "SELECT * FROM profiles WHERE username = ?",
    [user],
    (err, result) => {
      if (err) {
        console.error("Profile DB Error:", err);
        return res.json({ success: false, msg: "Database error" });
      }

      if (result.length > 0) {
        db.query(
          "UPDATE profiles SET name = ? WHERE username = ?",
          [cleanName, user],
          (updateErr) => {
            if (updateErr) {
              return res.json({ success: false, msg: "Update failed" });
            }
            return res.json({ success: true, name: cleanName });
          }
        );
      } else {
        db.query(
          "INSERT INTO profiles (username, name, hours, tasks, streak) VALUES (?, ?, 0, 0, 1)",
          [user, cleanName],
          (insertErr) => {
            if (insertErr) {
              return res.json({ success: false, msg: "Save failed" });
            }
            return res.json({ success: true, name: cleanName });
          }
        );
      }
    }
  );
};

// UPDATE password or settings
exports.updateSettings = (req, res) => {
  const user = req.session ? req.session.currentUser : null;
  if (!user) {
    return res.status(401).json({ success: false, message: "Not logged in" });
  }

  const { name, newPassword } = req.body;

  if (name && name.trim()) {
    db.query("UPDATE profiles SET name = ? WHERE username = ?", [name.trim(), user], () => {});
  }

  if (newPassword && newPassword.trim()) {
    db.query(
      "UPDATE users SET password = ? WHERE username = ?",
      [newPassword.trim(), user],
      (err) => {
        if (err) {
          return res.status(500).json({ success: false, message: "Failed to update password" });
        }
        return res.json({ success: true, message: "Settings updated successfully" });
      }
    );
  } else {
    res.json({ success: true, message: "Settings saved successfully" });
  }
};

