# [Feature] FW-PROG-003: IndexedDB 오프라인 큐잉 + 재연결 30초 내 배치 동기화

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-PROG-003: IndexedDB 오프라인 큐잉 — 네트워크 단절·서버 5xx 시 로컬 저장 + 재연결 30초 내 배치 동기화"
labels: 'feature, frontend, progress, offline, indexeddb, priority:high, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-PROG-003] IndexedDB 오프라인 큐잉 + 재연결 시 30초 내 배치 동기화 — `idb-keyval` 또는 `dexie` 활용
- **목적**: Story 4 (오세은) 의 단편 세션 학습자가 네트워크 불안정 환경(지하철·학교 Wi-Fi 끊김 등)에서도 시청 진도가 유실되지 않도록 한다. FW-PROG-002 (10초 위치 송신 훅) 의 실패 시 로컬 IndexedDB 에 큐잉하고, 네트워크 복구 시 30초 이내에 배치 동기화를 수행하여 REQ-FUNC-005 (오프라인 수집·재연결 동기화) · REQ-FUNC-025 (서버 장애 시 큐잉·1분 내 동기화) · AC5·AC6 을 충족한다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-005 (오프라인 수집 + 동기화), REQ-FUNC-025 (서버 5xx 큐잉)
  - `/docs/SRS_V0_9.md#4.1.4` — AC5 (오프라인 큐잉 30초 동기화), AC6 (데이터 유실 <0.1%)
  - `/docs/SRS_V0_9.md#3.4.3` — 재개 위치 시퀀스 다이어그램
  - `/docs/SRS_V0_9.md#6.3.4` — 다기기 오프라인 동기화 시퀀스
  - `/docs/SRS_V0_9.md#3.5.2` — UC-04 (재개 위치 복원)
- 페르소나: SH-07 오세은 (단편 세션 · 지하철 학습)
- 선행: FW-PROG-002 (10초 위치 송신 훅 — 본 큐잉의 호출자)
- 짝: FW-PROG-001 (Server Action — 본 큐의 최종 목적지)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **의존성 설치**: `npm install idb-keyval` (경량 IndexedDB 래퍼, ~1KB gzip) 또는 `npm install dexie` (스키마 기반 IndexedDB 래퍼, ~17KB)
  - **선택 기준**: 단순 KV 저장만 필요 → `idb-keyval` 추천. 다중 테이블·인덱스 필요 → `dexie`
  - 본 태스크는 단일 큐 테이블이므로 `idb-keyval` 채택 (최소 번들 원칙)
- [ ] `lib/offline/progressQueue.ts` — 오프라인 큐 관리 모듈 신규 생성:
  ```ts
  import { get, set, del } from 'idb-keyval';

  interface QueuedProgress {
    lesson_id: string;
    position_sec: number;
    queued_at: number; // Date.now()
    retry_count: number;
  }

  const QUEUE_KEY = 'progress-offline-queue';

  export async function enqueue(item: Omit<QueuedProgress, 'queued_at' | 'retry_count'>): Promise<void> {
    const queue = (await get<QueuedProgress[]>(QUEUE_KEY)) ?? [];
    // 동일 lesson_id 의 기존 항목은 최신 position_sec 으로 덮어쓰기 (LWW)
    const existing = queue.findIndex(q => q.lesson_id === item.lesson_id);
    const entry: QueuedProgress = { ...item, queued_at: Date.now(), retry_count: 0 };
    if (existing >= 0) {
      queue[existing] = entry;
    } else {
      queue.push(entry);
    }
    await set(QUEUE_KEY, queue);
  }

  export async function dequeueAll(): Promise<QueuedProgress[]> {
    const queue = (await get<QueuedProgress[]>(QUEUE_KEY)) ?? [];
    await del(QUEUE_KEY);
    return queue;
  }

  export async function getQueueSize(): Promise<number> {
    const queue = (await get<QueuedProgress[]>(QUEUE_KEY)) ?? [];
    return queue.length;
  }
  ```
- [ ] `lib/offline/syncManager.ts` — 배치 동기화 매니저 신규 생성:
  ```ts
  import { dequeueAll, enqueue } from './progressQueue';
  import { saveProgress } from '@/lib/services/progress';

  export async function flushQueue(): Promise<{ synced: number; failed: number }> {
    const items = await dequeueAll();
    let synced = 0;
    let failed = 0;

    for (const item of items) {
      try {
        await saveProgress({ lesson_id: item.lesson_id, position_sec: item.position_sec });
        synced++;
      } catch (error) {
        // 재실패 시 다시 큐에 넣기 (최대 5회 retry)
        if (item.retry_count < 5) {
          await enqueue({ ...item, retry_count: item.retry_count + 1 });
        }
        failed++;
      }
    }
    return { synced, failed };
  }
  ```
