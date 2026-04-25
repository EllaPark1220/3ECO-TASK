# [Test] TS-E2E-002: 오세은 시나리오 E2E (Playwright) — 시청 중단 → 재진입 → 5초 오차 복원

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-E2E-002: 오세은 시나리오 E2E (Playwright) — 시청 중단 → 재진입 → ≤5초 오차 복원"
labels: 'test, e2e, playwright, story-4, alpha-exit-gate, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-E2E-002] Playwright E2E — Story 4 (오세은 · 단편 세션 + 재개) 의 핵심 사이클을 자동화 검증
- **목적**: §6.7 Alpha Exit 통합 게이트의 두 번째 핵심 항목. Story 4 AC 6건 (REQ-FUNC-020~025) 중 핵심 (020 저장 + 021 복원) 을 자동화. 본 시나리오 통과 여부가 TS-E2E-001 (박지훈) 와 함께 Alpha → Private Beta 진입의 단일 핵심 기준.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-020, 021, 022, 024, 025
  - `/docs/SRS_V0_9.md#3.5.2` — UC-04 (재개 위치 복원)
  - `/docs/SRS_V0_9.md#5.1` — TC-020, TC-021
  - `/docs/SRS_V0_9.md#6.7` — Alpha Exit 통합 게이트
  - `/docs/SRS_V0_9.md#3.4.3` — 재개 위치 시퀀스
- 페르소나: SH-07 오세은 (육아휴직 33세 · P16 · NP3)
- 선행 구현: FW-PROG-001, FR-PROG-001, FR-LES-003, FW-AUTH-003

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `tests/e2e/story-4-seeun.spec.ts` 신규 파일
- [ ] beforeAll — 테스트용 사용자 시드 (이메일 확인 완료 상태)
- [ ] **Step 1 — 로그인 + 레슨 진입**:
  - `/auth/login` 로그인
  - `/lesson/L001` 진입
  - YouTube iframe 로드 확인
- [ ] **Step 2 — 시청 시뮬레이션 (30초 위치 저장)**:
  - YouTube iframe 직접 제어 어려움 → `page.evaluate()` 로 `saveProgress({ lesson_id: 'L001', position_sec: 30 })` Server Action 호출
  - DB 검증 — `prisma.lessonProgress.findUnique()` 로 lastPositionSec=30 확인
- [ ] **Step 3 — 페이지 이탈 + 재진입**:
  - `page.goto('/stamp-map')` 로 다른 페이지 이동
  - 다시 `page.goto('/lesson/L001')` 진입
- [ ] **Step 4 — 재개 위치 복원 검증**:
  - 페이지 로드 후 `getLastPosition()` API 호출 결과 확인 (네트워크 모니터링)
  - 재개 토스트 노출 확인 — "이전 학습 위치 0분 30초부터 다시 시작합니다"
  - YouTube iframe 의 currentTime 측정 (가능한 경우 IFrame API postMessage)
  - **오차 ≤ 5초 검증** — 측정값과 30초의 차이가 5초 이내
- [ ] **Step 5 — "처음부터 보기" 옵션 동작**:
  - 토스트의 "처음부터 보기" 버튼 클릭
  - currentTime 이 0초로 초기화되는지 검증
- [ ] **Step 6 — 다기기 시뮬레이션 (Bonus)**:
  - 두 개의 Browser Context 생성 (Device A, B)
  - Device A 가 lastPositionSec=120 저장
  - Device B 가 진입 시 lastPositionSec=120 부터 시작 (LWW)
  - 두 디바이스가 동시에 다른 위치 저장 시 최후 저장값 우선 검증
- [ ] **Step 7 — 시청 중 네트워크 단절 (Bonus)**:
  - `context.setOffline(true)` 로 오프라인 강제
  - position 저장 호출 → 401 또는 네트워크 에러
  - `context.setOffline(false)` 로 복구
  - **현재 본 태스크는 IndexedDB 큐잉 (FW-PROG-003) 미구현 단계라 본 Step 은 skip 또는 pending 처리** — Closed Beta 에서 활성화
- [ ] **Step 8 — 정리 (afterAll)**:
  - 테스트 사용자·LessonProgress 삭제
- [ ] CI 통합 — IF-CI-004 의 Playwright Job 추가
- [ ] 시나리오 실행 시간 ≤ 60초 목표

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 단일 디바이스 재개 — Happy Path
- **Given**: 클린 DB + Lesson L001 시드
- **When**: Step 1~4 순차 실행
- **Then**: 30초 저장 → 재진입 → 30초 복원 (오차 ≤ 5초). 재개 토스트 정상 노출

