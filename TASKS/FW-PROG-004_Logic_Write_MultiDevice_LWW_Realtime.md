# [Feature] FW-PROG-004: 다기기 동시 재생 Last-Write-Wins UPSERT + 알림 배너

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-PROG-004: 다기기 동시 재생 LWW UPSERT + Supabase Realtime 알림 배너 — 충돌 감지·사용자 안내"
labels: 'feature, fullstack, progress, multi-device, realtime, priority:high, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-PROG-004] 다기기 동시 재생 Last-Write-Wins UPSERT + 충돌 감지 알림 배너 (Supabase Realtime 또는 SSE)
- **목적**: Story 4 (오세은) 의 다기기 학습 시나리오 — 스마트폰에서 시청 중 PC로 전환하거나, 두 기기에서 동시 재생 시 진도 데이터 충돌을 LWW(Last-Write-Wins) 전략으로 자동 해결하고, 사용자에게 "다른 기기에서 재생 중" 알림 배너를 노출하여 혼란을 방지한다. REQ-FUNC-024 (다기기 동시 재생 충돌 해결 + 알림) · §6.3.4 (다기기 LWW 시퀀스) 를 충족.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-024 (다기기 동시 재생 충돌 해결)
  - `/docs/SRS_V0_9.md#6.3.4` — 다기기 LWW 시퀀스 다이어그램
  - `/docs/SRS_V0_9.md#3.4.3` — 재개 위치 시퀀스
  - `/docs/SRS_V0_9.md#3.5.2` — UC-04 (재개 위치 복원)
  - `/docs/SRS_V0_9.md#6.2.2` — LESSON_PROGRESS 테이블 (updatedAt 컬럼)
- 페르소나: SH-07 오세은 (스마트폰↔PC 학습 전환)
- 선행: FW-PROG-001 (saveProgress — LWW UPSERT 기반)
- 외부 문서: `https://supabase.com/docs/guides/realtime`

## :white_check_mark: Task Breakdown (실행 계획)

### Backend — LWW UPSERT 강화
- [ ] **FW-PROG-001 의 saveProgress 확장** — `updatedAt` 비교 로직 추가:
  ```ts
  // 기존 UPSERT 에 추가
  const existing = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
    select: { updatedAt: true, lastPositionSec: true }
  });

  // LWW: 서버 시각 기준 — 항상 최신 write 가 이김
  const result = await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId, lastPositionSec: positionSec, updatedAt: new Date() },
    update: { lastPositionSec: positionSec, updatedAt: new Date() },
  });
  ```
- [ ] **충돌 감지 플래그** — 기존 `updatedAt` 과 요청 시각 비교:
  - 직전 `updatedAt` 이 현재 요청보다 5초 이내이고, `lastPositionSec` 차이가 10초 이상이면 → "다른 기기 의심"
  - 응답에 `conflict_detected: true` 플래그 추가 (선택)
- [ ] **Supabase Realtime 채널 발행** — `saveProgress()` 성공 시 Realtime broadcast:
  ```ts
  // lib/services/progress.ts
  import { createClient } from '@supabase/supabase-js';

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // 진도 저장 후 Realtime broadcast
  await supabase.channel(`progress:${userId}`)
    .send({
      type: 'broadcast',
      event: 'progress_updated',
      payload: {
        lesson_id: lessonId,
        position_sec: positionSec,
        updated_at: new Date().toISOString(),
        device_id: deviceId, // 요청 헤더 또는 클라이언트 생성 UUID
      },
    });
  ```

### Frontend — 알림 배너 컴포넌트
- [ ] `app/lesson/[id]/components/MultiDeviceBanner.tsx` — 충돌 감지 시 알림 배너:
  ```tsx
  'use client';
  import { useEffect, useState } from 'react';
  import { createBrowserClient } from '@supabase/ssr';

  interface MultiDeviceBannerProps {
    userId: string;
    lessonId: string;
    currentDeviceId: string;
  }

  export function MultiDeviceBanner({ userId, lessonId, currentDeviceId }: MultiDeviceBannerProps) {
    const [showBanner, setShowBanner] = useState(false);

    useEffect(() => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const channel = supabase
        .channel(`progress:${userId}`)
        .on('broadcast', { event: 'progress_updated' }, (payload) => {
          // 다른 기기에서 동일 lesson 의 진도가 갱신됨
          if (payload.payload.lesson_id === lessonId &&
              payload.payload.device_id !== currentDeviceId) {
            setShowBanner(true);
            // 10초 후 자동 닫힘
            setTimeout(() => setShowBanner(false), 10_000);
          }
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }, [userId, lessonId, currentDeviceId]);

    if (!showBanner) return null;

    return (
      <div role="alert" aria-live="polite" className="multi-device-banner">
        <span>📱 다른 기기에서 이 영상을 재생 중입니다. 현재 기기의 진도가 자동 동기화됩니다.</span>
        <button onClick={() => setShowBanner(false)} aria-label="알림 닫기">✕</button>
      </div>
    );
  }
  ```
