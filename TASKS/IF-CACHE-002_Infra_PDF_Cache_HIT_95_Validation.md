# [Infra] IF-CACHE-002: PDF 캐시 HIT ≥95% 측정 검증

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Infra] IF-CACHE-002: PDF 캐시 HIT 비율 ≥95% 정량 측정 — Vercel Analytics + Storage 로그 분석 + 운영 대시보드"
labels: 'infra, cache, monitoring, validation, priority:medium, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-CACHE-002] PDF 캐시 HIT 비율 ≥ 95% 정량 측정 + 모니터링 대시보드
- **목적**: IF-CACHE-001 (PDF 2단 캐시) 이 설계대로 동작하는지 정량적으로 검증한다. 동일 키 재요청 시 캐시 HIT ≥ 95% 를 측정·증빙하여 REQ-NF-049 (캐시 HIT 비율 ≥ 95%) 를 충족한다. 측정 결과를 운영 대시보드 (FR-KPI-009) 에 통합하여 지속적 모니터링을 가능하게 한다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.8` — REQ-NF-049 (캐시 HIT ≥ 95%)
  - `/docs/SRS_V0_9.md#3.6.2` — PDF Cache 컴포넌트 (2단)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-004 (PDF p95 ≤ 2초)
  - `/docs/SRS_V0_9.md#4.2.4` — REQ-NF-032 (KPI 대시보드)
- 선행: IF-CACHE-001 (PDF 2단 캐시 인프라)
- 짝: FR-KPI-009 (KPI 대시보드 — 캐시 HIT 비율 시각화)

## :white_check_mark: Task Breakdown (실행 계획)

### 캐시 HIT/MISS 로깅
- [ ] **FR-PDF-001 Route Handler 에 캐시 상태 로깅 추가**:
  ```ts
  // app/api/teacher/kit/[id]/route.ts
  const cacheStatus = storageHit ? 'STORAGE_HIT' : 'GENERATED';

  // 응답 헤더에 캐시 상태 포함
  headers.set('X-Cache', cacheStatus);

  // EventLog 에 캐시 이벤트 기록
  await prisma.eventLog.create({
    data: {
      eventName: 'pdf.cache_status',
      payload: {
        lessonId,
        revision,
        status: cacheStatus, // 'EDGE_HIT' | 'STORAGE_HIT' | 'GENERATED' | 'FALLBACK'
        responseTimeMs: Date.now() - startTime,
      },
      timestamp: new Date(),
    },
  });
  ```
- [ ] **Edge HIT 는 Route Handler 미도달** — Vercel Edge 에서 HIT 시 함수 미실행. Vercel Analytics 로 확인:
  - Vercel Dashboard → Analytics → Cache Hit Ratio
  - 또는 `x-vercel-cache` 헤더 분석 (클라이언트 측 수집)

### 캐시 HIT 비율 계산 쿼리
- [ ] **SQL 집계 쿼리** — Supabase SQL Editor:
  ```sql
  -- 최근 7일 PDF 캐시 HIT 비율
  SELECT
    DATE(timestamp) AS day,
    COUNT(*) AS total_requests,
    COUNT(*) FILTER (WHERE payload->>'status' IN ('EDGE_HIT', 'STORAGE_HIT')) AS cache_hits,
    ROUND(
      COUNT(*) FILTER (WHERE payload->>'status' IN ('EDGE_HIT', 'STORAGE_HIT'))::numeric
      / NULLIF(COUNT(*), 0) * 100,
      2
    ) AS hit_rate_pct
  FROM event_logs
  WHERE event_name = 'pdf.cache_status'
    AND timestamp >= NOW() - INTERVAL '7 days'
  GROUP BY DATE(timestamp)
  ORDER BY day DESC;
  ```
- [ ] **Edge HIT 포함 총합 계산**:
  - Edge HIT = Vercel Analytics 의 캐시 HIT 카운트
  - Storage HIT + GENERATED = EventLog 기반
  - 총 HIT 비율 = (Edge HIT + Storage HIT) / (Edge HIT + Storage HIT + GENERATED) × 100

### 모니터링 대시보드 통합
- [ ] **FR-KPI-009 에 캐시 HIT 카드 추가**:
  - 카드 제목: "PDF 캐시 HIT 비율"
  - 값: `{hit_rate_pct}%` (목표 ≥ 95%)
  - 색상: 95% 이상 초록, 90~95% 노랑, 90% 미만 빨강
- [ ] **Vercel Analytics 연동** (가능 시):
  - Vercel Analytics API 로 Edge Cache HIT 비율 조회
  - `GET /v1/analytics?metric=cache_hit_ratio` (Vercel API)
- [ ] **주간 리포트 자동화** (선택):
  - IF-CRON 기반 주간 캐시 HIT 비율 계산 → Sentry 커스텀 메트릭 전송
  - HIT 비율 < 90% 시 Sev3 알림

### 검증 테스트
- [ ] **자동화 검증 스크립트** — `scripts/validate-cache-hit.ts`:
  ```ts
  // 동일 URL 100회 요청 → HIT 비율 계산
  const url = `${BASE_URL}/api/teacher/kit/L001/2026-04-25`;

  // 1회 — warm-up (MISS 예상)
  await fetch(url);
  await new Promise(r => setTimeout(r, 2000)); // Edge 캐시 전파 대기

  let hits = 0;
  for (let i = 0; i < 99; i++) {
    const res = await fetch(url);
    if (res.headers.get('x-vercel-cache') === 'HIT') hits++;
  }

  const hitRate = (hits / 99) * 100;
  console.log(`Cache HIT rate: ${hitRate.toFixed(1)}% (target ≥95%)`);
  assert(hitRate >= 95, `Cache HIT rate ${hitRate}% < 95%`);
  ```