### Scenario 2: "처음부터 보기" 동작
- **Given**: Scenario 1 직후 토스트 노출
- **When**: "처음부터 보기" 클릭
- **Then**: currentTime=0. 토스트 dismiss. DB lastPositionSec 은 변경되지 않음 (단순 UI 동작)

### Scenario 3: 다기기 LWW
- **Given**: Step 6 시뮬레이션
- **When**: Device A → 120s 저장, Device B → 진입 시 120s 부터, Device B → 200s 저장
- **Then**: 최종 DB lastPositionSec=200. Device A 재진입 시 200s 복원

### Scenario 4: 100회 자동화 시나리오 (REQ-FUNC-021 AC)
- **Given**: 다양한 lastPositionSec (10s, 60s, 600s, 3600s) × 25회 = 100회
- **When**: 본 spec 의 핵심 부분만 100회 반복 실행
- **Then**: 실패 (오차 > 5초) **< 2건**

### Scenario 5: 미인증 — 0초부터 시작
- **Given**: 세션 없음
- **When**: `/lesson/L001` 직접 접근
- **Then**: 영상은 0초부터 재생 가능. 재개 토스트 0건

### Scenario 6: 시나리오 실행 시간
- **Given**: CI 환경
- **When**: 본 spec 단독 실행 (Step 1~5, Step 6 skip 옵션)
- **Then**: 60초 이내 완료

### Scenario 7: 격리
- **Given**: 본 spec 종료 직후
- **When**: TS-E2E-001 spec 실행
- **Then**: 본 테스트가 만든 데이터 잔여 0. 두 spec 간 충돌 0

## :gear: Technical & Non-Functional Constraints
- **YouTube iframe 제어 한계**: iframe 내부 currentTime 직접 측정 어려움 — `postMessage` IFrame API 활용 또는 페이지 코드의 `window.player.getCurrentTime()` 을 `page.evaluate()` 로 호출
- **시청 시뮬레이션**: 실제 영상 재생 대신 saveProgress Server Action 직접 호출. 본 태스크는 진도 저장·복원 메커니즘만 검증
- **테스트 격리**: 각 spec 실행 시 독립적인 사용자. 병렬 실행 시 충돌 0
- **flaky 방지**: `expect().toBeVisible({ timeout: 10000 })` 자동 retry. `page.waitForTimeout()` 임의 sleep 금지
- **다기기 시나리오**: Playwright `browser.newContext()` 로 두 컨텍스트 생성. 쿠키·세션 격리
- **오프라인 시나리오 보류**: FW-PROG-003 (IndexedDB 큐잉) 가 Closed Beta 라 본 spec 의 Step 7 은 skip 마크. 향후 활성화
- **DB 검증**: Prisma Client 직접 호출로 DB 상태 검증 (UI 만 의존하지 않음)
- **재시도 정책**: Playwright `retries: 1`. 2회 연속 실패 시 진짜 실패
- **금지**:
  - 실제 YouTube 영상 재생 시도 (네트워크 의존성)
  - 임의 sleep 사용
  - 프로덕션 DB 사용

## :checkered_flag: Definition of Done (DoD)
- [ ] 7개 GWT 시나리오 전부 통과 (Step 7 skip 가능)
- [ ] `tests/e2e/story-4-seeun.spec.ts` 구현 완료
- [ ] CI (IF-CI-004) 자동 실행
- [ ] 시나리오 실행 시간 ≤ 60초
- [ ] 100회 시나리오 (Scenario 4) 실패 < 2건 — TS-IT-007 와 정합
- [ ] flaky 검증 — 동일 spec 10회 연속 실행 통과
- [ ] **Alpha Exit 게이트 진입** — §6.7 통합 게이트 4건 중 "Story 4 E2E 1회 통과" 항목 체크
- [ ] data-testid 기반 선택자 사용
- [ ] PR 본문에 "본 테스트 통과는 TS-E2E-001 와 함께 Alpha → Private Beta 진입의 단일 핵심 기준" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-AUTH-003 (로그인)
  - FW-PROG-001 (진도 저장)
  - FR-PROG-001 (재개 위치 복원)
  - FR-LES-003 (레슨 시청 페이지)
  - CT-MOCK-001 (Lesson 시드)
- **Blocks**:
  - **Alpha Exit Gate** — §6.7 통합 게이트 4건 중 1건
  - IF-CI-004 (Playwright CI Job — TS-E2E-001 와 함께 핵심 게이트)
