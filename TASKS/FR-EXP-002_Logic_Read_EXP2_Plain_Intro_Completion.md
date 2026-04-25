# [Feature] FR-EXP-002: EXP-2 후킹 없는 도입부 vs 짧은 후킹 — n≥200 + 95% CI ≥55% 완시청률

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-EXP-002: GET /api/experiments/exp-2 — 후킹 없는 도입부 변형의 완시청률 ≥55% 95% CI + 이수민 보호 검증"
labels: 'feature, backend, experiment, kpi, query, priority:critical, mvp-in, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-EXP-002] EXP-2 (도입부 후킹 여부) 분석 — control (후킹 없는 차분한 도입부) vs treatment (짧은 후킹) 의 영상 완시청률 비교 + 95% 신뢰구간 + control 의 완시청률 ≥55% 충족 여부 + **이수민 보호 검증** (hooking-averse 태그 사용자가 treatment 노출 0)
- **목적**: PRD 의 핵심 가설 검증 — **"후킹 없이도 완시청 가능한가?"**. 가설: control 의 완시청률 ≥55% 면 후킹 없는 차분한 학습 운영 가능 입증. 본 EXP 가 가장 중요한 실험 — PRD 원칙 1 (이해 우선) 의 데이터 근거. **본 분석 + FW-EXP-001 의 이수민 보호 양쪽으로 정책 강제**.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.8` — REQ-FUNC-041 (EXP-2)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-05 (후킹 금지)
  - `/docs/SRS_V0_9.md#6.2.2` — EVENT_LOG (`exp.assigned`, `lesson.viewed_complete`)
- 페르소나: SH-02 이수민 (학습 회피 — 후킹 거부)
- 선행: FW-EXP-001 (분배 — 이수민 보호 활성), CT-DB-009 (EventLog), FR-AUTH-002 (RBAC), FR-EXP-001 (패턴)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/experiments/exp-2/route.ts` Route Handler
- [ ] **`requireRole('ADMIN')` 가드**
- [ ] **응답 DTO**:
  ```ts
  export interface Exp2Response {
    sample_size: { control: number; treatment: number; total: number };
    minimum_sample_size: 200;
    sample_size_achieved: boolean;
    completion_rate: {
      control: { completed: number; viewed: number; rate: number };  // 완시청 = 90% 이상 시청
      treatment: { completed: number; viewed: number; rate: number };
    };
    control_95_ci: { lower: number; upper: number };  // 95% 신뢰구간
    target: 55;  // PRD 가설
    target_achieved: boolean;  // control 의 95% CI 하한 ≥ 55%
    isumin_protection: {
      hooking_averse_users: number;
      treatment_exposure_count: number;  // 0 강제
      protection_intact: boolean;        // exposure_count === 0
    };
    interpretation: string;
    period: { from: string; to: string };
  }
  ```
- [ ] **완시청 정의 — 영상의 90% 이상 시청 (REQ-NF 정합)**:
  - EventLog `lesson.viewed_complete` 발행 시점 — 클라이언트 측 영상 90% 도달 시 (FR-LES-003 의 추적)
  - 본 EXP 는 **lesson 단위** 완시청 (사용자 단위 아님)
- [ ] **데이터 추출 — exp.assigned + lesson.viewed_complete 조인**:
  ```ts
  const data = await prisma.$queryRaw<Array<{
    user_id: string;
    variant: 'control' | 'treatment';
    viewed_count: bigint;
    completed_count: bigint;
  }>>`
    WITH assigned AS (
      SELECT "userId", payload->>'variant' AS variant
      FROM "EventLog"
      WHERE event = 'exp.assigned' AND payload->>'exp_id' = 'EXP-2'
    ),
    viewed AS (
      SELECT "userId", COUNT(DISTINCT payload->>'lesson_id') AS viewed_count
      FROM "EventLog"
      WHERE event = 'lesson.viewed' AND "userId" IS NOT NULL
      GROUP BY "userId"
    ),
    completed AS (
      SELECT "userId", COUNT(DISTINCT payload->>'lesson_id') AS completed_count
      FROM "EventLog"
      WHERE event = 'lesson.viewed_complete' AND "userId" IS NOT NULL
      GROUP BY "userId"
    )
    SELECT
      a."userId" AS user_id,
      a.variant,
      COALESCE(v.viewed_count, 0) AS viewed_count,
      COALESCE(c.completed_count, 0) AS completed_count
    FROM assigned a
    LEFT JOIN viewed v ON v."userId" = a."userId"
    LEFT JOIN completed c ON c."userId" = a."userId"
  `;
  ```
- [ ] **95% 신뢰구간 (Wilson score interval)**:
  ```ts
  // lib/stats/wilson-score.ts
  export function wilsonScoreInterval(successes: number, trials: number, z: number = 1.96): { lower: number; upper: number } {
    if (trials === 0) return { lower: 0, upper: 0 };
    const p = successes / trials;
    const denominator = 1 + (z * z) / trials;
    const center = (p + (z * z) / (2 * trials)) / denominator;
    const margin = (z * Math.sqrt(p * (1 - p) / trials + (z * z) / (4 * trials * trials))) / denominator;
    return {
      lower: Math.max(0, (center - margin) * 100),
      upper: Math.min(100, (center + margin) * 100),
    };
  }
  ```
- [ ] **이수민 보호 검증 — treatment 노출 0 강제**:
  ```ts
  // hooking-averse 태그 사용자가 treatment 변형에 노출됐는지 검증
  const hookingAverseExposure = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "EventLog" e
    JOIN "User" u ON u.id = e."userId"
    WHERE e.event = 'exp.assigned'
      AND e.payload->>'exp_id' = 'EXP-2'
      AND e.payload->>'variant' = 'treatment'
      AND 'hooking-averse' = ANY(u."personaTags")
  `;

  const protectionIntact = Number(hookingAverseExposure[0].count) === 0;
  ```
