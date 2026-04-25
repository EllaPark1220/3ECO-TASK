# [Feature] FR-PROG-001: 재진입 시 last_position_sec 조회 → ≤5초 오차 복원

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-PROG-001: 재진입 시 last_position_sec 조회 → 비디오 플레이어 ≤5초 오차 복원"
labels: 'feature, frontend, progress, story-4, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-PROG-001] 사용자가 레슨 재진입 시 마지막 저장된 `last_position_sec` 을 조회하여 YouTube iframe 의 재생 위치를 ≤5초 오차로 복원
- **목적**: Story 4 (오세은 · 육아휴직 33세) 의 핵심 — 5~10분 단편 세션 학습자가 중단 후 재진입했을 때 진도가 유지되어 완주율을 보호한다. UC-04 (재개 위치 복원) 의 클라이언트 구현체이며, REQ-FUNC-021 (오차 ≤5초) 충족. FW-PROG-001 (저장) 과 짝을 이루는 Read 전용 컴포넌트.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-021 (재진입 시 오차 ≤5초)
  - `/docs/SRS_V0_9.md#3.4.3` — 재개 위치 시퀀스 다이어그램
  - `/docs/SRS_V0_9.md#3.5.2` — UC-04
  - `/docs/SRS_V0_9.md#6.2.2` — LESSON_PROGRESS 테이블
