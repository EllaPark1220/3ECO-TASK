# [Feature] NF-SEC-001: 인증·세션 보안 — Supabase Auth + HttpOnly·Secure·SameSite=Lax + 로그아웃·세션 만료

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] NF-SEC-001: 인증·세션 보안 정책 — Supabase Auth + HttpOnly·Secure·SameSite=Lax + 30일 만료 + 로그아웃 + 비밀번호 reset"
labels: 'nf, security, auth, session, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-SEC-001] 인증·세션 보안 정책 통합 — (1) Supabase Auth (D-AUTH 정합) + (2) Cookie HttpOnly·Secure·SameSite=Lax + (3) 30일 세션 만료 + (4) 로그아웃 시 토큰 즉시 무효화 + (5) 비밀번호 reset 토큰 1시간 만료 + (6) Brute force 차단 (5회 실패 시 5분 lock)
- **목적**: REQ-NF-013 (인증·세션) + OWASP Top 10 의 Broken Authentication 대응. Supabase Auth 활용으로 자체 bcrypt 관리 회피 + 표준 보안 정책 자동 적용. 단일 제작자(CON-08) 가 보안 헛점 만들 위험 최소화.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-013 (인증·세션)
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-AUTH (Supabase Auth)
- 외부:
  - https://owasp.org/www-project-top-ten/
  - https://supabase.com/docs/guides/auth
- 선행: FR-AUTH-001 (getCurrentUser), CT-DB-002 (User), TS-UT-001 (회원가입), TS-UT-002 (세션)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Supabase Auth 정책 검증**:
  - 자체 bcrypt 관리 0 — Supabase Auth 가 hashing
  - 비밀번호 정책 — 최소 8자 (Supabase 기본) + 영문·숫자 혼합 권장
  - JWT 토큰 — Supabase 가 발급 + 자동 refresh
- [ ] **Cookie 정책 — `lib/auth/cookie.ts`**:
  ```ts
  export const SESSION_COOKIE_OPTIONS = {
    httpOnly: true,                    // JS 접근 차단 (XSS)
    secure: true,                      // HTTPS only
    sameSite: 'lax' as const,          // CSRF 차단
    maxAge: 30 * 24 * 60 * 60,         // 30일
    path: '/',
  };
  ```
- [ ] **세션 만료 정책 — 30일 + sliding window**:
  - 활성 사용자 — 매 요청 시 만료 시간 갱신 (Supabase 자동 refresh)
  - 30일 미접속 — 자동 만료 + 재로그인 요구
  - 만료된 세션 접근 — 401 + 로그인 페이지 redirect
- [ ] **로그아웃 — 토큰 즉시 무효화**:
  ```ts
  // app/api/auth/logout/route.ts
  export async function POST(req: Request) {
    const supabase = createServerClient();
    await supabase.auth.signOut();

    const response = NextResponse.json({ ok: true });
    response.cookies.delete('sb-access-token');
    response.cookies.delete('sb-refresh-token');

    // EventLog
    const userId = (await getCurrentUser())?.id;
    if (userId) {
      await prisma.eventLog.create({
        data: { userId, event: 'auth.logout', payload: {} },
      });
    }

    return response;
  }
  ```
- [ ] **비밀번호 reset 토큰 1시간 만료**:
  - Supabase Auth 의 reset email 활용 (자체 구현 회피)
  - 기본 1시간 만료 (Supabase 설정 확인 — 짧을수록 안전)
- [ ] **Brute force 차단 — Rate Limit 별도**:
  - login 라우트 — 5분당 5회 per IP (CT-API-001 의 별도 limiter)
  - 5회 실패 시 5분 lock (Cookie 또는 IP 기반)
  - 임계 도달 시 EventLog `auth.brute_force_blocked` + Sentry 알림
  ```ts
  // app/api/auth/login/route.ts
  export async function POST(req: Request) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';

    try {
      await enforceRateLimit(`auth:${ip}`, 'auth');  // 5분당 5회
    } catch {
      await prisma.eventLog.create({
        data: { event: 'auth.brute_force_blocked', payload: { ip } },
      });
      return makeErrorResponse('RATE_LIMIT_EXCEEDED');
    }

    // ... Supabase Auth 호출
  }
  ```
- [ ] **CSRF 보호 — SameSite=Lax + Origin 검증**:
  - SameSite=Lax — 외부 사이트 cross-origin 요청 차단
  - 추가 Origin 헤더 검증 (POST 요청 시) — Origin 이 본 사이트와 일치하지 않으면 403
- [ ] **Session fixation 방지** — 로그인 시 세션 ID 갱신:
  - Supabase Auth 가 자동 처리
  - 로그인 직전 세션 — 로그인 후 새 토큰으로 교체
