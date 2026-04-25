# [Feature] TS-IT-007: 100회 재개 복원 시나리오 — 실패 <2건 + ≤5초 오차

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-IT-007: 영상 재개 복원 100회 시나리오 — 정확성 (실패 <2건) + 위치 오차 ≤5초 + REQ-FUNC-022 검증"
labels: 'feature, test, integration, progress, resume, priority:high, mvp-in, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-IT-007] 영상 재개 복원 (`last_position_sec`) 정확성 통합 테스트 — 100회 시나리오에서 (1) 복원 실패 <2건 + (2) 위치 오차 ≤5초 (REQ-FUNC-022 정합) + Throttle (10초) 의 데이터 손실 검증
- **목적**: REQ-FUNC-022 (재개 복원 정확성) + REQ-FUNC-020 (10초 저장) 의 운영 신뢰성. 페르소나 SH-07 오세은 (출퇴근 학습) 의 핵심 흐름 — 출근길 중단 → 퇴근길 재개 시 마지막 위치에서 자연스러운 학습 재개. 위치 오차 5초 초과는 사용자 불편 (재학습 부담).

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-020 (10초 저장), REQ-FUNC-022 (재개 ≤5초)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-006 (저장 주기)
- 페르소나: SH-07 오세은
- 선행: FW-PROG-001 (saveProgress), FW-PROG-002 (10초 송신 훅), CT-API-003 (Progress)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/integration/resume-100-times.test.ts`
- [ ] **시나리오 1 — 단일 재개 — 위치 정확**:
  ```ts
  it('단일 재개 — last_position_sec 정확', async () => {
    // 1. 시청 + 진도 저장 (position 120)
    await fetch('/api/progress/sync', {
      method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', position_sec: 120 }),
    });

    // 2. 재개 — getLastPosition 조회
    const response = await fetch('/api/progress/L001', { headers: signInAs('u1') });
    const body = await response.json();
    expect(body.last_position_sec).toBe(120);
  });
  ```
- [ ] **시나리오 2 — 100회 시나리오 — 다양한 위치 + 복원 정확성**:
  ```ts
  it('100회 다양한 위치 — 모두 정확 복원', async () => {
    await seedManyUsers(100);

    // 100명 각각 다른 위치 저장
    const positions = Array.from({ length: 100 }, () => Math.floor(Math.random() * 600));
    await Promise.all(positions.map((pos, i) =>
      fetch('/api/progress/sync', {
        method: 'POST', headers: signInAs(`u${i + 1}`),
        body: JSON.stringify({ lesson_id: 'L001', position_sec: pos }),
      })
    ));

    // 100명 재개 시 위치 검증
    let failures = 0;
    for (let i = 0; i < 100; i++) {
      const response = await fetch('/api/progress/L001', { headers: signInAs(`u${i + 1}`) });
      const body = await response.json();
      const expected = positions[i];
      const actual = body.last_position_sec;
      if (Math.abs(actual - expected) > 5) failures++;
    }
    expect(failures).toBeLessThan(2);  // <2건 (REQ-FUNC-022)
  });
  ```
- [ ] **시나리오 3 — Throttle 10초 — 마지막 값 손실 위험 검증**:
  ```ts
  it('10초 throttle — 마지막 값 보존', async () => {
    // 1. position 100 저장
    await fetch('/api/progress/sync', {
      method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', position_sec: 100 }),
    });

    // 2. 5초 대기 후 110 저장 (throttle 보류)
    // 클라이언트 측 throttle 시뮬레이션 — 실제 hook 동작은 TS-UT-005 가 검증
    // 본 통합 테스트는 server-side 만 검증 — 매 호출이 즉시 UPSERT
    await fetch('/api/progress/sync', {
      method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', position_sec: 110 }),
    });

    const response = await fetch('/api/progress/L001', { headers: signInAs('u1') });
    const body = await response.json();
    expect(body.last_position_sec).toBe(110);  // 마지막 값
  });
  ```
- [ ] **시나리오 4 — 다른 lesson 동시 진행 — 격리**:
  ```ts
  it('다른 lesson 동시 진행 — 위치 격리', async () => {
    await fetch('/api/progress/sync', { method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', position_sec: 100 }) });
    await fetch('/api/progress/sync', { method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L002', position_sec: 200 }) });

    const r1 = await fetch('/api/progress/L001', { headers: signInAs('u1') });
    const r2 = await fetch('/api/progress/L002', { headers: signInAs('u1') });
    expect((await r1.json()).last_position_sec).toBe(100);
    expect((await r2.json()).last_position_sec).toBe(200);
  });
  ```
- [ ] **시나리오 5 — Progress 부재 lesson — last_position_sec 0**:
  ```ts
  it('Progress 부재 lesson — 0 반환', async () => {
    const response = await fetch('/api/progress/L010', { headers: signInAs('u1') });
    const body = await response.json();
    expect(body.last_position_sec).toBe(0);
    expect(body.ox_completed).toBe(false);
  });
  ```
- [ ] **시나리오 6 — 응답 시간 — 재개 조회 ≤ 100ms**:
  ```ts
  it('재개 조회 응답 시간 ≤ 100ms', async () => {
    await fetch('/api/progress/sync', { method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', position_sec: 100 }) });

    const durations: number[] = [];
    for (let i = 0; i < 50; i++) {
      const start = Date.now();
      await fetch('/api/progress/L001', { headers: signInAs('u1') });
      durations.push(Date.now() - start);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)];
    expect(p95).toBeLessThanOrEqual(100);
  });
  ```
- [ ] **시나리오 7 — 위치 후퇴 (LWW) 정합**:
  ```ts
  it('위치 후퇴 (60→30) — LWW 허용', async () => {
    await fetch('/api/progress/sync', { method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', position_sec: 60 }) });
    await fetch('/api/progress/sync', { method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', position_sec: 30 }) });  // 후퇴

    const response = await fetch('/api/progress/L001', { headers: signInAs('u1') });
    expect((await response.json()).last_position_sec).toBe(30);  // LWW
  });
  ```
- [ ] **시나리오 8 — 100회 동시 sync — race condition 없음**:
  ```ts
  it('100회 동시 sync — race condition 없음', async () => {
    const positions = Array.from({ length: 100 }, (_, i) => i);
    const promises = positions.map(pos =>
      fetch('/api/progress/sync', {
        method: 'POST', headers: signInAs('u1'),
        body: JSON.stringify({ lesson_id: 'L001', position_sec: pos }),
      })
    );
    await Promise.all(promises);

    const rows = await prismaTest.lessonProgress.findMany({ where: { userId: 'u1', lessonId: 'L001' } });
    expect(rows.length).toBe(1);  // UNIQUE
    expect(rows[0].lastPositionSec).toBeGreaterThanOrEqual(0);
    expect(rows[0].lastPositionSec).toBeLessThan(100);
  });
  ```
- [ ] **시나리오 9 — 미인증 — 401**:
  ```ts
  it('미인증 — 401', async () => {
    const response = await fetch('/api/progress/L001');
    expect(response.status).toBe(401);
  });
  ```
- [ ] **시나리오 10 — 잘못된 lesson_id — 404**:
  ```ts
  it('미존재 lesson — 404', async () => {
    const response = await fetch('/api/progress/L999', { headers: signInAs('u1') });
    expect(response.status).toBe(404);
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 단일 재개 정확
- **Given**: position 120 저장
- **When**: 재개 조회
- **Then**: 120 정확

### Scenario 2: 100회 — 실패 <2건
- **Given**: 100명 다양한 위치
- **When**: 재개
- **Then**: 위치 오차 5초 초과 <2건

### Scenario 3: 마지막 값 보존
- **Given**: 100 → 110
- **When**: 재개
- **Then**: 110

### Scenario 4: 다른 lesson 격리
- **Given**: L001=100, L002=200
- **When**: 재개
- **Then**: 각 정확

### Scenario 5: Progress 부재 — 0
- **Given**: 미시청
- **When**: 재개
- **Then**: 0

### Scenario 6: 응답 시간 ≤ 100ms
- **Given**: 50건 측정
- **When**: 재개
- **Then**: p95 ≤ 100ms

### Scenario 7: LWW 후퇴 허용
- **Given**: 60→30
- **When**: 재개
- **Then**: 30

### Scenario 8: 100회 동시 race 없음
- **Given**: 100건 동시
- **When**: 완료
- **Then**: row 1건

### Scenario 9: 미인증 401
- **Given**: 세션 없음
- **When**: 호출
- **Then**: 401

### Scenario 10: 미존재 lesson 404
- **Given**: L999
- **When**: 호출
- **Then**: 404

## :gear: Technical & Non-Functional Constraints
- **REQ-FUNC-022 ≤5초 오차**: 100회 시나리오 자동 검증
- **실패 <2건 (2%)**: 운영 신뢰성 임계
- **응답 시간 ≤ 100ms (재개)**: 페르소나 SH-07 의 빠른 재개 보장
- **LWW 후퇴 허용**: 사용자 재학습 시나리오
- **race condition 안전**: PostgreSQL UNIQUE
- **CI 실행 시간 ≤ 30초**
- **금지**:
  - 위치 오차 5초 초과 허용 (UX 손상)
  - 미인증 노출
  - race condition 검증 누락

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] 100회 시나리오 + 실패 <2건 검증
- [ ] 응답 시간 ≤ 100ms 측정
- [ ] LWW 후퇴 검증
- [ ] race condition 안전 검증
- [ ] CI 통합
- [ ] PR 본문에 "REQ-FUNC-022 운영 검증 + 페르소나 SH-07" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-PROG-001 (saveProgress)
  - FW-PROG-002 (10초 훅 — TS-UT-005 와 정합)
  - CT-API-003
  - CT-MOCK-002
- **Blocks**:
  - 페르소나 SH-07 운영 신뢰성
  - REQ-FUNC-022 회귀 방지
- **Related**:
  - TS-UT-005 (단위)
  - TS-UT-006 (LWW)
