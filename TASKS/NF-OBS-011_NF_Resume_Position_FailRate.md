# [NF] NF-OBS-011: 재개 위치 복원 실패율 ≤1% 모니터링

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-OBS-011: 재개 위치 복원 실패율 ≤1% — QA 시나리오 + 프로덕션 집계 알람"
labels: 'nf, observability, progress, resume, priority:high, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-OBS-011] 영상 재개 위치 복원 실패율 ≤ 1% 모니터링
- **목적**: REQ-NF-010 (재개 위치 복원 실패율 ≤ 1%) 충족. 사용자가 레슨 페이지에 재진입할 때 이전 시청 위치(±5초)로 복원되지 않는 비율을 프로덕션에서 집계. TS-IT-007 (100회 재개 시나리오)의 프로덕션 검증판.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-010
- 선행: TS-IT-007 (재개 복원 통합 테스트), NF-OBS-001

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **복원 이벤트 발행** — FR-PROG-001 확장:
  ```ts
  // 레슨 페이지 마운트 시
  const savedPosition = await getSavedPosition(lessonId);
  const actualPosition = player.getCurrentTime();
  const diff = Math.abs(savedPosition - actualPosition);
  logEvent('progress.resumed', {
    lesson_id: lessonId,
    saved_sec: savedPosition,
    actual_sec: actualPosition,
    diff_sec: diff,
    success: diff <= 5, // ±5초 이내 = 성공
  });
  ```
- [ ] **일간 집계 Cron**:
  ```ts
  const events = await prisma.eventLog.findMany({
    where: { eventName: 'progress.resumed', timestamp: { gte: since } },
  });
  const total = events.length;
  const failures = events.filter(e => !(e.payload as any).success).length;
  const failRate = total > 0 ? (failures / total) * 100 : 0;
  if (failRate > 1) {
    await sendSev2Alert(`재개 복원 실패율 ${failRate.toFixed(2)}% > 1%`);
  }
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 실패율 ≤ 1%
- **Given**: 100회 재개 중 0건 실패 → **Then**: 실패율 0%

### Scenario 2: 실패율 > 1% → Sev2
- **Given**: 100회 중 3건 실패 (3%) → **Then**: Sev2 알림

### Scenario 3: ±5초 기준
- **Given**: 저장 120초, 복원 123초 (3초 차) → **Then**: 성공

### Scenario 4: ±5초 초과
- **Given**: 저장 120초, 복원 130초 (10초 차) → **Then**: 실패

### Scenario 5: 이벤트 발행
- **Given**: 레슨 재진입 → **Then**: `progress.resumed` 이벤트 기록

### Scenario 6: 일간 리포트
- **Given**: Cron 실행 → **Then**: `{ total, failures, failRate }` 출력

## :gear: Technical & Non-Functional Constraints
- **복원 기준**: 저장 위치 대비 ±5초 이내 = 성공 (REQ-NF-010)
- **이벤트**: `progress.resumed` — diff_sec + success 필드
- **Cron**: 일 1회

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 통과 + 이벤트 발행 + Cron + Sev2 알림

## :construction: Dependencies & Blockers
- **Depends on**: TS-IT-007, NF-OBS-001, FR-PROG-001
- **Related**: REQ-NF-010
