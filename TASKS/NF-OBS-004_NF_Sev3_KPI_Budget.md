# [NF] NF-OBS-004: Severity Router · Sev3 — KPI -20% OR 예산 80% 소진

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-OBS-004: Sev3 알림 — KPI -20% OR 인프라 예산 80% 소진 → 24시간 리뷰"
labels: 'nf, observability, severity, kpi, priority:medium, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-OBS-004] Severity 3 알림 라우터 — KPI 하락·예산 소진 경고
- **목적**: REQ-NF-029 (Sev3 알림) 충족. 서비스 장애는 아니지만 KPI -20% 하락 또는 인프라 예산 80% 소진 시 24시간 내 리뷰. 운영 악화 조기 감지.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.2` — REQ-NF-029 (Sev3)
- 선행: NF-OBS-001 (Sentry), FR-KPI-001~007 (KPI API)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **KPI 하락 감지 Cron** — `app/api/cron/kpi-monitor/route.ts`:
  ```ts
  export async function GET() {
    const current = await getKpiSnapshot();    // 최근 7일
    const previous = await getKpiSnapshot(-7); // 이전 7일

    const alerts: string[] = [];
    for (const [key, val] of Object.entries(current)) {
      const prev = previous[key] || 0;
      if (prev > 0 && val < prev * 0.8) { // -20% 이상 하락
        alerts.push(`${key}: ${prev} → ${val} (-${((1 - val/prev) * 100).toFixed(1)}%)`);
      }
    }

    if (alerts.length > 0) {
      await sendSev3Alert('KPI -20% 하락', alerts);
    }
    return Response.json({ ok: true, alerts });
  }
  ```
- [ ] **예산 소진 감지** — IF-VC-002 (D-TIER) 연동:
  ```ts
  // Vercel Usage API 또는 수동 입력
  const budget = { monthly_limit: 100_000, current: 82_000 }; // 원
  if (budget.current / budget.monthly_limit >= 0.8) {
    await sendSev3Alert('인프라 예산 80% 소진', budget);
  }
  ```
- [ ] **알림 채널**: 이메일 + Slack #alerts-info (저긴급)
- [ ] **리뷰 SOP**: 24시간 내 KPI 원인 분석 + 대응 계획

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: KPI -20% → Sev3 알림
- **Given**: DAU 50 → 38 (-24%)
- **When**: Cron 실행
- **Then**: Sev3 알림 "DAU -24%"

### Scenario 2: 예산 80% → Sev3 알림
- **Given**: 월 10만원 한도, 현재 8.2만원
- **When**: 감지
- **Then**: Sev3 "예산 82% 소진"

### Scenario 3: KPI 정상 — 알림 0
- **Given**: DAU 50 → 48 (-4%)
- **When**: Cron 실행
- **Then**: 알림 0건

### Scenario 4: 24시간 리뷰
- **Given**: Sev3 수신
- **When**: 운영자 확인
- **Then**: 24시간 내 리뷰 기록

### Scenario 5: 복합 알림 — KPI + 예산
- **Given**: KPI -25% + 예산 85%
- **When**: 동시 감지
- **Then**: 단일 Sev3 알림에 양쪽 포함

### Scenario 6: 주간 Cron 실행
- **Given**: 월요일 오전 9시
- **When**: Cron 트리거
- **Then**: 자동 실행 + 결과 로그

## :gear: Technical & Non-Functional Constraints
- **KPI 비교**: 7일 이동 평균 대비 -20% (일시적 변동 필터)
- **예산 소스**: Vercel·Supabase 청구서 또는 수동 입력
- **Sev3 긴급도**: 24시간 리뷰 (즉시 대응 불필요)

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 시나리오 통과
- [ ] KPI 모니터 Cron 구현
- [ ] 예산 소진 감지 로직
- [ ] PR 본문에 "REQ-NF-029 Sev3. 24h 리뷰 SLA" 명시

## :construction: Dependencies & Blockers
- **Depends on**: NF-OBS-001 (Sentry), FR-KPI-001~007 (KPI API)
- **Blocks**: 없음
- **Related**: REQ-NF-029, NF-COST-001 (비용 모니터링)
