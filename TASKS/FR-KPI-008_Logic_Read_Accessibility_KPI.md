# [Feature] FR-KPI-008: 접근성 체크리스트 100% KPI — axe CI 빌드별 + Stage 0 Exit 게이트

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-KPI-008: GET /api/kpi/accessibility — 접근성 체크리스트 충족률 100% + axe-core CI 빌드별 결과 + Stage 0 Exit 자동 검증"
labels: 'feature, backend, kpi, a11y, query, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-KPI-008] axe-core 자동 검증 결과 KPI — 매 빌드 (CI Job) 의 접근성 체크리스트 충족률 + 위반 카테고리 분포 + Stage 0 Exit (NF-A11Y-001) 게이트 충족 자동 검증
- **목적**: REQ-NF-040 (접근성 100%) + Stage 0 Exit 의 데이터 진입. 단일 제작자가 매 PR 마다 수동 a11y 검증할 수 없음 — axe CI 결과를 EventLog 또는 별도 모델 (BuildResult) 에 저장 → KPI 응답으로 운영자 인지. 페르소나 SH-04·SH-08 의 정책 강제.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-040, NF-A11Y-001 (Stage 0 Exit 100%)
  - `/docs/SRS_V0_9.md#1.2.5` — Stage 0 Exit 정의
  - `/docs/SRS_V0_9.md#6.2.2` — EVENT_LOG (`build.a11y_checked`)
