# [Feature] CT-DB-011: Supabase RLS 정책 — defense-in-depth 의 데이터 레이어 마지막 방어선

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-DB-011: Supabase Row-Level Security 정책 — User·LessonProgress·Stamp·TeacherFeedback·EventLog 의 RLS 적용"
labels: 'feature, backend, db, rls, security, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-DB-011] Supabase 의 모든 테이블에 Row-Level Security (RLS) 정책 적용 — anon·authenticated·service_role 별 권한 명시 + 본인 데이터만 접근 + INV-07 (TeacherFeedback INSERT 는 TEACHER 만) 강제 + EventLog append-only 강제
- **목적**: defense-in-depth 의 마지막 방어선. 애플리케이션 가드 (FR-AUTH-002) 가 1차 방어, **RLS 가 데이터 레이어 마지막 방어**. 코드 버그·SQL injection·service_role 키 유출 시에도 다른 사용자 데이터 보호. INV-06 (단방향 해시 — Supabase Auth) + INV-07 (역할 격리) + INV-11 (EventLog append-only) 의 데이터 레이어 강제.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-021 (RBAC), REQ-NF-022 (감사 로그)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-07 (역할 격리), INV-11 (append-only)
  - `/docs/SRS_V0_9.md#3.6.2` — Auth + DB 다층 방어
- 외부 문서:
  - `https://supabase.com/docs/guides/auth/row-level-security`
  - `https://www.postgresql.org/docs/current/ddl-rowsecurity.html`
- 선행: IF-SUP-001 (Supabase), CT-DB-001~010 (모든 모델)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **모든 public 테이블에 RLS 활성화**:
  ```sql
  ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "Lesson" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "LessonProgress" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "Stamp" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "OxQuestion" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "TeacherFeedback" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "TeacherKit" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "EventLog" ENABLE ROW LEVEL SECURITY;
  -- Module 은 공개 — RLS 활성화하되 SELECT 는 anyone
  ALTER TABLE "Module" ENABLE ROW LEVEL SECURITY;
  ```
- [ ] **`User` 테이블 정책** — 본인만 SELECT·UPDATE:
  ```sql
  CREATE POLICY "users_select_self" ON "User"
    FOR SELECT
    USING (auth.uid() = id);

  CREATE POLICY "users_update_self" ON "User"
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

  -- INSERT·DELETE 는 service_role 만 (자동 정책 — RLS 활성 시 anon·authenticated 거부)
  ```
- [ ] **`Lesson`·`Module`·`OxQuestion` 정책** — 누구나 SELECT (콘텐츠 공개):
  ```sql
  CREATE POLICY "lessons_select_anyone" ON "Lesson"
    FOR SELECT
    USING (true);

  CREATE POLICY "modules_select_anyone" ON "Module"
    FOR SELECT
    USING (true);

  CREATE POLICY "ox_questions_select_anyone" ON "OxQuestion"
    FOR SELECT
    USING (true);

  -- INSERT·UPDATE·DELETE 는 service_role 만 (콘텐츠 편집은 admin SOP)
  ```
- [ ] **`LessonProgress` 정책** — 본인만 모든 작업:
  ```sql
  CREATE POLICY "lesson_progress_select_self" ON "LessonProgress"
    FOR SELECT
    USING (auth.uid()::text = "userId");

  CREATE POLICY "lesson_progress_insert_self" ON "LessonProgress"
    FOR INSERT
    WITH CHECK (auth.uid()::text = "userId");

  CREATE POLICY "lesson_progress_update_self" ON "LessonProgress"
    FOR UPDATE
    USING (auth.uid()::text = "userId");
  ```
- [ ] **`Stamp` 정책** — 본인만 SELECT, INSERT·UPDATE·DELETE 는 service_role:
  ```sql
  CREATE POLICY "stamps_select_self" ON "Stamp"
    FOR SELECT
    USING (auth.uid()::text = "userId");

  -- INSERT·UPDATE·DELETE 는 service_role (FW-OX-001 의 트랜잭션이 service_role 사용)
  ```
- [ ] **`TeacherFeedback` 정책 (INV-07 핵심)** — TEACHER role 만 INSERT:
  ```sql
  CREATE POLICY "teacher_feedback_select_self" ON "TeacherFeedback"
    FOR SELECT
    USING (auth.uid()::text = "teacherId");

  CREATE POLICY "teacher_feedback_insert_teacher_only" ON "TeacherFeedback"
    FOR INSERT
    WITH CHECK (
      auth.uid()::text = "teacherId"
      AND EXISTS (
        SELECT 1 FROM "User" WHERE id::text = auth.uid()::text AND role = 'TEACHER'
      )
    );

  -- UPDATE·DELETE 차단 — append-only 패턴
  ```
