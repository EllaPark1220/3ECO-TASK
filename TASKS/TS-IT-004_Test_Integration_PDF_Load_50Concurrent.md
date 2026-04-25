# [Test] TS-IT-004: PDF 다운로드 부하 테스트 — 동시 50명 → p95 ≤2초 + 캐시 HIT ≥95%

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-IT-004: 동시 50명 PDF 다운로드 → REQ-NF-004 (p95 ≤2초) + REQ-NF-049 (캐시 HIT ≥95%) 검증"
labels: 'test, integration, load, pdf, performance, priority:critical, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-IT-004] PDF 다운로드 라우트 (`/api/teacher/kit/{id}`) 의 동시 50명 부하 테스트 — k6 활용 + 응답 시간 + 캐시 HIT 비율 + 5xx 비율 측정
- **목적**: Story 3 (장은혜) 의 PDF 다운로드 인프라가 Public Pilot 의 예상 동시 사용자 (≤50명 동시) 부하를 안정 처리함을 검증. REQ-NF-004 (p95 ≤2초) + REQ-NF-049 (캐시 HIT ≥95%) + REQ-NF-008 (오류율 ≤0.5%) 동시 충족. FR-PDF-001 의 2단 캐시 (Vercel Edge + Supabase Storage) 가 실제 부하에서 정상 작동함을 보증.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-004 (PDF p95 ≤2초)
  - `/docs/SRS_V0_9.md#4.2.8` — REQ-NF-049 (캐시 HIT ≥95%)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-008 (오류율 ≤0.5%)
  - `/docs/SRS_V0_9.md#3.6.2` — PDF Cache 컴포넌트
  - `/docs/SRS_V0_9.md#5.1` — TC-004 (PDF 부하 테스트)
  - `/docs/SRS_V0_9.md#6.6` — R8·R9 (Vercel Hobby 한도·cold start)
- 도구: k6 (`grafana/k6`)
- 선행: FR-PDF-001, FW-PDF-001, FW-PDF-002, IF-CI-005 (k6 CI Job)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `tests/load/pdf-download.k6.js` 신규 파일
- [ ] **테스트 환경**:
  - Vercel Preview URL 또는 staging 배포 사용 (프로덕션 금지)
  - Lesson 시드 5종 (L001~L005) — 부하 분산 위함
  - PDF 첫 요청은 cold cache 시작 (의도적 — 실제 운영 시나리오 반영)
- [ ] **k6 시나리오 구조**:
  ```js
  import http from 'k6/http';
  import { check, sleep } from 'k6';

  export const options = {
    scenarios: {
      pdf_download: {
        executor: 'ramping-vus',
        startVUs: 0,
        stages: [
          { duration: '10s', target: 10 },  // ramp up
          { duration: '30s', target: 50 },  // sustained 50
          { duration: '10s', target: 0 },   // ramp down
        ],
      },
    },
    thresholds: {
      http_req_duration: ['p(95)<2000'],   // REQ-NF-004
      http_req_failed: ['rate<0.005'],     // REQ-NF-008 (0.5%)
    },
  };

  const lessons = ['L001', 'L002', 'L003', 'L004', 'L005'];

  export default function () {
    const lessonId = lessons[Math.floor(Math.random() * lessons.length)];
    const res = http.get(`${__ENV.BASE_URL}/api/teacher/kit/${lessonId}`);
    check(res, {
      'status 200': (r) => r.status === 200,
      'content-type pdf': (r) => r.headers['Content-Type'] === 'application/pdf',
      'cache header present': (r) => r.headers['X-Cache'] !== undefined,
    });
    sleep(1);
  }
  ```
- [ ] **k6 thresholds 설정**:
  - `http_req_duration p95 < 2000ms` (REQ-NF-004)
  - `http_req_failed rate < 0.005` (REQ-NF-008 0.5%)
  - `http_reqs rate > 40/s` (50 VU × ~1 req/s 기대)
- [ ] **Custom 메트릭**:
  - `cache_hit_rate` 메트릭 — `X-Cache: HIT` 응답 비율 측정
  - 임계치: `cache_hit_rate > 0.95` (REQ-NF-049)
