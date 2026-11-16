
const db = require("../db");
const crypto = require("crypto");

let schemaReady = null;

function ensureTaskSchema() {
    if (schemaReady) return schemaReady;

    schemaReady = new Promise((resolve, reject) => {
        db.query("SHOW COLUMNS FROM tasks", (err, columns) => {
            if (err) return reject(err);

            const existing = new Set(columns.map(column => column.Field));

            const additions = [
                ["due_date", "DATE NULL"],
                ["source_type", "VARCHAR(30) NOT NULL DEFAULT 'manual'"],
                ["source_key", "VARCHAR(191) NULL"],
                ["completed_at", "DATETIME NULL"]
            ];

            function ensureIndex() {
                db.query(
                    "SHOW INDEX FROM tasks WHERE Key_name = 'uniq_tasks_user_source'",
                    (indexErr, indexes) => {
                        if (indexErr) return reject(indexErr);
                        if (indexes.length) return resolve();

                        db.query(
                            "ALTER TABLE tasks ADD UNIQUE INDEX uniq_tasks_user_source (username, source_key)",
                            indexErr => indexErr ? reject(indexErr) : resolve()
                        );
                    }
                );
            }

            function addNext(index) {
                if (index >= additions.length) return ensureIndex();

                const [name, definition] = additions[index];

                if (existing.has(name)) return addNext(index + 1);

                db.query(
                    `ALTER TABLE tasks ADD COLUMN ${name} ${definition}`,
                    alterErr => {
                        if (alterErr) return reject(alterErr);
                        addNext(index + 1);
                    }
                );
            }

            addNext(0);
        });
    }).catch(err => {
        schemaReady = null;
        throw err;
    });

    return schemaReady;
}

function getUsername(req, res) {
    const username = req.session?.currentUser;

    if (!username) {
        res.status(401).json({
            success: false,
            message: "Not logged in"
        });
        return null;
    }

    return username;
}

function dateAfterDays(days) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + Math.max(0, Number(days || 1) - 1));

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function normalizeTask(row) {
    let dueDate = null;

    if (row.due_date) {
        dueDate = row.due_date instanceof Date
            ? [
                row.due_date.getFullYear(),
                String(row.due_date.getMonth() + 1).padStart(2, "0"),
                String(row.due_date.getDate()).padStart(2, "0")
            ].join("-")
            : String(row.due_date).slice(0, 10);
    }

    const completed = row.status === "completed";
    const now = new Date();
    const todayKey = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
    ].join("-");

    return {
        id: row.id,
        subject: row.subject,
        task: row.time ? `${row.subject} - ${row.time}` : row.subject,
        time: row.time,
        status: row.status,
        completed,
        dueDate,
        sourceType: row.source_type || "manual",
        overdue: Boolean(dueDate && dueDate < todayKey && !completed)
    };
}

exports.getTasks = async (req, res) => {
    const username = getUsername(req, res);
    if (!username) return;

    try {
        await ensureTaskSchema();

        db.query(
            `SELECT * FROM tasks
             WHERE username = ?
             ORDER BY (status = 'completed') ASC,
                      due_date IS NULL ASC, due_date ASC, id DESC`,
            [username],
            (err, rows) => {
                if (err) {
                    console.error("Get Tasks Error:", err);
                    return res.status(500).json({
                        success: false,
                        message: "DB error"
                    });
                }

                res.json({
                    success: true,
                    tasks: rows.map(normalizeTask)
                });
            }
        );
    } catch (err) {
        console.error("Task schema setup error:", err);
        res.status(500).json({
            success: false,
            message: "Could not prepare task storage."
        });
    }
};

