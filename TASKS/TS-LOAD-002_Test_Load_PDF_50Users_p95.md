# [Test] TS-LOAD-002: PDF 다운로드 동시 50명 — p95 ≤2s (k6)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-LOAD-002: k6 부하 테스트 — PDF 다운로드 동시 50명 요청, p95 ≤2초 (REQ-NF-004)"
labels: 'test, load, k6, performance, pdf, priority:high, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-LOAD-002] k6 부하 테스트 — 교안 PDF 다운로드 동시 50명 요청 p95 ≤ 2초
- **목적**: REQ-NF-004 (교안 PDF 다운로드 p95 ≤ 2초) 를 실제 동시 교사 접속 시나리오에서 검증. k6 50VU 로 다양한 lessonId 의 PDF 를 동시 다운로드하며 캐시 HIT·MISS 양측 성능 측정.

## :link: References (Spec & Context)
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-004 (PDF 다운로드 p95 ≤2s)
  - `/docs/SRS_V0_9.md#5.2` — TC-NF-004
- 선행: FR-PDF-001 (PDF Route Handler), IF-CACHE-001 (2단 캐시)
- 별도: TS-IT-004 (통합 테스트 — 정합성 중심. 본 태스크는 부하 성능 중심)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **k6 스크립트** — `tests/load/pdf-download.k6.js`:
  ```js
  import http from 'k6/http';
  import { check, sleep } from 'k6';
  import { Trend, Rate, Counter } from 'k6/metrics';

  const pdfLatency = new Trend('pdf_download_latency', true);
  const cacheHit = new Counter('pdf_cache_hit');
  const cacheMiss = new Counter('pdf_cache_miss');

  export const options = {
    scenarios: {
      pdf_download: {
        executor: 'constant-vus',
        vus: 50,
        duration: '3m',
      },
    },
    thresholds: {
      'pdf_download_latency': ['p(95)<2000'],
      'http_req_failed': ['rate<0.01'],
    },
  };

  const LESSON_IDS = ['L001','L002','L003','L004','L005','L006','L007','L008','L009','L010'];

  export default function () {
    const lessonId = LESSON_IDS[__ITER % LESSON_IDS.length];
    const res = http.get(`${__ENV.BASE_URL}/api/teacher/kit/${lessonId}`, {
      headers: { 'Cookie': `sb-access-token=${__ENV.TEACHER_TOKEN}` },
      responseType: 'binary',
    });

    pdfLatency.add(res.timings.duration);

    // 캐시 HIT/MISS 추적
    const cacheHeader = res.headers['X-Cache'] || res.headers['x-vercel-cache'] || '';
    if (cacheHeader.includes('HIT')) cacheHit.add(1);
    else cacheMiss.add(1);

    check(res, {
      'status 200': (r) => r.status === 200,
      'content-type pdf': (r) => r.headers['Content-Type']?.includes('application/pdf'),
      'body size > 0': (r) => r.body.length > 0,
      'latency < 2s': (r) => r.timings.duration < 2000,
    });

    sleep(2);
  }
  ```
- [ ] **Cold/Warm 분리 시나리오**:
  - Warm: 동일 lessonId 반복 (캐시 HIT 기대)
  - Cold: 10 lessonId 순회 (첫 요청 MISS)
- [ ] **캐시 HIT 비율 목표**: ≥ 80% (반복 요청 다수)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 50VU 동시 — p95 ≤ 2초
- **Given**: 50VU 3분 실행
- **When**: PDF 다운로드 반복
- **Then**: p95 ≤ 2000ms

### Scenario 2: 성공률 ≥ 99%
- **Given**: 50VU 부하
- **When**: 응답 코드 집계
- **Then**: 200 ≥ 99%

### Scenario 3: 응답 Content-Type
- **Given**: PDF 요청
- **When**: 응답 헤더
- **Then**: `Content-Type: application/pdf`

### Scenario 4: 캐시 HIT 비율 ≥ 80%
- **Given**: 동일 lessonId 반복
- **When**: X-Cache 헤더 집계
- **Then**: HIT ≥ 80%

### Scenario 5: Cold 첫 요청 p95 ≤ 3초
- **Given**: 캐시 미존재 (Cold)
- **When**: 첫 PDF 생성
- **Then**: p95 ≤ 3초 (허용 마진)

### Scenario 6: PDF 크기 일관
- **Given**: 동일 lesson
- **When**: 반복 다운로드
- **Then**: 모든 응답 body 크기 동일

### Scenario 7: k6 threshold 자동 판정
- **Given**: thresholds 설정
- **When**: 실행 종료
- **Then**: 통과 시 exit 0

### Scenario 8: TEACHER role 가드
- **Given**: LEARNER 토큰
- **When**: PDF 요청
- **Then**: 403

## :gear: Technical & Non-Functional Constraints
- **VU 수**: 50 (교사 동시 접속 현실적 상한)
- **Duration**: 3분 (PDF 생성 Cold 포함)
- **캐시 전략**: IF-CACHE-001 의 2단 캐시 (Vercel Edge + Supabase Storage) 활용
- **PDF 크기**: ~200KB~1MB (레슨별 상이)
- **금지**: 프로덕션 직접 부하

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 통과
- [ ] k6 스크립트 `tests/load/pdf-download.k6.js` 구현
- [ ] 50VU 3분 → p95 ≤ 2s 달성
- [ ] 캐시 HIT 비율 리포트
- [ ] PR 본문에 "REQ-NF-004 정량 검증. 50VU p95={N}ms" 명시

## :construction: Dependencies & Blockers
- **Depends on**: FR-PDF-001 (PDF API), IF-CACHE-001 (캐시), CT-MOCK-002 (교사 시드)
- **Blocks**: IF-CI-005 (k6 CI Job)
- **Related**: TS-IT-004 (정합 통합), REQ-NF-004