- 외부: `https://github.com/dequelabs/axe-core`
- 페르소나: SH-04 한정숙, SH-08 김성호
- 선행: TS-A11Y-001 (axe-core 통합, 발행됨), CT-DB-009 (EventLog), FR-AUTH-002 (RBAC), IF-CI-001

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/kpi/accessibility/route.ts` Route Handler
- [ ] **`requireRole('ADMIN')` 가드**
- [ ] **응답 DTO**:
  ```ts
  export interface AccessibilityKpiResponse {
    latest_build: {
      build_id: string;
      checked_at: string;
      total_rules_checked: number;
      passed: number;
      violations: number;
      compliance_pct: number;        // (passed / total) * 100
      target: 100;                   // NF-A11Y-001
      target_achieved: boolean;       // compliance_pct === 100
    };
    violations_by_category: Array<{
      impact: 'critical' | 'serious' | 'moderate' | 'minor';
      count: number;
      rule_ids: string[];            // axe rule id (예: 'color-contrast', 'aria-label')
    }>;
    trend_30d: Array<{
      date: string;                   // YYYY-MM-DD
      compliance_pct: number;
      build_count: number;
    }>;
    stage0_exit_status: {
      criteria: 'NF-A11Y-001';
      target: 100;
      consecutive_passes_required: 7;  // 연속 7일 100%
      consecutive_passes_current: number;
      gate_achieved: boolean;
    };
    period: { from: string; to: string };
  }
  ```
- [ ] **EventLog 활용 — `build.a11y_checked`**:
  - CI 가 axe-core 실행 후 결과를 EventLog 또는 API 로 발행
  - 또는 별도 모델 `BuildA11yResult` (선택 — 단순 EventLog 충분)
  - payload: `{ build_id, total_rules, passed, violations, by_impact: {...} }`
- [ ] **CI 측 EventLog 발행 함수 — `scripts/report-a11y-result.ts`**:
  ```ts
  // CI 후 axe 결과를 본 사이트의 API 로 POST
  // 또는 직접 DB 접근 (CI Service Role)
  export async function reportA11yResult(result: {
    buildId: string;
    totalRules: number;
    passed: number;
    violations: Array<{ id: string; impact: string }>;
  }) {
    await prisma.eventLog.create({
      data: {
        event: 'build.a11y_checked',
        payload: result,
      },
    });
  }
  ```
- [ ] **latest_build 쿼리**:
  ```ts
  const latest = await prisma.eventLog.findFirst({
    where: { event: 'build.a11y_checked' },
    orderBy: { createdAt: 'desc' },
  });
  ```
- [ ] **trend_30d 시계열**:
  ```ts
  const trend = await prisma.$queryRaw<Array<{ date: string; avg_compliance: number; build_count: bigint }>>`
    SELECT
      DATE("createdAt") AS date,
      AVG(((payload->>'passed')::float / (payload->>'total_rules')::float) * 100) AS avg_compliance,
      COUNT(*)::bigint AS build_count
    FROM "EventLog"
    WHERE event = 'build.a11y_checked'
      AND "createdAt" >= NOW() - INTERVAL '30 days'
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `;
  ```
- [ ] **Stage 0 Exit Gate — 연속 7일 100%**:
  ```ts
  // 최근 7일 모든 build 의 compliance_pct === 100 확인
  const recent7d = await prisma.eventLog.findMany({
    where: {
      event: 'build.a11y_checked',
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });
  const all100 = recent7d.every(e => {
    const passed = (e.payload as any).passed;
    const total = (e.payload as any).total_rules;
    return total > 0 && passed === total;
  });
  ```
- [ ] **violations_by_category 분포**:
  - axe rule 의 impact (critical/serious/moderate/minor) 별 카운트
  - rule_ids 배열 — 운영자가 즉시 수정할 우선순위 인지
- [ ] **응답 헤더**: `Cache-Control: private, max-age=300` (5분 — 매 빌드 갱신)
- [ ] **응답 시간**: p95 ≤ 500ms
- [ ] **PII 부재**: 빌드 메타만

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: ADMIN 정상 응답
- **Given**: ADMIN + EventLog 빌드 결과
- **When**: 호출
- **Then**: 200 + 모든 필드 정상

### Scenario 2: 100% 충족
- **Given**: 최근 빌드 violations 0
- **When**: 호출
- **Then**: target_achieved: true, compliance_pct: 100

### Scenario 3: 일부 위반
- **Given**: 100 룰 중 95 통과
- **When**: 호출
- **Then**: compliance_pct: 95, target_achieved: false

### Scenario 4: violations 카테고리 분리
- **Given**: critical 2건, serious 3건
- **When**: 호출
- **Then**: violations_by_category 배열에 critical/serious 분리

### Scenario 5: Stage 0 Exit Gate — 연속 7일 100%
- **Given**: 최근 7일 모든 빌드 100%
- **When**: 호출
- **Then**: gate_achieved: true, consecutive_passes_current: 7+

### Scenario 6: Gate 미달성 — 일부 미충족
- **Given**: 최근 7일 중 1일 99%
- **When**: 호출
- **Then**: gate_achieved: false

### Scenario 7: 빌드 0건 — graceful
- **Given**: EventLog `build.a11y_checked` 0건
- **When**: 호출
- **Then**: latest_build null + graceful 응답

### Scenario 8: trend 시계열 빈 날짜 — 0 표시
- **Given**: 일부 날짜 빌드 0
- **When**: 호출
- **Then**: trend_30d 30개 + 빈 날짜는 build_count: 0

### Scenario 9: non-ADMIN — 403
- **Given**: LEARNER
- **When**: 호출
- **Then**: 403

### Scenario 10: 응답 시간
- **Given**: EventLog 10K건
- **When**: 호출
- **Then**: p95 ≤ 500ms

## :gear: Technical & Non-Functional Constraints
- **EventLog `build.a11y_checked` 기반**: CI 발행
- **연속 7일 100% — Stage 0 Exit 게이트**: 단일 빌드 충족 외 안정성 검증
- **violations_by_category — impact 별 분리**: critical/serious 우선순위
- **rule_ids 배열 — 즉시 수정 가이드**: 운영자가 axe rule id 로 직접 수정
- **Cache 5분 — 자주 갱신**: 매 빌드 후 즉시 인지
- **PII 부재**: 빌드 메타만
- **응답 시간 ≤ 500ms**: 최근 30일 집계
- **금지**:
  - 단일 빌드 100% 만으로 Gate 인정 (안정성 부족)
  - PII 또는 빌드 환경 secret 노출
  - LEARNER 접근

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] reportA11yResult() CI 연동 함수
- [ ] Stage 0 Exit Gate (연속 7일 100%) 검증
- [ ] violations_by_category 분리
- [ ] trend_30d 시계열
- [ ] 응답 시간 측정
- [ ] OpenAPI 명세 추가
- [ ] PR 본문에 "Stage 0 Exit 게이트 자동 검증 + axe CI 통합" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - TS-A11Y-001 (axe-core 통합, 발행됨)
  - CT-DB-009 (EventLog)
  - FR-AUTH-002 (RBAC)
  - IF-CI-001 (워크플로 — reportA11yResult 호출)
- **Blocks**:
  - Stage 0 Exit (NF-A11Y-001) 자동 검증
  - 페르소나 SH-04·SH-08 정합 보장
- **Related**:
  - REQ-NF-040 (접근성 100%)
  - NF-A11Y-001~006 (그룹 12·13)