exports.addTask = async (req, res) => {
    const username = getUsername(req, res);
    if (!username) return;

    const { subject, task, time, dueDate } = req.body || {};
    const taskSubject = String(subject || "").trim();
    const taskDetail = String(task || time || "").trim();
    const taskDueDate = dueDate ? String(dueDate).slice(0, 10) : null;

    if (!taskSubject || !taskDetail) {
        return res.status(400).json({
            success: false,
            message: "Subject and task detail are required."
        });
    }

    if (taskDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(taskDueDate)) {
        return res.status(400).json({
            success: false,
            message: "Please provide a valid deadline."
        });
    }

    try {
        await ensureTaskSchema();

        db.query(
            `INSERT INTO tasks
             (username, subject, time, status, due_date, source_type)
             VALUES (?, ?, ?, 'pending', ?, 'manual')`,
            [username, taskSubject, taskDetail, taskDueDate],
            (err, result) => {
                if (err) {
                    console.error("Add Task Error:", err);
                    return res.status(500).json({
                        success: false,
                        message: "DB error"
                    });
                }

                res.json({
                    success: true,
                    task: {
                        id: result.insertId,
                        subject: taskSubject,
                        task: `${taskSubject} - ${taskDetail}`,
                        time: taskDetail,
                        status: "pending",
                        completed: false,
                        dueDate: taskDueDate,
                        sourceType: "manual",
                        overdue: false
                    }
                });
            }
        );
    } catch (err) {
        console.error("Task schema setup error:", err);
        res.status(500).json({
            success: false,
            message: "Could not prepare task storage."
        });
    }
};

exports.syncTimetableTasks = async (req, res) => {
    const username = getUsername(req, res);
    if (!username) return;

    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

    if (!entries.length) {
        return res.status(400).json({
            success: false,
            message: "No timetable sessions were supplied."
        });
    }

    try {
        await ensureTaskSchema();

        const tasks = entries.slice(0, 500).map(entry => {
            const day = Math.max(1, Number(entry.day) || 1);
            const subject = String(entry.subject || "").trim().slice(0, 255);
            const topic = String(entry.topic || "").trim().slice(0, 500);
            const duration = String(entry.time || "").trim().slice(0, 50);

            const sourceKey = crypto
                .createHash("sha256")
                .update(`${day}|${subject.toLowerCase()}|${topic.toLowerCase()}`)
                .digest("hex");

            return {
                day,
                subject,
                topic,
                duration,
                sourceKey,
                dueDate: dateAfterDays(day)
            };
        }).filter(task => task.subject && task.topic);

        if (!tasks.length) {
            return res.status(400).json({
                success: false,
                message: "No valid timetable sessions were found."
            });
        }

        let saved = 0;

        function saveNext(index) {
            if (index >= tasks.length) {
    const sourceKeys = tasks.map(task => task.sourceKey);
    const placeholders = sourceKeys.map(() => "?").join(",");

    return db.query(
        `DELETE FROM tasks
         WHERE username = ?
           AND source_type = 'timetable'
           AND (
               source_key IS NULL
               OR source_key NOT IN (${placeholders})
           )`,
        [username, ...sourceKeys],
        err => {
            if (err) {
                console.error("Old timetable task cleanup error:", err);

                return res.status(500).json({
                    success: false,
                    message: "Timetable saved, but outdated tasks could not be removed."
                });
            }

            return res.json({
                success: true,
                synced: saved,
                message: "Timetable and study checklist updated."
            });
        }
    );
}

            const item = tasks[index];
            const detail = `${item.topic}${item.duration ? ` (${item.duration})` : ""}`;

            db.query(
                `INSERT INTO tasks
                 (username, subject, time, status, due_date, source_type, source_key)
                 VALUES (?, ?, ?, 'pending', ?, 'timetable', ?)
                 ON DUPLICATE KEY UPDATE
                    subject = VALUES(subject),
                    time = VALUES(time),
                    due_date = VALUES(due_date)`,
                [username, item.subject, detail, item.dueDate, item.sourceKey],
                err => {
                    if (err) {
                        console.error("Timetable task sync error:", err);
                        return res.status(500).json({
                            success: false,
                            message: "Could not sync timetable sessions."
                        });
                    }

                    saved++;
                    saveNext(index + 1);
                }
            );
        }

        saveNext(0);
    } catch (err) {
        console.error("Task schema setup error:", err);
        res.status(500).json({
            success: false,
            message: "Could not prepare task storage."
        });
    }
};


