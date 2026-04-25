# [Feature] CT-API-009: POST /api/newsletter/subscribe DTO + 더블 옵트인 + 토큰 발급 시그니처

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-API-009: POST /api/newsletter/subscribe Route Handler DTO + 더블 옵트인 (확인 메일 → 클릭 토큰) + Rate Limit 강화"
labels: 'feature, backend, api-spec, newsletter, priority:medium, mvp-soft, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-API-009] `POST /api/newsletter/subscribe` Route Handler 의 Contract — 이메일 입력 + 더블 옵트인 (확인 메일 발송 → 사용자 클릭으로 토큰 검증 → 구독 활성화) + 강화된 Rate Limit (분당 5 req per IP) + 토큰 발급 응답
- **목적**: REQ-FUNC-039 (선택 구독) 의 Contract SSOT. PII 최소 정책 (CON-01) — 이메일만 수집, 결제·주소·실명 0건. 더블 옵트인으로 스팸·악의적 가입 차단 + 한국 정통법 (정보통신망법) 광고성 정보 발송 동의 정합. **MVP-SOFT** — Public Pilot 진입 후 활성.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.1` — `/api/newsletter/subscribe` 엔드포인트
  - `/docs/SRS_V0_9.md#4.1.7` — REQ-FUNC-039 (선택 구독)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-014 (PII 최소), REQ-NF-018 (Rate Limit)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-01 (PII 정책)
