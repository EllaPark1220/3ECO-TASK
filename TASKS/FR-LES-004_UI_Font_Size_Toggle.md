# [Feature] FR-LES-004: 글자 크기 조절 토글 — 16px / 18px / 20px (저시력 대응)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-LES-004: 레슨 페이지 글자 크기 조절 토글 — SMALL(16px) / MEDIUM(18px) / LARGE(20px) + 영속화"
labels: 'feature, frontend, lesson, accessibility, story-5, priority:high, mvp-in, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-LES-004] 레슨 시청 페이지의 글자 크기 조절 컴포넌트 — 3단계 (`SMALL` 16px / `MEDIUM` 18px / `LARGE` 20px) + FW-AUTH-005 영속화 + body 직접 적용 (페이지 전체 영향)
- **목적**: Story 5-A (한정숙 · 저시력) 의 핵심 — 본문·OX 문항·UI 모든 텍스트의 가독성을 사용자가 직접 조절. WCAG 1.4.4 (텍스트 크기 200% 확대 호환) + REQ-FUNC-027 (글자 크기 조절) 충족. **본 태스크는 텍스트 줌만 다루며 페이지 줌(zoom) 은 브라우저 기능에 위임**.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.5` — REQ-FUNC-027 (글자 크기 조절)
  - `/docs/SRS_V0_9.md#4.2.6` — REQ-NF-035 (텍스트 200% 확대 호환), REQ-NF-039 (영속화)
  - `/docs/SRS_V0_9.md#3.5.2` — UC-09 (환경설정 변경)
  - `/docs/SRS_V0_9.md#5.1` — TC-027 (글자 크기 조절 테스트)
  - `/docs/SRS_V0_9.md#1.5.1.2` — C-TEC-004 (Tailwind + shadcn/ui)
