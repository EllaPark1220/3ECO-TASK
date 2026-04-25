# [Feature] FW-PROG-002: usePositionSync() 훅 — YouTube iframe API 활용 10초 간격 위치 송신

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-PROG-002: usePositionSync() 클라이언트 훅 — YouTube IFrame API + 10초 throttle + saveProgress 호출"
labels: 'feature, frontend, progress, youtube, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-PROG-002] `usePositionSync(lessonId)` React 훅 — YouTube IFrame API 의 `getCurrentTime()` 으로 10초 간격 위치 추출 + FW-PROG-001 의 `saveProgress()` Server Action 자동 호출
- **목적**: Story 4 (오세은) 의 단편 세션 학습자가 의도적인 저장 액션 없이도 시청 위치가 자동 저장되어 다음 진입 시 복원되도록 한다. REQ-FUNC-020 (10초 간격 저장) + REQ-NF-006 (저장 주기 ≤10s) 의 클라이언트 진입점이며, FW-PROG-001 (Server Action) 의 호출자.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-020 (10초 간격 저장)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-006 (저장 주기 ≤10s)
  - `/docs/SRS_V0_9.md#3.4.3` — 재개 위치 시퀀스 다이어그램
  - `/docs/SRS_V0_9.md#3.5.2` — UC-01 (시청)