- [ ] `app/hooks/useOfflineSync.ts` — React 훅으로 온라인/오프라인 상태 감지 + 자동 동기화:
  ```ts
  import { useEffect, useRef } from 'react';
  import { flushQueue } from '@/lib/offline/syncManager';

  export function useOfflineSync() {
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
      const handleOnline = () => {
        // 재연결 시 30초 이내 동기화 (즉시 시도, 최대 30초)
        syncTimeoutRef.current = setTimeout(async () => {
          await flushQueue();
        }, 500); // 0.5초 후 즉시 시도 (네트워크 안정화 대기)
      };

      window.addEventListener('online', handleOnline);

      // 마운트 시 큐에 남은 항목 동기화 (이전 세션 잔여)
      if (navigator.onLine) {
        flushQueue();
      }

      return () => {
        window.removeEventListener('online', handleOnline);
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      };
    }, []);
  }
  ```
- [ ] **FW-PROG-002 훅 확장** — `saveProgress()` 호출 실패 시 큐잉 로직 삽입:
  ```ts
  // usePositionSync.ts 의 catch 블록 변경
  catch (error) {
    if (isOfflineOrServerError(error)) {
      await enqueue({ lesson_id: lessonId, position_sec: currentTime });
    }
    console.error('saveProgress failed, queued to IndexedDB:', error);
  }
  ```
- [ ] **오프라인/서버 에러 판별 헬퍼** — `lib/offline/utils.ts`:
  ```ts
  export function isOfflineOrServerError(error: unknown): boolean {
    if (!navigator.onLine) return true;
    if (error instanceof Response && error.status >= 500) return true;
    if (error instanceof TypeError && error.message.includes('fetch')) return true;
    return false;
  }
  ```
- [ ] **큐 크기 제한** — IndexedDB 에 최대 100건 저장 (100건 초과 시 가장 오래된 항목 삭제). 1건당 ~50B → 100건 = ~5KB. 디바이스 저장소 부담 무시 가능
- [ ] **중복 제거** — 동일 `lesson_id` 의 큐 항목은 최신 `position_sec` 으로 덮어쓰기 (LWW). 서버 동기화 시 1 lesson 당 1회만 호출
- [ ] **재시도 정책** — 동기화 실패 시 retry_count 증가. 최대 5회. 5회 초과 시 해당 항목 drop + EventLog 기록
- [ ] **배치 동기화 타이밍**:
  - `online` 이벤트 발생 후 0.5초 대기 → 즉시 `flushQueue()`
  - 앱 재진입 (페이지 로드) 시 큐 잔여 항목 동기화
  - `visibilitychange` (탭 활성화) 시 큐 잔여 항목 동기화
- [ ] **동기화 완료 알림** — 동기화 완료 후 `console.info('Offline queue synced: N items')`. UI 토스트는 선택 (사용자 혼란 방지)
- [ ] **서버 5xx 시 큐잉** (REQ-FUNC-025) — 네트워크는 있지만 서버 5xx 응답 시에도 동일 큐잉 로직. 1분 내 동기화 시도 (30초 → 60초 간격 재시도)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 네트워크 단절 중 시청 — 큐잉 정상
- **Given**: 사용자가 Lesson L001 시청 중. 네트워크 단절 (`navigator.onLine = false`)
- **When**: FW-PROG-002 의 10초 interval 에서 `saveProgress()` 실패
- **Then**: IndexedDB 에 `{ lesson_id: 'L001', position_sec: 30, queued_at: ..., retry_count: 0 }` 저장. 사용자 UX 영향 0

### Scenario 2: 네트워크 복구 — 30초 내 동기화
- **Given**: Scenario 1 상태에서 IndexedDB 큐에 3건 쌓임
- **When**: 네트워크 복구 (`online` 이벤트)
- **Then**: 0.5초 후 `flushQueue()` 실행. 3건 모두 서버 동기화 완료. **복구 후 30초 이내 완료** (AC5)

### Scenario 3: 동일 레슨 중복 — LWW 병합
- **Given**: L001 에 대해 position_sec 30, 40, 50 세 번 큐잉
- **When**: 큐 상태 확인
- **Then**: L001 항목은 position_sec=50 (최신) 1건만 존재. 서버 호출 1회

### Scenario 4: 서버 5xx — 큐잉 + 1분 내 재시도
- **Given**: 네트워크 정상이지만 서버 500 응답
- **When**: `saveProgress()` 실패
- **Then**: IndexedDB 에 큐잉. 30초 후 재시도 → 실패 시 60초 후 재시도. **1분 내 동기화 시도** (REQ-FUNC-025)

### Scenario 5: 재시도 5회 초과 — drop + 로깅
- **Given**: 서버 장기 장애 (5회 연속 실패)
- **When**: 6번째 동기화 시도
- **Then**: 해당 항목 drop (큐에서 제거). `console.error('Dropped after 5 retries')`. EventLog 는 서버 복구 후 기록 불가 → 클라이언트 로그만

### Scenario 6: 앱 재진입 — 이전 세션 잔여 큐 동기화
- **Given**: 이전 세션에서 큐에 2건 남긴 상태. 브라우저 종료 후 재방문
- **When**: 페이지 로드 + `navigator.onLine = true`
- **Then**: `useOfflineSync` 마운트 시 `flushQueue()` 실행. 2건 동기화 완료