- [ ] **`TeacherKit` 정책** — anyone SELECT (CC 라이선스 공개), service_role INSERT/UPDATE:
  ```sql
  CREATE POLICY "teacher_kit_select_anyone" ON "TeacherKit"
    FOR SELECT
    USING (true);
  -- INSERT·UPDATE·DELETE 는 service_role (FR-PDF-001 의 백엔드)
  ```
- [ ] **`EventLog` 정책** — append-only 강제:
  ```sql
  -- SELECT — 본인만 (KPI 집계는 service_role 의 별도 권한)
  CREATE POLICY "event_log_select_self" ON "EventLog"
    FOR SELECT
    USING (auth.uid()::text = "userId");

  -- INSERT — service_role 만 (emit 함수 활용)
  -- UPDATE·DELETE — anyone 차단 (RLS 활성 시 자동)
  -- 단 admin anonymize 는 service_role 권한으로 별도 Server Action
  ```
- [ ] **마이그레이션 통합**:
  - 별도 SQL 파일 `prisma/migrations/{ts}_add_rls_policies/migration.sql` 작성
  - 또는 Prisma 의 `unsafeRaw` 활용
  - **본 태스크는 별도 SQL 파일 채택** — Prisma 의 RLS 직접 지원이 제한적이라 raw SQL 권장
- [ ] **service_role 사용 정책**:
  - admin 작업 (시드·anonymize·KPI 집계) — `lib/supabase/admin.ts` (FW-AUTH-001)
  - 일반 사용자 작업 — `lib/supabase/server.ts` (anon + RLS)
- [ ] **테스트 — RLS 우회 검증**:
  - 다른 사용자의 LessonProgress SELECT 시도 → 0건 반환 (RLS 차단)
  - LEARNER 가 TeacherFeedback INSERT 시도 → 거부
  - 익명이 EventLog UPDATE 시도 → 거부
- [ ] **RLS 디버깅 가이드 — `docs/rls-debug.md`**:
  - 정책 활성 여부 확인 (`SELECT * FROM pg_policies`)
  - service_role vs anon 의 차이 디버깅
  - 흔한 실수 (auth.uid() 타입 캐스팅, RLS 비활성 잊음)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 본인 LessonProgress SELECT
- **Given**: User(`u1`) + LessonProgress(u1, L001) + RLS 활성
- **When**: `u1` 의 anon 클라이언트가 SELECT
- **Then**: 본인 LessonProgress 1건 반환

### Scenario 2: 다른 사용자 LessonProgress 차단
- **Given**: User(`u1`) 의 LessonProgress 5건 + User(`u2`) 의 LessonProgress 5건
- **When**: `u2` 가 `prisma.lessonProgress.findMany({ where: { userId: 'u1' } })` 시도
- **Then**: RLS 가 0건 반환 (where 무시하고 RLS 가 우선)

### Scenario 3: TeacherFeedback INSERT — TEACHER 만 (INV-07)
- **Given**: LEARNER 사용자 + 클라이언트가 `teacherId` 를 본인으로 위조
- **When**: `prisma.teacherFeedback.create({ data: { teacherId: ownId, ... } })` 시도
- **Then**: RLS 의 `WITH CHECK` 가 거부 (User.role !== 'TEACHER'). 오류 반환

### Scenario 4: 콘텐츠 공개 SELECT (Lesson·Module·OxQuestion)
- **Given**: 익명 (anon) 클라이언트
- **When**: `prisma.lesson.findMany()` 시도
- **Then**: 모든 Lesson 반환 (공개 콘텐츠)

### Scenario 5: EventLog UPDATE 차단
- **Given**: authenticated 사용자
- **When**: `prisma.eventLog.update({ where: { id: ... }, data: { event: 'fake' } })` 시도
- **Then**: RLS 의 UPDATE 정책 부재 → 거부

### Scenario 6: service_role 우회 (관리자 작업)
- **Given**: `lib/supabase/admin.ts` 의 service_role 클라이언트
- **When**: 모든 작업 시도
- **Then**: RLS 우회. admin 작업 정상 (시드·KPI·anonymize)

