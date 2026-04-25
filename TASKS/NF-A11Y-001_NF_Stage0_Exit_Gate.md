# [Feature] NF-A11Y-001: Stage 0 Exit 접근성 100% Gate — axe + Lighthouse + 연속 7일 + NVDA 수동

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] NF-A11Y-001: Stage 0 Exit 접근성 게이트 — axe-core 100% + Lighthouse a11y ≥95 + 연속 7일 빌드 통과 + NVDA 수동 검증 SOP"
labels: 'feature, nf, a11y, stage-0-exit, gate, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-A11Y-001] Stage 0 (Alpha 진입) Exit Gate 의 접근성 충족 — (1) axe-core 자동 테스트 위반 0 + (2) Lighthouse a11y 점수 ≥95 + (3) 연속 7일 빌드 100% 충족 + (4) NVDA 스크린리더 수동 검증 (8개 핵심 페이지) + (5) FR-KPI-008 자동 점검
- **목적**: 페르소나 SH-04 한정숙·SH-08 김성호 의 정합 강제. PRD 의 접근성 100% 정책은 단순 "노력" 이 아닌 **자동 게이트** 로 강제. Alpha 진입 = 운영 시작이라 접근성 결함이 누적되기 전에 제로화. 단일 자동 검증 외 NVDA 수동 SOP 추가 — 자동 테스트가 잡지 못하는 실제 사용자 경험 검증.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-040 (a11y 100%)
  - `/docs/SRS_V0_9.md#1.2.5` — Stage 0 Exit Criteria
- 페르소나: SH-04 한정숙 (저시력), SH-08 김성호 (전맹)
- 외부:
  - `https://github.com/dequelabs/axe-core`
  - `https://www.nvaccess.org/` (NVDA)
  - WCAG 2.1 AA
- 선행: TS-A11Y-001 (axe 통합), IF-CI-002 (axe + Lighthouse), FR-KPI-008 (KPI 추적)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Stage 0 Exit Criteria — 5개 조건 모두 충족**:

  **(1) axe-core 자동 테스트 위반 0**:
  - 본 사이트의 모든 핵심 페이지 (홈·랜딩·로그인·lesson 시청·StampMap·교사 페이지·설정) 의 axe 검증
  - critical/serious/moderate/minor 중 **단 1건도 부재**
  - IF-CI-002 의 `a11y-lint` Job 매 PR 실행

  **(2) Lighthouse a11y 점수 ≥ 95**:
  - 핵심 5개 페이지 (랜딩·홈·lesson·StampMap·교사) Lighthouse 측정
  - 점수 ≥ 95 (≥ 100 이상적)
  - IF-CI-002 의 Lighthouse step 자동 실행

  **(3) 연속 7일 빌드 통과**:
  - 단일 빌드 충족 외 **안정성 검증**
  - FR-KPI-008 의 `consecutive_passes_current ≥ 7`
  - 매 PR + main push 모두 빌드로 카운트

  **(4) NVDA 스크린리더 수동 검증 — 8개 핵심 페이지**:
  - 운영자 SOP — 분기 1회 또는 Stage 0 Exit 시 1회
  - 검증 대상 페이지 (8):
    1. 랜딩 (`/`)
    2. 로그인 (`/auth/login`)
    3. 홈 (`/home`)
    4. lesson 시청 (`/lessons/L001`)
    5. OX 제출 (lesson 시청 내)
    6. StampMap (`/stamps`)
    7. 교사 피드백 (`/teacher/feedback/L001`)
    8. 설정 (`/settings`)
  - 검증 항목 (각 페이지):
    - 페이지 제목 읽힘
    - 헤딩 구조 정합 (h1 → h2 → h3)
    - 모든 버튼·링크 라벨 명확
    - 모달·알림 배너 자동 읽힘
    - 키보드 탐색 (Tab·Enter·Esc) 정상
    - 폼 라벨 매칭

  **(5) FR-KPI-008 자동 점검 — `gate_achieved: true`**:
  - 본 KPI 응답의 `stage0_exit_status.gate_achieved === true` 자동 검증
  - 누락 시 Stage 0 Exit 차단