- [ ] **revision 변경 후 재검증** — revision 변경 → 1회 MISS → 이후 HIT 지속 확인
- [ ] **다양한 lessonId 테스트** — L001~L010 각각 10회 → 전체 HIT 비율 계산

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 동일 URL 100회 요청 — HIT ≥ 95%
- **Given**: L001 PDF 캐시 warm-up 완료
- **When**: 동일 URL 100회 연속 요청
- **Then**: 캐시 HIT ≥ 95회 (≥ 95%). 첫 1~2회 MISS 허용

### Scenario 2: revision 변경 — 정확히 1회 MISS
- **Given**: L001 revision `2026-04-25` 캐시 존재
- **When**: revision `2026-05-01` 로 변경 후 10회 요청
- **Then**: 첫 1회 MISS + 이후 9회 HIT (HIT 90% — revision 변경 자연 MISS)

### Scenario 3: 다수 lessonId — 전체 HIT ≥ 95%
- **Given**: L001~L010 각각 warm-up 완료
- **When**: 각 10회씩 총 100회 요청
- **Then**: 전체 HIT ≥ 95%

### Scenario 4: EventLog 기반 HIT 비율 쿼리 정확성
- **Given**: 1주일 운영 후 EventLog 축적
- **When**: 캐시 HIT 비율 SQL 쿼리 실행
- **Then**: HIT 비율 ≥ 95%. 일별 트렌드 확인 가능

### Scenario 5: KPI 대시보드 — 캐시 HIT 카드 노출
- **Given**: FR-KPI-009 대시보드
- **When**: 캐시 HIT 비율 조회
- **Then**: 카드에 `{hit_rate_pct}%` 표시. 95% 이상 초록

### Scenario 6: HIT < 90% 시 — 알림 트리거
- **Given**: 비정상적으로 HIT 비율 급감 (캐시 무효화 오류 등)
- **When**: 일간 집계 HIT < 90%
- **Then**: Sev3 알림 발송 (NF-OBS-004 연동)

### Scenario 7: Edge HIT — Route Handler 미실행
- **Given**: Edge 캐시에 PDF 존재
- **When**: 요청
- **Then**: Route Handler 미실행 (함수 호출 0). Vercel 함수 로그에 미기록. `x-vercel-cache: HIT`

### Scenario 8: 캐시 warm-up 후 응답 시간 검증
- **Given**: HIT 상태
- **When**: 응답 시간 측정
- **Then**: HIT 시 p95 ≤ 100ms. MISS 시 p95 ≤ 5초. 전체 p95 ≤ 2초 (HIT 95% 가정)

## :gear: Technical & Non-Functional Constraints
- **HIT 비율 목표**: ≥ 95% (REQ-NF-049)
  - MISS 원인: 첫 요청 + revision 변경 + Edge 만료 (24시간) + 수동 무효화
  - MVP 125편 × 평균 2 revision/년 = ~250 MISS 이벤트/년 → 총 트래픽 대비 극소
- **측정 방법**:
  - L1 (Edge): `x-vercel-cache` 헤더 또는 Vercel Analytics Dashboard
  - L2 (Storage): EventLog 의 `pdf.cache_status` 이벤트
  - 종합: (Edge HIT + Storage HIT) / 전체 요청
- **EventLog 빈도**: PDF 요청당 1건 → MVP 단계 일 50건 미만 (부하 무시 가능)
- **Vercel Analytics 한도**: Hobby 플랜 — Analytics Free (기본 메트릭 제공)
- **측정 주기**: 일간 집계 (야간 cron) + 주간 리포트 (선택)
- **금지**:
  - 캐시 HIT 비율을 높이기 위한 인위적 warm-up cron (비용 낭비)
  - 측정 트래픽을 실제 트래픽에 혼입 (별도 태그 분리)
  - HIT 비율 < 90% 무시 (알림 필수)

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 전부 통과
- [ ] EventLog `pdf.cache_status` 이벤트 발행 (FR-PDF-001 연동)
- [ ] 캐시 HIT 비율 SQL 쿼리 작성 + 검증
- [ ] `scripts/validate-cache-hit.ts` 자동화 스크립트
- [ ] 동일 URL 100회 요청 HIT ≥ 95% 검증
- [ ] FR-KPI-009 대시보드에 캐시 HIT 카드 추가 (정합)
- [ ] HIT < 90% 알림 트리거 설정
- [ ] PR 본문에 "REQ-NF-049 캐시 HIT ≥95% 정량 검증. EventLog + Vercel Analytics 조합" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-CACHE-001 (PDF 2단 캐시 인프라 — 측정 대상)
  - FR-PDF-001 (PDF Route Handler — EventLog 발행 위치)
  - CT-DB-009 (EventLog 테이블)
  - IF-VC-001 (Vercel Analytics)
- **Blocks**:
  - 없음 (검증 태스크 — downstream 의존 없음)
- **Related**:
  - REQ-NF-049 (캐시 HIT ≥ 95%)
  - FR-KPI-009 (KPI 대시보드 — 캐시 HIT 시각화)
  - NF-OBS-004 (Sev3 — HIT 비율 급감 시 알림)
