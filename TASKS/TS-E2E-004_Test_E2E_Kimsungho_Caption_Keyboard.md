# [Test] TS-E2E-004: 김성호 시나리오 E2E (Playwright) — 자막 ON 검증 + 키보드 100% 네비게이션

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-E2E-004: 김성호 시나리오 E2E — 자막 기본 ON + Tab 키 100% 네비게이션 + 모든 인터랙션 키보드 가능"
labels: 'test, e2e, playwright, story-5-b, accessibility, keyboard, priority:critical, mvp-in, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-E2E-004] Playwright E2E — Story 5-B (김성호 · 청각·키보드 사용자) 의 자막 + 키보드 네비게이션 사이클을 자동화 검증
- **목적**: Story 5 두 페르소나 중 두 번째. REQ-FUNC-022 (자막 기본 ON) + REQ-NF-037 (키보드 100% 접근) + WCAG 2.1 SC 2.1.1 (Keyboard) 의 통합 검증. **Closed Beta Exit 게이트의 핵심 검증 항목 마지막 1건. 본 태스크 통과 시 Story 5 폐쇄 + Closed Beta Exit Gate 자동화 완성.**

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-022 (자막 기본 ON)
  - `/docs/SRS_V0_9.md#4.2.6` — REQ-NF-037 (키보드 100% 접근), REQ-NF-038 (포커스 가시성)
  - `/docs/SRS_V0_9.md#3.5.2` — UC-01, UC-02
  - `/docs/SRS_V0_9.md#5.1` — TC-022, TC-031, TC-032 (자막·키보드·포커스)
  - `/docs/SRS_V0_9.md#1.2.3` — Closed Beta Exit 조건
- 페르소나: SH-08 또는 SH-09 김성호 (청각·키보드 — 자막 의존 + 마우스 미사용)
- WCAG 참고:
  - SC 2.1.1 Keyboard (모든 기능 키보드만으로 작동)
  - SC 2.4.7 Focus Visible (포커스 가시성)
  - SC 1.2.2 Captions Prerecorded
- 선행: FR-LES-003 (자막 ON), FR-OX-001 (OX UI 키보드), FR-LES-004 (글자 크기 토글 키보드), FR-STAMP-002 (스탬프 맵 키보드)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `tests/e2e/story-5-b-sungho.spec.ts` 신규 파일
- [ ] beforeAll — 테스트용 사용자 시드 (김성호 페르소나)
- [ ] **Step 1 — 키보드만으로 로그인**:
  - `/auth/login` 접근
  - **마우스 0회 사용** — Playwright 의 `page.keyboard.press()` 만 사용
  - Tab 키로 이메일 input 진입 → 입력 → Tab → 비밀번호 input → 입력 → Tab → "로그인" 버튼 → Enter
  - 로그인 성공 + `/lessons` 또는 `/stamp-map` 으로 리다이렉트
- [ ] **Step 2 — 키보드만으로 레슨 진입**:
  - 스탬프 맵에서 Tab 으로 L001 카드 포커스
  - **포커스 시각 스타일 검증** — `page.evaluate(() => getComputedStyle(document.activeElement).outline)` 로 outline 존재 확인
  - Enter 키 → `/lesson/L001` 진입
- [ ] **Step 3 — 자막 기본 ON 검증 (REQ-FUNC-022)**:
  - YouTube iframe 의 src 검증 — `cc_load_policy=1` 파라미터 포함
  - **YouTube iframe 내부의 자막 표시 검증** (가능한 경우):
    - iframe 의 postMessage API 활용 — `player.getOption('captions', 'track')` 호출
    - 또는 iframe DOM 의 `.ytp-caption-segment` selector 가시성 검증 (cross-origin 제약 가능)
    - 본 검증이 어려운 경우 — `cc_load_policy=1` URL 파라미터 검증으로 대체 (간접 증명)
- [ ] **Step 4 — 키보드로 매체 전환**:
  - Tab 으로 매체 전환 토글 포커스
  - Space 키 → "글로 읽기" 모드 전환
  - `<article>` + 스크립트 콘텐츠 렌더 검증