- 외부 표준: 정보통신망법 광고성 정보 동의 (한국)
- 선행: CT-API-001 (응답 포맷), IF-RES-001 (Resend), CT-DB-009 (EventLog — 옵션)
- 짝: FW-NL-001 (Logic Write 본체)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/contracts/newsletter.ts` 신규 파일 — Zod + TypeScript SSOT
- [ ] **Request 검증 — 구독 요청**:
  ```ts
  import { z } from 'zod';

  export const NewsletterSubscribeRequestSchema = z.object({
    email: z.string()
      .email('이메일 형식이 올바르지 않습니다')
      .max(254, '이메일은 254자 이하여야 합니다')  // RFC 5321 한도
      .transform(s => s.toLowerCase().trim()),
    consent_terms: z.literal(true, {
      errorMap: () => ({ message: '약관 동의가 필요합니다' }),
    }),
    consent_marketing: z.literal(true, {
      errorMap: () => ({ message: '광고성 정보 수신 동의가 필요합니다 (정통법)' }),
    }),
  });
  export type NewsletterSubscribeRequest = z.infer<typeof NewsletterSubscribeRequestSchema>;
  ```
- [ ] **Response DTO — 토큰 발급 + pending 상태 안내**:
  ```ts
  export const NewsletterSubscribeResponseSchema = z.object({
    ok: z.literal(true),
    status: z.literal('pending_confirmation'),
    confirmation_email_sent: z.boolean(),
    expires_at: z.string(),  // ISO datetime — 토큰 24시간 유효
  });
  export type NewsletterSubscribeResponse = z.infer<typeof NewsletterSubscribeResponseSchema>;
  ```
- [ ] **확인 토큰 검증 엔드포인트 — `GET /api/newsletter/confirm`**:
  ```ts
  export const NewsletterConfirmQuerySchema = z.object({
    token: z.string().uuid(),
  });

  export const NewsletterConfirmResponseSchema = z.object({
    ok: z.literal(true),
    status: z.literal('subscribed'),
    confirmed_at: z.string(),
  });
  ```
- [ ] **더블 옵트인 흐름 정의**:
  1. **Step 1 — 구독 요청**: `POST /api/newsletter/subscribe` → 토큰 생성 + 확인 메일 발송 + DB 에 `status='pending'` 저장
  2. **Step 2 — 사용자 확인**: 메일 링크 클릭 → `GET /api/newsletter/confirm?token=<uuid>` → 토큰 검증 → `status='confirmed'` 갱신
  3. **Step 3 — 발송 가능 상태**: `status='confirmed'` 인 구독자에게만 뉴스레터 발송 가능
- [ ] **NewsletterSubscriber 모델 정의 (CT-DB 후속 또는 본 태스크에서 schema 추가)**:
  ```prisma
  model NewsletterSubscriber {
    id              String   @id @default(uuid())
    email           String   @unique
    status          String   @default("pending")  // pending | confirmed | unsubscribed
    confirmationToken String? @unique
    tokenExpiresAt  DateTime?
    confirmedAt     DateTime?
    unsubscribedAt  DateTime?
    consentTerms    Boolean  @default(true)
    consentMarketing Boolean @default(true)
    createdAt       DateTime @default(now())
  }
  ```
  - **본 태스크는 Contract 만 정의**. 모델 INSERT 는 FW-NL-001 본체 (그룹 2 와 별도 PR 가능)
  - 단 본 태스크 PR 시 모델 정의 포함 권장 (FW-NL-001 와 같은 PR)
- [ ] **Rate Limit 강화 정책 (CT-API-001 의 별도 limiter)**:
  - **본 라우트 — 분당 5 req per IP** (일반 60 req/min 보다 엄격)
  - 악의적 대량 가입 (스팸 봇) 방지
  - CT-API-001 의 `rateLimits.auth` (10 req/min) 보다 더 엄격 검토
- [ ] **확인 메일 정책 (IF-RES-001 통합)**:
  - 발송 — Resend SDK (`resend.emails.send`)
  - 본문 — `lib/email/templates/newsletterConfirmation.tsx`
  - 차분한 톤 (CON-05) — 후킹·축하 표현 부재
  - 한국어
  - 토큰 24시간 유효
- [ ] **에러 응답 (CT-API-001 활용)**:
  - 400 — `INVALID_EMAIL` (Zod 실패)
  - 400 — `TERMS_CONSENT_REQUIRED` (consent_terms=false)
  - 400 — `MARKETING_CONSENT_REQUIRED` (consent_marketing=false, 정통법)
  - 409 — `ALREADY_SUBSCRIBED` (이미 confirmed 상태)
  - 429 — `RATE_LIMIT_EXCEEDED` (분당 5 req per IP)
- [ ] **확인 토큰 만료 정책 — 24시간 후 재발송 가능**:
  - 만료된 토큰 클릭 → 401 + `TOKEN_EXPIRED`
  - 같은 이메일로 재구독 요청 → 새 토큰 발급 + 새 메일 발송
- [ ] **언서브스크라이브 (정통법 의무)** — 본 Contract 의 미래 후속:
  - `GET /api/newsletter/unsubscribe?token=<uuid>` — 별도 발행
  - 모든 발송 메일 푸터에 unsubscribe 링크 의무
- [ ] **OpenAPI 명세 추가**
- [ ] **Mock fixture**:
  ```ts
  export const mockNewsletterSubscribeRequest: NewsletterSubscribeRequest = {
    email: 'user@example.com',
    consent_terms: true,
    consent_marketing: true,
  };
  export const mockNewsletterSubscribeResponse: NewsletterSubscribeResponse = {
    ok: true,
    status: 'pending_confirmation',
    confirmation_email_sent: true,
    expires_at: '2026-04-26T12:00:00Z',
  };
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 구독 요청
- **Given**: 신규 이메일
- **When**: `POST /api/newsletter/subscribe` 정상 페이로드
- **Then**: 200 + `status: 'pending_confirmation'` + 확인 메일 발송. DB 에 status='pending' INSERT

### Scenario 2: 확인 메일 클릭 → 구독 활성화
- **Given**: 위 응답의 토큰
- **When**: `GET /api/newsletter/confirm?token=<uuid>`
- **Then**: 200 + `status: 'subscribed'`. DB 의 status 가 'confirmed' 로 갱신

### Scenario 3: 잘못된 이메일 — 400
- **Given**: 데이터
- **When**: email: 'not-an-email'
- **Then**: 400 + `INVALID_EMAIL`

### Scenario 4: 약관 미동의 — 400
- **Given**: consent_terms: false
- **When**: 호출
- **Then**: 400 + `TERMS_CONSENT_REQUIRED`

