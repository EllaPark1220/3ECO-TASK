# [Feature] TS-IT-001: OX 통과 → Stamp INSERT → stamp_count → 클라이언트 반영 통합 (동시 100명)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-IT-001: OX 통과 → Stamp INSERT → stamp_count → 클라이언트 반영 통합 테스트 (동시 100명) — REQ-NF-003 ≤500ms 검증"
labels: 'feature, test, integration, ox, stamp, priority:critical, mvp-in, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-IT-001] OX 채점 → Stamp INSERT → stamp_count 갱신 → 클라이언트 SWR mutate 반영의 전체 흐름 통합 테스트 — 동시 100명 시나리오 + REQ-NF-003 (이벤트→UI 델타 p95 ≤500ms) 충족 검증 + INV-04·INV-12 정합 보존
- **목적**: 단위 테스트 (TS-UT-004·007) 외 **End-to-end 흐름 회귀 방지**. 동시 100명 부하에서도 race condition 부재 + 응답 시간 충족 + DB 정합성 (INV) 보존을 자동화로 강제. Story 1 (박지훈 체계감) 의 핵심 흐름.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#3.4.1` — OX → 스탬프 시퀀스
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-001~003 (스탬프 시각·완주율)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-003 (이벤트→UI 델타 ≤500ms)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-04, INV-12
- 외부: Vitest + supertest 또는 Playwright API
- 페르소나: SH-01 박지훈
- 선행: FW-OX-001, CT-DB-005 (Stamp), CT-API-005 (StampMap), CT-MOCK-001~003

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/integration/ox-to-stamp-flow.test.ts`
- [ ] **시나리오 1 — 단일 사용자 정상 흐름**:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { resetTestDb, seedTestData, prismaTest, signInAs } from '@/__tests__/helpers';

  describe('TS-IT-001 OX → Stamp 통합', () => {
    beforeEach(async () => {
      await resetTestDb();
      await seedTestData();  // u1, L001~L010 시드
    });

    it('단일 사용자 — OX 통과 → Stamp INSERT → stampCount 갱신', async () => {
      // 1. 초기 상태
      const initialMap = await fetch('/api/stamp/map', { headers: signInAs('u1') });
      const initial = await initialMap.json();
      expect(initial.earned_count).toBe(0);

      // 2. OX 통과
      const oxResult = await fetch('/api/ox/submit', {
        method: 'POST',
        headers: signInAs('u1'),
        body: JSON.stringify({ lesson_id: 'L001', answer: true }),
      });
      const ox = await oxResult.json();
      expect(ox.passed).toBe(true);
      expect(ox.stampEarned).toBe(true);

      // 3. DB 검증
      const stamp = await prismaTest.stamp.findUnique({
        where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
      });
      expect(stamp).toBeDefined();
      const progress = await prismaTest.lessonProgress.findUnique({
        where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
      });
      expect(progress?.oxCompleted).toBe(true);
      expect(progress?.stampEarned).toBe(true);

      // 4. SWR mutate 시나리오 — Stamp Map 재조회
      const updatedMap = await fetch('/api/stamp/map', { headers: signInAs('u1') });
      const updated = await updatedMap.json();
      expect(updated.earned_count).toBe(1);
      expect(updated.modules[0].lessons.find(l => l.lesson_id === 'L001')?.earned).toBe(true);
    });
  });
  ```
- [ ] **시나리오 2 — 동시 100명 — race condition 부재**:
  ```ts
  it('동시 100명 — race condition 부재 + 모두 stamp INSERT', async () => {
    // 100명 시드 (u1~u100)
    await seedManyUsers(100);

    const promises = Array.from({ length: 100 }, (_, i) =>
      fetch('/api/ox/submit', {
        method: 'POST',
        headers: signInAs(`u${i + 1}`),
        body: JSON.stringify({ lesson_id: 'L001', answer: true }),
      })
    );
    const responses = await Promise.all(promises);

    // 모두 200 + stampEarned: true
    const results = await Promise.all(responses.map(r => r.json()));
    expect(results.every(r => r.passed && r.stampEarned)).toBe(true);

    // DB — Stamp 100건 (사용자별 1건)
    const stamps = await prismaTest.stamp.findMany({ where: { lessonId: 'L001' } });
    expect(stamps.length).toBe(100);
    const distinctUsers = new Set(stamps.map(s => s.userId));
    expect(distinctUsers.size).toBe(100);
  });
  ```
