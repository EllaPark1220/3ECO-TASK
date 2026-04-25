# [Feature] CT-DB-008: SurveyResponse 모델 — 분기 1회 제한 UNIQUE + 익명 토큰 분리 + Likert 컬럼

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-DB-008: SurveyResponse 모델 + UNIQUE(userId | anonymousToken, quarter, year) + Likert 1~5 + freeResponse + INV-09 강제"
labels: 'feature, backend, db, survey, priority:critical, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-DB-008] SurveyResponse 테이블 정의 — 사용자별/익명별 분기당 1회 제한 (UNIQUE) + Likert 1~5 (less_fear_score, confidence_score) + free_response 자유 응답 + INV-09 데이터 레이어 강제
- **목적**: REQ-FUNC-003 (체감 변화 설문) 의 데이터 기반. CT-API-008 (submitSurvey DTO) + FW-SUR-001 (Logic Write 본체) 의 SSOT. INV-09 (분기당 1회) 를 DB UNIQUE 제약으로 강제 → P2002 catch 가 `SURVEY_ALREADY_SUBMITTED` 응답 변환. **익명 모드 분리** — userId NULL + anonymousToken 활용으로 솔직한 응답 유도.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.2.2` — SURVEY_RESPONSE 테이블 정의
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-003 (체감 변화 설문)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-043 ("덜 두렵다" ≥60%), REQ-NF-014 (PII 최소)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-09 (분기당 1회)
- 선행: CT-DB-001 (Prisma), CT-DB-002 (User)
- 짝: CT-API-008 (Survey DTO), FW-SUR-001 (Logic Write)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Quarter enum (Prisma)**:
  ```prisma
  enum Quarter {
    Q1
    Q2
    Q3
    Q4
  }
  ```
- [ ] **SurveyResponse 모델 정의**:
  ```prisma
  model SurveyResponse {
    id                String    @id @default(uuid())

    // 응답자 식별 — 양쪽 분리 (둘 중 하나만 NOT NULL)
    userId            String?   // 로그인 모드 (User 와 cascade)
    user              User?     @relation(fields: [userId], references: [id], onDelete: Cascade)
    anonymousToken    String?   // 익명 모드 (UUID, FW-OX-004 발급)

    // 분기 정보
    quarter           Quarter   // Q1~Q4
    year              Int       // 2026~2030

    // Likert 1~5
    lessFearScore     Int       // 1=매우 두려움, 5=덜 두려움
    confidenceScore   Int       // 자신감 1~5

    // 자유 응답
    freeResponse      String?   @db.Text

    // 메타
    submittedAt       DateTime  @default(now())

    // INV-09 강제 — 두 UNIQUE (userId 모드 / anonymous 모드)
    @@unique([userId, quarter, year])
    @@unique([anonymousToken, quarter, year])

    @@index([quarter, year])
    @@index([submittedAt])
  }
  ```
- [ ] **응답자 식별 정책 — 둘 중 하나만 NOT NULL (XOR 강제)**:
  - PostgreSQL CHECK 제약:
    ```sql
    ALTER TABLE "SurveyResponse" ADD CONSTRAINT survey_response_xor
      CHECK (
        ("userId" IS NOT NULL AND "anonymousToken" IS NULL) OR
        ("userId" IS NULL AND "anonymousToken" IS NOT NULL)
      );
    ```
  - SQLite 호환 위해 애플리케이션 Zod refine 으로 보완 (FW-SUR-001 의 Server Action 진입 시점)
- [ ] **Likert 1~5 검증**:
  - 애플리케이션 Zod 우선 (`z.number().int().min(1).max(5)`)
  - PostgreSQL CHECK (선택):
    ```sql
    ALTER TABLE "SurveyResponse" ADD CONSTRAINT less_fear_score_range
      CHECK ("lessFearScore" BETWEEN 1 AND 5);
    ```
- [ ] **freeResponse 길이 제한**:
  - DB Text — PostgreSQL 무제한, SQLite 무제한
  - 애플리케이션 Zod 의 `.max(2000)` 가 강제 (CT-API-008 정합)
- [ ] **익명 토큰 정책**:
  - UUID v4
  - DB 에 저장 후 30일 retention 정책 (별도 cron 정리 — 후속)
  - 토큰 자체에 user_id 매핑 정보 0 (단방향)
- [ ] **cascade 정책 (User 삭제 시)**:
  - userId 가 NOT NULL 인 응답 — User cascade DELETE
  - anonymousToken 응답 — 영향 없음 (user 와 무관)
- [ ] **인덱스 정책**:
  - `(userId, quarter, year)` UNIQUE — 핫스팟
  - `(anonymousToken, quarter, year)` UNIQUE — 핫스팟
  - `(quarter, year)` — KPI 집계
  - `submittedAt` — 시계열 분석
- [ ] **마이그레이션 정합성 검증**:
  - SQLite 의 partial UNIQUE 미지원 — 본 schema 의 UNIQUE 제약은 NULL 포함 row 가 중복 가능
  - PostgreSQL — 표준 SQL 의 UNIQUE 는 NULL 을 unique 로 취급 (각 NULL 다른 값)
  - **본 정책은 PostgreSQL 표준 동작 활용** + SQLite 는 동일 동작 (구버전 SQLite 도 NULL=NULL false 처리)
- [ ] **Lesson 과의 관계 부재 정책**: 본 모델은 lesson 별 응답 아닌 **분기별 통합 응답**. lesson_id 컬럼 미포함
- [ ] **Stage 단계 정책 (MVP-IN, Public Pilot)**:
  - Alpha·Private Beta — 모델 정의만 (운영 0)
  - Closed Beta — FW-OX-004 트리거 활성화 가능
  - Public Pilot — 실 운영 데이터 수집

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 로그인 모드 정상 INSERT
- **Given**: User u1 + Q2 미제출
- **When**: `prisma.surveyResponse.create({ data: { userId: 'u1', quarter: 'Q2', year: 2026, lessFearScore: 4, confidenceScore: 4 } })`
- **Then**: INSERT 정상

### Scenario 2: 익명 모드 정상 INSERT
- **Given**: anonymousToken = uuid + Q2 미제출
- **When**: `prisma.surveyResponse.create({ data: { anonymousToken: 'uuid-x', quarter: 'Q2', year: 2026, lessFearScore: 5, confidenceScore: 4 } })`
- **Then**: INSERT 정상. userId NULL

### Scenario 3: 동일 (userId, quarter, year) 중복 — P2002
- **Given**: u1 의 Q2 2026 가 이미 존재
- **When**: 동일 키로 재 INSERT
- **Then**: P2002 (UNIQUE 제약)

### Scenario 4: 동일 (anonymousToken, quarter, year) 중복 — P2002
- **Given**: 동일 토큰 + 동일 분기
- **When**: 재 INSERT
- **Then**: P2002

### Scenario 5: userId + anonymousToken 동시 NULL — CHECK 제약
- **Given**: 데이터
- **When**: 둘 다 NULL INSERT
- **Then**: CHECK 위반 (PostgreSQL) 또는 애플리케이션 Zod 거부 (SQLite)

### Scenario 6: userId + anonymousToken 동시 NOT NULL — CHECK
- **Given**: 데이터
- **When**: 둘 다 값 INSERT
- **Then**: CHECK 위반

### Scenario 7: lessFearScore 범위 외 (6) — CHECK
- **Given**: 데이터
- **When**: lessFearScore: 6 INSERT
- **Then**: CHECK 위반 (또는 애플리케이션 Zod 거부)

### Scenario 8: User cascade DELETE
- **Given**: u1 의 SurveyResponse 3건
- **When**: User u1 삭제
- **Then**: 3건 자동 DELETE (userId NOT NULL 응답만)

### Scenario 9: 익명 응답은 User cascade 무관
- **Given**: anonymousToken 응답 5건 + User 삭제
- **When**: 삭제
- **Then**: 익명 응답 5건 보존 (user 무관)

### Scenario 10: 인덱스 성능 — 분기 집계
- **Given**: SurveyResponse 1만건
- **When**: `groupBy({ by: ['quarter', 'year'], _count: true })`
- **Then**: p95 < 100ms

## :gear: Technical & Non-Functional Constraints
- **INV-09 강제 — 두 UNIQUE (userId 모드 / anonymous 모드)**: 분기당 1회 데이터 레이어 강제. P2002 → CT-API-008 의 `SURVEY_ALREADY_SUBMITTED` 변환
- **XOR 강제 (CHECK)**: userId 와 anonymousToken 둘 중 하나만. PostgreSQL CHECK + 애플리케이션 Zod 보완
- **익명성 보장**: anonymousToken 모드에서 userId 절대 NULL. 솔직한 응답 유도
- **익명 토큰 retention 30일**: FW-OX-004 의 토큰 만료와 정합. 별도 cron 정리 (후속)
- **Likert 1~5 강제**: Zod 우선 + PostgreSQL CHECK 보조
- **freeResponse Text + Zod max(2000)**: DB 무제한, 애플리케이션이 강제
- **Lesson 미관계**: 분기별 통합 응답 (lesson 별 응답 아님)
- **인덱스 4종**: 두 UNIQUE + (quarter, year) + submittedAt
- **PII 최소 (REQ-NF-014)**: email·전화·실명 컬럼 미포함. anonymousToken 활용으로 user_id 도 옵션
- **freeResponse 의 PII 자동 추출 정책**: 별도 후속 (정규식 차단 또는 LLM 검증)
- **금지**:
  - userId + anonymousToken 동시 값 (CHECK 위반)
  - 둘 다 NULL (CHECK 위반)
  - Likert 0 또는 6 (범위 위반)
  - lesson_id 컬럼 추가 (분기별 통합 정책 위반)
  - PII 컬럼 추가 (CON-01·REQ-NF-014 위반)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Quarter enum + SurveyResponse 모델 정의
- [ ] 두 UNIQUE 제약 + XOR CHECK 적용
- [ ] Likert 1~5 + freeResponse Text 검증
- [ ] cascade User 정책 적용
- [ ] 마이그레이션 SQL 파일 커밋
- [ ] SQLite + PostgreSQL 양 환경 호환
- [ ] 인덱스 성능 측정 (p95 < 100ms)
- [ ] PR 본문에 "INV-09 데이터 레이어 강제 + 익명 모드 분리" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-001 (Prisma)
  - CT-DB-002 (User — relation)
- **Blocks**:
  - CT-API-008 (Survey Contract — 본 모델의 Zod 정의 활용)
  - FW-SUR-001 (Logic Write — INSERT)
  - FR-SUR-001 (집계 쿼리 — "덜 두렵다" ≥60%)
  - FW-OX-004 (10자리 트리거 — anonymousToken 발급 + 본 모델 INSERT)
  - TS-UT-010 (분기 1회 제한 단위 테스트)
- **Related**:
  - INV-09 (분기당 1회)
  - REQ-NF-043 ("덜 두렵다" ≥60%) 측정 기반