- [ ] **Step 5 — 키보드만으로 OX 5문항 답변**:
  - Tab 으로 OX 영역 진입
  - 각 문항마다 Tab → 화살표키로 O/X 선택 → Tab → 다음 문항
  - **모든 5문항을 키보드만으로 답변 완료**
  - Tab → "제출" 버튼 → Enter
  - 응답 확인 — `passed: true` UI
- [ ] **Step 6 — 키보드로 스탬프 맵 확인**:
  - Tab → "스탬프 맵으로 이동" 링크 → Enter
  - 스탬프 맵 페이지 진입 + L001 카드의 펄 그라데이션 적용 검증 (DOM class)
- [ ] **Step 7 — 키보드 트랩 부재 검증**:
  - 모달이나 다이얼로그 (예: 재개 토스트) 가 떠도 Tab 키로 빠져나갈 수 있어야 함
  - 모달 내부 → Tab 5회 → 모달 외부로 포커스 이동 가능 검증
- [ ] **Step 8 — 포커스 가시성 검증 (REQ-NF-038)**:
  - 모든 인터랙티브 요소에 포커스 진입 시 outline 또는 ring 표시
  - `:focus-visible` CSS 적용 확인
  - 색 대비 ≥ 3:1 (포커스 인디케이터)
- [ ] **Step 9 — 자막 기본 OFF 회귀 방지**:
  - iframe URL 에 `cc_load_policy=0` 또는 누락된 PR 시뮬레이션
  - 본 spec 이 즉시 Fail 하여 회귀 차단
- [ ] **Step 10 — 정리 (afterAll)**:
  - 테스트 사용자 + 진도 + 스탬프 삭제
- [ ] CI 통합 — IF-CI-004 의 Playwright Job
- [ ] 시나리오 실행 시간 ≤ 100초 (키보드 입력 시뮬레이션이 마우스보다 느림)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 키보드만으로 전체 학습 루프 통과 (Happy Path)
- **Given**: 클린 DB + Lesson L001 + 김성호 픽스처
- **When**: Step 1~6 모두 키보드만 (마우스 0회) 사용
- **Then**: 로그인 → 시청 → OX 통과 → 스탬프 발급 모두 정상. 최종 Stamp 1건

### Scenario 2: 자막 기본 ON 검증 (REQ-FUNC-022)
- **Given**: `/lesson/L001` 페이지
- **When**: YouTube iframe src 검증
- **Then**: `cc_load_policy=1` 파라미터 포함

### Scenario 3: Tab 순서 자연스러움
- **Given**: `/lesson/L001` 페이지 로드
- **When**: Tab 키 반복
- **Then**: 헤더 → 매체 토글 → 글자 크기 토글 → 색 모드 토글 → iframe → 스크립트 → OX 영역 → 푸터 순서로 자연 흐름

### Scenario 4: 포커스 가시성
- **Given**: 모든 인터랙티브 요소
- **When**: Tab 으로 포커스
- **Then**: outline 또는 ring 시각 표시. 색 대비 ≥ 3:1 (포커스 인디케이터). axe-core `focus-order-semantics` 통과

### Scenario 5: 키보드 트랩 부재 (WCAG 2.1.2)
- **Given**: 재개 토스트 또는 모달 표시
- **When**: 모달 내부에서 Tab 5회
- **Then**: 모달 외부로 포커스 이동 가능. 트랩 0건

### Scenario 6: OX 답변 키보드만 (Scenario 1 의 핵심 부분)
- **Given**: OX 영역 진입
- **When**: Tab + 화살표키 + Space + Enter 만 사용
- **Then**: 5문항 모두 답변 + 제출 정상. 마우스 0회

### Scenario 7: 자막 OFF 회귀 — Fail
- **Given**: iframe src 가 의도적으로 `cc_load_policy=0` 으로 변경된 상태 (테스트 시뮬레이션)
- **When**: Scenario 2 실행
- **Then**: spec Fail. PR 차단

### Scenario 8: 시나리오 실행 시간
- **Given**: CI 환경
- **When**: 본 spec 단독 실행
- **Then**: 100초 이내 (키보드 입력 시뮬레이션 + cold start 포함)

### Scenario 9: axe-core 통과 — keyboard 룰셋
- **Given**: 모든 페이지
- **When**: axe-core 검사 (TS-A11Y-001) — `accessible-keyboard` 룰
- **Then**: violation 0건

