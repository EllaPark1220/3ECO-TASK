# [Test] TS-LOAD-001: 스탬프 렌더 동시 100명 — p95 ≤500ms (k6)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-LOAD-001: k6 부하 테스트 — 스탬프 맵 API 동시 100명 요청, 이벤트→UI 델타 p95 ≤500ms"
labels: 'test, load, k6, performance, stamp-map, priority:high, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-LOAD-001] k6 부하 테스트 — 스탬프 맵 렌더링 동시 100명 요청 시 p95 ≤500ms
- **목적**: REQ-NF-003 (OX 통과 이벤트 → 스탬프 맵 UI 반영 p95 ≤500ms) 을 실제 동시 사용자 부하 환경에서 정량 검증한다. k6 로 100VU(Virtual User) 동시 요청을 생성하고, `GET /api/stamp/map` 응답 시간 + 클라이언트 렌더까지의 총 델타를 측정.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-003 (이벤트→UI 델타 p95 ≤500ms)
  - `/docs/SRS_V0_9.md#5.2` — TC-NF-003
- 외부: `https://k6.io/docs/` (k6 v0.50+)
- 선행: FR-STAMP-002 (스탬프 맵 UI), FR-STAMP-001 (API)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **k6 설치**: `npm install -D @grafana/k6` 또는 글로벌 `brew install k6`
- [ ] **테스트 스크립트** — `tests/load/stamp-render.k6.js`:
  ```js
  import http from 'k6/http';
  import { check, sleep } from 'k6';
  import { Trend, Rate } from 'k6/metrics';

  const stampLatency = new Trend('stamp_map_latency', true);
  const stampSuccess = new Rate('stamp_map_success');

  export const options = {
    scenarios: {
      stamp_render: {
        executor: 'constant-vus',
        vus: 100,
        duration: '2m',
      },
    },
    thresholds: {
      'stamp_map_latency': ['p(95)<500'],
      'stamp_map_success': ['rate>0.99'],
      'http_req_failed': ['rate<0.01'],
    },
  };

  const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
  const AUTH_TOKENS = JSON.parse(open('./fixtures/auth-tokens.json'));

  export default function () {
    const token = AUTH_TOKENS[__VU % AUTH_TOKENS.length];
    const res = http.get(`${BASE_URL}/api/stamp/map`, {
      headers: {
        'Cookie': `sb-access-token=${token}`,
        'Accept': 'application/json',
      },
    });

    stampLatency.add(res.timings.duration);
    stampSuccess.add(res.status === 200);

    check(res, {
      'status is 200': (r) => r.status === 200,
      'has modules': (r) => JSON.parse(r.body).modules.length > 0,
      'p95 < 500ms': (r) => r.timings.duration < 500,
    });

    sleep(1);
  }
  ```
- [ ] **테스트 픽스처** — `tests/load/fixtures/auth-tokens.json`:
  - CT-MOCK-002 시드 사용자 기반 토큰 100개 사전 발급
  - 또는 k6 `setup()` 에서 자동 로그인 + 토큰 수집
- [ ] **측정 지표**:
  - `http_req_duration` — p95, p99, max, avg
  - `stamp_map_latency` — 커스텀 API 응답 시간
  - `stamp_map_success` — 성공률 (≥99%)
  - `http_req_failed` — 실패율 (<1%)
- [ ] **클라이언트 렌더 시간 추가 측정** (선택):
  - k6 browser 모듈로 실제 렌더 시간 포함
  - 또는 Lighthouse CI (TS-LOAD-003) 로 대체
- [ ] **환경**: Vercel Preview 또는 Staging 환경 대상
- [ ] **결과 리포트**: `k6 run --out json=results.json stamp-render.k6.js` → JSON 리포트

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 100VU 동시 — p95 ≤500ms
- **Given**: 100VU 동시 2분 실행
- **When**: `GET /api/stamp/map` 반복 호출
- **Then**: `http_req_duration` p95 ≤ 500ms

### Scenario 2: 성공률 ≥99%
- **Given**: 100VU 부하
- **When**: 응답 코드 집계
- **Then**: 200 응답 ≥ 99%. 5xx < 1%

### Scenario 3: p99 ≤ 1000ms
- **Given**: 극단 지연
- **When**: p99 측정
- **Then**: p99 ≤ 1000ms (극단 지연도 1초 이내)

### Scenario 4: 응답 페이로드 정합
- **Given**: 100VU 응답
- **When**: JSON 구조 검증
- **Then**: `modules` 배열 존재. 필드 구조 정합

### Scenario 5: DB 커넥션 풀 안정
- **Given**: 동시 100 요청
- **When**: Supabase 커넥션 풀 모니터링
- **Then**: 풀 고갈 0건. Connection timeout 0건

### Scenario 6: 메모리 누수 없음
- **Given**: 2분 부하
- **When**: Vercel Functions 메모리 추적
- **Then**: 메모리 단조 증가 없음

### Scenario 7: k6 threshold 자동 판정
- **Given**: `thresholds` 설정
- **When**: k6 실행 종료
- **Then**: threshold 통과 시 exit code 0. 실패 시 exit code 99

### Scenario 8: CI 통합 (IF-CI-005)
- **Given**: `.github/workflows/quality.yml` k6 Job
- **When**: 야간 정기 실행
- **Then**: 자동 실행 + 결과 리포트 + Slack 알림

## :gear: Technical & Non-Functional Constraints
- **k6 버전**: v0.50+ (ES module 지원)
- **VU 수**: 100 (MVP 목표 MAU 1,000 기준 동시 접속 ~100명 가정)
- **Duration**: 2분 (안정 상태 도달 후 측정)
- **타겟**: Vercel Preview 또는 Staging (프로덕션 직접 부하 금지)
- **토큰 사전 발급**: 실제 Supabase Auth 토큰 또는 테스트 전용 JWT mock
- **Threshold**: p95 < 500ms, 성공률 > 99%, 실패율 < 1%
- **금지**:
  - 프로덕션 환경 직접 부하 테스트
  - 공유 Supabase Free 인스턴스에 과부하 (테스트 전용 인스턴스 사용)

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 통과
- [ ] k6 스크립트 `tests/load/stamp-render.k6.js` 구현
- [ ] 100VU 2분 실행 → p95 ≤ 500ms 달성
- [ ] JSON 결과 리포트 생성
- [ ] IF-CI-005 (k6 CI Job) 연동 준비
- [ ] PR 본문에 "REQ-NF-003 정량 검증. 100VU p95={N}ms" 명시

## :construction: Dependencies & Blockers
- **Depends on**: FR-STAMP-001 (API), FR-STAMP-002 (UI), CT-MOCK-002 (시드 사용자)
- **Blocks**: IF-CI-005 (k6 CI Job), Public Pilot Exit
- **Related**: REQ-NF-003, TS-IT-001 (OX→Stamp 통합)
