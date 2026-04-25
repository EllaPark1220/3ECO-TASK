# [Test] TS-E2E-005: 키보드 100% 네비게이션 — Tab/Enter/Esc 전 화면

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-E2E-005: 키보드 100% 네비게이션 E2E — Tab/Enter/Esc 전 화면 탐색, 포커스 트랩 검증"
labels: 'test, e2e, playwright, accessibility, keyboard, priority:high, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-E2E-005] 키보드 100% 네비게이션 E2E 테스트
- **목적**: REQ-NF-037 (키보드 100% 탐색) + REQ-FUNC-032 (Tab/Enter/Esc 전 화면 탐색) 를 Playwright 로 자동 검증. 마우스 없이 Tab·Enter·Esc·Space·Arrow 키만으로 모든 페이지의 주요 기능에 접근 가능한지 테스트. 저시력 사용자(한정숙) 및 운동장애 사용자를 위한 접근성 핵심 검증.

## :link: References (Spec & Context)
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-037 (키보드 100%)
  - `/docs/SRS_V0_9.md#5.1` — TC-032
  - `/docs/SRS_V0_9.md#4.1.5` — REQ-FUNC-032 (키보드 탐색)
- 페르소나: SH-06 한정숙, SH-09 김성호
- 선행: FR-LES-003, FR-STAMP-002, FR-OX-001

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `tests/e2e/keyboard-navigation.spec.ts` 작성
- [ ] **페이지별 키보드 탐색 시나리오**:

  ```ts
  import { test, expect } from '@playwright/test';

  test.describe('키보드 100% 네비게이션', () => {

    test('랜딩 → 레슨 목록 → 레슨 상세 진입 (Tab + Enter)', async ({ page }) => {
      await page.goto('/');
      // Tab 으로 네비게이션 메뉴 도달
      for (let i = 0; i < 10; i++) await page.keyboard.press('Tab');
      // '레슨 시작' 링크에 포커스 확인
      const focused = await page.evaluate(() => document.activeElement?.textContent);
      expect(focused).toContain('레슨');
      // Enter 로 진입
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/lessons/);
    });

    test('OX 퀴즈 — 라디오 선택 + 제출 (Arrow + Space + Enter)', async ({ page }) => {
      await page.goto('/lessons/L001');
      // OX 퀴즈 영역 Tab 도달
      await page.keyboard.press('Tab'); // 반복
      // Arrow Down 으로 선택지 이동
      await page.keyboard.press('ArrowDown');
      // Space 로 선택
      await page.keyboard.press('Space');
      // Tab → 제출 버튼 → Enter
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      // 결과 표시 확인
      await expect(page.locator('[data-testid="ox-result"]')).toBeVisible();
    });

    test('스탬프 맵 — Tab 순회 + 포커스 링 표시', async ({ page }) => {
      await page.goto('/stamp-map');
      // 각 레슨 카드 Tab 순회
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab');
        const outline = await page.evaluate(() => {
          const el = document.activeElement;
          return el ? getComputedStyle(el).outlineStyle : '';
        });
        // 포커스 링 존재 확인 (outline 이 none 이 아님)
        expect(outline).not.toBe('none');
      }
    });

    test('모달 — Esc 닫기 + 포커스 트랩', async ({ page }) => {
      await page.goto('/lessons/L001');
      // 모달 트리거 (있을 경우)
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      // Esc 로 닫기
      await page.keyboard.press('Escape');
      // 모달 닫힘 확인
    });

    test('매체 전환 토글 — 키보드 접근', async ({ page }) => {
      await page.goto('/lessons/L001');
      // 매체 전환 토글 Tab 도달 + Space 토글
      const toggle = page.locator('[data-testid="media-toggle"]');
      await toggle.focus();
      await page.keyboard.press('Space');
      await expect(page.locator('[data-testid="text-content"]')).toBeVisible();
    });

    test('Skip to content 링크', async ({ page }) => {
      await page.goto('/lessons/L001');
      // 첫 Tab 에서 Skip to content 링크 노출
      await page.keyboard.press('Tab');
      const skipLink = page.locator('a[href="#main-content"]');
      await expect(skipLink).toBeFocused();
      await page.keyboard.press('Enter');
      // #main-content 로 스크롤
    });

    test('글자 크기 조절 — 키보드 접근', async ({ page }) => {
      await page.goto('/lessons/L001');
      const sizeToggle = page.locator('[data-testid="font-size-toggle"]');
      await sizeToggle.focus();
      await page.keyboard.press('ArrowUp'); // 크기 증가
      const fontSize = await page.evaluate(() =>
        getComputedStyle(document.querySelector('[data-testid="lesson-content"]')!).fontSize
      );
      expect(parseInt(fontSize)).toBeGreaterThanOrEqual(18);
    });
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 랜딩 → 레슨 — Tab + Enter
- **Given**: 키보드만 사용 → **Then**: 레슨 페이지 진입

### Scenario 2: OX 퀴즈 — Arrow + Space + Enter
- **Given**: 키보드만 → **Then**: 선택 + 제출 + 결과 확인

### Scenario 3: 스탬프 맵 — Tab 순회 + 포커스 링
- **Given**: Tab 반복 → **Then**: 모든 카드 포커스 링 표시

### Scenario 4: 모달 — Esc 닫기
- **Given**: 모달 열림 → **Then**: Esc 로 닫힘

### Scenario 5: Skip to content 링크
- **Given**: 첫 Tab → **Then**: Skip 링크 포커스 + Enter 시 main 이동

### Scenario 6: 매체 전환 — Space 토글
- **Given**: 토글 포커스 → **Then**: Space 로 전환

### Scenario 7: 글자 크기 — Arrow 조절
- **Given**: 토글 포커스 → **Then**: ArrowUp 으로 크기 증가

### Scenario 8: 포커스 순서 — 논리적 순서
- **Given**: 전체 페이지 Tab → **Then**: 좌→우, 상→하 논리적 순서

## :gear: Technical & Non-Functional Constraints
- **Playwright 키보드 API**: `page.keyboard.press()` 활용
- **포커스 링 필수**: `:focus-visible` outline 2px+ (색상 대비 ≥ 3:1)
- **Skip to content**: 모든 페이지 첫 Tab 에서 접근
- **포커스 트랩**: 모달·드롭다운 내부에서 Tab 순환
- **금지**: Tab index 음수(-1) 남용, 포커스 링 `outline: none` 전역 제거

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 통과
- [ ] Playwright 키보드 네비게이션 테스트
- [ ] 모든 페이지 포커스 링 존재
- [ ] Skip to content 동작
- [ ] IF-CI-004 (Playwright CI) 연동
- [ ] PR 본문에 "REQ-NF-037 키보드 100%. TC-032 자동 검증" 명시

## :construction: Dependencies & Blockers
- **Depends on**: FR-LES-003, FR-STAMP-002, FR-OX-001
- **Blocks**: NF-A11Y-004 (키보드 100% NF 검증)
- **Related**: REQ-NF-037, REQ-FUNC-032, Story 5 (한정숙·김성호)
