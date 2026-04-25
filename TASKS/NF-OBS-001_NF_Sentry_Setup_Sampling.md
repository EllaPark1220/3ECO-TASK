# [NF] NF-OBS-001: Sentry Free 통합 + Next.js SDK + 에러 샘플링 정책

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-OBS-001: Sentry Free 통합 — Next.js SDK 설치 + 에러 샘플링 + Performance Tracing + D-TIER 정합"
labels: 'nf, observability, sentry, priority:high, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-OBS-001] Sentry Free 통합 + Next.js SDK + 에러 샘플링 정책
- **목적**: REQ-NF-027~029 (Severity 기반 알림 라우팅) 의 인프라 기반. Sentry Free 플랜(월 5K 이벤트)에 Next.js SDK 를 통합하여 프론트엔드·서버사이드 에러를 자동 수집. 에러 샘플링 정책으로 Free 한도 내에서 운영하며, NF-OBS-002~004 (Severity Router) 의 데이터 소스를 제공.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.2` — REQ-NF-027~029 (Severity 알림)
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-TIER (Sentry Free)
- 외부: `https://docs.sentry.io/platforms/javascript/guides/nextjs/`
- 선행: IF-VC-001 (Vercel 프로젝트)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Sentry 프로젝트 생성**: `sentry.io` → New Project → Next.js
- [ ] **SDK 설치**: `npx @sentry/wizard@latest -i nextjs`
  - `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` 자동 생성
- [ ] **`sentry.client.config.ts`** 설정:
  ```ts
  import * as Sentry from '@sentry/nextjs';
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,        // 성능 트레이스 10% 샘플링
    replaysSessionSampleRate: 0,  // 리플레이 비활성 (Free 한도)
    replaysOnErrorSampleRate: 0.5,// 에러 시 50% 리플레이
    beforeSend(event) {
      // PII 제거
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      return event;
    },
  });
  ```
- [ ] **`sentry.server.config.ts`** 설정:
  ```ts
  import * as Sentry from '@sentry/nextjs';
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.user) delete event.user.email;
      return event;
    },
  });
  ```
- [ ] **`next.config.js`** Sentry 통합:
  ```js
  const { withSentryConfig } = require('@sentry/nextjs');
  module.exports = withSentryConfig(nextConfig, {
    silent: true,
    org: 'economy-textbook',
    project: '3eco-web',
  });
  ```
- [ ] **환경 변수**: `.env.local` + Vercel Dashboard
  ```env
  NEXT_PUBLIC_SENTRY_DSN=https://xxx@oyyy.ingest.sentry.io/zzz
  SENTRY_DSN=https://xxx@oyyy.ingest.sentry.io/zzz
  SENTRY_AUTH_TOKEN=sntrys_xxx
  ```
- [ ] **에러 샘플링 정책** (Free 5K/월 한도):
  | 환경 | 에러 | Traces | 리플레이 |
  |---|---|---|---|
  | Production | 100% | 10% | 에러 50% |
  | Preview | 100% | 0% | 0% |
  | Development | 0% | 0% | 0% |
- [ ] **Source Maps 업로드**: `@sentry/nextjs` 빌드 시 자동
- [ ] **Alert Rules**: Sentry Dashboard → New Alert → 기본 규칙 생성

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 클라이언트 에러 수집
- **Given**: 프론트엔드 `throw new Error('test')` 발생
- **When**: Sentry 대시보드 확인
- **Then**: 이벤트 수신. 스택 트레이스 + Source Map 적용

### Scenario 2: 서버 에러 수집
- **Given**: API Route 500 에러
- **When**: Sentry 확인
- **Then**: 서버 에러 이벤트 수신

### Scenario 3: PII 제거
- **Given**: 에러 이벤트
- **When**: user 필드 확인
- **Then**: email·ip_address 미포함

### Scenario 4: 샘플링 — traces 10%
- **Given**: 100개 트랜잭션
- **When**: Sentry traces 확인
- **Then**: ~10개 트레이스 (±5)

### Scenario 5: 개발 환경 — 이벤트 0건
- **Given**: `NODE_ENV=development`
- **When**: 에러 발생
- **Then**: Sentry 전송 0건

### Scenario 6: Free 한도 모니터링
- **Given**: 월 5K 이벤트 한도
- **When**: 4K 도달
- **Then**: 경고 알림 (Sentry Usage Alerts)

### Scenario 7: Source Map 적용
- **Given**: 프로덕션 에러
- **When**: 스택 트레이스 확인
- **Then**: 원본 TypeScript 소스 위치 표시 (minified 아님)

### Scenario 8: Vercel 환경 변수 설정
- **Given**: Vercel Dashboard
- **When**: Environment Variables 확인
- **Then**: `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` 존재

## :gear: Technical & Non-Functional Constraints
- **Sentry Free**: 월 5K 이벤트, 1 사용자, 30일 보존
- **PII 최소화**: `beforeSend` 에서 email·IP 제거 (REQ-NF-014)
- **번들 영향**: `@sentry/nextjs` ~30KB gzip. Lazy loading 적용
- **금지**: Sentry Pro 구독 (Free 한도 내 운영), PII 전송

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 통과
- [ ] Sentry 프로젝트 + SDK 설치
- [ ] 클라이언트·서버 에러 수집 확인
- [ ] PII 제거 검증
- [ ] 샘플링 정책 적용
- [ ] Source Maps 업로드 확인
- [ ] PR 본문에 "REQ-NF-027~029 Sentry 인프라. Free 5K/월" 명시

## :construction: Dependencies & Blockers
- **Depends on**: IF-VC-001 (Vercel 프로젝트)
- **Blocks**: NF-OBS-002~005 (Severity Router + Error Budget)
- **Related**: REQ-NF-027~029, D-TIER (Sentry Free)
