import os
import sys

from dotenv import load_dotenv

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(PROJECT_DIR, ".env"))

# Ensure UTF-8 output on Windows consoles
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

import joblib
import pandas as pd
import mysql.connector
from fastapi import FastAPI
from feature_engineering import create_features

app = FastAPI(
    title="Study Buddy AI - ML Service",
    description="Personalized Machine Learning service for Study Buddy",
    version="1.0.0"
)

MODEL_PATH = os.path.join(CURRENT_DIR, "data", "models", "student_model.pkl")

def get_db():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "studybuddy"),
        connection_timeout=5
    )

def load_ml_bundle():
    if os.path.exists(MODEL_PATH):
        try:
            return joblib.load(MODEL_PATH)
        except Exception as e:
            print(f"Failed to load ML model: {e}")
    return None

@app.get("/")
def home():
    return {
        "status": "success",
        "message": "Study Buddy AI ML Service is running 🚀"
    }

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "model_loaded": os.path.exists(MODEL_PATH)
    }

@app.get("/student/{username}/data")
def student_data(username: str):
    db = get_db()
    cursor = db.cursor(dictionary=True)

    cursor.execute("""
        SELECT subject, score, total_questions, quiz_date
        FROM quiz_results
        WHERE username = %s
        ORDER BY quiz_date DESC
    """, (username,))
    quizzes = cursor.fetchall()

    cursor.execute("""
        SELECT subject, duration_minutes, session_date
        FROM study_sessions
        WHERE username = %s
        ORDER BY session_date DESC
    """, (username,))
    sessions = cursor.fetchall()

    cursor.close()
    db.close()

    return {
        "username": username,
        "quiz_results": quizzes,
        "study_sessions": sessions
    }

@app.get("/student/{username}/features")
def student_features(username: str):
    db = get_db()
    cursor = db.cursor(dictionary=True)

    cursor.execute("""
        SELECT subject, score, total_questions, quiz_date
        FROM quiz_results
        WHERE username = %s
        ORDER BY quiz_date DESC
    """, (username,))
    quizzes = cursor.fetchall()

    cursor.execute("""
        SELECT subject, duration_minutes, session_date
        FROM study_sessions
        WHERE username = %s
        ORDER BY session_date DESC
    """, (username,))
    sessions = cursor.fetchall()

    cursor.execute("""
        SELECT subject, status
        FROM tasks
        WHERE username = %s
    """, (username,))
    tasks = cursor.fetchall()

    cursor.close()
    db.close()

    features = create_features(quizzes, sessions, tasks)

    return {
        "username": username,
        "subjects": features.to_dict(orient="records")
    }

@app.get("/student/{username}/analysis")
def student_analysis(username: str):
    db = get_db()
    cursor = db.cursor(dictionary=True)

    cursor.execute("""
        SELECT subject, score, total_questions, quiz_date
        FROM quiz_results
        WHERE username = %s
        ORDER BY quiz_date ASC
    """, (username,))
    quizzes = cursor.fetchall()

    cursor.execute("""
        SELECT subject, duration_minutes, session_date
        FROM study_sessions
        WHERE username = %s
        ORDER BY session_date ASC
    """, (username,))
    sessions = cursor.fetchall()

    cursor.execute("""
        SELECT subject, status
        FROM tasks
        WHERE username = %s
    """, (username,))
    tasks = cursor.fetchall()

    cursor.close()
    db.close()

    features = create_features(quizzes, sessions, tasks)
    analysis = []

    for _, row in features.iterrows():
        subject = str(row["subject"])
        quiz_average = float(row["quiz_average"])
        quiz_attempts = int(row["quiz_attempts"])
        best_score = float(row["best_score"])
        total_study_minutes = float(row["study_hours"]) * 60
        task_completion_rate = float(row["task_completion_rate"])
        performance_score = float(row["performance_score"])

        if quiz_attempts == 0:
            level = "Not Tested"
            recommendation = "Take a quiz to help the system understand your performance."
        elif performance_score < 50:
            level = "Needs Attention"
            recommendation = "Focus on fundamentals and practice more questions."
        elif performance_score < 75:
            level = "Improving"
            recommendation = "You are making progress. Continue practicing and revise regularly."
        else:
            level = "Strong"
            recommendation = "You are performing well. Maintain consistency and attempt more challenging questions."

        analysis.append({
            "subject": subject,
            "quiz_average": round(quiz_average, 2),
            "quiz_attempts": quiz_attempts,
            "best_score": round(best_score, 2),
            "study_hours": round(float(row["study_hours"]), 2),
            "task_completion_rate": round(task_completion_rate, 2),
            "performance_score": round(performance_score, 2),
            "level": level,
            "recommendation": recommendation
        })

    return {
        "username": username,
        "analysis": analysis
    }

@app.get("/student/{username}/predict")
def student_predict(username: str):
    """
    ML Prediction Endpoint:
    Uses the trained scikit-learn model to predict student performance level
    and expected exam readiness score.
    """
    db = get_db()
    cursor = db.cursor(dictionary=True)

    cursor.execute("SELECT subject, score, total_questions, quiz_date FROM quiz_results WHERE username = %s", (username,))
    quizzes = cursor.fetchall()

    cursor.execute("SELECT subject, duration_minutes, session_date FROM study_sessions WHERE username = %s", (username,))
    sessions = cursor.fetchall()

    cursor.execute("SELECT subject, status FROM tasks WHERE username = %s", (username,))
    tasks = cursor.fetchall()

    cursor.close()
    db.close()

    features = create_features(quizzes, sessions, tasks)

    if features.empty:
        return {
            "username": username,
            "prediction": "Not enough activity to predict",
            "confidence": 0.0,
            "expected_score": 0.0
        }

    bundle = load_ml_bundle()
    predictions = []

    for _, row in features.iterrows():
        subj = str(row["subject"])
        feature_vals = [
            float(row["quiz_average"]),
            int(row["quiz_attempts"]),
            float(row["best_score"]),
            float(row["study_hours"]),
            float(row["task_completion_rate"])
        ]

        if bundle:
            clf = bundle["classifier"]
            reg = bundle["regressor"]
            level_idx = int(clf.predict([feature_vals])[0])
            level_name = bundle["target_names"][level_idx]
            probs = clf.predict_proba([feature_vals])[0]
            confidence = round(float(probs[level_idx]) * 100, 2)
            expected_score = round(float(reg.predict([feature_vals])[0]), 2)
        else:
            perf = float(row["performance_score"])
            level_name = "Strong" if perf >= 75 else "Improving" if perf >= 50 else "Needs Attention"
            confidence = 85.0
            expected_score = round(perf, 2)

        predictions.append({
            "subject": subj,
            "predicted_level": level_name,
            "confidence": confidence,
            "expected_score": expected_score
        })

    return {
        "username": username,
        "predictions": predictions
    }