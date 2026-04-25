# [Feature] TS-IT-009: IndexedDB 큐잉 오프라인 동기화 — Chrome DevTools throttling 시뮬레이션

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-IT-009: 오프라인 IndexedDB 큐잉 → 온라인 시 자동 동기화 통합 — Chrome DevTools 오프라인 throttling + 데이터 손실 0"
labels: 'feature, test, integration, progress, offline, indexeddb, priority:high, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-IT-009] FW-PROG-003 (Antigravity 그룹 7) 의 IndexedDB 오프라인 큐잉 통합 테스트 — 오프라인 상태 (Chrome DevTools throttling) 에서 progress 갱신을 IndexedDB 큐 → 온라인 복귀 시 자동 sync → 데이터 손실 0 + 순서 보존
- **목적**: REQ-FUNC-021 (오프라인 학습) + REQ-NF-018 (회복탄력성) 운영 검증. 페르소나 SH-07 오세은 (지하철 학습 — 신호 단절) 의 핵심 흐름. **Antigravity 그룹 7 의 FW-PROG-003 와 정합** — 본 통합 테스트는 IndexedDB ↔ 서버 sync 정확성 검증.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-021 (오프라인 학습)
  - `/docs/SRS_V0_9.md#4.2.2` — REQ-NF-018 (회복탄력성)
