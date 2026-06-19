from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import google.generativeai as genai
import sqlite3
import json
import os
from datetime import date, datetime, timedelta
from dotenv import load_dotenv
from urllib import request, parse, error

load_dotenv()

app = FastAPI(title="B-CLEAR API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.path.join(os.path.dirname(__file__), "bclear.db")

# ── Database setup ────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS days (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT UNIQUE NOT NULL,
            day_type TEXT NOT NULL,
            energy TEXT NOT NULL,
            available_hours REAL NOT NULL,
            priorities TEXT NOT NULL,
            schedule TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            block_index INTEGER NOT NULL,
            title TEXT NOT NULL,
            duration_mins INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            skipped_reason TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS deadlines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            due_date TEXT NOT NULL,
            category TEXT,
            notes TEXT,
            done INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            cf_handle TEXT,
            lc_username TEXT,
            wake_time TEXT DEFAULT '08:00',
            gym_time TEXT DEFAULT '',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reviews (
            date TEXT PRIMARY KEY,
            rating INTEGER NOT NULL,
            notes TEXT,
            went_well TEXT,
            skipped_reason TEXT,
            energy_accuracy TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cf_cache (
            handle TEXT PRIMARY KEY,
            rating INTEGER,
            rank TEXT,
            recent_solved INTEGER DEFAULT 0,
            last_contest TEXT,
            weak_topics TEXT,
            fetched_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS lc_cache (
            username TEXT PRIMARY KEY,
            streak INTEGER DEFAULT 0,
            easy INTEGER DEFAULT 0,
            medium INTEGER DEFAULT 0,
            hard INTEGER DEFAULT 0,
            recent_submissions TEXT,
            fetched_at TEXT NOT NULL
        );
    """)
    conn.execute("""
        INSERT OR IGNORE INTO users (id, wake_time, gym_time)
        VALUES (1, '08:00', '')
    """)
    conn.commit()
    conn.close()

init_db()

# ── Models ────────────────────────────────────────────────────────────────────

class DayPlanRequest(BaseModel):
    day_type: str           # "free" | "class" | "deadline"
    energy: str             # "high" | "medium" | "low"
    available_hours: float
    priorities: List[str]   # e.g. ["CP practice", "ML chapter 2", "revise graphs"]
    class_schedule: Optional[List[dict]] = None  # [{"time": "9:00", "subject": "Maths"}]
    upcoming_deadlines: Optional[List[dict]] = None
    current_time: Optional[str] = None
    current_local_time: Optional[str] = None
    plan_start_time: Optional[str] = None
    instructions: Optional[str] = None
    energy_curve: Optional[str] = None
    planning_mode: Optional[str] = None

class TaskUpdate(BaseModel):
    status: str             # "done" | "skipped"
    skipped_reason: Optional[str] = None

class Deadline(BaseModel):
    title: str
    due_date: str
    category: Optional[str] = None
    notes: Optional[str] = None

class SettingsUpdate(BaseModel):
    cf_handle: Optional[str] = None
    lc_username: Optional[str] = None
    wake_time: Optional[str] = "08:00"
    gym_time: Optional[str] = ""

class ReviewPayload(BaseModel):
    date: Optional[str] = None
    rating: int
    notes: Optional[str] = None
    went_well: Optional[str] = None
    skipped_reason: Optional[str] = None
    energy_accuracy: Optional[str] = None

class MiddayTaskPayload(BaseModel):
    title: str
    duration_mins: int
    mode: str = "squeeze"       # squeeze | replace
    urgent: bool = False
    replace_task_id: Optional[int] = None
    category: str = "other"

class ReplanPayload(BaseModel):
    keep_completed: bool = True
    hours_left: Optional[float] = None
    note: Optional[str] = None
    current_time: Optional[str] = None
    current_local_time: Optional[str] = None
    plan_start_time: Optional[str] = None

# ── AI Plan Generator ─────────────────────────────────────────────────────────

def http_json(url: str, payload: Optional[dict] = None, headers: Optional[dict] = None) -> dict:
    data = None
    req_headers = {"User-Agent": "B-CLEAR/1.0"}
    if headers:
        req_headers.update(headers)
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    req = request.Request(url, data=data, headers=req_headers)
    with request.urlopen(req, timeout=12) as res:
        return json.loads(res.read().decode("utf-8"))

def parse_dt(value: Optional[str]) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(value) if value else None
    except ValueError:
        return None

def get_settings_row() -> dict:
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE id=1").fetchone()
    conn.close()
    return dict(row) if row else {"cf_handle": None, "lc_username": None, "wake_time": "08:00", "gym_time": ""}

def fetch_cf_stats(handle: str, force: bool = False) -> dict:
    handle = handle.strip()
    if not handle:
        raise HTTPException(status_code=400, detail="Codeforces handle is required")

    conn = get_db()
    cached = conn.execute("SELECT * FROM cf_cache WHERE lower(handle)=lower(?)", (handle,)).fetchone()
    if cached and not force:
        fetched_at = parse_dt(cached["fetched_at"])
        if fetched_at and datetime.now() - fetched_at < timedelta(hours=1):
            conn.close()
            data = dict(cached)
            data["weak_topics"] = json.loads(data.get("weak_topics") or "[]")
            return data

    try:
        info = http_json(f"https://codeforces.com/api/user.info?handles={parse.quote(handle)}")
        if info.get("status") != "OK" or not info.get("result"):
            raise HTTPException(status_code=404, detail="Codeforces handle not found")
        user = info["result"][0]
        seven_days_ago = int(datetime.now().timestamp()) - 7 * 24 * 60 * 60
        submissions = http_json(
            f"https://codeforces.com/api/user.status?handle={parse.quote(handle)}&from=1&count=200"
        ).get("result", [])

        solved = set()
        weak_tags = {}
        for sub in submissions:
            problem = sub.get("problem", {})
            pid = f"{problem.get('contestId', '')}-{problem.get('index', '')}"
            if sub.get("creationTimeSeconds", 0) >= seven_days_ago and sub.get("verdict") == "OK":
                solved.add(pid)
            if sub.get("verdict") not in (None, "OK"):
                for tag in problem.get("tags", []):
                    weak_tags[tag] = weak_tags.get(tag, 0) + 1

        contests = http_json(f"https://codeforces.com/api/user.rating?handle={parse.quote(handle)}").get("result", [])
        last_contest = None
        if contests:
            c = contests[-1]
            delta = c.get("newRating", 0) - c.get("oldRating", 0)
            last_contest = f"{c.get('contestName', 'last contest')}: {c.get('oldRating')} -> {c.get('newRating')} ({delta:+d})"

        stats = {
            "handle": user.get("handle", handle),
            "rating": user.get("rating") or user.get("maxRating"),
            "rank": user.get("rank") or user.get("maxRank") or "unrated",
            "recent_solved": len(solved),
            "last_contest": last_contest,
            "weak_topics": [tag for tag, _ in sorted(weak_tags.items(), key=lambda x: x[1], reverse=True)[:3]],
            "fetched_at": datetime.now().isoformat()
        }
        conn.execute("""
            INSERT INTO cf_cache (handle, rating, rank, recent_solved, last_contest, weak_topics, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(handle) DO UPDATE SET
                rating=excluded.rating, rank=excluded.rank, recent_solved=excluded.recent_solved,
                last_contest=excluded.last_contest, weak_topics=excluded.weak_topics, fetched_at=excluded.fetched_at
        """, (stats["handle"], stats["rating"], stats["rank"], stats["recent_solved"],
              stats["last_contest"], json.dumps(stats["weak_topics"]), stats["fetched_at"]))
        conn.commit()
        conn.close()
        return stats
    except HTTPException:
        conn.close()
        raise
    except Exception as exc:
        conn.close()
        raise HTTPException(status_code=502, detail=f"Codeforces fetch failed: {exc}")

def fetch_lc_stats(username: str, force: bool = False) -> dict:
    username = username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="LeetCode username is required")

    conn = get_db()
    cached = conn.execute("SELECT * FROM lc_cache WHERE lower(username)=lower(?)", (username,)).fetchone()
    if cached and not force:
        fetched_at = parse_dt(cached["fetched_at"])
        if fetched_at and datetime.now() - fetched_at < timedelta(hours=1):
            conn.close()
            data = dict(cached)
            data["recent_submissions"] = json.loads(data.get("recent_submissions") or "[]")
            return data

    query = """
    query userStats($username: String!) {
      matchedUser(username: $username) {
        username
        submitStatsGlobal { acSubmissionNum { difficulty count } }
        submissionCalendar
      }
      recentAcSubmissionList(username: $username, limit: 8) { title timestamp }
    }
    """
    try:
        data = http_json(
            "https://leetcode.com/graphql",
            {"query": query, "variables": {"username": username}},
            {"Referer": "https://leetcode.com"}
        ).get("data", {})
        user = data.get("matchedUser")
        if not user:
            raise HTTPException(status_code=404, detail="LeetCode username not found")

        counts = {"Easy": 0, "Medium": 0, "Hard": 0}
        for item in user.get("submitStatsGlobal", {}).get("acSubmissionNum", []):
            if item.get("difficulty") in counts:
                counts[item["difficulty"]] = item.get("count", 0)

        calendar = json.loads(user.get("submissionCalendar") or "{}")
        streak = 0
        cursor = date.today()
        while True:
            key = str(int(datetime.combine(cursor, datetime.min.time()).timestamp()))
            if int(calendar.get(key, 0)) <= 0:
                break
            streak += 1
            cursor -= timedelta(days=1)

        stats = {
            "username": user.get("username", username),
            "streak": streak,
            "easy": counts["Easy"],
            "medium": counts["Medium"],
            "hard": counts["Hard"],
            "recent_submissions": data.get("recentAcSubmissionList") or [],
            "fetched_at": datetime.now().isoformat()
        }
        conn.execute("""
            INSERT INTO lc_cache (username, streak, easy, medium, hard, recent_submissions, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET
                streak=excluded.streak, easy=excluded.easy, medium=excluded.medium,
                hard=excluded.hard, recent_submissions=excluded.recent_submissions, fetched_at=excluded.fetched_at
        """, (stats["username"], stats["streak"], stats["easy"], stats["medium"], stats["hard"],
              json.dumps(stats["recent_submissions"]), stats["fetched_at"]))
        conn.commit()
        conn.close()
        return stats
    except HTTPException:
        conn.close()
        raise
    except Exception as exc:
        conn.close()
        raise HTTPException(status_code=502, detail=f"LeetCode fetch failed: {exc}")

def get_recent_reviews(limit: int = 3) -> list:
    conn = get_db()
    rows = conn.execute("SELECT * FROM reviews ORDER BY date DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_planning_context() -> dict:
    settings = get_settings_row()
    cf_stats = None
    lc_stats = None
    if settings.get("cf_handle"):
        try:
            cf_stats = fetch_cf_stats(settings["cf_handle"])
        except HTTPException:
            pass
    if settings.get("lc_username"):
        try:
            lc_stats = fetch_lc_stats(settings["lc_username"])
        except HTTPException:
            pass
    return {
        "settings": settings,
        "cf_stats": cf_stats,
        "lc_stats": lc_stats,
        "reviews": get_recent_reviews(3)
    }

def build_prompt(req: DayPlanRequest, deadlines: list, context: dict) -> str:
    deadline_str = ""
    if deadlines:
        deadline_str = "\nUpcoming deadlines:\n" + "\n".join(
            [f"- {d['title']} due {d['due_date']} ({d.get('category','')})" for d in deadlines]
        )

    class_str = ""
    if req.class_schedule:
        class_str = "\nFixed class schedule today:\n" + "\n".join(
            [f"- {c['time']}: {c['subject']}" for c in req.class_schedule]
        )

    settings = context.get("settings") or {}
    cf = context.get("cf_stats")
    lc = context.get("lc_stats")
    reviews = context.get("reviews") or []
    profile_lines = [f"- Default wake time: {settings.get('wake_time') or '08:00'}"]
    if settings.get("gym_time"):
        profile_lines.append(f"- Fixed gym slot: {settings['gym_time']}")
    if cf:
        weak = ", ".join(cf.get("weak_topics") or []) or "unknown"
        profile_lines.append(
            f"- Codeforces: {cf.get('rating') or 'unrated'} {cf.get('rank')}; "
            f"{cf.get('recent_solved', 0)} accepted in last 7 days; "
            f"last contest: {cf.get('last_contest') or 'no recent contest'}; weak tags: {weak}"
        )
    if lc:
        profile_lines.append(
            f"- LeetCode: streak {lc.get('streak', 0)} days; solved E/M/H "
            f"{lc.get('easy', 0)}/{lc.get('medium', 0)}/{lc.get('hard', 0)}"
        )
    if reviews:
        profile_lines.append("- Last reviews:")
        for r in reviews:
            profile_lines.append(
                f"  {r['date']}: rating {r['rating']}/5, went well: {r.get('went_well') or '-'}, "
                f"skipped: {r.get('skipped_reason') or '-'}, energy accuracy: {r.get('energy_accuracy') or '-'}"
            )
    replan_instruction = context.get("replan_instruction")
    if replan_instruction:
        profile_lines.append(f"- Active replan instruction: {replan_instruction}")
    profile_str = "\n".join(profile_lines)
    current_local_time = req.current_local_time or "not provided"
    plan_start_time = req.plan_start_time or settings.get("wake_time") or "08:00"

    return f"""You are a smart personal day planner for a competitive programming student.

Student info:
- Day type: {req.day_type} day
- Energy level: {req.energy}
- Energy curve: {req.energy_curve or 'not specified'}
- Planning mode: {req.planning_mode or 'balanced'}
- Available hours for work: {req.available_hours} hours
- Top priorities: {', '.join(req.priorities)}
- Extra instructions: {req.instructions or 'none'}
- Current local time: {current_local_time}
- Earliest allowed start time: {plan_start_time}
{profile_str}
{class_str}
{deadline_str}

Rules for scheduling:
- Do not schedule any block before the earliest allowed start time
- If planning mid-day or evening, ignore morning hours that have already passed
- Treat extra instructions as hard constraints when they include minimum time, due time, fixed submission windows, or must-finish work
- If extra instructions mention a deadline time, schedule enough work before that time and add a final submission/check block before it
- If planning mode is submission, create draft/build, fix, final check, and submit/buffer blocks
- Schedule hardest work inside the stated energy curve
- If an active replan instruction is provided, follow it over the old pending block titles
- When the user asks to shift focus, replace remaining blocks with that focus instead of preserving old topics
- Start from the default wake time only when the earliest allowed start time is not provided
- If a gym slot is set, include it as a gym block and do not schedule work over it
- CP/DSA goes in the sharpest hours (morning if free day, first gap if class day)
- Use Codeforces/LeetCode stats to choose specific CP/DSA focus areas
- Adapt to the last 3 reviews; move repeatedly skipped work earlier or make it smaller
- New learning (ML) goes after a break, not first
- Keep blocks 45-90 mins max, always add short breaks between
- If energy is low, reduce block lengths and add more breaks
- If a deadline is within 3 days, include time for it today
- Don't schedule more than available hours
- Be realistic, not optimistic

Respond ONLY with a JSON array. No explanation, no markdown, just raw JSON.
Format:
[
  {{"time": "9:00 AM", "title": "CP Practice", "duration_mins": 90, "category": "cp", "note": "Focus on graphs today"}},
  {{"time": "10:30 AM", "title": "Break", "duration_mins": 15, "category": "break", "note": ""}},
  ...
]

Categories: cp, dsa, ml, revision, deadline, gym, break, other"""


async def generate_plan(req: DayPlanRequest, deadlines: list, context: dict) -> list:
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    model = genai.GenerativeModel('gemini-2.5-flash')
    
    prompt = build_prompt(req, deadlines, context)

    response = model.generate_content(
        prompt,
        generation_config={"response_mime_type": "application/json"}
    )

    raw = response.text.strip()
    # strip markdown fences if present (just as a fallback)
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "B-CLEAR API running"}

def save_schedule_for_date(conn, plan_date: str, schedule: list, preserve_status: bool = False):
    old_by_title = {}
    if preserve_status:
        old_rows = conn.execute("SELECT * FROM tasks WHERE date=?", (plan_date,)).fetchall()
        old_by_title = {r["title"]: dict(r) for r in old_rows}

    conn.execute("DELETE FROM tasks WHERE date=?", (plan_date,))
    for i, block in enumerate(schedule):
        old = old_by_title.get(block.get("title", ""))
        conn.execute("""
            INSERT INTO tasks (date, block_index, title, duration_mins, status, skipped_reason)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            plan_date,
            i,
            block.get("title", "Untitled block"),
            int(block.get("duration_mins", 30)),
            old.get("status", "pending") if old else "pending",
            old.get("skipped_reason") if old else None
        ))

def get_today_payload():
    today = date.today().isoformat()
    conn = get_db()
    day = conn.execute("SELECT * FROM days WHERE date=?", (today,)).fetchone()
    if not day:
        conn.close()
        return {"exists": False}
    tasks = conn.execute(
        "SELECT * FROM tasks WHERE date=? ORDER BY block_index", (today,)
    ).fetchall()
    settings = conn.execute("SELECT * FROM users WHERE id=1").fetchone()
    conn.close()

    stats = {"cf": None, "lc": None}
    if settings and settings["cf_handle"]:
        try:
            stats["cf"] = fetch_cf_stats(settings["cf_handle"])
        except HTTPException:
            pass
    if settings and settings["lc_username"]:
        try:
            stats["lc"] = fetch_lc_stats(settings["lc_username"])
        except HTTPException:
            pass

    return {
        "exists": True,
        "day": dict(day),
        "schedule": json.loads(day["schedule"]),
        "tasks": [dict(t) for t in tasks],
        "stats": stats
    }

@app.get("/settings")
def get_settings():
    return get_settings_row()

@app.post("/settings")
def save_settings(settings: SettingsUpdate):
    conn = get_db()
    conn.execute("""
        UPDATE users
        SET cf_handle=?, lc_username=?, wake_time=?, gym_time=?, updated_at=?
        WHERE id=1
    """, (
        (settings.cf_handle or "").strip() or None,
        (settings.lc_username or "").strip() or None,
        settings.wake_time or "08:00",
        settings.gym_time or "",
        datetime.now().isoformat()
    ))
    conn.commit()
    conn.close()
    return get_settings_row()

@app.delete("/plan/today")
def reset_today_plan():
    today = date.today().isoformat()
    conn = get_db()
    conn.execute("DELETE FROM tasks WHERE date=?", (today,))
    conn.execute("DELETE FROM days WHERE date=?", (today,))
    conn.commit()
    conn.close()
    return {"success": True}

@app.get("/cf/stats")
def cf_stats(handle: str = Query(...), force: bool = False):
    return fetch_cf_stats(handle, force)

@app.get("/lc/stats")
def lc_stats(username: str = Query(...), force: bool = False):
    return fetch_lc_stats(username, force)


@app.post("/plan/generate")
async def generate_day_plan(req: DayPlanRequest):
    today = date.today().isoformat()

    # fetch upcoming deadlines from db
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM deadlines WHERE done=0 AND due_date >= ? ORDER BY due_date LIMIT 5",
        (today,)
    ).fetchall()
    deadlines = [dict(r) for r in rows]
    conn.close()

    context = get_planning_context()

    try:
        schedule = await generate_plan(req, deadlines, context)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")

    # save to db
    conn = get_db()
    conn.execute("""
        INSERT INTO days (date, day_type, energy, available_hours, priorities, schedule)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
            day_type=excluded.day_type,
            energy=excluded.energy,
            available_hours=excluded.available_hours,
            priorities=excluded.priorities,
            schedule=excluded.schedule
    """, (today, req.day_type, req.energy, req.available_hours,
          json.dumps(req.priorities), json.dumps(schedule)))

    save_schedule_for_date(conn, today, schedule)

    conn.commit()
    conn.close()

    return {"date": today, "schedule": schedule, "stats": {"cf": context.get("cf_stats"), "lc": context.get("lc_stats")}}


@app.get("/plan/today")
def get_today_plan():
    return get_today_payload()


@app.patch("/tasks/{task_id}")
def update_task(task_id: int, update: TaskUpdate):
    conn = get_db()
    conn.execute("""
        UPDATE tasks SET status=?, skipped_reason=?, updated_at=?
        WHERE id=?
    """, (update.status, update.skipped_reason, datetime.now().isoformat(), task_id))
    conn.commit()
    conn.close()
    return {"success": True}

@app.post("/midday-task")
def add_midday_task(payload: MiddayTaskPayload):
    today = date.today().isoformat()
    conn = get_db()
    day = conn.execute("SELECT * FROM days WHERE date=?", (today,)).fetchone()
    if not day:
        conn.close()
        raise HTTPException(status_code=404, detail="No plan exists for today")

    schedule = json.loads(day["schedule"])
    new_block = {
        "time": "Next",
        "title": payload.title.strip(),
        "duration_mins": payload.duration_mins,
        "category": payload.category or "other",
        "note": "Urgent add-on" if payload.urgent else "Added mid-day"
    }
    if not new_block["title"]:
        conn.close()
        raise HTTPException(status_code=400, detail="Task title is required")

    if payload.mode == "replace":
        if not payload.replace_task_id:
            conn.close()
            raise HTTPException(status_code=400, detail="replace_task_id is required")
        task = conn.execute("SELECT * FROM tasks WHERE id=? AND date=?", (payload.replace_task_id, today)).fetchone()
        if not task:
            conn.close()
            raise HTTPException(status_code=404, detail="Block to replace was not found")
        index = task["block_index"]
        old_block = schedule[index] if index < len(schedule) else {}
        new_block["time"] = old_block.get("time", "Next")
        new_block["note"] = f"Replaced: {old_block.get('title', 'planned block')}"
        schedule[index] = new_block
    else:
        tasks = conn.execute("SELECT * FROM tasks WHERE date=? ORDER BY block_index", (today,)).fetchall()
        insert_at = len(schedule)
        if payload.urgent:
            for task in tasks:
                block = schedule[task["block_index"]]
                if task["status"] == "pending" and block.get("category") != "break":
                    insert_at = task["block_index"]
                    new_block["time"] = block.get("time", "Next")
                    break
        schedule.insert(insert_at, new_block)

    conn.execute("UPDATE days SET schedule=? WHERE date=?", (json.dumps(schedule), today))
    save_schedule_for_date(conn, today, schedule, preserve_status=True)
    conn.commit()
    conn.close()
    return get_today_payload()

@app.post("/plan/replan")
async def replan_remaining(payload: ReplanPayload):
    today = date.today().isoformat()
    conn = get_db()
    day = conn.execute("SELECT * FROM days WHERE date=?", (today,)).fetchone()
    tasks = conn.execute("SELECT * FROM tasks WHERE date=? ORDER BY block_index", (today,)).fetchall()
    if not day:
        conn.close()
        raise HTTPException(status_code=404, detail="No plan exists for today")

    original = json.loads(day["schedule"])
    completed = []
    pending_titles = []
    for task in tasks:
        block = original[task["block_index"]]
        if payload.keep_completed and task["status"] == "done":
            completed.append(block)
        elif task["status"] == "pending" and block.get("category") != "break":
            pending_titles.append(block.get("title", "planned block"))
    conn.close()

    user_instruction = (payload.note or "").strip()
    original_priorities = json.loads(day["priorities"])
    if user_instruction:
        replan_priorities = [user_instruction]
    else:
        replan_priorities = pending_titles[:5] or original_priorities

    req = DayPlanRequest(
        day_type=day["day_type"],
        energy=day["energy"],
        available_hours=payload.hours_left or max(float(day["available_hours"]) / 2, 1),
        priorities=replan_priorities,
        current_time=payload.current_time,
        current_local_time=payload.current_local_time,
        plan_start_time=payload.plan_start_time,
        instructions=user_instruction or None
    )
    context = get_planning_context()
    if user_instruction:
        context["replan_instruction"] = (
            f"{user_instruction}. This overrides the previous remaining plan. "
            f"Old pending blocks were: {', '.join(pending_titles) or 'none'}."
        )
    context["reviews"] = [{
        "date": today,
        "rating": 3,
        "went_well": "Completed blocks should stay fixed",
        "skipped_reason": user_instruction or "Mid-day replan requested",
        "energy_accuracy": "Use remaining energy only"
    }] + context.get("reviews", [])
    schedule_tail = await generate_plan(req, [], context)
    new_schedule = completed + schedule_tail

    conn = get_db()
    conn.execute("UPDATE days SET schedule=?, available_hours=? WHERE date=?", (
        json.dumps(new_schedule), req.available_hours, today
    ))
    save_schedule_for_date(conn, today, new_schedule, preserve_status=True)
    conn.commit()
    conn.close()
    return get_today_payload()

@app.post("/review")
def save_review(payload: ReviewPayload):
    review_date = payload.date or date.today().isoformat()
    conn = get_db()
    conn.execute("""
        INSERT INTO reviews (date, rating, notes, went_well, skipped_reason, energy_accuracy)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
            rating=excluded.rating, notes=excluded.notes, went_well=excluded.went_well,
            skipped_reason=excluded.skipped_reason, energy_accuracy=excluded.energy_accuracy
    """, (review_date, payload.rating, payload.notes, payload.went_well, payload.skipped_reason, payload.energy_accuracy))
    conn.commit()
    conn.close()
    return {"success": True, "date": review_date}

@app.get("/review/{review_date}")
def get_review(review_date: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM reviews WHERE date=?", (review_date,)).fetchone()
    conn.close()
    return {"exists": bool(row), "review": dict(row) if row else None}

@app.get("/week")
def get_week(from_date: Optional[str] = None):
    start = date.fromisoformat(from_date) if from_date else date.today() - timedelta(days=6)
    end = start + timedelta(days=6)
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM days WHERE date BETWEEN ? AND ? ORDER BY date",
        (start.isoformat(), end.isoformat())
    ).fetchall()
    tasks = conn.execute(
        "SELECT * FROM tasks WHERE date BETWEEN ? AND ? ORDER BY date, block_index",
        (start.isoformat(), end.isoformat())
    ).fetchall()
    conn.close()

    by_date = {r["date"]: dict(r) for r in rows}
    task_map = {}
    for task in tasks:
        task_map.setdefault(task["date"], []).append(dict(task))

    days = []
    streak = 0
    for i in range(7):
        d = (start + timedelta(days=i)).isoformat()
        day_tasks = task_map.get(d, [])
        total = len(day_tasks)
        done = len([t for t in day_tasks if t["status"] == "done"])
        skipped = len([t for t in day_tasks if t["status"] == "skipped"])
        completion = round((done / total) * 100) if total else 0
        actual_minutes = sum(t["duration_mins"] for t in day_tasks if t["status"] == "done")
        planned_minutes = sum(t["duration_mins"] for t in day_tasks)
        if completion > 60:
            streak += 1
        days.append({
            "date": d,
            "exists": d in by_date,
            "completed": done,
            "skipped": skipped,
            "total": total,
            "completion": completion,
            "planned_hours": round(planned_minutes / 60, 1),
            "actual_hours": round(actual_minutes / 60, 1),
            "schedule": json.loads(by_date[d]["schedule"]) if d in by_date else [],
            "tasks": day_tasks
        })
    return {"from": start.isoformat(), "to": end.isoformat(), "streak": streak, "days": days}

@app.get("/insights")
def get_insights():
    conn = get_db()
    reviews = conn.execute("SELECT * FROM reviews ORDER BY date DESC LIMIT 14").fetchall()
    tasks = conn.execute("SELECT * FROM tasks ORDER BY date DESC, block_index LIMIT 120").fetchall()
    days = conn.execute("SELECT * FROM days ORDER BY date DESC LIMIT 14").fetchall()
    conn.close()
    if len(days) < 5:
        return {"ready": False, "insights": ["Log at least 5 planned days to unlock pattern nudges."]}

    try:
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        model = genai.GenerativeModel('gemini-2.5-flash')
        prompt = f"""Analyze this student's recent planning data and return JSON only.
Find up to 3 short, specific nudges about scheduling patterns. Mention concrete moves like earlier/later/smaller blocks.

Reviews:
{json.dumps([dict(r) for r in reviews], default=str)}

Tasks:
{json.dumps([dict(t) for t in tasks], default=str)}

Format:
{{"insights": ["one sentence", "one sentence"]}}"""
        response = model.generate_content(prompt, generation_config={"response_mime_type": "application/json"})
        parsed = json.loads(response.text.strip())
        ai_insights = parsed.get("insights") or []
        if ai_insights:
            return {"ready": True, "insights": ai_insights[:3]}
    except Exception:
        pass

    skipped_by_keyword = {}
    for task in tasks:
        if task["status"] != "skipped":
            continue
        title = task["title"].lower()
        key = "ML" if "ml" in title or "machine" in title else "CP" if "cp" in title or "codeforces" in title else "DSA" if "dsa" in title else "work"
        skipped_by_keyword[key] = skipped_by_keyword.get(key, 0) + 1

    insights = []
    if skipped_by_keyword:
        top = max(skipped_by_keyword, key=skipped_by_keyword.get)
        insights.append(f"You skip {top} blocks most often. Put them earlier tomorrow or shrink the first block.")
    low_reviews = [r for r in reviews if r["rating"] <= 2]
    if low_reviews:
        insights.append("Recent low-review days show up in the log. Plan one fewer major block and protect breaks.")
    if not insights:
        insights.append("Your recent completion looks steady. Keep the same block size and avoid adding extra late-day work.")
    return {"ready": True, "insights": insights[:3]}

@app.get("/carry-forward")
def get_carry_forward():
    today = date.today().isoformat()
    conn = get_db()
    rows = conn.execute("""
        SELECT title, duration_mins, skipped_reason, date, status
        FROM tasks
        WHERE date < ?
          AND status IN ('skipped', 'pending')
          AND lower(title) NOT LIKE '%break%'
        ORDER BY date DESC, updated_at DESC
        LIMIT 8
    """, (today,)).fetchall()
    conn.close()
    seen = set()
    items = []
    for row in rows:
        title = row["title"]
        if title in seen:
            continue
        seen.add(title)
        items.append(dict(row))
    return items


@app.get("/deadlines")
def get_deadlines():
    today = date.today().isoformat()
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM deadlines WHERE done=0 AND due_date >= ? ORDER BY due_date",
        (today,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/deadlines")
def add_deadline(dl: Deadline):
    conn = get_db()
    cursor = conn.execute("""
        INSERT INTO deadlines (title, due_date, category, notes)
        VALUES (?, ?, ?, ?)
    """, (dl.title, dl.due_date, dl.category, dl.notes))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"id": new_id, "success": True}


@app.patch("/deadlines/{deadline_id}/done")
def mark_deadline_done(deadline_id: int):
    conn = get_db()
    conn.execute("UPDATE deadlines SET done=1 WHERE id=?", (deadline_id,))
    conn.commit()
    conn.close()
    return {"success": True}


@app.delete("/deadlines/{deadline_id}")
def delete_deadline(deadline_id: int):
    conn = get_db()
    conn.execute("DELETE FROM deadlines WHERE id=?", (deadline_id,))
    conn.commit()
    conn.close()
    return {"success": True}


@app.get("/history")
def get_history():
    conn = get_db()
    rows = conn.execute(
        "SELECT date, day_type, energy, available_hours, priorities FROM days ORDER BY date DESC LIMIT 14"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
