# [Test] TS-LOAD-005: YouTube 임베디드 첫 재생 p95 ≤2s — 합성 모니터링

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-LOAD-005: YouTube 첫 재생 p95 ≤2s 합성 모니터링 — 측정 전용 (유튜브 책임)"
labels: 'test, load, performance, youtube, monitoring, priority:medium, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-LOAD-005] YouTube 임베디드 첫 재생 시작 시간 합성 모니터링
- **목적**: REQ-NF-001 (YouTube 임베디드 첫 재생 시작 p95 ≤ 2초) 을 측정한다. 주의: 재생 시작 시간은 유튜브 인프라 책임이므로 SLA 보장 불가. 본 태스크는 **측정·모니터링 전용**이며, 위반 시 유튜브 측 이슈로 기록하고 콘텐츠 전환(글로 읽기) 안내 트리거를 검토한다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-001 (영상 재생 시작 p95 ≤ 2s)
  - `/docs/SRS_V0_9.md#5.2` — TC-NF-001
  - `/docs/SRS_V0_9.md#6.6` — R1 (YouTube 의존성 리스크)
- 외부: `https://developers.google.com/youtube/iframe_api_reference`
- 선행: FR-LES-003 (YouTube 임베디드 컴포넌트)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **YouTube Player API 측정 훅** — FR-LES-003 컴포넌트 확장:
  ```ts
  // components/YouTubePlayer.tsx 에 측정 삽입
  const pageLoadStart = performance.now();

  function onPlayerStateChange(event: YT.OnStateChangeEvent) {
    if (event.data === YT.PlayerState.PLAYING && !hasTrackedFirstPlay) {
      hasTrackedFirstPlay = true;
      const playStartMs = Math.round(performance.now() - pageLoadStart);
      logEvent('youtube.first_play', {
        play_start_ms: playStartMs,
        lesson_id: lessonId,
        connection_type: navigator.connection?.effectiveType || 'unknown',
      });
    }
  }
  ```
- [ ] **Playwright 합성 모니터링 스크립트** — `tests/synthetic/youtube-start.spec.ts`:
  ```ts
  import { test, expect } from '@playwright/test';

  const LESSON_IDS = ['L001', 'L002', 'L003'];
  const ITERATIONS_PER_LESSON = 10;

  test.describe('YouTube 첫 재생 합성 모니터링', () => {
    for (const lessonId of LESSON_IDS) {
      test(`${lessonId} — 첫 재생 시간 측정 (${ITERATIONS_PER_LESSON}회)`, async ({ page }) => {
        const times: number[] = [];

        for (let i = 0; i < ITERATIONS_PER_LESSON; i++) {
          await page.goto(`/lessons/${lessonId}`, { waitUntil: 'networkidle' });
          const start = Date.now();

          // YouTube iframe 로드 대기
          const iframe = page.frameLocator('iframe[src*="youtube"]');
          await iframe.locator('.ytp-play-button').waitFor({ state: 'visible', timeout: 15_000 });

          // 재생 버튼 클릭
          await iframe.locator('.ytp-play-button').click();

          // PLAYING 상태 감지 — 커스텀 이벤트 기반
          await page.waitForFunction(() => {
            return (window as any).__ytFirstPlayMs !== undefined;
          }, { timeout: 15_000 });

          const playMs = await page.evaluate(() => (window as any).__ytFirstPlayMs);
          times.push(playMs || (Date.now() - start));

          // 쿨다운 (YouTube rate limit 회피)
          await page.waitForTimeout(3_000);
        }

        // 통계 계산
        times.sort((a, b) => a - b);
        const avg = Math.round(times.reduce((s, t) => s + t, 0) / times.length);
        const p50 = times[Math.floor(times.length * 0.5)];
        const p95 = times[Math.ceil(times.length * 0.95) - 1];
        const max = times[times.length - 1];

        console.log(`[${lessonId}] avg=${avg}ms, p50=${p50}ms, p95=${p95}ms, max=${max}ms`);

        // soft assertion — 유튜브 책임이므로 hard fail 아님
        if (p95 > 2000) {
          console.warn(`⚠️ REQ-NF-001 위반: ${lessonId} p95=${p95}ms > 2000ms (유튜브 인프라 책임)`);
        }
        expect.soft(p95).toBeLessThanOrEqual(3000); // 3초까지 soft 허용
      });
    }
  });
  ```
- [ ] **주간 집계 스크립트** — `scripts/youtube-play-report.ts`:
  ```ts
  const logs = await prisma.eventLog.findMany({
    where: {
      eventName: 'youtube.first_play',
      timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    select: { payload: true, timestamp: true },
  });

  const times = logs.map(l => (l.payload as any).play_start_ms as number).filter(Boolean);
  times.sort((a, b) => a - b);

  console.log(`=== YouTube 첫 재생 주간 리포트 ===`);
  console.log(`샘플: ${times.length}건`);
  console.log(`avg: ${Math.round(times.reduce((s, t) => s + t, 0) / times.length)}ms`);
  console.log(`p50: ${times[Math.floor(times.length * 0.5)]}ms`);
  console.log(`p95: ${times[Math.ceil(times.length * 0.95) - 1]}ms`);
  console.log(`max: ${times[times.length - 1]}ms`);
  console.log(`2초 초과: ${times.filter(t => t > 2000).length}건 (${((times.filter(t => t > 2000).length / times.length) * 100).toFixed(1)}%)`);
  ```
