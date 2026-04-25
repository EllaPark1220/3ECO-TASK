# [NF] NF-SEC-005: Rate Limit 미들웨어 적용

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-SEC-005: 보안 인프라 — Rate Limit 미들웨어 (분당 120회 및 민감 API 엄격 제어)"
labels: 'nf, security, rate-limit, middleware, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-SEC-005] Rate Limit 미들웨어 적용
- **목적**: §6.1 공통 API 규약. 봇에 의한 무차별 트래픽 공격(DDoS, 무차별 대입, 크롤링)을 방어하고 백엔드 인프라(Supabase RCU, Vercel Compute) 과금을 보호하기 위함. 전역적으로 분당 120회를 제한하되, 스팸 우려가 있는 특정 엔드포인트(뉴스레터, 설문, 로그인)는 더 타이트한 룰을 적용함.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#6.1` — 공통 규약 (Rate Limit)
- 관련: CT-API-001 (공통 API 응답 형식), IF-VC-001 (Vercel Edge 환경)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Upstash Redis 기반 Rate Limit 패키지 도입**:
  - 서버리스 환경(Vercel Edge)에서 글로벌 스테이트를 갖기 위해 메모리 맵이 아닌 `@upstash/ratelimit` 와 `@upstash/redis` 패키지를 설치.
  - Vercel KV(Upstash 기반) 통합 또는 개별 Upstash Free 계정 발급 후 환경변수 세팅 (`KV_REST_API_URL`, `KV_REST_API_TOKEN`).
- [ ] **전역 Middleware 구현 (`middleware.ts`)**:
  - `x-forwarded-for` 또는 `req.ip` 헤더를 통해 클라이언트 IP를 식별.
  - 슬라이딩 윈도우 알고리즘(Sliding Window) 사용. 기본 룰: 120 requests per 1 minute (1 minute 윈도우).
  ```ts
  import { Ratelimit } from '@upstash/ratelimit';
  import { Redis } from '@upstash/redis';

  const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  // Global 기본 룰
  const globalRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(120, '1 m'),
  });

  // Strict 룰 (뉴스레터, 로그인 등)
  const strictRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, '1 h'),
  });
  ```
- [ ] **라우트 경로별 분기 로직 적용**:
  - `req.nextUrl.pathname` 에 따라 다른 룰 엔진을 통과시킴.
  - `/api/newsletter/*`, `/api/auth/login`, `/api/survey/*` 라우트는 `strictRatelimit` 통과.
  - 정적 에셋(이미지, _next/static 등)은 Rate Limit 검사에서 완전 제외하여 비용 절약 및 성능 확보.
- [ ] **차단 응답 및 헤더 규약**:
  - 제한 초과 시 HTTP 429 Too Many Requests 반환.
  - 응답 본문에 표준 포맷 `{ error_code: 'RATE_LIMIT_EXCEEDED', message: '너무 많은 요청입니다.' }` 주입.
  - HTTP 헤더에 `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` 값 포함.

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 일반 API 기본 제한량 (120/min) 이내 통과
- **Given**: IP A에서 1분 이내에 `/api/lesson/L001`을 50회 연속 호출
- **When**: 미들웨어 통과
- **Then**: HTTP 200/201 정상 응답되며 `X-RateLimit-Remaining` 헤더가 감소하는 것을 확인

### Scenario 2: 기본 API Rate Limit 초과 시 차단
- **Given**: IP B에서 자동화 툴을 통해 1분 이내에 121회 호출 시도
- **When**: 121번째 요청 도달 시
- **Then**: 요청이 백엔드 로직에 닿지 않고 즉시 429 응답을 반환. `Retry-After` 헤더에 남은 대기 시간 표시.

### Scenario 3: 엄격한 API (뉴스레터 3/hour) 적용
- **Given**: IP C에서 1시간 내에 `/api/newsletter/subscribe` API를 4번째 호출
- **When**: 미들웨어 통과
- **Then**: 일반 120회 한도와 무관하게 4번째 요청에서 429 상태 코드 반환

### Scenario 4: IP 식별 헤더 정합성 (Proxy 환경)
- **Given**: 사용자 요청이 Vercel 리버스 프록시를 통과함
- **When**: 미들웨어에서 IP 추출 (`req.headers.get('x-forwarded-for')` 등)
- **Then**: 서버의 IP나 Vercel 내부 IP가 아닌, 클라이언트의 실제 Public IP를 기준으로 식별키(identifier)를 생성함

### Scenario 5: 정적 리소스(Static Assets) Bypass
- **Given**: 브라우저가 CSS 파일 (`/_next/static/css/main.css`) 요청
- **When**: 미들웨어 통과
- **Then**: Redis 연산을 수행하지 않고 즉시 Pass 처리함 (비용 절약 및 속도 지연 0)

### Scenario 6: Rate Limit 백엔드(Redis) 다운 시 페일오버(Fail-open)
- **Given**: Upstash Redis 서비스 연결 지연 또는 장애 발생
- **When**: 클라이언트 요청 도달 시 `Ratelimit.limit()` 메서드 타임아웃
- **Then**: 애플리케이션 전체가 마비되는 것을 막기 위해, 예외를 Catch하고 트래픽을 허용(Pass) 처리함 (Fail-open 정책)

### Scenario 7: 계정 기반(Account-based) 제한 확장 가능성 확인
- **Given**: 로그인된 사용자
- **When**: API 호출
- **Then**: 미들웨어에서 세션 토큰을 해독할 수 있다면 IP 대신 `user_id`를 식별키로 사용하도록 조건문이 구성되어 있음 (선택 구현, 설계 리뷰)

### Scenario 8: 표준 에러 페이로드 포맷 검증
- **Given**: 429 에러 발생 시
- **When**: 클라이언트에서 응답 바디 확인
- **Then**: `{ "error_code": "RATE_LIMIT_EXCEEDED" }` JSON 규격을 정확히 준수하여 클라이언트의 공통 에러 핸들러가 인식함

### Scenario 9: 429 에러 시 Sentry 전송 제외
- **Given**: 의도적인 DDoS 공격으로 수 만 번의 429 에러 발생
- **When**: Sentry 로그 수집기 작동
- **Then**: 429 예외는 예상된 정상 보안 동작이므로, Sentry Error 쿼터 낭비를 막기 위해 오류 로깅에서 무시(Ignore)됨

### Scenario 10: 미들웨어 실행 지연(Latency) 검증
- **Given**: Vercel Edge 서버와 Upstash Redis
- **When**: 일반적인 API 요청 처리
- **Then**: Rate limit 체크(Redis Round-trip)에 소요되는 시간이 p95 기준 50ms 미만임을 보장함

## :gear: Technical & Non-Functional Constraints
- **비용**: Redis 읽기/쓰기 작업이 요청마다 발생하므로, 정적 에셋 무시 라우팅 규칙(Next.js 미들웨어 `matcher`)을 정교하게 세팅해야 함.
- **Fail-open**: 보안도 중요하지만 사이트 가용성이 최우선. Redis 장애가 전체 사이트 장애로 이어지면 안 됨 (Scenario 6 필수).

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 통과 및 수동 429 에러 발생 테스트
- [ ] `middleware.ts` 구현체 작성 및 `matcher` 최적화
- [ ] Vercel KV / Upstash 환경변수 설정
- [ ] Fail-open 로직 구현 완료
- [ ] PR 본문에 "§6.1 규약 분당 120회 제한" 명시

## :construction: Dependencies & Blockers
- **Depends on**: CT-API-001 (응답 규약)
- **Blocks**: 모든 Public API 오픈 및 부하 테스트 (TS-LOAD-001) 수행
