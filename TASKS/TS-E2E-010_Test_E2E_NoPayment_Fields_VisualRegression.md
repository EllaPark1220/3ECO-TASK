# [Test] TS-E2E-010: 결제 폼 필드 부재 시각 회귀 — PRD 원칙 2 영구 회귀 방지

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-E2E-010: 결제 관련 input·필드·키워드 0건 검증 — DOM 정적 분석 + 동적 검증 (PRD 원칙 2)"
labels: 'test, e2e, playwright, payment, security, priority:critical, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-E2E-010] 모든 페이지 + 모든 폼에서 결제 관련 input 필드·키워드·외부 결제 SDK 부재를 자동화 검증
- **목적**: PRD 원칙 2 (무료 영구 배제) 의 코드·UI 레이어 영구 회귀 방지. CON-02 (결제 금지) + REQ-NF-015 (결제 영구 배제) 의 마지막 방어선. FW-AUTH-002 의 Zod 스키마 (`SignUpRequest` 가 결제 필드 정의 안함) 가 데이터 레이어 차단이라면, 본 태스크는 **렌더된 UI 레이어에서 결제 input 이 우발적으로 추가되지 않음** 을 보장.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-015 (결제 영구 배제)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-02 (결제 금지)
  - `/docs/SRS_V0_9.md#5.1` — TC-015 (결제 필드 부재 검증)
  - `/docs/SRS_V0_9.md#1.5.1` — ADR-001 (개인사업자 + 무수익 정책)
- PRD 원칙 2 — 영구 무료 배제 (광고·후원·수업료·기부 모두 금지)
- 선행: FW-AUTH-002 (가입 — 결제 필드 Zod 거부 1차), TS-STATIC-001 (정적 키워드)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `tests/e2e/no-payment-fields.spec.ts` 신규 파일
- [ ] **검사 대상 페이지 6종** (TS-E2E-009 와 동일):
  - `/`, `/lesson/L001`, `/stamp-map`, `/auth/signup`, `/auth/login`, `/teacher/kit/L001`
- [ ] **Step 1 — 결제 input 필드 selector 검사**:
  - 금지 input name·id·placeholder·autocomplete 속성:
    ```ts
    const forbiddenInputAttrs = {
      name: ['card', 'card_number', 'cardNumber', 'cvc', 'cvv', 'account', 'account_number', 'iban', 'swift', 'routing', 'billing', 'payment'],
      autocomplete: ['cc-number', 'cc-exp', 'cc-csc', 'cc-name'],
      type: ['payment', 'card'],
      placeholder: ['카드 번호', '계좌 번호', '결제', 'Card Number', 'CVV']
    };
    ```
  - 모든 페이지의 `<input>`, `<select>`, `<textarea>` 검사. 매칭 시 즉시 Fail
- [ ] **Step 2 — 결제 키워드 텍스트 검사**:
  - 페이지 텍스트에 "결제", "구독", "프리미엄", "유료", "월 N원", "₩", "결제하기", "카드 등록", "후원" 등 검출
  - 단 "광고 없음", "무료 영구" 같은 정책 안내 표현은 허용 (PRD 의 영구 무료 보장 명시)
  - **예외 화이트리스트**: `["광고 없음", "무료 영구", "후원받지 않습니다", "결제 정보를 받지 않습니다"]`
- [ ] **Step 3 — 결제 SDK·외부 도메인 부재**:
  - outgoing requests 모니터링 (`page.on('request')`)
  - 차단 도메인: `*.stripe.com`, `*.toss.im`, `*.kakaopay.com`, `*.payment.*`, `*.iamport.*`, `*.bootpay.*`, `*.naverpay.*`
  - 검출 시 Fail
- [ ] **Step 4 — 결제 관련 form action·URL 부재**:
  - 모든 `<form action>` 속성 검사 — `/payment`, `/subscribe`, `/checkout`, `/billing` 같은 URL 패턴 부재
  - 모든 `<a href>` 검사 — 동일 패턴
- [ ] **Step 5 — 환경변수 노출 부재 (선택)**:
  - `window.__NEXT_DATA__` 또는 클라이언트 번들에서 `STRIPE_*`, `PAYMENT_*` 환경변수 노출 부재
  - 본 검증은 별도 `next/bundle-analyzer` 로 빌드 시점에 수행 가능
- [ ] **Step 6 — Cookie 검사**:
  - 페이지 로드 후 `context.cookies()` 로 모든 쿠키 검사
  - 결제 관련 쿠키 (`stripe_*`, `tossSession_*` 등) 부재
- [ ] **Step 7 — 가입 폼 PII 최소 검증** (FW-AUTH-002 와 정합):
  - `/auth/signup` 의 input 목록 — `email`, `nickname`, `password` 3개만
  - 추가 input (성명·연락처·주소·소득·생년월일 등) 부재 검증
  - **PII 최소화는 결제 부재의 사촌 정책** — 결제 정보 수집을 위한 어떤 사전 PII 도 거부
- [ ] **Step 8 — 정리 (afterAll)** — 임시 데이터 정리
- [ ] CI 통합 — IF-CI-004 의 Playwright Job
- [ ] 시나리오 실행 시간 ≤ 60초

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 PR — 결제 부재
- **Given**: 모든 페이지에 결제 input 0건
- **When**: 6 페이지 검사
- **Then**: 모든 검사 Pass

