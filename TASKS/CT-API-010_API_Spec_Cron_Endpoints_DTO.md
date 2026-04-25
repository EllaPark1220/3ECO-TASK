# [Feature] CT-API-010: Cron 엔드포인트 3종 시그니처 — warmup + supabase-ping + pg-dump 통합 Contract

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-API-010: Cron 엔드포인트 3종 시그니처 — /api/cron/warmup + /api/cron/supabase-ping + /api/cron/pg-dump + Bearer 인증 + 멱등 응답"
labels: 'feature, backend, api-spec, cron, infra, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-API-010] 3개 Cron 엔드포인트의 통합 Contract — `/api/cron/warmup` (5분 — Functions cold start) + `/api/cron/supabase-ping` (주 1회 — R10 pause 방지) + `/api/cron/pg-dump` (일 1회 — RPO 24h 백업) + 공통 Bearer 토큰 인증 + 멱등 응답 + 실행 결과 메타
- **목적**: IF-CRON-001~003 (Cron 본체) 의 Contract SSOT. R9 (Functions cold start) + R10 (Supabase pause) + REQ-NF-011 (RPO 24h) 동시 충족 인프라의 데이터 진입. 외부 cron 서비스 (cron-job.org 또는 GitHub Actions schedule) 가 본 엔드포인트를 호출.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.1` — Cron 엔드포인트 정의
  - `/docs/SRS_V0_9.md#6.6` — R9 (cold start), R10 (Supabase pause)
  - `/docs/SRS_V0_9.md#4.2.2` — REQ-NF-011 (RPO 24h)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-004 (PDF p95 ≤2초)
- 외부 문서: `https://vercel.com/docs/cron-jobs`
- 선행: CT-API-001 (응답 포맷), IF-VC-001 (Vercel), IF-SUP-001 (Supabase), IF-CRON-001 (warmup 본체)
- 짝: IF-CRON-001 (warmup), IF-CRON-002 (supabase-ping), IF-CRON-003 (pg-dump)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/contracts/cron.ts` 신규 파일 — 3종 응답 DTO + 인증 정책
- [ ] **공통 Bearer 인증 정책**:
  ```ts
  // 모든 cron 엔드포인트가 공통으로 사용
  // 헤더: Authorization: Bearer <CRON_SECRET>
  // CRON_SECRET — Vercel 환경변수 + 외부 cron 서비스 (cron-job.org) 모두 등록

  export function verifyCronAuth(req: Request): boolean {
    const auth = req.headers.get('Authorization');
    return auth === `Bearer ${process.env.CRON_SECRET}`;
  }
  ```
- [ ] **Cron 1 — `POST /api/cron/warmup` (이미 IF-CRON-001 발행)**:
  ```ts
  export const WarmupResponseSchema = z.object({
    ok: z.literal(true),
    success_count: z.number().int().min(0),
    total: z.number().int().min(0),
    duration_ms: z.number().int(),
    targets: z.array(z.object({
      name: z.string(),         // 'supabase_db', 'pdf_route', 'lesson_route'
      success: z.boolean(),
      duration_ms: z.number().int(),
    })),
  });
  ```
- [ ] **Cron 2 — `POST /api/cron/supabase-ping` (IF-CRON-002 신규)**:
  ```ts
  export const SupabasePingResponseSchema = z.object({
    ok: z.literal(true),
    db_alive: z.boolean(),
    last_query_at: z.string(),  // ISO datetime
    response_time_ms: z.number().int(),
  });
  ```
  - 주 1회 — Supabase Free pause (7일 inactive) 방지
  - 단순 `SELECT 1` 실행 + 응답 시간 측정
  - warmup 과 분리 이유: 빈도 다름 (5분 vs 주 1회), 모니터링 관점 분리
- [ ] **Cron 3 — `POST /api/cron/pg-dump` (IF-CRON-003 신규)**:
  ```ts
  export const PgDumpResponseSchema = z.object({
    ok: z.literal(true),
    backup_id: z.string().uuid(),
    storage_url: z.string(),  // Supabase Storage 의 백업 파일 경로
    backup_size_bytes: z.number().int(),
    backup_created_at: z.string(),
    duration_ms: z.number().int(),
    table_count: z.number().int(),
  });
  ```
  - 일 1회 — RPO 24h 충족
  - Supabase Storage 의 `backups/` 버킷에 `pg-dump-YYYY-MM-DD.sql.gz` 저장
  - 7일 retention 정책 (Free 플랜 기본 + 추가 보존)
- [ ] **외부 cron 호출 정책**:
  - **권장**: cron-job.org (무료, 1분 간격 가능)
  - **백업**: GitHub Actions schedule (월 2000분 무료)
  - Vercel Cron Hobby 매시간 1회 한도 — 본 라우트 3종 중 일 1회 (pg-dump) 만 호환
- [ ] **에러 응답**:
  - 401 — `UNAUTHORIZED` (Bearer 토큰 불일치)
  - 500 — `INTERNAL_ERROR` (실행 중 예외)
  - 503 — `STORAGE_UNAVAILABLE` (pg-dump 만 — Supabase Storage 장애)
- [ ] **silent fail 정책 — graceful**:
  - 일부 target 실패 시에도 다른 target 정상 진행 (Promise.allSettled)
  - 응답에 `success_count` 명시 — 운영 모니터링
- [ ] **모니터링 통합**:
  - 24시간 success rate < 95% 시 Sentry 알림
  - pg-dump 실패 시 즉시 Sentry 알림 (RPO 영향)
- [ ] **HEAD 메서드 미지원**:
  - 본 cron 라우트는 POST 만 (실행 의도 명확)
  - HEAD/GET 은 405 Method Not Allowed
- [ ] **응답 시간 정책**:
  - warmup: ≤ 3초
  - supabase-ping: ≤ 1초
  - pg-dump: ≤ 60초 (일 1회 + 데이터량 ~200MB)
- [ ] **OpenAPI 명세 추가** — 3개 라우트 모두
- [ ] **Mock fixture**:
  ```ts
  export const mockWarmupResponse: WarmupResponse = {
    ok: true,
    success_count: 3,
    total: 3,
    duration_ms: 850,
    targets: [
      { name: 'supabase_db', success: true, duration_ms: 120 },
      { name: 'pdf_route', success: true, duration_ms: 350 },
      { name: 'lesson_route', success: true, duration_ms: 80 },
    ],
  };
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: warmup 정상 응답
- **Given**: Bearer 토큰 정상
- **When**: `POST /api/cron/warmup`
- **Then**: 200 + WarmupResponse. success_count: 3, total: 3, targets 배열