- [ ] **Stage 0 Exit 자동 검증 함수 — `lib/stage-gates/stage0-exit.ts`**:
  ```ts
  export async function verifyStage0ExitA11y(): Promise<{
    gate_achieved: boolean;
    criteria: Array<{ id: string; passed: boolean; detail: string }>;
  }> {
    const criteria = [];

    // (1) axe 위반 0
    const axeResult = await fetch('/api/kpi/accessibility').then(r => r.json());
    criteria.push({
      id: 'axe-violations-zero',
      passed: axeResult.latest_build?.violations === 0,
      detail: `위반 ${axeResult.latest_build?.violations} 건`,
    });

    // (2) Lighthouse ≥ 95
    const lighthouseScore = axeResult.lighthouse_score ?? 0;
    criteria.push({
      id: 'lighthouse-95',
      passed: lighthouseScore >= 95,
      detail: `점수 ${lighthouseScore}`,
    });

    // (3) 연속 7일
    criteria.push({
      id: 'consecutive-7-days',
      passed: axeResult.stage0_exit_status?.consecutive_passes_current >= 7,
      detail: `연속 ${axeResult.stage0_exit_status?.consecutive_passes_current} 일`,
    });

    // (4) NVDA 수동 검증 — 별도 admin 입력
    const nvdaCheck = await prisma.eventLog.findFirst({
      where: { event: 'a11y.nvda_verified', createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' },
    });
    criteria.push({
      id: 'nvda-manual-90d',
      passed: !!nvdaCheck,
      detail: nvdaCheck ? `최근 ${nvdaCheck.createdAt.toISOString().split('T')[0]}` : '90일 내 검증 없음',
    });

    // (5) FR-KPI-008 의 gate
    criteria.push({
      id: 'kpi-gate-achieved',
      passed: axeResult.stage0_exit_status?.gate_achieved === true,
      detail: 'FR-KPI-008',
    });

    return {
      gate_achieved: criteria.every(c => c.passed),
      criteria,
    };
  }
  ```
- [ ] **NVDA 수동 검증 운영자 SOP — `docs/nvda-manual-test-sop.md`**:
  ```markdown
  # NVDA 수동 검증 SOP

  ## 환경
  - Windows 10/11 + NVDA (무료, https://www.nvaccess.org/)
  - Chrome 또는 Firefox 브라우저

  ## 절차
  1. NVDA 시작 (Ctrl+Alt+N)
  2. 본 사이트 접속 (production URL)
  3. 8개 페이지 순회 (랜딩 → 로그인 → 홈 → lesson → OX → StampMap → 교사 → 설정)
  4. 각 페이지에서 다음 검증:
     - [ ] 페이지 제목 읽힘
     - [ ] 헤딩 구조 (Tab + H 키)
     - [ ] 버튼·링크 라벨 명확 (Tab 으로 순회)
     - [ ] 모달 자동 읽힘
     - [ ] 키보드 탐색 정상
     - [ ] 폼 라벨 매칭
  5. 결과 — `docs/nvda-test-history-YYYY-MM-DD.md` 작성
  6. ADMIN 페이지에서 EventLog 발행 — `a11y.nvda_verified`

  ## 빈도
  - Stage 0 Exit 직전 1회 (의무)
  - 이후 분기 1회 (DR drill 과 함께)

  ## 위반 발견 시
  - 즉시 Issue 등록
  - 수정 PR + 재검증 후 본 게이트 재통과
  ```
- [ ] **NVDA 검증 결과 EventLog 발행 — admin Server Action**:
  ```ts
  // app/admin/a11y/nvda/actions.ts
  'use server';
  export async function recordNvdaVerification(input: {
    pages_tested: string[];
    issues_found: number;
    notes?: string;
  }) {
    const user = await getCurrentUser();
    if (user?.role !== 'ADMIN') throw new Error('FORBIDDEN');

    await prisma.eventLog.create({
      data: {
        userId: user.id,
        event: 'a11y.nvda_verified',
        payload: input,
      },
    });
  }
  ```