- 외부: IndexedDB API + Chrome DevTools throttling
- 페르소나: SH-07 오세은
- 선행: FW-PROG-003 (오프라인 큐잉, Antigravity 그룹 7), FW-PROG-001, CT-API-003

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/integration/offline-indexeddb-sync.test.ts`
- [ ] **IndexedDB mock — fake-indexeddb**:
  ```ts
  import 'fake-indexeddb/auto';  // npm install fake-indexeddb
  import { offlineQueue } from '@/lib/offline/queue';
  ```
- [ ] **시나리오 1 — 오프라인 시 IndexedDB 큐잉**:
  ```ts
  it('오프라인 시 IndexedDB 큐 INSERT', async () => {
    // 오프라인 시뮬레이션
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });

    // progress 갱신 시도
    await offlineQueue.enqueueProgress({ lesson_id: 'L001', position_sec: 30 });

    // IndexedDB 의 큐 확인
    const queued = await offlineQueue.getQueueSize();
    expect(queued).toBe(1);
  });
  ```
- [ ] **시나리오 2 — 온라인 복귀 시 자동 sync**:
  ```ts
  it('온라인 복귀 — IndexedDB → 서버 sync', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    await offlineQueue.enqueueProgress({ lesson_id: 'L001', position_sec: 30 });

    // 온라인 복귀
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    window.dispatchEvent(new Event('online'));

    await waitFor(async () => {
      const queueSize = await offlineQueue.getQueueSize();
      expect(queueSize).toBe(0);  // 큐 비워짐
    }, { timeout: 5000 });

    // 서버 — progress INSERT
    const progress = await prismaTest.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
    });
    expect(progress?.lastPositionSec).toBe(30);
  });
  ```
- [ ] **시나리오 3 — 다중 큐 항목 — 순서 보존**:
  ```ts
  it('5건 큐 — 순서대로 sync', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });

    // 5건 큐잉 (시간 순)
    for (let i = 0; i < 5; i++) {
      await offlineQueue.enqueueProgress({ lesson_id: 'L001', position_sec: i * 10 });
      await new Promise(r => setTimeout(r, 10));
    }
    expect(await offlineQueue.getQueueSize()).toBe(5);

    // 온라인 복귀
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    window.dispatchEvent(new Event('online'));

    await waitFor(async () => expect(await offlineQueue.getQueueSize()).toBe(0));

    // 서버 — 마지막 값 (40) 보존 (순차 sync 후 LWW)
    const progress = await prismaTest.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
    });
    expect(progress?.lastPositionSec).toBe(40);
  });
  ```
- [ ] **시나리오 4 — 데이터 손실 0**:
  ```ts
  it('100건 큐잉 + 온라인 복귀 — 데이터 손실 0', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false });
    for (let i = 0; i < 100; i++) {
      await offlineQueue.enqueueProgress({ lesson_id: `L${String(i % 10 + 1).padStart(3, '0')}`, position_sec: i });
    }

    Object.defineProperty(navigator, 'onLine', { value: true });
    window.dispatchEvent(new Event('online'));

    await waitFor(async () => expect(await offlineQueue.getQueueSize()).toBe(0), { timeout: 10000 });

    // 서버 — 10개 lesson 의 progress row (마지막 위치)
    const rows = await prismaTest.lessonProgress.findMany({ where: { userId: 'u1' } });
    expect(rows.length).toBe(10);  // L001~L010
  });
  ```
- [ ] **시나리오 5 — sync 중 일부 실패 — 재시도**:
  ```ts
  it('sync 일부 5xx — 재시도 후 성공', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false });
    await offlineQueue.enqueueProgress({ lesson_id: 'L001', position_sec: 30 });

    // 첫 sync 시도 — 5xx (mock)
    let callCount = 0;
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('5xx');
      return new Response('{"ok":true}', { status: 200 });
    });

    Object.defineProperty(navigator, 'onLine', { value: true });
    window.dispatchEvent(new Event('online'));

    await waitFor(async () => expect(await offlineQueue.getQueueSize()).toBe(0), { timeout: 10000 });
    expect(callCount).toBeGreaterThanOrEqual(2);  // 재시도
  });
  ```
- [ ] **시나리오 6 — IndexedDB 손상 — graceful**:
  ```ts
  it('IndexedDB 손상 — 메인 흐름 영향 0', async () => {
    // IndexedDB transaction 실패 mock
    const originalDb = indexedDB;
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('IndexedDB error'); } });

    // 오프라인 큐잉 시도 — silent fail
    await expect(offlineQueue.enqueueProgress({ lesson_id: 'L001', position_sec: 30 }))
      .resolves.not.toThrow();

    vi.unstubAllGlobals();
  });
  ```
- [ ] **시나리오 7 — 큐 크기 한도 (예: 1000건) 초과 — oldest 제거 정책**:
  ```ts
  it('큐 1001건 — oldest 자동 제거', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false });
    for (let i = 0; i < 1001; i++) {
      await offlineQueue.enqueueProgress({ lesson_id: 'L001', position_sec: i });
    }
    const size = await offlineQueue.getQueueSize();
    expect(size).toBe(1000);  // 한도 1000
    // oldest (position_sec: 0) 제거됨
  });
  ```
- [ ] **시나리오 8 — 재시작 (페이지 새로고침) — IndexedDB 보존**:
  ```ts
  it('페이지 새로고침 — IndexedDB 큐 보존', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false });
    await offlineQueue.enqueueProgress({ lesson_id: 'L001', position_sec: 30 });
    expect(await offlineQueue.getQueueSize()).toBe(1);

    // 새로고침 시뮬레이션 — 큐 모듈 재초기화
    vi.resetModules();
    const { offlineQueue: reloadedQueue } = await import('@/lib/offline/queue');

    expect(await reloadedQueue.getQueueSize()).toBe(1);  // 보존
  });
  ```
- [ ] **시나리오 9 — sync 진행 중 인디케이터**:
  ```ts
  it('sync 진행 중 isSyncing flag', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false });
    await offlineQueue.enqueueProgress({ lesson_id: 'L001', position_sec: 30 });

    Object.defineProperty(navigator, 'onLine', { value: true });
    const syncPromise = offlineQueue.flush();
    expect(offlineQueue.isSyncing).toBe(true);

    await syncPromise;
    expect(offlineQueue.isSyncing).toBe(false);
  });
  ```
- [ ] **시나리오 10 — Chrome DevTools 오프라인 throttling 시뮬레이션**:
  ```ts
  it('Chrome DevTools throttling — 오프라인 인지 + 큐잉', async () => {
    // Network throttling — Offline preset
    // Playwright 활용 시 page.context().setOffline(true)
    // Vitest 환경에서는 navigator.onLine + fetch mock 으로 시뮬레이션

    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('NetworkError when attempting to fetch'));
    Object.defineProperty(navigator, 'onLine', { value: false });

    await offlineQueue.enqueueProgress({ lesson_id: 'L001', position_sec: 30 });
    expect(await offlineQueue.getQueueSize()).toBe(1);
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 오프라인 IndexedDB 큐잉
- **Given**: navigator.onLine: false
- **When**: enqueueProgress
- **Then**: IndexedDB 1건

### Scenario 2: 온라인 복귀 sync
- **Given**: 큐 1건
- **When**: online 이벤트
- **Then**: 큐 0 + 서버 INSERT

### Scenario 3: 5건 순서 보존
- **Given**: 시간 순 5건
- **When**: sync
- **Then**: 마지막 값 LWW

### Scenario 4: 100건 손실 0
- **Given**: 100건 큐
- **When**: sync
- **Then**: 10 lesson row 모두 INSERT

### Scenario 5: 일부 실패 재시도
- **Given**: 첫 5xx
- **When**: sync
- **Then**: 재시도 후 성공

### Scenario 6: IndexedDB 손상 graceful
- **Given**: IDB error
- **When**: enqueue
- **Then**: throw 0

### Scenario 7: 큐 한도 1000
- **Given**: 1001건
- **When**: 큐
- **Then**: 1000 + oldest 제거

### Scenario 8: 새로고침 보존
- **Given**: 큐 1건
- **When**: 재초기화
- **Then**: 1건 보존

### Scenario 9: isSyncing flag
- **Given**: sync 중
- **When**: 검사
- **Then**: true

### Scenario 10: Chrome DevTools throttling
- **Given**: 오프라인
- **When**: progress 호출
- **Then**: 큐잉

## :gear: Technical & Non-Functional Constraints
- **fake-indexeddb 활용**: 단위 테스트 환경에서 IndexedDB 시뮬레이션
- **online/offline 이벤트 시뮬레이션**: navigator.onLine + 이벤트 dispatch
- **데이터 손실 0 강제**: 100건 시나리오 검증
- **순서 보존 + LWW**: 시간 순 sync 후 마지막 값 보존
- **재시도 정책**: 5xx 시 재시도 (FW-PROG-003 정의)
- **큐 한도 1000**: oldest 제거 정책
- **새로고침 보존 — IndexedDB persistence**
- **Chrome DevTools throttling 호환 검증**: Playwright (별도 후속) 또는 Vitest mock
- **CI 실행 시간 ≤ 30초**
- **금지**:
  - 데이터 손실 허용
  - 큐 한도 미설정 (메모리 위험)
  - IndexedDB 실패 시 메인 흐름 차단

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] fake-indexeddb 활용
- [ ] 100건 손실 0 검증
- [ ] 재시도 + 큐 한도 + 새로고침 보존
- [ ] CI 통합
- [ ] PR 본문에 "REQ-FUNC-021 + REQ-NF-018 운영 검증" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-PROG-003 (Antigravity 그룹 7)
  - FW-PROG-001
  - CT-API-003
  - npm install fake-indexeddb
- **Blocks**:
  - REQ-FUNC-021 운영 검증
  - 페르소나 SH-07 지하철 학습
- **Related**:
  - TS-UT-005 (throttle 단위)
  - TS-IT-007 (재개)
