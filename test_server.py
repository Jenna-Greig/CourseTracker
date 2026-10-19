import tempfile
import unittest
from contextlib import closing
from pathlib import Path

import server


class SQLitePersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "course-tracker.sqlite3"
        server.initialize_database(self.database_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def sample_data(self):
        return {
            "version": 1,
            "classes": [{"code": "BIO101", "name": "Biology"}],
            "events": [{
                "name": "Lab",
                "date": "2026-10-22",
                "time": "10:00 AM",
                "classCode": "BIO101",
            }],
            "assignments": [{
                "name": "Quiz 1",
                "grade": 92,
                "weight": 15,
                "type": "quiz",
                "classCode": "BIO101",
            }],
            "classThemes": {
                "BIO101": {
                    "textColor": "#193b3b",
                    "backgroundColor": "#edf8f6",
                    "font": "Arial, sans-serif",
                    "wallpaper": "glow",
                    "assignmentColors": {
                        "assignment": "#d9eee9",
                        "quiz": "#e6def5",
                        "exam": "#f5e2d9",
                    },
                },
            },
        }

    def test_round_trip_persists_all_record_types(self):
        expected = self.sample_data()
        server.write_data(expected, self.database_path)

        self.assertEqual(server.read_data(self.database_path), expected)

    def test_invalid_data_does_not_replace_existing_records(self):
        expected = self.sample_data()
        server.write_data(expected, self.database_path)
        invalid_data = self.sample_data()
        invalid_data["events"][0]["classCode"] = "MISSING"

        with self.assertRaises(ValueError):
            server.write_data(invalid_data, self.database_path)

        self.assertEqual(server.read_data(self.database_path), expected)

    def test_storage_is_normalized_into_sql_tables(self):
        with closing(server.connect_database(self.database_path)) as connection:
            tables = {
                row["name"]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            }

        self.assertTrue({"classes", "events", "assignments", "class_themes"} <= tables)


if __name__ == "__main__":
    unittest.main()