- [ ] **시나리오 1 — Warm cache 부하 (정상 운영 시나리오)**:
  - 사전 warmup — 5개 lesson 의 PDF 를 한 번씩 사전 요청 (Edge + Storage 캐시 채우기)
  - 본 부하 시작 — 50 VU sustained
  - 결과: 캐시 HIT ≥ 95%
- [ ] **시나리오 2 — Cold cache 부하 (최악 시나리오)**:
  - 사전 warmup 생략
  - 50 VU 시작 — 첫 5개 req 만 cache miss (5/총 1500 = 0.3%)
  - 이후 모두 HIT
  - p95 응답 시간이 cold start (FW-PDF-001 의 5초 한도) 영향 검증
- [ ] **시나리오 3 — revision 변경 시 재생성**:
  - 부하 진행 중 lesson 의 `revision_last_updated` 갱신
  - 새 캐시 키로 cache miss → 동적 생성 → Storage 저장 → Edge 재캐시
  - 응답 시간 일시 증가 후 안정화 검증
- [ ] **시나리오 4 — Vercel Functions 한도 모니터링**:
  - Vercel Hobby 한도 (월 100K invocations) 영향 측정
  - 본 부하 1회 ≈ 1500 invocations × 월 4회 정기 실행 = 6K invocations (한도의 6%)
  - D-TIER 트리거 #5 (Functions 100K) 도달 여부 모니터링
- [ ] **시나리오 5 — 응답 페이로드 검증**:
  - 모든 응답이 정상 PDF (Content-Type, magic bytes `%PDF-`)
  - 5xx 응답 0건
- [ ] **CI 통합 (IF-CI-005)**:
  - `.github/workflows/quality.yml` 의 `load-test` Job
  - **Closed Beta 진입 시점부터 활성화** (Alpha 는 단위·E2E 만)
  - 주 1회 정기 실행 (월요일 오전) + 수동 trigger 가능
- [ ] **결과 리포트**:
  - k6 의 JSON 출력을 GitHub Action artifact 로 저장
  - PR 코멘트 자동화 — 임계치 초과 시 핵심 지표 표시
- [ ] **Cleanup** — 부하 후 캐시는 그대로 유지 (다음 사용자 영향 없음)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: Warm cache 부하 — REQ-NF-004 충족
- **Given**: 5개 lesson PDF 가 사전 캐시됨
- **When**: 50 VU × 50초 부하
- **Then**: p95 응답 시간 < 2000ms. 5xx 응답 0건. 캐시 HIT > 95%

### Scenario 2: Cold cache 부하
- **Given**: 캐시 비어있음
- **When**: 50 VU 시작
- **Then**: 첫 5건 cache miss (응답 ≤ 5초). 이후 HIT. p95 < 2000ms 유지 (cold 영향이 p95 임계치 내)

### Scenario 3: 캐시 HIT 비율 (REQ-NF-049)
- **Given**: Warm cache 시나리오
- **When**: k6 custom metric `cache_hit_rate` 측정
- **Then**: `cache_hit_rate > 0.95`. 임계치 미달 시 부하 테스트 Fail

### Scenario 4: 오류율 (REQ-NF-008)
- **Given**: 본 부하 전체 (약 1500 req)
- **When**: 5xx 응답 카운트
- **Then**: 5xx 비율 < 0.5%. 임계치 초과 시 Fail

### Scenario 5: revision 변경 중 부하
- **Given**: 부하 진행 중 (50 VU active)
- **When**: lesson L001 의 revision_last_updated 갱신 → 새 캐시 키
- **Then**: L001 의 첫 요청만 응답 시간 증가 (≤5초). 이후 안정화. 다른 lesson 영향 0

### Scenario 6: Vercel Functions 한도 영향
- **Given**: 부하 1회 실행 후
- **When**: Vercel Dashboard 의 Functions invocations 측정
- **Then**: 본 부하로 약 1500 invocations 증가. 월 100K 한도의 1.5%

### Scenario 7: 응답 페이로드 정상성
- **Given**: 부하 중 임의 응답 샘플링 (10건)
- **When**: PDF magic bytes 검증
- **Then**: 모든 응답이 `%PDF-` 로 시작. 한글 텍스트 정상 추출

