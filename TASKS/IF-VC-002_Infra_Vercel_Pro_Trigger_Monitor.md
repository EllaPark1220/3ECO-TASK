# [Infra] IF-VC-002: Vercel Pro 전환 트리거 — D-TIER 5건 모니터링 + 자동 알림

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Infra] IF-VC-002: Vercel Hobby → Pro 전환 트리거 모니터링 — D-TIER 5건 (Functions·MAU·메일·라이선스·RPO) 임계값 알림"
labels: 'infra, vercel, monitoring, cost, tier-upgrade, priority:medium, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-VC-002] Vercel Hobby → Pro 전환 트리거 — D-TIER 5건 임계값 모니터링 + 자동 알림
- **목적**: §1.5.1.2 D-TIER (Vercel Hobby + Supabase Free 출발) 의 Pro 전환 시점을 사전에 감지하여, 한도 초과로 인한 서비스 중단을 방지한다. 5가지 트리거 (Functions 100K, MAU 1,000, 메일 2,500/월, 라이선스 수익 실현, RPO/RTO 위반) 중 하나라도 80% 도달 시 운영자에게 자동 알림하여 Pro 전환 검토를 유도한다. R8 (Vercel Hobby 비영리 정책) 준수의 자동 거버넌스.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-TIER (Vercel Hobby + Supabase Free), 5건 트리거 정의
  - `/docs/SRS_V0_9.md#6.6` — R8 (Vercel Hobby 비영리 정책 — 수익 시 Pro 전환 의무)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-07 (월 0~10만원 비용 유지)
  - `/docs/SRS_V0_9.md#4.2.2` — REQ-NF-011 (RPO 24h), REQ-NF-012 (RTO ≤ 4h)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-023 (월 인프라 0~10만원)
- 외부 문서:
  - Vercel Pricing: `https://vercel.com/pricing`
  - Vercel Usage API: `https://vercel.com/docs/rest-api/endpoints/usage`
  - Supabase Free Limits: `https://supabase.com/pricing`
- 선행: NF-OBS-001 (Sentry — 알림 인프라)
- 짝: NF-RISK-005 (R8 Vercel Hobby non-commercial — 수익 시점 Pro 전환)

## :white_check_mark: Task Breakdown (실행 계획)

### D-TIER 5건 트리거 정의
- [ ] **트리거 목록 + 임계값 정의** — `lib/monitoring/tierTriggers.ts`:
  ```ts
  export interface TierTrigger {
    id: string;
    name: string;
    metric: string;
    hobbyLimit: number;
    warningThreshold: number; // 80%
    criticalThreshold: number; // 95%
    unit: string;
    checkMethod: 'api' | 'db_query' | 'manual';
  }

  export const TIER_TRIGGERS: TierTrigger[] = [
    {
      id: 'T1_FUNCTIONS',
      name: 'Vercel Functions Invocations',
      metric: 'functions_invocations',
      hobbyLimit: 100_000, // 월 100K
      warningThreshold: 80_000, // 80%
      criticalThreshold: 95_000, // 95%
      unit: 'invocations/month',
      checkMethod: 'api', // Vercel Usage API
    },
    {
      id: 'T2_MAU',
      name: 'Monthly Active Users',
      metric: 'mau',
      hobbyLimit: 1_000,
      warningThreshold: 800,
      criticalThreshold: 950,
      unit: 'users/month',
      checkMethod: 'db_query', // Supabase auth.users COUNT
    },
    {
      id: 'T3_EMAIL',
      name: 'Resend Monthly Emails',
      metric: 'emails_sent',
      hobbyLimit: 3_000, // Resend Free 월 3,000
      warningThreshold: 2_400,
      criticalThreshold: 2_850,
      unit: 'emails/month',
      checkMethod: 'api', // Resend API usage
    },
    {
      id: 'T4_REVENUE',
      name: 'License Revenue Realized',
      metric: 'revenue_realized',
      hobbyLimit: 0, // 수익 0 = Hobby 유지 가능
      warningThreshold: 1, // 수익 1원이라도 → 전환 의무
      criticalThreshold: 1,
      unit: 'KRW',
      checkMethod: 'manual', // 수동 체크
    },
    {
      id: 'T5_RPO_RTO',
      name: 'RPO/RTO Violation',
      metric: 'rpo_rto_violation',
      hobbyLimit: 0, // 위반 0
      warningThreshold: 1, // 1회 위반 시 경고
      criticalThreshold: 1,
      unit: 'violations',
      checkMethod: 'db_query', // EventLog 에서 복구 시간 계산
    },
  ];
  ```

