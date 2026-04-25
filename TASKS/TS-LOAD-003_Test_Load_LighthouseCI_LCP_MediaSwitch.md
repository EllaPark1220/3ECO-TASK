# [Test] TS-LOAD-003: Lighthouse CI — LCP p95 ≤1.5s + 매체 전환 p95 ≤300ms

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-LOAD-003: Lighthouse CI — LCP p95 ≤1.5s, 매체 전환(영상↔글) p95 ≤300ms, CLS <0.1"
labels: 'test, load, lighthouse, performance, web-vitals, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-LOAD-003] Lighthouse CI 성능 게이트 — LCP + 매체 전환 + CLS
- **목적**: REQ-NF-002 (LCP p95 ≤ 1.5s) + REQ-NF-005 (매체 전환 p95 ≤ 300ms) 를 CI 파이프라인에서 매 PR 마다 자동 검증. IF-CI-002 (axe + Lighthouse Gate) 의 성능 측면. Lighthouse CI 를 통해 Performance 점수 + Core Web Vitals 를 정량 측정하고 기준 미달 시 머지 차단.

## :link: References (Spec & Context)
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-002 (LCP ≤ 1.5s), REQ-NF-005 (매체 전환 ≤ 300ms)
  - `/docs/SRS_V0_9.md#5.2` — TC-NF-002, TC-NF-005
- 외부: `https://github.com/GoogleChrome/lighthouse-ci`
- 선행: IF-CI-001 (CI), FR-LES-003 (영상↔글 토글)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Lighthouse CI 설치**: `npm install -D @lhci/cli`
- [ ] **`lighthouserc.js` 설정**:
  ```js
  module.exports = {
    ci: {
      collect: {
        url: [
          'http://localhost:3000/',              // 랜딩
          'http://localhost:3000/lessons/L001',  // 레슨 상세
          'http://localhost:3000/stamp-map',     // 스탬프 맵
        ],
        numberOfRuns: 5,
        startServerCommand: 'npm run start',
      },
      assert: {
        assertions: {
          'categories:performance': ['error', { minScore: 0.85 }],
          'first-contentful-paint': ['error', { maxNumericValue: 1500 }],
          'largest-contentful-paint': ['error', { maxNumericValue: 1500 }],
          'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
          'total-blocking-time': ['warn', { maxNumericValue: 300 }],
          'speed-index': ['warn', { maxNumericValue: 2000 }],
        },
      },
      upload: {
        target: 'temporary-public-storage',
      },
    },
  };
  ```
- [ ] **매체 전환 성능 측정** — 커스텀 User Timing API:
  ```ts
  // FR-LES-003 의 매체 전환 토글에 측정 삽입
  function handleMediaToggle(mode: 'video' | 'text') {
    performance.mark('media-switch-start');
    setMediaMode(mode);
    requestAnimationFrame(() => {
      performance.mark('media-switch-end');
      performance.measure('media-switch', 'media-switch-start', 'media-switch-end');
      const entry = performance.getEntriesByName('media-switch')[0];
      if (entry.duration > 300) {
        console.warn(`매체 전환 ${entry.duration}ms — REQ-NF-005 위반`);
      }
    });
  }
  ```
- [ ] **Playwright + Performance 측정** (보완):
  ```ts
  // tests/performance/media-switch.spec.ts
  test('매체 전환 p95 ≤ 300ms', async ({ page }) => {
    await page.goto('/lessons/L001');
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = Date.now();
      await page.click('[data-testid="media-toggle"]');
      await page.waitForSelector('[data-testid="content-loaded"]');
      times.push(Date.now() - start);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(times.length * 0.95) - 1];
    expect(p95).toBeLessThanOrEqual(300);
  });
  ```
- [ ] **`package.json` 스크립트**:
  ```json
  "lighthouse:ci": "lhci autorun --config=lighthouserc.js"
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: LCP p95 ≤ 1.5초 — 랜딩 페이지
- **Given**: 5회 Lighthouse 실행
- **When**: 랜딩 페이지 LCP 측정
- **Then**: p95 ≤ 1500ms

### Scenario 2: LCP p95 ≤ 1.5초 — 레슨 상세
- **Given**: `/lessons/L001`
- **When**: LCP 측정
- **Then**: p95 ≤ 1500ms

### Scenario 3: CLS < 0.1
- **Given**: 3개 페이지
- **When**: CLS 측정
- **Then**: 모두 < 0.1

### Scenario 4: 매체 전환 p95 ≤ 300ms
- **Given**: 영상 → 글 전환 20회 반복
- **When**: Performance.measure
- **Then**: p95 ≤ 300ms

### Scenario 5: Performance 점수 ≥ 85
- **Given**: Lighthouse 실행
- **When**: Performance 카테고리
- **Then**: 점수 ≥ 85

### Scenario 6: CI 게이트 — 미달 시 머지 차단
- **Given**: LCP 2.5초 (미달)
- **When**: CI 실행
- **Then**: exit code ≠ 0. PR 머지 차단

### Scenario 7: Lighthouse 리포트 URL
- **Given**: CI 실행 완료
- **When**: 리포트 확인
- **Then**: temporary-public-storage 에 HTML 리포트 링크 생성

### Scenario 8: TBT ≤ 300ms (경고)
- **Given**: Lighthouse 실행
- **When**: TBT 측정
- **Then**: ≤ 300ms (warn 레벨)

## :gear: Technical & Non-Functional Constraints
- **Lighthouse CI**: `@lhci/cli` 사용. GitHub Actions 에서 실행
- **실행 횟수**: 페이지당 5회 (변동성 감소)
- **측정 페이지**: 랜딩, 레슨 상세, 스탬프 맵 (3개)
- **매체 전환 측정**: Performance API (`performance.mark/measure`) 활용
- **빌드 모드**: `npm run build && npm run start` (프로덕션 빌드)
- **금지**: 개발 모드(`npm run dev`) 에서 성능 측정 (HMR 오버헤드)

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 통과
- [ ] `lighthouserc.js` 설정
- [ ] LCP p95 ≤ 1.5s 달성
- [ ] 매체 전환 p95 ≤ 300ms 측정 코드 + 결과
- [ ] CLS < 0.1 달성
- [ ] IF-CI-002 연동 (CI 게이트)
- [ ] PR 본문에 "REQ-NF-002·005 정량 검증" 명시

## :construction: Dependencies & Blockers
- **Depends on**: IF-CI-001 (CI), FR-LES-003 (매체 전환), IF-CI-002 (axe+Lighthouse Gate)
- **Blocks**: Public Pilot Exit (성능 기준)
- **Related**: REQ-NF-002, REQ-NF-005, TS-LOAD-005 (YouTube 재생 시작)
