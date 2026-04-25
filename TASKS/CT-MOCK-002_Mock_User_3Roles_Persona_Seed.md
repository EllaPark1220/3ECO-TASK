# [Feature] CT-MOCK-002: 학습자/교사/관리자 3역할 시드 + 가입 검증·접근성 토글 테스트 페르소나

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-MOCK-002: User 시드 — LEARNER/TEACHER/ADMIN 각 1명 + 페르소나별 환경설정 + Supabase Auth 통합 + idempotency"
labels: 'feature, backend, mock, auth, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-MOCK-002] User 테이블 + Supabase Auth 의 시드 데이터 — LEARNER/TEACHER/ADMIN 3역할 각 1명 + 페르소나별 환경설정 (한정숙=fontSize='LARGE'·colorMode='DARK', 김성호=accessibilityMode=true 등) + idempotent 시드 스크립트
- **목적**: 모든 인증·RBAC 테스트의 데이터 기반. CT-MOCK-001 (Lesson 10편) 과 함께 Alpha 환경의 픽스처 완성. INV-07 (RBAC 강제) 검증 + Story 3 (TEACHER 픽스처) + Story 5 (접근성 픽스처) 의 진입점.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.2.2` — USER 테이블 + Role enum
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-021 (RBAC 3역할)
  - `/docs/SRS_V0_9.md#1.4` — 페르소나 (한정숙·김성호·장은혜)
- 페르소나: SH-04 한정숙, SH-08 김성호, SH-05 장은혜
- 선행: CT-DB-002 (User 모델 + enum), FW-AUTH-001 (Supabase Auth), CT-MOCK-001 (Lesson 시드)
- 짝: CT-MOCK-003 (Progress·Stamp 시드), CT-MOCK-004 (MSW)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `prisma/seed/users.ts` 신규 파일
- [ ] **Supabase Auth + public.User 동시 INSERT 정책**:
  - Supabase Auth admin API 활용 — `supabase.auth.admin.createUser({ email, password, email_confirm: true })`
  - 본 admin API 가 auth.users 에 INSERT + UUID 발급
  - 동일 UUID 로 public.User 에 추가 INSERT (Prisma)
- [ ] **시드 5명 정의 (3역할 + Story 5 페르소나 2명)**:
  ```ts
  const seedUsers = [
    {
      email: 'learner@test.example.com',
      password: 'SeedPass123!',
      role: 'LEARNER',
      nickname: '학습자',
      preferences: {},  // 기본값
    },
    {
      email: 'teacher@test.example.com',
      password: 'SeedPass123!',
      role: 'TEACHER',
      nickname: '장은혜',  // SH-05
      preferences: {},
    },
    {
      email: 'admin@test.example.com',
      password: 'SeedPass123!',
      role: 'ADMIN',
      nickname: '관리자',
      preferences: {},
    },
    {
      email: 'jeongsook@test.example.com',
      password: 'SeedPass123!',
      role: 'LEARNER',
      nickname: '한정숙',  // SH-04 저시력
      preferences: {
        accessibilityMode: true,
        fontSize: 'LARGE',
        colorMode: 'DARK',
        mediaPreference: 'TEXT',  // 글로 읽기 선호
      },
    },
    {
      email: 'sungho@test.example.com',
      password: 'SeedPass123!',
      role: 'LEARNER',
      nickname: '김성호',  // SH-08 키보드·청각
      preferences: {
        accessibilityMode: true,
        fontSize: 'MEDIUM',
        colorMode: 'SYSTEM',
        mediaPreference: 'VIDEO',  // 자막 기본 ON
      },
    },
  ];
  ```
