# [Feature] CT-DB-002: User 모델 + Role enum + 환경설정 컬럼 (Auth 데이터 기반)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-DB-002: User 모델 + Role enum (LEARNER/TEACHER/ADMIN) + accessibilityMode/mediaPreference/fontSize/colorMode 환경설정"
labels: 'feature, backend, db, auth, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-DB-002] User 테이블 정의 — Supabase Auth 의 `auth.users` 와 1:1 매핑되는 `public.User` 모델 + Role enum + 환경설정 컬럼 4종
- **목적**: 모든 인증·권한·접근성 기능의 데이터 기반. SRS §6.2.2 USER 테이블 정의의 코드 구현. PII 최소 정책 (REQ-NF-014) 강제 — 컬럼 정의 자체로 결제·성명·연락처 같은 PII 차단. INV-07 (역할 격리) 의 데이터 레이어 진입.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.2.2` — USER 테이블 정의 (모든 컬럼)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-06 (단방향 해시), INV-07 (역할 격리)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-014 (PII 최소), REQ-NF-021 (RBAC 3역할)
  - `/docs/SRS_V0_9.md#4.1.5` — REQ-FUNC-026, 027 (mediaPreference, fontSize)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-01 (PII 정책), CON-02 (결제 금지)
- 선행: CT-DB-001 (Prisma 초기화)
- 관련: FW-AUTH-001 (Supabase Auth 통합)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `prisma/schema.prisma` 에 `Role` enum 정의:
  ```prisma
  enum Role {
    LEARNER
    TEACHER
    ADMIN
  }
  ```
- [ ] `MediaPreference` enum:
  ```prisma
  enum MediaPreference {
    VIDEO
    TEXT
    MIXED
  }
  ```
- [ ] `FontSize` enum:
  ```prisma
  enum FontSize {
    SMALL
    MEDIUM
    LARGE
  }
  ```
- [ ] `ColorMode` enum:
  ```prisma
  enum ColorMode {
    LIGHT
    DARK
    SYSTEM
  }
  ```
- [ ] `User` 모델 정의:
  ```prisma
  model User {
    id                 String          @id @default(uuid())  // Supabase auth.users.id 와 동일
    email              String          @unique
    nickname           String          @db.VarChar(40)
    role               Role            @default(LEARNER)
    accessibilityMode  Boolean         @default(false)
    mediaPreference    MediaPreference @default(MIXED)
    fontSize           FontSize        @default(MEDIUM)
    colorMode          ColorMode       @default(SYSTEM)
    createdAt          DateTime        @default(now())
    updatedAt          DateTime        @updatedAt

    // Relations
    lessonProgress     LessonProgress[]
    stamps             Stamp[]
    teacherFeedbacks   TeacherFeedback[]
    eventLogs          EventLog[]

    @@index([role])
    @@index([createdAt])
  }
  ```
- [ ] **PII 최소 정책 강제** — 컬럼 화이트리스트 명시. 다음 컬럼 절대 추가 금지:
  - 성명 (full_name, real_name)
  - 연락처 (phone, mobile)
  - 주소 (address, zip_code)
  - 생년월일 (birth_date, age — 단 콘텐츠 적합성 판단을 위한 연령대 enum 은 별도 협의)
  - 결제 (card_*, account_*, payment_*)
  - 소득·재산 (income, asset_*)
- [ ] **enum 단일 정의 출처 (Single Source of Truth)**:
  - Prisma schema 가 enum 의 소스
  - TypeScript 타입은 `import type { Role, MediaPreference, FontSize, ColorMode } from '@prisma/client'`
  - Zod 스키마는 `z.nativeEnum(Role)` 활용
- [ ] **Supabase auth.users 와 동기화 정책**:
  - `User.id = auth.users.id` (UUID 일치 보장)
  - 가입 시 (FW-AUTH-002) trigger 또는 webhook 으로 양 테이블 동시 INSERT
  - 본 태스크는 모델 정의만, 동기화 로직은 FW-AUTH-002 가 담당
- [ ] 마이그레이션 생성 — `npx prisma migrate dev --name add_user_model`
- [ ] 마이그레이션 SQL 검토:
  - `CREATE UNIQUE INDEX "User_email_key" ON "User"("email");`
  - `CREATE INDEX "User_role_idx" ON "User"("role");`
  - `CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");`
- [ ] **CI 정적 분석 통합** — TS-STATIC-001 의 키워드 사전 또는 별도 검사기에 PII 컬럼명 (`phone`, `address`, `card_*` 등) 추가. schema.prisma 에 검출 시 빌드 차단

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: User 정상 INSERT
- **Given**: Prisma 마이그레이션 적용 완료
- **When**: `prisma.user.create({ data: { email: 'test@example.com', nickname: 'Test' } })` 호출
- **Then**: User 1건 INSERT. 기본값 — role='LEARNER', accessibilityMode=false, mediaPreference='MIXED', fontSize='MEDIUM', colorMode='SYSTEM'

### Scenario 2: email UNIQUE 제약
- **Given**: User(`alice@example.com`) 가 존재
- **When**: 동일 email 로 INSERT 시도
- **Then**: P2002 발생. UNIQUE 제약 위반