- [ ] **target_achieved 정의 — control 의 95% CI 하한 ≥ 55%**:
  - 단순 평균이 ≥55% 가 아닌 **통계적 보수 기준**
  - 95% CI 하한 ≥ 55% 면 진짜 가설 충족 (Wilson score 활용)
- [ ] **응답 해석**:
  ```ts
  function interpret(controlRate: number, controlCi: { lower: number; upper: number }, sampleAchieved: boolean, protectionIntact: boolean): string {
    if (!protectionIntact) return `🚨 이수민 보호 위반. hooking-averse 사용자가 treatment 노출됨. FW-EXP-001 검토 필요.`;
    if (!sampleAchieved) return `샘플 부족 (n < 200). 추가 데이터 필요.`;
    if (controlCi.lower >= 55) return `✅ PRD 가설 충족. 후킹 없는 도입부의 완시청률 95% CI [${controlCi.lower.toFixed(1)}, ${controlCi.upper.toFixed(1)}] ≥ 55%`;
    return `⚠️ PRD 가설 미충족. 95% CI 하한 ${controlCi.lower.toFixed(1)}% < 55%. 도입부 개선 검토 필요.`;
  }
  ```
- [ ] **응답 헤더**: `Cache-Control: private, max-age=600`
- [ ] **응답 시간**: p95 ≤ 1초 (다중 조인 + Wilson 계산)
- [ ] **PII 보호**

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: ADMIN 정상 응답
- **Given**: ADMIN + EXP-2 분배 400명
- **When**: 호출
- **Then**: 200 + 모든 필드 정상

### Scenario 2: 가설 충족 — 95% CI 하한 ≥ 55%
- **Given**: control 평균 65%, n=200
- **When**: 호출
- **Then**: target_achieved: true + interpretation 에 ✅

### Scenario 3: 가설 미충족
- **Given**: control 평균 50%
- **When**: 호출
- **Then**: target_achieved: false + interpretation 에 ⚠️

### Scenario 4: 이수민 보호 위반 — protection_intact: false
- **Given**: hooking-averse 사용자가 treatment 노출 (FW-EXP-001 버그 시나리오)
- **When**: 호출
- **Then**: protection_intact: false + interpretation 에 🚨

### Scenario 5: 이수민 보호 정상 — exposure 0
- **Given**: hooking-averse 사용자 30명 모두 control
- **When**: 호출
- **Then**: hooking_averse_users: 30, treatment_exposure_count: 0, protection_intact: true

### Scenario 6: 샘플 부족
- **Given**: n<200
- **When**: 호출
- **Then**: sample_size_achieved: false

### Scenario 7: Wilson 신뢰구간 정확성
- **Given**: 60/100
- **When**: wilsonScoreInterval(60, 100)
- **Then**: lower ~50, upper ~70 (정상 범위)

### Scenario 8: non-ADMIN — 403
- **Given**: LEARNER
- **When**: 호출
- **Then**: 403

### Scenario 9: 영상 0건 시 graceful
- **Given**: viewed_count: 0
- **When**: 호출
- **Then**: rate: 0. 에러 0

### Scenario 10: 응답 시간
- **Given**: EventLog 50K건
- **When**: 호출
- **Then**: p95 ≤ 1초

## :gear: Technical & Non-Functional Constraints
- **Wilson score 95% CI**: 단순 평균 비교 아닌 통계적 보수 기준
- **이수민 보호 자동 검증 — exposure_count === 0**: 0 아니면 즉시 알림
- **완시청 정의 — 90% 이상**: lesson.viewed_complete 이벤트
- **n≥200**: 단일 lesson 단위 분석에 충분
- **PII 보호**: 카운트·비율만
- **Cache 10분**
- **응답 시간 ≤ 1초**
- **interpretation 한국어 + 시그널 (✅·⚠️·🚨)**: 운영자 즉시 인지
- **금지**:
  - 단순 평균만 비교 (CI 무시 시 false positive)
  - 이수민 보호 위반 검증 누락 (PRD 위반 못 잡음)
  - hooking-averse exposure 허용 (CON-05 위반)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] Wilson score 함수
- [ ] 이수민 보호 자동 검증
- [ ] target_achieved (95% CI 하한 ≥ 55%) 검증
- [ ] interpretation 한국어 (✅·⚠️·🚨)
- [ ] 응답 시간 측정
- [ ] OpenAPI 명세 추가
- [ ] PR 본문에 "PRD 핵심 가설 검증 + 이수민 보호 자동 점검" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-EXP-001 (분배 + 이수민 보호)
  - CT-DB-009 (EventLog — lesson.viewed_complete)
  - FR-AUTH-002 (RBAC)
  - FR-LES-003 (lesson.viewed_complete 이벤트 발행)
- **Blocks**:
  - PRD 핵심 가설 (후킹 없이 완시청) 검증
  - 도입부 정책 의사결정
- **Related**:
  - CON-05 (후킹 금지)
  - 페르소나 SH-02 이수민
