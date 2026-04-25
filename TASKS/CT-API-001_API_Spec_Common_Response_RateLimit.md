# [Feature] CT-API-001: 공통 응답·오류 포맷 + Rate Limit 미들웨어 (모든 API 의 기반)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-API-001: 공통 응답 포맷 (success/error) + 5종 에러 코드 + Rate Limit 미들웨어 (Vercel KV 기반)"
labels: 'feature, backend, api-spec, infra, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-API-001] 모든 Server Action·Route Handler 가 공유하는 응답 포맷 + 에러 코드 체계 + Rate Limit 미들웨어
- **목적**: SRS §6.1 의 모든 API 엔드포인트가 일관된 응답 구조를 따르도록 하는 단일 진실 공급원. 클라이언트가 단일 에러 처리 로직으로 모든 API 응답을 다룰 수 있게 한다. REQ-NF-008 (오류율 ≤0.5%) 의 측정 기반 + REQ-NF-018 (Rate Limit) 충족.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.1` — 공통 응답·오류 포맷 (모든 엔드포인트 의존)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-008 (오류율 ≤0.5%)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-018 (Rate Limit)
  - `/docs/SRS_V0_9.md#3.3` — Server Action vs Route Handler 선택 기준
  - `/docs/SRS_V0_9.md#3.6.2` — Edge Middleware 컴포넌트
- 외부 문서:
  - `https://vercel.com/docs/storage/vercel-kv` (Rate Limit 저장소)
  - `https://www.npmjs.com/package/@upstash/ratelimit` (라이브러리 옵션)
- 선행: IF-VC-001 (Vercel)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **응답 포맷 정의 — `lib/contracts/api.ts`**:
  ```ts
  // 성공
  export type SuccessResponse<T> = T;  // 엔드포인트별 페이로드

  // 실패 (공통)
  export interface ErrorResponse {
    error_code: string;
    message: string;
    request_id: string;  // 추적성 위함
    details?: Record<string, unknown>;  // Zod 에러 등 추가 정보
  }
  ```
- [ ] **에러 코드 체계 — `lib/contracts/error-codes.ts`**:
  ```ts
  export const ERROR_CODES = {
    // 인증·권한 (4xx)
    UNAUTHORIZED: { http: 401, message: '로그인이 필요합니다.' },
    FORBIDDEN: { http: 403, message: '권한이 없습니다.' },
    EMAIL_NOT_CONFIRMED: { http: 403, message: '이메일 확인이 필요합니다.' },
    ACCOUNT_LOCKED: { http: 423, message: '계정이 일시 잠금되었습니다.' },

    // 검증 (400)
    INVALID_LESSON_ID: { http: 400, message: 'lesson_id 포맷이 올바르지 않습니다.' },
    INVALID_EMAIL: { http: 400, message: '이메일 형식이 올바르지 않습니다.' },
    INVALID_PASSWORD: { http: 400, message: '비밀번호가 보안 정책을 충족하지 않습니다.' },
    INVALID_ANSWER_FORMAT: { http: 400, message: 'OX 답안 형식이 올바르지 않습니다.' },
    INVALID_ANSWER_COUNT: { http: 400, message: 'OX 답안 개수가 일치하지 않습니다.' },
    INVALID_POSITION: { http: 400, message: 'position_sec 값이 올바르지 않습니다.' },
    INVALID_MEDIA_PREFERENCE: { http: 400, message: '매체 선호도 값이 올바르지 않습니다.' },
    EMPTY_UPDATE: { http: 400, message: '변경할 필드가 없습니다.' },
    PASSWORD_TOO_SHORT: { http: 400, message: '비밀번호는 8자 이상이어야 합니다.' },
    COMMENT_TOO_LONG: { http: 400, message: '의견은 2000자 이하여야 합니다.' },

    // 리소스 (404)
    LESSON_NOT_FOUND: { http: 404, message: '레슨을 찾을 수 없습니다.' },
    USER_NOT_FOUND: { http: 404, message: '사용자를 찾을 수 없습니다.' },

    // 충돌 (409)
    EMAIL_ALREADY_EXISTS: { http: 409, message: '이미 사용 중인 이메일입니다.' },

    // 인증 (401 — 자격증명 불일치)
    INVALID_CREDENTIALS: { http: 401, message: '이메일 또는 비밀번호가 잘못되었습니다.' },

    // Rate Limit (429)
    RATE_LIMIT_EXCEEDED: { http: 429, message: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' },

    // 서버 (5xx)
    INTERNAL_ERROR: { http: 500, message: '서버 오류가 발생했습니다.' },
    PDF_GENERATION_FAILED: { http: 500, message: 'PDF 생성에 실패했습니다.' },
    STORAGE_UNAVAILABLE: { http: 503, message: '일시적으로 서비스를 사용할 수 없습니다.' },
  } as const;

  export type ErrorCode = keyof typeof ERROR_CODES;
  ```
