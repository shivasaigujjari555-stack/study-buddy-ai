-- Study Buddy Database Setup

CREATE DATABASE IF NOT EXISTS studybuddy;
USE studybuddy;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL
);

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    hours INT DEFAULT 0,
    tasks INT DEFAULT 0,
    streak INT DEFAULT 0
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    time VARCHAR(50) DEFAULT 'Today',
    status VARCHAR(20) DEFAULT 'pending'
);

-- Notes table
CREATE TABLE IF NOT EXISTS notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    note TEXT NOT NULL
);

-- Study Plan table
CREATE TABLE IF NOT EXISTS study_plan (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject VARCHAR(100),
    topic TEXT,
    day INT,
    completed TINYINT(1) DEFAULT 0
);

-- Quiz Results table
CREATE TABLE IF NOT EXISTS quiz_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    topic VARCHAR(150),
    score INT NOT NULL,
    total_questions INT NOT NULL,
    quiz_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Study Sessions table
CREATE TABLE IF NOT EXISTS study_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    duration_minutes INT NOT NULL,
    session_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Learning Profile table
CREATE TABLE IF NOT EXISTS learning_profile (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    avg_quiz_score DECIMAL(5,2) DEFAULT 0.00,
    total_study_hours DECIMAL(10,2) DEFAULT 0.00,
    task_completion_rate DECIMAL(5,2) DEFAULT 0.00,
    consistency_score DECIMAL(5,2) DEFAULT 0.00,
    learning_style VARCHAR(50),
    preferred_study_hour INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ML Predictions table
CREATE TABLE IF NOT EXISTS ml_predictions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    prediction_type VARCHAR(50) NOT NULL,
    prediction_value TEXT,
    confidence DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);