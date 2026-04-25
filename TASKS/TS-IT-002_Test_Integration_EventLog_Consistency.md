# [Feature] TS-IT-002: ox.submitted vs progress.updated 누락률 <0.5% — 일간 EventLog 정합 모니터링

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-IT-002: ox.submitted vs progress.updated EventLog 정합 — 누락률 <0.5% 일간 집계 + Sentry 알림"
labels: 'feature, test, integration, eventlog, observability, priority:high, mvp-in, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-IT-002] OX 채점 시 발행되는 `ox.submitted` (정답+오답 모든 시도) 과 `progress.updated` (진도 갱신) EventLog 의 정합 모니터링 — 일간 집계 시 누락률 <0.5% + 누락 시 Sentry 알림
- **목적**: REQ-NF-008 (이벤트 누락률 <0.5%) 운영 검증. OX 통과 → 진도 갱신 흐름이 비동기 또는 실패 시 누락 가능성 → 운영 데이터 신뢰성 위협. 본 통합 테스트는 **CI 환경에서 단순 검증** + **운영 환경 cron 으로 일간 모니터링** 양쪽 모드 지원.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.4` — REQ-NF-008 (이벤트 누락률)
  - `/docs/SRS_V0_9.md#6.2.2` — EVENT_LOG (`ox.submitted`, `progress.updated`)
  - `/docs/SRS_V0_9.md#6.6` — Observability NF
