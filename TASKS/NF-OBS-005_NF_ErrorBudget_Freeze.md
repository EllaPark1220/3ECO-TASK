# [NF] NF-OBS-005: Error Budget — 월간 80% 소진 시 검토 / 100% 시 출시 동결

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-OBS-005: Error Budget 정책 — 월간 80% 소진 → 신규 기능 검토 / 100% → 출시 동결 자동 라우팅"
labels: 'nf, observability, error-budget, sre, priority:high, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-OBS-005] Error Budget 정책 — SRE 스타일 안정성 게이트
- **목적**: REQ-NF-013 (Error Budget 정책) + §6.3.3 (Severity Router) 충족. 월간 가용성 SLO (99.5%) 기반 오류 예산을 계산하고, 80% 소진 시 신규 기능 출시 검토, 100% 소진 시 출시 동결 + 안정화 집중. 단일 제작자 환경에서 신뢰성과 기능 출시 속도의 균형.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.2` — REQ-NF-013 (Error Budget)
- SRS: `/docs/SRS_V0_9.md#6.3.3` — Severity Router + Error Budget
- 선행: NF-OBS-001 (Sentry), NF-OBS-008 (가용성 모니터링)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Error Budget 계산 로직**:
  ```ts
  // SLO: 99.5% → 월 216분 다운타임 허용
  const SLO_TARGET = 99.5;
  const MINUTES_IN_MONTH = 30 * 24 * 60; // 43,200분
  const ALLOWED_DOWNTIME = MINUTES_IN_MONTH * (1 - SLO_TARGET / 100); // 216분

  function calculateErrorBudget(actualDowntimeMinutes: number) {
    const consumed = (actualDowntimeMinutes / ALLOWED_DOWNTIME) * 100;
    return {
      allowed_downtime_min: ALLOWED_DOWNTIME,
      actual_downtime_min: actualDowntimeMinutes,
      consumed_pct: Math.round(consumed * 10) / 10,
      remaining_min: ALLOWED_DOWNTIME - actualDowntimeMinutes,
      status: consumed >= 100 ? 'FROZEN' : consumed >= 80 ? 'WARNING' : 'HEALTHY',
    };
  }
  ```
- [ ] **월간 집계 Cron** — `app/api/cron/error-budget/route.ts`:
  ```ts
  export async function GET() {
    const downtime = await calculateMonthlyDowntime(); // NF-OBS-008 에서 수집
    const budget = calculateErrorBudget(downtime);

    if (budget.status === 'FROZEN') {
      await sendSev1Alert('🧊 Error Budget 100% — 출시 동결', budget);
    } else if (budget.status === 'WARNING') {
      await sendSev3Alert('⚠️ Error Budget 80% — 신규 기능 검토', budget);
    }

    await prisma.eventLog.create({
      data: { eventName: 'error_budget.monthly', payload: budget, timestamp: new Date() },
    });

    return Response.json(budget);
  }
  ```
- [ ] **대시보드 카드** (FR-KPI-009 확장):
  - Error Budget 게이지: 소진율 + 잔여 분
  - 색상: 초록(< 80%), 노랑(80~99%), 빨강(100% — FROZEN)
- [ ] **출시 동결 SOP** — `docs/ops/error-budget-freeze.md`:
  1. Error Budget 100% → 신규 PR 머지 차단 (수동)
  2. 안정화 작업만 허용 (버그 수정, 성능 개선)
  3. 예산 복구(다음 월 시작) 시 동결 해제

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 소진율 < 80% → HEALTHY
- **Given**: 다운타임 100분 (46%)
- **When**: 계산
- **Then**: `status: 'HEALTHY'`, 알림 0건

### Scenario 2: 소진율 80% → WARNING
- **Given**: 다운타임 180분 (83%)
- **When**: 계산
- **Then**: `status: 'WARNING'`, Sev3 알림

### Scenario 3: 소진율 100% → FROZEN
- **Given**: 다운타임 220분 (102%)
- **When**: 계산
- **Then**: `status: 'FROZEN'`, Sev1 알림 + 출시 동결

### Scenario 4: 대시보드 게이지 표시
- **Given**: FR-KPI-009 대시보드
- **When**: Error Budget 카드 확인
- **Then**: 소진율 + 잔여분 + 색상 표시

### Scenario 5: 월초 리셋
- **Given**: 새 달 시작
- **When**: Budget 계산
- **Then**: 소진율 0%, status HEALTHY

### Scenario 6: 출시 동결 해제
- **Given**: FROZEN 상태 + 월초
- **When**: 리셋
- **Then**: 동결 해제 + 정상 운영

## :gear: Technical & Non-Functional Constraints
- **SLO**: 99.5% (REQ-NF-007 — 월 다운타임 ≤ 216분)
- **다운타임 소스**: NF-OBS-008 (외부 업타임 모니터) 데이터
- **월 리셋**: 매월 1일 00:00 UTC 기준
- **금지**: Error Budget 무시, 100% 소진 중 신규 기능 출시

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 시나리오 통과
- [ ] Error Budget 계산 로직 구현
- [ ] 월간 Cron 집계
- [ ] 대시보드 카드 (FR-KPI-009 확장)
- [ ] 출시 동결 SOP 문서
- [ ] PR 본문에 "REQ-NF-013 Error Budget. SLO 99.5%" 명시

## :construction: Dependencies & Blockers
- **Depends on**: NF-OBS-001 (Sentry), NF-OBS-008 (가용성 데이터)
- **Blocks**: Public Pilot Exit (안정성 게이트)
- **Related**: REQ-NF-013, §6.3.3