- [ ] **시나리오 3 — 응답 시간 p95 ≤ 500ms (REQ-NF-003)**:
  ```ts
  it('응답 시간 — 100건 p95 ≤ 500ms', async () => {
    await seedManyUsers(100);

    const durations: number[] = [];
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      await fetch('/api/ox/submit', {
        method: 'POST',
        headers: signInAs(`u${i + 1}`),
        body: JSON.stringify({ lesson_id: 'L001', answer: true }),
      });
      durations.push(Date.now() - start);
    }

    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)];
    expect(p95).toBeLessThanOrEqual(500);
  });
  ```
- [ ] **시나리오 4 — 동일 사용자 재시도 (Option B 영구 멱등)**:
  ```ts
  it('동일 사용자 재시도 — Stamp 1건 유지 + 200 응답', async () => {
    // 1차
    await fetch('/api/ox/submit', {
      method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', answer: true }),
    });

    // 2차 (재시도)
    const second = await fetch('/api/ox/submit', {
      method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', answer: true }),
    });
    expect(second.status).toBe(200);
    const secondResult = await second.json();
    expect(secondResult.alreadyEarned).toBe(true);

    const stamps = await prismaTest.stamp.findMany({
      where: { userId: 'u1', lessonId: 'L001' },
    });
    expect(stamps.length).toBe(1);
  });
  ```
- [ ] **시나리오 5 — 오답 시 stamp INSERT 0**:
  ```ts
  it('오답 — stamp INSERT 0', async () => {
    await fetch('/api/ox/submit', {
      method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', answer: false }),  // L001 의 정답이 true 라 가정
    });

    const stamp = await prismaTest.stamp.findUnique({
      where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
    });
    expect(stamp).toBeNull();
  });
  ```
- [ ] **시나리오 6 — INV-04 정합 (stampEarned ⇒ oxCompleted)**:
  ```ts
  it('INV-04 — 100건 처리 후 위반 0', async () => {
    await seedManyUsers(100);
    await Promise.all(Array.from({ length: 100 }, (_, i) =>
      fetch('/api/ox/submit', {
        method: 'POST', headers: signInAs(`u${i + 1}`),
        body: JSON.stringify({ lesson_id: 'L001', answer: true }),
      })
    ));

    const violations = await prismaTest.lessonProgress.findMany({
      where: { stampEarned: true, oxCompleted: false },
    });
    expect(violations.length).toBe(0);
  });
  ```
- [ ] **시나리오 7 — INV-12 정합 (Stamp = LessonProgress(stampEarned))**:
  ```ts
  it('INV-12 — Stamp 카운트 = LessonProgress 카운트', async () => {
    await seedManyUsers(100);
    await Promise.all(Array.from({ length: 100 }, (_, i) =>
      fetch('/api/ox/submit', {
        method: 'POST', headers: signInAs(`u${i + 1}`),
        body: JSON.stringify({ lesson_id: 'L001', answer: true }),
      })
    ));

    const stampCount = await prismaTest.stamp.count();
    const earnedCount = await prismaTest.lessonProgress.count({ where: { stampEarned: true } });
    expect(stampCount).toBe(earnedCount);
  });
  ```
- [ ] **시나리오 8 — EventLog 발행 정합**:
  ```ts
  it('EventLog 발행 — ox.submitted + stamp.earned 각 1건', async () => {
    await fetch('/api/ox/submit', {
      method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', answer: true }),
    });

    const oxEvents = await prismaTest.eventLog.findMany({ where: { event: 'ox.submitted', userId: 'u1' } });
    expect(oxEvents.length).toBe(1);
    const stampEvents = await prismaTest.eventLog.findMany({ where: { event: 'stamp.earned', userId: 'u1' } });
    expect(stampEvents.length).toBe(1);
  });
  ```
- [ ] **시나리오 9 — 10번째 stamp 도달 → FW-OX-004 트리거**:
  ```ts
  it('10번째 stamp — FW-OX-004 트리거 (survey.milestone_email_sent)', async () => {
    // 시나리오 B 시드 활용 — u_stamps10 가 9개 stamp 보유
    // 10번째 OX 통과
    await fetch('/api/ox/submit', {
      method: 'POST', headers: signInAs('u_stamps10_minus1'),
      body: JSON.stringify({ lesson_id: 'L010', answer: true }),
    });

    const milestoneEvent = await prismaTest.eventLog.findFirst({
      where: { event: 'survey.milestone_email_sent', userId: 'u_stamps10_minus1' },
    });
    expect(milestoneEvent).toBeDefined();
  });
  ```
