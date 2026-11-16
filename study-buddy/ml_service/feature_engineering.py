"""Feature engineering for Study Buddy ML.

Uses actual database rows only. Column names are detected conservatively so
the code can work with common study_sessions/tasks schemas.
"""
import pandas as pd


def _frame(rows):
    return pd.DataFrame(rows) if rows else pd.DataFrame()


def _find_column(df, candidates):
    lookup = {str(col).lower(): col for col in df.columns}
    for candidate in candidates:
        if candidate.lower() in lookup:
            return lookup[candidate.lower()]
    return None


def _same_owner(left, right, left_user_col, right_user_col):
    """Return a row mask matching usernames when both tables have them."""
    if left_user_col and right_user_col:
        return right[right_user_col].astype(str) == str(left[left_user_col])
    return pd.Series([True] * len(right), index=right.index)


def create_features(quiz_results, study_sessions=None, tasks=None):
    quizzes = _frame(quiz_results)
    sessions = _frame(study_sessions)
    task_df = _frame(tasks)

    if quizzes.empty:
        return pd.DataFrame()

    required = ["subject", "score", "total_questions", "quiz_date"]
    missing = [col for col in required if col not in quizzes.columns]
    if missing:
        raise ValueError(
            "quiz_results is missing required columns: " + ", ".join(missing)
        )

    quizzes["score"] = pd.to_numeric(quizzes["score"], errors="coerce")
    quizzes["total_questions"] = pd.to_numeric(
        quizzes["total_questions"], errors="coerce"
    )
    quizzes["quiz_date"] = pd.to_datetime(
        quizzes["quiz_date"], errors="coerce"
    )
    quizzes = quizzes.dropna(
        subset=["subject", "score", "total_questions", "quiz_date"]
    ).copy()
    quizzes = quizzes[
        (quizzes["total_questions"] > 0)
        & (quizzes["score"] >= 0)
        & (quizzes["score"] <= quizzes["total_questions"])
    ].copy()

    if quizzes.empty:
        return pd.DataFrame()

    user_col = _find_column(quizzes, ["username", "user_id", "student_id"])
    if user_col is None:
        quizzes["_owner"] = "all_students"
        user_col = "_owner"

    quizzes["_subject_key"] = quizzes["subject"].astype(str).str.strip()
    quizzes = quizzes.sort_values(["quiz_date"]).reset_index(drop=True)
    quizzes["performance_score"] = (
        quizzes["score"] / quizzes["total_questions"] * 100.0
    )

    # Identify common session columns without assuming a single schema.
    session_subject = _find_column(sessions, ["subject", "course"])
    session_user = _find_column(sessions, ["username", "user_id", "student_id"])
    duration_col = _find_column(
        sessions,
        ["duration_minutes", "duration", "minutes", "duration_mins",
         "study_minutes", "hours", "duration_hours"]
    )
    session_date_col = _find_column(
        sessions, ["session_date", "study_date", "created_at", "date"]
    )

    if not sessions.empty and duration_col:
        sessions[duration_col] = pd.to_numeric(
            sessions[duration_col], errors="coerce"
        )
        if session_date_col:
            sessions[session_date_col] = pd.to_datetime(
                sessions[session_date_col], errors="coerce"
            )

    # Identify common task columns.
    task_subject = _find_column(task_df, ["subject", "course"])
    task_user = _find_column(task_df, ["username", "user_id", "student_id"])
    status_col = _find_column(
        task_df, ["status", "state", "completed", "is_completed"]
    )

    rows = []
    for _, quiz in quizzes.iterrows():
        same_group = (
            (quizzes[user_col].astype(str) == str(quiz[user_col]))
            & (quizzes["_subject_key"] == str(quiz["_subject_key"]))
        )
        earlier = quizzes.loc[
            same_group & (quizzes["quiz_date"] < quiz["quiz_date"])
        ].copy()

        # For same-day attempts, only count earlier rows in the stable ordering.
        same_day_prior = quizzes.loc[
            same_group & (quizzes["quiz_date"] == quiz["quiz_date"])
        ]
        prior_indices = []
        for idx in same_day_prior.index:
            if idx == quiz.name:
                break
            prior_indices.append(idx)
        if prior_indices:
            earlier = pd.concat([earlier, quizzes.loc[prior_indices]]).drop_duplicates()

        previous_scores = earlier["performance_score"]
        quiz_average = float(previous_scores.mean()) if len(previous_scores) else 0.0
        best_score = float(previous_scores.max()) if len(previous_scores) else 0.0
        quiz_attempts = int(len(previous_scores))

        # Study hours from real study sessions for this student/subject up to quiz date.
        study_hours = 0.0
        if not sessions.empty and duration_col:
            relevant = sessions.copy()
            if session_subject:
                relevant = relevant[
                    relevant[session_subject].astype(str).str.strip()
                    == str(quiz["subject"]).strip()
                ]
            if session_user and user_col != "_owner":
                relevant = relevant[
                    relevant[session_user].astype(str) == str(quiz[user_col])
                ]
            if session_date_col:
                relevant = relevant[
                    relevant[session_date_col].isna()
                    | (relevant[session_date_col] <= quiz["quiz_date"])
                ]
            durations = pd.to_numeric(relevant[duration_col], errors="coerce").dropna()
            durations = durations[durations >= 0]
            duration_name = str(duration_col).lower()
            if duration_name in ("hours", "duration_hours"):
                study_hours = float(durations.sum())
            else:
                study_hours = float(durations.sum() / 60.0)

        # Task completion rate based on task status values available in the table.
        task_completion_rate = 0.0
        if not task_df.empty and status_col:
            relevant_tasks = task_df.copy()
            if task_subject:
                relevant_tasks = relevant_tasks[
                    relevant_tasks[task_subject].astype(str).str.strip()
                    == str(quiz["subject"]).strip()
                ]
            if task_user and user_col != "_owner":
                relevant_tasks = relevant_tasks[
                    relevant_tasks[task_user].astype(str) == str(quiz[user_col])
                ]
            if len(relevant_tasks):
                statuses = relevant_tasks[status_col]
                if statuses.dtype == bool:
                    completed = statuses.fillna(False)
                else:
                    completed = statuses.astype(str).str.strip().str.lower().isin(
                        ["completed", "complete", "done", "finished", "true", "1", "yes"]
                    )
                task_completion_rate = float(completed.mean() * 100.0)

        row = {
            "subject": quiz["subject"],
            "quiz_date": quiz["quiz_date"],
            "quiz_average": quiz_average,
            "quiz_attempts": quiz_attempts,
            "best_score": best_score,
            "study_hours": study_hours,
            "task_completion_rate": task_completion_rate,
            "performance_score": float(quiz["performance_score"]),
        }
        if "username" in quizzes.columns:
            row["username"] = quiz["username"]
        if "topic" in quizzes.columns:
            row["topic"] = quiz["topic"]
        rows.append(row)

    return pd.DataFrame(rows)
