const db = require("../db");

exports.login = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send("❌ Enter username & password");
  }

  db.query(
    "SELECT * FROM users WHERE username = ?",
    [username.trim()],
    (err, result) => {
      if (err) {
        console.error("Login DB Error:", err);
        return res.status(500).send("❌ Database error");
      }

      if (result.length === 0) {
        return res.status(401).send("❌ Please register first!");
      }

      if (result[0].password !== password.trim()) {
        return res.status(401).send("❌ Wrong password");
      }

      req.session.currentUser = result[0].username;

      if (req.headers["accept"] && req.headers["accept"].includes("application/json")) {
        return res.json({ success: true, username: result[0].username });
      }

      return res.send("success");
    }
  );
};

exports.register = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send("❌ Fill all fields");
  }

  const cleanUser = username.trim();
  const cleanPass = password.trim();

  db.query(
    "SELECT * FROM users WHERE username = ?",
    [cleanUser],
    (err, result) => {
      if (err) {
        console.error("Register DB Error:", err);
        return res.status(500).send("❌ Database error");
      }

      if (result.length > 0) {
        return res.status(400).send("❌ Username already taken");
      }

      db.query(
        "INSERT INTO users (username, password) VALUES (?, ?)",
        [cleanUser, cleanPass],
        (err) => {
          if (err) {
            console.error("Registration Error:", err);
            return res.status(500).send("❌ Registration failed");
          }

          // Also ensure profile row exists
          db.query(
            "INSERT IGNORE INTO profiles (username, name, hours, tasks, streak) VALUES (?, ?, 0, 0, 1)",
            [cleanUser, cleanUser],
            (profErr) => {
              if (profErr) {
                console.warn("Auto profile create warning:", profErr.message);
              }
            }
          );

          if (req.headers["accept"] && req.headers["accept"].includes("application/json")) {
            return res.json({ success: true, message: "Registered successfully" });
          }

          return res.send("success");
        }
      );
    }
  );
};

exports.logout = (req, res) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout Error:", err);
      }
      return res.redirect("/login");
    });
  } else {
    res.redirect("/login");
  }
};

exports.status = (req, res) => {
  const user = req.session ? req.session.currentUser : null;
  res.json({
    loggedIn: !!user,
    user: user || null
  });
};