- [ ] **Stage 0 Exit 발표 자동화** — 모든 criteria 통과 시 운영자 메일:
  ```ts
  // 매일 cron 으로 verifyStage0ExitA11y() 호출
  // 첫 통과 시점에 운영자 알림 (Resend 메일)
  if (result.gate_achieved && !previousGateAchieved) {
    await resend.emails.send({
      from: 'no-reply@economic-judgment.app',
      to: process.env.OPERATOR_EMAIL!,
      subject: '✅ Stage 0 Exit 접근성 게이트 통과',
      html: 'NF-A11Y-001 의 5개 criteria 모두 충족. Alpha 환경 운영 시작 가능.',
    });
  }
  ```
- [ ] **응답 시간**: verifyStage0ExitA11y() ≤ 1초

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 5개 criteria 모두 충족 — 게이트 통과
- **Given**: 모든 조건 충족
- **When**: verifyStage0ExitA11y()
- **Then**: gate_achieved: true + 5 criteria 모두 passed

### Scenario 2: axe 위반 1건 — 차단
- **Given**: axe critical 1건
- **When**: 검증
- **Then**: axe-violations-zero passed: false

### Scenario 3: Lighthouse 94점 — 차단
- **Given**: 점수 94
- **When**: 검증
- **Then**: lighthouse-95 passed: false

### Scenario 4: 연속 6일 — 차단
- **Given**: 연속 6일
- **When**: 검증
- **Then**: consecutive-7-days passed: false

### Scenario 5: NVDA 90일 내 검증 부재 — 차단
- **Given**: EventLog 없음
- **When**: 검증
- **Then**: nvda-manual-90d passed: false

### Scenario 6: NVDA EventLog 발행
- **Given**: ADMIN
- **When**: recordNvdaVerification 호출
- **Then**: EventLog INSERT + payload 정합

### Scenario 7: 첫 통과 — 운영자 메일
- **Given**: 첫 통과 시점
- **When**: cron 검증
- **Then**: Resend 메일 1회

### Scenario 8: 재통과 — 메일 미발송
- **Given**: 이미 통과 상태
- **When**: 검증
- **Then**: 메일 0 (멱등)

### Scenario 9: 운영자 SOP 문서
- **Given**: docs/nvda-manual-test-sop.md
- **When**: 검토
- **Then**: 8 페이지 + 6 검증 항목 + 빈도 명시

### Scenario 10: 응답 시간 ≤ 1초
- **Given**: 검증
- **When**: 측정
- **Then**: ≤ 1초

## :gear: Technical & Non-Functional Constraints
- **5개 criteria 모두 충족 강제 (AND)**: 단일 누락도 차단
- **NVDA 수동 — 운영자 SOP**: 자동 외 실제 사용자 경험
- **연속 7일 안정성**: 단일 빌드 외 보장
- **EventLog `a11y.nvda_verified`**: 90일 retention
- **첫 통과 메일 알림 (멱등)**
- **Stage 0 진입 후에도 반복 검증**: 분기 1회 NVDA 의무
- **금지**:
  - 자동 검증만으로 Gate 통과 (실제 사용자 경험 검증 부재)
  - NVDA 검증 90일 초과 (정책 표준)
  - admin override (게이트 우회)
  - 위반 부재만으로 Gate (Lighthouse 95 충족 의무)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] verifyStage0ExitA11y() 함수
- [ ] 5개 criteria 자동 검증
- [ ] NVDA SOP 문서
- [ ] recordNvdaVerification() admin Server Action
- [ ] 첫 통과 메일 알림 (멱등)
- [ ] FR-KPI-008 통합 검증
- [ ] 응답 시간 ≤ 1초 측정
- [ ] PR 본문에 "Stage 0 Exit 접근성 100% 자동 + 수동 통합 게이트" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - TS-A11Y-001 (axe 통합)
  - IF-CI-002 (axe + Lighthouse Job)
  - FR-KPI-008 (KPI 자동 추적)
  - CT-DB-009 (EventLog)
- **Blocks**:
  - Stage 0 Exit (Alpha 진입 시점)
  - 페르소나 SH-04·SH-08 정합 보장
- **Related**:
  - WCAG 2.1 AA
  - DR drill SOP (분기 NVDA 검증)
