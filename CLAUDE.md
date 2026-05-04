# 전문상담교사 임용시험 2027 - 자동 문제 생성 웹사이트

## 프로젝트 개요
전문상담교사 임용시험(2027) 대비 자동 문제 생성 및 학습 웹사이트.
PDF 교재에서 문제를 추출/생성하고, 웹에서 풀고, 학습 기록을 추적한다.

## 배포 & 인프라
- **GitHub**: `https://github.com/jinyong-lab/2`
- **Cloudflare Pages**: `2-8r4.pages.dev` (GitHub 자동 배포)
- **Cloudflare 계정 ID**: `d6cebdc40d822345761a32179bed39e2`
- **D1 Database**: `exam-db` (ID: `3f76550b-a328-41ee-a2e2-0d7389050a15`)
- **로컬 SQLite DB**: `app/prisma/dev.db` (0 bytes, 사용 안함 - 모든 데이터는 D1 remote에 있음)

## 기술 스택
- **Frontend**: Next.js 16 (App Router) + React 19 + TypeScript
- **UI**: shadcn/ui (Radix UI) + Tailwind CSS + lucide-react icons + next-themes (다크모드)
- **DB**: Cloudflare D1 (SQLite 호환) via Prisma + `@prisma/adapter-d1`
- **AI**: OpenAI API (문제 생성)
- **Auth**: 제거됨 (인증 없이 사용)
- **빌드**: `npm run build:cf` → opennextjs-cloudflare → Cloudflare Pages

## 프로젝트 구조

### app/ (Next.js 웹앱)
```
app/
├── src/
│   ├── app/
│   │   ├── (main)/           # 레이아웃 라우트 그룹
│   │   │   ├── page.tsx      # 홈 (대시보드)
│   │   │   ├── practice/
│   │   │   │   ├── page.tsx           # 문제 풀기 선택 화면
│   │   │   │   ├── quiz/page.tsx      # 서술형 연습
│   │   │   │   ├── blank/page.tsx     # 빈칸 채우기
│   │   │   │   ├── exam-style/page.tsx # 기출유형 (AI 생성)
│   │   │   │   └── multiple-choice/page.tsx # 객관식
│   │   │   ├── generate/     # AI 문제 생성
│   │   │   ├── history/      # 학습 기록
│   │   │   ├── bookmarks/    # 북마크
│   │   │   ├── subjects/     # 과목별 보기
│   │   │   ├── settings/     # 설정
│   │   │   └── layout.tsx    # 사이드바 포함 레이아웃
│   │   ├── api/
│   │   │   ├── questions/    # 문제 CRUD + 필터
│   │   │   ├── attempts/     # 풀이 기록
│   │   │   ├── bookmarks/    # 북마크
│   │   │   ├── generate/     # AI 문제 생성 (OpenAI)
│   │   │   ├── generate-exam/ # 기출유형 생성
│   │   │   ├── grade/        # 채점
│   │   │   ├── stats/        # 통계
│   │   │   ├── settings/     # 설정
│   │   │   └── debug/        # 디버그
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── Sidebar.tsx       # 사이드바 네비게이션
│   │   ├── PracticeSelector.tsx
│   │   ├── DarkModeToggle.tsx
│   │   ├── Providers.tsx     # ThemeProvider
│   │   └── ui/               # shadcn/ui 컴포넌트
│   ├── lib/
│   │   ├── d1-client.ts      # Prisma 호환 D1 클라이언트 (핵심!)
│   │   ├── db.ts             # DB 연결
│   │   └── utils.ts
│   └── generated/prisma/     # Prisma 생성 파일
├── prisma/
│   └── schema.prisma         # DB 스키마
├── wrangler.toml             # Cloudflare 설정
└── package.json
```

### scripts/ (Python 문제 생성 스크립트)
```
scripts/
├── parse_pdfs.py             # 형성평가 PDF 파싱
├── parse_formative.py        # 형성평가 문제 추출
├── parse_education.py        # 교육학 PDF 파싱
├── parse_subnotes.py         # 서브노트 PDF 파싱
├── generate_blank_questions.py # 빈칸 문제 생성 (서브노트 기반)
├── generate_mcq.py           # 객관식 문제 생성 (서브노트 기반)
├── import_to_db.py           # SQLite DB 임포트
├── export_to_d1.py           # D1용 SQL 내보내기
├── import_past_exams.py      # 기출문제 임포트
└── clean_artifacts.py        # 정리
```

### Makeup/ (PDF 교재 & 파싱 결과)
```
Makeup/
├── subnote_texts.json        # 텍스트 추출 결과 (62개 파일: 서브노트23 + 보충프린트9 + DAY25 + 필기노트4 + 복습테스트1)
├── parsed/
│   ├── formative.json        # 형성평가 파싱 결과
│   ├── education.json        # 교육학 파싱 결과
│   ├── subnotes.json         # 서브노트 파싱 결과
│   ├── blank_questions.json  # 빈칸 문제 (1,046개)
│   ├── mcq_questions.json    # 객관식 문제 (1,008개)
│   ├── mindmap_questions.json # 마인드맵 문제 (1,051개)
│   └── practice_questions.json # 예상문제 (981개)
└── exports/                  # SQL 내보내기 파일
```

