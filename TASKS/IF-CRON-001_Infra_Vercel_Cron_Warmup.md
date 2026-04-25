# [Infra] IF-CRON-001: Vercel Cron 5분 간격 warmup + Supabase keepalive

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Infra] IF-CRON-001: Vercel Cron 5분 간격 /api/cron/warmup → Functions warm + Supabase pause 회피"
labels: 'infra, vercel, cron, performance, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-CRON-001] `vercel.json` 의 cron 설정으로 `/api/cron/warmup` 라우트를 5분 간격 자동 호출 — Vercel Functions cold start 완화 + Supabase Free pause 회피
- **목적**: R9 (Vercel Functions cold start) + R10 (Supabase Free pause — 7일 무활동 시 자동 정지) 의 핵심 완화 메커니즘. PDF 다운로드 (FR-PDF-001) 의 cold start p95 ≤ 5초 유지 + 한밤중·새벽 사용자 0인 시점에도 Supabase 인스턴스 정상 유지. CRON_SECRET 으로 보호하여 외부 트리거 차단.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.6` — R9 (cold start), R10 (Supabase pause)
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-TIER (Free 한도 운영)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-004 (PDF p95 ≤2초 — warm 상태 기준)
- 외부 문서: `https://vercel.com/docs/cron-jobs`
- 선행: IF-VC-001 (Vercel), IF-SUP-001 (Supabase)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **`vercel.json` 의 crons 정의**:
  ```json
  {
    "crons": [
      {
        "path": "/api/cron/warmup",
        "schedule": "*/5 * * * *"
      }
    ]
  }
  ```
- [ ] **Vercel Hobby cron 한도 인지**:
  - Hobby 플랜 — 일일 cron 호출 한도 (정확한 수치 Vercel 문서 확인. 약 100회/일 이상 사용 가능 추정)
  - 5분 간격 → 일 288회. Hobby 한도 내
  - Pro 플랜은 더 자주 가능 (1분 간격까지)
- [ ] **`/api/cron/warmup` Route Handler 구현**:
  ```ts
  // app/api/cron/warmup/route.ts
  import { NextRequest, NextResponse } from 'next/server';
  import { prisma } from '@/lib/db';

  export async function GET(req: NextRequest) {
    // CRON_SECRET 검증 — Vercel cron 만 허용
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const checks: Record<string, unknown> = {};
    const startedAt = Date.now();

    try {
      // 1. Supabase DB keepalive — 가벼운 SELECT
      await prisma.$queryRaw`SELECT 1`;
      checks.db = 'ok';

      // 2. PDF Renderer warmup (선택) — 더미 PDF 생성 시도
      // 본 단계는 Functions 번들 크기·메모리 사용 고려. Alpha 단계는 skip 가능
      // checks.pdf = await warmupPdfRenderer();

      // 3. 핵심 라우트 hit (선택) — fetch 자체 호스트
      // 단 self-fetch 는 Vercel cold start 회피 효과 약함. DB 쿼리가 핵심

      const elapsed = Date.now() - startedAt;
      return NextResponse.json({ ok: true, elapsed_ms: elapsed, checks });
    } catch (error) {
      console.error('warmup failed:', error);
      // Sentry 알림 (선택)
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }
  }
  ```
- [ ] **CRON_SECRET 환경변수 등록**:
  - Vercel 환경변수에 `CRON_SECRET=...` 추가 (모든 환경)
  - Vercel 의 native cron 은 자동으로 `Authorization: Bearer {CRON_SECRET}` 헤더 첨부
  - 외부 트리거 (cron-job.org 등) 와의 차이 명확화 — 본 태스크는 Vercel native cron 만 사용
- [ ] **PDF Renderer warmup 정책 (Alpha vs Closed Beta)**:
  - Alpha 단계: DB keepalive 만 (단순)
  - Closed Beta 이후: PDF Renderer 가 cold 일 때 더미 PDF 생성으로 사전 warmup (FR-PDF-001 의 cold start 완화)
- [ ] **본 라우트가 hit 하는 대상**:
  - **DB (Supabase)** — 핵심. R10 pause 회피
  - **Functions (Vercel)** — cron 자체가 Functions 라 본 라우트 호출이 다른 Functions 도 warm 유지에 간접 기여
  - 단 다른 Functions (예: PDF, OX 채점) 의 직접 warmup 은 별도 self-fetch 가 필요. 본 태스크는 단순화 채택
- [ ] **모니터링**:
  - 응답 로그 — Vercel Logs 에 `elapsed_ms` 추적
  - 실패 시 Sentry 알림 (NF-OBS-001 와 정합)
  - 5xx 비율 모니터링 — Supabase pause 감지의 시그널
- [ ] **타임존 정책**:
  - schedule `*/5 * * * *` 는 UTC 기준
  - 한국 시간 영향 없음 (5분 간격이라)
- [ ] **테스트**:
  - Local: `vercel dev` 환경에서 cron 자동 실행 안됨. 수동 호출로 테스트
  - Production 배포 후 Vercel Dashboard 의 Cron Jobs 페이지에서 다음 실행 시각 확인
