# [Test] TS-LOAD-004: 위치 저장 주기 ≤10초 — 서버 로그 샘플링

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-LOAD-004: 진도 저장 주기 ≤10초 검증 — 서버 로그 샘플링 + FW-PROG-002 스로틀 정합"
labels: 'test, load, performance, progress, priority:medium, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-LOAD-004] 진도 저장 주기 ≤ 10초 — 서버 로그 샘플링 검증
- **목적**: REQ-NF-006 (위치 저장 주기 ≤ 10초) 을 프로덕션/스테이징 서버 로그로 정량 검증. FW-PROG-002 (10초 스로틀 hook) 가 실제로 ≤ 10초 간격으로 서버에 요청을 보내는지, 서버 수신 로그의 타임스탬프 차를 분석.

## :link: References (Spec & Context)
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-006 (위치 저장 주기 ≤ 10s)
  - `/docs/SRS_V0_9.md#5.2` — TC-NF-006
- 선행: FW-PROG-002 (10초 스로틀 hook), FW-PROG-001 (saveProgress)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **로그 수집 방법** — 2가지 접근:
  - **방법 A**: Vercel Logs API 활용 — `progress.saved` 이벤트 필터
  - **방법 B**: EventLog 테이블 직접 쿼리 — 동일 userId 의 연속 이벤트 시간차 분석
- [ ] **분석 스크립트** — `scripts/analyze-save-interval.ts`:
  ```ts
  const logs = await prisma.eventLog.findMany({
    where: { eventName: 'progress.saved' },
    orderBy: [{ payload: { path: ['user_id'] } }, { timestamp: 'asc' }],
    take: 10000,
  });

  // 동일 user_id 의 연속 이벤트 시간차 계산
  const intervals: number[] = [];
  let prevByUser: Record<string, Date> = {};

  for (const log of logs) {
    const userId = log.payload.user_id;
    if (prevByUser[userId]) {
      const diffSec = (log.timestamp.getTime() - prevByUser[userId].getTime()) / 1000;
      intervals.push(diffSec);
    }
    prevByUser[userId] = log.timestamp;
  }

  // 통계
  intervals.sort((a, b) => a - b);
  const p50 = intervals[Math.floor(intervals.length * 0.5)];
  const p95 = intervals[Math.floor(intervals.length * 0.95)];
  const max = intervals[intervals.length - 1];
  const violationCount = intervals.filter(i => i > 10).length;

  console.log(`총 샘플: ${intervals.length}`);
  console.log(`p50: ${p50.toFixed(1)}s, p95: ${p95.toFixed(1)}s, max: ${max.toFixed(1)}s`);
  console.log(`≤10초 위반: ${violationCount}건 (${((violationCount / intervals.length) * 100).toFixed(1)}%)`);
  ```
- [ ] **Playwright 자동화 측정** (보완):
  ```ts
  test('저장 주기 ≤ 10초', async ({ page }) => {
    await page.goto('/lessons/L001');
    await page.click('[data-testid="play-video"]');

    const requests: number[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/progress')) {
        requests.push(Date.now());
      }
    });

    await page.waitForTimeout(60_000); // 60초 시청

    for (let i = 1; i < requests.length; i++) {
      const interval = (requests[i] - requests[i-1]) / 1000;
      expect(interval).toBeLessThanOrEqual(10.5); // 0.5초 네트워크 마진
    }
    expect(requests.length).toBeGreaterThanOrEqual(5); // 최소 5회 저장
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 서버 로그 시간차 p95 ≤ 10초
- **Given**: 1000건+ progress.saved 이벤트
- **When**: 동일 user 연속 이벤트 시간차 분석
- **Then**: p95 ≤ 10초

### Scenario 2: 60초 시청 시 최소 5회 저장
- **Given**: 60초 연속 시청
- **When**: 네트워크 요청 카운트
- **Then**: saveProgress 요청 ≥ 5회

### Scenario 3: 10초 초과 비율 < 5%
- **Given**: 전체 샘플
- **When**: 10초 초과 카운트
- **Then**: 위반 비율 < 5% (네트워크 지연 허용)

### Scenario 4: 탭 비활성 시 저장 중단
- **Given**: 탭 전환 (hidden)
- **When**: 30초 대기 후 복귀
- **Then**: hidden 동안 saveProgress 0회

### Scenario 5: 스로틀 정합 — 짧은 간격 미전송
- **Given**: 3초 간격 위치 변경
- **When**: 네트워크 관찰
- **Then**: 실제 전송은 10초 간격 (스로틀)

### Scenario 6: 분석 스크립트 정상 실행
- **Given**: EventLog 데이터
- **When**: `scripts/analyze-save-interval.ts` 실행
- **Then**: p50, p95, max, 위반율 출력

## :gear: Technical & Non-Functional Constraints
- **측정 대상**: `progress.saved` EventLog 또는 Vercel Logs
- **마진**: 네트워크 지연 0.5초 허용 (10.5초까지 정상)
- **최소 샘플**: 1000건 이상 (통계 유의성)
- **탭 비활성**: `visibilitychange` 시 저장 중단 확인

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 시나리오 통과
- [ ] 서버 로그 분석 스크립트 구현
- [ ] p95 ≤ 10초 결과 증빙
- [ ] 위반율 < 5% 확인
- [ ] PR 본문에 "REQ-NF-006 정량 검증. p95={N}s" 명시

## :construction: Dependencies & Blockers
- **Depends on**: FW-PROG-002 (스로틀 hook), FW-PROG-001 (saveProgress), CT-DB-009 (EventLog)
- **Blocks**: 없음
- **Related**: REQ-NF-006