- 페르소나: SH-07 오세은 (P16 · NP3 — 단편 세션)
- 선행 구현: FW-PROG-001 (저장), FR-LES-003 (시청 페이지)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/services/progress.ts` 또는 `app/lessons/[id]/actions.ts` 에 `getLastPosition(lessonId)` Server Action 추가 (또는 `/api/progress/[lessonId]` Route Handler)
- [ ] 입력 검증 — Zod `lesson_id: regex(/^L\d{3}$/)`
- [ ] Prisma 쿼리 — `prisma.lessonProgress.findUnique({ where: { userId_lessonId: {...} }, select: { lastPositionSec, oxCompleted, stampEarned } })`
- [ ] `requireUser()` 가드. 미인증 시 401
- [ ] LessonProgress 미존재 시 — `{ last_position_sec: 0, ox_completed: false, stamp_earned: false }` 반환 (404 아님)
- [ ] 응답 시간 목표 — p95 ≤ 100ms (단순 SELECT)
- [ ] **클라이언트 통합 — `useLessonResume(lessonId)` 훅** 작성:
  - 페이지 마운트 시 `getLastPosition()` 호출
  - YouTube iframe 의 `onReady` 이벤트 직후 `player.seekTo(lastPositionSec, true)` 호출
  - seek 완료까지 로딩 인디케이터 표시
  - 재개 위치가 0초이면 seek 호출 생략 (첫 시청 사용자 — UX 개선)
- [ ] **재개 알림 UI** — 재개 위치 > 0 인 경우 "이전 학습 위치 N분 N초 부터 다시 시작합니다" 토스트 노출 (3초 후 자동 dismiss)
- [ ] **다른 위치 시작 옵션** — 토스트에 "처음부터 보기" 버튼 제공. 클릭 시 `seekTo(0)` + 토스트 dismiss
- [ ] OX 통과 사용자 처리 — `ox_completed=true` 인 경우 "이 레슨은 이미 완료했습니다" 배지 + 재시청 가능 (자율 선택 — INV-10)
- [ ] 오차 측정 — Performance API 로 `getLastPosition` 호출 시각 ~ `seekTo` 완료 시각 ~ 실제 currentTime 측정. 평균 오차 < 5초 검증

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 신규 사용자 첫 진입 — 0초 시작
- **Given**: User(`u1`) 의 LessonProgress 가 없음
- **When**: `/lesson/L001` 접근
- **Then**: `getLastPosition()` 응답 `{ last_position_sec: 0, ox_completed: false, ... }`. seek 호출 생략. 영상은 0초부터 재생 가능 상태. 재개 토스트 미노출

### Scenario 2: 재진입 — 이전 위치 복원
- **Given**: LessonProgress 존재 (lastPositionSec=120)
- **When**: `/lesson/L001` 재진입
- **Then**: YouTube iframe `onReady` 직후 `seekTo(120, true)` 호출. 재개 토스트 "2분 0초부터 다시 시작합니다" 노출. 실제 currentTime 측정 시 오차 ≤ 5초

### Scenario 3: "처음부터 보기" 버튼
- **Given**: Scenario 2 직후 토스트 노출 상태
- **When**: 사용자가 "처음부터 보기" 클릭
- **Then**: `seekTo(0)` 호출. 토스트 dismiss. 영상 0초부터 재생

### Scenario 4: OX 완료 사용자 재시청
- **Given**: ox_completed=true, stamp_earned=true 인 사용자
- **When**: 동일 레슨 재진입
- **Then**: "이 레슨은 이미 완료했습니다" 배지 노출. 영상은 마지막 위치부터 재개 가능 (자율 선택). 재시청 시에도 새 stamp 발급 안됨 (멱등 — Issue #3)

### Scenario 5: 미인증 사용자
- **Given**: 세션 없음
- **When**: `/lesson/L001` 접근
- **Then**: `getLastPosition()` 호출 안함 (또는 401). 영상은 0초 재생 가능 상태로 표시. 재개 UI 0건

### Scenario 6: 다기기 — Device A 에서 저장한 위치를 Device B 가 복원
- **Given**: Device A 가 lastPositionSec=180 저장
- **When**: Device B 에서 동일 레슨 진입
- **Then**: lastPositionSec=180 부터 복원 (LWW 의 단순 case)

### Scenario 7: 응답 시간 목표
- **Given**: 부하 100명 동시 호출
- **When**: k6 측정
- **Then**: `getLastPosition()` p95 ≤ 100ms

### Scenario 8: 오차 측정 — 100회 시나리오
- **Given**: 다양한 lastPositionSec (10s, 60s, 600s, 3600s) 4종 × 25회 = 100회 시나리오
- **When**: Playwright 자동화로 재개 검증
- **Then**: 100회 중 실패 (오차 > 5초) **< 2건** (REQ-FUNC-021 AC). seek API 의 정밀도 + iframe 로드 지연 합산

## :gear: Technical & Non-Functional Constraints
- **YouTube IFrame API seekTo**: `seekTo(seconds, allowSeekAhead=true)` 호출. allowSeekAhead=true 로 버퍼링 미리 시작
- **응답 페이로드 분리**: lesson 메타와 분리 (FR-LES-001 의 캐시 무효화 폭증 방지). 본 액션은 RSC 캐시 사용 안함 (사용자별 데이터)
- **404 vs 0초 응답**: LessonProgress 미존재는 에러가 아닌 정상 케이스. `{ last_position_sec: 0 }` 응답으로 클라이언트 분기 단순화
- **로딩 UX**: seek 완료 전까지 영상 위에 spinner overlay. 깜빡임 방지 위해 최소 100ms 표시
- **재개 토스트 톤**: 후킹·게임화 표현 금지 (CON-05). 차분한 안내체. 자동 dismiss 3초
- **OX 완료 사용자 정책**: 자율 선택 (ADR-003) 일관성 — 재시청 차단 절대 금지. 단 stamp 재발급은 멱등으로 막힘
- **응답 시간 (REQ-NF-002 영향)**: getLastPosition 은 LCP 영향 가능. 페이지 로드와 병렬 fetch 권장 (RSC `Suspense` 활용)
- **금지**:
  - 재개 위치를 LocalStorage 에 저장 (서버 SSOT 위반)
  - 재개 토스트에 후킹·축하 효과 (게임화 방지)
  - OX 완료 사용자에게 재시청 차단 또는 경고

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 전부 통과
- [ ] `getLastPosition()` Server Action + `useLessonResume()` 훅 구현
- [ ] YouTube IFrame API `seekTo` 통합 동작 검증
- [ ] 재개 토스트 + "처음부터 보기" 버튼 UI 동작
- [ ] OX 완료 사용자 재시청 시나리오 (Scenario 4) 검증
- [ ] 100회 자동화 시나리오 (Scenario 8) 실패 < 2건 — REQ-FUNC-021 AC 충족
- [ ] 응답 시간 p95 ≤ 100ms 측정
- [ ] TS-IT-007 (100회 재개 시나리오) 통과
- [ ] PR 본문에 "Story 4 의 핵심 — Story 1 의 학습 루프와 결합하여 단편 세션 완주율 보호" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-PROG-001 (진도 저장 — 본 액션이 읽는 데이터의 공급원)
  - FR-LES-003 (레슨 시청 페이지 — 통합 위치)
  - FR-AUTH-002 (RBAC 가드)
  - CT-DB-004 (LessonProgress 모델)
- **Blocks**:
  - TS-E2E-002 (오세은 E2E — 본 컴포넌트가 핵심 검증 대상)
  - TS-IT-007 (100회 재개 시나리오)
  - Alpha Exit Gate (§6.7 — Story 4 E2E 통합 게이트)