### Scenario 7: TeacherKit 익명 read (CC 라이선스)
- **Given**: 익명 사용자
- **When**: TeacherKit 의 storagePath SELECT
- **Then**: 정상 반환 (FR-PDF-001 의 PDF 다운로드 흐름 정합)

### Scenario 8: User UPDATE — 본인만
- **Given**: User(`u1`)
- **When**: 클라이언트가 `prisma.user.update({ where: { id: 'u2' }, ... })` 시도
- **Then**: RLS 거부. u2 데이터 변경 0

### Scenario 9: 정책 활성 검증
- **Given**: 마이그레이션 적용 후
- **When**: `SELECT * FROM pg_policies WHERE schemaname = 'public'`
- **Then**: 모든 정책 명시. 누락된 테이블 0

### Scenario 10: 정책 부재 시 거부 (default deny)
- **Given**: RLS 활성 + 정책 미정의 테이블
- **When**: anon 의 SELECT
- **Then**: 0건 반환 (default deny). 명시 정책 없으면 모든 작업 거부

## :gear: Technical & Non-Functional Constraints
- **default deny 정책**: RLS 활성 + 정책 미정의 = 모든 작업 거부. 안전한 기본값
- **service_role 정책**: RLS 우회 권한. 사용처 엄격 제한 (`lib/supabase/admin.ts` 만)
- **auth.uid() 타입**: text 캐스팅 필요 (`auth.uid()::text = "userId"`) — Supabase 의 함수 반환 타입과 Prisma의 String 타입 일치
- **다층 방어 (defense-in-depth)**:
  - 애플리케이션 — FR-AUTH-002 의 RBAC 가드 (1차)
  - **RLS — 본 태스크 (2차, 데이터 레이어 마지막)**
  - 두 레이어 모두 통과해야 데이터 접근
- **append-only 강제 (INV-11)**:
  - EventLog 의 UPDATE·DELETE 정책 부재 → 거부
  - service_role 의 anonymize 만 예외 (별도 Server Action)
- **콘텐츠 공개 정책**: Lesson·Module·OxQuestion·TeacherKit — anyone SELECT (공개 라이선스 정합)
- **테스트**:
  - 통합 테스트 (TS-IT-013 별도) — 다양한 RLS 우회 시도 검증
  - 단위 테스트는 SQLite 환경이라 RLS 미적용 — Prisma + Postgres 통합 환경에서만 검증
- **성능 영향**: RLS 활성으로 인한 쿼리 지연 일반적으로 < 5%
- **마이그레이션 정책**: RLS 변경은 별도 마이그레이션. CT-DB-001~010 와 분리하여 명확화
- **금지**:
  - service_role 키를 클라이언트 노출
  - RLS 비활성화 (개발 편의 위한 임시 비활성도 금지)
  - 정책 없는 테이블 운영 (default deny 가 안전하지만 명시 정책 우선)
  - auth.uid() 타입 캐스팅 누락

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] 9개 테이블 RLS 활성화
- [ ] 각 테이블별 정책 정의 (SELECT·INSERT·UPDATE·DELETE 권한 명시)
- [ ] INV-07 (TeacherFeedback INSERT 는 TEACHER 만) 강제 검증
- [ ] INV-11 (EventLog append-only) 강제 검증
- [ ] 콘텐츠 공개 정책 (Lesson·Module·OxQuestion·TeacherKit) 동작
- [ ] service_role 우회 정상 (admin 작업)
- [ ] 마이그레이션 SQL 별도 파일로 커밋
- [ ] `docs/rls-debug.md` 디버깅 가이드 작성
- [ ] TS-IT-013 (RLS 우회 시도) 통합 테스트 작성 (선택, 별도 PR)
- [ ] PR 본문에 "defense-in-depth 의 데이터 레이어 마지막 방어선" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-SUP-001 (Supabase 인스턴스)
  - CT-DB-001~010 (모든 모델 + 마이그레이션 적용)
  - FW-AUTH-001 (Supabase Auth — auth.uid() 활용)
- **Blocks**:
  - INV-07 강제 검증 완성
  - INV-11 강제 검증 완성
  - REQ-NF-021 (RBAC) 의 데이터 레이어 검증
  - 모든 보안 검증의 마지막 layer
  - TS-IT-013 (RLS 우회 통합 테스트, 선택)
- **Related**:
  - REQ-NF-022 (감사 로그)
  - GDPR 대응 (anonymize)
  - SRS §3.6.2 다층 방어
