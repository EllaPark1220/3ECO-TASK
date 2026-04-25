# [NF] NF-OBS-002: Severity Router · Sev1 — 가용성 <99% OR 오류율 >2%

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-OBS-002: Sev1 알림 — 가용성 <99.0% OR 오류율 >2% → 푸시+SMS+이메일 (15분 응답)"
labels: 'nf, observability, severity, alerting, priority:critical, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-OBS-002] Severity 1 알림 라우터 — 최고 긴급 장애 대응
- **목적**: REQ-NF-027 (Sev1 알림) + UC-14 (장애 대응) 충족. 가용성 < 99.0% 또는 오류율 > 2% 발생 시 15분 이내 응답 가능하도록 푸시·SMS·이메일 다중 채널 알림. 단일 제작자(CON-08) 운영 환경에서 즉각 인지가 핵심.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.2` — REQ-NF-027 (Sev1), §6.3.3 (Severity Router)
- 선행: NF-OBS-001 (Sentry Setup)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Sentry Alert Rule — Sev1**:
  ```
  Name: Sev1 — Critical Service Down
  Conditions:
    - Error rate > 2% over 5 minutes
    - OR: HTTP 5xx count > 50 in 5 minutes
  Actions:
    - Email: admin@economy-textbook.kr
    - Slack: #alerts-critical (webhook)
    - SMS: Twilio (또는 수동 SOP)
  Frequency: Every 5 minutes (중복 방지)
  ```
- [ ] **가용성 체크 — Cron 기반**:
  ```ts
  // app/api/cron/health-check/route.ts (1분 간격)
  export async function GET() {
    const start = Date.now();
    const checks = await Promise.allSettled([
      fetch(`${BASE_URL}/api/health`),
      prisma.$queryRaw`SELECT 1`,
    ]);
    const allOk = checks.every(c => c.status === 'fulfilled');
    if (!allOk) {
      await sendSev1Alert('Health check failed', { checks });
    }
    return Response.json({ ok: allOk, latency: Date.now() - start });
  }
  ```
- [ ] **SLA 계산 로직**:
  ```ts
  // 월간 가용성 = (총 분 - 다운 분) / 총 분 * 100
  // 99.0% = 월 432분 다운타임 허용 (7.2시간)
  // 99.5% = 월 216분 (SRS 목표)
  ```
- [ ] **응답 SOP 문서** — `docs/ops/sev1-runbook.md`
- [ ] **15분 응답 SLA**: 알림 수신 → 인지 확인 (ACK) ≤ 15분

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 오류율 > 2% → Sev1 알림
- **Given**: 5분간 오류율 3%
- **When**: Sentry Alert 트리거
- **Then**: 이메일 + Slack 알림 발송

### Scenario 2: Health check 실패 → 알림
- **Given**: DB 연결 실패
- **When**: Cron health-check 실행
- **Then**: Sev1 알림 발송

### Scenario 3: 15분 이내 ACK
- **Given**: Sev1 알림 수신
- **When**: 운영자 확인
- **Then**: ACK ≤ 15분 (SOP 기록)

### Scenario 4: 중복 방지
- **Given**: 동일 장애 지속
- **When**: 5분 후 재검사
- **Then**: 중복 알림 미발송 (한 번만)

### Scenario 5: 복구 후 해소 알림
- **Given**: 장애 복구
- **When**: 정상 복귀
- **Then**: "Resolved" 알림 발송

### Scenario 6: 정상 상태 — 알림 0건
- **Given**: 오류율 0.1%
- **When**: 5분 경과
- **Then**: 알림 0건

## :gear: Technical & Non-Functional Constraints
- **알림 채널**: 이메일 (필수) + Slack (권장) + SMS (선택 — Twilio 비용)
- **Sentry Free 한도**: Alert Rule 무제한 (Free 포함)
- **CON-08 (단일 제작자)**: 알림 수신자 1명. 다중 채널로 인지율 극대화
- **금지**: 알림 무시 (SOP 위반), 알림 과다 (Sev2·3 과 혼합)

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 시나리오 통과
- [ ] Sentry Alert Rule Sev1 설정
- [ ] Health check Cron 구현
- [ ] 응답 SOP 문서 작성
- [ ] PR 본문에 "REQ-NF-027 Sev1 알림. 15분 응답 SLA" 명시

## :construction: Dependencies & Blockers
- **Depends on**: NF-OBS-001 (Sentry)
- **Blocks**: NF-OBS-008 (가용성 모니터링)
- **Related**: REQ-NF-027, UC-14, §6.3.3
