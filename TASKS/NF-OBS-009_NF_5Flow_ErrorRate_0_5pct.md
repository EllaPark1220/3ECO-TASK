# [NF] NF-OBS-009: 핵심 5플로 오류율 ≤0.5% 모니터링

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-OBS-009: 핵심 5플로 오류율 ≤0.5% — 로그인·시청·OX·스탬프·교안 실시간 모니터링"
labels: 'nf, observability, error-rate, priority:high, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-OBS-009] 핵심 5개 플로 오류율 ≤ 0.5% 실시간 모니터링
- **목적**: REQ-NF-008 (핵심 플로 오류율 ≤ 0.5%) 충족. 로그인·시청·OX 제출·스탬프 발급·교안 다운로드 5개 핵심 사용자 플로의 오류율을 실시간 집계하고 0.5% 초과 시 Sev2 알림.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-008 (핵심 오류율 ≤0.5%)
- 선행: NF-OBS-001 (Sentry)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **5플로 정의 + 이벤트 매핑**:
  | # | 플로 | 성공 이벤트 | 실패 이벤트 |
  |---|---|---|---|
  | 1 | 로그인 | `auth.login_success` | `auth.login_failed` |
  | 2 | 영상 시청 | `lesson.viewed` | `lesson.view_failed` |
  | 3 | OX 제출 | `ox.submitted` | `ox.submit_failed` |
  | 4 | 스탬프 발급 | `stamp.earned` | `stamp.earn_failed` |
  | 5 | 교안 다운로드 | `pdf.downloaded` | `pdf.download_failed` |
- [ ] **일간 집계 쿼리** — `app/api/cron/error-rate/route.ts`:
  ```ts
  for (const flow of FLOWS) {
    const [success, failure] = await Promise.all([
      prisma.eventLog.count({ where: { eventName: flow.successEvent, timestamp: { gte: since } } }),
      prisma.eventLog.count({ where: { eventName: flow.failureEvent, timestamp: { gte: since } } }),
    ]);
    const total = success + failure;
    const errorRate = total > 0 ? (failure / total) * 100 : 0;
    if (errorRate > 0.5) {
      await sendSev2Alert(`${flow.name} 오류율 ${errorRate.toFixed(2)}% > 0.5%`);
    }
  }
  ```
- [ ] **KPI 대시보드 카드** (FR-KPI-009 확장)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 전체 플로 오류율 ≤ 0.5%
- **Given**: 5플로 일간 집계 → **Then**: 모두 ≤ 0.5%

### Scenario 2: 1플로 > 0.5% → Sev2
- **Given**: OX 오류율 0.8% → **Then**: Sev2 알림

### Scenario 3: 이벤트 0건 — 안전
- **Given**: 실패 이벤트 0건 → **Then**: 오류율 0%

### Scenario 4: 일간 리포트
- **Given**: Cron 실행 → **Then**: 5플로 오류율 리포트

### Scenario 5: 대시보드 표시
- **Given**: FR-KPI-009 → **Then**: 5플로 오류율 카드

### Scenario 6: 주간 추이
- **Given**: 7일 데이터 → **Then**: 추이 sparkline

## :gear: Technical & Non-Functional Constraints
- **이벤트 기반**: CT-DB-009 EventLog 의 성공/실패 이벤트 대조
- **Cron 주기**: 일 1회 (야간) + 실시간은 Sentry Error Count 보완
- **금지**: 개별 사용자 실패 내역 외부 노출

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 통과 + Cron 구현 + Sev2 알림 + 대시보드 카드

## :construction: Dependencies & Blockers
- **Depends on**: NF-OBS-001, CT-DB-009
- **Related**: REQ-NF-008