exports.syncPlannerTasks = async (req, res) => {
    const username = getUsername(req, res);
    if (!username) return;

    const entries = Array.isArray(req.body?.entries)
        ? req.body.entries
        : [];

    if (!entries.length) {
        return res.status(400).json({
            success: false,
            message: "No planner sessions were supplied."
        });
    }

    try {
        await ensureTaskSchema();

        const tasks = entries.slice(0, 500)
            .map(entry => {
                const day = Math.max(1, Number(entry.day) || 1);
                const subject = String(entry.subject || "")
                    .trim().slice(0, 255);
                const topic = String(entry.topic || "")
                    .trim().slice(0, 500);
                const duration = String(entry.time || "")
                    .trim().slice(0, 50);

                const sourceKey = crypto
                    .createHash("sha256")
                    .update(
                        `${day}|${subject.toLowerCase()}|${topic.toLowerCase()}`
                    )
                    .digest("hex");

                return {
                    day,
                    subject,
                    topic,
                    duration,
                    sourceKey,
                    dueDate: dateAfterDays(day)
                };
            })
            .filter(task => task.subject && task.topic);

        if (!tasks.length) {
            return res.status(400).json({
                success: false,
                message: "No valid planner sessions were found."
            });
        }

        let saved = 0;

        function saveNext(index) {
            if (index >= tasks.length) {
                const keys = tasks.map(task => task.sourceKey);
                const placeholders = keys.map(() => "?").join(",");

                return db.query(
                    `DELETE FROM tasks
                     WHERE username = ?
                       AND source_type = 'planner'
                       AND (
                           source_key IS NULL
                           OR source_key NOT IN (${placeholders})
                       )`,
                    [username, ...keys],
                    err => {
                        if (err) {
                            console.error("Planner cleanup error:", err);
                            return res.status(500).json({
                                success: false,
                                message: "Could not clean up old planner tasks."
                            });
                        }

                        return res.json({
                            success: true,
                            synced: saved,
                            message: "Planner tasks synced to your checklist."
                        });
                    }
                );
            }

            const item = tasks[index];
            const detail = `${item.topic}${
                item.duration ? ` (${item.duration})` : ""
            }`;

            db.query(
                `INSERT INTO tasks
                 (username, subject, time, status, due_date,
                  source_type, source_key)
                 VALUES (?, ?, ?, 'pending', ?, 'planner', ?)
                 ON DUPLICATE KEY UPDATE
                    subject = VALUES(subject),
                    time = VALUES(time),
                    due_date = VALUES(due_date)`,
                [
                    username,
                    item.subject,
                    detail,
                    item.dueDate,
                    item.sourceKey
                ],
                err => {
                    if (err) {
                        console.error("Planner task sync error:", err);
                        return res.status(500).json({
                            success: false,
                            message: "Could not sync planner tasks."
                        });
                    }

                    saved++;
                    saveNext(index + 1);
                }
            );
        }

        saveNext(0);
    } catch (err) {
        console.error("Planner schema setup error:", err);
        res.status(500).json({
            success: false,
            message: "Could not prepare task storage."
        });
    }
};


