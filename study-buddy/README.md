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
- **ML Service:** Python, FastAPI, pandas, NumPy, scikit-learn
- **AI Integration:** OpenRouter

## Project Structure

```text
study-buddy-ai/
└── study-buddy/
    ├── controllers/
    ├── middleware/
    ├── ml_service/
    │   └── data/models/
    ├── public/
    ├── routes/
    ├── .env.example
    ├── .gitignore
    ├── README.md
    ├── Start Study Buddy.bat
    ├── db.js
    ├── package.json
    ├── package-lock.json
    ├── server.js
    └── setup.sql
```

## Requirements

- Node.js and npm
- Python 3.10 or newer
- MySQL Server
- An OpenRouter API key for AI-powered features

## Local Setup (Windows)

### 1. Clone the Repository

```bash
git clone YOUR_REPOSITORY_URL
cd study-buddy-ai/study-buddy
```

### 2. Configure Environment Variables

Create your local `.env` file:

```bash
copy .env.example .env
```

Add your own MySQL credentials, OpenRouter API key and a strong session secret to `.env`.

**Never upload your actual `.env` file to GitHub.**

### 3. Set Up the Database

1. Start MySQL Server.
2. Open MySQL Workbench.
3. Run the `setup.sql` script.
4. Make sure the database is created successfully.

### 4. Install Node.js Dependencies

```bash
npm install
```

### 5. Install Python Dependencies

```bash
cd ml_service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 6. Start the Application

Run:

```text
Start Study Buddy.bat
```

The launcher starts the Python ML service and Node.js server and opens the application at:

```text
http://localhost:3000
```

Make sure MySQL Server is running before starting the application.

## Environment Variables

See `.env.example` for the required configuration variable names.

Configure your actual credentials and API key in your local `.env` file.

Do not commit real credentials to GitHub.

## Security Notes

- `.env` files are excluded through `.gitignore`, except `.env.example`.
- API keys and database passwords must remain private.
- Use a unique and strong `SESSION_SECRET`.
- Do not publish real student data or database exports.
- If any API key or password was previously exposed, rotate it.
- Python virtual environments and temporary files are excluded from Git.

## Project Status

This is an academic/student project. Features and setup instructions may evolve as development and testing continue.

---

**Study Buddy AI** – Making student productivity smarter with AI and machine learning.