- [ ] **세션 hijacking 방지** — IP·User-Agent 검증 (선택)**:
  - 토큰 발급 시 IP·UA 기록
  - 사용 시 IP·UA 변경 감지 → 의심 알림 (이메일)
  - 본 정책은 user-friendly 균형 — 너무 엄격하면 모바일 ↔ PC 전환 차단
  - **Stage 1 — 비활성**. Stage 2 검토
- [ ] **로그아웃 모든 기기 (선택)**:
  - 향후 admin 페이지에서 "모든 기기 로그아웃" 버튼
  - Supabase 의 `signOut({ scope: 'global' })` 활용
- [ ] **Audit Log — auth 이벤트 EventLog 발행**:
  - `auth.login_success`
  - `auth.login_failure`
  - `auth.logout`
  - `auth.password_reset_requested`
  - `auth.brute_force_blocked`
- [ ] **운영자 SOP — 비밀번호 분실 시**:
  - 사용자가 reset 요청 → Supabase Auth 의 reset email 자동 발송
  - 1시간 내 클릭 + 새 비밀번호 설정
  - 운영자 개입 0 (Supabase 가 자동)
- [ ] **응답 시간**: login ≤ 500ms (Supabase Auth API 호출), logout ≤ 200ms

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 로그인 + Cookie 정책
- **Given**: 정상 credential
- **When**: POST /api/auth/login
- **Then**: 200 + Set-Cookie HttpOnly + Secure + SameSite=Lax

### Scenario 2: 30일 만료
- **Given**: 30일 미접속 토큰
- **When**: 요청
- **Then**: 401 + 로그인 페이지

### Scenario 3: 로그아웃 토큰 무효화
- **Given**: 로그인 상태
- **When**: POST /api/auth/logout
- **Then**: Cookie 삭제 + EventLog `auth.logout`

### Scenario 4: 비밀번호 reset — 1시간 만료
- **Given**: reset 토큰 1시간 1초 후
- **When**: 토큰 사용 시도
- **Then**: 401 + token expired

### Scenario 5: Brute force — 5회 실패 시 lock
- **Given**: 동일 IP 5회 실패
- **When**: 6번째 시도
- **Then**: 429 + 5분 lock + EventLog `auth.brute_force_blocked`

### Scenario 6: CSRF — Origin 미일치
- **Given**: 외부 사이트 POST
- **When**: 호출
- **Then**: 403 (Origin 검증)

### Scenario 7: Session fixation 방지
- **Given**: 로그인 직전 세션
- **When**: 로그인 후
- **Then**: 새 토큰 (이전 무효)

### Scenario 8: SameSite=Lax — cross-origin POST 차단
- **Given**: 외부 form POST
- **When**: 시도
- **Then**: Cookie 미전송 → 401

### Scenario 9: Audit Log — 5종 이벤트
- **Given**: 로그인·로그아웃·실패 등
- **When**: EventLog 조회
- **Then**: 5종 이벤트 모두 발행

### Scenario 10: 응답 시간
- **Given**: login + logout
- **When**: 측정
- **Then**: login ≤ 500ms, logout ≤ 200ms

## :gear: Technical & Non-Functional Constraints
- **Supabase Auth 활용 — 자체 bcrypt 관리 0**
- **Cookie 3종 보호 — HttpOnly + Secure + SameSite=Lax**
- **30일 만료 + sliding window**: UX 균형
- **Brute force — 5분당 5회**: 환경변수화 가능
- **CSRF — SameSite + Origin 이중 보호**
- **Audit Log 5종**: 보안 인시던트 추적
- **Stage 1 — IP·UA 검증 비활성**: UX 균형 (모바일↔PC)
- **응답 시간 — login ≤ 500ms, logout ≤ 200ms**
- **금지**:
  - 자체 bcrypt 관리
  - Cookie 의 HttpOnly 누락 (XSS 위험)
  - Secure 누락 (HTTPS 외 노출)
  - Origin 검증 누락 (CSRF 위험)
  - reset 토큰 24시간 이상 만료

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Supabase Auth 통합 + Cookie 정책
- [ ] 30일 만료 + sliding window
- [ ] 로그아웃 토큰 무효화
- [ ] 비밀번호 reset 1시간 만료
- [ ] Brute force 차단 (5분당 5회)
- [ ] CSRF Origin 검증
- [ ] Audit Log 5종
- [ ] 응답 시간 측정
- [ ] PR 본문에 "REQ-NF-013 + OWASP Broken Auth 대응" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-AUTH-001 (getCurrentUser)
  - CT-DB-002 (User)
  - CT-API-001 (Rate Limit)
  - IF-SUP-001 (Supabase Auth)
  - CT-DB-009 (EventLog)
- **Blocks**:
  - 모든 인증 기반 기능
  - REQ-NF-013 충족
- **Related**:
  - TS-UT-001~002 (단위 테스트)
  - NF-SEC-002 (RLS)
