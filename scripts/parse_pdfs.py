"""
parse_pdfs.py - 마스터 파싱 스크립트
Runs all individual parsers and imports data into the database.

Usage:
    C:\\Users\\HOSEO\\uv\\.venv\\Scripts\\python.exe parse_pdfs.py
"""

import sys
import time
from pathlib import Path

# Ensure scripts directory is in path
SCRIPTS_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPTS_DIR))


def check_pdfplumber():
    """Check and install pdfplumber if needed."""
    try:
        import pdfplumber
        print("pdfplumber: 설치 확인 완료")
        return True
    except ImportError:
        print("pdfplumber가 설치되지 않음. 설치 중...")
        import subprocess
        result = subprocess.run(
            [r"C:\Users\HOSEO\uv\.venv\Scripts\pip.exe", "install", "pdfplumber"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print("pdfplumber 설치 완료")
            return True
        else:
            print(f"pdfplumber 설치 실패: {result.stderr}")
            return False


def run_parse_formative() -> list:
    """Run formative PDF parser."""
    print("\n" + "=" * 60)
    print("단계 1/4: 형성평가 해설편 파싱")
    print("=" * 60)

    start = time.time()
    try:
        from parse_formative import main as formative_main
        questions = formative_main()
        elapsed = time.time() - start
        count = len(questions) if questions else 0
        print(f"\n완료: {count}개 문항 ({elapsed:.1f}초)")
        return questions or []
    except Exception as e:
        print(f"\n오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return []


def run_parse_subnotes() -> list:
    """Run subnotes PDF parser."""
    print("\n" + "=" * 60)
    print("단계 2/4: 서브노트 파싱")
    print("=" * 60)

    start = time.time()
    try:
        from parse_subnotes import main as subnotes_main
        questions = subnotes_main()
        elapsed = time.time() - start
        count = len(questions) if questions else 0
        print(f"\n완료: {count}개 문항 ({elapsed:.1f}초)")
        return questions or []
    except Exception as e:
        print(f"\n오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return []


def run_parse_education() -> list:
    """Run education notes PDF parser."""
    print("\n" + "=" * 60)
    print("단계 3/4: 교육학/전공 노트 파싱")
    print("=" * 60)

    start = time.time()
    try:
        from parse_education import main as education_main
        questions = education_main()
        elapsed = time.time() - start
        count = len(questions) if questions else 0
        print(f"\n완료: {count}개 문항 ({elapsed:.1f}초)")
        return questions or []
    except Exception as e:
        print(f"\n오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return []


def run_import_to_db():
    """Run database import."""
    print("\n" + "=" * 60)
    print("단계 4/4: 데이터베이스 임포트")
    print("=" * 60)

    start = time.time()
    try:
        from import_to_db import main as import_main
        import_main()
        elapsed = time.time() - start
        print(f"\n완료 ({elapsed:.1f}초)")
    except Exception as e:
        print(f"\n오류 발생: {e}")
        import traceback
        traceback.print_exc()


def print_final_summary(
    formative_count: int,
    subnotes_count: int,
    education_count: int,
    total_elapsed: float,
):
    """Print final summary of all parsing results."""
    total = formative_count + subnotes_count + education_count

    print("\n" + "=" * 60)
    print("최종 요약")
    print("=" * 60)
    print(f"  형성평가 해설편: {formative_count}개 문항")
    print(f"  서브노트:        {subnotes_count}개 문항")
    print(f"  교육학/전공:     {education_count}개 문항")
    print(f"  {'─' * 30}")
    print(f"  총계:            {total}개 문항")
    print(f"  소요 시간:       {total_elapsed:.1f}초")
    print("=" * 60)

    # Show output files
    parsed_dir = Path(r"C:\Users\HOSEO\Desktop\임용\Makeup\parsed")
    db_path = Path(r"C:\Users\HOSEO\Desktop\임용\Makeup\exam.db")

    print("\n출력 파일:")
    for json_file in ["formative.json", "subnotes.json", "education.json"]:
        p = parsed_dir / json_file
        if p.exists():
            size_kb = p.stat().st_size / 1024
            print(f"  {p}: {size_kb:.1f} KB")
        else:
            print(f"  {p}: (생성되지 않음)")

    if db_path.exists():
        size_mb = db_path.stat().st_size / (1024 * 1024)
        print(f"  {db_path}: {size_mb:.2f} MB")
    else:
        print(f"  {db_path}: (생성되지 않음)")


def main():
    """Main entry point - run all parsers and import."""
    overall_start = time.time()

    print("=" * 60)
    print("임용시험 PDF 파싱 마스터 스크립트")
    print("=" * 60)
    print(f"Python: {sys.executable}")
    print(f"Scripts dir: {SCRIPTS_DIR}")

    # Step 0: Check dependencies
    print("\n의존성 확인 중...")
    if not check_pdfplumber():
        print("ERROR: pdfplumber를 설치할 수 없습니다. 수동으로 설치하세요:")
        print(r"  C:\Users\HOSEO\uv\.venv\Scripts\pip.exe install pdfplumber")
        sys.exit(1)

    # Ensure output directory exists
    output_dir = Path(r"C:\Users\HOSEO\Desktop\임용\Makeup\parsed")
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"출력 디렉토리: {output_dir}")

    # Step 1: Parse formative PDFs
    formative_questions = run_parse_formative()

    # Step 2: Parse subnotes PDFs
    subnotes_questions = run_parse_subnotes()

    # Step 3: Parse education notes PDFs
    education_questions = run_parse_education()

    # Step 4: Import to database
    run_import_to_db()

    # Final summary
    total_elapsed = time.time() - overall_start
    print_final_summary(
        formative_count=len(formative_questions),
        subnotes_count=len(subnotes_questions),
        education_count=len(education_questions),
        total_elapsed=total_elapsed,
    )


if __name__ == "__main__":
    main()
