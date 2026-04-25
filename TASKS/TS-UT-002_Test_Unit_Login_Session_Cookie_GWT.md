# [Test] TS-UT-002: 로그인 세션 단위 테스트 — HttpOnly·Secure·SameSite=Lax 쿠키 검증

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-UT-002: 로그인 세션 GWT 단위 테스트 — HttpOnly + Secure + SameSite=Lax 쿠키 발급 + 에러 분리 + 열거 공격 방지"
labels: 'test, unit, auth, security, session, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-UT-002] 로그인 Server Action (`signIn()`) + 로그아웃 (`signOut()`) 의 GWT 단위 테스트
- **목적**: FW-AUTH-003 (로그인·세션) 의 Acceptance Criteria 를 자동화 테스트 코드로 변환하여, REQ-NF-019 (세션 관리 — HttpOnly + Secure + SameSite=Lax) 가 매 PR 에서 회귀 검증된다. 특히 세션 쿠키 보안 속성, 사용자 열거 공격 방지 (동일 응답), 5회 연속 실패 잠금 등 보안 핵심을 자동 검증.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-019 (세션 관리)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-06 (단방향 해시)
  - `/docs/SRS_V0_9.md#5.1` — TC-001~006 (Story 1 AC)
- 테스트 대상: FW-AUTH-003 (`signIn()`, `signOut()` Server Action)
- 테스트 프레임워크: Vitest (또는 Jest)
- 선행: FW-AUTH-003 (로그인·세션 구현 — 테스트 대상)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `__tests__/unit/auth/login.test.ts` 테스트 파일 생성
- [ ] **테스트 환경 설정**:
  - Supabase Auth mock (`signInWithPassword` 응답 stub)
  - Next.js `cookies()` mock (`next/headers` — `Set-Cookie` 헤더 캡처)
  - 테스트 사용자 시드 (email confirmed 상태)