- [ ] **에러 응답 헬퍼 — `lib/api/error.ts`**:
  ```ts
  export function makeErrorResponse(code: ErrorCode, requestId: string, details?: Record<string, unknown>): NextResponse {
    const { http, message } = ERROR_CODES[code];
    return NextResponse.json({ error_code: code, message, request_id: requestId, details }, { status: http });
  }
  ```
- [ ] **request_id 추적 — `middleware.ts` 통합**:
  - 모든 요청에 UUID v4 request_id 발급
  - 응답 헤더에 `X-Request-Id` 포함
  - Sentry 또는 Vercel Logs 의 추적 연계
- [ ] **Rate Limit 미들웨어 — Vercel KV 기반**:
  - `npm install @upstash/ratelimit @upstash/redis`
  - Upstash Redis (Vercel KV) 사용. Vercel Hobby 한도 내 (월 10K 명령)
  - 정책:
    - 일반 API: IP 당 분당 60 req
    - 인증 API (가입·로그인): IP 당 분당 10 req
    - OX 제출: IP+user 당 분당 30 req
- [ ] **Rate Limit 코드 — `lib/api/rate-limit.ts`**:
  ```ts
  import { Ratelimit } from '@upstash/ratelimit';
  import { Redis } from '@upstash/redis';

  const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });

  export const rateLimits = {
    general: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, '1 m') }),
    auth: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m') }),
    ox: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, '1 m') }),
  };

  export async function enforceRateLimit(key: string, type: keyof typeof rateLimits) {
    const { success, limit, remaining, reset } = await rateLimits[type].limit(key);
    if (!success) throw new RateLimitError(reset);
    return { limit, remaining, reset };
  }
  ```