- [ ] **idempotent 시드 스크립트**:
  ```ts
  import { createClient } from '@supabase/supabase-js';
  import { prisma } from '@/lib/db';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  async function seedUser(seed: typeof seedUsers[number]) {
    // 1. 기존 사용자 확인 (이메일)
    const { data: existing } = await supabase.auth.admin.listUsers();
    const found = existing?.users.find(u => u.email === seed.email);

    let userId: string;
    if (found) {
      userId = found.id;
    } else {
      // 2. Supabase Auth 생성
      const { data, error } = await supabase.auth.admin.createUser({
        email: seed.email,
        password: seed.password,
        email_confirm: true,  // 이메일 확인 자동 완료
      });
      if (error) throw error;
      userId = data.user!.id;
    }

    // 3. public.User upsert (idempotent)
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: seed.email,
        nickname: seed.nickname,
        role: seed.role,
        ...seed.preferences,
      },
      update: {
        nickname: seed.nickname,
        role: seed.role,
        ...seed.preferences,
      },
    });
  }

  for (const seed of seedUsers) {
    await seedUser(seed);
  }
  ```
- [ ] **이메일 패턴 정책 — `*.test.example.com`**:
  - 실제 사용 도메인 (예: `gmail.com`) 절대 사용 금지 (충돌 위험)
  - `test.example.com` — RFC 6761 reserved domain
- [ ] **비밀번호 정책**:
  - 시드용 — `SeedPass123!` (8자+대소문자+숫자+특수)
  - 운영 환경에서는 시드 사용자도 별도 비밀번호 변경 권장 (별도 SOP)
- [ ] **이메일 확인 자동 처리** — `email_confirm: true` 로 가입 즉시 로그인 가능
- [ ] **`prisma/seed/index.ts` 통합** — Module → Lesson → User → OxQuestion 순서
- [ ] **테스트 활용 정책**:
  - E2E 테스트 (TS-E2E-001~010) — 본 시드의 사용자 활용
  - 단위 테스트 — 별도 mock (DB 미접근) 사용
- [ ] **시드 검증 스크립트** — `prisma/seed/verify-users.ts`:
  ```ts
  // 5명 모두 존재 + role + preferences 정합 검증
  const expected = [
    { email: 'learner@test.example.com', role: 'LEARNER', accessibilityMode: false },
    { email: 'teacher@test.example.com', role: 'TEACHER' },
    { email: 'admin@test.example.com', role: 'ADMIN' },
    { email: 'jeongsook@test.example.com', accessibilityMode: true, fontSize: 'LARGE' },
    { email: 'sungho@test.example.com', accessibilityMode: true },
  ];
  for (const exp of expected) {
    const user = await prisma.user.findUnique({ where: { email: exp.email } });
    if (!user) throw new Error(`${exp.email} 시드 누락`);
    // 필드별 검증...
  }
  ```
- [ ] **CI 통합** — `npm run db:seed` 실행 + verify-users 통과 검증
- [ ] **외부 노출 부재 정책**: 시드 사용자 비밀번호는 코드에 hardcoding 되지만 **운영 환경에서는 시드 사용자 자체 비활성** (별도 환경변수 `SEED_USERS=true` 시에만 시드 실행)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 시드 정상 실행 — 5명 INSERT
- **Given**: 클린 DB
- **When**: `npm run db:seed`
- **Then**: Supabase Auth 5명 + public.User 5건 INSERT. 에러 0

### Scenario 2: idempotent 재실행
- **Given**: 1차 시드 완료 후
- **When**: 재실행
- **Then**: 에러 0. upsert 로 동일 결과

### Scenario 3: 페르소나별 환경설정 정합
- **Given**: 시드 후
- **When**: `prisma.user.findUnique({ where: { email: 'jeongsook@test.example.com' } })`
- **Then**: accessibilityMode=true, fontSize='LARGE', colorMode='DARK', mediaPreference='TEXT'

### Scenario 4: 3역할 모두 존재
- **Given**: 시드 후
- **When**: `groupBy({ by: ['role'], _count: true })`
- **Then**: LEARNER 3, TEACHER 1, ADMIN 1 (한정숙·김성호 LEARNER 포함)

### Scenario 5: Supabase Auth + public.User UUID 일치
- **Given**: 시드 후
- **When**: 임의 사용자의 auth.users.id 와 public.User.id 비교
- **Then**: 일치. sync 정상

