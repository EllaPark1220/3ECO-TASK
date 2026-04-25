# [Test] TS-E2E-003: 한정숙 시나리오 E2E (Playwright) — 매체 전환 + 글자 크기 + 영속화

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-E2E-003: 한정숙 시나리오 E2E — 영상↔글 매체 전환 + 글자 크기 LARGE + 다음 로그인 영속화 검증"
labels: 'test, e2e, playwright, story-5-a, accessibility, priority:critical, mvp-in, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-E2E-003] Playwright E2E — Story 5-A (한정숙 · 저시력) 의 매체 전환 + 글자 크기 + 영속화 사이클을 자동화 검증
- **목적**: Story 5 의 두 페르소나 중 첫 번째 (한정숙 · 저시력) 의 학습 루프 자동화 안전망. REQ-FUNC-026 (매체 전환) + REQ-FUNC-027 (글자 크기) + REQ-NF-039 (영속화) 의 통합 검증. **Closed Beta Exit 게이트의 핵심 검증 항목 1건**.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.5` — REQ-FUNC-026, 027, 029 (매체·글자 크기·색 모드)
  - `/docs/SRS_V0_9.md#4.2.6` — REQ-NF-035, 036, 039 (200% 확대·시스템 모드·영속화)
  - `/docs/SRS_V0_9.md#3.5.2` — UC-05, UC-09 (매체 전환·환경설정 변경)
  - `/docs/SRS_V0_9.md#5.1` — TC-026, TC-027, TC-029
  - `/docs/SRS_V0_9.md#1.2.3` — Closed Beta Exit 조건
- 페르소나: SH-04 한정숙 (저시력 · 매체 전환 + 큰 글자 + 다크 모드 선호)
- 선행: FW-AUTH-005, FR-LES-004, FR-AUTH-003, FR-LES-003

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `tests/e2e/story-5-a-jeongsook.spec.ts` 신규 파일
- [ ] beforeAll — 테스트용 사용자 시드 (이메일 확인 완료, 기본 환경설정)
- [ ] **Step 1 — 로그인 + 레슨 진입**:
  - `/auth/login` 로그인
  - `/lesson/L001` 진입
  - 기본 상태 검증 — 영상 모드, MEDIUM 글자, 라이트(또는 SYSTEM) 색 모드
- [ ] **Step 2 — "글로 읽기" 토글**:
  - 매체 전환 토글 클릭 (영상 → 글)
  - YouTube iframe unmount 검증
  - `<article>` 요소 + 스크립트 콘텐츠 렌더 검증
  - 전환 시간 측정 — p95 ≤ 300ms (REQ-NF-005)
- [ ] **Step 3 — 글자 크기 LARGE 변경**:
  - FontSizeToggle 클릭 → LARGE 선택
  - html 에 `font-large` 클래스 적용 검증
  - 본문 텍스트 computed font-size 가 20px 검증 (`page.evaluate` + getComputedStyle)
  - DB 검증 (debounce 500ms 후) — `prisma.user.findUnique({ where: { id: userId } }).fontSize === 'LARGE'`
- [ ] **Step 4 — DARK 색 모드 변경 (선택 — 색 모드 활성화 단계에서)**:
  - ColorModeToggle 클릭 → DARK 선택
  - html 에 `dark` 클래스 적용 검증
  - body 의 background-color 가 다크 토큰 검증
  - DB 검증 — `colorMode === 'DARK'`
- [ ] **Step 5 — 영속화 검증 (다음 로그인)**:
  - 로그아웃 (`signOut()` 호출 또는 쿠키 삭제)
  - 동일 또는 다른 브라우저 컨텍스트에서 재로그인
  - `/lesson/L001` 진입
  - **글 모드 + LARGE 폰트 + DARK 모드 자동 적용 검증** (서버 SSOT 의존)
  - **FOUC 부재 검증** — 첫 paint 부터 LARGE + DARK 적용 (라이트 깜빡임 0건)
- [ ] **Step 6 — 200% 확대 호환 검증 (WCAG 1.4.4)**:
  - Playwright 의 `page.emulate({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2 })` 또는 CSS zoom 200% 시뮬레이션
  - LARGE 폰트 + 200% 확대 = 이중 확대 상태
  - 가로 스크롤 0건 검증
  - 콘텐츠 손실 0건 검증 (모든 텍스트 가시 영역 내)
- [ ] **Step 7 — axe-core 양 모드 검사**:
  - `@axe-core/playwright` 활용 (TS-A11Y-001 와 정합)
  - 라이트 모드 → 검사 → violation 0건
  - 다크 모드 → 재검사 → violation 0건
- [ ] **Step 8 — 정리 (afterAll)**:
  - 테스트 사용자 + 환경설정 삭제
- [ ] CI 통합 — IF-CI-004 의 Playwright Job
- [ ] 시나리오 실행 시간 ≤ 90초 목표

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 매체 전환 + 글자 크기 + 영속화 (Happy Path)
- **Given**: 클린 DB + Lesson L001 + 한정숙 픽스처
- **When**: Step 1~5 순차 실행
- **Then**: 각 단계 통과. 최종 DB 상태 — User 의 mediaPreference='TEXT', fontSize='LARGE', colorMode='DARK'. 다음 로그인 시 자동 복원

