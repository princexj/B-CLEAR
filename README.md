# B-CLEAR

B-CLEAR is a personal day planner for CS students. It turns your energy, available time, deadlines, competitive programming stats, LeetCode progress, and end-of-day reviews into a realistic time-blocked plan.

It runs as:

- a normal web app during development
- a local desktop app with Electron

## Features

- **Premium Glassmorphic UI**: Beautiful, modern dashboard with interactive micro-animations.
- **AI-Generated Daily Schedule**: Creates realistic time-blocked plans based on your energy and priorities.
- **Unified Competitive Programming Dashboard**:
  - **Codeforces**: Rating, rank, recent accepted count, weak tags, upcoming global contests.
  - **LeetCode**: Streak, solved count by difficulty, recent submissions.
  - **CodeChef**: Rating, stars, global rank, country rank.
- **Interactive Unified Heatmap**: A single heatmap tracking your daily submissions across LeetCode, Codeforces, and CodeChef. Hover over squares for details.
- **Quick Profile Links**: Direct 1-click links to your integrated profiles.
- **Useful Links Manager**: Save and manage your favorite CP problems, tutorials, or tools right on the dashboard.
- **Live Clock & Current Focus**: Never lose track of time with focus panels.
- **Task Management**: Done, skip, missed, current, and upcoming task states.
- **Mid-Day Adjustments**: Squeeze or replace tasks on the fly with AI replanning.
- **Evening Review Flow & Carry-Forward**: Log what went well and carry forward skipped work to tomorrow.
- **Planning Modes**: Balanced, deep work, submission, recovery.
- **Energy Curve Modeling**: Morning, afternoon, evening, night.
- **`Ctrl+K` Command Bar**: Fast keyboard navigation.

## Tech Stack

- Frontend: React + Vite
- Backend: FastAPI + SQLite
- Desktop shell: Electron
- AI: Gemini via `google-generativeai`

## Prerequisites

Install:

- Python 3.11+
- Node.js 18+
- npm

Get a Gemini API key from Google AI Studio:

https://aistudio.google.com/app/apikey

## Setup

Clone the repo:

```bash
git clone https://github.com/YOUR_USERNAME/bclear.git
cd bclear
```

Install frontend and desktop dependencies:

```bash
npm run setup
```

Create the backend virtual environment and install Python dependencies:

```bash
npm run setup:backend
```

Create your env file:

```bash
copy backend\.env.example backend\.env
```

Edit `backend/.env`:

```env
GEMINI_API_KEY=your_key_here
```

## Run In Browser

Start backend + frontend:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

## Run As Desktop App

Build the frontend and open the Electron app:

```bash
npm run desktop
```

The desktop app starts the FastAPI backend automatically on:

```text
http://127.0.0.1:8001
```

In source/development mode, the backend reads:

```text
backend/.env
```

In an installed desktop build, you can put your API key in:

```text
%APPDATA%\B-CLEAR\.env
```

with:

```env
GEMINI_API_KEY=your_key_here
```

## Build Installer

Create a Windows installer:

```bash
npm run dist
```

The installer output appears in:

```text
release/
```

Before building an installer, run `npm run setup:backend` once. The local `backend/.venv` is bundled into the installer, while `.env` and `bclear.db` are excluded.

## Project Structure

```text
bclear/
  backend/
    main.py
    requirements.txt
    .env.example
  desktop/
    main.cjs
  frontend/
    src/
      components/
      pages/
      utils/
    vite.config.js
  package.json
```

## Useful Commands

```bash
npm run setup          # install node dependencies
npm run setup:backend  # create backend/.venv and install Python deps
npm run dev            # backend + frontend dev mode
npm run build          # build frontend
npm run desktop        # run desktop app
npm run dist           # build installer
```

## Notes For Contributors

- Do not commit `backend/.env`.
- Do not commit `backend/bclear.db`; it is local user data.
- The app uses port `8001` for the backend and `5173` for Vite dev mode.
- SQLite is created automatically on first backend start.
