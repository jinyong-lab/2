#!/usr/bin/env python3
"""
Export SQLite database to Cloudflare D1 compatible SQL
Usage: python export_to_d1.py
"""

import sqlite3
import os
from datetime import datetime

# Paths
DB_PATH = r'C:\Users\HOSEO\Desktop\임용\Makeup\exam.db'
OUTPUT_PATH = r'C:\Users\HOSEO\Desktop\임용\Makeup\d1_import.sql'

# Prisma schema to SQL DDL
CREATE_TABLES = """
-- Create tables from Prisma schema
CREATE TABLE IF NOT EXISTS Subject (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Topic (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subjectId INTEGER NOT NULL,
  UNIQUE(name, subjectId)
);

CREATE TABLE IF NOT EXISTS Question (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  modelAnswer TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'essay',
  source TEXT NOT NULL DEFAULT 'formative',
  difficulty INTEGER NOT NULL DEFAULT 3,
  pageRef TEXT,
  subjectId INTEGER NOT NULL,
  topicId INTEGER,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS BlankItem (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position INTEGER NOT NULL,
  answer TEXT NOT NULL,
  context TEXT NOT NULL,
  questionId INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS Attempt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  questionId INTEGER NOT NULL,
  userAnswer TEXT NOT NULL,
  score INTEGER NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Bookmark (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  questionId INTEGER NOT NULL,
  note TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"""


def escape_sql_string(value):
    """Escape single quotes in SQL strings"""
    if value is None:
        return 'NULL'
    if isinstance(value, str):
        # Replace single quotes with two single quotes (SQL escaping)
        escaped = value.replace("'", "''")
        return f"'{escaped}'"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, datetime):
        return f"'{value.isoformat()}'"
    return f"'{str(value)}'"


def generate_insert_statement(table_name, columns, row):
    """Generate INSERT OR REPLACE statement for a row"""
    col_names = ', '.join(columns)
    values = ', '.join(escape_sql_string(val) for val in row)
    return f"INSERT OR REPLACE INTO {table_name} ({col_names}) VALUES ({values});"


def export_table(cursor, table_name, output_file):
    """Export all rows from a table as INSERT statements"""
    # Get column names
    cursor.execute(f'PRAGMA table_info("{table_name}")')
    columns = [col[1] for col in cursor.fetchall()]

    # Get all rows
    cursor.execute(f'SELECT * FROM "{table_name}"')
    rows = cursor.fetchall()

    if not rows:
        print(f"  {table_name}: 0 rows (skipped)")
        return 0

    print(f"  {table_name}: {len(rows)} rows")

    # Write INSERT statements
    output_file.write(f"\n-- Data for {table_name}\n")
    for row in rows:
        stmt = generate_insert_statement(table_name, columns, row)
        output_file.write(stmt + '\n')

    return len(rows)


def main():
    print(f"Exporting SQLite database to D1 SQL format...")
    print(f"Source: {DB_PATH}")
    print(f"Output: {OUTPUT_PATH}")

    # Check if database exists
    if not os.path.exists(DB_PATH):
        print(f"ERROR: Database not found at {DB_PATH}")
        return

    # Connect to SQLite
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Get all table names
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [row[0] for row in cursor.fetchall()]
    print(f"\nFound {len(tables)} tables: {', '.join(tables)}\n")

    # Open output file
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        # Write header
        f.write("-- Cloudflare D1 Import Script\n")
        f.write(f"-- Generated: {datetime.now().isoformat()}\n")
        f.write(f"-- Source: {DB_PATH}\n")
        f.write("\n-- Begin transaction\n")
        f.write("BEGIN;\n\n")

        # Write CREATE TABLE statements
        f.write(CREATE_TABLES)
        f.write("\n")

        # Export data from each table
        print("Exporting data:")
        total_rows = 0

        # Export in dependency order to avoid foreign key issues
        table_order = ['Subject', 'Topic', 'Question', 'BlankItem', 'Attempt', 'Bookmark', 'Setting']

        for table in table_order:
            if table in tables:
                rows = export_table(cursor, table, f)
                total_rows += rows

        # Export any remaining tables not in the order
        for table in tables:
            if table not in table_order and not table.startswith('_'):
                rows = export_table(cursor, table, f)
                total_rows += rows

        # Write footer
        f.write("\n-- Commit transaction\n")
        f.write("COMMIT;\n")

    conn.close()

    print(f"\nExport completed successfully!")
    print(f"Total rows exported: {total_rows}")
    print(f"\nTo import into D1, run:")
    print(f"  wrangler d1 execute exam-db --file=./Makeup/d1_import.sql")


if __name__ == '__main__':
    main()
