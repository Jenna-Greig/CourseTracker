import json
import math
import os
import re
import sqlite3
from contextlib import closing
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


PROJECT_DIR = Path(__file__).resolve().parent
DATABASE_PATH = Path(os.environ.get(
    "COURSETRACKER_DB_PATH",
    str(Path.home() / ".course-tracker" / "course-tracker.sqlite3"),
))
HOST = "127.0.0.1"
PORT = 8000
MAX_REQUEST_SIZE = 1_000_000
AVAILABLE_FONTS = {
    "Arial, sans-serif",
    "Georgia, serif",
    "'Trebuchet MS', sans-serif",
    "'Courier New', monospace",
}
AVAILABLE_WALLPAPERS = {"glow", "dots", "diagonal", "grid"}
ASSIGNMENT_TYPES = {"assignment", "quiz", "exam"}
COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")


def connect_database(database_path=DATABASE_PATH):
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(database_path=DATABASE_PATH):
    with closing(connect_database(database_path)) as connection:
        with connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS classes (
                    code TEXT PRIMARY KEY,
                    name TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    event_date TEXT NOT NULL,
                    event_time TEXT NOT NULL,
                    class_code TEXT NOT NULL REFERENCES classes(code) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS assignments (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    grade REAL NOT NULL CHECK (grade >= 0 AND grade <= 100),
                    weight REAL NOT NULL CHECK (weight > 0 AND weight <= 100),
                    type TEXT NOT NULL CHECK (type IN ('assignment', 'quiz', 'exam')),
                    class_code TEXT NOT NULL REFERENCES classes(code) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS class_themes (
                    class_code TEXT PRIMARY KEY REFERENCES classes(code) ON DELETE CASCADE,
                    theme_json TEXT NOT NULL
                );
                """
            )


def validate_text(value, label, maximum_length):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum_length:
        raise ValueError(f"{label} must be a non-empty string no longer than {maximum_length} characters.")
    return value.strip()


def validate_data(data):
    if not isinstance(data, dict) or data.get("version") != 1:
        raise ValueError("Request must contain a version 1 data object.")

    classes = data.get("classes")
    events = data.get("events")
    assignments = data.get("assignments")
    themes = data.get("classThemes")
    if not isinstance(classes, list) or not isinstance(events, list):
        raise ValueError("Classes and events must be lists.")
    if not isinstance(assignments, list) or not isinstance(themes, dict):
        raise ValueError("Assignments must be a list and classThemes must be an object.")
    if len(classes) > 8:
        raise ValueError("A maximum of eight classes is supported.")

    valid_classes = []
    class_codes = set()
    for course in classes:
        if not isinstance(course, dict):
            raise ValueError("Each class must be an object.")
        code = validate_text(course.get("code"), "Class code", 64)
        name = validate_text(course.get("name"), "Class name", 120)
        if code in class_codes:
            raise ValueError("Class codes must be unique.")
        class_codes.add(code)
        valid_classes.append({"code": code, "name": name})

    valid_events = []
    for event in events:
        if not isinstance(event, dict):
            raise ValueError("Each event must be an object.")
        name = validate_text(event.get("name"), "Event name", 200)
        event_date = event.get("date")
        if not isinstance(event_date, str):
            raise ValueError("Event date must use YYYY-MM-DD format.")
        try:
            date.fromisoformat(event_date)
        except ValueError as error:
            raise ValueError("Event date must be a valid YYYY-MM-DD date.") from error
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", event_date):
            raise ValueError("Event date must use YYYY-MM-DD format.")
        event_time = event.get("time", "")
        if not isinstance(event_time, str) or len(event_time) > 40:
            raise ValueError("Event time must be a string no longer than 40 characters.")
        class_code = event.get("classCode")
        if not isinstance(class_code, str) or class_code not in class_codes:
            raise ValueError("Each event must reference an existing class.")
        valid_events.append({
            "name": name,
            "date": event_date,
            "time": event_time,
            "classCode": class_code,
        })

    valid_assignments = []
    for assignment in assignments:
        if not isinstance(assignment, dict):
            raise ValueError("Each assignment must be an object.")
        name = validate_text(assignment.get("name"), "Assignment name", 200)
        grade = assignment.get("grade")
        weight = assignment.get("weight")
        assignment_type = assignment.get("type")
        class_code = assignment.get("classCode")
        if isinstance(grade, bool) or not isinstance(grade, (int, float)) or not math.isfinite(grade) or not 0 <= grade <= 100:
            raise ValueError("Assignment grade must be a number from 0 to 100.")
        if isinstance(weight, bool) or not isinstance(weight, (int, float)) or not math.isfinite(weight) or not 0 < weight <= 100:
            raise ValueError("Assignment weight must be a number greater than 0 up to 100.")
        if not isinstance(assignment_type, str) or assignment_type not in ASSIGNMENT_TYPES:
            raise ValueError("Assignment type must be assignment, quiz, or exam.")
        if not isinstance(class_code, str) or class_code not in class_codes:
            raise ValueError("Each assignment must reference an existing class.")
        valid_assignments.append({
            "name": name,
            "grade": float(grade),
            "weight": float(weight),
            "type": assignment_type,
            "classCode": class_code,
        })

    valid_themes = {}
    for class_code, theme in themes.items():
        if class_code not in class_codes or not isinstance(theme, dict):
            raise ValueError("Each class theme must reference an existing class.")
        colors = theme.get("assignmentColors")
        if not isinstance(colors, dict):
            raise ValueError("Class theme assignment colors must be an object.")
        theme_colors = {
            "assignment": colors.get("assignment"),
            "quiz": colors.get("quiz"),
            "exam": colors.get("exam"),
        }
        if not all(isinstance(color, str) and COLOR_PATTERN.fullmatch(color) for color in theme_colors.values()):
            raise ValueError("Theme colors must be six-digit hexadecimal colors.")
        text_color = theme.get("textColor")
        background_color = theme.get("backgroundColor")
        font = theme.get("font")
        wallpaper = theme.get("wallpaper")
        if not isinstance(text_color, str) or not COLOR_PATTERN.fullmatch(text_color):
            raise ValueError("Theme text color must be a six-digit hexadecimal color.")
        if not isinstance(background_color, str) or not COLOR_PATTERN.fullmatch(background_color):
            raise ValueError("Theme background color must be a six-digit hexadecimal color.")
        if not isinstance(font, str) or font not in AVAILABLE_FONTS or \
                not isinstance(wallpaper, str) or wallpaper not in AVAILABLE_WALLPAPERS:
            raise ValueError("Theme font or wallpaper is not supported.")
        valid_themes[class_code] = {
            "textColor": text_color,
            "backgroundColor": background_color,
            "font": font,
            "wallpaper": wallpaper,
            "assignmentColors": theme_colors,
        }

    return {
        "classes": valid_classes,
        "events": valid_events,
        "assignments": valid_assignments,
        "classThemes": valid_themes,
    }


def read_data(database_path=DATABASE_PATH):
    with closing(connect_database(database_path)) as connection:
        classes = [
            {"code": row["code"], "name": row["name"]}
            for row in connection.execute("SELECT code, name FROM classes ORDER BY rowid")
        ]
        events = [
            {
                "name": row["name"],
                "date": row["event_date"],
                "time": row["event_time"],
                "classCode": row["class_code"],
            }
            for row in connection.execute(
                "SELECT name, event_date, event_time, class_code FROM events ORDER BY id"
            )
        ]
        assignments = [
            {
                "name": row["name"],
                "grade": row["grade"],
                "weight": row["weight"],
                "type": row["type"],
                "classCode": row["class_code"],
            }
            for row in connection.execute(
                "SELECT name, grade, weight, type, class_code FROM assignments ORDER BY id"
            )
        ]
        themes = {
            row["class_code"]: json.loads(row["theme_json"])
            for row in connection.execute("SELECT class_code, theme_json FROM class_themes")
        }
    return {"version": 1, "classes": classes, "events": events, "assignments": assignments, "classThemes": themes}


def write_data(data, database_path=DATABASE_PATH):
    valid_data = validate_data(data)
    with closing(connect_database(database_path)) as connection:
        with connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("DELETE FROM events")
            connection.execute("DELETE FROM assignments")
            connection.execute("DELETE FROM class_themes")
            connection.execute("DELETE FROM classes")
            connection.executemany(
                "INSERT INTO classes (code, name) VALUES (?, ?)",
                [(course["code"], course["name"]) for course in valid_data["classes"]],
            )
            connection.executemany(
                "INSERT INTO events (name, event_date, event_time, class_code) VALUES (?, ?, ?, ?)",
                [
                    (event["name"], event["date"], event["time"], event["classCode"])
                    for event in valid_data["events"]
                ],
            )
            connection.executemany(
                "INSERT INTO assignments (name, grade, weight, type, class_code) VALUES (?, ?, ?, ?, ?)",
                [
                    (assignment["name"], assignment["grade"], assignment["weight"], assignment["type"], assignment["classCode"])
                    for assignment in valid_data["assignments"]
                ],
            )
            connection.executemany(
                "INSERT INTO class_themes (class_code, theme_json) VALUES (?, ?)",
                [
                    (class_code, json.dumps(theme, separators=(",", ":")))
                    for class_code, theme in valid_data["classThemes"].items()
                ],
            )


class CourseTrackerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_DIR), **kwargs)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def request_is_local(self):
        try:
            host = urlsplit(f"//{self.headers.get('Host', '')}").hostname
            origin = self.headers.get("Origin")
            if host not in {"127.0.0.1", "localhost"}:
                return False
            if origin:
                parsed_origin = urlsplit(origin)
                return (
                    parsed_origin.scheme == "http"
                    and parsed_origin.hostname in {"127.0.0.1", "localhost"}
                    and parsed_origin.port == self.server.server_port
                )
            return True
        except ValueError:
            return False

    def do_GET(self):
        if not self.request_is_local():
            self.send_json(403, {"error": "Requests must come from the local app."})
            return
        if urlsplit(self.path).path == "/api/data":
            try:
                self.send_json(200, read_data())
            except sqlite3.Error:
                self.log_error("Database read failed")
                self.send_json(500, {"error": "Unable to read the local database."})
            return
        if urlsplit(self.path).path == "/":
            self.path = "/front-end.html"
        super().do_GET()

    def do_PUT(self):
        if not self.request_is_local():
            self.send_json(403, {"error": "Requests must come from the local app."})
            return
        if urlsplit(self.path).path != "/api/data":
            self.send_json(404, {"error": "API endpoint not found."})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > MAX_REQUEST_SIZE:
                self.send_json(413, {"error": "Request body is empty or too large."})
                return
            raw_data = self.rfile.read(content_length)
            data = json.loads(raw_data.decode("utf-8"))
            write_data(data)
            self.send_json(200, {"saved": True})
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            self.send_json(400, {"error": str(error)})
        except sqlite3.Error:
            self.log_error("Database write failed")
            self.send_json(500, {"error": "Unable to save to the local database."})


def main():
    initialize_database()
    server = ThreadingHTTPServer((HOST, PORT), CourseTrackerHandler)
    print(f"CourseTracker is running at http://{HOST}:{PORT}/")
    print(f"SQLite database: {DATABASE_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down CourseTracker.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
