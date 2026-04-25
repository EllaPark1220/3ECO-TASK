# [Feature] TS-IT-008: 2기기 동시 재생 충돌 — Realtime 알림 배너 노출

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-IT-008: 2기기 동시 재생 충돌 — Supabase Realtime 알림 배너 노출 + LWW 정합 검증 (FW-PROG-004)"
labels: 'feature, test, integration, progress, multi-device, realtime, priority:high, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-IT-008] 동일 user 가 2개 기기 (모바일 + PC) 에서 동시 lesson 재생 시 — Supabase Realtime 채널 알림 → 다른 기기에서 "다른 기기에서 재생 중" 배너 노출 + LWW 정합 보존 + 사용자 결정 (배너 → "여기서 계속")
- **목적**: REQ-FUNC-024 (다기기 동시 재생 알림) 운영 검증. 페르소나 SH-07 오세은 (출퇴근 전환) 의 경계 시나리오 — PC 재생 중 모바일 재생 시작 시 분열 0. **Antigravity 그룹 7 의 FW-PROG-004 (LWW + Realtime) 와 정합** — 본 통합 테스트는 알림 + UI 흐름 검증.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-024 (다기기)
  - `/docs/SRS_V0_9.md#3.4.3` — 다기기 시퀀스
- 외부: Supabase Realtime
- 페르소나: SH-07 오세은
- 선행: FW-PROG-001, FW-PROG-004 (Realtime, Antigravity 그룹 7), CT-API-003

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/integration/multi-device-realtime.test.ts`
- [ ] **시나리오 1 — 2기기 시뮬레이션 — Realtime 채널 구독**:
  ```ts
  it('2기기 시뮬레이션 — 한 기기에서 재생 시작 시 다른 기기 알림', async () => {
    const u1Device1 = await mockClient(signInAs('u1'));
    const u1Device2 = await mockClient(signInAs('u1'));

    // Device1 — Realtime 채널 구독
    const device1Notifications: any[] = [];
    u1Device1.subscribeToProgressChannel('u1', (event) => {
      device1Notifications.push(event);
    });

    // Device2 — lesson 재생 시작 (progress 갱신)
    await u1Device2.fetch('/api/progress/sync', {
      method: 'POST',
      body: JSON.stringify({ lesson_id: 'L001', position_sec: 30 }),
    });

    // Device1 — 알림 수신 검증 (Realtime broadcast)
    await waitFor(() => expect(device1Notifications.length).toBeGreaterThan(0), { timeout: 2000 });
    expect(device1Notifications[0]).toMatchObject({
      lesson_id: 'L001',
      position_sec: 30,
      source_device: expect.any(String),
    });
  });
  ```
- [ ] **시나리오 2 — UI 배너 노출 시뮬레이션**:
  ```ts
  it('Device1 UI — "다른 기기에서 재생 중" 배너 노출', async () => {
    // 본 검증은 React Testing Library + 클라이언트 hook
    const { getByText, queryByText } = render(<LessonViewer lessonId="L001" />);

    // 초기 — 배너 부재
    expect(queryByText(/다른 기기에서 재생 중/)).toBeNull();

    // Device2 의 progress 갱신 시뮬레이션 (Realtime 채널 broadcast)
    act(() => {
      mockSupabaseRealtime.broadcast('progress.updated', {
        user_id: 'u1', lesson_id: 'L001', position_sec: 30, source_device: 'Device2',
      });
    });

    // 배너 노출 검증
    await waitFor(() => expect(getByText(/다른 기기에서 재생 중/)).toBeInTheDocument());
  });
  ```
- [ ] **시나리오 3 — "여기서 계속" 클릭 — 다른 기기 영향 0 (LWW)**:
  ```ts
  it('"여기서 계속" 클릭 — Device1 의 위치만 갱신', async () => {
    // Device1 에서 클릭
    await fetch('/api/progress/sync', {
      method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', position_sec: 50, source_device: 'Device1' }),
    });

    const final = await prismaTest.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
    });
    expect(final?.lastPositionSec).toBe(50);  // LWW — 마지막 갱신
  });
  ```
- [ ] **시나리오 4 — 다른 사용자 — 알림 미수신**:
  ```ts
  it('다른 사용자 — 알림 broadcast 안됨', async () => {
    const u2Notifications: any[] = [];
    mockSubscribeProgressChannel('u2', (event) => u2Notifications.push(event));

    // u1 이 progress 갱신
    await fetch('/api/progress/sync', {
      method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', position_sec: 30 }),
    });

    await new Promise(r => setTimeout(r, 1000));
    expect(u2Notifications.length).toBe(0);  // 격리
  });
  ```
- [ ] **시나리오 5 — Realtime 채널 권한 — RLS 정합**:
  ```ts
  it('Realtime 채널 — 본인만 구독 가능 (RLS)', async () => {
    // u2 가 u1 의 채널 구독 시도
    expect(() => mockSubscribeProgressChannel('u1', () => {}, signInAs('u2')))
      .toThrow();  // RLS 거부
  });
  ```
- [ ] **시나리오 6 — Realtime 연결 실패 — graceful (silent)**:
  ```ts
  it('Realtime 연결 실패 — 메인 흐름 영향 0', async () => {
    mockSupabaseRealtime.fail();

    const response = await fetch('/api/progress/sync', {
      method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', position_sec: 30 }),
    });
    expect(response.status).toBe(200);  // progress 정상

    const progress = await prismaTest.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
    });
    expect(progress?.lastPositionSec).toBe(30);
  });
  ```
- [ ] **시나리오 7 — 배너 dismiss — 사용자 거부 시 재노출 안함**:
  ```ts
  it('배너 dismiss — 같은 세션 재노출 안함', async () => {
    const { getByText, queryByText, getByLabelText } = render(<LessonViewer lessonId="L001" />);

    act(() => {
      mockSupabaseRealtime.broadcast('progress.updated', { user_id: 'u1', lesson_id: 'L001', position_sec: 30, source_device: 'Device2' });
    });
    await waitFor(() => expect(getByText(/다른 기기에서 재생 중/)).toBeInTheDocument());

    // dismiss
    act(() => {
      getByLabelText('알림 닫기').click();
    });
    expect(queryByText(/다른 기기에서 재생 중/)).toBeNull();

    // 재 broadcast
    act(() => {
      mockSupabaseRealtime.broadcast('progress.updated', { user_id: 'u1', lesson_id: 'L001', position_sec: 40, source_device: 'Device2' });
    });
    // 같은 세션 — 재노출 안함 (UX 정책)
    expect(queryByText(/다른 기기에서 재생 중/)).toBeNull();
  });
  ```
- [ ] **시나리오 8 — Realtime broadcast 응답 시간 ≤ 1초**:
  ```ts
  it('progress 갱신 → 다른 기기 알림 ≤ 1초', async () => {
    const u1Device1Times: number[] = [];
    mockSubscribeProgressChannel('u1', () => u1Device1Times.push(Date.now()));

    const start = Date.now();
    await fetch('/api/progress/sync', {
      method: 'POST', headers: signInAs('u1'),
      body: JSON.stringify({ lesson_id: 'L001', position_sec: 30 }),
    });

    await waitFor(() => expect(u1Device1Times.length).toBeGreaterThan(0), { timeout: 2000 });
    const latency = u1Device1Times[0] - start;
    expect(latency).toBeLessThan(1000);
  });
  ```
- [ ] **시나리오 9 — 동일 기기 자기 알림 미수신 (source_device 매칭)**:
  ```ts
  it('동일 기기에서 broadcast — 자기 알림 미수신', async () => {
    const deviceId = 'device-xyz';
    const notifications: any[] = [];
    mockSubscribeProgressChannel('u1', (event) => {
      if (event.source_device !== deviceId) notifications.push(event);  // 자기 제외
    });

    await fetch('/api/progress/sync', {
      method: 'POST', headers: { ...signInAs('u1'), 'x-device-id': deviceId },
      body: JSON.stringify({ lesson_id: 'L001', position_sec: 30 }),
    });

    await new Promise(r => setTimeout(r, 1500));
    expect(notifications.length).toBe(0);  // 자기 broadcast 제외
  });
  ```
- [ ] **시나리오 10 — INV-12 정합 (LWW 후 정합 보존)**:
  ```ts
  it('INV-12 — 다기기 시나리오 후 정합 보존', async () => {
    await Promise.all([
      fetch('/api/progress/sync', { method: 'POST', headers: signInAs('u1'),
        body: JSON.stringify({ lesson_id: 'L001', position_sec: 30, source_device: 'D1' }) }),
      fetch('/api/progress/sync', { method: 'POST', headers: signInAs('u1'),
        body: JSON.stringify({ lesson_id: 'L001', position_sec: 60, source_device: 'D2' }) }),
    ]);

    const rows = await prismaTest.lessonProgress.findMany({ where: { userId: 'u1', lessonId: 'L001' } });
    expect(rows.length).toBe(1);  // UNIQUE
    expect([30, 60]).toContain(rows[0].lastPositionSec);  // LWW
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: Realtime 채널 알림
- **Given**: 2기기 시뮬레이션
- **When**: Device2 progress 갱신
- **Then**: Device1 알림 수신

### Scenario 2: 배너 노출
- **Given**: broadcast
- **When**: 렌더
- **Then**: "다른 기기에서 재생 중" 배너

### Scenario 3: "여기서 계속" — LWW
- **Given**: Device1 클릭
- **When**: progress 갱신
- **Then**: 마지막 위치 보존

### Scenario 4: 다른 사용자 격리
- **Given**: u1 갱신
- **When**: u2 구독
- **Then**: 알림 0

### Scenario 5: RLS 권한
- **Given**: u2 가 u1 채널
- **When**: 구독 시도
- **Then**: 거부

### Scenario 6: Realtime 실패 graceful
- **Given**: Realtime 5xx
- **When**: progress 갱신
- **Then**: progress 정상

### Scenario 7: 배너 dismiss
- **Given**: dismiss 후
- **When**: 재 broadcast
- **Then**: 재노출 안함

### Scenario 8: latency ≤ 1초
- **Given**: 갱신
- **When**: 알림 도달
- **Then**: ≤ 1초

### Scenario 9: 자기 broadcast 제외
- **Given**: 동일 device_id
- **When**: 본인 갱신
- **Then**: 자기 알림 미수신

### Scenario 10: INV-12 보존
- **Given**: 동시 갱신
- **When**: 검증
- **Then**: row 1건 + LWW

## :gear: Technical & Non-Functional Constraints
- **Supabase Realtime mock**: 채널 broadcast 시뮬레이션
- **RLS 권한 정합**: 본인 채널만
- **자기 broadcast 제외 — source_device 매칭**: 동일 기기 알림 회피
- **dismiss 정책 — 같은 세션 재노출 안함**: UX 노이즈 방지
- **graceful Realtime 실패**: 메인 흐름 영향 0
- **latency ≤ 1초**: 다기기 UX 자연스러움
- **INV-12 LWW 보존**: 동시 갱신 후 row 1건
- **CI 실행 시간 ≤ 30초**
- **금지**:
  - 다른 사용자 알림 broadcast (RLS 위반)
  - Realtime 5xx 시 메인 흐름 차단
  - dismiss 후 재노출 (노이즈)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Realtime mock + 채널 구독 검증
- [ ] 배너 노출 + dismiss + LWW 검증
- [ ] graceful 실패 + latency 측정
- [ ] CI 통합
- [ ] PR 본문에 "REQ-FUNC-024 운영 검증 + Realtime + LWW" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-PROG-001
  - FW-PROG-004 (Realtime, Antigravity 그룹 7)
  - CT-API-003
- **Blocks**:
  - REQ-FUNC-024 운영 검증
  - 페르소나 SH-07 다기기 시나리오
- **Related**:
  - TS-UT-006 (LWW)
  - TS-IT-007 (재개)