- [ ] **시나리오 10 — 미인증 — 401**:
  ```ts
  it('미인증 — 401', async () => {
    const response = await fetch('/api/ox/submit', {
      method: 'POST',
      // 세션 헤더 부재
      body: JSON.stringify({ lesson_id: 'L001', answer: true }),
    });
    expect(response.status).toBe(401);

    const stamps = await prismaTest.stamp.findMany();
    expect(stamps.length).toBe(0);
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 단일 사용자 정상 흐름
- **Given**: u1 + L001 시드
- **When**: OX 통과
- **Then**: Stamp INSERT + Progress 갱신 + StampMap 응답 갱신

### Scenario 2: 동시 100명 race condition 부재
- **Given**: 100 사용자
- **When**: Promise.all OX 통과
- **Then**: Stamp 100건 + 사용자별 1건

### Scenario 3: p95 ≤ 500ms (REQ-NF-003)
- **Given**: 100건 측정
- **When**: 응답 시간
- **Then**: p95 ≤ 500ms

### Scenario 4: 재시도 — Option B
- **Given**: 1차 통과 후
- **When**: 동일 OX 재시도
- **Then**: Stamp 1건 유지 + alreadyEarned: true

### Scenario 5: 오답 — stamp 0
- **Given**: 오답
- **When**: 호출
- **Then**: Stamp INSERT 0

### Scenario 6: INV-04 정합
- **Given**: 100건 처리
- **When**: 검증
- **Then**: violations 0

### Scenario 7: INV-12 정합
- **Given**: 100건 처리
- **When**: 카운트 비교
- **Then**: 일치

### Scenario 8: EventLog 정합
- **Given**: OX 통과
- **When**: 조회
- **Then**: ox.submitted + stamp.earned 각 1건

### Scenario 9: 10번째 stamp → 트리거
- **Given**: 9 stamp 보유
- **When**: 10번째 OX 통과
- **Then**: survey.milestone_email_sent 발행

### Scenario 10: 미인증 401
- **Given**: 세션 없음
- **When**: 호출
- **Then**: 401 + DB 변경 0

## :gear: Technical & Non-Functional Constraints
- **실제 DB + HTTP 호출 (vitest + supertest 또는 Next.js test client)**: 단위 테스트보다 더 광범위
- **race condition 안전 검증**: PostgreSQL UNIQUE atomic
- **응답 시간 측정 — p95 ≤ 500ms**: 100건 표본
- **INV-04 + INV-12 정합 자동 검증**: 모든 시나리오 종료 후 invariant 체크
- **EventLog 발행 정합**: ox.submitted + stamp.earned + (10자리 시) survey.milestone
- **격리 — beforeEach DB reset**
- **CI 실행 시간**: 본 통합 테스트 ≤ 30초 (100건 처리 + 측정)
- **금지**:
  - mock DB (단위 테스트와 차별화)
  - INV 검증 누락
  - 응답 시간 검증 누락 (회귀 방지)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] 단일 흐름 + 동시 100명 + 재시도 + 오답 + INV 검증
- [ ] EventLog 발행 정합
- [ ] 10번째 stamp 트리거 검증
- [ ] 응답 시간 p95 ≤ 500ms
- [ ] CI 통합
- [ ] 실행 시간 ≤ 30초
- [ ] PR 본문에 "REQ-NF-003 + INV-04·12 회귀 방지 통합" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-OX-001 (OX 채점)
  - FW-OX-003 (EventLog)
  - FW-OX-004 (10자리 트리거)
  - CT-DB-005 (Stamp)
  - CT-API-005 (StampMap)
  - CT-MOCK-001~003
  - IF-CI-001
- **Blocks**:
  - Story 1 (박지훈) 안정성
  - Closed Beta Exit Gate
- **Related**:
  - TS-UT-004 (단위 테스트)
  - TS-UT-007 (Stamp UNIQUE)
  - TS-IT-003 (10자리 → 메일)
