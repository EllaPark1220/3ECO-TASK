# [Feature] FR-EXP-003: EXP-3 단편 세션 vs 전체 lesson — 완주율 비교 + 격차 ≤2pp

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-EXP-003: GET /api/experiments/exp-3 — 단편 세션 (<8분) vs 전체 lesson 완주율 + 격차 ≤2pp 시 단편 세션 정착 검증"
labels: 'feature, backend, experiment, kpi, query, priority:high, mvp-in, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-EXP-003] EXP-3 (단편 세션 분할) 분석 — control (전체 lesson 1편 평균 12분) vs treatment (단편 세션 8분 미만) 완주율 비교 + 격차 ≤2pp 면 단편 세션 정착 + 페르소나 SH-07 (오세은 — 시간 제한) 의 데이터 기반 정합 검증
- **목적**: 페르소나 SH-07 오세은 (출퇴근 학습) 의 단편 세션 가설 검증. 가설: 단편 세션 완주율이 전체 lesson 대비 ≤2pp 격차면 단편 세션이 시간 제한 사용자에게 효용 + 콘텐츠 깊이 손상 부재 → 본 사이트의 학습 진입 장벽 추가 낮춤. 격차 클 시 단편 세션 정책 재검토.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.8` — REQ-FUNC-042 (EXP-3)
  - `/docs/SRS_V0_9.md#1.4` — 페르소나 SH-07 오세은
  - `/docs/SRS_V0_9.md#6.2.2` — EVENT_LOG (`session.short_completed`, `lesson.completed`)
