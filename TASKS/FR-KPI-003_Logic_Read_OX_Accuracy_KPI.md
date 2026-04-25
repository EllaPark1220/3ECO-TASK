# [Feature] FR-KPI-003: OX 평균 정답률 KPI — lesson 별 + 전체 평균 + 난이도 outlier 감지

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-KPI-003: GET /api/kpi/ox-accuracy — lesson 별 평균 정답률 + 전체 평균 + ±2σ outlier (ADMIN 전용)"
labels: 'feature, backend, kpi, ox, query, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-KPI-003] `GET /api/kpi/ox-accuracy` — lesson 별 (사용자 평균) 정답률 + 전체 평균 + 너무 어려운/쉬운 lesson 알림 (전체 평균 ±2σ 이탈 lesson)
- **목적**: 콘텐츠 품질 모니터링 자동화. PRD 원칙 1 (이해 우선) 정합 — 정답률이 너무 낮으면 콘텐츠 난이도·설명 부족 시그널, 너무 높으면 학습 가치 의심. REQ-NF-028 (KPI 자동 집계) + REQ-NF-029 (콘텐츠 품질 지표) 충족. 단일 제작자가 수동으로 모든 lesson 의 정답률을 추적할 수 없으므로 outlier 자동 감지로 콘텐츠 개선 우선순위 도출.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.4` — REQ-NF-028, 029 (KPI 자동 집계 · 콘텐츠 품질 지표)
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-002 (OX 제출)
  - `/docs/SRS_V0_9.md#6.2.2` — EVENT_LOG 테이블 (`ox.submitted`, `ox.failed`)
  - `/docs/SRS_V0_9.md#6.1` — `/api/kpi/ox-accuracy` 엔드포인트