### Scenario 10: 시나리오 격리
- **Given**: 본 spec 종료
- **When**: TS-E2E-001/002/003/007 실행
- **Then**: 본 테스트 데이터 잔여 0. spec 간 충돌 0

## :gear: Technical & Non-Functional Constraints
- **Playwright keyboard API**: `page.keyboard.press('Tab')`, `.press('Enter')`, `.press('Space')`, `.press('ArrowUp')` 등 활용
- **마우스 0회 강제**: `page.click()` 사용 금지. `page.keyboard.press()` 만 사용. 위반 시 spec 무효
- **YouTube iframe 자막 검증**:
  - 1차 — iframe src URL 의 `cc_load_policy=1` 파라미터 검증 (간접 증명)
  - 2차 (선택) — postMessage IFrame API 의 `getOption('captions')` 호출 (cross-origin 제약 회피 가능 시)
  - 본 spec 은 1차 검증만 필수. 2차는 별도 spec 또는 수동 QA
- **포커스 가시성 검증**: `getComputedStyle(activeElement).outlineStyle !== 'none'` 또는 `boxShadow` 기반 ring 검증
- **키보드 트랩 검증**: 모달 표시 후 Tab 5회 → 외부 요소로 포커스 이동 검증
- **Tab 순서 검증**: data-testid 기반 정렬된 배열로 expected order 정의 + 실제 Tab 순서 매칭
- **테스트 격리**: `test-sungho-{timestamp}@example.com` 동적 사용자
- **재시도 정책**: Playwright `retries: 1`. 키보드 입력 타이밍 변동성 고려
- **시드 데이터**: 김성호 픽스처 + Lesson L001 + OxQuestion 5개 + 자막 ON 검증용 metadata
- **금지**:
  - `page.click()` 사용 (마우스 0회 정책)
  - 임의 sleep (`waitForTimeout`)
  - 실제 YouTube 영상 재생
  - 프로덕션 DB 사용

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `tests/e2e/story-5-b-sungho.spec.ts` 구현 완료
- [ ] **마우스 0회 정책** — 본 spec 코드에 `page.click()` 0건 검증 (정적 분석)
- [ ] 자막 기본 ON 검증 (`cc_load_policy=1`)
- [ ] 포커스 가시성 검증 (REQ-NF-038)
- [ ] 키보드 트랩 부재 검증 (WCAG 2.1.2)
- [ ] axe-core `accessible-keyboard` 룰 통과 (TS-A11Y-001 확장)
- [ ] CI (IF-CI-004) 자동 실행
- [ ] 시나리오 실행 시간 ≤ 100초
- [ ] flaky 검증 — 동일 spec 10회 연속 실행 통과
- [ ] **Story 5 폐쇄 — 본 spec + TS-E2E-003 양 spec 통과 시 Story 5 자동화 검증 완성**
- [ ] **Closed Beta Exit Gate 자동화 완성** — Story 5-A·5-B 양 spec 모두 통과
- [ ] data-testid 기반 선택자
- [ ] PR 본문에 "Story 5-B 김성호 + Closed Beta Exit Gate 자동화 마지막 1건" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-LES-003 (시청 페이지 + iframe + 매체 전환)
  - FR-LES-004 (글자 크기 토글 키보드)
  - FR-AUTH-003 (색 모드 토글 키보드)
  - FR-OX-001 (OX UI 키보드)
  - FR-STAMP-002 (스탬프 맵 키보드)
  - FW-AUTH-003 (로그인)
  - CT-MOCK-001 (Lesson 시드)
- **Blocks**:
  - **Closed Beta Exit Gate** — TS-E2E-003 와 함께 Story 5 폐쇄 검증 마지막 1건
  - TS-A11Y-002 (NVDA 수동 QA — 본 spec 이 자동화 1차 게이트, NVDA 가 Public Pilot 의 2차 게이트)
  - REQ-FUNC-022 (자막 기본 ON) 영구 회귀 방지
- **Related**:
  - WCAG 2.1 SC 2.1.1 Keyboard, SC 2.1.2 No Keyboard Trap, SC 2.4.7 Focus Visible, SC 1.2.2 Captions
