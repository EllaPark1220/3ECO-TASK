# [Feature] FR-LES-005: OX 오답 시 스크립트 앵커 자동 스크롤

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-LES-005: OX 오답 시 스크립트 앵커 자동 스크롤 (scroll_to_section 처리)"
labels: 'feature, frontend, lesson, accessibility, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-LES-005] OX 응답의 `scroll_to_section` 앵커를 받아, 스크립트의 해당 `<section id="anchor-N">` 위치로 부드러운 스크롤 + 시각적 강조 + 포커스 이동
- **목적**: REQ-FUNC-036 의 클라이언트 종착점. P1 체계감 부재 Pain 해소의 핵심 학습 루프 — 오답을 맞은 사용자가 어느 부분을 다시 읽어야 하는지 자동 안내. UC-02 (OX 제출) 의 후속 흐름이며, 학습자의 "어디서 막혔는지 모르겠다" 좌절감 해소.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-036 (오답 앵커 스크롤)
  - `/docs/SRS_V0_9.md#5.1` — TC-036
  - `/docs/SRS_V0_9.md#3.4.1` — OX 시퀀스 (`scroll_to_section` 응답 필드)
  - `/docs/SRS_V0_9.md#6.2.2` — OX_QUESTION.scroll_anchor 컬럼
- 선행: FR-LES-003 (스크립트 렌더), FR-OX-001 (OX UI 의 호출자)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/lesson/[id]/utils/scrollToAnchor.ts` — 순수 함수 + hook 분리:
  - `scrollToAnchor(anchorId: string, options?)` 함수
  - `useScrollToAnchor()` hook (옵션)
- [ ] **앵커 마크업 강제 — script 렌더 시 자동 ID 생성**:
  - LessonPlayer (FR-LES-003) 또는 별도 ScriptRenderer 가 script 텍스트를 파싱하여 문단별로 `<section id="anchor-N">` 자동 wrap
  - N 은 OxQuestion.scrollAnchor 와 매핑되는 번호
- [ ] **스크롤 동작**:
  - `element.scrollIntoView({ behavior: 'smooth', block: 'start' })` 사용
  - 헤더 fixed 인 경우 offset 보정 (`window.scrollTo` + `getBoundingClientRect`)
- [ ] **시각 강조 (3초)**:
  - 대상 section 에 임시 highlight class 부여 (배경 차분한 노란/연한 강조)
  - 3초 후 자동 제거 (CSS transition)
  - 색 대비 4.5:1 유지
- [ ] **포커스 이동 (접근성 핵심)**:
  - section 에 `tabIndex={-1}` 임시 설정
  - `element.focus({ preventScroll: true })` 호출
  - 스크린 리더가 해당 섹션 시작 부분부터 읽기 시작
- [ ] **prefers-reduced-motion 대응**:
  - 사용자가 `prefers-reduced-motion: reduce` 설정 시 smooth 스크롤 비활성. instant scroll 사용
- [ ] **글 모드 ↔ 영상 모드 통합**:
  - 사용자가 영상 모드인 경우 자동으로 글 모드로 전환 후 스크롤
  - 또는 "글로 보기로 전환됩니다" 토스트 + 사용자 확인 (UX 정책 결정 — 본 태스크는 자동 전환 채택)
- [ ] **앵커 미존재 시 폴백** — `scroll_to_section` 의 ID 가 DOM 에 없는 경우 (script 변경 등) 페이지 상단으로 이동 + 콘솔 에러 (운영 알림)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 앵커 스크롤
- **Given**: 글 모드에서 script 가 렌더된 상태 + section id="anchor-3" 가 DOM 존재
- **When**: `scrollToAnchor('#anchor-3')` 호출
- **Then**: section 이 viewport 상단에 위치 (smooth scroll). 3초간 highlight class 적용. 포커스가 section 으로 이동

### Scenario 2: 영상 모드에서 호출 — 자동 전환
- **Given**: 영상 모드 활성 상태에서 OX 오답 응답 받음
- **When**: scroll_to_section 처리
- **Then**: 글 모드로 자동 전환 + script 렌더 + 앵커 스크롤. 영상 iframe unmount

### Scenario 3: prefers-reduced-motion
- **Given**: 사용자 OS 설정 `prefers-reduced-motion: reduce`
- **When**: scrollToAnchor 호출
- **Then**: smooth 비활성. instant scroll 만 수행

### Scenario 4: 앵커 미존재 — 폴백
- **Given**: script 가 변경되어 anchor-99 가 DOM 에 없음
- **When**: `scrollToAnchor('#anchor-99')` 호출
- **Then**: 페이지 상단으로 scroll + console.error 출력 + Sentry 알림 (운영 모니터링)

### Scenario 5: highlight 자동 제거
- **Given**: Scenario 1 직후 (highlight 적용 상태)
- **When**: 3초 경과
- **Then**: highlight class 자동 제거. CSS transition 으로 부드러운 페이드아웃

### Scenario 6: 포커스 이동 — 스크린 리더 호환
- **Given**: NVDA 스크린 리더 활성 사용자
- **When**: scrollToAnchor 호출
- **Then**: 스크린 리더가 section 시작 부분부터 읽기 시작. tabIndex=-1 임시 설정으로 키보드 흐름 방해 안함

### Scenario 7: 헤더 offset 보정
- **Given**: 페이지 상단에 고정 헤더 60px 존재
- **When**: 앵커 스크롤
- **Then**: section 상단이 헤더 바로 아래에 위치 (60px offset 보정 적용)

### Scenario 8: 동시 다중 호출 — 마지막 호출 우선
- **Given**: 빠르게 2회 OX 제출 (오답 → 다른 오답)
- **When**: scrollToAnchor 가 2회 호출됨
- **Then**: 마지막 호출 우선. 첫 호출의 highlight 는 즉시 제거 + 새 highlight 적용

### Scenario 9: 색 대비 4.5:1
- **Given**: highlight 적용된 section
- **When**: axe-core 검사
- **Then**: highlight 배경 + 텍스트 색 대비 ≥ 4.5:1

## :gear: Technical & Non-Functional Constraints
- **scrollIntoView API**: 표준 Web API 사용. 폴리필 불필요 (모든 모던 브라우저 지원)
- **smooth 스크롤 시간**: 약 300~500ms (브라우저 기본). 매체 전환 (REQ-NF-005 ≤300ms) 와 별개
- **highlight 색상**: 차분한 톤 — 연한 노랑 (#FEF3C7) 또는 연한 청록 (#CFFAFE). 형광색 금지 (게임화 방지)
- **포커스 흐름 보존**: tabIndex=-1 은 임시. 다음 Tab 키 입력 시 자연 흐름으로 복귀
- **글↔영상 모드 자동 전환 정책**: UX 결정 — 자동 전환 채택. 사용자 확인 step 추가 시 학습 흐름 끊김
- **prefers-reduced-motion 강제**: 접근성 핵심. CSS `@media` 쿼리 + JS `window.matchMedia` 양쪽 적용
- **section 자동 wrap 정책**: script 텍스트 파싱이 단순할 경우 (markdown 등) 가능. 복잡한 경우 OxQuestion.scrollAnchor 와 1:1 매핑되는 ID 가 사전 부여되어야 함 — 콘텐츠 편집 SOP 와 정합
- **에러 처리**: 앵커 미존재 시 silently fail 금지. 운영 모니터링 알림 (Sentry) 필수
- **금지**:
  - 강제 모달 또는 alert 으로 오답 통보 (UX 침해)
  - highlight 색상 형광·진동 효과 (게임화)
  - smooth 스크롤 4초 이상 (사용자 불편)

## :checkered_flag: Definition of Done (DoD)
- [ ] 9개 GWT 시나리오 전부 통과
- [ ] `scrollToAnchor()` 함수 + 글↔영상 자동 전환 통합
- [ ] prefers-reduced-motion 동작 검증
- [ ] 헤더 offset 보정 검증
- [ ] highlight CSS transition 자동 제거 동작
- [ ] 포커스 이동 + 스크린 리더 호환 검증 (NVDA 수동)
- [ ] 앵커 미존재 시 폴백 + Sentry 알림 동작
- [ ] FR-OX-001 와 통합 — 오답 응답 시 자동 호출
- [ ] TS-UT-004 (오답 scroll_to_section) 통과
- [ ] axe-core 색 대비 통과
- [ ] PR 본문에 "REQ-FUNC-036 의 클라이언트 종착점" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-LES-003 (script 렌더 + 매체 전환)
  - FR-OX-001 (호출자)
  - CT-DB-006 (OxQuestion.scrollAnchor)
- **Blocks**:
  - TS-E2E-001 (박지훈 E2E — Story 1 의 오답 처리 검증)
  - REQ-FUNC-036 의 자동화 검증 완성
