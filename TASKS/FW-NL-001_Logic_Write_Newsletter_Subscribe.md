# [Feature] FW-NL-001: Newsletter 구독 Route Handler — 더블 옵트인 토큰 발행 + Resend 메일 발송 + 확인 라우트

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-NL-001: POST /api/newsletter/subscribe + GET /api/newsletter/confirm 본체 — 더블 옵트인 + UUID 토큰 + Resend 발송 + Sentry silent fail"
labels: 'feature, backend, newsletter, write, priority:medium, mvp-soft, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-NL-001] CT-API-009 의 Contract 를 구현하는 Route Handler 본체 — UUID 토큰 발급 + Resend 확인 메일 발송 + GET confirm 으로 토큰 검증 및 status 갱신 + 정통법 동의 기록
- **목적**: 한국 정통법 (정보통신망법) 광고성 정보 수신 동의 정합 + REQ-NF-014 (PII 최소) + REQ-FUNC-039 (선택 구독). Public Pilot 진입 후 활성. **MVP-SOFT** — Alpha·Private Beta 단계는 미사용, Closed Beta 또는 Public Pilot 진입 시점부터 활성.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.7` — REQ-FUNC-039 (선택 구독)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-014 (PII 최소)
  - `/docs/SRS_V0_9.md#3.1` — Resend 외부 시스템