- 페르소나: SH-07 오세은 (시간 제한·출퇴근)
- 선행: FW-EXP-001 (분배), CT-DB-009 (EventLog), FR-AUTH-002 (RBAC), FR-EXP-001~002 (패턴), FR-KPI-012 (사촌 KPI)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/experiments/exp-3/route.ts` Route Handler
- [ ] **`requireRole('ADMIN')` 가드**
- [ ] **응답 DTO**:
  ```ts
  export interface Exp3Response {
    sample_size: { control: number; treatment: number; total: number };
    minimum_sample_size: 200;
    sample_size_achieved: boolean;
    completion_rate: {
      control: { completed: number; started: number; rate: number };  // 전체 lesson 완주율
      treatment: { completed: number; started: number; rate: number };  // 단편 세션 완주율
      diff_pp: number;  // |control - treatment|
    };
    target_max_diff_pp: 2;
    target_achieved: boolean;  // 격차 ≤ 2pp
    avg_session_duration: {
      control_minutes: number;   // 평균 시청 시간
      treatment_minutes: number;
    };
    interpretation: string;
    period: { from: string; to: string };
  }
  ```
- [ ] **단편 세션 정의 (8분 미만)**:
  - lesson.viewed 이벤트의 payload 에 `total_view_seconds` 컬럼 (또는 `lesson.completed` 이벤트의 메타)
  - 본 EXP 의 단편 세션 — `total_view_seconds < 480` (8분)
  - 단편 세션 완주 — viewed 가 `total_view_seconds < 480` 이면서 `passed=true`
- [ ] **데이터 쿼리**:
  ```ts
  const data = await prisma.$queryRaw<Array<{
    user_id: string;
    variant: 'control' | 'treatment';
    started: bigint;
    completed: bigint;
    avg_duration_sec: number;
  }>>`
    WITH assigned AS (
      SELECT "userId", payload->>'variant' AS variant
      FROM "EventLog"
      WHERE event = 'exp.assigned' AND payload->>'exp_id' = 'EXP-3'
    ),
    sessions AS (
      SELECT
        e."userId",
        COUNT(*) AS started,
        SUM(CASE WHEN e.payload->>'passed' = 'true' THEN 1 ELSE 0 END) AS completed,
        AVG((e.payload->>'duration_sec')::int) AS avg_duration_sec
      FROM "EventLog" e
      WHERE e.event = 'lesson.viewed'
        AND e."userId" IS NOT NULL
      GROUP BY e."userId"
    )
    SELECT
      a."userId" AS user_id,
      a.variant,
      COALESCE(s.started, 0) AS started,
      COALESCE(s.completed, 0) AS completed,
      COALESCE(s.avg_duration_sec, 0) AS avg_duration_sec
    FROM assigned a
    LEFT JOIN sessions s ON s."userId" = a."userId"
  `;

  // variant 별 합산
  const aggregateByVariant = (variant: 'control' | 'treatment') => {
    const filtered = data.filter(d => d.variant === variant);
    const totalStarted = filtered.reduce((sum, d) => sum + Number(d.started), 0);
    const totalCompleted = filtered.reduce((sum, d) => sum + Number(d.completed), 0);
    const avgDuration = filtered.length > 0
      ? filtered.reduce((sum, d) => sum + d.avg_duration_sec, 0) / filtered.length
      : 0;
    return {
      sample_size: filtered.length,
      started: totalStarted,
      completed: totalCompleted,
      rate: totalStarted > 0 ? (totalCompleted / totalStarted) * 100 : 0,
      avg_minutes: avgDuration / 60,
    };
  };
  ```
- [ ] **격차 계산 + target_achieved**:
  ```ts
  const controlAgg = aggregateByVariant('control');
  const treatmentAgg = aggregateByVariant('treatment');
  const diffPp = Math.abs(controlAgg.rate - treatmentAgg.rate);
  const targetAchieved = diffPp <= 2;
  ```
- [ ] **interpretation**:
  ```ts
  function interpret(diffPp: number, sampleAchieved: boolean): string {
    if (!sampleAchieved) return `샘플 부족 (n < 200). 추가 데이터 필요.`;
    if (diffPp <= 2) return `✅ 단편 세션 정착. 격차 ${diffPp.toFixed(1)}pp ≤ 2pp. 시간 제한 사용자에게 효용.`;
    if (diffPp <= 5) return `⚠️ 격차 ${diffPp.toFixed(1)}pp. 단편 세션 약간 손상 가능성. 콘텐츠 분할 정책 검토.`;
    return `🚨 격차 ${diffPp.toFixed(1)}pp 큼. 단편 세션 정책 재검토 필요.`;
  }
  ```
- [ ] **avg_session_duration 노출** — 운영 인사이트:
  - control 평균 시청 시간 (보통 12분)
  - treatment 평균 시청 시간 (보통 6~8분)
  - 차이가 명확하면 단편 세션 정책 적용 정상
- [ ] **응답 헤더**: `Cache-Control: private, max-age=600`
- [ ] **응답 시간**: p95 ≤ 800ms
- [ ] **PII 보호**: 카운트·비율만
- [ ] **샘플 부족 graceful**

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: ADMIN 정상 응답
- **Given**: ADMIN + EXP-3 분배 400명 + 데이터
- **When**: 호출
- **Then**: 200 + 모든 필드 정상

### Scenario 2: 가설 충족 — 격차 ≤ 2pp
- **Given**: control 60%, treatment 59%
- **When**: 호출
- **Then**: target_achieved: true + interpretation 에 ✅

### Scenario 3: 격차 작음 (≤5pp)
- **Given**: control 60%, treatment 56%
- **When**: 호출
- **Then**: interpretation 에 ⚠️

### Scenario 4: 격차 큼 (>5pp)
- **Given**: control 60%, treatment 50%
- **When**: 호출
- **Then**: interpretation 에 🚨

### Scenario 5: 샘플 부족
- **Given**: n<200
- **When**: 호출
- **Then**: sample_size_achieved: false

### Scenario 6: avg_duration 노출
- **Given**: control 평균 12분, treatment 평균 7분
- **When**: 호출
- **Then**: avg_session_duration 정확

### Scenario 7: 시작 0건 — graceful
- **Given**: started: 0
- **When**: 호출
- **Then**: rate: 0. 에러 0

### Scenario 8: non-ADMIN — 403
- **Given**: LEARNER
- **When**: 호출
- **Then**: 403

### Scenario 9: PII 미노출
- **Given**: 응답
- **When**: 검사
- **Then**: 개별 user_id 0

### Scenario 10: 응답 시간
- **Given**: EventLog 50K
- **When**: 호출
- **Then**: p95 ≤ 800ms

## :gear: Technical & Non-Functional Constraints
- **단편 세션 정의 — 8분 (480초) 미만**: payload 에 duration_sec 컬럼 의존
- **격차 ≤ 2pp 임계**: 통계적 유의성보다 절대 격차 우선 (운영 의사결정 단순화)
- **3 단계 임계 (≤2 / ≤5 / >5)**: ✅·⚠️·🚨
- **avg_duration 노출**: 운영 인사이트 (분할 정책 정상 동작 확인)
- **PII 보호**
- **응답 시간 ≤ 800ms**
- **샘플 200 — 단일 lesson 단위 분석에 충분**
- **금지**:
  - 단편 세션 정의 임의 변경 (480초 표준)
  - 격차 임계 변경 (정책 일관성)
  - 사용자 식별자 노출

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] 단편 세션 정의 (480초) 일관 적용
- [ ] 3 단계 imterpretation
- [ ] avg_duration 노출
- [ ] 응답 시간 측정
- [ ] OpenAPI 명세 추가
- [ ] PR 본문에 "페르소나 SH-07 오세은 가설 검증" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-EXP-001 (분배)
  - CT-DB-009 (EventLog — lesson.viewed payload 의 duration_sec)
  - FR-AUTH-002 (RBAC)
  - FR-LES-003 (lesson.viewed 발행 — duration_sec 포함)
- **Blocks**:
  - 단편 세션 정책 의사결정
  - 페르소나 SH-07 의 사용 패턴 검증
- **Related**:
  - FR-KPI-012 (단편 세션 KPI 사촌)
