# [Test] TS-E2E-006: 28px + 200% 확대 가로 스크롤 0건 — 반응형 회귀

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-E2E-006: 28px 글자 + 200% 브라우저 확대 시 가로 스크롤 0건 반응형 회귀 테스트"
labels: 'test, e2e, playwright, accessibility, responsive, priority:medium, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-E2E-006] 28px 글자 크기 + 200% 브라우저 확대 시 가로 스크롤 0건 검증
- **목적**: REQ-FUNC-030 (200% 확대 시 가로 스크롤 없이 콘텐츠 접근) + REQ-NF-036 (14~28px 글자 크기) 동시 적용 시 레이아웃 깨짐 없음을 검증. 저시력 사용자(한정숙) 가 최대 글자 크기 + 최대 확대를 동시 사용하는 극단 시나리오.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.1.5` — REQ-FUNC-030 (200% 가로 스크롤 0), REQ-NF-036
- 페르소나: SH-06 한정숙
- 선행: FR-LES-004 (글자 크기 토글)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `tests/e2e/responsive-zoom.spec.ts`:
  ```ts
  import { test, expect } from '@playwright/test';

  const PAGES = ['/', '/lessons', '/lessons/L001', '/stamp-map'];

  for (const path of PAGES) {
    test(`${path} — 28px + 200% 확대 가로 스크롤 0건`, async ({ page }) => {
      // 200% 확대 시뮬레이션: viewport 절반으로 설정
      await page.setViewportSize({ width: 640, height: 360 }); // 1280/2, 720/2

      await page.goto(path);

      // 글자 크기 28px 설정
      if (path.includes('lessons/L')) {
        const sizeToggle = page.locator('[data-testid="font-size-toggle"]');
        if (await sizeToggle.isVisible()) {
          // 최대 크기까지 ArrowUp
          for (let i = 0; i < 10; i++) {
            await sizeToggle.focus();
            await page.keyboard.press('ArrowUp');
          }
        }
      }

      // 가로 스크롤 발생 여부 확인
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasHorizontalScroll).toBe(false);

      // 콘텐츠 잘림 없음 확인
      const overflowElements = await page.evaluate(() => {
        const all = document.querySelectorAll('*');
        const clipped: string[] = [];
        all.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.right > window.innerWidth + 1) {
            clipped.push(`${el.tagName}.${el.className}: right=${rect.right}`);
          }
        });
        return clipped;
      });

      expect(overflowElements).toHaveLength(0);
    });
  }
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 랜딩 — 200% 가로 스크롤 0
- **Given**: viewport 640×360 (200% 시뮬) → **Then**: scrollWidth ≤ clientWidth

### Scenario 2: 레슨 상세 — 28px + 200% 가로 스크롤 0
- **Given**: 글자 28px + 200% → **Then**: 가로 스크롤 0

### Scenario 3: 스탬프 맵 — 200% 가로 스크롤 0
- **Given**: 200% → **Then**: 카드 그리드 1열 전환 + 가로 스크롤 0

### Scenario 4: 콘텐츠 잘림 0건
- **Given**: 모든 요소 → **Then**: right ≤ viewport width

### Scenario 5: 텍스트 줄바꿈 정상
- **Given**: 28px 긴 텍스트 → **Then**: `word-break: break-word` 적용

### Scenario 6: 이미지 반응형
- **Given**: 200% → **Then**: 이미지 `max-width: 100%` 초과 0건

## :gear: Technical & Non-Functional Constraints
- **200% 시뮬레이션**: Playwright `setViewportSize(width/2, height/2)`
- **WCAG 2.1 SC 1.4.10**: 320px 너비에서 가로 스크롤 없이 콘텐츠 접근
- **금지**: `overflow-x: hidden` 으로 스크롤바만 숨기기 (콘텐츠 잘림 발생)

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 시나리오 통과
- [ ] 4개 핵심 페이지 200% 검증
- [ ] PR 본문에 "REQ-FUNC-030 가로 스크롤 0건. WCAG 1.4.10" 명시

## :construction: Dependencies & Blockers
- **Depends on**: FR-LES-004 (글자 크기), FR-STAMP-002 (스탬프 맵)
- **Blocks**: 없음
- **Related**: REQ-FUNC-030, REQ-NF-036