### Scenario 8: 임계치 초과 시 부하 테스트 Fail
- **Given**: 의도적 부하 시나리오 (예: 100 VU 로 한도 초과 시뮬레이션)
- **When**: p95 > 2000ms 발생
- **Then**: k6 thresholds 위반으로 exit code 1. CI Job Fail. PR 차단

### Scenario 9: 결과 리포트 GitHub artifact
- **Given**: 부하 완료
- **When**: GitHub Action 결과 확인
- **Then**: JSON 결과 파일 + summary 텍스트가 artifact 로 저장. 7일간 보관

### Scenario 10: 정기 실행 일정
- **Given**: GitHub Actions cron schedule
- **When**: 주 1회 (월요일 오전) 자동 실행
- **Then**: 정기 트리거 + 수동 `workflow_dispatch` 도 가능

## :gear: Technical & Non-Functional Constraints
- **k6 환경**: 최신 안정 버전. Docker 또는 Cloud (k6 Cloud 는 비용 발생 — 본 태스크는 self-hosted 권장)
- **부하 환경 — Vercel Preview 또는 staging**: 프로덕션 절대 사용 금지. 실 사용자 영향 0
- **VU 50 의 합리성**: Public Pilot 의 예상 동시 사용자 ≤50 (월 사용자 1000명 × 동시 5% 가정)
- **임계치 정의 (k6 thresholds)**:
  - `http_req_duration p95 < 2000ms` (REQ-NF-004)
  - `http_req_failed rate < 0.005` (REQ-NF-008)
  - `cache_hit_rate > 0.95` (custom metric, REQ-NF-049)
- **CI 비용 관리**:
  - 정기 실행 — 주 1회만
  - 수동 trigger — `workflow_dispatch` 로 필요 시
  - 매 PR 실행 금지 (CI 비용 폭증)
- **결과 보존**: GitHub artifact 7일 + Sentry custom metric 영구
- **Vercel Functions 한도 모니터링**: 본 부하 1회 ≈ 1.5% 한도 사용. D-TIER 트리거 #5 (100K) 도달 추적
- **단위 vs 통합 테스트와의 차이**:
  - 단위 (Vitest) — 함수 레벨, in-process, < 5초
  - 통합 (Vitest with PostgreSQL) — DB 까지 포함, < 30초
  - **본 태스크 (k6 부하)** — 실 HTTP + Vercel Functions + 캐시, 50초
- **금지**:
  - 프로덕션 환경 부하 (실 사용자 영향)
  - k6 thresholds 미설정 (정량적 임계치 강제)
  - 본 부하를 매 PR 실행 (비용 폭증)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `tests/load/pdf-download.k6.js` 구현
- [ ] k6 thresholds 3종 설정 + 위반 시 exit 1
- [ ] custom metric `cache_hit_rate` 측정
- [ ] CI (IF-CI-005) 의 `load-test` Job 통합
- [ ] 정기 실행 schedule (주 1회) + 수동 trigger
- [ ] 결과 GitHub artifact 7일 보관
- [ ] Vercel Functions 한도 영향 측정 (1.5%)
- [ ] flaky 검증 — 5회 연속 임계치 충족
- [ ] **Public Pilot 진입 준비** — 부하 안정성 검증
- [ ] PR 본문에 "REQ-NF-004 + REQ-NF-049 + REQ-NF-008 통합 검증" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-PDF-001 (PDF 다운로드 API)
  - FW-PDF-001 (Renderer)
  - FW-PDF-002 (PDF 템플릿)
  - IF-CACHE-001 (PDF 2단 캐시 인프라)
  - IF-CI-005 (k6 CI Job 인프라)
  - IF-SUP-001 (Supabase Storage 버킷)
- **Blocks**:
  - REQ-NF-004 (PDF p95 ≤2초) 검증
  - REQ-NF-049 (캐시 HIT ≥95%) 검증
  - REQ-NF-008 (오류율 ≤0.5%) 검증
  - **Public Pilot Exit Gate** — 부하 안정성 통과 시 Public Pilot 운영 가능
- **Related**:
  - D-TIER 트리거 #5 (Vercel Functions 100K) 모니터링
  - SRS §6.6 R8 (Vercel Hobby 비영리 정책) 준수