### Scenario 2: 가입 폼에 카드 번호 input 추가 — Fail
- **Given**: 가입 폼에 `<input name="card_number" />` 추가
- **When**: Step 1 검사
- **Then**: 검출 + Fail. PR 코멘트에 "결제 input 검출: name=card_number, page=/auth/signup" 명시

### Scenario 3: "프리미엄 구독" 텍스트 추가 — Fail
- **Given**: 어느 페이지에 "프리미엄 구독" 추가
- **When**: Step 2 키워드 검사
- **Then**: 검출 + Fail. (단 "광고 없음" 같은 화이트리스트 표현은 통과)

### Scenario 4: 정책 안내 텍스트 — Pass (false positive 방지)
- **Given**: 랜딩에 "결제 정보를 받지 않습니다. 영구 무료입니다" 표기
- **When**: Step 2 검사
- **Then**: 화이트리스트 매칭으로 Pass. PRD 원칙 2 의 보장 표현은 명시 권장

### Scenario 5: Stripe SDK 추가 — Fail
- **Given**: 페이지에 `<script src="https://js.stripe.com/v3/">` 추가
- **When**: Step 3 outgoing requests 검사
- **Then**: `js.stripe.com` 도메인 요청 검출 + Fail

### Scenario 6: form action="/checkout" 추가 — Fail
- **Given**: 어느 페이지에 `<form action="/checkout">`
- **When**: Step 4 form action 검사
- **Then**: 검출 + Fail

### Scenario 7: 가입 폼 PII 추가 — Fail
- **Given**: 가입 폼에 `<input name="phone" />` 또는 `<input name="address" />` 추가
- **When**: Step 7 PII 최소 검증
- **Then**: 정의된 3필드 (email, nickname, password) 외 검출 + Fail. **결제 부재 + PII 최소 통합 보장**

### Scenario 8: autocomplete="cc-number" 검출 — Fail
- **Given**: 어느 input 에 `autocomplete="cc-number"` (브라우저 자동완성 우회 시도)
- **When**: Step 1 검사
- **Then**: autocomplete 속성 매칭으로 검출 + Fail

### Scenario 9: 한국 결제 SDK (KakaoPay·Toss) 검출
- **Given**: `<script src="https://kakaopay.com/...">` 추가
- **When**: Step 3 검사
- **Then**: 한국 결제 도메인도 차단 목록에 포함 → 검출 + Fail

### Scenario 10: 시나리오 실행 시간
- **Given**: CI 환경
- **When**: 본 spec 단독 실행
- **Then**: 60초 이내

## :gear: Technical & Non-Functional Constraints
- **방어 계층 구조 (PRD 원칙 2 영구 보장)**:
  - **데이터 레이어** — FW-AUTH-002 의 Zod 스키마가 가입 시 결제 필드 거부
  - **코드 레이어** — TS-STATIC-001 의 정적 키워드 검사 (선택적 — 키워드 사전 확장)
  - **UI 레이어** — 본 태스크 (TS-E2E-010) 가 렌더된 input·텍스트·SDK 모두 검사
  - **네트워크 레이어** — 본 태스크의 outgoing requests 모니터링
- **금지 도메인 목록 유지보수**: `tests/e2e/anti-payment/forbidden-domains.json` 별도 파일. 분기별 갱신
- **화이트리스트 표현**: PRD 의 무료 보장을 사용자에게 명시하는 표현은 허용. 키워드 사전과 별도 관리
- **PII 최소 검증 통합**: 결제 부재 + PII 최소를 단일 게이트에서 검증. 두 정책이 사촌 관계 (결제 수집을 위한 사전 PII 도 거부)
- **flaky 방지**: outgoing requests 는 `networkidle` 까지 대기 후 측정
- **재시도 정책**: Playwright `retries: 1`
- **로컬 재현**: `npm run test:no-payment` 스크립트 제공
- **branch protection**: required check
- **금지**:
  - 결제 SDK 의 의도적 사용 (PRD 원칙 2 위반)
  - autocomplete 우회 트릭 (cc-number 우회)
  - 화이트리스트 임의 추가 (PR 리뷰 의무)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `tests/e2e/no-payment-fields.spec.ts` 구현
- [ ] 6 페이지 × 7 단계 검사 동작
- [ ] forbidden input attrs + forbidden domains + form actions 목록 정의
- [ ] 화이트리스트 표현 ("광고 없음", "무료 영구" 등) 처리
- [ ] PII 최소 검증 통합 (가입 폼 3필드만)
- [ ] CI (IF-CI-004) 자동 실행
- [ ] 시나리오 실행 시간 ≤ 60초
- [ ] flaky 검증 — 10회 연속 통과
- [ ] 의도적 violation PR 1건으로 차단 검증
- [ ] PR 본문에 "PRD 원칙 2 (무료 영구) UI 레이어 마지막 방어선" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-AUTH-002 (가입 — Zod 데이터 레이어 차단 1차)
  - 모든 UI 컴포넌트
  - 디자인 토큰 (정책 안내 표현 표준화)
- **Blocks**:
  - REQ-NF-015 (결제 영구 배제) 영구 회귀 방지
  - **Public Pilot 진입 준비** — PRD 원칙 2 의 다중 방어선 완성
  - REF-NF-014 (PII 최소) 와 통합 검증
- **Related**:
  - PRD 원칙 2 (무료 영구) 영구 회귀 방지 안전망의 마지막 계층
  - ADR-001 (개인사업자 + 무수익 정책) 의 코드 표현
