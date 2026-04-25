# [Feature] NF-RISK-004: 외부 의존성 (R7) — 5개 SaaS 상태 모니터링 + 차단 시 graceful + 마이그레이션 SOP

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] NF-RISK-004: 외부 의존성 모니터링 — Vercel·Supabase·Resend·Gemini·YouTube 5개 SaaS 상태 추적 + graceful + Stage 2 마이그레이션 SOP"
labels: 'nf, risk, dependency, monitoring, sop, priority:critical, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-RISK-004] R7 (외부 의존성) 의 운영 모니터링 — Vercel + Supabase + Resend + Gemini + YouTube 5개 SaaS 의 상태 자동 추적 + 장애 시 graceful 동작 검증 + Stage 2 의 자체 호스팅 마이그레이션 SOP
- **목적**: 본 사이트의 5개 외부 의존성 중 하나라도 장기 장애 시 운영 차단 위험. 정량 모니터링 + 장애 시 graceful (캐시 폴백·silent fail) + 위험 시점에 자체 호스팅 전환 가능한 SOP 보유 → R7 위험 mitigated.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.6` — R7 (외부 의존)
  - `/docs/SRS_V0_9.md#3.1` — External Systems
- 외부:
  - https://www.vercel-status.com/
  - https://status.supabase.com/
  - https://status.resend.com/
- 선행: CT-DB-009 (EventLog), IF-CRON-001 (warmup), IF-CACHE-001 (PDF 캐시), TS-IT-006 (PDF 5xx 카오스)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **5개 외부 SaaS 정의 + 의존도**:
  ```ts
  export const EXTERNAL_DEPENDENCIES = [
    { id: 'vercel', name: 'Vercel', criticality: 'critical', statusUrl: 'https://www.vercel-status.com/api/v2/status.json', migrationOption: 'Self-hosted Next.js on Railway/Fly' },
    { id: 'supabase', name: 'Supabase', criticality: 'critical', statusUrl: 'https://status.supabase.com/api/v2/status.json', migrationOption: 'Self-hosted PostgreSQL + Auth (Lucia)' },
    { id: 'resend', name: 'Resend', criticality: 'high', statusUrl: 'https://resend.statuspage.io/api/v2/status.json', migrationOption: 'AWS SES 또는 Mailgun' },
    { id: 'gemini', name: 'Google Gemini', criticality: 'medium', statusUrl: 'https://status.cloud.google.com/incidents.json', migrationOption: 'Anthropic Claude API 또는 OpenAI' },
    { id: 'youtube', name: 'YouTube (영상 호스팅)', criticality: 'critical', statusUrl: null, migrationOption: 'Cloudflare Stream 또는 Mux' },  // 공식 status API 없음
  ];
  ```
- [ ] **상태 추적 cron — `/api/cron/dependency-status`** (매 30분):
  ```ts
  export async function POST(req: Request) {
    if (!verifyCronAuth(req)) return new Response('Unauthorized', { status: 401 });

    const results = [];
    for (const dep of EXTERNAL_DEPENDENCIES) {
      if (!dep.statusUrl) {
        // YouTube 등 — 자체 ping (영상 페이지 fetch)
        results.push(await checkYouTubeAvailability());
        continue;
      }
      try {
        const response = await fetch(dep.statusUrl, { signal: AbortSignal.timeout(5000) });
        const data = await response.json();
        const status = data.status?.indicator ?? 'none';  // 'none' | 'minor' | 'major' | 'critical'
        results.push({ id: dep.id, status, checked_at: new Date().toISOString() });

        if (status === 'major' || status === 'critical') {
          await prisma.eventLog.create({
            data: { event: 'dependency.degraded', payload: { id: dep.id, status, criticality: dep.criticality } },
          });
          // Sentry 즉시 알림 (criticality high 이상)
          if (dep.criticality === 'critical' || dep.criticality === 'high') {
            // Sentry.captureMessage(`${dep.name} 장애 — ${status}`, { level: 'error' });
          }
        }
      } catch (e) {
        results.push({ id: dep.id, status: 'unreachable', checked_at: new Date().toISOString() });
      }
    }

    return NextResponse.json({ ok: true, results });
  }
  ```