- 페르소나: SH-04 한정숙 (저시력)
- WCAG 참고: WCAG 2.1 SC 1.4.4 (Resize Text — 200% 확대 시 콘텐츠 손실 0)
- 선행: FW-AUTH-005 (영속화 Write), FR-LES-003 (시청 페이지 호스트)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/lesson/[id]/components/FontSizeToggle.tsx` Client Component
- [ ] **shadcn/ui `Select` 또는 `ToggleGroup` 활용** (Radix 기반 — 키보드·ARIA 자동)
- [ ] 옵션 3종:
  - `SMALL` — 16px (기본 본문 크기)
  - `MEDIUM` — 18px (기본값, default)
  - `LARGE` — 20px (저시력 사용자)
- [ ] **CSS 적용 방식 — CSS Variable + html 클래스**:
  ```css
  :root { --font-size-base: 18px; }
  html.font-small  { --font-size-base: 16px; }
  html.font-medium { --font-size-base: 18px; }
  html.font-large  { --font-size-base: 20px; }

  body, .lesson-content, .ox-question { font-size: var(--font-size-base); }
  ```
- [ ] **rem 단위 활용** — 본문·UI 의 모든 텍스트가 base 기준 상대 크기 (`text-base`, `text-lg` 등 Tailwind class 활용). 절대 px 금지
- [ ] **선택 즉시 반영** — `useState` 로 클라이언트 상태 관리 → html 클래스 즉시 변경 → 영속화는 별도 (debounce 500ms)
- [ ] **영속화 정책**:
  - 클라이언트 상태 변경 즉시 — UI 반영
  - 500ms debounce 후 — `updateUserPreferences({ font_size: 'LARGE' })` 호출 (FW-AUTH-005)
  - localStorage 보조 — 다음 페이지 진입 시 서버 fetch 대기 없이 즉시 적용
- [ ] **레이아웃 무너짐 방지** — `LARGE` 선택 시 텍스트 줄바꿈 자연스럽게 처리. min-width 설정 없음. 컨테이너 max-width 만 유지
- [ ] **OX 문항도 동일 적용** — `.ox-question` class 가 `--font-size-base` 활용
- [ ] **PDF 내부는 별도** — PDF 는 인쇄용이라 글자 크기 조절 영향 받지 않음 (FW-PDF-002 의 고정 폰트 크기)
- [ ] **헤더 + 푸터는 영향 받지 않음** — 사이트 전체 UI 가 아닌 콘텐츠 영역만 적용 (선택)
  - 또는 전체 적용 (페이지 줌 효과) — 정책 결정. 본 태스크는 **콘텐츠 영역만 적용** 채택 (네비게이션 안정성)
- [ ] **키보드 네비게이션** — Tab 으로 토글 진입 + 화살표키로 옵션 이동 + Enter/Space 로 선택 (Radix 기본)
- [ ] **aria-label** — "글자 크기 조절: 작게 / 보통 / 크게" 명시
- [ ] **로딩 시 깜빡임 방지** — 페이지 첫 로드 시 fontSize 가 적용되기 전 깜빡이는 것 (FOUC) 방지:
  - localStorage 의 fontSize 를 `<html class="font-...">` 에 SSR 또는 inline script 로 즉시 적용
  - 또는 RSC 에서 사용자 환경설정을 미리 fetch 하여 `<html>` 에 class 부여

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: SMALL 선택 시 16px 적용
- **Given**: 기본 MEDIUM 상태에서 사용자가 `SMALL` 선택
- **When**: Select 옵션 변경
- **Then**: html 에 `font-small` 클래스 적용. 본문 텍스트 즉시 16px 로 변경. 500ms 후 `updateUserPreferences({ font_size: 'SMALL' })` 호출

### Scenario 2: LARGE 선택 시 20px 적용 + 레이아웃 안정
- **Given**: SMALL 상태
- **When**: `LARGE` 선택
- **Then**: 본문 20px 로 즉시 변경. 줄바꿈 자연스러움. 컨테이너 overflow 0건. OX 문항도 동일 적용

### Scenario 3: 영속화 — 다음 로그인
- **Given**: LARGE 선택 후 로그아웃
- **When**: 다른 디바이스에서 로그인 후 `/lesson/L001` 진입
- **Then**: 서버 SSOT 의 fontSize='LARGE' 자동 적용. 첫 렌더부터 20px (FOUC 방지)

### Scenario 4: localStorage 보조 캐시 — 즉시 적용
- **Given**: LARGE 사용자가 페이지 새로고침
- **When**: 페이지 로드
- **Then**: localStorage 의 fontSize 기반으로 inline script 가 SSR 직후 html 클래스 부여. 첫 렌더부터 LARGE 적용. 깜빡임 0건

### Scenario 5: 미인증 사용자 — 영속화 skip
- **Given**: 세션 없는 사용자
- **When**: SMALL 선택
- **Then**: html 클래스 즉시 변경 (UI 적용). 영속화 호출 0건 (401 회피). localStorage 만 업데이트

### Scenario 6: 키보드 네비게이션
- **Given**: 마우스 미사용
- **When**: Tab → 토글 포커스 → 화살표키 → Enter
- **Then**: 키보드만으로 모든 옵션 선택 가능. 포커스 시각 스타일 명확

### Scenario 7: aria-label 검증
- **Given**: 스크린 리더 사용자
- **When**: 토글 포커스
- **Then**: "글자 크기 조절: 보통 선택됨" 같은 명확한 음성 안내

### Scenario 8: 200% 텍스트 확대 호환 (WCAG 1.4.4)
- **Given**: 브라우저 텍스트 크기 200% + LARGE 선택 (이중 확대)
- **When**: 페이지 렌더
- **Then**: 콘텐츠 손실 0건. 가로 스크롤 0건 (모바일 뷰포트에서). 텍스트 자연 줄바꿈

### Scenario 9: 색 대비 4.5:1 유지 (FR-LES-005 의 highlight 와 정합)
- **Given**: LARGE 텍스트 + highlight 적용
- **When**: axe-core 검사
- **Then**: 색 대비 ≥ 4.5:1 모든 단계 (LARGE 에서도 디자인 토큰이 일관 유지)

### Scenario 10: 다른 페이지로 이동 후 일관성
- **Given**: `/lesson/L001` 에서 LARGE 선택
- **When**: `/stamp-map` 으로 이동
- **Then**: 스탬프 맵 페이지의 텍스트도 LARGE 적용 (전역 적용 정책)

## :gear: Technical & Non-Functional Constraints
- **shadcn/ui 강제 (C-TEC-004)**: Select 또는 ToggleGroup 컴포넌트 활용. Radix 기반이라 ARIA·키보드 자동
- **CSS Variable 패턴**: `:root { --font-size-base }` + html 클래스 토글. 인라인 style 금지 (성능 + 유지보수)
- **rem 단위 표준화**: Tailwind 의 `text-base`/`text-lg`/`text-xl` 등 활용. 절대 px 금지 (200% 확대 호환 위함)
- **debounce 500ms**: 사용자가 빠르게 SMALL → MEDIUM → LARGE 토글 시 마지막 값만 영속화. 네트워크 부하 경감
- **localStorage 보조 정책**:
  - 서버 SSOT > localStorage > 기본값 (MEDIUM) 우선순위
  - localStorage 는 깜빡임 방지의 단일 목적
- **FOUC 방지 — inline script**:
  ```html
  <script>
    const fs = localStorage.getItem('fontSize') || 'MEDIUM';
    document.documentElement.classList.add(`font-${fs.toLowerCase()}`);
  </script>
  ```
  본 script 는 `<head>` 최상단에 배치 (Next.js 의 RSC `Script` 컴포넌트 활용)
- **콘텐츠 영역만 적용 vs 전역 적용 정책**: 본 태스크는 **전역 적용 채택** (사용자 일관 경험). 헤더·푸터도 동일 영향
- **WCAG 1.4.4 호환**: 200% 텍스트 확대 시 콘텐츠 손실 0건. 가로 스크롤 모바일에서도 발생 안함
- **PDF 미영향**: FW-PDF-002 의 PDF 는 고정 크기. 본 토글 영향 받지 않음
- **금지**:
  - 절대 px 단위 사용 (rem 만)
  - 페이지 줌 (zoom CSS) 사용 — 브라우저 기능에 위임
  - 글자 크기 변경 시 페이지 새로고침 (즉시 반영 정책)
  - 4단계 이상의 옵션 (단순화 — 3단계 충분)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `FontSizeToggle.tsx` 컴포넌트 구현
- [ ] CSS Variable + html 클래스 패턴 적용
- [ ] FW-AUTH-005 영속화 통합 (debounce 500ms)
- [ ] localStorage 보조 캐시 + FOUC 방지 inline script 동작
- [ ] axe-core 색 대비 + ARIA 통과 (TS-A11Y-001)
- [ ] 키보드 네비게이션 100% 통과
- [ ] WCAG 1.4.4 — 200% 텍스트 확대 + LARGE 이중 확대에서 콘텐츠 손실 0건
- [ ] FR-LES-003 (시청 페이지) 와 통합 — 본 토글이 헤더 영역에 노출
- [ ] TS-E2E-003 (한정숙 E2E) 의 글자 크기 단계 통과
- [ ] PR 본문에 "Story 5-A 한정숙의 가독성 핵심. WCAG 1.4.4 호환" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-LES-003 (레슨 시청 페이지 — 본 토글의 호스트)
  - FW-AUTH-005 (User Preferences PATCH — fontSize 영속화)
  - 디자인 토큰 (Tailwind 의 `text-base`/`text-lg`/`text-xl` 정합)
  - CT-DB-002 (User.fontSize 컬럼 — FW-AUTH-005 의 마이그레이션에서 추가)
- **Blocks**:
  - TS-E2E-003 (한정숙 E2E — 본 토글 단계)
  - TS-A11Y-001 (axe-core CI — 본 컴포넌트도 검사 대상)
  - REQ-NF-035 (텍스트 200% 확대 호환) 검증
- **Related**:
  - WCAG 2.1 SC 1.4.4 (Resize Text)