- [ ] **응답 헤더 추가** — Rate Limit 정보:
  - `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
  - 429 응답 시 `Retry-After` 헤더 추가
- [ ] **API 명세 (OpenAPI) 갱신** — 모든 엔드포인트가 본 응답 포맷 사용
- [ ] **로깅 정책**:
  - 4xx 응답 — info 레벨 로그
  - 5xx 응답 — error 레벨 + Sentry 자동 알림
  - request_id 모든 로그에 포함

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 응답 — request_id 헤더 포함
- **Given**: 정상 API 호출
- **When**: 응답 검사
- **Then**: `X-Request-Id` 헤더 존재. UUID v4 포맷

### Scenario 2: 에러 응답 — 표준 포맷
- **Given**: 잘못된 lesson_id 로 호출
- **When**: 응답
- **Then**: `{ error_code: 'INVALID_LESSON_ID', message: '...', request_id: '...' }`. HTTP 400

### Scenario 3: Rate Limit — 일반 API 60 req/min
- **Given**: 동일 IP 가 분당 60 req 호출 완료
- **When**: 61번째 시도
- **Then**: 429 + `RATE_LIMIT_EXCEEDED`. `Retry-After` 헤더 + `X-RateLimit-Reset`

### Scenario 4: Rate Limit — 인증 API 10 req/min
- **Given**: 동일 IP 의 가입 시도 분당 10회 완료
- **When**: 11번째 시도
- **Then**: 429 응답 (인증 API 는 더 엄격)

### Scenario 5: 한국어 에러 메시지
- **Given**: 모든 에러 응답
- **When**: message 필드 검사
- **Then**: 한국어 메시지 (사용자 친화). 기술 디테일은 details 에 별도

### Scenario 6: details 필드 — Zod 에러
- **Given**: Zod parse 실패
- **When**: 응답
- **Then**: details 에 Zod 의 issues 배열 포함 (개발자가 어느 필드인지 식별 가능)

### Scenario 7: Sentry 5xx 자동 알림
- **Given**: 5xx 발생
- **When**: 응답
- **Then**: Sentry 에 자동 이벤트 + request_id 연계. 관리자 알림 (REQ-NF-024)

### Scenario 8: 미들웨어 request_id 발급 일관성
- **Given**: 동일 요청
- **When**: 미들웨어 → Server Action → 응답
- **Then**: 모든 단계에서 동일 request_id 사용 (request-scoped storage 활용)

### Scenario 9: 응답 시간 영향
- **Given**: Rate Limit 미들웨어 활성
- **When**: 정상 요청 (RL 미초과)
- **Then**: 추가 지연 ≤ 30ms (Upstash Redis edge 응답)

### Scenario 10: KV 한도 모니터링
- **Given**: 1주일 운영 후
- **When**: Vercel KV 명령 카운트 측정
- **Then**: 월 10K 한도 내 (Hobby 무료). 초과 시 Sentry 알림

## :gear: Technical & Non-Functional Constraints
- **에러 코드 체계 단일 출처**: `lib/contracts/error-codes.ts`. 모든 API 가 import 활용. 코드 추가 시 PR 리뷰 의무
- **request_id 정책**: 모든 응답에 `X-Request-Id` 헤더 + 응답 본문에도 포함. Sentry·Vercel Logs 추적성
- **Rate Limit 키 정책**:
  - 일반 — IP 만
  - 인증 — IP (사용자 열거 공격 방지)
  - OX — IP + user_id (멀티 디바이스 정상 사용 허용)
- **Upstash Redis 비용**: Vercel KV (Upstash 기반) Hobby 무료 한도 — 월 10K 명령. 초과 시 Vercel Pro 또는 Upstash 직접 결제
- **응답 시간 영향 ≤ 30ms**: Upstash 의 edge 응답 활용. 추가 지연 최소화
- **에러 메시지 한국어**: REQ-NF-007 (한국어 단일) 정합. 영문 메시지는 details 에 별도 (개발자용)
- **5xx Sentry 자동 알림**: Anthropic Sentry SDK 또는 자체 webhook 활용. REQ-NF-024 (외부 서비스 알림)
- **로깅 마스킹**: 4xx·5xx 로그에 비밀번호·개인정보 자동 마스킹
- **KV 한도 모니터링**: 월 8K 명령 도달 시 Sentry 경고. Pro 전환 트리거
- **금지**:
  - 응답 포맷 분기 (엔드포인트별 다른 구조)
  - 에러 코드 매직 스트링 사용 (import 강제)
  - request_id 누락 (추적성 핵심)
  - Rate Limit 우회 헤더 (X-Forwarded-For 신뢰 시 검증 필수)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/contracts/error-codes.ts` + 22개 코드 정의
- [ ] `lib/api/error.ts` 헬퍼 + `lib/api/rate-limit.ts` 미들웨어
- [ ] `middleware.ts` 통합 — request_id 발급 + Rate Limit 적용
- [ ] Vercel KV (Upstash Redis) 환경변수 설정
- [ ] 응답 헤더 4종 (X-Request-Id, X-RateLimit-*) 검증
- [ ] Sentry 5xx 자동 알림 통합
- [ ] OpenAPI 명세 — 모든 엔드포인트가 본 포맷 사용 명시
- [ ] KV 한도 모니터링 — 월 10K 추적
- [ ] 응답 시간 영향 ≤ 30ms 측정
- [ ] PR 본문에 "모든 API 의 기반. 응답 포맷·에러·Rate Limit 단일 출처" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-VC-001 (Vercel)
  - IF-KV-001 (Vercel KV / Upstash Redis 활성화)
- **Blocks**:
  - CT-API-002, 003, 004, 005, 006, 007 (모든 API DTO)
  - 모든 Server Action·Route Handler (응답 포맷 의존)
  - FW-AUTH-002, 003 (Rate Limit 적용)
  - NF-OBS-001 (Sentry — 5xx 알림)
- **Related**:
  - REQ-NF-008, 018, 024 (오류율·Rate Limit·외부 알림)
