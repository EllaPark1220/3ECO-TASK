# [Feature] FR-AUTH-003: 시스템 색 모드 자동 감지 (prefers-color-scheme) + 사용자 override

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-AUTH-003: 시스템 색 모드 자동 감지 (prefers-color-scheme) + 사용자 override (Light/Dark/System) + 색 대비 4.5:1 양 모드 검증"
labels: 'feature, frontend, theme, accessibility, story-5, priority:high, mvp-in, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-AUTH-003] 시스템 색 모드 자동 감지 — `prefers-color-scheme` 미디어 쿼리 기반 + 사용자 override 3단계 (`LIGHT` / `DARK` / `SYSTEM`) + 영속화
- **목적**: Story 5-A (한정숙 · 저시력) 보조 — 일부 저시력 사용자는 다크 모드에서 가독성이 더 좋음. 사용자가 OS 설정과 다른 모드를 선호할 수도 있어 override 필요. REQ-NF-036 (색 모드 자동 감지) + REQ-NF-034 (색 대비 4.5:1 양 모드) 충족.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.5` — REQ-FUNC-029 (색 모드 자동 감지·override)
  - `/docs/SRS_V0_9.md#4.2.6` — REQ-NF-034 (색 대비 4.5:1 — 양 모드 모두), REQ-NF-036 (시스템 모드 감지)
  - `/docs/SRS_V0_9.md#5.1` — TC-029, TC-034
  - `/docs/SRS_V0_9.md#1.5.1.2` — C-TEC-004 (Tailwind dark: 변형 활용)
- WCAG 참고: WCAG 2.1 SC 1.4.3 (Contrast Minimum) — 양 모드 모두 4.5:1
- 페르소나: SH-04 한정숙 (저시력 — 일부 사용자는 다크 모드 선호)
- 선행: FW-AUTH-005 (영속화 Write)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **User 모델 마이그레이션** — `colorMode` enum 컬럼 추가 (`LIGHT` | `DARK` | `SYSTEM`). default `'SYSTEM'`
- [ ] **FW-AUTH-005 확장** — `colorMode` 필드를 PATCH 가능 필드로 추가 (기존 액션의 Zod 스키마에 옵션 추가)
- [ ] `app/components/ColorModeToggle.tsx` Client Component
- [ ] **shadcn/ui `DropdownMenu` 또는 `Select` 활용** — 3옵션 (Light / Dark / System)
- [ ] **Tailwind dark: 변형 활용**:
  ```js
  // tailwind.config.js
  module.exports = { darkMode: 'class', ... }
  ```
- [ ] **html 클래스 토글**:
  - `LIGHT` → html class 에서 `dark` 제거
  - `DARK` → html class 에 `dark` 추가
  - `SYSTEM` → `prefers-color-scheme` 미디어 쿼리 평가 후 결정. 사용자가 OS 모드 변경 시 자동 동기화
- [ ] **prefers-color-scheme 미디어 쿼리 watch**:
  ```ts
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', (e) => {
    if (currentMode === 'SYSTEM') {
      document.documentElement.classList.toggle('dark', e.matches);
    }
  });
  ```
- [ ] **영속화**:
  - 사용자 변경 즉시 — UI 반영 + localStorage 저장
  - 500ms debounce 후 — `updateUserPreferences({ color_mode: 'DARK' })` (FW-AUTH-005)
- [ ] **다크 모드 디자인 토큰** — Tailwind 의 `dark:` 변형으로 모든 색상 정의:
  ```jsx
  <div className="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
  ```
- [ ] **색 대비 4.5:1 검증 — 양 모드 모두**:
  - Light 모드: 본문 #1F2937 on #FFFFFF (대비 14.6:1 ✓)
  - Dark 모드: 본문 #F3F4F6 on #111827 (대비 14.4:1 ✓)
  - 모든 컴포넌트가 양 모드에서 axe-core 통과 강제
- [ ] **FOUC 방지 inline script** (FR-LES-004 와 동일 패턴):
  ```html
  <script>
    const cm = localStorage.getItem('colorMode') || 'SYSTEM';
    const isDark = cm === 'DARK' || (cm === 'SYSTEM' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) document.documentElement.classList.add('dark');
  </script>
  ```
  `<head>` 최상단 배치
- [ ] **PDF 미영향** — PDF 는 항상 라이트 모드 (인쇄 호환 + 잉크 절약)
- [ ] **YouTube iframe 처리** — iframe 내부는 YouTube 가 자체 다크 모드 처리 (외부 컨트롤 불가). 단 iframe 주변 컨테이너는 본 색 모드 따름
- [ ] **이미지·아이콘 처리** — SVG 아이콘은 `currentColor` 활용으로 자동 변색. 비트맵 이미지가 있다면 dark 모드용 별도 이미지 또는 filter 적용

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: SYSTEM 모드 + OS 라이트
- **Given**: colorMode='SYSTEM' + OS 가 라이트 모드
- **When**: 페이지 로드
- **Then**: html 에 `dark` 클래스 없음. 라이트 디자인 토큰 적용

### Scenario 2: SYSTEM 모드 + OS 다크
- **Given**: colorMode='SYSTEM' + OS 가 다크 모드
- **When**: 페이지 로드
- **Then**: html 에 `dark` 클래스 자동 추가. 다크 디자인 토큰 적용

### Scenario 3: 사용자 override — DARK 강제
- **Given**: OS 가 라이트 모드 + 사용자가 DARK 선택
- **When**: 토글 변경
- **Then**: html 에 `dark` 추가. OS 설정 무시. localStorage + 서버 영속화