- [ ] **YouTube 자체 ping** — 단일 lesson 의 영상 메타 fetch:
  ```ts
  async function checkYouTubeAvailability(): Promise<{ id: string; status: string; checked_at: string }> {
    try {
      const sample = await prisma.lesson.findFirst({ select: { youtubeVideoId: true } });
      if (!sample) return { id: 'youtube', status: 'unknown', checked_at: new Date().toISOString() };

      const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${sample.youtubeVideoId}&format=json`);
      return {
        id: 'youtube',
        status: response.ok ? 'none' : 'major',
        checked_at: new Date().toISOString(),
      };
    } catch (e) {
      return { id: 'youtube', status: 'unreachable', checked_at: new Date().toISOString() };
    }
  }
  ```
- [ ] **graceful 동작 검증 (TS-IT-006 정합)**:
  - **Vercel** — 본 사이트 자체 down 시 Vercel Edge 의 stale cache 폴백 (제한적)
  - **Supabase** — pg-dump 백업 + DR Restore (IF-CRON-003·004)
  - **Resend** — 메일 발송 silent fail (TS-IT-003 검증)
  - **Gemini** — LLM 검증 nightly 위임 (IF-CI-006)
  - **YouTube** — 글로 읽기 모드 (PRD 원칙 4 의 3매체) 자동 폴백
  - 각 graceful 시나리오는 별도 통합 테스트 (이미 발행된 TS-IT-006 등)
- [ ] **/api/admin/dependency-health** — 운영자 대시보드 응답:
  ```ts
  export async function GET(req: Request) {
    if (await requireRole('ADMIN', req) === false) {
      return new Response('Forbidden', { status: 403 });
    }

    const recent = await prisma.eventLog.findMany({
      where: { event: 'dependency.degraded', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      dependencies: EXTERNAL_DEPENDENCIES.map(dep => ({
        ...dep,
        recent_incidents_24h: recent.filter(e => (e.payload as any).id === dep.id).length,
      })),
      total_incidents_24h: recent.length,
      summary: recent.length === 0 ? '✅ 24시간 내 장애 0' : `⚠️ ${recent.length}건 장애`,
    });
  }
  ```
- [ ] **/admin/dependencies 대시보드 페이지**:
  - 5개 SaaS 카드 (criticality 표시) + 24시간 장애 카운트
  - 마이그레이션 옵션 안내 (장애 누적 시 의사결정 보조)
- [ ] **Stage 2 자체 호스팅 마이그레이션 SOP — `docs/dependency-migration-sop.md`**:
  - 각 SaaS 별 마이그레이션 절차 (Vercel → Railway, Supabase → 자체 PostgreSQL 등)
  - 트리거 조건 — 단일 SaaS 의 90일 누적 장애 ≥ 24시간 또는 비용 한도 초과
  - 본 SOP 는 Stage 2 검토 항목 (Stage 1 에는 모니터링만)
- [ ] **누적 장애 통계 — 90일 윈도**:
  ```ts
  // 90일 누적 장애 시간 계산
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const incidents = await prisma.eventLog.findMany({
    where: { event: 'dependency.degraded', createdAt: { gte: ninetyDaysAgo } },
  });
  // 각 SaaS 별 cumulative downtime
  // 임계 — 24시간 초과 시 마이그레이션 검토 시그널
  ```
- [ ] **응답 시간**: cron 호출 ≤ 30초 (5 SaaS 병렬), 대시보드 ≤ 500ms
- [ ] **PII 부재**: 외부 SaaS 메타만

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 5개 SaaS 정상 — cron 정상 응답
- **Given**: 모든 SaaS 'none' status
- **When**: cron 호출
- **Then**: 200 + results 5건 모두 'none'

### Scenario 2: Vercel 'major' — Sentry 알림 + EventLog
- **Given**: Vercel API 'major' 응답
- **When**: cron
- **Then**: EventLog `dependency.degraded` 1건 + Sentry

### Scenario 3: Supabase 'critical' — 즉시 critical 알림
- **Given**: critical
- **When**: cron
- **Then**: Sentry critical level

### Scenario 4: 외부 API timeout — 'unreachable'
- **Given**: 5초 timeout
- **When**: 호출
- **Then**: status: 'unreachable'

### Scenario 5: YouTube 자체 ping — oembed
- **Given**: 정상
- **When**: 호출
- **Then**: status: 'none'

### Scenario 6: graceful 검증 — Resend 5xx
- **Given**: Resend 장애
- **When**: 메일 발송 시도
- **Then**: silent fail (TS-IT-003 정합)

### Scenario 7: 24시간 누적 장애 카운트
- **Given**: 24h 내 장애 5건
- **When**: GET /api/admin/dependency-health
- **Then**: total_incidents_24h: 5

### Scenario 8: 90일 누적 — 마이그레이션 시그널
- **Given**: 90일 cumulative downtime > 24h
- **When**: 검사
- **Then**: 운영자 알림 + SOP 안내

### Scenario 9: non-ADMIN — 403
- **Given**: LEARNER
- **When**: dependency-health
- **Then**: 403

### Scenario 10: 마이그레이션 SOP 문서
- **Given**: docs/dependency-migration-sop.md
- **When**: 검토
- **Then**: 5 SaaS 절차 + 트리거 조건 명시

## :gear: Technical & Non-Functional Constraints
- **5개 SaaS — criticality 차등**: critical / high / medium
- **30분 cron**: 너무 자주는 부담 + 너무 드물면 인지 지연
- **Sentry 알림 — criticality high 이상만**: 노이즈 최소
- **graceful 검증 — 통합 테스트 (TS-IT-006 등)**
- **YouTube — 자체 ping (oembed)**: 공식 API 부재 보강
- **Stage 2 마이그레이션 SOP — 트리거 조건 명시**: 90일 24시간 또는 비용 한도
- **PII 부재**: 외부 SaaS 메타만
- **응답 시간 — cron ≤ 30초, 대시보드 ≤ 500ms**
- **금지**:
  - 단일 SaaS 에 critical 의존성 (대안 없음 위험)
  - 마이그레이션 SOP 없이 운영 시작
  - 누적 장애 90일 초과 후에도 마이그레이션 미검토

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] EXTERNAL_DEPENDENCIES 5개 정의
- [ ] dependency-status cron Route Handler
- [ ] YouTube 자체 ping
- [ ] /api/admin/dependency-health Route Handler
- [ ] /admin/dependencies 대시보드
- [ ] dependency-migration-sop.md 문서
- [ ] EventLog `dependency.degraded` 발행
- [ ] 응답 시간 측정
- [ ] PR 본문에 "R7 외부 의존성 모니터링 + Stage 2 마이그레이션 SOP" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-009 (EventLog)
  - FR-AUTH-002 (RBAC)
  - IF-RES-001 (Resend)
  - CT-API-010 (Cron 패턴)
  - TS-IT-006 (PDF 5xx 카오스)
- **Blocks**:
  - R7 위험 mitigation
  - Stage 2 마이그레이션 의사결정
- **Related**:
  - IF-CACHE-001 (PDF 캐시 폴백)
  - NF-COST-001~002 (비용 모니터링, 그룹 15)