### Scenario 5: 광고성 정보 동의 누락 — 400 (정통법)
- **Given**: consent_marketing: false
- **When**: 호출
- **Then**: 400 + `MARKETING_CONSENT_REQUIRED`

### Scenario 6: 이미 confirmed 상태 — 409
- **Given**: 동일 이메일이 이미 confirmed
- **When**: 재구독 시도
- **Then**: 409 + `ALREADY_SUBSCRIBED`. DB 변경 0

### Scenario 7: pending 상태 재요청 — 새 토큰 발급
- **Given**: 동일 이메일이 pending (24h 만료 직전)
- **When**: 재요청
- **Then**: 200 + 새 토큰 발급 + 새 확인 메일 발송. 기존 토큰 무효화

### Scenario 8: 토큰 만료 후 클릭 — 401
- **Given**: 24시간 경과한 토큰
- **When**: `GET /api/newsletter/confirm?token=<expired>`
- **Then**: 401 + `TOKEN_EXPIRED`

### Scenario 9: Rate Limit — 분당 5 req
- **Given**: 동일 IP 분당 5 req 도달
- **When**: 6번째 호출
- **Then**: 429 + `RATE_LIMIT_EXCEEDED`

### Scenario 10: 이메일 정규화
- **Given**: email: '  USER@EXAMPLE.COM  '
- **When**: 호출
- **Then**: DB 에 `'user@example.com'` 저장 (lowercase + trim). 동일 이메일 대소문자 차이로 중복 가입 방지

## :gear: Technical & Non-Functional Constraints
- **단일 파일 SSOT**: `lib/contracts/newsletter.ts`
- **더블 옵트인 강제**: 정통법 + 스팸 방지 + 의도적 구독 확인
- **Rate Limit 분당 5 req per IP**: 매우 엄격. 정상 사용자 영향 0 (정상은 1회 가입)
- **PII 최소 (CON-01)**: 이메일만. 이름·전화·주소 절대 미수집
- **이메일 정규화**: lowercase + trim. 중복 방지
- **토큰 24시간 유효**: UUID v4 + DB 저장. 만료 후 재발송 가능
- **언서브스크라이브 의무 (정통법)**: 모든 발송 메일에 푸터 링크. 별도 후속 태스크
- **응답 시간**: p95 ≤ 500ms (DB INSERT + Resend SDK 발송)
- **확인 메일 정책 (IF-RES-001 통합)**: 한국어 + 차분한 톤 + 후킹 0건 (CON-05)
- **금지**:
  - 단일 옵트인 (정통법 위반)
  - 광고성 정보 동의 미체크 허용 (정통법 위반)
  - 이메일 외 PII 수집 (CON-01 위반)
  - 토큰 무한 유효 (보안 위험)
  - 후킹 표현 메일 본문

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/contracts/newsletter.ts` Zod + TypeScript SSOT
- [ ] 더블 옵트인 흐름 정의 (subscribe + confirm 분리)
- [ ] NewsletterSubscriber 모델 정의 (FW-NL-001 PR 와 통합 가능)
- [ ] Rate Limit 분당 5 req per IP 정책
- [ ] 이메일 정규화 (lowercase + trim)
- [ ] 토큰 24시간 만료 정책
- [ ] 언서브스크라이브 후속 명시
- [ ] OpenAPI 명세 추가
- [ ] Mock fixture + schema parse 검증
- [ ] PR 본문에 "FW-NL-001 의 Contract. 정통법 + 더블 옵트인 + PII 최소" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-001 (공통 응답 + Rate Limit 미들웨어)
  - IF-RES-001 (Resend 메일 SDK)
- **Blocks**:
  - FW-NL-001 (Logic Write 본체)
  - 언서브스크라이브 후속 태스크
  - Newsletter 발송 자동화 (별도 후속)
- **Related**:
  - REQ-NF-014 (PII 최소)
  - REQ-FUNC-039 (선택 구독)
  - 정통법 광고성 정보 동의