- [ ] **9개 GWT 시나리오 구현** (FW-AUTH-003 AC 와 1:1 매핑):

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { signIn, signOut } from '@/app/auth/actions';

  describe('signIn() Server Action', () => {

    // Scenario 1: 정상 로그인 — 세션 쿠키 발급
    it('Given 확인 완료 사용자, When signIn 호출, Then ok=true + 세션 쿠키 발급', async () => {
      const result = await signIn({
        email: 'alice@example.com',
        password: 'secure1234',
      });
      expect(result.ok).toBe(true);
      expect(result.redirect_to).toBe('/lessons');
    });

    // Scenario 2: 잘못된 비밀번호 — INVALID_CREDENTIALS
    it('Given 잘못된 비밀번호, When signIn 호출, Then INVALID_CREDENTIALS (401)', async () => {
      const result = await signIn({
        email: 'alice@example.com',
        password: 'wrongpassword',
      });
      expect(result.error_code).toBe('INVALID_CREDENTIALS');
    });

    // Scenario 3: 이메일 미확인 — EMAIL_NOT_CONFIRMED
    it('Given 미확인 이메일, When signIn 호출, Then EMAIL_NOT_CONFIRMED (403)', async () => {
      const result = await signIn({
        email: 'unconfirmed@example.com',
        password: 'secure1234',
      });
      expect(result.error_code).toBe('EMAIL_NOT_CONFIRMED');
    });

    // Scenario 4: 미가입 이메일 — 동일 INVALID_CREDENTIALS (열거 공격 방지)
    it('Given 미가입 이메일, When signIn 호출, Then 동일 INVALID_CREDENTIALS (열거 공격 방지)', async () => {
      const result = await signIn({
        email: 'nobody@example.com',
        password: 'anypassword',
      });
      expect(result.error_code).toBe('INVALID_CREDENTIALS');
      // 응답 형식이 Scenario 2 와 동일해야 함
    });

    // Scenario 5: 세션 쿠키 보안 속성 검증
    it('Given 정상 로그인, When Set-Cookie 헤더 검사, Then HttpOnly + Secure + SameSite=Lax', async () => {
      // cookies() mock 에서 Set-Cookie 헤더 캡처
      const cookies = getCapturedCookies();
      for (const cookie of cookies) {
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).toContain('Path=/');
      }
    });

    // Scenario 6: 5회 연속 실패 → 잠금
    it('Given 5회 연속 잘못된 비밀번호, When 6번째 시도, Then ACCOUNT_LOCKED (423)', async () => {
      for (let i = 0; i < 5; i++) {
        await signIn({ email: 'alice@example.com', password: 'wrong' });
      }
      const result = await signIn({ email: 'alice@example.com', password: 'wrong' });
      expect(result.error_code).toBe('ACCOUNT_LOCKED');
    });

    // Scenario 7: 로그아웃 — 쿠키 만료
    it('Given 로그인 상태, When signOut 호출, Then 세션 쿠키 만료', async () => {
      await signIn({ email: 'alice@example.com', password: 'secure1234' });
      const result = await signOut();
      expect(result.ok).toBe(true);
      // cookies() 에서 Max-Age=0 또는 Expires=past 확인
    });

    // Scenario 8: EventLog 기록 — 성공·실패 양측
    it('Given signIn 시도, When 성공 또는 실패, Then EventLog에 auth.signin_attempt 기록', async () => {
      await signIn({ email: 'alice@example.com', password: 'secure1234' });
      // EventLog 검증: { eventName: 'auth.signin_attempt', payload: { success: true, email: 'a***@e***.com' } }
      const logs = await prisma.eventLog.findMany({ where: { eventName: 'auth.signin_attempt' } });
      expect(logs.length).toBeGreaterThan(0);
      // 이메일 마스킹 검증
      expect(logs[0].payload.email).not.toBe('alice@example.com');
      expect(logs[0].payload.email).toMatch(/^a\*+@/);
    });

    // Scenario 9: 비밀번호 평문 로깅 부재
    it('Given signIn 시도, When EventLog 검사, Then 평문 비밀번호 0건', async () => {
      await signIn({ email: 'alice@example.com', password: 'secure1234' });
      const logs = await prisma.eventLog.findMany({ where: { eventName: 'auth.signin_attempt' } });
      for (const log of logs) {
        const payload = JSON.stringify(log.payload);
        expect(payload).not.toContain('secure1234');
        expect(payload).not.toContain('password');
      }
    });
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 로그인 — ok=true + redirect
- **Given**: 가입 + 이메일 확인 완료 사용자
- **When**: 정확한 credentials 로 `signIn()` 호출
- **Then**: `{ ok: true, redirect_to: '/lessons' }`

### Scenario 2: 잘못된 비밀번호 — INVALID_CREDENTIALS
- **Given**: 가입 사용자 + 잘못된 비밀번호
- **When**: `signIn()` 호출
- **Then**: `{ error_code: 'INVALID_CREDENTIALS' }`

### Scenario 3: 미확인 이메일 — EMAIL_NOT_CONFIRMED
- **Given**: 가입했지만 메일 미확인
- **When**: 정확한 비밀번호로 `signIn()` 호출
- **Then**: `{ error_code: 'EMAIL_NOT_CONFIRMED' }`

### Scenario 4: 열거 공격 방지 — 미가입 이메일도 동일 응답
- **Given**: DB 에 없는 이메일
- **When**: `signIn()` 호출
- **Then**: Scenario 2 와 **동일한** `INVALID_CREDENTIALS` 응답

### Scenario 5: 쿠키 보안 속성 — HttpOnly + Secure + SameSite=Lax
- **Given**: 정상 로그인 후
- **When**: `Set-Cookie` 헤더 검사
- **Then**: 모든 세션 쿠키에 3개 속성 포함

### Scenario 6: 5회 연속 실패 → ACCOUNT_LOCKED
- **Given**: 동일 이메일 5회 잘못된 비밀번호
- **When**: 6번째 시도
- **Then**: `{ error_code: 'ACCOUNT_LOCKED' }` (423)

### Scenario 7: 로그아웃 — 쿠키 만료
- **Given**: 로그인 상태
- **When**: `signOut()` 호출
- **Then**: 세션 쿠키 `Max-Age=0`

### Scenario 8: EventLog — 이메일 마스킹
- **Given**: 로그인 시도
- **When**: EventLog 확인
- **Then**: 이메일 마스킹됨 (`a***@e***.com`). 평문 이메일 0건

### Scenario 9: EventLog — 비밀번호 평문 0건
- **Given**: 로그인 시도
- **When**: EventLog 전수 검사
- **Then**: 비밀번호 평문 0건. `password` 키 자체 미포함

## :gear: Technical & Non-Functional Constraints
- **테스트 프레임워크**: Vitest (Next.js App Router 호환)
- **cookies() mock**: `vi.mock('next/headers')` 로 `cookies()` 객체 stub. `Set-Cookie` 캡처를 위한 커스텀 mock
- **Supabase Auth mock**: `signInWithPassword` 의 성공·실패 응답 stub:
  - 성공: `{ data: { user, session }, error: null }`
  - 실패: `{ data: null, error: { message: 'Invalid login credentials' } }`
- **테스트 데이터**: `beforeEach` 에서 테스트 사용자 시드 (confirmed + unconfirmed)
- **실행 시간 목표**: 9개 시나리오 전체 ≤ 10초
- **열거 공격 검증**: Scenario 2 와 4 의 응답 구조·에러 코드가 완전 동일한지 `deepEqual` 비교
- **금지**:
  - 실제 Supabase Auth 호출 (단위 테스트는 mock 전용)
  - 테스트 간 세션 상태 공유

## :checkered_flag: Definition of Done (DoD)
- [ ] 9개 GWT 시나리오 테스트 코드 구현 + 전부 통과
- [ ] `__tests__/unit/auth/login.test.ts` 파일 생성
- [ ] cookies() mock — Set-Cookie 헤더 캡처 동작
- [ ] 쿠키 보안 속성 (HttpOnly + Secure + SameSite=Lax) 자동 검증
- [ ] 열거 공격 방지 — Scenario 2·4 동일 응답 검증
- [ ] 5회 연속 실패 잠금 검증
- [ ] EventLog 마스킹 + 평문 부재 검증
- [ ] CI 에서 자동 실행 확인
- [ ] PR 본문에 "FW-AUTH-003 의 AC → 자동화 테스트. REQ-NF-019 세션 보안 검증" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-AUTH-003 (로그인·세션 Server Action — 테스트 대상)
  - CT-DB-009 (EventLog — 마스킹 검증)
  - IF-CI-001 (CI 파이프라인)
- **Blocks**:
  - 없음 (테스트 태스크)
- **Related**:
  - TS-UT-001 (회원가입 테스트 — 짝)
  - REQ-NF-019 (세션 관리)
  - TS-E2E-001 (박지훈 E2E — 가입·로그인 포함)
