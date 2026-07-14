# AI-Powered Conversation Analysis System

An intelligent conversation analytics platform designed for Burger Singh to analyze customer interactions, evaluate employee performance, and generate actionable business insights from recorded and live conversations.

The system helps organizations monitor service quality, improve employee performance, identify sales opportunities, and gain branch-wise and regional business intelligence through AI-powered analytics.

---

# Features

- AI-powered conversation analysis using Gemini AI
- Speech-to-text transcription and speaker diarization
- Live conversation monitoring and analysis
- Employee performance scoring and feedback generation
- Branch-wise performance analytics
- Regional customer behavior analysis
- Franchise rankings and leaderboards
- Multilingual conversation support
- Role-based dashboards for Employees and Managers
- Real-time business insights and reporting

---

# Tech Stack

### Frontend
- HTML5
- CSS3
- JavaScript (Vanilla JS)

### Backend
- Node.js
- Express.js

### Database
- SQLite

### AI & Analytics
- Google Gemini API
- Speech-to-Text Processing
- Speaker Diarization
- Language Detection & Translation

### Deployment
- Render

---

# Prerequisites

Before running the project, ensure you have:

- Node.js installed (v18 or later recommended)
- npm installed
- Google Gemini API Key
- Git installed
- Internet connection for AI API requests

---

# Setup Instructions

## 1. Clone the Repository

```bash
git clone <repository_url>
cd burgersingh-cas-mvp
```

## 2. Install Backend Dependencies

```bash
cd backend
npm install
```

## 3. Configure Environment Variables

Create a `.env` file inside the `backend` folder:

```env
GEMINI_API_KEY=your_gemini_api_key
JWT_SECRET=your_secret_key
PORT=3000
```

## 4. Start the Backend Server

```bash
cd backend
node server.js
```

The backend server will start on:

```text
http://localhost:3000
```

## 5. Launch the Frontend

Open the frontend files in your browser:

```text
frontend/index.html
```

or if deployed:

```text
https://your-frontend-url.onrender.com
```

---

# Demo Credentials

## Employee Login

**Username:** EMP-0512

**Password:** password123

---

## Manager Login

**Username:** MGR-0001

**Password:** manager123

---

# Project Architecture

```text
Audio Upload / Live Stream
            ↓
    Speech Transcription
            ↓
     Speaker Diarization
            ↓
     Language Detection
            ↓
 Translation (if required)
            ↓
   Gemini AI Analysis
            ↓
 Employee Performance Scoring
            ↓
 Branch & Regional Analytics
            ↓
 Dashboard & Reporting
```

---

# Future Enhancements

- Real-time coaching and alerts
- Advanced predictive analytics
- Custom fine-tuned AI models
- Enhanced customer sentiment analysis
- Mobile application support

---
