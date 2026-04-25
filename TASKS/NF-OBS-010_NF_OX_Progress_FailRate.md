# [NF] NF-OBS-010: OX→진도 반영 실패율 ≤0.5% 모니터링

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-OBS-010: OX→진도 반영 실패율 — ox.submitted vs progress.updated 이벤트 대조 ≤0.5%"
labels: 'nf, observability, ox, progress, priority:high, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-OBS-010] OX 통과 → 진도 반영 실패율 모니터링
- **목적**: REQ-NF-009 (OX → 진도 반영 실패율 ≤ 0.5%) 충족. `ox.submitted` 이벤트 발생 후 `progress.updated` 이벤트가 뒤따르지 않는 **누락 건수**를 일간 집계하고, 0.5% 초과 시 알람. OX 통과했지만 진도에 반영되지 않는 데이터 불일치를 감지.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-009
- 선행: FW-OX-003 (OX→진도 연쇄), NF-OBS-001 (Sentry)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **대조 쿼리** — `app/api/cron/ox-progress-audit/route.ts`:
  ```ts
  // ox.submitted 이벤트 중 30초 내 progress.updated 가 없는 건 카운트
  const oxEvents = await prisma.eventLog.findMany({
    where: { eventName: 'ox.submitted', timestamp: { gte: since } },
    select: { id: true, payload: true, timestamp: true },
  });
  let missingCount = 0;
  for (const ox of oxEvents) {
    const progressExists = await prisma.eventLog.findFirst({
      where: {
        eventName: 'progress.updated',
        timestamp: { gte: ox.timestamp, lte: new Date(ox.timestamp.getTime() + 30_000) },
        payload: { path: ['lesson_id'], equals: (ox.payload as any).lesson_id },
      },
    });
    if (!progressExists) missingCount++;
  }
  const failRate = oxEvents.length > 0 ? (missingCount / oxEvents.length) * 100 : 0;
  if (failRate > 0.5) {
    await sendSev2Alert(`OX→진도 실패율 ${failRate.toFixed(2)}% > 0.5%`, { missing: missingCount, total: oxEvents.length });
  }
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 실패율 0% — 정상
- **Given**: 100건 ox.submitted + 100건 progress.updated → **Then**: 실패율 0%

### Scenario 2: 실패율 > 0.5% → Sev2
- **Given**: 100건 중 1건 누락 (1%) → **Then**: Sev2 알림

### Scenario 3: 30초 타임아웃
- **Given**: ox.submitted 후 35초 뒤 progress.updated → **Then**: 누락으로 카운트

### Scenario 4: 일간 리포트
- **Given**: Cron 실행 → **Then**: `{ total, missing, failRate }` 출력

### Scenario 5: 이벤트 0건 — 안전
- **Given**: ox.submitted 0건 → **Then**: failRate 0, 알림 없음

### Scenario 6: 대시보드 통합
- **Given**: FR-KPI-009 → **Then**: OX→진도 실패율 카드

## :gear: Technical & Non-Functional Constraints
- **타임아웃**: ox.submitted 후 30초 이내 progress.updated 필요
- **Cron 주기**: 일 1회
- **금지**: 개별 사용자 실패 건 외부 노출

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 통과 + 대조 Cron + Sev2 알림 + 대시보드

## :construction: Dependencies & Blockers
- **Depends on**: FW-OX-003, NF-OBS-001, CT-DB-009
- **Related**: REQ-NF-009, TS-IT-002