### Scenario 3: nickname 길이 제약
- **Given**: 41자 이상 nickname
- **When**: INSERT 시도
- **Then**: PostgreSQL 의 VARCHAR(40) 제약으로 거부 (또는 Prisma 의 length validation)

### Scenario 4: Role enum 검증
- **Given**: User
- **When**: `role = 'INVALID'` 로 INSERT 시도
- **Then**: Prisma 가 enum 위반으로 거부. TypeScript 컴파일 시점에도 차단

### Scenario 5: PII 컬럼 부재 검증 (CI 정적 분석)
- **Given**: 누군가 schema 에 `phone String` 추가 시도
- **When**: PR 생성 + CI 정적 분석 실행
- **Then**: PII 키워드 검출. 빌드 차단. PR 코멘트로 안내

### Scenario 6: 마이그레이션 idempotency
- **Given**: 마이그레이션 1회 적용 완료
- **When**: `prisma migrate deploy` 재실행
- **Then**: "No pending migrations". 변경 0

### Scenario 7: SQLite + PostgreSQL 호환
- **Given**: 동일 schema
- **When**: 양 환경에서 마이그레이션
- **Then**: 양 환경 모두 정상. enum·UNIQUE 제약 동일 동작

### Scenario 8: TypeScript 타입 export
- **Given**: `prisma generate` 후
- **When**: `import { User, Role } from '@prisma/client'`
- **Then**: TypeScript 타입 자동완성. Role 은 `'LEARNER' | 'TEACHER' | 'ADMIN'` 유니온

### Scenario 9: relation cascade 정책
- **Given**: User 삭제 시
- **When**: `prisma.user.delete()` 호출
- **Then**: relation cascade 정책 명시 — LessonProgress·Stamp·TeacherFeedback·EventLog 의 user_id 참조 처리. **본 태스크는 GDPR 대응을 위해 EventLog 는 user_id=NULL 로 anonymize, 나머지는 cascade DELETE 채택** (별도 정책 결정 필요)

## :gear: Technical & Non-Functional Constraints
- **컬럼 화이트리스트 강제 (CON-01·02 + REQ-NF-014·015)**: PII 키워드 (`phone`, `address`, `card`, `account`, `payment` 등) CI 정적 분석으로 차단
- **enum 단일 정의 (SSOT)**: Prisma schema 가 출처. Zod·TypeScript 는 import 또는 `z.nativeEnum()` 활용
- **Supabase auth.users 와 1:1 매핑**: id 가 UUID 로 일치. 본 태스크는 모델만, 동기화 로직은 FW-AUTH-002
- **인덱스 정책**:
  - `email` UNIQUE — 로그인 조회
  - `role` — RBAC 가드의 role 필터
  - `createdAt` — KPI 집계 (월간 가입자)
- **default 값 정책**: 모든 환경설정 컬럼이 명시적 default. 마이그레이션 시 기존 사용자에게 자동 적용
- **마이그레이션 SQL 검토 필수**: PR 리뷰 시 SQL 파일의 CREATE INDEX·CONSTRAINT 라인 확인
- **타입 안전 — TypeScript + Zod 통합**: enum 위반은 TypeScript 컴파일 시점 + 런타임 Zod parse 양쪽에서 차단
- **GDPR 대응 (별도 후속 정책)**: User 삭제 시 cascade vs anonymize 정책. 본 태스크는 cascade DELETE + EventLog 만 anonymize 채택
- **금지**:
  - PII 컬럼 추가 (phone, address, real_name 등)
  - 결제 관련 컬럼 추가
  - role 을 클라이언트 쿠키·localStorage 에 저장 (서버 검증만)
  - enum 값을 매직 스트링으로 하드코딩 (import 강제)

## :checkered_flag: Definition of Done (DoD)
- [ ] 9개 GWT 시나리오 전부 통과
- [ ] User 모델 + 4개 enum 정의 완료
- [ ] PII 컬럼 화이트리스트 + CI 정적 분석 통합
- [ ] 마이그레이션 SQL 파일 커밋
- [ ] `prisma generate` 후 TypeScript 타입 export 검증
- [ ] SQLite + PostgreSQL 양 환경 마이그레이션 정상
- [ ] PR 리뷰 시 SQL 파일 검토
- [ ] PR 본문에 "Auth 데이터 기반. PII 최소 컬럼 화이트리스트 강제" 명시
- [ ] Linter (Prisma Format) 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-001 (Prisma 초기화)
- **Blocks**:
  - CT-DB-004 (LessonProgress — User relation)
  - CT-DB-005 (Stamp — User relation)
  - CT-DB-007 (TeacherFeedback — User relation)
  - CT-DB-009 (EventLog — User relation)
  - FW-AUTH-001 (Supabase Auth 통합 — User 모델 의존)
  - FW-AUTH-002 (회원가입 — User INSERT)
  - FW-AUTH-003 (로그인 — User 조회)
  - FW-AUTH-005 (사용자 환경설정 PATCH)
  - FR-AUTH-001 (현재 세션 조회)
  - FR-AUTH-002 (RBAC 가드 — role 필드 활용)
  - FR-AUTH-003 (색 모드 — colorMode 컬럼)
  - FR-LES-004 (글자 크기 — fontSize 컬럼)
- **Related**:
  - CT-DB-011 (Supabase RLS — User 테이블 정책)
