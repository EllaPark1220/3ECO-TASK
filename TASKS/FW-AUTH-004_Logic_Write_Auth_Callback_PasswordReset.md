# [Feature] FW-AUTH-004: 가입 확인 메일 콜백 + 비밀번호 재설정 흐름 + Resend 통합

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-AUTH-004: /auth/callback 가입 확인 처리 + sendPasswordResetEmail Server Action + 한국어 템플릿"
labels: 'feature, backend, auth, email, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-AUTH-004] `/auth/callback` Route Handler (Supabase 가입 확인 메일 클릭 시 진입) + `sendPasswordResetEmail()` Server Action + 한국어 메일 템플릿 정합
- **목적**: FW-AUTH-002 (가입) 와 FW-AUTH-003 (로그인) 사이의 **이메일 인증 게이트웨이**. Supabase Auth 의 메일 발송 + 본 콜백의 코드 교환 + Custom SMTP (IF-RES-001) 의 한국어 템플릿이 통합되어 사용자가 가입 → 메일 클릭 → 인증 완료 → 로그인 가능 상태가 되도록 한다. INV-06 (단방향 해시 — Supabase Auth) + REQ-NF-019 (세션 관리) 충족.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#3.4.1` — 가입 → 메일 인증 → 로그인 시퀀스
  - `/docs/SRS_V0_9.md#4.1.5` — REQ-FUNC-025 (비밀번호 재설정)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-017 (비밀번호 정책), REQ-NF-019 (세션)
  - `/docs/SRS_V0_9.md#6.1` — `/auth/callback` 엔드포인트
- 외부 문서:
  - `https://supabase.com/docs/guides/auth/auth-helpers/nextjs#code-exchange`
  - `https://supabase.com/docs/guides/auth/passwords#password-reset`
