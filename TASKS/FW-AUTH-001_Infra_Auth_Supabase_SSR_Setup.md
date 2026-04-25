# [Feature] FW-AUTH-001: Supabase Auth 설치 및 환경 변수 구성 (D-AUTH 결정 적용)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-AUTH-001: Supabase Auth 설치 및 환경 변수 구성 (D-AUTH 결정 적용)"
labels: 'feature, backend, auth, infra, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-AUTH-001] `@supabase/ssr` + `@supabase/supabase-js` 설치, Next.js App Router용 서버·클라이언트 클라이언트 인스턴스 분리, 환경 변수 3종 (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) 구성
- **목적**: ADR-004 §1.5.1.2 D-AUTH 결정에 따라 자체 bcrypt 관리 없이 Supabase Auth 를 단방향 해시 보장 메커니즘으로 채택한다 (REQ-NF-017). 본 태스크는 후속 인증 기능 (가입·로그인·세션·RBAC) 의 기반 인프라를 마련하며, 단일 제작자 운영 부담을 최소화한다 (CON-08).

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-AUTH 결정 (Supabase Auth 채택)
  - `/docs/SRS_V0_9.md#3.6.2` — Component 책임 매트릭스 Auth 행
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-017 (비밀번호 저장), REQ-NF-019 (세션 관리)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-06 (단방향 해시)
- 외부 문서: `https://supabase.com/docs/guides/auth/server-side/nextjs` (Next.js App Router 통합 가이드)
- 선행 환경: §1.5.1.2 C-TEC-007 (Vercel) + IF-VC-001 (Vercel 프로젝트), IF-SUP-001 (Supabase 프로젝트)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `npm install @supabase/ssr @supabase/supabase-js` 설치 (App Router 호환 SSR 패키지)
- [ ] `.env.local` 에 환경 변수 3종 추가 — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Vercel 환경 변수 등록 — Production / Preview / Development 3환경 모두 (`vercel env add`)
- [ ] `.env.example` 파일 생성 — 키 이름만 템플릿화 (실제 값 제외)
- [ ] `lib/supabase/server.ts` — 서버 컴포넌트·Server Action·Route Handler 용 클라이언트 (cookies().set/get 인터페이스 사용)
- [ ] `lib/supabase/client.ts` — 클라이언트 컴포넌트 용 (브라우저 cookies)
- [ ] `lib/supabase/admin.ts` — `SUPABASE_SERVICE_ROLE_KEY` 사용 (관리자 전용 · RLS 우회). 서버 전용. 클라이언트 import 금지
- [ ] `middleware.ts` — Next.js 미들웨어로 세션 자동 갱신 (Supabase SSR 표준 패턴)
- [ ] Supabase Dashboard 에서 Auth Settings 검토:
  - Email 확인 필수 ON (가입 검증 메일)
  - JWT Expiry 1시간 (REQ-NF-019)
  - Password 최소 길이 8자
  - 외부 OAuth 비활성 (PII 최소 — REQ-NF-014)
- [ ] 헬스체크 라우트 `/api/health/auth` 임시 추가 — 클라이언트 인스턴스 정상 생성 확인
- [ ] 환경 변수 누락 시 빌드 시점 에러로 fail-fast 처리 (zod 환경 검증 또는 `lib/env.ts`)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 환경 변수 누락 시 빌드 차단
- **Given**: `.env.local` 또는 Vercel 에서 `NEXT_PUBLIC_SUPABASE_URL` 가 누락
- **When**: `npm run build` 실행
- **Then**: 빌드가 명시적 에러로 실패. 에러 메시지에 누락 변수명 명시

### Scenario 2: 서버 클라이언트 정상 생성
- **Given**: 환경 변수 3종이 모두 설정됨
- **When**: `lib/supabase/server.ts` 의 `createClient()` 를 Server Action 에서 호출
- **Then**: `SupabaseClient` 인스턴스 반환. `client.auth.getSession()` 호출 시 에러 없이 응답 (세션은 null 가능)