- 선행: FW-OX-001 (EventLog 발행), FW-PROG-001 (progress.updated 발행), CT-DB-009 (EventLog), TS-IT-001 (정상 흐름 검증)
- 짝: NF-OBS-010 (그룹 14·15 — 운영 모니터링)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/integration/event-log-consistency.test.ts`
- [ ] **시나리오 1 — 단순 정합 — OX 통과 시 두 이벤트 모두 발행**:
  ```ts
  it('OX 통과 — ox.submitted + progress.updated 모두 발행', async () => {
    await fetch('/api/ox/submit', {
      method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', answer: true }),
    });

    const oxEvents = await prismaTest.eventLog.findMany({ where: { event: 'ox.submitted', userId: 'u1' } });
    const progressEvents = await prismaTest.eventLog.findMany({ where: { event: 'progress.updated', userId: 'u1' } });
    expect(oxEvents.length).toBe(1);
    expect(progressEvents.length).toBeGreaterThanOrEqual(1);
  });
  ```
- [ ] **시나리오 2 — OX 오답 — ox.submitted 만 발행 (progress.updated 부재 정합)**:
  ```ts
  it('OX 오답 — ox.submitted 만, progress.updated 미발행', async () => {
    await fetch('/api/ox/submit', {
      method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', answer: false }),
    });

    const oxEvents = await prismaTest.eventLog.findMany({ where: { event: 'ox.submitted', userId: 'u1' } });
    const progressEvents = await prismaTest.eventLog.findMany({ where: { event: 'progress.updated', userId: 'u1' } });
    expect(oxEvents.length).toBe(1);
    expect(progressEvents.length).toBe(0);  // 오답은 진도 갱신 0
  });
  ```
- [ ] **시나리오 3 — 100건 OX 통과 — 누락률 0%**:
  ```ts
  it('100건 OX 통과 — 누락률 0%', async () => {
    await seedManyUsers(100);
    await Promise.all(Array.from({ length: 100 }, (_, i) =>
      fetch('/api/ox/submit', {
        method: 'POST', headers: signInAs(`u${i + 1}`),
        body: JSON.stringify({ lesson_id: 'L001', answer: true }),
      })
    ));

    const oxPassed = await prismaTest.eventLog.count({
      where: {
        event: 'ox.submitted',
        payload: { path: ['passed'], equals: true },
      },
    });
    const progressUpdated = await prismaTest.eventLog.count({ where: { event: 'progress.updated' } });

    const missingRate = (oxPassed - progressUpdated) / oxPassed;
    expect(missingRate).toBeLessThan(0.005);  // <0.5%
  });
  ```
- [ ] **시나리오 4 — 일간 집계 함수 — `lib/observability/event-consistency.ts`**:
  ```ts
  export async function checkEventConsistency(date: Date): Promise<{
    ox_passed: number;
    progress_updated: number;
    missing: number;
    missing_rate: number;
    threshold_exceeded: boolean;
  }> {
    const startOfDay = new Date(date.getTime());
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const oxPassed = await prisma.eventLog.count({
      where: {
        event: 'ox.submitted',
        createdAt: { gte: startOfDay, lt: endOfDay },
        payload: { path: ['passed'], equals: true },
      },
    });

    const progressUpdated = await prisma.eventLog.count({
      where: {
        event: 'progress.updated',
        createdAt: { gte: startOfDay, lt: endOfDay },
      },
    });

    const missing = Math.max(0, oxPassed - progressUpdated);
    const missingRate = oxPassed > 0 ? missing / oxPassed : 0;
    return {
      ox_passed: oxPassed,
      progress_updated: progressUpdated,
      missing,
      missing_rate: missingRate,
      threshold_exceeded: missingRate >= 0.005,
    };
  }
  ```
- [ ] **시나리오 5 — Sentry 알림 — 0.5% 초과 시**:
  ```ts
  it('누락률 0.6% 시뮬레이션 — Sentry 알림 호출', async () => {
    // 의도적 누락 시나리오 — ox.submitted 1000건 + progress.updated 994건
    await seedEventLogScenario({ oxPassed: 1000, progressUpdated: 994 });

    const sentryMock = vi.spyOn(Sentry, 'captureMessage');
    await checkEventConsistency(new Date());

    expect(sentryMock).toHaveBeenCalledWith(
      expect.stringContaining('이벤트 누락률 임계 초과'),
      expect.objectContaining({ level: 'error' }),
    );
  });
  ```
- [ ] **시나리오 6 — 누락률 0.4% — Sentry 미호출**:
  ```ts
  it('누락률 0.4% — 정상 (알림 미호출)', async () => {
    await seedEventLogScenario({ oxPassed: 1000, progressUpdated: 996 });

    const sentryMock = vi.spyOn(Sentry, 'captureMessage');
    const result = await checkEventConsistency(new Date());

    expect(result.missing_rate).toBe(0.004);
    expect(result.threshold_exceeded).toBe(false);
    expect(sentryMock).not.toHaveBeenCalled();
  });
  ```
- [ ] **시나리오 7 — Cron 통합 — 일 1회 자동 실행**:
  ```ts
  // app/api/cron/event-consistency/route.ts
  // 매일 KST 00:30 (UTC 15:30) 실행 — 전일 집계
  it('Cron 호출 — Bearer 인증', async () => {
    const response = await fetch('/api/cron/event-consistency', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.missing_rate).toBeDefined();
  });
  ```
- [ ] **시나리오 8 — 데이터 0건 — graceful**:
  ```ts
  it('OX 0건 일자 — graceful (rate 0)', async () => {
    const result = await checkEventConsistency(new Date('2025-01-01'));
    expect(result.ox_passed).toBe(0);
    expect(result.missing_rate).toBe(0);
    expect(result.threshold_exceeded).toBe(false);
  });
  ```
- [ ] **시나리오 9 — 누락 케이스 reproduce 시나리오 (의도적)**:
  ```ts
  it('progress.updated 발행 실패 시뮬레이션 — 누락 1건', async () => {
    // FW-PROG-001 의 EventLog 발행을 의도적으로 mock 실패
    const emitEventSpy = vi.spyOn(events, 'emitEvent');
    emitEventSpy.mockImplementationOnce(async (input) => {
      if (input.event === 'progress.updated') throw new Error('Network error');
      // 다른 이벤트는 정상
    });

    await fetch('/api/ox/submit', {
      method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', answer: true }),
    });

    const oxPassed = await prismaTest.eventLog.count({ where: { event: 'ox.submitted', userId: 'u1' } });
    const progressUpdated = await prismaTest.eventLog.count({ where: { event: 'progress.updated', userId: 'u1' } });
    expect(oxPassed).toBe(1);
    expect(progressUpdated).toBe(0);  // 의도적 누락
    // 본 시나리오는 silent fail 정책 — Sentry 알림은 cron 집계 시점에서
  });
  ```
- [ ] **시나리오 10 — KPI 응답 통합 (선택)**:
  ```ts
  it('NF-OBS-010 의 응답 통합 — 본 함수 활용', async () => {
    // 운영 KPI 응답에 missing_rate 포함 검증 (그룹 14·15 와 정합)
    // 본 태스크는 함수만 제공. 응답 통합은 별도 후속
    expect(typeof checkEventConsistency).toBe('function');
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: OX 통과 — 두 이벤트 모두
- **Given**: 통과
- **When**: 호출
- **Then**: ox.submitted + progress.updated 각 ≥1건

### Scenario 2: OX 오답 — 부분만
- **Given**: 오답
- **When**: 호출
- **Then**: ox.submitted 1건 + progress.updated 0건

### Scenario 3: 100건 — 누락률 <0.5%
- **Given**: 100건
- **When**: 검증
- **Then**: 누락 0

### Scenario 4: checkEventConsistency 함수
- **Given**: 일자
- **When**: 호출
- **Then**: 4 필드 정상 응답

### Scenario 5: 0.6% 누락 — Sentry 알림
- **Given**: 의도적 누락
- **When**: cron 호출
- **Then**: Sentry captureMessage error level

### Scenario 6: 0.4% 누락 — 알림 미호출
- **Given**: 정상 범위
- **When**: cron
- **Then**: Sentry 미호출

### Scenario 7: Cron Bearer 인증
- **Given**: 정상 토큰
- **When**: 호출
- **Then**: 200 + 결과

### Scenario 8: 데이터 0건 graceful
- **Given**: 빈 일자
- **When**: 호출
- **Then**: rate 0 + threshold_exceeded false

### Scenario 9: 의도적 발행 실패 reproduce
- **Given**: emitEvent mock fail
- **When**: OX 통과
- **Then**: 누락 발생 + cron 검증으로 알림

### Scenario 10: KPI 응답 통합 가능성
- **Given**: 함수
- **When**: 검증
- **Then**: 외부 호출 가능

## :gear: Technical & Non-Functional Constraints
- **이벤트 발행 정책 — silent fail (FW-OX-003 정합)**: 발행 실패가 메인 흐름 영향 0
- **누락률 임계 0.5% — REQ-NF-008**: 임계 환경변수화 검토 (constants 분리)
- **Cron 일 1회 — KST 00:30 (전일 집계)**: GitHub Actions schedule (CT-API-010 정합)
- **Sentry 알림 level: error**: 즉시 인지
- **graceful 0 데이터**: 신규 환경 (Alpha 초반) 안정 동작
- **의도적 reproduce 시나리오**: 운영자가 누락 시 원인 파악 가능
- **KPI 응답 통합 가능**: NF-OBS-010 (그룹 14·15) 와 정합
- **금지**:
  - 임계치 하드코딩 (운영 조정 어려움)
  - silent 알림 부재 (운영자 미인지)
  - cron 인증 우회

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] checkEventConsistency() 함수
- [ ] Cron 라우트 구현
- [ ] Sentry 알림 통합
- [ ] 임계 0.5% 환경변수화
- [ ] 의도적 reproduce 시나리오 동작
- [ ] CI 통합
- [ ] PR 본문에 "REQ-NF-008 자동 검증 + 일간 집계" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-OX-001 + FW-OX-003 (이벤트 발행)
  - FW-PROG-001 (progress.updated 발행)
  - CT-DB-009 (EventLog)
  - TS-IT-001 (정상 흐름)
  - CT-API-010 (Cron 패턴)
- **Blocks**:
  - REQ-NF-008 운영 검증
  - NF-OBS-010 (그룹 14·15)
- **Related**:
  - 운영 SOP — 누락 발견 시 원인 분석