- 선행: FW-AUTH-001 (Supabase SSR), FW-AUTH-002 (가입), IF-RES-001 (Resend), CT-API-001 (응답 포맷)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **`app/auth/callback/route.ts` Route Handler**:
  ```ts
  import { NextResponse, type NextRequest } from 'next/server';
  import { createClient } from '@/lib/supabase/server';

  export async function GET(req: NextRequest) {
    const { searchParams, origin } = new URL(req.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/lessons';

    if (!code) {
      return NextResponse.redirect(`${origin}/auth/login?error=missing_code`);
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(error.message)}`);
    }

    // 인증 성공 → public.User 자동 sync 확인 (별도 trigger 또는 본 단계에서 upsert)
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await syncPublicUser(user); // public.User 가 없으면 INSERT
    }

    return NextResponse.redirect(`${origin}${next}`);
  }
  ```
- [ ] **`syncPublicUser()` 헬퍼 — auth.users ↔ public.User sync**:
  ```ts
  async function syncPublicUser(authUser: User) {
    await prisma.user.upsert({
      where: { id: authUser.id },
      create: {
        id: authUser.id,
        email: authUser.email!,
        nickname: authUser.user_metadata?.nickname || authUser.email!.split('@')[0],
        role: 'LEARNER',
      },
      update: { email: authUser.email! },
    });
  }
  ```
- [ ] **에러 처리 분기**:
  - `code` 누락 — `?error=missing_code`
  - `exchangeCodeForSession` 실패 (만료·재사용) — `?error=...`
  - `syncPublicUser` 실패 — Sentry 알림 + 사용자에게는 graceful 메시지
- [ ] **`sendPasswordResetEmail()` Server Action — `app/auth/actions.ts`**:
  ```ts
  'use server';
  export async function sendPasswordResetEmail(email: string) {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
    });
    if (error) {
      // 사용자 열거 공격 회피 — 항상 동일 응답
      console.error('Password reset error:', error);
    }
    return { ok: true, message: '비밀번호 재설정 메일을 발송했습니다.' };
  }
  ```
- [ ] **사용자 열거 회피 정책** — 이메일 존재 여부와 무관하게 동일 메시지 ("발송했습니다") 반환
- [ ] **`/auth/reset-password` 페이지** — 새 비밀번호 입력 폼 (간단 페이지, 별도 UI 태스크):
  - URL fragment 의 access_token 추출
  - `supabase.auth.updateUser({ password })` 호출
  - 비밀번호 정책 검증 (Zod — 8자 이상)
- [ ] **Custom SMTP (IF-RES-001) 통합 정책**:
  - **Alpha** — Supabase 기본 SMTP 사용 (한국어 템플릿은 Supabase Dashboard 의 Email Templates 에서 직접 편집)
  - **Closed Beta 이후** — Resend SMTP 로 전환 (자체 도메인 발신 + 일관된 브랜딩)
  - 본 태스크는 **Supabase Dashboard 의 한국어 템플릿 편집 + Custom SMTP 활성화 옵션 명세** 까지 포함
- [ ] **Supabase Email Templates 한국어 편집**:
  - **Confirm signup** (가입 확인): 제목 "[경제 판단력 교과서] 이메일 인증을 완료해주세요"
  - **Reset password** (비밀번호 재설정): 제목 "[경제 판단력 교과서] 비밀번호 재설정 안내"
  - 본문 — IF-RES-001 의 템플릿과 동일 톤
  - `{{ .ConfirmationURL }}`, `{{ .Token }}` 등 Supabase 변수 활용
- [ ] **Rate Limit 적용** — `sendPasswordResetEmail` 은 `auth` 정책 (분당 10 req) 활용 (CT-API-001 의 인증 카테고리)
- [ ] **EventLog 발행**:
  - 가입 확인 완료 — `auth.email_confirmed`
  - 비밀번호 재설정 요청 — `auth.password_reset_requested`
  - 비밀번호 변경 완료 — `auth.password_changed`

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 가입 후 메일 클릭 → 인증 완료
- **Given**: 사용자 가입 (FW-AUTH-002) + 메일 수신
- **When**: 메일의 인증 링크 클릭 → `/auth/callback?code=...` 진입
- **Then**: `exchangeCodeForSession` 성공. public.User INSERT (sync). `/lessons` 으로 redirect

### Scenario 2: code 누락
- **Given**: `/auth/callback` 직접 접근 (code 없음)
- **When**: 응답
- **Then**: `/auth/login?error=missing_code` redirect

### Scenario 3: 만료된 code
- **Given**: 만료된 인증 링크 클릭
- **When**: `exchangeCodeForSession` 호출
- **Then**: 에러 → `/auth/login?error=...` redirect. 사용자에게 "링크가 만료되었습니다" 표시

### Scenario 4: code 재사용
- **Given**: 한 번 사용된 인증 링크 재클릭
- **When**: `exchangeCodeForSession` 호출
- **Then**: 에러 → 동일 처리. 보안 강화

### Scenario 5: public.User sync 실패 — Sentry 알림
- **Given**: auth.users INSERT 성공했으나 public.User INSERT 실패 (DB 일시 장애)
- **When**: syncPublicUser 호출
- **Then**: Sentry 알림. 사용자는 graceful 에러 페이지로 redirect

### Scenario 6: 비밀번호 재설정 메일 발송
- **Given**: `sendPasswordResetEmail('user@example.com')` 호출
- **When**: 정상 응답
- **Then**: 200 + "발송했습니다". Supabase 가 메일 발송. 인박스 도착

### Scenario 7: 사용자 열거 회피 — 미존재 이메일도 동일 응답
- **Given**: `sendPasswordResetEmail('not-exist@example.com')` 호출
- **When**: 응답
- **Then**: 동일 200 + "발송했습니다" (사용자 열거 공격 회피). 실제 메일 미발송

### Scenario 8: Rate Limit — 분당 10회 초과
- **Given**: 동일 IP 가 비밀번호 재설정 분당 10회 호출
- **When**: 11번째 시도
- **Then**: 429 + `RATE_LIMIT_EXCEEDED`

### Scenario 9: 한국어 메일 본문
- **Given**: 메일 수신
- **When**: 본문 검사
- **Then**: 한국어 + 자연스러운 문구. 인코딩 깨짐 0

### Scenario 10: EventLog 발행
- **Given**: 인증 콜백·재설정 요청·비밀번호 변경 각 시점
- **When**: EventLog 조회
- **Then**: `auth.email_confirmed`·`auth.password_reset_requested`·`auth.password_changed` 각 1건씩 (PII 미포함)

## :gear: Technical & Non-Functional Constraints
- **사용자 열거 회피 정책 (REQ-NF-018)**: 이메일 존재 여부와 무관하게 동일 응답 + 동일 응답 시간 (timing attack 회피)
- **public.User sync 정책**:
  - 가입 시점 — auth.users INSERT
  - 인증 콜백 — public.User upsert
  - 두 단계 분리로 미인증 사용자의 public.User 진입 차단
- **Custom SMTP 단계적 도입**:
  - Alpha — Supabase 기본 SMTP + Dashboard 한국어 템플릿
  - Closed Beta — Resend Custom SMTP 전환 (자체 도메인)
- **Rate Limit (REQ-NF-018)**: 인증 카테고리 — 분당 10 req
- **redirectTo 정책**: `NEXT_PUBLIC_SITE_URL` 환경변수 기반. Supabase Dashboard 의 Redirect URLs 에 등록 필수
- **응답 시간**: callback ≤ 500ms, sendPasswordResetEmail ≤ 200ms
- **에러 메시지 한국어**: error_code 는 영문 (CT-API-001 정합), message 는 한국어
- **EventLog payload**: email·token 등 PII 미포함. user_id 만
- **금지**:
  - 사용자 열거 (이메일 존재 여부 노출)
  - 인증 메일에 비밀번호·민감정보 포함
  - redirectTo 임의 URL 허용 (open redirect 취약점)
  - public.User 를 가입 시점에 즉시 INSERT (미인증 사용자 차단 위반)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `app/auth/callback/route.ts` 구현
- [ ] `syncPublicUser()` 헬퍼 + 실패 시 Sentry 알림
- [ ] `sendPasswordResetEmail()` Server Action
- [ ] `/auth/reset-password` 페이지 (간단 폼)
- [ ] 사용자 열거 회피 — 동일 응답·동일 시간
- [ ] Supabase Email Templates 한국어 편집
- [ ] Rate Limit 적용 (분당 10 req)
- [ ] EventLog 3종 발행
- [ ] redirectTo Whitelist (Supabase Dashboard 등록)
- [ ] PR 본문에 "FW-AUTH-002·003 사이의 이메일 인증 게이트웨이" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-AUTH-001 (Supabase SSR)
  - FW-AUTH-002 (가입)
  - CT-DB-002 (User)
  - CT-API-001 (Rate Limit + 응답 포맷)
  - IF-SUP-001 (Supabase Email Templates)
  - IF-RES-001 (Resend — Closed Beta 단계 SMTP 전환)
- **Blocks**:
  - FW-AUTH-003 (로그인 — 이메일 인증 완료 사용자만)
  - 모든 가입 → 로그인 흐름
- **Related**:
  - REQ-NF-017, 018, 019 (비밀번호·Rate Limit·세션)
