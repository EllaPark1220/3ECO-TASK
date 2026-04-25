# [Feature] FR-SUR-001: 설문 응답 집계 — "덜 두렵다" ≥60% 검증 + 분기별 시계열

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-SUR-001: GET /api/kpi/survey-results — Likert 4·5 비율 (\"덜 두렵다\") + 분기별 + REQ-NF-043 ≥60% 진척도 (ADMIN 전용)"
labels: 'feature, backend, kpi, survey, query, priority:high, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-SUR-001] `GET /api/kpi/survey-results` — Likert 4·5 ("덜 두렵다") 비율 집계 + 분기별 시계열 + REQ-NF-043 (≥60% 목표) 진척도 + 자유응답 카운트 (요약 0 — PII 보호)
- **목적**: REQ-NF-043 자동 검증 + Stage 1 Public Pilot Exit Gate 의 측정 지표. 단일 제작자가 매 분기 진척도를 자동 인지. **자유응답은 별도 (운영자만 수동 검토)** — KPI 응답에는 카운트만.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-043 ("덜 두렵다" ≥60%)
  - `/docs/SRS_V0_9.md#4.2.4` — REQ-NF-028 (KPI 자동 집계)
  - `/docs/SRS_V0_9.md#6.2.2` — SURVEY_RESPONSE 테이블
  - `/docs/SRS_V0_9.md#1.2.4` — Public Pilot Exit
- 선행: CT-DB-008 (SurveyResponse), FW-SUR-001 (데이터 진입), FR-AUTH-002 (RBAC), FR-KPI-001 (KPI 패턴)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/kpi/survey-results/route.ts` Route Handler 생성
- [ ] **`requireRole('ADMIN')` 가드** — non-ADMIN 403
- [ ] **응답 DTO 정의 — `lib/contracts/kpi-survey.ts`**:
  ```ts
  export interface SurveyKpiResponse {
    overall: {
      total_responses: number;
      less_fear_4_5_pct: number;       // Likert 4·5 비율 (덜 두렵다)
      avg_less_fear_score: number;      // 평균 (1~5)
      avg_confidence_score: number;
      target: 60;                       // REQ-NF-043
      progress_pct: number;             // (less_fear_4_5_pct / 60) * 100, capped 100
      target_achieved: boolean;
    };
    by_quarter: Array<{
      quarter: string;                  // "2026-Q1"
      total: number;
      less_fear_4_5_pct: number;
      avg_less_fear: number;
      avg_confidence: number;
    }>;
    breakdown: {
      anonymous_count: number;          // 익명 응답 수
      authenticated_count: number;       // 로그인 응답 수
      free_response_count: number;       // 자유응답 작성 수 (텍스트 미포함)
    };
    period: { from: string; to: string };
  }
  ```
- [ ] **쿼리 — overall 집계**:
  ```ts
  const overall = await prisma.$queryRaw<Array<{
    total: bigint;
    less_fear_4_5: bigint;
    avg_less_fear: number;
    avg_confidence: number;
  }>>`
    SELECT
      COUNT(*)::bigint AS total,
      SUM(CASE WHEN "lessFearScore" >= 4 THEN 1 ELSE 0 END)::bigint AS less_fear_4_5,
      AVG("lessFearScore"::float) AS avg_less_fear,
      AVG("confidenceScore"::float) AS avg_confidence
    FROM "SurveyResponse"
    WHERE "submittedAt" >= NOW() - INTERVAL '12 months'
  `;
  const lessFear45Pct = overall[0].total > 0n
    ? Number(overall[0].less_fear_4_5) / Number(overall[0].total) * 100
    : 0;
  ```
- [ ] **쿼리 — 분기별 시계열**:
  ```ts
  const byQuarter = await prisma.$queryRaw<Array<{
    year: number;
    quarter: string;
    total: bigint;
    less_fear_4_5: bigint;
    avg_less_fear: number;
    avg_confidence: number;
  }>>`
    SELECT
      year,
      quarter::text,
      COUNT(*)::bigint AS total,
      SUM(CASE WHEN "lessFearScore" >= 4 THEN 1 ELSE 0 END)::bigint AS less_fear_4_5,
      AVG("lessFearScore"::float) AS avg_less_fear,
      AVG("confidenceScore"::float) AS avg_confidence
    FROM "SurveyResponse"
    WHERE "submittedAt" >= NOW() - INTERVAL '12 months'
    GROUP BY year, quarter
    ORDER BY year ASC, quarter ASC
  `;
  ```
- [ ] **breakdown — 익명/로그인 + 자유응답 카운트**:
  ```ts
  const breakdown = await prisma.$queryRaw`
    SELECT
      SUM(CASE WHEN "userId" IS NULL THEN 1 ELSE 0 END) AS anonymous_count,
      SUM(CASE WHEN "userId" IS NOT NULL THEN 1 ELSE 0 END) AS authenticated_count,
      SUM(CASE WHEN "freeResponse" IS NOT NULL THEN 1 ELSE 0 END) AS free_response_count
    FROM "SurveyResponse"
    WHERE "submittedAt" >= NOW() - INTERVAL '12 months'
  `;
  ```
- [ ] **자유응답 텍스트 미노출 정책**:
  - 본 KPI 응답에 자유응답 텍스트 절대 포함 0
  - 자유응답 검토는 별도 admin 페이지 (FR-TF-002 패턴, 별도 후속)
  - 카운트만 노출 (얼마나 많은 사용자가 자유응답 작성했는지)
- [ ] **REQ-NF-043 진척도 계산**:
  ```ts
  const progressPct = Math.min(100, (lessFear45Pct / 60) * 100);
  const targetAchieved = lessFear45Pct >= 60;
  ```
- [ ] **응답 헤더**: `Cache-Control: private, max-age=600` (10분 캐시)
- [ ] **응답 시간 목표**: p95 ≤ 500ms (집계 쿼리 + 분기별)
- [ ] **인덱스 활용**: SurveyResponse 의 `(quarter, year)` + `submittedAt`
- [ ] **PII 보호**: 개별 응답자 식별자 미노출. 카운트만
- [ ] **OpenAPI 명세 추가**

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: ADMIN 정상 응답
- **Given**: ADMIN + SurveyResponse 100건 (60건이 less_fear ≥ 4)
- **When**: `GET /api/kpi/survey-results`
- **Then**: 200 + `less_fear_4_5_pct: 60, target_achieved: true, progress_pct: 100`

### Scenario 2: non-ADMIN — 403
- **Given**: LEARNER 또는 TEACHER
- **When**: 호출
- **Then**: 403

### Scenario 3: 응답 0건 — graceful
- **Given**: SurveyResponse 0건
- **When**: 호출
- **Then**: 200 + `total_responses: 0, less_fear_4_5_pct: 0, target_achieved: false`. 에러 0

### Scenario 4: REQ-NF-043 진척도
- **Given**: less_fear_4_5_pct: 30
- **When**: 호출
- **Then**: progress_pct: 50 ((30/60)*100)

### Scenario 5: 100% 도달 시 capped
- **Given**: less_fear_4_5_pct: 75
- **When**: 호출
- **Then**: progress_pct: 100 (cap), target_achieved: true

### Scenario 6: 분기별 시계열
- **Given**: 4개 분기 응답
- **When**: 호출
- **Then**: by_quarter 배열 4건 + year+quarter 정렬

### Scenario 7: 익명/로그인 분리 카운트
- **Given**: anonymous 30 + authenticated 20
- **When**: 호출
- **Then**: breakdown.anonymous_count: 30, authenticated_count: 20

### Scenario 8: 자유응답 텍스트 미포함
- **Given**: 응답
- **When**: payload 검사
- **Then**: free_response 텍스트 미포함. count 만

### Scenario 9: 응답 시간
- **Given**: SurveyResponse 10K건
- **When**: 호출
- **Then**: p95 ≤ 500ms

### Scenario 10: PII 미노출
- **Given**: 응답
- **When**: payload 검사
- **Then**: user_id, email, anonymousToken 미포함. 카운트·평균만

## :gear: Technical & Non-Functional Constraints
- **자유응답 텍스트 미노출**: KPI 응답에 텍스트 절대 미포함. 카운트만. 별도 admin 페이지 (후속)
- **REQ-NF-043 진척도**: (less_fear_4_5_pct / 60) * 100, capped 100
- **집계 기간 12개월**: 최근 1년 응답 누적
- **분기별 시계열**: year+quarter 정렬. 최대 4분기 표시
- **PII 보호**: 카운트·평균·비율만. 개별 식별자 절대 미포함
- **Cache 10분**: KPI 안정성 우선
- **응답 시간 ≤ 500ms**: 집계 쿼리 부담
- **인덱스**: SurveyResponse `(quarter, year)` + `submittedAt`
- **Likert "덜 두렵다" 정의**: lessFearScore >= 4 (즉 4 또는 5). 절반 기준 아닌 ≥4 기준
- **금지**:
  - 자유응답 텍스트 노출
  - 개별 user_id·anonymousToken 노출
  - LEARNER·TEACHER 접근 허용
  - "덜 두렵다" 정의 변경 (Likert 4 미만 포함 시 REQ-NF-043 의 의미 위반)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] ADMIN 가드
- [ ] less_fear_4_5_pct 계산 (Likert ≥4 기준)
- [ ] 분기별 시계열 + 익명/로그인 분리
- [ ] 자유응답 텍스트 미포함 검증
- [ ] REQ-NF-043 진척도 + target_achieved 계산
- [ ] 응답 시간 p95 ≤ 500ms 측정
- [ ] OpenAPI 명세 추가
- [ ] PR 본문에 "REQ-NF-043 자동 검증 + Public Pilot Exit Gate" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-008 (SurveyResponse 모델)
  - FW-SUR-001 (데이터 진입)
  - FR-AUTH-002 (RBAC)
  - CT-API-001 (응답 포맷)
- **Blocks**:
  - REQ-NF-043 ("덜 두렵다" ≥60%) 자동 검증
  - Public Pilot Exit Gate 측정
  - 자유응답 검토 admin 페이지 (별도 후속)
- **Related**:
  - SRS Stage 1 Public Pilot 마일스톤