### Scenario 6: 이메일 확인 자동 완료
- **Given**: 시드 사용자 로그인 시도
- **When**: `signInWithPassword({ email, password })`
- **Then**: 즉시 로그인 성공. email_confirm 단계 우회

### Scenario 7: verify-users 검증 통과
- **Given**: 시드 후
- **When**: `npm run db:seed:verify-users`
- **Then**: 5명 모두 정합 검증 통과

### Scenario 8: 의도적 데이터 변형 시 검증 실패
- **Given**: 한정숙의 accessibilityMode=false 로 변경
- **When**: verify 실행
- **Then**: 검증 실패 — "accessibilityMode 정합 위반"

### Scenario 9: 운영 환경 시드 차단
- **Given**: NODE_ENV=production + SEED_USERS 환경변수 미설정
- **When**: `npm run db:seed`
- **Then**: 시드 사용자 부분 skip. 에러 0 (Lesson·OxQuestion 만 시드)

### Scenario 10: 테스트 도메인 부재 검증
- **Given**: 모든 시드 사용자 이메일
- **When**: 정규식 검사
- **Then**: 모두 `*.test.example.com` 패턴. gmail·naver 등 실제 도메인 0건

## :gear: Technical & Non-Functional Constraints
- **Supabase Auth + public.User 동시 INSERT**: admin API 활용. UUID sync 보장
- **`*.test.example.com` 강제**: RFC 6761 reserved. 실제 도메인 충돌 0
- **idempotent 정책**: upsert + 기존 사용자 확인. 재실행 안전
- **이메일 확인 자동**: `email_confirm: true` — 로그인 즉시 가능
- **운영 환경 시드 차단**: `NODE_ENV=production && SEED_USERS!=true` 시 사용자 시드 skip
- **페르소나 정합**: SRS 의 SH-04 한정숙, SH-08 김성호, SH-05 장은혜 와 정확히 매핑
- **5명으로 충분한 이유**:
  - 3역할 (RBAC 검증) — LEARNER + TEACHER + ADMIN
  - Story 5 페르소나 (접근성 검증) — 한정숙 + 김성호
  - 일반 LEARNER (박지훈 페르소나) 는 시드 제외 — 동적 생성 (가입 흐름 테스트용)
- **비밀번호 정책**: 시드용 단순. 운영 환경 사용자는 자체 가입 흐름
- **CI 통합**: 매 PR 시드 + verify 자동 실행
- **금지**:
  - 실제 도메인 사용 (gmail·naver 등)
  - 비밀번호 평문 노출 (시드 외 운영 환경에 leak 금지)
  - UUID sync 깨짐 (auth.users vs public.User)
  - 운영 환경 무조건 시드 (계정 정보 leak)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `prisma/seed/users.ts` 5명 시드 스크립트
- [ ] Supabase Auth + public.User UUID sync 검증
- [ ] 페르소나별 환경설정 정합 (한정숙·김성호)
- [ ] idempotent 재실행 안전
- [ ] verify-users 검증 스크립트
- [ ] 운영 환경 시드 차단 정책 적용
- [ ] CI 통합 — 매 PR 자동 실행
- [ ] PR 본문에 "RBAC + Story 5 페르소나 시드. 모든 인증 테스트의 데이터 기반" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-002 (User 모델 + Role enum + 환경설정 컬럼)
  - FW-AUTH-001 (Supabase Auth 클라이언트)
  - IF-SUP-001 (Supabase 프로젝트)
- **Blocks**:
  - 모든 E2E 테스트 (TS-E2E-001~010) — 본 시드 활용
  - TS-UT-001, 002, 013 (Auth 단위 테스트)
  - CT-MOCK-003 (Progress·Stamp 시드 — 본 사용자 기반)
  - TS-E2E-007 (장은혜 — TEACHER 픽스처)
  - TS-E2E-003 (한정숙 — 저시력 픽스처)
  - TS-E2E-004 (김성호 — 키보드 픽스처)
- **Related**:
  - 콘텐츠 편집 SOP — 시드 사용자 비밀번호 별도 안전 보관