### Scenario 7: 데이터 유실률 <0.1% (AC6)
- **Given**: Chrome DevTools 오프라인 throttling 환경
- **When**: 100건의 진도 저장 시도 (50건 오프라인 + 50건 온라인)
- **Then**: 최종 서버 반영 ≥ 99.9건 (유실 <0.1%). TS-IT-009 에서 정량 검증

### Scenario 8: 큐 크기 제한 — 100건 초과 시 오래된 항목 삭제
- **Given**: IndexedDB 큐에 100건 존재
- **When**: 101번째 항목 enqueue
- **Then**: 가장 오래된 1건 삭제 + 신규 1건 추가. 큐 크기 = 100

### Scenario 9: 탭 비활성 → 활성화 시 동기화
- **Given**: 사용자가 다른 탭으로 이동 후 복귀
- **When**: `visibilitychange` (document.visibilityState === 'visible')
- **Then**: 큐 잔여 항목 동기화 시도

### Scenario 10: IndexedDB 미지원 브라우저 — graceful degradation
- **Given**: IndexedDB 미지원 환경 (매우 드뭄)
- **When**: 큐잉 시도
- **Then**: `try/catch` 로 무시. 오프라인 큐잉 비활성. 온라인 시 정상 저장만 동작

## :gear: Technical & Non-Functional Constraints
- **라이브러리 선택**: `idb-keyval` (~1KB gzip) 채택. 단순 KV 저장소로 충분. `dexie` 는 과도
- **IndexedDB 스키마**: DB 이름 `3eco-offline`, Store 이름 `progress-queue`. 단일 키 `progress-offline-queue` 에 배열 저장
- **큐 크기 한도**: 100건 (메모리·디스크 안전). 1건 ~50B → 100건 ~5KB
- **중복 제거 정책**: 동일 `lesson_id` 는 LWW — `position_sec` 최신값 우선. 서버 호출 최소화
- **재시도 간격**: 0.5초 → 30초 → 60초 → 60초 → 60초 (exponential 변형). 5회 초과 시 drop
- **동기화 타이밍**:
  - `online` 이벤트 — 0.5초 후
  - 페이지 로드 (마운트) — 즉시
  - `visibilitychange` — visible 시
  - 수동 호출 없음 (자동 전용)
- **동기화 순서**: `queued_at` 오래된 순서대로 (FIFO). 병렬 처리 아닌 순차 처리 (서버 부하 방지)
- **인증 만료 처리**: 동기화 중 401 응답 시 — 해당 항목 큐에 유지 + 재로그인 후 재시도. drop 하지 않음 (인증 문제는 서버 장애가 아님)
- **SSR 안전**: IndexedDB 는 브라우저 전용. `typeof window !== 'undefined'` 가드 필수
- **메모리 누수 방지**: `useOfflineSync` 의 cleanup 에서 timeout clear + event listener 제거
- **테스트 환경**: Chrome DevTools `Network` 탭의 `Offline` throttling 활용. 또는 MSW (CT-MOCK-004) 로 5xx 강제
- **금지**:
  - `localStorage` 사용 (용량 제한 5MB + 동기 API → 메인 스레드 차단)
  - `sessionStorage` 사용 (탭 닫히면 소멸)
  - Service Worker 기반 큐잉 (본 MVP 범위 초과)
  - 큐잉 항목에 민감 정보 포함 (position_sec + lesson_id 만)
  - 큐잉 시 사용자에게 오프라인 경고 UI 강제 노출 (UX 혼란)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/offline/progressQueue.ts` — enqueue/dequeueAll/getQueueSize 구현
- [ ] `lib/offline/syncManager.ts` — flushQueue 구현
- [ ] `app/hooks/useOfflineSync.ts` — online/visibilitychange 이벤트 통합
- [ ] FW-PROG-002 의 catch 블록에 큐잉 로직 삽입
- [ ] 중복 제거 (동일 lesson_id LWW) 동작 검증
- [ ] 재시도 5회 초과 drop 정책 검증
- [ ] Chrome DevTools 오프라인 throttling 으로 E2E 검증
- [ ] 데이터 유실률 <0.1% 측정 (TS-IT-009 과 정합)
- [ ] SSR 가드 (`typeof window`) 적용 검증
- [ ] PR 본문에 "Story 4 오프라인 큐잉. REQ-FUNC-005·025 충족. idb-keyval 채택" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-PROG-002 (10초 위치 송신 훅 — 본 큐잉의 호출자)
  - FW-PROG-001 (saveProgress Server Action — 큐의 최종 목적지)
  - CT-API-003 (saveProgress DTO)
- **Blocks**:
  - TS-IT-009 (IndexedDB 큐잉·동기화 통합 테스트 — Chrome DevTools 오프라인)
  - TS-E2E-002 (오세은 E2E — 오프라인 시나리오 포함)
  - FW-PROG-004 (다기기 LWW — 오프라인 큐 데이터의 동기화 시 충돌 처리)
- **Related**:
  - REQ-FUNC-005 (오프라인 수집 + 재연결 동기화)
  - REQ-FUNC-025 (서버 5xx 시 큐잉 + 1분 내 동기화)
  - AC5 (30초 내 동기화), AC6 (유실 <0.1%)
