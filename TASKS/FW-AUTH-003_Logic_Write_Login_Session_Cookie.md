# [Feature] FW-AUTH-003: 로그인 Server Action + Supabase 세션 쿠키

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-AUTH-003: 로그인 Server Action + Supabase 세션 쿠키 (HttpOnly + Secure + SameSite=Lax)"
labels: 'feature, backend, auth, security, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-AUTH-003] `signIn()` Server Action — Supabase Auth `signInWithPassword()` 호출 + 세션 쿠키 발급 + 만료 정책 적용
- **목적**: REQ-NF-019 (세션 관리 — HttpOnly + Secure + SameSite=Lax) 와 INV-06 (단방향 해시 검증) 을 충족하는 사용자 로그인 진입로를 구축한다. 본 태스크는 Story 1 (박지훈) 의 가입 → 시청 사이클을 닫는 마지막 Auth 컴포넌트이며, 후속 Server Action·Route Handler 가 세션 기반 권한 검증을 수행할 수 있도록 한다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-017 (단방향 해시), REQ-NF-019 (세션), REQ-NF-021 (RBAC)
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-AUTH (Supabase Auth)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-06
  - `/docs/SRS_V0_9.md#3.6.2` — Auth 컴포넌트 책임 매트릭스
  - `/docs/SRS_V0_9.md#6.3.1` — 가입·로그인 시퀀스