- PRD 원칙 1 (이해 우선) — 콘텐츠 품질 우선
- 선행: CT-DB-009 (EventLog), CT-DB-003 (Lesson), FR-AUTH-002 (RBAC), FR-KPI-001 (KPI 패턴)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/kpi/ox-accuracy/route.ts` Route Handler 생성
- [ ] **`requireRole('ADMIN')` 가드 첫 줄** (FR-AUTH-002 활용) — non-ADMIN 403
- [ ] **응답 DTO 정의 — `lib/contracts/kpi.ts`**:
  ```ts
  export interface OxAccuracyKpiResponse {
    overall: {
      avg_accuracy_pct: number;        // 전체 평균 정답률
      total_attempts: number;           // 모든 시도 카운트
      total_passes: number;             // 정답 카운트
    };
    by_lesson: Array<{
      lesson_id: string;
      title: string;
      avg_accuracy_pct: number | null;  // 시도 0건 시 null
      attempts: number;                 // 시도 횟수 (passed + failed)
      passes: number;                   // 정답 횟수 (멱등 변환 제외)
    }>;
    outliers: {
      too_easy: string[];               // lesson_id, 평균 +2σ 초과
      too_hard: string[];               // lesson_id, 평균 -2σ 미만
      stddev: number;                   // 표준편차
      mean: number;                     // 평균
    };
    period: {
      from: string;                     // ISO datetime
      to: string;
    };
  }
  ```
- [ ] **EventLog 활용 정책**:
  - 카운트 대상: `event = 'ox.submitted'` (정상 시도) — `payload.passed = true/false`
  - 카운트 제외: `event = 'ox.duplicate_idempotent'` (멱등 변환) — Option A 트리거 측정용 별도 카운터
  - 기간: 지난 30일 (default), 쿼리 파라미터로 변경 가능
- [ ] **쿼리 전략 — 단일 SQL 으로 lesson 별 집계**:
  ```ts
  const accuracyByLesson = await prisma.$queryRaw<Array<{
    lesson_id: string;
    attempts: bigint;
    passes: bigint;
  }>>`
    SELECT
      payload->>'lesson_id' AS lesson_id,
      COUNT(*) AS attempts,
      SUM(CASE WHEN (payload->>'passed')::boolean THEN 1 ELSE 0 END) AS passes
    FROM "EventLog"
    WHERE event = 'ox.submitted'
      AND "createdAt" >= NOW() - INTERVAL '30 days'
    GROUP BY payload->>'lesson_id'
  `;
  ```
- [ ] **outlier 감지 — 평균 ±2σ**:
  ```ts
  const accuracies = byLesson.filter(l => l.attempts > 0).map(l => l.avg_accuracy_pct);
  const mean = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
  const variance = accuracies.reduce((sum, x) => sum + (x - mean) ** 2, 0) / accuracies.length;
  const stddev = Math.sqrt(variance);
  outliers.too_easy = byLesson.filter(l => l.avg_accuracy_pct > mean + 2 * stddev).map(l => l.lesson_id);
  outliers.too_hard = byLesson.filter(l => l.avg_accuracy_pct < mean - 2 * stddev).map(l => l.lesson_id);
  ```
- [ ] **Lesson 메타 join** — title 표시 위해 Lesson 테이블 조회
- [ ] **시도 0건 lesson 처리** — `attempts: 0, avg_accuracy_pct: null` 으로 응답 (outlier 계산 제외)
- [ ] **응답 헤더**: `Cache-Control: private, max-age=600` (10분 캐시)
- [ ] **응답 시간 목표**: p95 ≤ 500ms (집계 쿼리 + outlier 계산)
- [ ] **인덱스 활용**: EventLog 의 `(event, createdAt)` 복합 인덱스
- [ ] **PII 보호**: 개별 사용자 식별자 미노출. 카운트만
- [ ] **OpenAPI 명세 갱신**

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: ADMIN 정상 응답
- **Given**: ADMIN 사용자 + EventLog 30일 누적 1000건 (`ox.submitted`)
- **When**: `GET /api/kpi/ox-accuracy`
- **Then**: 200 + overall + by_lesson 10건 + outliers 정상 응답

### Scenario 2: non-ADMIN 차단
- **Given**: LEARNER 또는 TEACHER 사용자
- **When**: 호출
- **Then**: 403 + `FORBIDDEN`

### Scenario 3: 미인증 — 401
- **Given**: 세션 없음
- **When**: 호출
- **Then**: 401 + `UNAUTHORIZED`

### Scenario 4: 전체 평균 계산 정확
- **Given**: lesson A 시도 100건 정답 60건, lesson B 시도 100건 정답 80건
- **When**: 호출
- **Then**: overall.avg_accuracy_pct = 70 (시도 가중 평균)

### Scenario 5: outlier 감지 — too_easy / too_hard
- **Given**: 평균 60%, σ 10% + lesson X 시도 평균 85%, lesson Y 25%
- **When**: 호출
- **Then**: outliers.too_easy = ['X'] (60+20=80 초과). too_hard = ['Y'] (60-20=40 미만)

### Scenario 6: 시도 0건 lesson — null 처리
- **Given**: 신규 lesson L010 (시도 0건)
- **When**: 호출
- **Then**: by_lesson 에 L010 포함 + `attempts: 0, avg_accuracy_pct: null`. outlier 계산에서 제외

### Scenario 7: 멱등 변환 카운트 제외
- **Given**: `ox.submitted` 100건 + `ox.duplicate_idempotent` 99건
- **When**: 카운트
- **Then**: total_attempts: 100 (멱등 변환 99 미포함)

### Scenario 8: 응답 시간 (REQ-NF-028)
- **Given**: EventLog 100K 건
- **When**: 호출
- **Then**: p95 ≤ 500ms (인덱스 활용)

### Scenario 9: Cache 정책
- **Given**: 응답
- **When**: 헤더 검사
- **Then**: `Cache-Control: private, max-age=600`

### Scenario 10: PII 부재
- **Given**: 응답
- **When**: payload 검사
- **Then**: 개별 user_id 미포함. lesson_id + 카운트만

## :gear: Technical & Non-Functional Constraints
- **평균 계산 방식**: 시도 가중 평균 (사용자별 평균 → lesson 평균이 아닌 단순 시도 평균). 일관성 정합
- **멱등 변환 제외**: `ox.duplicate_idempotent` 는 Option A 트리거 측정용. 콘텐츠 품질 지표에서는 제외
- **outlier 임계치**: ±2σ (정규분포 가정 시 약 5% 이탈). 콘텐츠 개수가 적을 때 (< 10편) outlier 의미 약함 — 응답에 sample_size 포함 검토
- **시도 0건 lesson**: outlier 계산에서 제외 (분모 0 방지). 응답에는 표시
- **PII 미노출**: 개별 사용자 카운트 금지. lesson 단위만
- **Cache**: 10분 (KPI 는 실시간 정확성보다 안정성 우선)
- **응답 시간**: ≤ 500ms (인덱스 + 집계 쿼리 최적화)
- **인덱스**: EventLog `(event, createdAt)` + `(event, payload)` JsonB GIN 인덱스 검토
- **금지**:
  - 개별 사용자 정답률 노출 (PII)
  - 멱등 변환 카운트 포함 (정확성 위반)
  - LEARNER·TEACHER 접근 허용 (운영 데이터)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] ADMIN 가드
- [ ] outlier 감지 동작 검증
- [ ] 시도 0건 lesson 처리 검증
- [ ] 멱등 변환 카운트 제외 검증
- [ ] 응답 시간 p95 ≤ 500ms 측정
- [ ] OpenAPI 명세 업데이트
- [ ] PR 본문에 "콘텐츠 품질 모니터링 + 난이도 outlier 자동 감지" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-009 (EventLog 모델)
  - CT-DB-003 (Lesson 모델 — title)
  - FR-AUTH-002 (RBAC 가드)
  - CT-API-001 (공통 응답 포맷)
  - FW-OX-003 (EventLog 발행 — 본 KPI 의 데이터 진입점)
- **Blocks**:
  - 콘텐츠 편집 SOP (난이도 조정 트리거)
  - REQ-NF-029 (콘텐츠 품질 지표) 검증
- **Related**:
  - SRS §1.5.1.1 Option A 이전 트리거 (별도 카운터)
