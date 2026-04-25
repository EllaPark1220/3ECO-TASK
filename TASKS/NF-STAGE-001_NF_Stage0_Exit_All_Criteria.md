# [Feature] NF-STAGE-001: Stage 0 Exit Criteria 통합 검증 — 5개 게이트 자동 + admin 대시보드 + 운영자 알림

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] NF-STAGE-001: Stage 0 Exit 통합 검증 — A11Y + Lint + Build + Smoke + 핵심 5플로우 5개 게이트 자동 + admin 대시보드 + 첫 통과 메일"
labels: 'feature, nf, stage-0-exit, gate, admin, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-STAGE-001] Stage 0 (Alpha 진입) Exit 의 모든 게이트 통합 검증 — (1) NF-A11Y-001 접근성 + (2) Hooking Linter 무결성 (FW-LINT-001~004) + (3) Build 안정성 (3일 연속 main fail 0) + (4) Smoke 테스트 (핵심 페이지 200) + (5) 핵심 5플로우 (회원가입·로그인·lesson 시청·OX·StampMap) 자동 통과 + admin 대시보드 + 첫 통과 시 운영자 메일
- **목적**: Alpha 진입 직전 모든 인프라 + 콘텐츠 + 기능의 무결성 자동 검증. 단일 제작자가 Stage 0 Exit 결정을 직관 또는 휴리스틱으로 내리지 않고 **5개 게이트 자동 통과** 로 결정 → 운영 안정성 보장. NF-A11Y-001 의 superset — 본 태스크는 모든 Stage 0 Exit 통합.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.2.5` — Stage 0 Exit Criteria 정의
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-040, NF-A11Y-001
  - `/docs/SRS_V0_9.md#5.1` — CI 정책
- 선행: NF-A11Y-001 (a11y 게이트), FW-LINT-001~004 (린터), IF-CI-001~005 (CI), TS-IT-001~009 (통합 테스트), TS-E2E-001 (E2E)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **5개 Exit Criteria 정의**:

  **Criteria 1 — NF-A11Y-001 통과**:
  - axe 위반 0 + Lighthouse ≥95 + 연속 7일 + NVDA 검증 + FR-KPI-008 gate
  - NF-A11Y-001 의 verifyStage0ExitA11y() 활용

  **Criteria 2 — Hooking Linter 무결성**:
  - 최근 7일 main 빌드 모두 hooking-lint Job pass
  - 위반 0
  - EventLog `build.hooking_lint_pass` 또는 GitHub Actions API 활용

  **Criteria 3 — Build 안정성 (3일 연속 main fail 0)**:
  - 최근 3일 main push 의 모든 CI Job (unit-test + hooking-lint + a11y-lint + cc-license-lint) pass
  - GitHub Actions 의 workflow runs API 또는 EventLog `build.success/failure`

  **Criteria 4 — Smoke 테스트 (핵심 5 페이지 200)**:
  - 핵심 5 페이지 production HTTP 200 + 응답 시간 < 3초
  - 페이지: `/`, `/auth/login`, `/lessons/L001`, `/stamps`, `/teacher/feedback`
  - 별도 cron 또는 Vercel Monitoring

  **Criteria 5 — 핵심 5플로우 자동 통과 (TS-E2E-001 의 회원가입·로그인·시청·OX·StampMap)**:
  - TS-E2E-001 의 Playwright 시나리오 최근 24시간 pass
  - EventLog `e2e.smoke_pass` 또는 GitHub Actions Job 결과

