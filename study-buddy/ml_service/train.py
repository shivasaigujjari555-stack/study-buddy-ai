"""
Study Buddy AI - Machine Learning Model Trainer.

Trains classification and score-regression models using real MySQL records.
No synthetic training rows are generated.
"""
import math
import os
import sys

from dotenv import load_dotenv

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(CURRENT_DIR)
load_dotenv(os.path.join(PROJECT_DIR, ".env"))

if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

import joblib
import mysql.connector
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestClassifier
from sklearn.metrics import accuracy_score, mean_absolute_error
from sklearn.model_selection import train_test_split

from feature_engineering import create_features

MIN_TRAINING_ROWS = 10

FEATURE_COLS = [
    "quiz_average",
    "quiz_attempts",
    "best_score",
    "study_hours",
    "task_completion_rate",
]

TARGET_NAMES = ["Needs Attention", "Improving", "Strong"]


def get_db():
    """Connect to the Study Buddy MySQL database."""
    password = os.getenv("DB_PASSWORD")
    if password is None:
        raise ValueError(
            "DB_PASSWORD is missing. Check the .env file in your project folder."
        )
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        user=os.getenv("DB_USER", "root"),
        password=password,
        database=os.getenv("DB_NAME", "studybuddy"),
        connection_timeout=5,
    )


def generate_training_data():
    """Load real database rows and create ML features."""
    print("[INFO] Fetching real student records from MySQL...")
    db = None
    cursor = None
    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)

        # SELECT * avoids assuming columns not yet confirmed in each table.
        cursor.execute("SELECT * FROM quiz_results")
        quizzes = cursor.fetchall()

        try:
            cursor.execute("SELECT * FROM study_sessions")
            sessions = cursor.fetchall()
        except mysql.connector.Error as exc:
            if exc.errno == 1146:
                print("[WARNING] study_sessions table not found; using 0 study hours.")
                sessions = []
            else:
                raise

        try:
            cursor.execute("SELECT * FROM tasks")
            tasks = cursor.fetchall()
        except mysql.connector.Error as exc:
            if exc.errno == 1146:
                print("[WARNING] tasks table not found; using 0 task completion rate.")
                tasks = []
            else:
                raise
    finally:
        if cursor is not None:
            cursor.close()
        if db is not None:
            db.close()

    if not quizzes:
        raise ValueError(
            "quiz_results contains no records. Add real quiz attempts before training."
        )

    data = create_features(quizzes, sessions, tasks)
    if data is None or data.empty:
        raise ValueError("No usable quiz rows could be converted into features.")

    required_cols = FEATURE_COLS + ["performance_score"]
    missing = [col for col in required_cols if col not in data.columns]
    if missing:
        raise ValueError(
            "feature_engineering.py did not create required columns: "
            + ", ".join(missing)
        )

    data = data.copy()
    data[required_cols] = data[required_cols].apply(
        pd.to_numeric, errors="coerce"
    )
    data = data.replace([np.inf, -np.inf], np.nan)
    data = data.dropna(subset=required_cols)

    # These are measured features; 0 is used only when no prior records exist.
    if data.empty:
        raise ValueError("No valid numeric training rows remain after cleaning.")

    data["level"] = data["performance_score"].apply(
        lambda score: 0 if score < 50 else 1 if score < 75 else 2
    )

    print(f"[INFO] Usable real quiz rows: {len(data)}")
    if len(data) < MIN_TRAINING_ROWS:
        raise ValueError(
            f"Training stopped: only {len(data)} usable real quiz rows are available; "
            f"at least {MIN_TRAINING_ROWS} are required. Add more real quiz attempts. "
            "No synthetic data will be generated."
        )

    class_counts = data["level"].value_counts()
    if len(class_counts) < 2:
        raise ValueError(
            "Training stopped: quiz scores must represent at least two performance "
            "levels (below 50, 50-74, and 75-100)."
        )
    if class_counts.min() < 2:
        raise ValueError(
            "Training stopped: every performance level present needs at least two "
            "real rows for a stratified train/test split. Collect more varied quiz results."
        )

    return data


def train_and_save_model():
    """Train, evaluate, and save both models."""
    print("[INFO] Starting Study Buddy ML Model Training...")
    data = generate_training_data()

    X = data[FEATURE_COLS]
    y_class = data["level"]
    y_score = data["performance_score"]
    class_counts = y_class.value_counts()

    test_rows = max(len(class_counts), math.ceil(len(data) * 0.2))
    if len(data) - test_rows < len(class_counts):
        raise ValueError(
            "Training stopped: not enough real rows to represent every class "
            "in both training and test sets. Add more varied quiz results."
        )

    X_train, X_test, y_class_train, y_class_test, y_score_train, y_score_test = (
        train_test_split(
            X,
            y_class,
            y_score,
            test_size=test_rows,
            random_state=42,
            stratify=y_class,
        )
    )

    classifier = RandomForestClassifier(
        n_estimators=100, max_depth=5, n_jobs=1, random_state=42
    )
    classifier.fit(X_train, y_class_train)
    class_predictions = classifier.predict(X_test)
    accuracy = accuracy_score(y_class_test, class_predictions)

    regressor = GradientBoostingRegressor(
        n_estimators=100, max_depth=3, random_state=42
    )
    regressor.fit(X_train, y_score_train)
    score_predictions = regressor.predict(X_test)
    score_mae = mean_absolute_error(y_score_test, score_predictions)

    print(f"[INFO] Holdout classification accuracy: {accuracy * 100:.2f}%")
    print(f"[INFO] Holdout score mean absolute error: {score_mae:.2f} points")
    print("[WARNING] Metrics are preliminary when based on a small dataset.")

    models_dir = os.path.join(CURRENT_DIR, "data", "models")
    os.makedirs(models_dir, exist_ok=True)
    model_path = os.path.join(models_dir, "student_model.pkl")

    model_bundle = {
        "classifier": classifier,
        "regressor": regressor,
        "feature_cols": FEATURE_COLS,
        "target_names": TARGET_NAMES,
        "accuracy": accuracy,
        "score_mae": score_mae,
    }
    joblib.dump(model_bundle, model_path)
    print("[SUCCESS] Model training completed.")
    print(f"[DONE] Model saved to: {model_path}")


if __name__ == "__main__":
    try:
        train_and_save_model()
    except (ValueError, mysql.connector.Error) as error:
        print(f"[ERROR] {error}")
        sys.exit(1)
