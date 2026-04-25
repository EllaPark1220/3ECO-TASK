# [NF] NF-RISK-003: R6 접근성 미충족 — Stage 0 Exit 100% 게이트 부재 시 Alpha 차단

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-RISK-003: R6 접근성 미충족 리스크 — Stage 0 Exit 접근성 100% 게이트 (NF-A11Y-001 재사용 + 부재 시 Alpha Exit 차단)"
labels: 'nf, risk, accessibility, gate, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-RISK-003] R6 접근성 미충족 리스크 완화 — Alpha Exit 강제 차단
- **목적**: §6.6 R6 (접근성 체크리스트 미달 시 사용자 이탈 리스크) 를 **운영 정책** 수준에서 완화. NF-A11Y-001 이 기술적 게이트(axe·Lighthouse·NVDA)를 제공하지만, R6은 **해당 게이트가 실행되지 않는 상황 자체를 방지**하는 운영 정책. 게이트 누락·우회·지연을 감지하고 Alpha Exit 를 차단하는 안전장치.

> **NF-A11Y-001 과의 차이점**: NF-A11Y-001 = 접근성 "기술 게이트" (axe + Lighthouse + NVDA 검증). NF-RISK-003 = 해당 게이트가 **실행·강제되는지** 감시하는 "운영 정책 + 에스컬레이션".

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS: `/docs/SRS_V0_9.md#6.6` — R6 (접근성 미충족)
- SRS: `/docs/SRS_V0_9.md#1.2.5` — Stage 0 Exit Criteria
- 선행: NF-A11Y-001 (접근성 기술 게이트)
- 관련: IF-CI-002 (axe + Lighthouse CI Job)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Alpha Exit Checklist 공식화** — `docs/ops/alpha-exit-checklist.md`:
  ```markdown
  ## Alpha Exit Criteria — 접근성 항목 (R6 강제)
  
  | # | 항목 | 검증 방법 | 통과 기준 | 담당 |
  |---|---|---|---|---|
  | 1 | axe-core 위반 0건 | IF-CI-002 자동 | violations === 0 | CI |
  | 2 | Lighthouse a11y ≥ 95 | IF-CI-002 자동 | score ≥ 95 | CI |
  | 3 | 연속 7일 빌드 통과 | FR-KPI-008 추적 | consecutive ≥ 7 | 자동 |
  | 4 | NVDA 수동 QA 완료 | TS-A11Y-002 수동 | EventLog 존재 | 운영자 |
  | 5 | gate_achieved === true | NF-A11Y-001 함수 | true | 자동 |
  | 6 | 키보드 100% 탐색 | TS-E2E-005 자동 | PASS | CI |
  | 7 | 자막 기본 ON | NF-A11Y-002 확인 | cc_load_policy=1 | 코드 |
  
  **규칙**: 7개 항목 중 **1건이라도 미충족 시 Alpha Exit 차단**
  ```
- [ ] **게이트 누락 감지 Cron** — `app/api/cron/risk-r6-check/route.ts`:
  ```ts
  import { verifyStage0ExitA11y } from '@/lib/stage-gates/stage0-exit';

  export async function GET() {
    const result = await verifyStage0ExitA11y();
    
    // 게이트 실행 자체가 안 된 경우 감지
    const lastAxeRun = await prisma.eventLog.findFirst({
      where: { eventName: 'ci.axe_completed' },
      orderBy: { timestamp: 'desc' },
    });
    
    const daysSinceLastAxe = lastAxeRun 
      ? (Date.now() - lastAxeRun.timestamp.getTime()) / 86400_000
      : Infinity;
    
    if (daysSinceLastAxe > 3) {
      await sendSev2Alert('⚠️ R6: axe CI가 3일 이상 미실행. 접근성 게이트 누락 위험', {
        lastRun: lastAxeRun?.timestamp,
        daysSince: Math.floor(daysSinceLastAxe),
      });
    }
    
    if (!result.gate_achieved) {
      await sendSev3Alert('R6: 접근성 게이트 미충족 상태', {
        criteria: result.criteria.filter(c => !c.passed),
      });
    }
    
    return Response.json({ result, daysSinceLastAxe });
  }
  ```
