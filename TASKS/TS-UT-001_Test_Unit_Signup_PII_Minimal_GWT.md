# [Test] TS-UT-001: 회원가입 단위 테스트 — PII 최소 + 결제 필드 거부 GWT

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-UT-001: 회원가입 GWT 단위 테스트 — 이메일+닉네임만 허용, 결제 필드 구조적 거부, accessibility_mode 기본값"
labels: 'test, unit, auth, security, privacy, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-UT-001] 회원가입 Server Action (`signUp()`) 의 GWT 단위 테스트
- **목적**: FW-AUTH-002 (회원가입) 의 Acceptance Criteria 를 자동화 테스트 코드로 변환하여, PRD 원칙 2 (무료 영구) · 원칙 3 (윤리 영구) · REQ-NF-014 (PII 최소) · REQ-NF-015 (결제 금지) 가 코드 레이어에서 영구 강제됨을 회귀 검증한다. CI 에서 매 PR 마다 실행되어 회원가입 정책의 퇴행을 차단한다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-014 (PII 최소), REQ-NF-015 (결제 금지)
  - `/docs/SRS_V0_9.md#5.1` — TC-001~006 (Story 1 AC)
  - `/docs/SRS_V0_9.md#6.3.1` — 가입 시퀀스
- 테스트 대상: FW-AUTH-002 (`signUp()` Server Action)
- 테스트 프레임워크: Vitest (또는 Jest)
- 선행: FW-AUTH-002 (회원가입 구현 — 테스트 대상)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `__tests__/unit/auth/signup.test.ts` 테스트 파일 생성
- [ ] **테스트 환경 설정**:
  - Prisma Client mock (`vitest-mock-extended` 또는 `@prisma/client/mock`)
  - Supabase Auth mock (signUp 응답 stub)
  - Zod 검증은 실제 스키마 사용 (mock 안함)