- [ ] **통합 검증 함수 — `lib/stage-gates/stage0-exit-all.ts`**:
  ```ts
  import { verifyStage0ExitA11y } from './stage0-a11y';

  export async function verifyStage0ExitAll(): Promise<{
    overall_gate_achieved: boolean;
    criteria: Array<{
      id: string;
      name: string;
      passed: boolean;
      detail: string;
    }>;
    next_action: string;
  }> {
    const criteria = [];

    // (1) A11Y
    const a11yResult = await verifyStage0ExitA11y();
    criteria.push({
      id: 'a11y',
      name: 'NF-A11Y-001 접근성',
      passed: a11yResult.gate_achieved,
      detail: a11yResult.criteria.filter(c => !c.passed).map(c => c.id).join(', ') || '5/5 통과',
    });

    // (2) Hooking Linter — 최근 7일
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const hookingFails = await prisma.eventLog.count({
      where: {
        event: 'build.hooking_lint_fail',
        createdAt: { gte: sevenDaysAgo },
      },
    });
    criteria.push({
      id: 'hooking-lint',
      name: 'Hooking Linter 7일 무결성',
      passed: hookingFails === 0,
      detail: `최근 7일 fail ${hookingFails} 건`,
    });

    // (3) Build 안정성 — 최근 3일
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const buildFails = await prisma.eventLog.count({
      where: {
        event: 'build.failure',
        createdAt: { gte: threeDaysAgo },
      },
    });
    criteria.push({
      id: 'build-stability',
      name: 'Build 3일 안정성',
      passed: buildFails === 0,
      detail: `최근 3일 fail ${buildFails} 건`,
    });

    // (4) Smoke — 핵심 5 페이지
    const smokeResult = await runSmokeTest();
    criteria.push({
      id: 'smoke-test',
      name: 'Smoke 5 페이지 200',
      passed: smokeResult.allPassed,
      detail: smokeResult.failedPages.length > 0 ? smokeResult.failedPages.join(', ') : '5/5 200',
    });

    // (5) E2E 5플로우
    const e2eResult = await prisma.eventLog.findFirst({
      where: {
        event: 'e2e.smoke_pass',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    criteria.push({
      id: 'e2e-5-flows',
      name: '핵심 5플로우 E2E',
      passed: !!e2eResult,
      detail: e2eResult ? `${e2eResult.createdAt.toISOString()}` : '24시간 내 통과 부재',
    });

    const overallGateAchieved = criteria.every(c => c.passed);
    const nextAction = overallGateAchieved
      ? '✅ Stage 0 Exit 통과 — Alpha 진입 가능'
      : `⚠️ ${criteria.filter(c => !c.passed).map(c => c.name).join(', ')} 보완 필요`;

    return { overall_gate_achieved: overallGateAchieved, criteria, next_action: nextAction };
  }
  ```
