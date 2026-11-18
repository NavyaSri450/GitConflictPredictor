"""Small SQLite store for connected repositories and genuine Git analyses."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.config import settings


class AnalysisStore:
    """Uses the Python standard library; no separate database service is needed."""

    def __init__(self, database_path: Path | None = None) -> None:
        self.database_path = database_path or settings.database_path

    def _connect(self) -> sqlite3.Connection:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.database_path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 10000")
        return connection

    def initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS repositories (
                    id TEXT PRIMARY KEY,
                    source_key TEXT NOT NULL UNIQUE,
                    kind TEXT NOT NULL CHECK(kind IN ('github_url', 'local_path')),
                    name TEXT NOT NULL,
                    owner TEXT,
                    default_branch TEXT NOT NULL,
                    repository_path TEXT NOT NULL,
                    connected_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS analyses (
                    id TEXT PRIMARY KEY,
                    repository_id TEXT NOT NULL REFERENCES repositories(id),
                    created_at TEXT NOT NULL,
                    source_branch TEXT NOT NULL,
                    target_branch TEXT NOT NULL,
                    merge_check TEXT NOT NULL CHECK(merge_check IN ('clean', 'conflict')),
                    prediction_available INTEGER NOT NULL CHECK(prediction_available IN (0, 1)),
                    payload_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_analyses_repository ON analyses(repository_id, created_at DESC);
                """
            )

    def upsert_repository(
        self,
        *,
        source_key: str,
        kind: str,
        name: str,
        owner: str | None,
        default_branch: str,
        repository_path: Path,
    ) -> dict[str, Any]:
        self.initialize()
        with self._connect() as connection:
            existing = connection.execute("SELECT * FROM repositories WHERE source_key = ?", (source_key,)).fetchone()
            if existing:
                connection.execute(
                    "UPDATE repositories SET name=?, owner=?, default_branch=?, repository_path=? WHERE id=?",
                    (name, owner, default_branch, str(repository_path), existing["id"]),
                )
                row = connection.execute("SELECT * FROM repositories WHERE id = ?", (existing["id"],)).fetchone()
            else:
                repository_id = str(uuid4())
                connected_at = datetime.now(timezone.utc).isoformat()
                connection.execute(
                    "INSERT INTO repositories(id, source_key, kind, name, owner, default_branch, repository_path, connected_at) VALUES(?,?,?,?,?,?,?,?)",
                    (repository_id, source_key, kind, name, owner, default_branch, str(repository_path), connected_at),
                )
                row = connection.execute("SELECT * FROM repositories WHERE id = ?", (repository_id,)).fetchone()
        return dict(row)

    def repository(self, repository_id: str) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM repositories WHERE id = ?", (repository_id,)).fetchone()
        return dict(row) if row else None

    def repositories(self) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as connection:
            rows = connection.execute("SELECT * FROM repositories ORDER BY connected_at DESC").fetchall()
        return [dict(row) for row in rows]

    def save_analysis(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.initialize()
        analysis_id = str(uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        record = {**payload, "id": analysis_id, "created_at": created_at}
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO analyses(id, repository_id, created_at, source_branch, target_branch, merge_check, prediction_available, payload_json) VALUES(?,?,?,?,?,?,?,?)",
                (
                    analysis_id,
                    record["repository_id"],
                    created_at,
                    record["source_branch"],
                    record["target_branch"],
                    record["merge_check"],
                    int(record["prediction"] is not None),
                    json.dumps(record, separators=(",", ":")),
                ),
            )
        return record

    def analysis(self, analysis_id: str) -> dict[str, Any] | None:
        self.initialize()
        with self._connect() as connection:
            row = connection.execute("SELECT payload_json FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
        return json.loads(row["payload_json"]) if row else None

    def analyses(
        self,
        *,
        query: str = "",
        merge_check: str | None = None,
        repository_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        self.initialize()
        clauses: list[str] = []
        values: list[Any] = []
        if merge_check:
            clauses.append("merge_check = ?")
            values.append(merge_check)
        if repository_id:
            clauses.append("repository_id = ?")
            values.append(repository_id)
        if query:
            escaped_query = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            clauses.append("payload_json LIKE ? ESCAPE '\\'")
            values.append(f"%{escaped_query}%")
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT payload_json FROM analyses{where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (*values, limit, offset),
            ).fetchall()
            total = connection.execute(f"SELECT COUNT(*) AS n FROM analyses{where}", values).fetchone()["n"]
        items = [json.loads(row["payload_json"]) for row in rows]
        return items, int(total)

    def dashboard(self) -> dict[str, Any]:
        self.initialize()
        with self._connect() as connection:
            totals = connection.execute(
                "SELECT COUNT(*) AS total, SUM(CASE WHEN merge_check='clean' THEN 1 ELSE 0 END) AS clean, SUM(CASE WHEN merge_check='conflict' THEN 1 ELSE 0 END) AS conflict, SUM(prediction_available) AS predicted FROM analyses"
            ).fetchone()
            repository_count = connection.execute("SELECT COUNT(*) AS n FROM repositories").fetchone()["n"]
            recent = connection.execute("SELECT payload_json FROM analyses ORDER BY created_at DESC LIMIT 8").fetchall()
            activity = connection.execute(
                "SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS analyses FROM analyses GROUP BY substr(created_at, 1, 10) ORDER BY date"
            ).fetchall()
        return {
            "repository_count": int(repository_count),
            "analysis_count": int(totals["total"] or 0),
            "clean_merge_checks": int(totals["clean"] or 0),
            "conflicting_merge_checks": int(totals["conflict"] or 0),
            "predictions_available": int(totals["predicted"] or 0),
            "recent_analyses": [json.loads(row["payload_json"]) for row in recent],
            "activity_by_date": [{"date": row["date"], "analyses": int(row["analyses"])} for row in activity],
        }

    def is_available(self) -> bool:
        try:
            self.initialize()
            with self._connect() as connection:
                connection.execute("SELECT 1").fetchone()
            return True
        except (OSError, sqlite3.Error):
            return False


store = AnalysisStore()