exports.toggleTask = async (req, res) => {
    const username = getUsername(req, res);
    if (!username) return;

    try {
        await ensureTaskSchema();

        db.query(
            "SELECT id, status FROM tasks WHERE id = ? AND username = ?",
            [req.params.id, username],
            (err, rows) => {
                if (err) {
                    console.error("Toggle Task Error:", err);
                    return res.status(500).json({
                        success: false,
                        message: "Could not load task."
                    });
                }

                if (!rows.length) {
                    return res.status(404).json({
                        success: false,
                        message: "Task not found."
                    });
                }

                const newStatus =
                    rows[0].status === "completed"
                        ? "pending"
                        : "completed";

                db.query(
                    `UPDATE tasks
                     SET status = ?,
                         completed_at = ?
                     WHERE id = ? AND username = ?`,
                    [
                        newStatus,
                        newStatus === "completed" ? new Date() : null,
                        req.params.id,
                        username
                    ],
                    updateErr => {
                        if (updateErr) {
                            console.error("Toggle Task Update Error:", updateErr);
                            return res.status(500).json({
                                success: false,
                                message: "Could not update task."
                            });
                        }

                        return res.json({
                            success: true,
                            status: newStatus,
                            completed: newStatus === "completed",
                            message: "Task status updated."
                        });
                    }
                );
            }
        );
    } catch (err) {
        console.error("Toggle Task Schema Error:", err);
        return res.status(500).json({
            success: false,
            message: "Could not prepare task storage."
        });
    }
};


exports.deleteTask = async (req, res) => {
    const username = getUsername(req, res);
    if (!username) return;

    try {
        await ensureTaskSchema();

        db.query(
            "DELETE FROM tasks WHERE id = ? AND username = ?",
            [req.params.id, username],
            (err, result) => {
                if (err) {
                    console.error("Delete Task Error:", err);
                    return res.status(500).json({
                        success: false,
                        message: "DB error"
                    });
                }

                if (!result.affectedRows) {
                    return res.status(404).json({
                        success: false,
                        message: "Task not found"
                    });
                }

                res.json({
                    success: true,
                    message: "Task deleted"
                });
            }
        );
    } catch (err) {
        console.error("Task schema setup error:", err);
        res.status(500).json({
            success: false,
            message: "Could not prepare task storage."
        });
    }
};


exports.completeTaskFromQuiz = async (
    username,
    subject,
    topic,
    percentage
) => {
    if (
        !username ||
        !subject?.trim() ||
        !topic?.trim() ||
        !Number.isFinite(Number(percentage)) ||
        Number(percentage) < 70
    ) {
        return {
            completed: false,
            count: 0,
            reason: "threshold_or_missing_data"
        };
    }

    await ensureTaskSchema();

    const subjectValue = String(subject).trim().toLowerCase();
    const topicValue = String(topic).trim().toLowerCase();

    return new Promise((resolve, reject) => {
        db.query(
            `SELECT id, time, status
             FROM tasks
             WHERE username = ?
               AND LOWER(TRIM(subject)) = ?
               AND source_type = 'timetable'
               AND status <> 'completed'`,
            [username, subjectValue],
            (err, rows) => {
                if (err) return reject(err);

                // Match the exact topic. Timetable tasks may end
                // with a duration such as " (45 minutes)".
                const matchingIds = rows
                    .filter(row => {
                        const savedDetail = String(row.time || "").trim();

                        const savedTopic = savedDetail
                            .replace(/\s+\([^()]*\)$/, "")
                            .trim()
                            .toLowerCase();

                        return savedTopic === topicValue;
                    })
                    .map(row => row.id);

                if (!matchingIds.length) {
                    return resolve({
                        completed: false,
                        count: 0,
                        reason: "matching_task_not_found"
                    });
                }

                const placeholders = matchingIds.map(() => "?").join(",");

                db.query(
                    `UPDATE tasks
                     SET status = 'completed',
                         completed_at = NOW()
                     WHERE username = ?
                       AND id IN (${placeholders})
                       AND status <> 'completed'`,
                    [username, ...matchingIds],
                    (updateErr, result) => {
                        if (updateErr) return reject(updateErr);

                        resolve({
                            completed: result.affectedRows > 0,
                            count: result.affectedRows
                        });
                    }
                );
            }
        );
    });
};