### Scenario 4: SYSTEM 모드 — OS 변경 시 즉시 동기화
- **Given**: colorMode='SYSTEM' + OS 가 라이트 → 다크로 변경
- **When**: 사용자가 OS 설정 변경 (Mac System Preferences 또는 자동 일몰 시간)
- **Then**: 페이지 새로고침 없이 즉시 다크 모드 전환 (matchMedia change 이벤트 활용)

### Scenario 5: 영속화 — 다음 로그인
- **Given**: 사용자가 DARK 선택 후 로그아웃
- **When**: 다른 디바이스에서 로그인
- **Then**: 서버 SSOT 의 colorMode='DARK' 자동 적용

### Scenario 6: FOUC 방지
- **Given**: DARK 사용자가 페이지 새로고침
- **When**: 페이지 첫 paint
- **Then**: 라이트 모드 깜빡임 0건. inline script 가 SSR 직후 즉시 dark 클래스 부여

### Scenario 7: 색 대비 4.5:1 — 양 모드 검증
- **Given**: 모든 컴포넌트가 양 모드에서 렌더
- **When**: axe-core 검사 (TS-A11Y-001) — 양 모드 모두
- **Then**: 라이트·다크 모두 violation 0건

### Scenario 8: 키보드 네비게이션
- **Given**: 마우스 미사용
- **When**: Tab → 색 모드 토글 포커스 → Space 또는 화살표
- **Then**: 키보드만으로 모드 변경 가능

### Scenario 9: PDF 미영향 검증
- **Given**: 사용자가 DARK 모드 + PDF 다운로드
- **When**: PDF 렌더
- **Then**: PDF 는 항상 라이트 모드 (배경 흰색 + 검은 텍스트). 인쇄 호환

### Scenario 10: 미인증 사용자 — localStorage 만 사용
- **Given**: 세션 없는 사용자
- **When**: DARK 선택
- **Then**: html 클래스 즉시 변경 + localStorage 저장. 서버 영속화 호출 0건

## :gear: Technical & Non-Functional Constraints
- **Tailwind darkMode='class'**: media query 자동 모드가 아닌 class 기반. 사용자 override 가능
- **prefers-color-scheme 표준**: CSS Media Queries Level 5 표준. 모든 모던 브라우저 지원 (IE 미지원이지만 본 프로젝트는 모던 브라우저 전제)
- **matchMedia change 이벤트**: SYSTEM 모드일 때만 watch. LIGHT·DARK 강제 모드에서는 무시 (사용자 의도 우선)
- **FOUC 방지 inline script 위치**: `<head>` 최상단. RSC 의 stream 시작 전 평가
- **색 대비 4.5:1 강제**: 양 모드 모두 axe-core 자동 검증. CI 게이트 (TS-A11Y-001) 가 양 모드 모두 검사
- **PDF 미영향**: FW-PDF-002 의 PDF 는 고정 라이트 모드. 본 토글 무관
- **YouTube iframe**: YouTube 가 자체 다크 모드 처리. 본 컴포넌트가 iframe 내부 제어 불가
- **SVG 아이콘 처리**: `fill="currentColor"` 패턴 강제. 비트맵 사용 금지 (다크 모드 호환 위함)
- **시각 회귀 위험**: 다크 모드 추가 시 기존 컴포넌트 재검증 필요. 단계적 도입 정책 — Closed Beta 에서만 활성화 (Alpha·Private Beta 는 라이트만)
- **응답 시간**: 모드 전환 시 페이지 reflow ≤ 100ms (CSS 변경만)
- **금지**:
  - 직접 색상값 (예: `#FFFFFF`) inline 사용 — Tailwind 토큰만
  - 다크 모드 전용 페이지 분기 (단일 페이지에서 양 모드 처리)
  - 시스템 모드 무시 (사용자 OS 설정 존중)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] User.colorMode 마이그레이션 추가 + FW-AUTH-005 PATCH 필드 확장
- [ ] `ColorModeToggle.tsx` 컴포넌트 구현
- [ ] Tailwind darkMode='class' 설정 적용
- [ ] 모든 기존 컴포넌트 (FR-LES-003·005, FR-STAMP-002, FR-OX-001, 헤더·푸터) 의 dark: 변형 추가
- [ ] FOUC 방지 inline script 동작 검증
- [ ] axe-core CI 가 양 모드 모두 검사 (TS-A11Y-001 확장)
- [ ] matchMedia change 이벤트 동작 검증 (SYSTEM 모드)
- [ ] 키보드 네비게이션 100%
- [ ] PR 본문에 "Story 5-A 한정숙 보조 — 양 모드 색 대비 4.5:1" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-AUTH-005 (User Preferences PATCH — colorMode 필드 확장)
  - CT-DB-002 (User 모델 — colorMode 컬럼 추가 마이그레이션)
  - 디자인 토큰 (Tailwind 의 다크 모드 색상 정의)
- **Blocks**:
  - TS-E2E-003 (한정숙 E2E — 색 모드 토글 단계)
  - TS-A11Y-001 (axe-core CI — 양 모드 검사 확장)
  - REQ-NF-036 (시스템 모드 자동 감지) 검증
- **Related**:
  - 디자인 시스템 v2 — 다크 모드 디자인 토큰 정의 (별도 작업)
  - 기존 컴포넌트 dark: 변형 추가 (병행 작업 또는 후속 PR 시리즈)