- [ ] **CSS 스타일링** — 배너는 레슨 페이지 상단 고정:
  ```css
  .multi-device-banner {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    color: #1a1a1a;
    font-size: 14px;
    border-radius: 0 0 8px 8px;
    animation: slideDown 0.3s ease-out;
  }
  ```
- [ ] **Device ID 생성** — `lib/device/deviceId.ts`:
  ```ts
  const DEVICE_ID_KEY = '3eco-device-id';

  export function getDeviceId(): string {
    if (typeof window === 'undefined') return 'server';
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }
  ```
- [ ] **레슨 페이지 통합** — `app/lesson/[id]/page.tsx` 에 `<MultiDeviceBanner />` 삽입

### SSE 대안 (Supabase Realtime 미사용 시)
- [ ] **대안 A**: Server-Sent Events (SSE) — `/api/progress/stream` Route Handler
  - `ReadableStream` + `TextEncoder` 로 SSE 구현
  - DB polling 1초 간격 (Realtime 에 비해 비효율적)
  - Supabase Realtime 이 Free 플랜에서 제한 있을 경우의 폴백
- [ ] **최종 결정**: Supabase Realtime 채택 (Free 플랜에서 최대 200 concurrent connections — MVP 충분)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 두 기기 동시 재생 — LWW 적용
- **Given**: Device A (스마트폰)에서 L001 시청 중 (position_sec=120). Device B (PC) 에서 동일 L001 시청 시작
- **When**: Device B 가 position_sec=200 저장
- **Then**: DB 의 lastPositionSec=200 (최후 값 우선). `updatedAt` 은 Device B 시각

### Scenario 2: 다른 기기 재생 감지 — 알림 배너 노출
- **Given**: Device A 에서 L001 시청 중
- **When**: Device B 에서 동일 L001 의 진도 저장 발생 (Realtime broadcast 수신)
- **Then**: Device A 에 "다른 기기에서 재생 중" 알림 배너 노출. 10초 후 자동 닫힘

### Scenario 3: 동일 기기 — 배너 미노출
- **Given**: Device A 에서 L001 시청 중
- **When**: Device A 자체의 10초 interval 저장
- **Then**: `device_id` 동일 → 배너 미노출

### Scenario 4: 배너 수동 닫기
- **Given**: 알림 배너 노출 중
- **When**: 사용자가 "✕" 버튼 클릭
- **Then**: 배너 즉시 닫힘. 다음 충돌 이벤트까지 미노출

### Scenario 5: 기기 전환 — 최신 위치 복원
- **Given**: Device A 에서 position_sec=300 까지 시청 후 종료. Device B 에서 재진입
- **When**: Device B 가 FR-PROG-001 의 재개 복원 호출
- **Then**: lastPositionSec=300 반환. Device B 에서 300초 시점부터 재개

### Scenario 6: Supabase Realtime 채널 정리 — 메모리 누수 방지
- **Given**: 사용자가 레슨 페이지 떠남
- **When**: useEffect cleanup
- **Then**: `supabase.removeChannel(channel)` 호출. 구독 해제. 메모리 누수 0

### Scenario 7: 충돌 감지 시 EventLog 기록
- **Given**: 5초 이내 두 기기에서 동일 레슨 저장 발생
- **When**: 충돌 감지
- **Then**: EventLog 에 `progress.conflict_detected` 이벤트 기록 (userId, lessonId, deviceA, deviceB)

### Scenario 8: 비로그인 사용자 — 배너 비활성
- **Given**: 세션 없는 사용자
- **When**: 시청
- **Then**: Realtime 구독 없음 (userId 없으므로). 배너 컴포넌트 렌더링 안함