### Scenario 2: 매체 전환 시간 (REQ-NF-005)
- **Given**: 영상 모드 상태
- **When**: "글로 읽기" 토글
- **Then**: 전환 시간 ≤ 300ms (Performance API 측정)

### Scenario 3: 글자 크기 즉시 반영 + debounce 영속화
- **Given**: MEDIUM 상태
- **When**: LARGE 선택
- **Then**: html 클래스 즉시 변경 (UI 반영 ≤ 50ms). 500ms 후 DB UPDATE 발생 (네트워크 모니터링)

### Scenario 4: 영속화 — 다른 디바이스에서 자동 복원
- **Given**: Device A 에서 LARGE 설정 후 로그아웃
- **When**: Device B (다른 Browser Context) 에서 로그인
- **Then**: 첫 페이지 진입 시 LARGE 자동 적용. FOUC 부재

### Scenario 5: WCAG 1.4.4 — 200% 확대 + LARGE 이중 확대
- **Given**: 320px 모바일 뷰포트 + LARGE + 브라우저 200% 확대
- **When**: 페이지 렌더
- **Then**: 가로 스크롤 0건. 콘텐츠 손실 0건. 모든 텍스트 자연 줄바꿈

### Scenario 6: axe-core 양 모드 통과
- **Given**: 한정숙 사용자 + DARK 모드 활성
- **When**: axe-core 검사 (라이트 + 다크 모두)
- **Then**: violation 0건 양 모드

### Scenario 7: 매체 전환 후 OX 풀이 가능
- **Given**: 글 모드 + LARGE
- **When**: 스크롤하여 OX 영역 진입 + 5문항 답변 + 제출
- **Then**: OX UI 도 LARGE 폰트 적용. 제출 정상 작동 (FW-OX-001)

### Scenario 8: 미인증 사용자 — localStorage 만 사용
- **Given**: 세션 없음
- **When**: LARGE 선택
- **Then**: UI 즉시 반영 + localStorage 저장. 서버 영속화 호출 0건

### Scenario 9: 시나리오 실행 시간
- **Given**: CI 환경
- **When**: 본 spec 단독 실행
- **Then**: 90초 이내 완료

### Scenario 10: 시나리오 격리
- **Given**: 본 spec 종료 직후
- **When**: TS-E2E-001/002/004 실행
- **Then**: 본 테스트 데이터 잔여 0. spec 간 충돌 0

## :gear: Technical & Non-Functional Constraints
- **Playwright 환경**: Chromium 우선 (Closed Beta). Firefox·Safari 는 Public Pilot
- **getComputedStyle 활용**: 실제 적용된 font-size 검증 (`page.evaluate(() => getComputedStyle(document.querySelector('article')).fontSize)`)
- **Performance API**: 매체 전환 시간 측정 — `performance.mark()` + `performance.measure()`
- **다른 디바이스 시뮬레이션**: `browser.newContext()` 로 두 컨텍스트 생성. 쿠키·localStorage 격리
- **FOUC 검증**: Playwright 의 `page.screenshot({ path: 'after-load.png' })` 첫 paint 시점 + DOM mutation observer 로 dark 클래스 부여 시점 측정
- **테스트 격리**: `test-jeongsook-{timestamp}@example.com` 동적 사용자
- **시드 데이터**: 한정숙 픽스처 + Lesson L001 + 스크립트 콘텐츠 (글 모드 검증용)
- **재시도 정책**: Playwright `retries: 1`. 다크 모드 전환 변동성 고려
- **금지**:
  - 임의 sleep
  - 실제 YouTube 영상 재생
  - 프로덕션 DB 사용

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `tests/e2e/story-5-a-jeongsook.spec.ts` 구현 완료
- [ ] 매체 전환 + 글자 크기 + 색 모드 (선택) 통합 검증
- [ ] WCAG 1.4.4 200% 확대 호환 검증
- [ ] axe-core 양 모드 통과 (TS-A11Y-001 확장)
- [ ] FOUC 부재 검증
- [ ] CI (IF-CI-004) 자동 실행
- [ ] 시나리오 실행 시간 ≤ 90초
- [ ] flaky 검증 — 동일 spec 10회 연속 실행 통과
- [ ] **Closed Beta Exit Gate 진입** — Story 5-A 의 자동화 안전망
- [ ] data-testid 기반 선택자
- [ ] PR 본문에 "Story 5-A 한정숙 학습 루프 자동화. WCAG 1.4.4 호환 검증" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-AUTH-005 (User Preferences PATCH)
  - FR-LES-004 (글자 크기 토글)
  - FR-AUTH-003 (색 모드 자동 감지)
  - FR-LES-003 (시청 페이지 — 매체 전환 토글)
  - FW-AUTH-003 (로그인)
  - CT-MOCK-001 (Lesson + script 시드)
- **Blocks**:
  - **Closed Beta Exit Gate** — Story 5-A 자동화 검증
  - TS-E2E-004 (김성호 E2E — 본 spec 인프라 재사용)
- **Related**:
  - WCAG 2.1 SC 1.4.3 (Contrast Minimum), SC 1.4.4 (Resize Text)
