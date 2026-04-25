# [NF] NF-COST-001: 인프라 비용 0~10만원 — 청구서 자동 알림

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-COST-001: 월 인프라 비용 0~10만원 검증 — Vercel + Supabase + Sentry 청구서 자동 알림"
labels: 'nf, cost-control, priority:medium, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-COST-001] 월간 인프라 비용 0~10만원 검증 + 자동 알림
- **목적**: REQ-NF-023 (인프라 비용 0~10만원/월) + CON-07 (비용 투명성) 충족. MVP는 Vercel Hobby(무료) + Supabase Free(무료) + Sentry Free(무료)로 0원 운영을 목표. Pro 전환 시에도 10만원/월 이내 유지.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.5` — REQ-NF-023 (인프라 0~10만원)
- SRS: `/docs/SRS_V0_9.md#1.5.1.2` — D-TIER (Free→Pro 전환 트리거)
- 선행: IF-VC-001, IF-SUP-001

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **비용 대시보드** — `docs/ops/cost-dashboard.md`:
  | 서비스 | Free 한도 | Pro 가격 | 월 예상 |
  |---|---|---|---|
  | Vercel Hobby | 무료 | $20/월 | ₩0 (Free) |
  | Supabase Free | 500MB DB, 1GB Storage | $25/월 | ₩0 (Free) |
  | Sentry Free | 5K events/월 | $26/월 | ₩0 (Free) |
  | UptimeRobot | 50 모니터 | 무료 | ₩0 |
  | **합계** | | | **₩0** |
- [ ] **D-TIER 트리거 모니터링** — Cron:
  ```ts
  const DTIER_TRIGGERS = [
    { service: 'vercel', metric: 'functions_invocations', limit: 100_000, current: 0 },
    { service: 'supabase', metric: 'db_size_mb', limit: 500, current: 0 },
    { service: 'supabase', metric: 'storage_gb', limit: 1, current: 0 },
    { service: 'sentry', metric: 'events', limit: 5_000, current: 0 },
    { service: 'vercel', metric: 'bandwidth_gb', limit: 100, current: 0 },
  ];
  ```
- [ ] **알림**: 한도 80% 도달 시 Sev3 (NF-OBS-004 연동)
- [ ] **월간 비용 리뷰**: 매월 1일 비용 집계 + 운영 문서 갱신

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: MVP 비용 = ₩0
- **Given**: 전체 Free 플랜 → **Then**: 월간 ₩0

### Scenario 2: D-TIER 80% → Sev3
- **Given**: DB 400MB (80%) → **Then**: Sev3 알림

### Scenario 3: Pro 전환 후 ≤ ₩10만
- **Given**: Vercel + Supabase Pro → **Then**: 합계 ≤ ₩100,000

### Scenario 4: 월간 리뷰 기록
- **Given**: 매월 1일 → **Then**: 비용 리뷰 문서 갱신

### Scenario 5: 예기치 못한 과금 → Sev1
- **Given**: 예상 외 과금 → **Then**: 즉시 Sev1

### Scenario 6: 비용 추이 기록
- **Given**: 6개월 → **Then**: 월별 비용 추이표

## :gear: Technical & Non-Functional Constraints
- **Free 최대 활용**: Pro 전환은 D-TIER 트리거 시에만
- **환율**: $1 = ₩1,350 기준 (Pro 전환 시)
- **금지**: 불필요한 유료 서비스 구독, 한도 초과 방치

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 통과 + 비용 대시보드 + D-TIER 모니터링 + 알림

## :construction: Dependencies & Blockers
- **Depends on**: IF-VC-001, IF-SUP-001
- **Blocks**: NF-COST-003 (신규 기능 비용 체크)
- **Related**: REQ-NF-023, CON-07, D-TIER
