# [NF] NF-OBS-003: Severity Router · Sev2 — p95 +20% OR 오류율 >1%

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-OBS-003: Sev2 알림 — p95 지연 +20% OR 오류율 >1% → 1시간 응답 / 4시간 조치"
labels: 'nf, observability, severity, alerting, priority:high, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-OBS-003] Severity 2 알림 라우터 — 성능 저하·중간 장애
- **목적**: REQ-NF-028 (Sev2 알림) 충족. 서비스는 가동 중이나 성능 저하(p95 +20%) 또는 오류율 상승(>1%) 발생 시 1시간 내 응답·4시간 내 조치. 사용자 경험 악화를 조기 감지.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.2` — REQ-NF-028 (Sev2)
- 선행: NF-OBS-001 (Sentry)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Sentry Alert Rule — Sev2**:
  ```
  Name: Sev2 — Performance Degradation
  Conditions:
    - Transaction p95 > baseline * 1.2 (20% 증가) over 15 minutes
    - OR: Error rate > 1% over 15 minutes
  Actions:
    - Email: admin@economy-textbook.kr
    - Slack: #alerts-warning
  Frequency: Every 15 minutes
  ```
- [ ] **p95 기준선(baseline) 설정**:
  ```ts
  // 기준선: 최근 7일 p95 평균
  // Sentry Performance → Alerts → Metric Alert
  // p95(transaction.duration) > 기준선 * 1.2
  const baselines = {
    '/api/stamp/map': 500,   // 500ms 기준
    '/api/teacher/kit/*': 2000, // 2초 기준
    '/api/lesson/*': 300,    // 300ms 기준
  };
  ```
- [ ] **Sentry Metric Alert 설정**:
  - Transaction Duration p95 — Dynamic threshold (7일 기준)
  - Error Count — Static threshold (>1% of total events)
- [ ] **응답 SOP** — `docs/ops/sev2-runbook.md`:
  - 1시간 내 원인 파악 시작
  - 4시간 내 조치 또는 Sev1 에스컬레이션

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: p95 +20% → Sev2 알림
- **Given**: stamp/map p95 기준선 500ms
- **When**: p95 650ms (30% 증가) 15분 지속
- **Then**: Sev2 알림 발송

### Scenario 2: 오류율 > 1% → Sev2 알림
- **Given**: 15분간 오류율 1.5%
- **When**: 트리거 확인
- **Then**: Sev2 알림

### Scenario 3: p95 정상 범위 — 알림 0
- **Given**: p95 480ms (기준선 이내)
- **When**: 15분 경과
- **Then**: 알림 0건

### Scenario 4: 1시간 응답 SLA
- **Given**: Sev2 알림 수신
- **When**: 운영자 확인
- **Then**: 1시간 내 원인 파악 시작

### Scenario 5: 4시간 미조치 → Sev1 에스컬
- **Given**: Sev2 4시간 미조치
- **When**: 에스컬레이션
- **Then**: Sev1 으로 격상

### Scenario 6: 복구 확인
- **Given**: p95 정상 복귀
- **When**: 기준선 이내
- **Then**: "Resolved" 알림

## :gear: Technical & Non-Functional Constraints
- **Sentry Metric Alerts**: Performance 탭 → Transaction Duration p95
- **기준선**: 7일 이동 평균 (cold start 고려 — ramp-up 기간 제외)
- **에스컬레이션**: 4시간 미조치 → Sev1 (수동 판단)

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 시나리오 통과
- [ ] Sentry Metric Alert Sev2 설정
- [ ] 기준선(baseline) 정의
- [ ] 응답 SOP 문서
- [ ] PR 본문에 "REQ-NF-028 Sev2. 1시간/4시간 SLA" 명시

## :construction: Dependencies & Blockers
- **Depends on**: NF-OBS-001 (Sentry)
- **Blocks**: 없음
- **Related**: REQ-NF-028, NF-OBS-002 (Sev1)