- 외부 문서: Supabase Auth `signInWithPassword` API
- 선행 결정: D-AUTH (자체 bcrypt 관리 없음)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/contracts/auth.ts` 에 `SignInRequest` Zod 스키마 추가 — `{ email, password }` (FW-AUTH-002 와 동일 파일)
- [ ] `app/auth/actions.ts` 에 `signIn()` Server Action 구현
- [ ] `lib/supabase/server.ts` 의 클라이언트로 `auth.signInWithPassword({ email, password })` 호출
- [ ] 성공 시 Supabase SSR 패키지가 자동으로 cookies()에 세션 쿠키 설정 (HttpOnly + Secure + SameSite=Lax + Path=/)
- [ ] 성공 응답 — `{ ok: true, redirect_to: '/lessons' }` (또는 클라이언트가 명시한 returnTo URL)
- [ ] 실패 케이스 5종 분리 처리:
  - 자격 증명 불일치 → `INVALID_CREDENTIALS` (401)
  - 이메일 미확인 → `EMAIL_NOT_CONFIRMED` (403)
  - 계정 잠금 → `ACCOUNT_LOCKED` (423)
  - Rate Limit 초과 → `RATE_LIMIT_EXCEEDED` (429)
  - 기타 → `INTERNAL_ERROR` (500)
- [ ] 로그인 시도 로깅 — 성공/실패 모두 EventLog 에 `auth.signin_attempt` 기록 (이메일 마스킹). 실패 시 IP·User-Agent 추가 (감사 추적)
- [ ] Rate Limit — IP+email 조합 분당 10회 시도 (CT-API-001 의 미들웨어 활용 + 추가 강화)
- [ ] 5회 연속 실패 시 일시 잠금 정책 — Supabase Auth 의 자체 정책 활용 또는 Custom 구현 (선택)
- [ ] 로그인 후 RSC 의 `revalidatePath()` 또는 `redirect()` 로 인증 상태 즉시 반영
- [ ] 로그아웃 Server Action `signOut()` 도 동일 파일에 추가 (페어 작업) — `auth.signOut()` + 쿠키 만료
- [ ] 비밀번호 평문 로깅 0건 검증 (Vercel Logs 샘플 감사)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 로그인
- **Given**: 가입 + 이메일 확인 완료 사용자 `alice@example.com` / `secure1234`
- **When**: `signIn({ email, password })` Server Action 호출
- **Then**: 세션 쿠키 발급 (HttpOnly + Secure + SameSite=Lax). 응답 `{ ok: true, redirect_to: '/lessons' }`. EventLog 에 `auth.signin_attempt` (success=true) 1건 기록

### Scenario 2: 잘못된 비밀번호 — 401
- **Given**: 정상 가입 사용자
- **When**: 잘못된 비밀번호로 `signIn()` 호출
- **Then**: `INVALID_CREDENTIALS` 에러. 401 응답. **에러 메시지에 "이메일 또는 비밀번호가 잘못되었습니다" 와 같이 어느 필드가 잘못된지 노출 금지** (사용자 열거 공격 방지). EventLog 에 실패 기록 + IP·UA

### Scenario 3: 이메일 미확인 — 403
- **Given**: 가입했지만 확인 메일 미클릭 상태
- **When**: 정확한 비밀번호로 `signIn()` 호출
- **Then**: `EMAIL_NOT_CONFIRMED` 에러. 403 응답. 클라이언트는 "확인 메일 재전송" UI 안내

### Scenario 4: 미가입 이메일 — 동일 401 응답
- **Given**: DB 에 없는 이메일 `nobody@example.com`
- **When**: `signIn()` 호출
- **Then**: `INVALID_CREDENTIALS` (401). Scenario 2 와 **동일한 에러 메시지·시간** 으로 응답 (timing attack 방지)

### Scenario 5: 5회 연속 실패 → 일시 잠금
- **Given**: 동일 이메일에 잘못된 비밀번호로 5회 연속 시도
- **When**: 6번째 시도
- **Then**: `ACCOUNT_LOCKED` (423). 일정 시간(예: 15분) 후 재시도 가능. EventLog 에 `auth.account_locked` 기록

### Scenario 6: 세션 쿠키 속성 검증
- **Given**: 정상 로그인 후 응답
- **When**: 응답 헤더의 `Set-Cookie` 검사
- **Then**: 모든 세션 쿠키에 `HttpOnly; Secure; SameSite=Lax; Path=/` 포함. JavaScript `document.cookie` 로 접근 불가

### Scenario 7: 미들웨어 자동 갱신
- **Given**: 만료 임박한 access token (5분 이내)
- **When**: 보호된 라우트 접근
- **Then**: `middleware.ts` 가 refresh token 으로 자동 갱신. 사용자는 재로그인 없이 계속 사용

### Scenario 8: 로그아웃
- **Given**: 로그인 상태
- **When**: `signOut()` Server Action 호출
- **Then**: 세션 쿠키 만료 (Set-Cookie Max-Age=0). Supabase 의 refresh token 무효화. 응답 후 보호된 라우트는 401

### Scenario 9: 평문 비밀번호 로깅 부재
- **Given**: 50회 로그인 시도 후
- **When**: Vercel Logs 샘플 검사
- **Then**: 평문 비밀번호 노출 0건. 이메일은 마스킹(`a***@e***.com`) 적용

## :gear: Technical & Non-Functional Constraints
- **세션 쿠키 정책 (REQ-NF-019)**:
  - HttpOnly = true (JS 접근 차단)
  - Secure = true (HTTPS 전용. Vercel 자동)
  - SameSite = Lax (CSRF 방지 + OAuth 호환)
  - Path = / (전체 경로)
  - access token 만료: 1시간
  - refresh token 만료: 30일
- **사용자 열거 공격 방지**: 미가입 이메일과 잘못된 비밀번호 응답을 **동일하게** 반환 (메시지·HTTP 코드·응답 시간)
- **Timing attack 대응**: bcrypt 해시 비교가 일정 시간 소요되도록 Supabase Auth 가 자체 처리. 추가로 응답 전 random delay 50~150ms 적용 가능 (선택)
- **Rate Limit (REQ-NF-008 핵심 오류율 영향)**: IP+email 분당 10회. 위반 시 429 + Retry-After 헤더
- **로깅 마스킹**: `auth.signin_attempt` 페이로드의 password 필드는 절대 기록 금지. 이메일은 마스킹
- **에러 코드 5종**: `INVALID_CREDENTIALS`, `EMAIL_NOT_CONFIRMED`, `ACCOUNT_LOCKED`, `RATE_LIMIT_EXCEEDED`, `INTERNAL_ERROR`
- **응답 시간**: p95 ≤ 500ms (Supabase Auth 호출 포함)
- **CSRF 보호**: Server Action 은 Next.js 가 자동 CSRF 토큰 적용. 별도 작업 불필요
- **금지**:
  - 자체 JWT 발급 금지 (Supabase 가 관리)
  - 세션 정보를 localStorage 저장 금지 (HttpOnly 쿠키 전용)
  - "Remember Me" 기능 금지 (PII 최소 — 단순화)

## :checkered_flag: Definition of Done (DoD)
- [ ] 9개 GWT 시나리오 전부 통과
- [ ] `signIn()` + `signOut()` Server Action 페어 구현
- [ ] 5종 에러 코드 분리 처리 검증
- [ ] 세션 쿠키 속성 (HttpOnly + Secure + SameSite=Lax) 헤더 검사 통과
- [ ] 사용자 열거 공격 방지 — Scenario 2·4 응답 동등성 검증
- [ ] 평문 비밀번호 로깅 0건 (Vercel Logs 50회 샘플)
- [ ] 5회 실패 후 일시 잠금 동작 검증
- [ ] TS-UT-002 (로그인 세션 GWT) 통과
- [ ] PR 본문에 "본 태스크는 Story 1 가입→시청 사이클의 마지막 Auth 컴포넌트" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-AUTH-001 (Supabase Auth 설치)
  - FW-AUTH-002 (회원가입 — 가입된 사용자만 로그인 가능)
  - CT-DB-002 (User 모델)
  - CT-API-001 (Rate Limit 미들웨어)
- **Blocks**:
  - FR-AUTH-001 (현재 세션 조회 — 본 액션이 세션 발급)
  - FR-AUTH-002 (RBAC 가드 — 세션 기반 권한 검증)
  - 모든 인증 필요 Server Action·Route Handler
  - TS-UT-002 (로그인 세션 단위 테스트)
  - TS-E2E-001 (박지훈 E2E — 가입 + 로그인 단계)
- **Related**:
  - 사용자 열거 공격 방지 정책 — 보안 검토 필요