- [ ] **에스컬레이션 정책**:
  | 상태 | 기간 | 조치 |
  |---|---|---|
  | axe CI 미실행 | 3일 | Sev2 알림 |
  | 게이트 미충족 | 지속 | Sev3 일간 알림 |
  | Alpha Exit 시도 + 게이트 실패 | 즉시 | Sev1 — Exit 차단 |
- [ ] **"접근성 후순위" 방지 가드레일**:
  - PR 라벨에 `a11y-exempt` 금지 (CI 검증 skip 불가)
  - `outline: none` 전역 추가 시 린터 경고
  - 접근성 관련 이슈 "wontfix" 라벨 금지

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 전체 게이트 충족 — Alpha Exit 가능
- **Given**: 7개 접근성 항목 전체 PASS
- **When**: Alpha Exit 시도
- **Then**: Exit 허용

### Scenario 2: 1건 미충족 — Alpha Exit 차단
- **Given**: Lighthouse 94점 (미달)
- **When**: Alpha Exit 시도
- **Then**: Exit 차단 + Sev1 알림

### Scenario 3: axe CI 3일 미실행 — Sev2
- **Given**: 마지막 axe 실행 4일 전
- **When**: R6 Cron 실행
- **Then**: Sev2 알림 "게이트 누락 위험"

### Scenario 4: NF-A11Y-001 gate_achieved 연동
- **Given**: NF-A11Y-001 verifyStage0ExitA11y()
- **When**: 호출
- **Then**: NF-RISK-003 에서 결과 참조

### Scenario 5: a11y-exempt 라벨 방지
- **Given**: PR에 `a11y-exempt` 라벨
- **When**: CI 실행
- **Then**: 경고 + axe 검증은 skip 불가

### Scenario 6: 에스컬레이션 정책 문서
- **Given**: `docs/ops/alpha-exit-checklist.md`
- **When**: 검토
- **Then**: 7개 항목 + 에스컬레이션 3단계

### Scenario 7: NVDA 검증 90일 초과 — 차단
- **Given**: NVDA 수동 QA 91일 전
- **When**: 게이트 검증
- **Then**: nvda-manual-90d FAIL

### Scenario 8: 게이트 우회 불가
- **Given**: ADMIN 역할
- **When**: 게이트 override 시도
- **Then**: 불가 (코드에 override 경로 없음)

## :gear: Technical & Non-Functional Constraints
- **NF-A11Y-001 재사용**: 기술 게이트는 NF-A11Y-001. 본 태스크는 운영 정책
- **AND 강제**: 7개 항목 모두 충족 (OR 허용 불가)
- **Cron 주기**: 일 1회 R6 체크
- **Alpha 이후에도 유효**: Stage 0 Exit 후에도 분기 1회 NVDA 재검증
- **금지**:
  - 게이트 우회 (admin override)
  - axe CI skip
  - 접근성 이슈 "wontfix"
  - `a11y-exempt` 라벨

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 통과
- [ ] Alpha Exit Checklist 문서 (7개 항목)
- [ ] R6 감지 Cron 구현
- [ ] 에스컬레이션 3단계 정책
- [ ] 가드레일 린터 규칙
- [ ] PR 본문에 "R6 접근성 리스크. NF-A11Y-001 운영 정책" 명시

## :construction: Dependencies & Blockers
- **Depends on**: NF-A11Y-001 (기술 게이트), IF-CI-002 (axe CI)
- **Blocks**: Alpha Exit (접근성 미달 시 차단)
- **Related**: §6.6 R6, CON-06, TS-A11Y-002, TS-E2E-005