- 한국 정통법: 광고성 정보 수신 동의 + 언서브스크라이브 의무
- 선행: CT-API-009 (Contract), IF-RES-001 (Resend), CT-API-001 (응답 포맷)
- 짝: CT-API-009 (Contract)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/newsletter/subscribe/route.ts` Route Handler (POST)
- [ ] `app/api/newsletter/confirm/route.ts` Route Handler (GET)
- [ ] **NewsletterSubscriber 모델 마이그레이션 (CT-API-009 와 통합 PR)**:
  ```prisma
  model NewsletterSubscriber {
    id                String    @id @default(uuid())
    email             String    @unique
    status            String    @default("pending")  // pending | confirmed | unsubscribed
    confirmationToken String?   @unique
    tokenExpiresAt    DateTime?
    confirmedAt       DateTime?
    unsubscribedAt    DateTime?
    consentTerms      Boolean   @default(true)
    consentMarketing  Boolean   @default(true)
    createdAt         DateTime  @default(now())
    updatedAt         DateTime  @updatedAt

    @@index([status])
    @@index([confirmationToken])
  }
  ```
- [ ] **POST /api/newsletter/subscribe 본체**:
  ```ts
  import { NewsletterSubscribeRequestSchema, NewsletterSubscribeResponseSchema } from '@/lib/contracts/newsletter';
  import { enforceRateLimit } from '@/lib/api/rate-limit';
  import { resend } from '@/lib/email/client';
  import { NewsletterConfirmationEmail } from '@/lib/email/templates/newsletterConfirmation';
  import { render } from '@react-email/render';
  import crypto from 'node:crypto';

  export async function POST(req: Request) {
    const requestId = crypto.randomUUID();

    // 1. Rate Limit (분당 5 req per IP)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
    try {
      await enforceRateLimit(`nl:${ip}`, 'newsletter');  // 별도 limiter
    } catch (e) {
      return makeErrorResponse('RATE_LIMIT_EXCEEDED', requestId);
    }

    // 2. Zod 검증
    const body = await req.json();
    const parsed = NewsletterSubscribeRequestSchema.safeParse(body);
    if (!parsed.success) {
      const code = parsed.error.issues[0].path[0];
      // ... 에러 코드 매핑
      return makeErrorResponse('INVALID_EMAIL', requestId, { issues: parsed.error.issues });
    }
    const { email, consent_terms, consent_marketing } = parsed.data;

    // 3. 기존 구독자 확인
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
    if (existing?.status === 'confirmed') {
      return makeErrorResponse('ALREADY_SUBSCRIBED', requestId);
    }

    // 4. 토큰 생성 (24시간 유효)
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 5. UPSERT — pending 또는 신규
    await prisma.newsletterSubscriber.upsert({
      where: { email },
      create: {
        email, status: 'pending',
        confirmationToken: token,
        tokenExpiresAt: expiresAt,
        consentTerms: consent_terms,
        consentMarketing: consent_marketing,
      },
      update: {
        confirmationToken: token,
        tokenExpiresAt: expiresAt,
        // 재요청 시 동의 갱신 (정통법 — 사용자 의사 확인)
        consentTerms: consent_terms,
        consentMarketing: consent_marketing,
      },
    });

    // 6. 확인 메일 발송 (silent fail)
    try {
      const confirmUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/newsletter/confirm?token=${token}`;
      const html = await render(NewsletterConfirmationEmail({ confirmUrl }));
      await resend.emails.send({
        from: 'no-reply@economic-judgment.app',  // Public Pilot 시점 자체 도메인
        to: email,
        subject: '경제 판단력 교과서 — 뉴스레터 구독 확인',
        html,
      });
    } catch (e) {
      // silent fail — Sentry 알림 + 호출자는 정상 응답
      console.error('Newsletter confirm email failed:', e);
    }

    return NextResponse.json({
      ok: true,
      status: 'pending_confirmation',
      confirmation_email_sent: true,
      expires_at: expiresAt.toISOString(),
    });
  }
  ```
- [ ] **GET /api/newsletter/confirm 본체**:
  ```ts
  export async function GET(req: Request) {
    const requestId = crypto.randomUUID();
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    const parsed = NewsletterConfirmQuerySchema.safeParse({ token });
    if (!parsed.success) {
      return makeErrorResponse('INVALID_TOKEN', requestId);
    }

    // 토큰 조회
    const subscriber = await prisma.newsletterSubscriber.findUnique({
      where: { confirmationToken: parsed.data.token },
    });

    if (!subscriber) {
      return makeErrorResponse('INVALID_TOKEN', requestId);
    }

    // 만료 확인
    if (!subscriber.tokenExpiresAt || subscriber.tokenExpiresAt < new Date()) {
      return makeErrorResponse('TOKEN_EXPIRED', requestId);
    }

    // status 갱신
    await prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: {
        status: 'confirmed',
        confirmedAt: new Date(),
        confirmationToken: null,  // 재사용 방지
        tokenExpiresAt: null,
      },
    });

    // 성공 페이지로 리디렉트 또는 JSON 응답
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/newsletter/confirmed`);
  }
  ```
- [ ] **확인 메일 템플릿 (`lib/email/templates/newsletterConfirmation.tsx`)** — IF-RES-001 의 React Email 활용:
  ```tsx
  import { Html, Body, Heading, Text, Button, Section, Hr } from '@react-email/components';

  export function NewsletterConfirmationEmail({ confirmUrl }: { confirmUrl: string }) {
    return (
      <Html>
        <Body>
          <Heading>뉴스레터 구독 확인</Heading>
          <Text>경제 판단력 교과서 뉴스레터를 구독해 주셔서 감사합니다.</Text>
          <Text>아래 버튼을 클릭하여 구독을 완료해 주세요. 토큰은 24시간 동안 유효합니다.</Text>
          <Section>
            <Button href={confirmUrl}>구독 확인</Button>
          </Section>
          <Hr />
          <Text style={{ fontSize: '12px', color: '#888' }}>
            본 메일은 정보통신망법에 따라 광고성 정보 수신 동의에 의해 발송됩니다.
            구독을 원하지 않으시면 본 메일을 무시하면 됩니다 (24시간 후 토큰 만료).
          </Text>
        </Body>
      </Html>
    );
  }
  ```
- [ ] **언서브스크라이브 후속 안내** — 본 태스크는 subscribe + confirm 만. unsubscribe 는 별도 후속:
  - 모든 발송 메일 푸터에 unsubscribe 링크 (정통법 의무)
  - `GET /api/newsletter/unsubscribe?token=<uuid>` — 별도 발행
- [ ] **EventLog 발행 (silent fail)**:
  - `newsletter.subscribe_requested` (POST 성공 시)
  - `newsletter.confirmed` (GET confirm 성공 시)
  - `newsletter.confirmation_failed` (이메일 발송 실패 시)
- [ ] **OpenAPI 명세 갱신** (CT-API-009 와 정합)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 구독 → 확인 → 활성화
- **Given**: 신규 이메일
- **When**: POST 정상 + GET confirm
- **Then**: status: 'confirmed' + confirmedAt 설정. 메일 발송 + EventLog 2건

### Scenario 2: 잘못된 이메일 — 400
- **Given**: 데이터
- **When**: POST {email: 'invalid'}
- **Then**: 400 + `INVALID_EMAIL`

### Scenario 3: 약관 미동의 — 400
- **Given**: consent_terms: false
- **When**: POST
- **Then**: 400 + `TERMS_CONSENT_REQUIRED`

### Scenario 4: 이미 confirmed — 409
- **Given**: 기존 confirmed 사용자
- **When**: 재요청
- **Then**: 409 + `ALREADY_SUBSCRIBED`

### Scenario 5: pending 사용자 재요청 — 새 토큰
- **Given**: pending 상태 + 토큰 만료 직전
- **When**: POST 재요청
- **Then**: 200 + 새 토큰 + 새 메일. 기존 토큰 무효화

### Scenario 6: 확인 토큰 만료 — 401
- **Given**: 24h 경과 토큰
- **When**: GET confirm
- **Then**: 401 + `TOKEN_EXPIRED`

### Scenario 7: 잘못된 토큰 — 401
- **Given**: 무효한 UUID
- **When**: GET confirm
- **Then**: 401 + `INVALID_TOKEN`

### Scenario 8: Resend 발송 실패 — silent fail
- **Given**: Resend API 5xx
- **When**: POST 호출
- **Then**: 200 + DB INSERT 정상. Sentry 알림. 사용자 무인지

### Scenario 9: Rate Limit — 분당 5 req
- **Given**: 동일 IP 분당 5 req
- **When**: 6번째 호출
- **Then**: 429 + `RATE_LIMIT_EXCEEDED`

### Scenario 10: 이메일 정규화
- **Given**: '  USER@EXAMPLE.COM  '
- **When**: POST
- **Then**: DB 에 'user@example.com' 저장. 동일 이메일 대소문자 차이 중복 0

## :gear: Technical & Non-Functional Constraints
- **CT-API-009 Contract 정합**: Zod schema · 응답 포맷 · 에러 코드 모두 Contract 와 일치
- **silent fail 메일 발송**: 발송 실패가 메인 로직 영향 0. Sentry 알림으로 운영자 인지
- **upsert 정책**: pending 상태 재요청 시 새 토큰 발급 (이전 무효화)
- **언서브스크라이브 의무 (정통법)**: 모든 발송 메일 푸터 링크 (별도 후속)
- **이메일 정규화**: lowercase + trim. 중복 방지
- **Rate Limit 분당 5 req per IP**: CT-API-001 의 별도 limiter (`newsletter`)
- **응답 시간**: p95 ≤ 500ms (DB INSERT + Resend 발송)
- **EventLog 발행 (silent fail)**: 분석·KPI 활용
- **PII 최소**: 이메일만 저장. 추가 PII 0
- **메일 본문 한국어 + 차분한 톤 (CON-05)**
- **금지**:
  - 단일 옵트인
  - 광고성 정보 동의 미체크
  - 토큰 무한 유효
  - dangerouslySetInnerHTML 사용
  - 후킹 표현 메일

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] subscribe + confirm Route Handler 본체 구현
- [ ] NewsletterSubscriber 모델 마이그레이션
- [ ] 확인 메일 템플릿 (React Email)
- [ ] silent fail 정책 (Sentry 알림 + 정상 응답)
- [ ] EventLog 3종 발행
- [ ] Rate Limit 분당 5 req per IP
- [ ] 이메일 정규화 + 중복 방지
- [ ] 응답 시간 p95 ≤ 500ms 측정
- [ ] OpenAPI 명세 갱신
- [ ] PR 본문에 "정통법 더블 옵트인 + Resend 통합" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-009 (Newsletter Subscribe Contract)
  - CT-API-001 (응답 포맷 + Rate Limit)
  - IF-RES-001 (Resend SDK + 메일 템플릿)
- **Blocks**:
  - 언서브스크라이브 후속 (`/api/newsletter/unsubscribe`)
  - Newsletter 발송 자동화 (별도 후속)
  - Public Pilot 의 뉴스레터 활성
- **Related**:
  - REQ-NF-014 (PII 최소)
  - REQ-FUNC-039 (선택 구독)
  - 정통법 광고성 정보 동의
