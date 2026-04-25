# [Feature] TS-UT-005: saveProgress 10초 간격 병합 단위 테스트 — 10초 내 3회 → 1회 UPSERT 검증

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-UT-005: FW-PROG-002 단위 테스트 — 클라이언트 측 throttle 로 10초 내 다중 호출이 1회 UPSERT 로 병합 검증"
labels: 'feature, test, unit, progress, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-UT-005] FW-PROG-002 (10초 송신 훅) 의 throttle 로직 단위 테스트 — 클라이언트가 10초 내에 progress 갱신 3회 호출해도 서버 UPSERT 는 정확히 1회 (또는 10초 경계마다 1회) 로 병합되는지 검증
- **목적**: REQ-FUNC-020 (10초 간격 저장) + REQ-NF-006 (저장 주기 ≤10s) + REQ-NF-019 (사용자 트래픽 효율) 회귀 방지. Client-side throttle 의 정확성 보장 — 매 초마다 호출하면 분당 60 req → 10초 throttle 시 분당 6 req 로 감소.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-020 (10초 간격 저장)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-006 (저장 주기)
  - `/docs/SRS_V0_9.md#6.2.2` — LESSON_PROGRESS 테이블
- 외부: `https://lodash.com/docs/4.17.15#throttle` (참고 — 자체 구현 가능)
- 선행: FW-PROG-002 (10초 송신 훅), CT-API-003 (Progress DTO)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/hooks/use-progress-sync.test.ts`
- [ ] **vi.useFakeTimers() 활용** — 시간 조작:
  ```ts
  import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
  import { renderHook, act } from '@testing-library/react';
  import { useProgressSync } from '@/hooks/use-progress-sync';

  describe('FW-PROG-002 useProgressSync 10초 throttle', () => {
    let saveProgressSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers();
      saveProgressSpy = vi.fn().mockResolvedValue({ ok: true });
      // saveProgress Server Action mock
      vi.mock('@/lib/services/progress', () => ({
        saveProgress: saveProgressSpy,
      }));
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.clearAllMocks();
    });

    // ... 시나리오들
  });
  ```
- [ ] **시나리오 1 — 첫 호출 즉시 발사**:
  ```ts
  it('첫 호출 시 즉시 saveProgress 발사', async () => {
    const { result } = renderHook(() => useProgressSync('L001'));

    act(() => {
      result.current.update(10);  // position 10초
    });

    await vi.runOnlyPendingTimersAsync();
    expect(saveProgressSpy).toHaveBeenCalledTimes(1);
    expect(saveProgressSpy).toHaveBeenCalledWith({ lesson_id: 'L001', position_sec: 10 });
  });
  ```
- [ ] **시나리오 2 — 10초 내 3회 호출 → 1회 UPSERT (마지막 값)**:
  ```ts
  it('10초 내 3회 호출 → 1회 UPSERT (throttle)', async () => {
    const { result } = renderHook(() => useProgressSync('L001'));

    // 0초 — 첫 호출 (즉시 발사)
    act(() => result.current.update(10));
    await vi.runOnlyPendingTimersAsync();
    expect(saveProgressSpy).toHaveBeenCalledTimes(1);

    // 3초 — 두 번째 (throttle 으로 보류)
    vi.advanceTimersByTime(3000);
    act(() => result.current.update(13));
    expect(saveProgressSpy).toHaveBeenCalledTimes(1);  // 미발사

    // 6초 — 세 번째 (throttle 으로 보류)
    vi.advanceTimersByTime(3000);
    act(() => result.current.update(16));
    expect(saveProgressSpy).toHaveBeenCalledTimes(1);  // 미발사

    // 10초 경계 — 마지막 값 발사
    vi.advanceTimersByTime(4000);  // 총 10초
    await vi.runOnlyPendingTimersAsync();
    expect(saveProgressSpy).toHaveBeenCalledTimes(2);  // 두 번째 호출
    expect(saveProgressSpy).toHaveBeenLastCalledWith({ lesson_id: 'L001', position_sec: 16 });  // 마지막 값
  });
  ```
- [ ] **시나리오 3 — 10초 후 단일 호출 → 정상 발사**:
  ```ts
  it('10초 경계 후 단일 호출 — 정상 발사', async () => {
    const { result } = renderHook(() => useProgressSync('L001'));

    act(() => result.current.update(10));
    vi.advanceTimersByTime(11000);  // 11초 후
    act(() => result.current.update(20));
    await vi.runOnlyPendingTimersAsync();

    expect(saveProgressSpy).toHaveBeenCalledTimes(2);
    expect(saveProgressSpy).toHaveBeenLastCalledWith({ lesson_id: 'L001', position_sec: 20 });
  });
  ```
- [ ] **시나리오 4 — 분당 60회 호출 → 약 6회 UPSERT**:
  ```ts
  it('분당 60회 호출 → throttle 후 약 6회 (10초 간격)', async () => {
    const { result } = renderHook(() => useProgressSync('L001'));

    for (let i = 0; i < 60; i++) {
      act(() => result.current.update(i));
      vi.advanceTimersByTime(1000);  // 1초 간격
    }
    await vi.runOnlyPendingTimersAsync();

    // 60초 동안 10초 간격 → 6회 (또는 7회 — 0초 첫 호출 + 10·20·30·40·50초)
    expect(saveProgressSpy.mock.calls.length).toBeGreaterThanOrEqual(6);
    expect(saveProgressSpy.mock.calls.length).toBeLessThanOrEqual(7);
  });
  ```
- [ ] **시나리오 5 — visibilitychange (페이지 hidden) 시 즉시 flush**:
  ```ts
  it('페이지 hidden 시 throttle 무시하고 즉시 발사', async () => {
    const { result } = renderHook(() => useProgressSync('L001'));

    act(() => result.current.update(10));
    await vi.runOnlyPendingTimersAsync();
    expect(saveProgressSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3000);
    act(() => result.current.update(13));
    expect(saveProgressSpy).toHaveBeenCalledTimes(1);  // throttle 보류

    // 페이지 hidden 이벤트
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.runOnlyPendingTimersAsync();

    // 즉시 flush — 보류된 값 발사
    expect(saveProgressSpy).toHaveBeenCalledTimes(2);
    expect(saveProgressSpy).toHaveBeenLastCalledWith({ lesson_id: 'L001', position_sec: 13 });
  });
  ```
- [ ] **시나리오 6 — beforeunload 시 sendBeacon 활용**:
  ```ts
  it('beforeunload 시 sendBeacon 으로 발사', async () => {
    const sendBeaconSpy = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeaconSpy, writable: true });

    const { result } = renderHook(() => useProgressSync('L001'));
    act(() => result.current.update(15));

    window.dispatchEvent(new Event('beforeunload'));

    expect(sendBeaconSpy).toHaveBeenCalledWith(
      '/api/progress/sync',
      expect.any(Blob),  // JSON Blob
    );
  });
  ```
- [ ] **시나리오 7 — 동일 position 반복 호출 — 추가 발사 없음**:
  ```ts
  it('동일 position 반복 호출 — 중복 UPSERT 방지', async () => {
    const { result } = renderHook(() => useProgressSync('L001'));

    act(() => result.current.update(10));
    vi.advanceTimersByTime(11000);
    act(() => result.current.update(10));  // 동일 값
    await vi.runOnlyPendingTimersAsync();

    // 두 번째 호출은 발사 안함 (throttle + 동일 값 dedup)
    expect(saveProgressSpy).toHaveBeenCalledTimes(1);
  });
  ```
- [ ] **시나리오 8 — 컴포넌트 unmount 시 pending 발사**:
  ```ts
  it('컴포넌트 unmount 시 pending 즉시 발사', async () => {
    const { result, unmount } = renderHook(() => useProgressSync('L001'));

    act(() => result.current.update(10));
    vi.advanceTimersByTime(3000);
    act(() => result.current.update(13));

    unmount();
    await vi.runOnlyPendingTimersAsync();

    expect(saveProgressSpy).toHaveBeenCalledTimes(2);  // 첫 호출 + unmount flush
  });
  ```
- [ ] **시나리오 9 — saveProgress 실패 시 graceful (재시도 안함)**:
  ```ts
  it('saveProgress 실패 시 graceful — 다음 호출 정상 진행', async () => {
    saveProgressSpy.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useProgressSync('L001'));

    act(() => result.current.update(10));
    await vi.runOnlyPendingTimersAsync();
    expect(saveProgressSpy).toHaveBeenCalledTimes(1);  // 실패

    vi.advanceTimersByTime(11000);
    act(() => result.current.update(20));
    await vi.runOnlyPendingTimersAsync();
    expect(saveProgressSpy).toHaveBeenCalledTimes(2);  // 다음 호출 정상
  });
  ```
- [ ] **시나리오 10 — lessonId 변경 시 새 throttle context**:
  ```ts
  it('lessonId 변경 시 새 throttle context (즉시 발사)', async () => {
    const { result, rerender } = renderHook(({ id }) => useProgressSync(id), {
      initialProps: { id: 'L001' },
    });

    act(() => result.current.update(10));
    await vi.runOnlyPendingTimersAsync();
    expect(saveProgressSpy).toHaveBeenCalledTimes(1);

    // lesson 변경
    rerender({ id: 'L002' });
    act(() => result.current.update(5));
    await vi.runOnlyPendingTimersAsync();
    expect(saveProgressSpy).toHaveBeenCalledTimes(2);  // L002 첫 호출 즉시 발사
    expect(saveProgressSpy).toHaveBeenLastCalledWith({ lesson_id: 'L002', position_sec: 5 });
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 첫 호출 즉시 발사
- **Given**: 훅 초기화 + position 10
- **When**: update(10) 호출
- **Then**: saveProgress 1회 호출 (즉시)

### Scenario 2: 10초 내 3회 → 1회 UPSERT (throttle)
- **Given**: 첫 호출 후
- **When**: 3초·6초에 추가 호출
- **Then**: 보류. 10초 경계에 1회 추가 발사 (마지막 값)

### Scenario 3: 분당 60회 → 약 6회 UPSERT
- **Given**: 1초 간격 60회 호출
- **When**: 60초 후
- **Then**: 6~7회 발사

### Scenario 4: 페이지 hidden 시 즉시 flush
- **Given**: 보류된 값 존재
- **When**: visibilitychange 이벤트
- **Then**: 즉시 발사

### Scenario 5: beforeunload sendBeacon
- **Given**: 보류 값
- **When**: beforeunload
- **Then**: sendBeacon 호출

### Scenario 6: 동일 position dedup
- **Given**: 동일 값 반복
- **When**: 호출
- **Then**: 추가 UPSERT 0

### Scenario 7: unmount 시 pending flush
- **Given**: 보류 값
- **When**: 컴포넌트 unmount
- **Then**: 즉시 발사

### Scenario 8: 실패 시 graceful
- **Given**: 첫 호출 실패
- **When**: 다음 호출
- **Then**: 정상 발사

### Scenario 9: lessonId 변경 — 새 context
- **Given**: L001 호출 후
- **When**: L002 로 변경 + 호출
- **Then**: L002 첫 호출 즉시 발사

### Scenario 10: position 0 허용
- **Given**: position 0 (lesson 시작)
- **When**: 호출
- **Then**: 정상 발사

## :gear: Technical & Non-Functional Constraints
- **vi.useFakeTimers() 활용**: 정확한 시간 제어
- **renderHook + act**: React Hook 단위 테스트
- **mock saveProgress**: DB 미접근 (단위 테스트 격리)
- **throttle 동작 — 첫 호출 즉시 + 마지막 값 보류**: lodash throttle 또는 자체 구현
- **visibilitychange + beforeunload + unmount 시 flush**: 데이터 손실 방지
- **동일 position dedup**: 불필요한 UPSERT 방지
- **에러 graceful**: 단일 실패가 다음 호출 영향 0
- **lessonId 변경 시 새 context**: throttle 격리
- **응답 시간**: 단위 테스트 자체 ≤ 5초 (전체 10 시나리오)
- **금지**:
  - DB 접근 (단위 테스트 격리 위반)
  - 실제 timer 사용 (느림)
  - flush 누락 (데이터 손실)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `__tests__/hooks/use-progress-sync.test.ts` 작성
- [ ] vi.useFakeTimers() 활용 검증
- [ ] throttle 동작 검증 (3가지 모드 — 즉시·보류·flush)
- [ ] visibility/beforeunload/unmount 모든 flush 시점 검증
- [ ] 동일 position dedup 검증
- [ ] 에러 graceful 검증
- [ ] CI 통합 검증
- [ ] PR 본문에 "REQ-FUNC-020 회귀 방지 + REQ-NF-006 효율" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-PROG-002 (10초 송신 훅 — 본 테스트 대상)
  - CT-API-003 (Progress DTO)
  - IF-CI-001 (워크플로)
- **Blocks**:
  - FW-PROG-002 의 안정 운영
  - REQ-FUNC-020 회귀 방지
- **Related**:
  - TS-UT-006 (LWW 충돌)
  - FW-PROG-003 (오프라인 큐잉 — 그룹 7)