- 외부 문서: `https://developers.google.com/youtube/iframe_api_reference`
- 페르소나: SH-07 오세은 (단편 세션)
- 선행: FW-PROG-001 (Server Action), FR-LES-003 (시청 페이지 — iframe 호스트)
- 짝: FR-PROG-001 (재개 복원 — 본 훅이 저장한 데이터 활용)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/lesson/[id]/hooks/usePositionSync.ts` 신규 파일
- [ ] **YouTube IFrame API 로드** — Next.js Script 컴포넌트 활용 (FR-LES-003 와 정합):
  ```tsx
  // app/lesson/[id]/page.tsx 또는 LessonPlayer.tsx
  import Script from 'next/script';
  <Script src="https://www.youtube.com/iframe_api" strategy="afterInteractive" />
  ```
- [ ] **YT 객체 글로벌 등록** — IFrame API 가 `window.YT` 와 `window.onYouTubeIframeAPIReady` 활용
- [ ] **`usePositionSync(lessonId, playerRef)` 훅 정의**:
  ```ts
  import { useEffect, useRef } from 'react';
  import { saveProgress } from '@/lib/services/progress';

  export function usePositionSync(lessonId: string, playerRef: React.MutableRefObject<YT.Player | null>) {
    const lastSentRef = useRef<number>(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
      // 10초마다 currentTime 조회 + 변화 시 saveProgress 호출
      intervalRef.current = setInterval(async () => {
        const player = playerRef.current;
        if (!player || typeof player.getCurrentTime !== 'function') return;

        // 재생 중일 때만 저장
        const playerState = player.getPlayerState?.();
        if (playerState !== YT.PlayerState.PLAYING) return;

        const currentTime = Math.floor(player.getCurrentTime());

        // 직전 저장값과 동일하면 skip (DB·네트워크 부하 경감)
        if (currentTime === lastSentRef.current) return;

        try {
          await saveProgress({ lesson_id: lessonId, position_sec: currentTime });
          lastSentRef.current = currentTime;
        } catch (error) {
          // 401 → 무시 (미인증 사용자, IndexedDB 큐잉은 FW-PROG-003)
          // 5xx → 다음 시도에서 재전송
          console.error('saveProgress failed:', error);
        }
      }, 10_000);

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }, [lessonId, playerRef]);
  }
  ```
- [ ] **`onUnload` 시 마지막 위치 저장 — `beforeunload` 이벤트**:
  ```ts
  useEffect(() => {
    const handleUnload = () => {
      const player = playerRef.current;
      if (!player) return;
      const currentTime = Math.floor(player.getCurrentTime());
      // navigator.sendBeacon 활용 (페이지 닫힐 때도 안정 전송)
      navigator.sendBeacon('/api/progress/sync', JSON.stringify({ lesson_id: lessonId, position_sec: currentTime }));
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [lessonId, playerRef]);
  ```
- [ ] **`/api/progress/sync` Route Handler** — sendBeacon 의 transport 진입점 (saveProgress 와 동일 로직, sendBeacon 의 경우 Server Action 직접 호출 어려움)
- [ ] **YT.Player 타입 정의** — `npm install --save-dev @types/youtube`
- [ ] **iframe 초기화 시 player 객체 생성** (FR-LES-003 와 정합):
  ```tsx
  const playerRef = useRef<YT.Player | null>(null);

  useEffect(() => {
    if (!window.YT) return;
    playerRef.current = new window.YT.Player('youtube-iframe', {
      events: {
        onReady: (event) => { /* FR-PROG-001 의 seekTo 호출 */ },
        onStateChange: (event) => { /* 재생 상태 추적 */ },
      },
    });
  }, []);

  usePositionSync(lessonId, playerRef);
  ```
- [ ] **메모리 누수 방지** — useEffect cleanup 에서 setInterval clear + event listener 제거
- [ ] **재생 일시정지·종료 시 처리**:
  - 일시정지 — interval 계속 돌지만 `getPlayerState() !== PLAYING` 이라 skip
  - 종료 (영상 끝) — 마지막 위치 1회 저장 후 interval 자동 종료 (선택)
- [ ] **다중 탭 처리**: 동일 사용자가 여러 탭에서 시청 시 — 각 탭이 자체 interval. 마지막 저장값 우선 (LWW — FW-PROG-001 가 처리)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 시청 — 10초 간격 저장
- **Given**: 로그인 사용자 + lesson L001 시청 시작
- **When**: 30초 시청 (재생 상태 유지)
- **Then**: `saveProgress({ lesson_id: 'L001', position_sec: 10 })`, `position_sec: 20`, `position_sec: 30` 3회 호출. DB lastPositionSec=30

### Scenario 2: 일시정지 — 저장 안함
- **Given**: 시청 중 일시정지
- **When**: 일시정지 상태에서 30초 경과
- **Then**: saveProgress 호출 0회 (PLAYING 상태가 아니므로)

### Scenario 3: 재생 재개 — 다시 저장
- **Given**: Scenario 2 직후 재생 재개
- **When**: 10초 추가 시청
- **Then**: saveProgress 1회 호출

### Scenario 4: 동일 위치 — 중복 저장 방지
- **Given**: 일시정지 직전 currentTime=30 으로 저장
- **When**: 일시정지 → 재생 (currentTime 여전히 30)
- **Then**: 동일 30 으로 호출 skip (lastSentRef 비교). 변화 시점부터 재저장

### Scenario 5: 페이지 unload 시 마지막 저장
- **Given**: currentTime=45 시점에서 페이지 닫기
- **When**: `beforeunload` 이벤트
- **Then**: `navigator.sendBeacon('/api/progress/sync', ...)` 호출. DB 에 lastPositionSec=45 저장

### Scenario 6: 401 응답 — 무시 + 다음 시도
- **Given**: 세션 만료 상태에서 saveProgress 호출
- **When**: 401 응답
- **Then**: console.error 로그 + 다음 10초 후 재시도. 사용자 무인지 (graceful degradation)

### Scenario 7: 메모리 누수 부재
- **Given**: 사용자가 다른 페이지로 이동
- **When**: useEffect cleanup
- **Then**: setInterval clear + event listener 제거. 메모리 누수 0

### Scenario 8: 다중 탭 — 각 탭 독립 저장
- **Given**: 동일 사용자가 두 탭에서 동일 lesson 시청
- **When**: 두 탭 모두 30초 시점에서 저장
- **Then**: 각 탭이 독립 호출. 최후 저장값 우선 (FW-PROG-001 의 LWW)

### Scenario 9: 네트워크 단절 → 복구
- **Given**: 시청 중 5초간 오프라인
- **When**: 오프라인 → 온라인 복구
- **Then**: 다음 10초 interval 에서 정상 호출. 단절 중 위치는 손실 (IndexedDB 큐잉은 FW-PROG-003 가 처리)

### Scenario 10: 비로그인 사용자
- **Given**: 세션 없는 사용자
- **When**: 시청
- **Then**: 401 응답 반복. 사용자는 시청 가능하지만 진도 저장 안됨 (정책 채택)

## :gear: Technical & Non-Functional Constraints
- **YouTube IFrame API**: 정식 API 만 사용 (`https://www.youtube.com/iframe_api`). 비공식 API 또는 스크래핑 금지
- **재생 상태 검증**: `YT.PlayerState.PLAYING` (=1) 일 때만 저장. PAUSED·BUFFERING·ENDED 시 skip
- **중복 저장 방지**: `lastSentRef` 비교로 동일 currentTime 호출 skip
- **sendBeacon vs fetch 정책**:
  - 정상 페이지 활성 시 — fetch (Server Action)
  - 페이지 unload 시 — sendBeacon (안정 전송)
- **메모리 누수 방지**: useEffect cleanup 필수. setInterval + event listener 모두 제거
- **에러 처리**: 401·5xx 모두 graceful (사용자 무인지). 다음 interval 재시도
- **응답 시간**: 본 훅의 saveProgress 호출이 사용자 UX 영향 0 (백그라운드)
- **저장 빈도**: 10초 정확. setInterval 의 drift 는 누적 < 1초 (1시간 시청 기준). 정밀도 충분
- **YouTube iframe sandbox**: cross-origin 이라 직접 DOM 접근 불가. IFrame API 의 `getCurrentTime()` 활용
- **금지**:
  - 자체 video 태그 사용 (ADR-005 위반)
  - 비공식 YouTube API
  - 5초·15초 같은 임의 간격 (REQ-FUNC-020 의 10초 정합 위반)
  - 일시정지 중 저장 (DB 부하 + 사용자 의도 위배)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `usePositionSync.ts` 훅 구현
- [ ] YouTube IFrame API 통합 (FR-LES-003 와 정합)
- [ ] beforeunload + sendBeacon 통합
- [ ] `/api/progress/sync` Route Handler 추가
- [ ] 메모리 누수 부재 검증 (Chrome DevTools Memory profile)
- [ ] 다중 탭 시나리오 검증
- [ ] PR 본문에 "Story 4 의 자동 저장 진입점. FW-PROG-001 의 호출자" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-PROG-001 (saveProgress Server Action)
  - FR-LES-003 (시청 페이지 + iframe)
  - CT-API-003 (saveProgress DTO)
  - YouTube IFrame API (외부)
- **Blocks**:
  - FR-PROG-001 (재진입 위치 복원 — 본 훅이 저장한 데이터 활용)
  - FW-PROG-003 (IndexedDB 큐잉 — 본 훅의 401·5xx 응답 처리 확장)
  - FW-PROG-004 (다기기 LWW + 알림 배너)
  - TS-E2E-002 (오세은 E2E — 본 훅 동작 검증)
- **Related**:
  - REQ-FUNC-020·024 (다기기) · REQ-NF-006
