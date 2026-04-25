# [Feature] FR-EXP-001: EXP-1 스탬프맵 노출 vs 숨김 — n≥500 카이제곱 + 완주율 비교

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-EXP-001: GET /api/experiments/exp-1 — 스탬프맵 노출 vs 숨김 + n≥500 + α=0.05 + Power 0.8 + 카이제곱 + 완주율 비교"
labels: 'feature, backend, experiment, kpi, query, priority:high, mvp-in, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-EXP-001] EXP-1 (스탬프맵 노출 여부) 분석 — control (스탬프맵 노출) vs treatment (스탬프맵 숨김) 의 lesson 완주율 + Stamp 획득률 비교 + 카이제곱 검정 (α=0.05, Power 0.8) + n≥500 도달 여부
- **목적**: PRD 원칙 1 (이해 우선) 검증 — **스탬프맵 (게임화 요소) 이 학습 깊이에 영향을 주는가?** 가설: 스탬프맵 숨김도 완주율 차이 5pp 이내면 게임화 의존성 부재 입증 → 본 사이트 정신 ("게임화 없는 학습") 정합. 본 분석은 ADMIN 의 의사결정 근거 — 스탬프맵 영구 유지 vs 변경 검토.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.8` — REQ-FUNC-040 (EXP-1)
  - `/docs/SRS_V0_9.md#1.2` — 5대 원칙 (게임화 없는 차분한 학습)
  - `/docs/SRS_V0_9.md#6.2.2` — EVENT_LOG (`exp.assigned`, `lesson.completed`)