### Scenario 9: 동시 100명 — LWW 정합성
- **Given**: 동일 사용자 100개 요청 동시 발생 (k6 시뮬레이션)
- **When**: 동시 UPSERT
- **Then**: 최후 요청의 `position_sec` 이 최종 DB 값. p95 ≤ 500ms. 데이터 불일치 0건

### Scenario 10: Supabase Realtime 장애 — graceful degradation
- **Given**: Supabase Realtime 서비스 일시 장애
- **When**: broadcast 전송 실패
- **Then**: `try/catch` 로 무시. LWW 저장은 정상 동작. 배너만 미노출 (기능 저하 허용)

## :gear: Technical & Non-Functional Constraints
- **LWW 전략 (§6.3.4)**: 동시 저장 시 `updatedAt` 이 가장 최신인 값이 승리. 클라이언트 시각 사용 금지 (서버 `now()` 만)
- **Supabase Realtime 설정**:
  - 채널 이름: `progress:{userId}` (사용자별 격리)
  - 이벤트: `progress_updated`
  - Free 플랜 한도: 200 concurrent connections, 2M messages/월
  - MVP 단계에서 충분 (동시 사용자 100명 미만 예상)
- **Device ID**: `crypto.randomUUID()` 기반. `localStorage` 에 영구 저장. 브라우저별 고유값
- **배너 UX 정책**:
  - 자동 닫힘: 10초
  - 애니메이션: slideDown 0.3초
  - 색상: 노란색 경고톤 (위험 아닌 안내)
  - 접근성: `role="alert"` + `aria-live="polite"`
  - 반복 방지: 동일 이벤트 5초 내 중복 수신 시 무시
- **충돌 감지 기준**: 직전 `updatedAt` 과 현재 요청 시각 차이 ≤ 5초 + `lastPositionSec` 차이 ≥ 10초
- **EventLog 발행**: `progress.conflict_detected` — 운영 모니터링용. 빈도가 높으면 UX 개선 필요 신호
- **SSR 안전**: Realtime 구독은 클라이언트 전용 (`'use client'`). 서버 컴포넌트에서 실행 금지
- **금지**:
  - 클라이언트 시각 기반 LWW (시각 동기화 불가 → 데이터 불일치)
  - WebSocket 직접 구현 (Supabase Realtime 래퍼 사용)
  - 충돌 시 사용자에게 "강제 동기화" 확인 팝업 (UX 방해 — 자동 LWW 만)
  - Realtime 채널에 민감 정보 (position_sec + device_id 만)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] LWW UPSERT — 동시 100명 시 정합성 검증 (TS-UT-006)
- [ ] Supabase Realtime broadcast 동작 검증
- [ ] `MultiDeviceBanner.tsx` 컴포넌트 — 배너 노출·자동닫힘·수동닫힘
- [ ] Device ID 생성 + localStorage 영구 저장
- [ ] 충돌 감지 시 EventLog `progress.conflict_detected` 발행
- [ ] Realtime 채널 cleanup (메모리 누수 0)
- [ ] 비로그인 사용자 — 배너 비활성 검증
- [ ] Realtime 장애 시 graceful degradation 검증
- [ ] TS-IT-008 (2기기 동시 재생 충돌 시나리오) 통합 테스트 통과
- [ ] PR 본문에 "Story 4 다기기 LWW + Supabase Realtime 알림. REQ-FUNC-024 충족" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-PROG-001 (saveProgress — LWW UPSERT 기반)
  - IF-SUP-001 (Supabase 프로젝트 — Realtime 활성화)
  - CT-DB-004 (LessonProgress 모델 — updatedAt 컬럼)
  - FR-LES-003 (레슨 시청 페이지 — 배너 호스트)
- **Blocks**:
  - TS-UT-006 (LWW 충돌 단위 테스트)
  - TS-IT-008 (2기기 동시 재생 충돌 통합 테스트)
  - TS-E2E-002 (오세은 E2E — 다기기 시나리오 포함)
- **Related**:
  - FW-PROG-003 (오프라인 큐잉 — 큐 데이터 동기화 시 LWW 적용)
  - REQ-FUNC-024 (다기기 동시 재생 충돌 해결)
  - §6.3.4 (다기기 LWW 시퀀스 다이어그램)