## DB 스키마 (Prisma)
- **Subject**: 과목 (id, name, category)
- **Topic**: 주제 (id, name, subjectId)
- **Question**: 문제 (id, content, modelAnswer, type, source, difficulty, subjectId, topicId)
- **BlankItem**: 빈칸 항목 (사용 안함 - 0 rows, fill-in은 인라인 형식 사용)
- **Attempt**: 풀이 기록 (questionId, userAnswer, score)
- **Bookmark**: 북마크 (questionId, note)
- **Setting**: 설정 (key-value)
- **User**: 사용자 (인증 제거됨, 레거시)

## 과목 ID 매핑 (Subject)
| 시험 | ID | 과목명 |
|------|-----|--------|
| 교육학(1교시) | 1 | 교육과정 |
| | 2 | 교육방법 및 공학 |
| | 3 | 교육평가 |
| | 4 | 교육의 이해 |
| | 5 | 교육행정 |
| | 6 | 교육사회학 |
| | 7 | 교육심리학 |
| 전공B(3교시) | 8 | 생활지도와 상담 |
| | 9 | 교육심리 |
| 전공A(2교시) | 10 | 상담이론 및 실제 |
| | 11 | 집단상담 |
| | 12 | 진로상담 |
| | 13 | 이상심리학 |
| | 14 | 발달심리학 |
| 전공B(3교시) | 15 | 학교상담 |
| | 16 | 심리측정 및 평가 |
| | 17 | 학습심리학 |
| 전공A(2교시) | 18 | 성격심리학 |
| 전공A(2교시) | 19 | 심리학개론 |
| 전공B(3교시) | 20 | 가족상담 |

## 문제 유형 & 현황 (6,921문제, 2026-05-04 기준)

### Question.type 값
| type | 설명 | 형식 |
|------|------|------|
| `essay` | 서술형 | content=문제, modelAnswer=답 |
| `fill-in` | 빈칸 채우기 | content에 `( )` 포함, modelAnswer=정답 텍스트 |
| `multiple-choice` | 객관식 | content에 `\nA. ...\nB. ...\nC. ...\nD. ...`, modelAnswer=정답 글자(A/B/C/D) |

### Question.source 값
| source | 설명 | 수량 |
|--------|------|------|
| `formative` | 형성평가 해설편 | 888 |
| `mindmap` | 마인드맵 기반 생성 | 1,051 |
| `practice` | 예상문제 (답안 플레이스홀더) | 981 |
| `notes` | 노트 | 58 |
| `past_exam` | 기출문제 | 20 |
| `template` | 보충 템플릿 | 1,436 |
| `subnote` | 서브노트 기반 생성 | 2,487 |

### 유형별 현황
| Type | Count |
|------|-------|
| essay | 4,194 |
| fill-in | 1,600 |
| multiple-choice | 1,127 |
| **총계** | **6,921** |

## 사이드바 네비게이션
홈 → 문제 풀기 → 기출유형 → 객관식 → AI 생성 → 학습 기록 → 설정

## D1 데이터베이스 작업 가이드

### SQL 임포트 시 주의사항
1. **null 문자 제거**: PDF 추출 텍스트에 `\x00`이 포함될 수 있음 → 반드시 strip
2. **줄바꿈 처리**: SQL 문자열에 리터럴 줄바꿈 사용 불가 → `|| char(10) ||` 연결 사용
3. **배치 크기**: 대용량 SQL 파일은 D1에서 부분 실패 가능 → 50개씩 배치 분할
4. **로컬 검증**: D1 임포트 전 항상 로컬 SQLite로 먼저 검증

### D1 명령어
```bash
# 원격 D1에 SQL 실행
npx wrangler d1 execute exam-db --remote --file=./path/to/file.sql

# 원격 D1 쿼리
npx wrangler d1 execute exam-db --remote --command="SELECT COUNT(*) FROM Question"
```

## 빌드 & 배포
```bash
cd app
npm run build:cf     # Cloudflare용 빌드
npm run preview      # 로컬 미리보기
npm run deploy       # Cloudflare Pages 배포
```
GitHub push → 자동 배포 (Cloudflare Pages 연동)

## Python 환경
- **Python**: `C:\Users\HOSEO\uv\.venv\Scripts\python.exe` (v3.13.6)
- **PDF 파싱**: pdfplumber 사용
- **인코딩**: `sys.stdout.reconfigure(encoding='utf-8')` 필요 (Windows)

## 빈칸 문제 형식 (fill-in)
- `( )` 인라인 형식 사용 (BlankItem 테이블은 사용하지 않음)
- content: `"프로이트는 ( )를 제안했다"` → modelAnswer: `"정신분석"`
- 정답 비교: 한국어/영어 용어 매칭 지원 (예: `신경증(neurosis)` → `신경증`도 정답)

## 객관식 문제 형식 (multiple-choice)
- content: `"질문\nA. 선택1\nB. 선택2\nC. 선택3\nD. 선택4"`
- modelAnswer: `"A"` (정답 글자)
- 교육학 과목은 객관식 미생성 (전공만)

## 미처리 PDF 파일 (향후 작업 가능)
- 형성평가/문제/DAY1~DAY25.pdf (새로 추가된 형성평가)
- 개념TREE 빈칸편 01-09 (이미지 기반, 텍스트 추출 불가)
- 교육학/*.pdf, 전공/*.pdf
- 보충프린트/*.pdf