### 모니터링 체크 구현
- [ ] **Vercel Usage API 조회** — `lib/monitoring/vercelUsage.ts`:
  ```ts
  export async function getVercelUsage(): Promise<{ functionsInvocations: number; bandwidth: number }> {
    const res = await fetch('https://api.vercel.com/v1/usage', {
      headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` },
    });
    const data = await res.json();
    return {
      functionsInvocations: data.metrics?.functionInvocations ?? 0,
      bandwidth: data.metrics?.bandwidth ?? 0,
    };
  }
  ```
- [ ] **MAU 카운트** — Supabase DB 쿼리:
  ```sql
  SELECT COUNT(DISTINCT user_id) AS mau
  FROM event_logs
  WHERE timestamp >= DATE_TRUNC('month', NOW())
    AND event_name IN ('page.view', 'lesson.started', 'ox.submitted');
  ```
- [ ] **Resend Usage API 조회**:
  ```ts
  export async function getResendUsage(): Promise<number> {
    const res = await fetch('https://api.resend.com/usage', {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    const data = await res.json();
    return data.emails_sent_this_month ?? 0;
  }
  ```
- [ ] **RPO/RTO 위반 감지** — EventLog 기반:
  ```sql
  SELECT COUNT(*) AS violations
  FROM event_logs
  WHERE event_name = 'system.outage'
    AND (payload->>'recovery_time_hours')::int > 4; -- RTO 4h 초과
  ```

### Cron 기반 자동 체크
- [ ] **일간 체크 Cron** — `/api/cron/tier-check` (Vercel Cron 또는 IF-CRON-001 확장):
  ```ts
  // app/api/cron/tier-check/route.ts
  import { TIER_TRIGGERS } from '@/lib/monitoring/tierTriggers';
  import { getVercelUsage } from '@/lib/monitoring/vercelUsage';
  import * as Sentry from '@sentry/nextjs';

  export async function GET(req: Request) {
    // Cron 토큰 인증
    if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    const results = await checkAllTriggers();

    for (const result of results) {
      if (result.level === 'critical') {
        // Sev2 알림
        Sentry.captureMessage(`D-TIER Critical: ${result.trigger.name} at ${result.current}/${result.trigger.hobbyLimit}`, 'error');
        await sendAlertEmail(result);
      } else if (result.level === 'warning') {
        // Sev3 알림
        Sentry.captureMessage(`D-TIER Warning: ${result.trigger.name} at ${result.current}/${result.trigger.hobbyLimit}`, 'warning');
      }
    }

    return Response.json({ checked: results.length, alerts: results.filter(r => r.level !== 'ok').length });
  }
  ```
- [ ] **Vercel Cron 등록** — `vercel.json`:
  ```json
  {
    "crons": [
      {
        "path": "/api/cron/tier-check",
        "schedule": "0 9 * * *"
      }
    ]
  }
  ```

### 알림 채널
- [ ] **이메일 알림** — Resend (IF-RES-001 활용):
  - Subject: `[3ECO] D-TIER 경고: {trigger_name} {current}/{limit} ({pct}%)`
  - Body: 현재 사용량, 한도, 권장 액션 (Pro 전환 검토)
- [ ] **Sentry 알림** — 커스텀 이벤트:
  - Warning (80%): Sev3 (24h 리뷰)
  - Critical (95%): Sev2 (1시간 응답)
- [ ] **EventLog 기록** — `tier.threshold_warning` / `tier.threshold_critical`

### 운영 대시보드 통합
- [ ] **FR-KPI-009 에 D-TIER 상태 카드 추가**:
  - 5개 트리거별 현재값 / 한도 / % 표시
  - 게이지 차트 (초록 → 노랑 → 빨강)
  - 마지막 체크 시각

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: Functions 80% 도달 — Warning 알림
- **Given**: Vercel Functions invocations = 80,000/월
- **When**: 일간 tier-check cron 실행
- **Then**: Sentry Warning 이벤트 + 이메일 알림 "Functions 80,000/100,000 (80%)"

### Scenario 2: Functions 95% 도달 — Critical 알림
- **Given**: Functions invocations = 95,000/월
- **When**: tier-check 실행
- **Then**: Sentry Error 이벤트 (Sev2) + 이메일 알림 + EventLog `tier.threshold_critical`

### Scenario 3: MAU 800 도달 — Warning
- **Given**: 월간 고유 사용자 800명
- **When**: tier-check 실행
- **Then**: MAU Warning 알림. Pro 전환 검토 권장

### Scenario 4: 라이선스 수익 발생 — 즉시 전환 의무 (R8)
- **Given**: 라이선스 수익 1원 이상 실현
- **When**: 수동 체크 또는 정기 리뷰
- **Then**: Critical 알림. "Vercel Hobby 비영리 정책 위반 — 즉시 Pro 전환 필요"

### Scenario 5: RPO 위반 감지
- **Given**: 백업 실패로 RPO 24h 초과
- **When**: EventLog 에 `system.outage` 기록 (recovery_time > 24h)
- **Then**: RPO/RTO Critical 알림. Pro 전환 + 백업 인프라 강화 권장

### Scenario 6: 모든 트리거 정상 — 알림 없음
- **Given**: 5개 트리거 모두 80% 미만
- **When**: tier-check 실행
- **Then**: 알림 0건. EventLog 에 `tier.check_ok` 기록

### Scenario 7: 대시보드 — 5개 트리거 시각화
- **Given**: FR-KPI-009 대시보드
- **When**: D-TIER 상태 카드 확인
- **Then**: 5개 트리거별 게이지 표시. 현재값/한도/% 명확

### Scenario 8: Cron 토큰 인증 — 외부 호출 차단
- **Given**: Cron 토큰 없이 `/api/cron/tier-check` 직접 호출
- **When**: 요청
- **Then**: 401 Unauthorized. 체크 미실행

### Scenario 9: Vercel API 장애 — graceful degradation
- **Given**: Vercel Usage API 5xx
- **When**: tier-check 실행
- **Then**: Functions 트리거 체크 skip + 나머지 4건 정상 체크. Sentry 에 API 장애 기록

### Scenario 10: 월초 리셋 — 카운터 초기화
- **Given**: 월 변경 (예: 4월 → 5월)
- **When**: 5월 1일 tier-check 실행
- **Then**: 모든 월간 카운터 초기화. 알림 없음 (새 달 시작)

## :gear: Technical & Non-Functional Constraints
- **D-TIER 5건 트리거 (§1.5.1.2)**:
  | # | 트리거 | Hobby 한도 | Warning (80%) | Critical (95%) |
  |---|---|---|---|---|
  | T1 | Functions Invocations | 100K/월 | 80K | 95K |
  | T2 | MAU (Monthly Active Users) | 1,000 | 800 | 950 |
  | T3 | Resend Emails | 3,000/월 | 2,400 | 2,850 |
  | T4 | 라이선스 수익 실현 | ₩0 | ₩1+ | ₩1+ |
  | T5 | RPO/RTO 위반 | 0건 | 1건 | 1건 |
- **체크 빈도**: 일 1회 (09:00 KST). MVP 단계에서 충분. 트래픽 급증 시 6시간 간격 전환 가능
- **알림 채널 우선순위**: Sentry → 이메일 (Resend) → Slack (미래)
- **비용 영향**:
  - Vercel Pro: 월 $20 (~₩27,000)
  - Supabase Pro: 월 $25 (~₩34,000)
  - 합계: 월 ~₩61,000 (CON-07 한도 ₩100,000 이내)
- **R8 준수**: 라이선스 수익 실현 시점에 Pro 전환 의무 (Vercel Hobby 비영리 제한)
- **Vercel API 인증**: `VERCEL_API_TOKEN` 환경변수 (Bearer Token)
- **금지**:
  - 한도 초과 후 서비스 중단 방치 (사전 알림 필수)
  - 수익 발생 후 Hobby 유지 (R8 위반 → 계정 정지 위험)
  - 알림 무시 (Critical 은 반드시 24h 내 검토)
  - tier-check Cron 비활성화

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/monitoring/tierTriggers.ts` — 5건 트리거 정의
- [ ] `lib/monitoring/vercelUsage.ts` — Vercel Usage API 조회
- [ ] `/api/cron/tier-check` — 일간 Cron Route Handler
- [ ] `vercel.json` Cron 등록 (매일 09:00 KST)
- [ ] Sentry Warning/Error 이벤트 발행
- [ ] 이메일 알림 (Resend) — Warning/Critical 분리
- [ ] EventLog `tier.threshold_warning` / `tier.threshold_critical` 발행
- [ ] FR-KPI-009 대시보드에 D-TIER 상태 카드 (5개 트리거 게이지)
- [ ] Cron 토큰 인증 검증
- [ ] PR 본문에 "D-TIER 5건 트리거 자동 모니터링. R8 비영리 정책 거버넌스" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - NF-OBS-001 (Sentry — 알림 인프라)
  - IF-VC-001 (Vercel 프로젝트 — Usage API 대상)
  - IF-SUP-001 (Supabase — MAU 쿼리)
  - IF-RES-001 (Resend — 이메일 알림 + 사용량 API)
  - CT-DB-009 (EventLog — 이벤트 기록)
  - IF-CRON-001 (Cron 인프라 — 또는 별도 Cron 등록)
- **Blocks**:
  - NF-RISK-005 (R8 Vercel Hobby non-commercial — 본 모니터링 활용)
  - IF-SUP-002 (Supabase Pro 전환 — MAU 1K 트리거와 연동)
- **Related**:
  - §1.5.1.2 D-TIER (전환 트리거 5건)
  - §6.6 R8 (Vercel Hobby 비영리)
  - CON-07 (월 비용 0~10만원)
  - REQ-NF-023 (인프라 비용 모니터링)
