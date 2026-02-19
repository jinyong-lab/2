"""
clean_artifacts.py - Clean PDF parsing artifacts from exam.db

Removes:
1. Lines that are ONLY □ characters (checkbox artifacts)
2. Trailing subject header lines from the bottom of model answers
   e.g., "교육의이해 교육과정 교육방법 교육평가 교육행정 교육심리 교육사회 생활지도와 교육사"
         "및공학 상담 교육철학"
3. Trailing page-footer lines like "- 10- 설보연SANTA 교육학" or "-1 - 설보연SANTA 교육학"
4. Trailing whitespace/newlines
"""

import sqlite3
import re

DB_PATH = r'C:\Users\HOSEO\Desktop\임용\Makeup\exam.db'

# Subject header words that appear as trailing artifacts
SUBJECT_HEADER_KEYWORDS = [
    '교육의이해', '교육과정', '교육방법', '교육평가', '교육행정',
    '교육심리', '교육사회', '생활지도와', '교육사', '및공학',
    '상담', '교육철학',
]

# Pattern for page footer lines like "- 10- 설보연SANTA 교육학" or "-1 - 설보연SANTA 교육학"
_PAGE_FOOTER_RE = re.compile(r'^-\s*\d+\s*-\s*\S')


def is_only_checkbox_chars(line: str) -> bool:
    """Returns True if line contains only □ characters (and whitespace)."""
    stripped = line.strip()
    if not stripped:
        return False
    return all(c == '\u25a1' for c in stripped)  # □ is U+25A1


def is_subject_header_line(line: str) -> bool:
    """
    Returns True if line looks like a subject header artifact.
    These are lines containing only subject name tokens with no other content.
    """
    stripped = line.strip()
    if not stripped:
        return False

    # Remove all subject keywords and spaces from the line
    # If nothing meaningful remains, it's a header line
    remainder = stripped
    for kw in SUBJECT_HEADER_KEYWORDS:
        remainder = remainder.replace(kw, '')

    # After removing all subject keywords, only spaces/punctuation should remain
    remainder = remainder.strip()
    # Allow empty remainder or very short connectors
    return len(remainder) <= 2


def is_page_footer_line(line: str) -> bool:
    """Returns True if line is a page footer like '- 10- 설보연SANTA 교육학'."""
    return bool(_PAGE_FOOTER_RE.match(line.strip()))


def is_artifact_line(line: str) -> bool:
    """Returns True if a trailing line is an artifact to be stripped."""
    return (
        is_only_checkbox_chars(line)
        or is_subject_header_line(line)
        or is_page_footer_line(line)
        or not line.strip()
    )


def clean_text(text: str) -> str:
    """
    Clean artifact lines from text.
    - Removes internal lines that are ONLY □ characters
    - Strips trailing artifact lines (□-only, subject headers, page footers, blank lines)
    """
    if not text:
        return text

    lines = text.split('\n')

    # Remove internal lines that are only □ characters
    cleaned_lines = []
    for line in lines:
        if is_only_checkbox_chars(line):
            continue  # skip □□□□□ lines anywhere in text
        cleaned_lines.append(line)

    # Strip trailing artifact lines from the end (multi-pass until stable)
    changed = True
    while changed and cleaned_lines:
        changed = False
        while cleaned_lines and is_artifact_line(cleaned_lines[-1]):
            cleaned_lines.pop()
            changed = True

    result = '\n'.join(cleaned_lines).strip()
    return result


def main():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute("SELECT id, content, modelAnswer FROM Question")
    rows = c.fetchall()

    total = len(rows)
    cleaned_count = 0
    updates = []

    for row_id, content, model_answer in rows:
        new_content = clean_text(content) if content else content
        new_model_answer = clean_text(model_answer) if model_answer else model_answer

        if new_content != content or new_model_answer != model_answer:
            cleaned_count += 1
            updates.append((new_content, new_model_answer, row_id))

    if updates:
        c.executemany(
            "UPDATE Question SET content = ?, modelAnswer = ? WHERE id = ?",
            updates
        )
        conn.commit()

    conn.close()

    print(f"Total questions: {total}")
    print(f"Cleaned records: {cleaned_count}")
    print("Done.")


if __name__ == '__main__':
    main()