- 외부: 카이제곱 검정 (chi-square test of independence)
- 페르소나: SH-01 박지훈 (체계감 vs 차분함 검증)
- 선행: FW-EXP-001 (분배), CT-DB-009 (EventLog), FR-AUTH-002 (RBAC), FR-KPI-002 (완주율 패턴)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/experiments/exp-1/route.ts` Route Handler
- [ ] **`requireRole('ADMIN')` 가드** — non-ADMIN 403
- [ ] **응답 DTO**:
  ```ts
  export interface Exp1Response {
    sample_size: { control: number; treatment: number; total: number };
    minimum_sample_size: 500;
    sample_size_achieved: boolean;
    completion_rate: {
      control: { completed: number; total: number; rate: number };
      treatment: { completed: number; total: number; rate: number };
      diff_pp: number;  // 백분점 차이
    };
    stamp_acquisition_rate: {
      control: { earned: number; total: number; rate: number };
      treatment: { earned: number; total: number; rate: number };
      diff_pp: number;
    };
    chi_square: {
      statistic: number;
      p_value: number;
      degrees_of_freedom: 1;
      alpha: 0.05;
      significant: boolean;  // p < 0.05
    };
    interpretation: string;  // 한국어 해석
    period: { from: string; to: string };
  }
  ```
- [ ] **데이터 추출 — exp.assigned + lesson.completed 조인**:
  ```ts
  const assigned = await prisma.$queryRaw<Array<{
    user_id: string;
    variant: 'control' | 'treatment';
  }>>`
    SELECT
      "userId" AS user_id,
      payload->>'variant' AS variant
    FROM "EventLog"
    WHERE event = 'exp.assigned'
      AND payload->>'exp_id' = 'EXP-1'
      AND "userId" IS NOT NULL
  `;

  // 각 user 의 완주 lesson 카운트
  const completionByUser = await prisma.$queryRaw<Array<{
    user_id: string;
    completed_count: bigint;
  }>>`
    SELECT
      "userId" AS user_id,
      COUNT(DISTINCT payload->>'lesson_id') AS completed_count
    FROM "EventLog"
    WHERE event = 'stamp.earned'
      AND "userId" IS NOT NULL
    GROUP BY "userId"
  `;
  ```
- [ ] **카이제곱 검정 함수 — `lib/stats/chi-square.ts`**:
  ```ts
  /**
   * 2x2 카이제곱 검정 (independence)
   * matrix: [[control_completed, control_not_completed], [treatment_completed, treatment_not_completed]]
   */
  export function chiSquareTest(matrix: number[][]): { statistic: number; pValue: number } {
    const rowSums = matrix.map(row => row.reduce((a, b) => a + b, 0));
    const colSums = matrix[0].map((_, j) => matrix.reduce((sum, row) => sum + row[j], 0));
    const total = rowSums.reduce((a, b) => a + b, 0);

    let statistic = 0;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const expected = (rowSums[i] * colSums[j]) / total;
        if (expected > 0) {
          statistic += Math.pow(matrix[i][j] - expected, 2) / expected;
        }
      }
    }

    // df=1 의 p-value (간이 — 표 활용 또는 외부 라이브러리)
    // 본 구현은 결정적 활용 위해 jstat 또는 simple-statistics 라이브러리 권장
    // npm install simple-statistics
    const pValue = approximatePValue(statistic, 1);
    return { statistic, pValue };
  }
  ```
  - npm install simple-statistics (또는 자체 구현)
- [ ] **완주 정의 — Stamp 보유 lesson 수 / 시드된 lesson 수**:
  - **본 EXP-1 의 "완주"** = lesson 의 OX 통과 (Stamp 획득) 한 user 비율
  - 단일 lesson 단위 vs 사용자 단위 — 본 태스크는 **사용자 단위** (한 user 가 가진 stamp 가 시드된 전체 lesson 의 ≥80% 면 완주)
  - 단일 lesson 단위 분석은 별도 후속 (granular)
- [ ] **응답 해석 (interpretation) 한국어**:
  ```ts
  function interpretResult(diffPp: number, pValue: number, sampleAchieved: boolean): string {
    if (!sampleAchieved) return `샘플 부족 (n < 500). 추가 데이터 누적 필요.`;
    if (pValue >= 0.05) return `통계적 유의성 부재 (p=${pValue.toFixed(3)}). 스탬프맵 영향 미미.`;
    if (Math.abs(diffPp) <= 5) return `유의하나 차이 작음 (Δ=${diffPp.toFixed(1)}pp). 게임화 의존성 약함.`;
    return diffPp > 0
      ? `스탬프맵 노출이 완주율 +${diffPp.toFixed(1)}pp 향상. 게임화 의존성 일부 시그널.`
      : `스탬프맵 숨김이 완주율 +${(-diffPp).toFixed(1)}pp 향상. 차분한 학습 우위.`;
  }
  ```
- [ ] **응답 헤더**: `Cache-Control: private, max-age=600` (10분 캐시)
- [ ] **응답 시간 목표**: p95 ≤ 800ms (다중 EventLog 조회 + 통계 계산)
- [ ] **PII 보호**: 개별 user_id 미노출. 카운트·비율만
- [ ] **샘플 부족 시 graceful**: n<500 시 sample_size_achieved=false, interpretation 에 "추가 데이터 필요"

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: ADMIN 정상 응답
- **Given**: ADMIN + EXP-1 분배 1000명 (500/500) + 완주 데이터
- **When**: `GET /api/experiments/exp-1`
- **Then**: 200 + 모든 필드 정상

### Scenario 2: 샘플 부족 — sample_size_achieved=false
- **Given**: 분배 100명 (500 미만)
- **When**: 호출
- **Then**: sample_size_achieved: false + interpretation: "샘플 부족"

### Scenario 3: 통계적 유의성 부재 (p≥0.05)
- **Given**: 차이 미미한 데이터
- **When**: 호출
- **Then**: chi_square.significant: false

### Scenario 4: 유의하나 차이 작음 (≤5pp)
- **Given**: p<0.05, |diff|=3pp
- **When**: 호출
- **Then**: interpretation: "차이 작음. 게임화 의존성 약함"

### Scenario 5: control 우위
- **Given**: control 70%, treatment 60% 완주율
- **When**: 호출
- **Then**: diff_pp: 10. interpretation 에 "스탬프맵 노출 우위"

### Scenario 6: treatment 우위
- **Given**: control 60%, treatment 70%
- **When**: 호출
- **Then**: diff_pp: -10. interpretation 에 "차분한 학습 우위"

### Scenario 7: 카이제곱 통계량 정확
- **Given**: 알려진 matrix
- **When**: chiSquareTest 호출
- **Then**: statistic 정확 + pValue < 0.05 (분명한 차이)

### Scenario 8: non-ADMIN — 403
- **Given**: LEARNER
- **When**: 호출
- **Then**: 403

### Scenario 9: PII 미노출
- **Given**: 응답
- **When**: payload 검사
- **Then**: 개별 user_id 0건. 카운트·비율만

### Scenario 10: 응답 시간
- **Given**: EventLog 100K건
- **When**: 호출
- **Then**: p95 ≤ 800ms

## :gear: Technical & Non-Functional Constraints
- **2x2 카이제곱**: simple-statistics 또는 jstat
- **n≥500, α=0.05, Power 0.8**: 통계적 유의성 강제
- **사용자 단위 완주 (≥80% lesson stamp)**: granular 단위는 별도 후속
- **이수민 보호 자동 (FW-EXP-001 정합)**: hooking-averse 태그는 EXP-2 영향, EXP-1 은 무관
- **PII 보호**: 카운트·비율만
- **Cache 10분**: 안정성
- **응답 시간 ≤ 800ms**: 다중 조인 + 통계
- **graceful 샘플 부족**: n<500 시 분석 실행은 하되 interpretation 으로 안내
- **interpretation 한국어**: 운영자 의사결정 즉시 가능
- **금지**:
  - 사용자 식별자 노출
  - 비결정적 통계 (랜덤화 — 본 데이터는 결정적)
  - 샘플 부족 시 강제 통계 발표 (false positive 위험)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] ADMIN 가드
- [ ] 카이제곱 함수 (simple-statistics 또는 자체)
- [ ] 사용자 단위 완주 정의 (≥80%)
- [ ] interpretation 한국어
- [ ] 응답 시간 ≤ 800ms 측정
- [ ] PII 부재 검증
- [ ] OpenAPI 명세 추가
- [ ] PR 본문에 "PRD 원칙 1 검증. 게임화 의존성 데이터 기반 의사결정" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-EXP-001 (분배 — 본 데이터 진입)
  - CT-DB-009 (EventLog)
  - FR-AUTH-002 (RBAC)
  - FR-KPI-002 (완주율 패턴 — 사용자 단위 완주 정의 활용)
  - npm install simple-statistics (또는 자체 구현)
- **Blocks**:
  - 스탬프맵 영구 유지 vs 변경 의사결정
  - 5대 원칙 (게임화 없는 학습) 데이터 기반 검증
- **Related**:
  - 페르소나 SH-01 박지훈
  - REQ-NF-029 (콘텐츠 품질)