- [ ] **8개 GWT 시나리오 구현** (FW-AUTH-002 AC 와 1:1 매핑):

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { signUp } from '@/app/auth/actions';

  describe('signUp() Server Action', () => {

    // Scenario 1: 정상 회원가입
    it('Given 유효한 이메일+닉네임+비밀번호, When signUp 호출, Then 201 + User 생성 + accessibility_mode=false', async () => {
      const result = await signUp({
        email: 'alice@example.com',
        nickname: 'Alice',
        password: 'secure1234',
      });
      expect(result.ok).toBe(true);
      expect(result.requires_email_confirmation).toBe(true);
      // DB 검증: User.role === 'LEARNER', accessibilityMode === false
    });

    // Scenario 2: 결제 필드 구조적 거부
    it('Given 결제 필드(card_number) 포함, When signUp 호출, Then 추가 필드 무시 + 정상 가입', async () => {
      const result = await signUp({
        email: 'bob@example.com',
        nickname: 'Bob',
        password: 'secure5678',
        card_number: '1234-5678-9012-3456', // 악의적 추가 필드
        account_number: '110-123-456789',
      } as any);
      expect(result.ok).toBe(true);
      // DB 검증: User 테이블에 card_number, account_number 컬럼 자체 부재
    });

    // Scenario 3: 중복 이메일 — 409
    it('Given 이미 가입된 이메일, When signUp 호출, Then EMAIL_ALREADY_EXISTS', async () => {
      // 1차 가입
      await signUp({ email: 'dup@example.com', nickname: 'Dup1', password: 'secure1234' });
      // 2차 가입 시도
      const result = await signUp({ email: 'dup@example.com', nickname: 'Dup2', password: 'secure5678' });
      expect(result.error_code).toBe('EMAIL_ALREADY_EXISTS');
    });

    // Scenario 4: 잘못된 이메일 — 400
    it('Given 잘못된 이메일 형식, When signUp 호출, Then INVALID_EMAIL', async () => {
      const result = await signUp({
        email: 'not-an-email',
        nickname: 'Test',
        password: 'secure1234',
      });
      expect(result.error_code).toBe('INVALID_EMAIL');
    });

    // Scenario 5: 짧은 비밀번호 — 400
    it('Given 8자 미만 비밀번호, When signUp 호출, Then PASSWORD_TOO_SHORT', async () => {
      const result = await signUp({
        email: 'short@example.com',
        nickname: 'Short',
        password: '123',
      });
      expect(result.error_code).toBe('PASSWORD_TOO_SHORT');
    });

    // Scenario 6: accessibility_mode 기본값 검증
    it('Given 정상 가입, When User 레코드 확인, Then accessibility_mode=false, mediaPreference=MIXED', async () => {
      await signUp({ email: 'default@example.com', nickname: 'Default', password: 'secure1234' });
      // DB 검증
      const user = await prisma.user.findUnique({ where: { email: 'default@example.com' } });
      expect(user?.accessibilityMode).toBe(false);
      expect(user?.mediaPreference).toBe('MIXED');
    });

    // Scenario 7: role 기본값 LEARNER
    it('Given 정상 가입, When User 레코드 확인, Then role=LEARNER', async () => {
      await signUp({ email: 'learner@example.com', nickname: 'Learner', password: 'secure1234' });
      const user = await prisma.user.findUnique({ where: { email: 'learner@example.com' } });
      expect(user?.role).toBe('LEARNER');
    });

    // Scenario 8: Zod strict 모드 — 정의되지 않은 필드 거부
    it('Given Zod strict 스키마, When 추가 필드 포함, Then Zod 에러 또는 필드 무시', async () => {
      // strict 모드에서는 추가 필드가 에러 발생
      // 또는 strip 모드에서는 추가 필드 자동 제거
      // 어느 쪽이든 DB 에 추가 필드 저장 0건
    });
  });
  ```
- [ ] **Prisma 테스트 DB 설정** — SQLite in-memory 또는 별도 테스트 PostgreSQL:
  ```ts
  // vitest.setup.ts
  beforeAll(async () => {
    await prisma.$executeRaw`DELETE FROM "User"`;
  });
  ```
- [ ] **CI 통합** — `.github/workflows/quality.yml` 의 test Job 에 포함

## :test_tube: Acceptance Criteria (BDD/GWT)
> 아래 시나리오들은 FW-AUTH-002 의 AC 를 테스트 코드로 변환한 것이다.

### Scenario 1: 정상 회원가입 — 201 + LEARNER + accessibility_mode=false
- **Given**: 유효한 이메일(`alice@example.com`) + 닉네임(`Alice`) + 비밀번호(`secure1234`)
- **When**: `signUp()` 호출
- **Then**: `{ ok: true }`. User.role='LEARNER', accessibilityMode=false, mediaPreference='MIXED'

### Scenario 2: 결제 필드 구조적 거부 — DB 에 컬럼 자체 부재
- **Given**: `card_number`, `account_number` 등 추가 필드 포함 요청
- **When**: `signUp()` 호출
- **Then**: 추가 필드가 DB 에 절대 저장 안됨 (User 테이블에 해당 컬럼 자체 없음)

### Scenario 3: 중복 이메일 — EMAIL_ALREADY_EXISTS
- **Given**: `dup@example.com` 이미 가입
- **When**: 동일 이메일 재가입
- **Then**: `{ error_code: 'EMAIL_ALREADY_EXISTS' }`

### Scenario 4: 잘못된 이메일 — INVALID_EMAIL
- **Given**: `email: 'not-an-email'`
- **When**: `signUp()` 호출
- **Then**: `{ error_code: 'INVALID_EMAIL' }`

### Scenario 5: 짧은 비밀번호 — PASSWORD_TOO_SHORT
- **Given**: `password: '123'` (8자 미만)
- **When**: `signUp()` 호출
- **Then**: `{ error_code: 'PASSWORD_TOO_SHORT' }`

### Scenario 6: 닉네임 너무 짧음 — INVALID_NICKNAME
- **Given**: `nickname: 'A'` (2자 미만)
- **When**: `signUp()` 호출
- **Then**: Zod 검증 실패

### Scenario 7: 비밀번호 평문 미저장 검증
- **Given**: 정상 가입 완료
- **When**: `auth.users` 테이블 직접 조회
- **Then**: `encrypted_password` 는 bcrypt 해시 (`$2a$...`). 평문 일치 0건

### Scenario 8: 테스트 독립성 — 각 시나리오 격리
- **Given**: 8개 시나리오
- **When**: 순서 무관 실행
- **Then**: 모든 시나리오 독립 통과 (beforeEach 에서 DB 초기화)

## :gear: Technical & Non-Functional Constraints
- **테스트 프레임워크**: Vitest (Next.js 공식 권장) 또는 Jest
- **테스트 DB 전략**:
  - **옵션 A**: SQLite in-memory (Prisma `provider = "sqlite"` — 빠르지만 PostgreSQL 차이 위험)
  - **옵션 B**: Docker PostgreSQL 테스트 인스턴스 (정합성 높음)
  - **옵션 C**: Supabase staging 인스턴스 활용 (가장 정합적이지만 느림)
  - **추천**: 옵션 A (단위 테스트) + 옵션 B/C (통합 테스트)
- **Supabase Auth mock 정책**:
  - 단위 테스트는 `auth.signUp()` mock (네트워크 의존 제거)
  - 통합 테스트 (TS-IT 계열) 에서 실제 Supabase 호출
- **테스트 데이터 격리**: `beforeEach` 에서 관련 테이블 트렁케이트 또는 트랜잭션 롤백
- **CI 실행**: PR 마다 자동 실행. 실패 시 PR 머지 차단
- **실행 시간 목표**: 8개 시나리오 전체 ≤ 10초
- **금지**:
  - 실제 Supabase 인스턴스에 테스트 데이터 잔류 (cleanup 필수)
  - 테스트 간 순서 의존성
  - 하드코딩된 타임스탬프 (테스트 재현성 저해)

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 테스트 코드 구현 + 전부 통과
- [ ] `__tests__/unit/auth/signup.test.ts` 파일 생성
- [ ] Prisma Client mock 또는 테스트 DB 연결
- [ ] Supabase Auth mock 설정
- [ ] CI 에서 자동 실행 확인 (`.github/workflows/quality.yml`)
- [ ] 테스트 실행 시간 ≤ 10초
- [ ] 테스트 격리 (순서 무관 통과)
- [ ] PR 본문에 "FW-AUTH-002 의 AC → 자동화 테스트. PRD 원칙 2·3 영구 검증" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-AUTH-002 (회원가입 Server Action — 테스트 대상)
  - CT-DB-002 (User 모델 — 테스트 검증 대상)
  - IF-CI-001 (CI 파이프라인 — 테스트 실행 환경)
- **Blocks**:
  - 없음 (테스트 태스크 — downstream 기능 의존 없음)
- **Related**:
  - TS-E2E-010 (결제 필드 부재 시각 회귀 — E2E 레벨)
  - REQ-NF-014 (PII 최소)
  - REQ-NF-015 (결제 금지)