- [ ] **글로 읽기 전환 안내 트리거** (선택):
  ```ts
  // 5초 이상 재생 시작 지연 시 안내
  setTimeout(() => {
    if (!hasTrackedFirstPlay) {
      showToast('영상 로딩이 느립니다. "글로 읽기"로 전환할 수 있습니다.', {
        action: { label: '글로 전환', onClick: () => setMediaMode('text') },
      });
    }
  }, 5_000);
  ```
- [ ] **`package.json` 스크립트**:
  ```json
  "test:synthetic:youtube": "playwright test tests/synthetic/youtube-start.spec.ts",
  "report:youtube-play": "tsx scripts/youtube-play-report.ts"
  ```
- [ ] **정기 실행**: 주 1회 (Cron 또는 수동 `workflow_dispatch`)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: p95 ≤ 2초 목표 달성
- **Given**: 3개 레슨 × 10회 반복 측정 (총 30회)
- **When**: YouTube 첫 재생 시간 p95 계산
- **Then**: p95 ≤ 2000ms (달성 시 성공)

### Scenario 2: p95 > 2초 — 경고 기록 (테스트 실패 아님)
- **Given**: 네트워크 지연 또는 유튜브 서버 부하 상황
- **When**: p95 > 2000ms
- **Then**: console.warn 경고 기록. soft assertion (CI 빨간불 아님)

### Scenario 3: EventLog 기록 — youtube.first_play
- **Given**: 사용자가 레슨 페이지에서 영상 재생 시작
- **When**: Player API `onStateChange` PLAYING 발생
- **Then**: EventLog `youtube.first_play` + `{ play_start_ms, lesson_id, connection_type }` 기록

### Scenario 4: 3G 시뮬레이션 — 기록만
- **Given**: Playwright network throttle (3G)
- **When**: 측정
- **Then**: p95 기록 (5초+ 예상, 경고만). 테스트 미실패

### Scenario 5: 글로 읽기 전환 안내 — 5초 초과
- **Given**: YouTube 재생 시작까지 5초 초과
- **When**: 사용자 대기
- **Then**: "글로 읽기로 전환" 안내 토스트 표시

### Scenario 6: 주간 리포트 출력
- **Given**: 7일간 `youtube.first_play` EventLog 데이터
- **When**: `npm run report:youtube-play` 실행
- **Then**: avg, p50, p95, max, 2초 초과 비율 출력

### Scenario 7: 네트워크 타입별 분류
- **Given**: EventLog 의 `connection_type` 필드
- **When**: 주간 리포트에서 타입별 분리
- **Then**: 4g, 3g, wifi 별 p95 분리 리포트

### Scenario 8: 합성 모니터링 정기 실행
- **Given**: GitHub Actions workflow
- **When**: 주 1회 cron 실행
- **Then**: 자동 실행 + 결과 artifact 저장

## :gear: Technical & Non-Functional Constraints
- **유튜브 책임 영역**: 재생 시작 시간은 유튜브 CDN·사용자 네트워크에 의존. SLA 보장 불가
- **측정 전용**: 위반 시 hard fail 아닌 **soft assertion** + **경고 로그**
- **측정 방법**: YouTube IFrame Player API `onStateChange` (PLAYING=1)
- **connection_type**: `navigator.connection.effectiveType` 활용 (네트워크 환경 분류)
- **합성 모니터링 주기**: 주 1회 (비용 최소화)
- **금지**:
  - YouTube CDN 직접 캐싱 (YouTube ToS 위반)
  - 유튜브 속도 위반으로 CI 전체 차단 (soft assertion 강제)
  - 사용자에게 재생 시간 노출 (내부 KPI 전용)

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 통과
- [ ] YouTube Player API 측정 훅 (`youtube.first_play` EventLog 발행)
- [ ] Playwright 합성 모니터링 스크립트 구현
- [ ] 주간 리포트 스크립트 구현
- [ ] soft assertion 동작 확인 (CI 빨간불 아님)
- [ ] 글로 읽기 전환 안내 (5초 초과 시) 구현
- [ ] PR 본문에 "REQ-NF-001 측정 전용. 유튜브 책임 명시. soft assertion" 기재
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-LES-003 (YouTube 임베디드 컴포넌트)
  - CT-DB-009 (EventLog — first_play 이벤트)
- **Blocks**: 없음 (측정 전용)
- **Related**:
  - REQ-NF-001 (영상 재생 시작 p95 ≤ 2s)
  - R1 (YouTube 의존성 리스크)
  - TS-LOAD-003 (Lighthouse CI — LCP. 별도 메트릭)