- [ ] **Smoke 테스트 — `runSmokeTest()`**:
  ```ts
  async function runSmokeTest(): Promise<{ allPassed: boolean; failedPages: string[] }> {
    const pages = ['/', '/auth/login', '/lessons/L001', '/stamps', '/teacher/feedback'];
    const failedPages: string[] = [];

    for (const path of pages) {
      try {
        const start = Date.now();
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}${path}`);
        const duration = Date.now() - start;
        if (response.status !== 200 || duration > 3000) {
          failedPages.push(`${path} (status ${response.status}, ${duration}ms)`);
        }
      } catch (e) {
        failedPages.push(`${path} (error)`);
      }
    }

    return { allPassed: failedPages.length === 0, failedPages };
  }
  ```
- [ ] **admin 대시보드 페이지 — `/admin/stage-gates`**:
  - 5개 criteria 카드 (passed: 초록, fail: 빨강)
  - 각 criteria 의 detail + 미통과 시 next_action 안내
  - 최근 검증 시점 (실시간 fetch)
- [ ] **운영자 메일 알림 — 첫 통과**:
  - 매일 cron 검증
  - 첫 통과 시점 (이전 결과 = false, 현재 = true) 메일 1회
  - "Stage 0 Exit 통과 — Alpha 진입 가능" 본문
- [ ] **EventLog 발행**:
  - `stage0_exit.checked` (cron 실행)
  - `stage0_exit.gate_achieved` (첫 통과)
  - `stage0_exit.gate_lost` (다시 미달성 — 회귀 알림)
- [ ] **`/api/stage-gates/stage0-exit` Route Handler**:
  ```ts
  export async function GET(req: Request) {
    if (await requireRole('ADMIN', req) === false) {
      return new Response('Forbidden', { status: 403 });
    }
    const result = await verifyStage0ExitAll();
    return NextResponse.json(result);
  }
  ```
- [ ] **응답 시간**: ≤ 5초 (Smoke 5 페이지 fetch + DB 4 쿼리)
- [ ] **OpenAPI 명세 추가**

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 5개 criteria 모두 통과 — Gate 통과
- **Given**: 모든 조건
- **When**: verifyStage0ExitAll()
- **Then**: overall_gate_achieved: true + next_action ✅

### Scenario 2: a11y 미충족 — Gate fail
- **Given**: NF-A11Y-001 미통과
- **When**: 검증
- **Then**: overall fail + a11y criteria 미통과

### Scenario 3: hooking-lint 7일 내 fail — Gate fail
- **Given**: 최근 7일 hooking fail 1건
- **When**: 검증
- **Then**: hooking-lint criteria 미통과

### Scenario 4: Build 3일 fail 1건 — Gate fail
- **Given**: 최근 3일 fail 1건
- **When**: 검증
- **Then**: build-stability 미통과

### Scenario 5: Smoke 1 페이지 fail — Gate fail
- **Given**: /lessons/L001 5xx
- **When**: 검증
- **Then**: smoke-test 미통과

### Scenario 6: E2E 24시간 내 부재 — Gate fail
- **Given**: 24시간 내 e2e.smoke_pass 0
- **When**: 검증
- **Then**: e2e-5-flows 미통과

### Scenario 7: 첫 통과 — 운영자 메일
- **Given**: 이전 false → 현재 true
- **When**: cron
- **Then**: Resend 1회 + EventLog `stage0_exit.gate_achieved`

### Scenario 8: 재통과 — 메일 미발송 (멱등)
- **Given**: 이미 통과 상태
- **When**: 검증
- **Then**: 메일 0

### Scenario 9: 회귀 (통과 → 미통과) — 운영자 알림
- **Given**: 통과 후 회귀
- **When**: 검증
- **Then**: EventLog `stage0_exit.gate_lost` + Sentry critical

### Scenario 10: ADMIN 대시보드 응답
- **Given**: ADMIN
- **When**: GET /api/stage-gates/stage0-exit
- **Then**: 200 + 5 criteria

## :gear: Technical & Non-Functional Constraints
- **5개 criteria 모두 충족 (AND)**: 단일 누락 차단
- **NF-A11Y-001 의 superset**: 본 태스크 가 a11y 외 추가 4개
- **Smoke 핵심 5 페이지 + 응답 시간 < 3초**
- **EventLog 기반 7일·3일·24시간 윈도**
- **첫 통과 메일 멱등**: 이전 결과 추적
- **회귀 알림 — gate_lost EventLog + Sentry critical**: Stage 0 안정성 회귀 즉시 인지
- **admin 대시보드 — 5 criteria 카드**: 운영자 즉시 인지
- **응답 시간 ≤ 5초**
- **금지**:
  - 일부 criteria 만으로 Gate 통과 (정책 약화)
  - 첫 통과 메일 누락 (Alpha 진입 결정 지연)
  - 회귀 알림 누락 (운영자 미인지)
  - admin override (게이트 우회)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] verifyStage0ExitAll() 함수
- [ ] 5개 criteria 통합 검증
- [ ] runSmokeTest() 함수
- [ ] /api/stage-gates/stage0-exit Route Handler
- [ ] /admin/stage-gates 대시보드 페이지
- [ ] 첫 통과 메일 + 회귀 알림
- [ ] EventLog 발행 (checked + gate_achieved + gate_lost)
- [ ] 응답 시간 ≤ 5초
- [ ] OpenAPI 명세 추가
- [ ] PR 본문에 "Stage 0 Exit 5 게이트 자동 + admin 대시보드" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - NF-A11Y-001 (a11y 게이트)
  - FW-LINT-001~004 (Hooking Linter)
  - IF-CI-001~005 (CI Job)
  - TS-IT-001~009 (통합 테스트)
  - TS-E2E-001 (E2E)
  - CT-DB-009 (EventLog)
- **Blocks**:
  - Alpha 진입 (Stage 0 → Stage 1)
  - 운영 안정성 보장
- **Related**:
  - 운영자 SOP — 게이트 미통과 시 보완 절차
  - DR drill (분기 검증)
