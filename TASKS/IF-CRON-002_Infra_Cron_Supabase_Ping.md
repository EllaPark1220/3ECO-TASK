# [Feature] IF-CRON-002: Supabase Ping Cron — 주 1회 SELECT 1 + R10 pause 방지

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] IF-CRON-002: /api/cron/supabase-ping Route Handler — 주 1회 SELECT 1 실행 + 응답 시간 측정 + 24h 모니터링"
labels: 'feature, infra, cron, supabase, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-CRON-002] `POST /api/cron/supabase-ping` Route Handler — 주 1회 (월요일 09:00 KST) Supabase DB 에 단순 `SELECT 1` 실행하여 R10 (Free pause 7일 inactive) 명시적 방지 + 응답 시간 측정 + 24h success rate 모니터링
- **목적**: IF-CRON-001 (warmup) 이 5분 간격이지만 **운영 환경에서 트래픽 있을 때만 의미 있음** — Stage 0 의 Alpha 환경처럼 사용자 0명일 때 warmup 실패 누적 → Supabase pause 위험. 본 태스크는 **항상 보장되는 별도 ping** 으로 R10 안전 보장.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.6` — R10 (Supabase Free pause 7일 inactive)
  - `/docs/SRS_V0_9.md#6.1` — `/api/cron/supabase-ping` 엔드포인트
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-TIER (Free 한도 모니터링)
- 외부 문서: `https://supabase.com/docs/guides/platform/troubleshooting#why-is-my-project-paused`
- 선행: CT-API-010 (Cron Contract), IF-VC-001 (Vercel), IF-SUP-001 (Supabase), IF-CRON-001 (warmup 패턴)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/cron/supabase-ping/route.ts` Route Handler 구현
- [ ] **Bearer 인증 (CT-API-010 의 verifyCronAuth 활용)**:
  ```ts
  import { prisma } from '@/lib/db';
  import { verifyCronAuth } from '@/lib/contracts/cron';
  import { NextResponse } from 'next/server';

  export const dynamic = 'force-dynamic';
  export const runtime = 'nodejs';  // Edge 미사용 (Prisma 호환)

  export async function POST(req: Request) {
    if (!verifyCronAuth(req)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const startMs = Date.now();
    let dbAlive = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbAlive = true;
    } catch (e) {
      // Sentry 즉시 알림 — DB 접근 실패는 critical
      console.error('Supabase ping failed:', e);
      // Sentry.captureException(e);
      return NextResponse.json({
        ok: false,
        db_alive: false,
        last_query_at: new Date().toISOString(),
        response_time_ms: Date.now() - startMs,
        error: 'DB ping failed',
      }, { status: 503 });
    }

    return NextResponse.json({
      ok: true,
      db_alive: dbAlive,
      last_query_at: new Date().toISOString(),
      response_time_ms: Date.now() - startMs,
    });
  }
  ```
- [ ] **외부 cron 스케줄 — 주 1회 월요일 09:00 KST**:
  - **GitHub Actions schedule (권장)** — `.github/workflows/cron-supabase-ping.yml`:
    ```yaml
    name: Supabase Ping
    on:
      schedule:
        - cron: '0 0 * * 1'  # UTC 일요일 24:00 = KST 월요일 09:00
      workflow_dispatch:
    jobs:
      ping:
        runs-on: ubuntu-latest
        steps:
          - run: |
              curl -fsSL -X POST \
                -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
                https://economic-judgment.app/api/cron/supabase-ping
    ```
  - **백업: cron-job.org 동일 스케줄 등록**
- [ ] **CRON_SECRET 환경변수**:
  - Vercel + GitHub Secrets 동시 등록 (CT-API-010 의 통합 정책)
- [ ] **응답 시간 모니터링 — 임계 알림**:
  - 정상: ≤ 500ms
  - 경고 (≥ 1000ms): Sentry 경고 (DB 부하 증가 시그널)
  - 실패 (5xx): Sentry 즉시 알림 — 운영자 SMS·메일
- [ ] **EventLog 발행 (분석용)**:
  - `cron.supabase_ping.success` (정상)
  - `cron.supabase_ping.failure` (실패)
  - 단 failure 는 Sentry 가 우선 (EventLog 도 DB 접근 필요 → 실패 시 무의미)
- [ ] **24시간 success rate 모니터링**:
  - 본 cron 은 주 1회 → 24시간 1건만 (또는 0건 — 월요일 외)
  - 일주일 단위로 1건 이상 성공 검증
  - 일주일 누적 실패 시 Sentry 알림
- [ ] **R10 pause 방지 외 추가 의의**:
  - DB 접근 권한 검증 (Service Role Key 활성)
  - 마이그레이션 직후 health check
  - PgBouncer pool 활성 상태 검증
- [ ] **응답 시간 정책**:
  - p95 ≤ 500ms
  - p99 ≤ 1000ms
  - 초과 시 Supabase Pro 전환 검토 트리거 (D-TIER #1)
- [ ] **Vercel Cron 호환성 (선택)**:
  - Vercel Hobby 는 cron-job 매시간 1회 가능 — 본 태스크는 주 1회라 Hobby 한도 내
  - `vercel.json` 의 crons 활용 옵션:
    ```json
    {
      "crons": [
        { "path": "/api/cron/supabase-ping", "schedule": "0 0 * * 1" }
      ]
    }
    ```
  - 단 외부 cron (GitHub Actions) 이 더 안정적. Vercel Cron 은 백업

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 ping
- **Given**: Bearer 토큰 + DB 정상
- **When**: `POST /api/cron/supabase-ping`
- **Then**: 200 + `db_alive: true, response_time_ms: <500`

### Scenario 2: Bearer 미인증 — 401
- **Given**: Authorization 헤더 없음
- **When**: 호출
- **Then**: 401 Unauthorized

### Scenario 3: DB 장애 — 503 + Sentry
- **Given**: Supabase 장애 (또는 의도적 단절)
- **When**: 호출
- **Then**: 503 + `db_alive: false`. Sentry 즉시 알림

### Scenario 4: 응답 시간 측정
- **Given**: 정상 환경
- **When**: 호출
- **Then**: 응답 본문에 `response_time_ms` 포함. 일반적으로 50~200ms

### Scenario 5: 응답 시간 1000ms 초과 — Sentry 경고
- **Given**: DB 부하 (Supabase 한도 근접)
- **When**: 호출 (응답 1500ms)
- **Then**: 200 + 응답 정상. 단 Sentry 경고 발송 (성능 저하 알림)

### Scenario 6: GET 메서드 — 405
- **Given**: GET 요청
- **When**: 호출
- **Then**: 405 Method Not Allowed (POST 만 허용)

### Scenario 7: 주 1회 스케줄 정합 — KST 월요일 09:00
- **Given**: GitHub Actions schedule 활성
- **When**: 일주일 모니터링
- **Then**: 정확히 1회 실행 (월요일 09:00 KST = UTC 일요일 24:00)

### Scenario 8: 일주일 누적 실패 시 Sentry
- **Given**: 일주일 (1회) 실행 실패
- **When**: 모니터링
- **Then**: Sentry 알림. 운영자 SMS·메일 (R10 pause 임박)

### Scenario 9: R10 pause 방지 검증 — 7일 트래픽 0
- **Given**: 사용자 트래픽 0 + 본 cron 정상 실행
- **When**: 7일 후
- **Then**: Supabase pause 발생 0. DB 활성 유지

### Scenario 10: PgBouncer pool 활성 검증
- **Given**: 본 cron 실행
- **When**: $queryRaw 직후
- **Then**: PgBouncer pool 의 connection 1개 정상 사용 + 반환

## :gear: Technical & Non-Functional Constraints
- **POST 메서드 강제** (CT-API-010 정합): GET/HEAD 405
- **Bearer 인증 (CT-API-010 의 verifyCronAuth)**: 무단 호출 차단
- **runtime: 'nodejs'**: Edge 미지원 (Prisma 의존)
- **단순 SELECT 1**: 데이터 변경 0. 부하 미미 (≤ 50ms 일반적)
- **외부 cron 우선 (GitHub Actions)**: Vercel Cron Hobby 한도 안전. cron-job.org 백업
- **Sentry 즉시 알림 (5xx)**: DB 접근 실패는 critical. 운영자 SMS·메일
- **응답 시간 임계**:
  - 정상 ≤ 500ms
  - 경고 ≥ 1000ms (Sentry 경고)
  - 실패 5xx (Sentry critical)
- **EventLog 발행 (silent fail)**: 분석용. 실패 시 Sentry 가 우선
- **R10 외 추가 의의**: DB 권한·PgBouncer·마이그레이션 health check
- **금지**:
  - GET 메서드 허용 (실행 의도 불명확)
  - Bearer 인증 우회
  - DB 변경 쿼리 (단순 SELECT 1 만)
  - 본 cron 의 결과를 사용자 응답에 사용 (운영용만)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `app/api/cron/supabase-ping/route.ts` 구현
- [ ] CT-API-010 의 verifyCronAuth + 응답 schema 정합
- [ ] GitHub Actions schedule 활성 (월요일 09:00 KST)
- [ ] Sentry 알림 통합 (5xx + 1000ms 초과)
- [ ] EventLog 발행 (silent fail)
- [ ] 응답 시간 p95 ≤ 500ms 측정
- [ ] R10 pause 방지 — 7일 트래픽 0 시나리오 검증
- [ ] PR 본문에 "R10 명시적 방지. warmup 보다 빈도 낮지만 항상 보장" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-010 (Cron Contract — verifyCronAuth + 응답 schema)
  - IF-VC-001 (Vercel + 환경변수)
  - IF-SUP-001 (Supabase)
  - IF-CRON-001 (warmup 패턴 — 동일 인증 정책)
- **Blocks**:
  - R10 (Supabase pause) 방지 보장
  - Stage 0 Alpha 환경의 안정 운영
- **Related**:
  - IF-CRON-001 (warmup — 빈도 5분, 본 태스크는 주 1회)
  - D-TIER #1 (Supabase Free 한도)
