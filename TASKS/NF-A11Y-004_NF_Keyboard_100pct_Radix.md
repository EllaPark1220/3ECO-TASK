# [NF] NF-A11Y-004: 키보드 100% — shadcn/ui Radix 기본 + E2E 키보드 검증

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-A11Y-004: 키보드 100% NFR — shadcn/ui Radix 기본 키보드 지원 + TS-E2E-005 재사용 + 커스텀 위젯 감사"
labels: 'nf, accessibility, keyboard, radix, priority:high, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-A11Y-004] 키보드 100% 탐색 NFR 검증
- **목적**: REQ-NF-037 (키보드만으로 100% 탐색 가능) 의 비기능 수준 보장. shadcn/ui (Radix Primitives 기반) 가 기본 제공하는 키보드 접근성을 확인하고, 커스텀 위젯(YouTube 플레이어, 스탬프 맵 등) 에 대해 추가 키보드 지원이 필요한 부분을 감사·보완. TS-E2E-005 의 Playwright 키보드 테스트를 NFR 게이트로 재사용.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-037 (키보드 100%)
- 선행: TS-E2E-005 (키보드 E2E 테스트 — 재사용)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **shadcn/ui Radix 키보드 감사** — 컴포넌트별 확인:
  | 컴포넌트 | Radix 기본 | 추가 필요 |
  |---|---|---|
  | Button | ✅ Enter/Space | 없음 |
  | Dialog (Modal) | ✅ Esc 닫기, 포커스 트랩 | 없음 |
  | DropdownMenu | ✅ Arrow/Enter/Esc | 없음 |
  | RadioGroup (OX) | ✅ Arrow 이동, Space 선택 | 없음 |
  | Toggle (매체 전환) | ✅ Space 토글 | 없음 |
  | Slider (글자 크기) | ✅ Arrow 증감 | 없음 |
  | Tabs | ✅ Arrow 탭 전환 | 없음 |
- [ ] **커스텀 위젯 키보드 보완** — Radix 미적용 영역:
  ```ts
  // 1. YouTube 플레이어 — iframe 내부는 YouTube 관할
  //    → 키보드로 iframe 포커스 진입 가능하도록 tabindex 확보
  //    → iframe 외부 Skip 버튼 제공

  // 2. 스탬프 맵 그리드 — 커스텀 컴포넌트
  //    → role="grid" + aria-label 추가
  //    → Arrow 키로 카드 간 이동 구현
  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    const cols = 4; // 그리드 열 수
    switch (e.key) {
      case 'ArrowRight': focusCard(index + 1); break;
      case 'ArrowLeft':  focusCard(index - 1); break;
      case 'ArrowDown':  focusCard(index + cols); break;
      case 'ArrowUp':    focusCard(index - cols); break;
      case 'Enter':      openLesson(index); break;
    }
  };
  ```
- [ ] **Skip to content 링크 확인** — 모든 페이지:
  ```tsx
  // app/layout.tsx
  <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute ...">
    본문으로 건너뛰기
  </a>
  ```
- [ ] **포커스 링 글로벌 스타일** — `globals.css`:
  ```css
  :focus-visible {
    outline: 2px solid hsl(var(--ring));
    outline-offset: 2px;
  }
  /* outline: none 전역 제거 금지 */
  ```
- [ ] **TS-E2E-005 재사용**: NFR 게이트로 매 PR 실행
  ```yaml
  # .github/workflows/quality.yml 에서 TS-E2E-005 포함
  - name: Keyboard A11Y
    run: npx playwright test tests/e2e/keyboard-navigation.spec.ts
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: shadcn/ui 컴포넌트 7종 키보드 동작
- **Given**: Button·Dialog·Dropdown·Radio·Toggle·Slider·Tabs
- **When**: 키보드만으로 조작
- **Then**: 모든 컴포넌트 키보드 100% 접근 가능

### Scenario 2: 스탬프 맵 그리드 Arrow 이동
- **Given**: 스탬프 맵 카드 포커스
- **When**: Arrow 키 이동
- **Then**: 상하좌우 카드 이동 정상

### Scenario 3: YouTube iframe 포커스 진입
- **Given**: Tab 키 순회
- **When**: iframe 도달
- **Then**: 포커스 진입 가능 + Skip 버튼 존재

### Scenario 4: Skip to content 동작
- **Given**: 모든 페이지 첫 Tab
- **When**: Skip 링크 활성
- **Then**: Enter 시 #main-content 로 이동

### Scenario 5: 포커스 링 전역 표시
- **Given**: 모든 인터랙티브 요소
- **When**: 키보드 포커스
- **Then**: `:focus-visible` outline 2px 표시

### Scenario 6: outline:none 전역 부재
- **Given**: 코드베이스
- **When**: `grep 'outline.*none'` 검사
- **Then**: 전역 outline:none 0건 (컴포넌트 수준 예외만 허용)

### Scenario 7: TS-E2E-005 CI 통합
- **Given**: PR push
- **When**: CI 실행
- **Then**: keyboard-navigation.spec.ts 자동 실행 + 통과

### Scenario 8: tabindex 감사
- **Given**: 전체 페이지
- **When**: `tabindex="-1"` 검색
- **Then**: 정당한 사유 있는 경우만. 남용 0건

## :gear: Technical & Non-Functional Constraints
- **shadcn/ui + Radix**: 대부분의 키보드 접근성이 기본 제공. 커스텀 위젯만 보완
- **WCAG 2.1 SC 2.1.1**: 키보드 100% (Level A)
- **포커스 순서**: DOM 순서 = 시각 순서 (CSS order 남용 금지)
- **포커스 트랩**: 모달 열림 시 내부 순환 (Radix Dialog 기본)
- **금지**: `outline: none` 전역, `tabindex="-1"` 남용, 마우스 전용 이벤트(onClick without onKeyDown)

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 통과
- [ ] shadcn/ui 7종 키보드 감사 완료
- [ ] 커스텀 위젯 키보드 보완 (스탬프 맵 Grid)
- [ ] Skip to content 전 페이지 동작
- [ ] 포커스 링 글로벌 스타일 확인
- [ ] TS-E2E-005 CI 연동
- [ ] PR 본문에 "REQ-NF-037 키보드 100% NFR. Radix 감사" 명시

## :construction: Dependencies & Blockers
- **Depends on**: TS-E2E-005 (키보드 E2E 테스트)
- **Blocks**: NF-A11Y-001 (접근성 체크리스트 100%)
- **Related**: REQ-NF-037, WCAG 2.1.1
