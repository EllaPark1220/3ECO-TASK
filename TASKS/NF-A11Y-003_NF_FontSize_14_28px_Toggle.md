# [NF] NF-A11Y-003: 글자 크기 14~28px — Tailwind 토글 + UI 회귀 테스트

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-A11Y-003: 글자 크기 14~28px NFR 검증 — FR-LES-004 토글 + 레이아웃 회귀 + 쿠키 영속"
labels: 'nf, accessibility, font-size, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-A11Y-003] 글자 크기 14~28px NFR 검증
- **목적**: REQ-NF-036 (글자 크기 14~28px 토글) + REQ-FUNC-029 (사용자 선택 영속) 의 비기능 수준 검증. FR-LES-004 에서 구현된 토글의 **범위 제한 (14px 미만·28px 초과 불가)**, **쿠키 영속성 (새 탭에서도 유지)**, **UI 레이아웃 회귀 (28px 에서도 깨짐 없음)** 을 비기능적 관점에서 자동 검증.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-036 (14~28px)
- SRS: `/docs/SRS_V0_9.md#4.1.5` — REQ-FUNC-029 (토글 영속)
- 선행: FR-LES-004 (글자 크기 토글 — 구현)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **범위 제한 검증** — `tests/nf/font-size-bounds.spec.ts`:
  ```ts
  test('최소 14px 미만 불가', async ({ page }) => {
    await page.goto('/lessons/L001');
    const toggle = page.locator('[data-testid="font-size-toggle"]');
    // 최소값까지 내리기
    for (let i = 0; i < 20; i++) await toggle.focus(), await page.keyboard.press('ArrowDown');
    const size = await page.evaluate(() =>
      parseInt(getComputedStyle(document.querySelector('[data-testid="lesson-content"]')!).fontSize)
    );
    expect(size).toBeGreaterThanOrEqual(14);
  });

  test('최대 28px 초과 불가', async ({ page }) => {
    await page.goto('/lessons/L001');
    const toggle = page.locator('[data-testid="font-size-toggle"]');
    for (let i = 0; i < 20; i++) await toggle.focus(), await page.keyboard.press('ArrowUp');
    const size = await page.evaluate(() =>
      parseInt(getComputedStyle(document.querySelector('[data-testid="lesson-content"]')!).fontSize)
    );
    expect(size).toBeLessThanOrEqual(28);
  });
  ```
- [ ] **쿠키 영속 검증**:
  ```ts
  test('글자 크기 선택 영속 — 새 탭', async ({ page, context }) => {
    await page.goto('/lessons/L001');
    // 크기 변경
    const toggle = page.locator('[data-testid="font-size-toggle"]');
    await toggle.focus();
    await page.keyboard.press('ArrowUp'); // 크기 증가

    const size1 = await page.evaluate(() =>
      parseInt(getComputedStyle(document.querySelector('[data-testid="lesson-content"]')!).fontSize)
    );

    // 새 탭에서 확인
    const page2 = await context.newPage();
    await page2.goto('/lessons/L002');
    const size2 = await page2.evaluate(() =>
      parseInt(getComputedStyle(document.querySelector('[data-testid="lesson-content"]')!).fontSize)
    );
    expect(size2).toBe(size1); // 영속
  });
  ```
- [ ] **UI 회귀 — 28px 에서 레이아웃 검증** (TS-E2E-006 과 연동):
  - 28px 설정 시 가로 스크롤 0건
  - OX 퀴즈 라디오 버튼 겹침 없음
  - 네비게이션 메뉴 줄바꿈 정상

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 최소 14px 미만 불가
- **Given**: 글자 크기 최소값까지 감소
- **When**: 현재 크기 확인
- **Then**: ≥ 14px

### Scenario 2: 최대 28px 초과 불가
- **Given**: 글자 크기 최대값까지 증가
- **When**: 현재 크기 확인
- **Then**: ≤ 28px

### Scenario 3: 쿠키 영속 — 새 탭
- **Given**: 크기 20px 으로 변경
- **When**: 새 탭에서 다른 레슨 접근
- **Then**: 20px 유지

### Scenario 4: 28px 에서 OX 퀴즈 정상
- **Given**: 28px 설정
- **When**: OX 퀴즈 렌더
- **Then**: 라디오 버튼 겹침 0건

### Scenario 5: 기본값 — 16px 또는 사용자 설정
- **Given**: 최초 방문
- **When**: 레슨 페이지 로드
- **Then**: 기본 16px (또는 User 설정값)

### Scenario 6: 접근성 라벨
- **Given**: 글자 크기 토글
- **When**: 스크린 리더 확인
- **Then**: "글자 크기: 현재 16px" aria-label 존재

## :gear: Technical & Non-Functional Constraints
- **범위**: 14px 이상, 28px 이하 (REQ-NF-036)
- **단계**: 2px 단위 (14, 16, 18, 20, 22, 24, 26, 28 — 8단계)
- **영속**: 쿠키 또는 localStorage. User 테이블 `mediaPreference` 와 별도 관리
- **금지**: 12px 이하 (가독성), 30px 이상 (레이아웃 파괴)

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 시나리오 통과
- [ ] 범위 제한 테스트 (14~28px)
- [ ] 쿠키 영속 테스트
- [ ] 28px UI 회귀 (TS-E2E-006 연동)
- [ ] PR 본문에 "REQ-NF-036 14~28px NFR 검증" 명시

## :construction: Dependencies & Blockers
- **Depends on**: FR-LES-004 (글자 크기 토글 — 구현)
- **Blocks**: NF-A11Y-001 (접근성 체크리스트)
- **Related**: REQ-NF-036, REQ-FUNC-029, TS-E2E-006 (28px+200%)