- [ ] **헬스체크 통합** — 본 라우트 자체가 일종의 헬스체크. 별도 `/api/health` 라우트와 정합

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: Vercel Cron 자동 실행
- **Given**: Production 배포 + vercel.json 의 cron 등록
- **When**: 5분 경과
- **Then**: `/api/cron/warmup` 자동 호출. Vercel Logs 에 200 응답 기록

### Scenario 2: CRON_SECRET 검증
- **Given**: 외부 사용자가 직접 호출 시도 (`Authorization` 헤더 없거나 잘못됨)
- **When**: GET 요청
- **Then**: 401 + `UNAUTHORIZED`. Vercel 의 native cron 만 정상 응답

### Scenario 3: DB keepalive 정상
- **Given**: Supabase 인스턴스 활성
- **When**: warmup 호출
- **Then**: `SELECT 1` 정상 응답. checks.db === 'ok'

### Scenario 4: Supabase pause 회피 (R10)
- **Given**: 7일 사용자 활동 0 시뮬레이션
- **When**: 본 cron 만 정상 동작
- **Then**: Supabase pause 0건. 8일째 사용자 진입 시 정상 응답

### Scenario 5: Cold start 완화 효과 검증
- **Given**: 본 cron 활성 vs 비활성 비교
- **When**: 사용자 첫 API 호출
- **Then**: cron 활성 시 cold start 발생률 < 10% (warm 유지). 비활성 시 빈번 (≥30%)

### Scenario 6: 응답 시간
- **Given**: warmup 호출
- **When**: 응답 elapsed_ms 측정
- **Then**: ≤ 500ms (DB SELECT 만)

### Scenario 7: 실패 시 Sentry 알림
- **Given**: Supabase 일시 장애
- **When**: warmup 호출 실패
- **Then**: 500 응답 + Sentry 자동 알림. 운영자 즉시 인지

### Scenario 8: Hobby cron 한도 내
- **Given**: 5분 간격 = 일 288회
- **When**: 1주일 운영 후 Vercel Dashboard 확인
- **Then**: cron 호출 한도 내. 다른 cron 추가 여지 있음

### Scenario 9: 다음 실행 시각 노출
- **Given**: Vercel Dashboard 의 Cron Jobs 페이지
- **When**: 확인
- **Then**: 다음 실행 시각 (UTC) 표시. 정상 schedule 적용

### Scenario 10: PDF Renderer warmup 통합 (Closed Beta — 선택)
- **Given**: Closed Beta 단계. PDF Renderer warmup 활성
- **When**: warmup 호출
- **Then**: 더미 PDF 생성. FR-PDF-001 의 cold start p95 ≤ 5초 → ≤ 2초 (warm)

## :gear: Technical & Non-Functional Constraints
- **Vercel native cron 강제**: 외부 cron 서비스 (cron-job.org 등) 사용 금지 — CRON_SECRET 검증의 native 방식이 가장 안전
- **schedule 정책**: `*/5 * * * *` (5분 간격). 더 자주는 Hobby 한도 위험. 더 드물게는 R10 pause 위험
- **CRON_SECRET 보안**:
  - Vercel 환경변수만 (git 커밋 금지)
  - 충분한 엔트로피 (32자 이상 random string)
  - 노출 시 즉시 회전 (rotate)
- **응답 시간 영향**: warmup 호출은 백그라운드. 사용자 UX 영향 0
- **에러 핸들링**: warmup 실패가 비즈니스 로직 영향 0. 단 운영 모니터링은 필수
- **PDF Renderer warmup 정책**: Alpha 는 단순 DB keepalive 만. Closed Beta 이후 PDF warmup 추가 (선택)
- **다중 Region 정책**: Vercel Functions 가 다중 region 배포 시 본 cron 도 region 별 실행. 단 Hobby 는 단일 region
- **Vercel 한도 모니터링**: cron 호출도 Functions invocation 카운트에 포함. 일 288회 × 30일 = 8,640 invocations/월 (한도의 8.6%)
- **금지**:
  - 외부 cron 서비스 (보안 + 비용)
  - schedule 1분 미만 (Hobby 한도 위반)
  - CRON_SECRET 평문 git 커밋
  - warmup 호출에 무거운 작업 (PDF 생성 자체는 별도 분리)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `vercel.json` cron 설정
- [ ] `/api/cron/warmup` Route Handler 구현
- [ ] CRON_SECRET 환경변수 등록 + 검증
- [ ] DB keepalive 정상 동작
- [ ] Supabase pause 회피 효과 검증 (1주일 운영 후)
- [ ] Sentry 실패 알림 통합
- [ ] Vercel Dashboard Cron Jobs 페이지 확인
- [ ] 응답 시간 ≤ 500ms
- [ ] PR 본문에 "R9 (cold start) + R10 (Supabase pause) 의 핵심 완화" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-VC-001 (Vercel)
  - IF-SUP-001 (Supabase — keepalive 대상)
  - CT-DB-001 (Prisma — `$queryRaw` 사용)
- **Blocks**:
  - FW-PDF-001 (PDF Renderer cold start 완화 — 본 cron 의 효과)
  - FR-PDF-001 (PDF 다운로드 — warm 상태 유지)
  - REQ-NF-004 (PDF p95 ≤2초) — warm 가정 충족
  - R9·R10 완화 검증
- **Related**:
  - NF-OBS-001 (Sentry — 실패 알림)