### Scenario 2: supabase-ping 정상 응답
- **Given**: Bearer 토큰 정상
- **When**: `POST /api/cron/supabase-ping`
- **Then**: 200 + `db_alive: true, response_time_ms: <1000`

### Scenario 3: pg-dump 정상 응답
- **Given**: Bearer 토큰 정상
- **When**: `POST /api/cron/pg-dump`
- **Then**: 200 + `backup_id, storage_url, backup_size_bytes` 정상

### Scenario 4: Bearer 토큰 미일치 — 401
- **Given**: 잘못된 Bearer 또는 Authorization 누락
- **When**: 호출
- **Then**: 401 + `UNAUTHORIZED`

### Scenario 5: warmup 일부 target 실패 — graceful
- **Given**: PDF 라우트 일시 5xx
- **When**: warmup 호출
- **Then**: 200 + `success_count: 2, total: 3`. 다른 target 정상

### Scenario 6: pg-dump Supabase Storage 장애 — 503
- **Given**: Storage 5xx
- **When**: pg-dump 호출
- **Then**: 503 + `STORAGE_UNAVAILABLE` + Sentry 알림

### Scenario 7: HEAD 메서드 — 405
- **Given**: HEAD 요청
- **When**: 호출
- **Then**: 405 Method Not Allowed

### Scenario 8: 응답 시간 — pg-dump ≤ 60초
- **Given**: 정상 환경 + 데이터 200MB
- **When**: pg-dump 호출
- **Then**: 응답 시간 ≤ 60초

### Scenario 9: 24시간 success rate 모니터링
- **Given**: 24시간 누적
- **When**: cron 라우트별 success rate 측정
- **Then**: warmup ≥ 95%, supabase-ping ≥ 99%, pg-dump 100% (일 1회 실행, 1회라도 실패 시 즉시 알림)

### Scenario 10: pg-dump retention — 7일
- **Given**: 7일 이상 경과한 백업 파일
- **When**: 본 라우트 응답에 retention 정책 적용 (선택 — 별도 후속)
- **Then**: 7일 초과 백업 자동 삭제 (별도 cron 또는 Storage 정책)

## :gear: Technical & Non-Functional Constraints
- **단일 파일 SSOT**: `lib/contracts/cron.ts` — 3종 응답 + 인증
- **공통 Bearer 인증**: 모든 cron 라우트 동일 정책. CRON_SECRET 환경변수
- **silent fail (graceful)**: 일부 target 실패 시에도 응답 200. 모니터링은 success_count 추적
- **POST 메서드 강제**: 실행 의도 명확. GET·HEAD 405
- **외부 cron 서비스 의존**: cron-job.org 또는 GitHub Actions schedule. Vercel Hobby 한도 회피
- **응답 시간 차등**:
  - warmup ≤ 3초 (3개 fetch 병렬)
  - supabase-ping ≤ 1초 (단순 SELECT)
  - pg-dump ≤ 60초 (대용량)
- **모니터링 통합**: 24시간 success rate < 95% Sentry 알림
- **pg-dump 보안**: backup 파일 URL 은 Service Role Key 만 접근. 익명 노출 차단
- **응답 페이로드 크기**: warmup 1KB, supabase-ping 0.5KB, pg-dump 1KB. 부하 영향 0
- **PII 미포함**: 응답에 사용자 데이터 미포함. 메타만
- **금지**:
  - GET 메서드 허용 (캐시 영향 + 의도 불명확)
  - Bearer 인증 우회
  - pg-dump 의 backup 파일 익명 노출
  - 동일 cron 의 동시 실행 (별도 lock 정책 검토)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/contracts/cron.ts` 3종 응답 DTO + 인증 헬퍼
- [ ] verifyCronAuth() 헬퍼 — 본 Contract 활용
- [ ] CRON_SECRET 환경변수 등록 (Vercel + 외부 cron 서비스)
- [ ] silent fail (graceful) 정책 검증
- [ ] POST 메서드 강제 + 405 응답
- [ ] 응답 시간 측정 (3종 차등)
- [ ] 24시간 success rate 모니터링 통합
- [ ] OpenAPI 명세 추가 (3개 라우트)
- [ ] Mock fixture + schema parse 검증
- [ ] PR 본문에 "IF-CRON-001~003 의 통합 Contract. R9·R10·RPO 동시 충족" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-001 (공통 응답 포맷)
  - IF-VC-001 (Vercel — 환경변수)
  - IF-SUP-001 (Supabase — pg-dump 대상 + Storage)
- **Blocks**:
  - IF-CRON-001 (warmup — 이미 발행, 본 Contract 와 정합 검증)
  - IF-CRON-002 (supabase-ping)
  - IF-CRON-003 (pg-dump)
  - IF-CRON-004 (DR Restore — pg-dump 활용)
- **Related**:
  - R9 (Functions cold start)
  - R10 (Supabase pause)
  - REQ-NF-011 (RPO 24h)
