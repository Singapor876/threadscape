import json
import sqlite3
from contextlib import contextmanager
from typing import Any, Iterator

from .config import DATABASE_PATH

SCHEMA = (
    """CREATE TABLE IF NOT EXISTS knowledge_nodes (
        id TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        sources_json TEXT NOT NULL DEFAULT '[]'
    )""",
    "CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_parent_id ON knowledge_nodes(parent_id)",
    """CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        position INTEGER NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS idx_messages_node_position ON messages(node_id, position)",
    """CREATE TABLE IF NOT EXISTS queue_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        position INTEGER NOT NULL
    )""",
    "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
)


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    try:
        yield connection
    finally:
        connection.close()


def initialize() -> None:
    with connect() as database:
        for statement in SCHEMA:
            database.execute(statement)
        database.execute("PRAGMA optimize")
        database.commit()


def read_state() -> dict[str, Any] | None:
    with connect() as database:
        node_rows = database.execute(
            "SELECT id, parent_id, title, created_at, sources_json FROM knowledge_nodes ORDER BY created_at, rowid"
        ).fetchall()
        if not node_rows:
            return None
        message_rows = database.execute(
            "SELECT id, node_id, role, content FROM messages ORDER BY node_id, position"
        ).fetchall()
        grouped: dict[str, list[dict[str, str]]] = {}
        for row in message_rows:
            grouped.setdefault(row["node_id"], []).append(
                {"id": row["id"], "role": row["role"], "content": row["content"]}
            )
        nodes = [
            {
                "id": row["id"],
                "parentId": row["parent_id"],
                "title": row["title"],
                "createdAt": row["created_at"],
                "sources": json.loads(row["sources_json"] or "[]"),
                "messages": grouped.get(row["id"], []),
            }
            for row in node_rows
        ]
        queue = [row["content"] for row in database.execute("SELECT content FROM queue_items ORDER BY position")]
        active = database.execute("SELECT value FROM app_settings WHERE key = 'active_id'").fetchone()
        return {"nodes": nodes, "activeId": active["value"] if active else nodes[0]["id"], "queue": queue}


def write_state(state: dict[str, Any]) -> None:
    nodes = state.get("nodes")
    queue = state.get("queue")
    if not isinstance(nodes, list) or not nodes or not isinstance(queue, list):
        raise ValueError("状态数据无效")
    with connect() as database:
        with database:
            database.execute("DELETE FROM messages")
            database.execute("DELETE FROM queue_items")
            database.execute("DELETE FROM knowledge_nodes")
            pending = list(nodes)
            inserted: set[str] = set()
            while pending:
                index = next((i for i, node in enumerate(pending) if not node.get("parentId") or node["parentId"] in inserted), -1)
                if index < 0:
                    raise ValueError("知识树包含无效父节点")
                node = pending.pop(index)
                database.execute(
                    "INSERT INTO knowledge_nodes (id, parent_id, title, created_at, sources_json) VALUES (?, ?, ?, ?, ?)",
                    (node["id"], node.get("parentId"), node["title"], node["createdAt"], json.dumps(node.get("sources", []), ensure_ascii=False)),
                )
                inserted.add(node["id"])
                for position, message in enumerate(node.get("messages", [])):
                    database.execute(
                        "INSERT INTO messages (id, node_id, role, content, position) VALUES (?, ?, ?, ?, ?)",
                        (message["id"], node["id"], message["role"], message["content"], position),
                    )
            database.executemany(
                "INSERT INTO queue_items (content, position) VALUES (?, ?)",
                [(item, position) for position, item in enumerate(queue)],
            )
            database.execute(
                "INSERT INTO app_settings (key, value) VALUES ('active_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (state.get("activeId", nodes[0]["id"]),),
            )
