# CourseTracker

CourseTracker helps students track classes, assignments, grades, and events.

## Run locally

The app uses Python's built-in HTTP server and SQLite database. Python 3.9 or newer is required; no third-party packages are needed.

1. Open a terminal in this folder.
2. Run `python3 server.py`.
3. Open <http://127.0.0.1:8000/>.
4. Leave the server running while using the app. Press Ctrl+C in the terminal to stop it.

The database is stored at `~/.course-tracker/course-tracker.sqlite3`. To use another database file, set `COURSETRACKER_DB_PATH` before starting the server.

If this browser has data from an earlier version of CourseTracker saved under the same `http://127.0.0.1:8000` origin, the app migrates it into an empty SQLite database on first load. Data saved while opening `front-end.html` directly (`file://`) is isolated by the browser and is not automatically visible to the local server; it remains untouched in that browser storage.

This is a local, single-user backend. It listens only on this computer and does not provide accounts or sync data to other devices. Back up the SQLite database file to keep a copy of your data.
