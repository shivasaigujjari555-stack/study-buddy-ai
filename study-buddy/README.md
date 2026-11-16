# Study Buddy AI

An AI-powered student productivity platform built to support study planning, note generation, quizzes, timetable management and learning-performance insights.

## Features

- AI-assisted study plan generation
- AI-generated notes
- Quiz generation and assessment
- Timetable and task management
- Student learning-performance analysis
- MySQL-backed application data
- Python machine-learning service

## Technology Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express.js
- **Database:** MySQL
- **ML service:** Python, FastAPI, pandas, NumPy, scikit-learn
- **AI integration:** OpenRouter

## Project Structure

```text
study-buddy-ai/
├── controllers/
├── middleware/
├── routes/
├── public/
├── ml_service/
│   ├── data/models/
│   ├── feature_engineering.py
│   ├── main.py
│   ├── train.py
│   └── requirements.txt
├── db.js
├── server.js
├── setup.sql
├── package.json
├── .env.example
├── .gitignore
└── Start Study Buddy.bat
```

## Requirements

- Node.js and npm
- Python 3.10 or newer
- MySQL Server
- An OpenRouter API key for AI-powered features

## Local Setup (Windows)

1. Clone or download this repository.
2. Create a local `.env` file by copying `.env.example`.
3. Fill in your own MySQL credentials, OpenRouter API key and a strong session secret in `.env`. **Never commit `.env`.**
4. Create the database and tables by running `setup.sql` in MySQL Workbench.
5. Install Node dependencies:

   ```bash
   npm install
   ```

6. Install Python dependencies:

   ```bash
   cd ml_service
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   cd ..
   ```

7. Start MySQL, then run `Start Study Buddy.bat`.

The launcher starts the ML service and Node server and opens the application at `http://localhost:3000`.

## Environment Variables

See `.env.example` for the required configuration names. Add real values only to your local `.env` file.

## Security Notes

- `.env`, API keys, passwords and local virtual environments are excluded through `.gitignore`.
- Use a unique, strong `SESSION_SECRET`.
- Do not publish real student data, database exports or credentials.
- If a key or password was previously committed or shared, rotate it.

## Project Status

This is an academic/student project. Features and setup instructions may evolve as development and testing continue.