### Scenario 3: 클라이언트 안전 격리
- **Given**: 클라이언트 컴포넌트에서 `lib/supabase/admin.ts` 를 import 시도
- **When**: 빌드 또는 런타임
- **Then**: 빌드 에러 또는 런타임 에러로 차단됨 (`SUPABASE_SERVICE_ROLE_KEY` 가 클라이언트 번들에 포함되지 않음)

### Scenario 4: 미들웨어 세션 갱신
- **Given**: 만료 임박한 세션 쿠키를 가진 사용자
- **When**: 페이지 요청
- **Then**: `middleware.ts` 가 자동으로 세션 갱신. 사용자는 재로그인 없이 계속 사용 가능

### Scenario 5: 헬스체크 라우트 응답
- **Given**: `/api/health/auth` 라우트 호출
- **When**: GET 요청
- **Then**: 200 응답 + `{ ok: true, supabase_url_present: true }` (실제 URL 값은 노출 안함)

## :gear: Technical & Non-Functional Constraints
- **클라이언트 분리 강제**: 서버용·클라이언트용·관리자용 클라이언트 3종을 별도 파일로 분리. 한 파일 안에서 mixed export 금지
- **SERVICE_ROLE_KEY 보안**: 절대 `NEXT_PUBLIC_` prefix 금지. 클라이언트 번들에 포함되지 않도록 격리. import 경로 정적 분석으로 가드
- **환경 변수 검증**: 빌드 시점에 zod 또는 동등 도구로 검증. 런타임 첫 요청 시 발견되는 것 금지 (fail-fast)
- **세션 정책 (REQ-NF-019)**:
  - 쿠키 옵션: HttpOnly + Secure + SameSite=Lax
  - JWT 만료: 1시간
  - 리프레시 토큰: 30일
- **PII 최소 (REQ-NF-014)**: Supabase Auth 의 metadata 컬럼에 PII 저장 금지. 이메일·닉네임만 허용
- **금지**: OAuth 외부 제공자 (Google, GitHub 등) 활성화 금지 (CON-01 PII 최소 + 단순화)
- **로컬 개발**: SQLite 환경에서는 Supabase Auth 가 작동하지 않으므로, 로컬 개발 시 Supabase Free 인스턴스의 dev 프로젝트를 별도 사용

## :checkered_flag: Definition of Done (DoD)
- [ ] 5개 GWT 시나리오 전부 통과
- [ ] 3개 클라이언트 파일 (`server.ts`, `client.ts`, `admin.ts`) 분리 완료
- [ ] `middleware.ts` 세션 자동 갱신 동작 확인
- [ ] `.env.example` 커밋 (`.env.local` 은 `.gitignore`)
- [ ] Vercel 3환경(Prod/Preview/Dev) 환경변수 등록 완료
- [ ] Supabase Dashboard 의 Auth 설정 (Email 확인·JWT 만료·외부 OAuth 비활성) 스크린샷 또는 설정 export 가 PR 에 첨부
- [ ] `lib/env.ts` 환경 검증 통과
- [ ] 헬스체크 `/api/health/auth` 200 OK 확인
- [ ] 클라이언트 번들 분석에서 `SERVICE_ROLE_KEY` 미포함 확인 (`@next/bundle-analyzer`)
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-VC-001 (Vercel Hobby 프로젝트 + Git Push 자동 배포)
  - IF-SUP-001 (Supabase Free 프로젝트 + Auth 활성화 + Storage 버킷)
  - CT-DB-002 (User 모델 — Supabase Auth 의 auth.users 와 public.User 매핑 관계 결정)
- **Blocks**:
  - FW-AUTH-002 (회원가입 — Supabase Auth 의 signUp 호출 의존)
  - FW-AUTH-003 (로그인 — signInWithPassword 호출 의존)
  - FW-AUTH-004 (가입 확인 메일 — Resend 통합)
  - FW-AUTH-005 (사용자 환경설정 PATCH)
  - FR-AUTH-001 (현재 사용자 세션 조회)
  - FR-AUTH-002 (RBAC 가드)
  - 사실상 인증이 필요한 거의 모든 후속 태스크
