# [Feature] NF-SEC-002: Supabase RLS (Row Level Security) — 모든 테이블 정책 + Service Role 분리

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] NF-SEC-002: Supabase RLS — 모든 테이블에 Row Level Security 정책 + anon·authenticated·service_role 분리 + 본인 데이터만 접근"
labels: 'nf, security, rls, postgresql, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-SEC-002] Supabase PostgreSQL RLS — 모든 테이블에 Row Level Security 정책 활성 + anon (비인증) / authenticated (인증) / service_role (admin·cron) 3 권한 분리 + 본인 데이터만 접근 정책 강제
- **목적**: REQ-NF-014 (PII 보호) + OWASP Broken Access Control 대응. 애플리케이션 레이어의 권한 검증 외 **DB 레이어 추가 방어** — Service 코드 버그 또는 SQL injection 시에도 다른 사용자 데이터 차단. defense-in-depth.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-014 (PII 보호)
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-AUTH (Supabase Auth 통합)
- 외부:
  - https://supabase.com/docs/guides/auth/row-level-security
  - https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- 선행: CT-DB-001~009 (모든 모델), IF-SUP-001 (Supabase)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **모든 테이블 RLS 활성** — 마이그레이션:
  ```sql
  ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "Module" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "Lesson" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "OxQuestion" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "LessonProgress" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "Stamp" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "TeacherFeedback" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "SurveyResponse" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "EventLog" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "NewsletterSubscriber" ENABLE ROW LEVEL SECURITY;
  ```
- [ ] **권한 정책 정의 — 3 Role 분리**:
  - **anon** (비인증) — Lesson·Module 만 SELECT. 다른 테이블 0
  - **authenticated** (인증 사용자) — 본인 데이터 SELECT/INSERT/UPDATE
  - **service_role** (Server Action·cron) — 모든 권한 (RLS 우회)
- [ ] **각 테이블별 정책**:

  **User**:
  ```sql
  -- 본인 행만 SELECT
  CREATE POLICY user_self_select ON "User"
    FOR SELECT TO authenticated
    USING (id = auth.uid());
  CREATE POLICY user_self_update ON "User"
    FOR UPDATE TO authenticated
    USING (id = auth.uid());
  -- INSERT 는 Server Action 만 (signup) → service_role
  -- DELETE 는 운영자만 (admin Server Action) → service_role
  ```

  **Lesson, Module, OxQuestion** (공개 데이터):
  ```sql
  -- 모든 사용자 SELECT (anon 포함)
  CREATE POLICY lesson_public_select ON "Lesson"
    FOR SELECT TO anon, authenticated
    USING (true);
  -- INSERT/UPDATE/DELETE — service_role 만 (운영자 SOP)
  ```

  **LessonProgress, Stamp, SurveyResponse**:
  ```sql
  -- 본인 데이터만
  CREATE POLICY progress_self_all ON "LessonProgress"
    FOR ALL TO authenticated
    USING ("userId" = auth.uid())
    WITH CHECK ("userId" = auth.uid());

  CREATE POLICY stamp_self_select ON "Stamp"
    FOR SELECT TO authenticated
    USING ("userId" = auth.uid());
  -- INSERT 는 Server Action (FW-OX-001) 만 → service_role

  CREATE POLICY survey_self_select ON "SurveyResponse"
    FOR SELECT TO authenticated
    USING ("userId" = auth.uid() OR "userId" IS NULL);
  -- 익명 모드 (userId IS NULL) 는 본인 anonymousToken 매칭 — 별도 함수 활용
  ```

  **TeacherFeedback**:
  ```sql
  -- 본인 피드백만 SELECT/INSERT
  CREATE POLICY tf_self_all ON "TeacherFeedback"
    FOR ALL TO authenticated
    USING ("teacherId" = auth.uid())
    WITH CHECK ("teacherId" = auth.uid());

  -- 공개 동의된 피드백 — anon SELECT 허용
  CREATE POLICY tf_public_select ON "TeacherFeedback"
    FOR SELECT TO anon, authenticated
    USING ("isPublicConsent" = true AND "usedInClass" = true);
  ```

  **EventLog**:
  ```sql
  -- INSERT — service_role 만 (Server Action)
  -- SELECT — service_role 만 (admin)
  -- 일반 사용자 접근 0 (감사 로그)
  ```

  **NewsletterSubscriber**:
  ```sql
  -- 모든 권한 — service_role 만
  -- 일반 사용자 접근 0 (이메일 노출 방지)
  ```

- [ ] **Service Role 분리 — 환경변수 보호**:
  - `SUPABASE_SERVICE_ROLE_KEY` — Server-only (NEXT_PUBLIC prefix 절대 금지)
  - 클라이언트는 anon key + JWT 만 활용
  - Service Role 활용 코드 — Server Action·Route Handler·Cron 만
- [ ] **익명 SurveyResponse 의 anonymousToken 매칭 정책**:
  - 익명 모드 응답 — userId NULL 이라 RLS 가 본인 매칭 불가
  - 정책 — anonymous_token 검증은 Server Action (FW-SUR-001) 가 service_role 로 처리
  - 일반 사용자 SELECT 차단 (anon·authenticated 모두) → service_role 만 접근
- [ ] **RLS 위반 시 동작**:
  - SELECT — 빈 결과 (행 부재처럼)
  - INSERT/UPDATE/DELETE — `new row violates row-level security policy` 에러
- [ ] **테스트 정책 — 모든 정책의 통합 테스트**:
  - 본인 user 의 progress 조회 → 정상
  - 다른 user 의 progress 조회 → 빈 결과 (RLS 차단)
  - anon 이 EventLog 조회 → 거부
  - service_role 모든 접근 → 정상
- [ ] **마이그레이션 정책 — RLS 정책 변경은 별도 PR**:
  - schema 변경과 RLS 변경 분리 (리뷰 명확성)
  - RLS 정책 누락 검증 — IF-CI-001 의 별도 step (선택)
- [ ] **응답 시간 영향**: RLS 는 인덱스 활용 시 영향 미미. 본 테스트로 측정

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 본인 progress SELECT 정상
- **Given**: u1 로그인
- **When**: SELECT * FROM LessonProgress WHERE userId = u1
- **Then**: 본인 데이터 반환

### Scenario 2: 다른 user progress — 빈 결과
- **Given**: u1 로그인
- **When**: SELECT * FROM LessonProgress WHERE userId = u2
- **Then**: 빈 결과 (RLS 차단)

### Scenario 3: 다른 user 의 INSERT 시도 — 거부
- **Given**: u1 로그인
- **When**: INSERT LessonProgress with userId = u2
- **Then**: RLS violation error

### Scenario 4: anon 이 EventLog 접근 — 거부
- **Given**: 비인증
- **When**: SELECT EventLog
- **Then**: 빈 결과

### Scenario 5: anon 이 Lesson SELECT — 정상
- **Given**: 비인증
- **When**: SELECT Lesson
- **Then**: 모든 lesson 반환

### Scenario 6: anon 이 Lesson INSERT — 거부
- **Given**: 비인증
- **When**: INSERT
- **Then**: RLS violation

### Scenario 7: service_role 우회 — 정상
- **Given**: Server Action (Service Role 활용)
- **When**: 모든 테이블 접근
- **Then**: RLS 우회 + 정상

### Scenario 8: 공개 동의 피드백 — anon SELECT 정상
- **Given**: isPublicConsent: true
- **When**: anon SELECT
- **Then**: 데이터 반환

### Scenario 9: 미동의 피드백 — anon 차단
- **Given**: isPublicConsent: false
- **When**: anon SELECT
- **Then**: 빈 결과

### Scenario 10: 응답 시간 영향 미미
- **Given**: 1만 행 + RLS
- **When**: SELECT 측정
- **Then**: p95 < 200ms

## :gear: Technical & Non-Functional Constraints
- **모든 테이블 RLS 활성 강제**: 누락 시 PII 노출 위험
- **3 Role 분리 — anon / authenticated / service_role**
- **본인 데이터 강제 (auth.uid() 매칭)**
- **service_role 환경변수 — Server-only**: NEXT_PUBLIC 금지
- **공개 데이터 (Lesson) — anon 허용**
- **공개 동의 피드백 — 부분 anon 허용**
- **EventLog·NewsletterSubscriber — service_role 만**
- **마이그레이션 정책 분리**: schema 와 RLS 별도 PR
- **응답 시간 영향 — 인덱스 활용으로 미미**
- **금지**:
  - 일부 테이블 RLS 비활성 (defense-in-depth 위반)
  - service_role key 클라이언트 노출
  - WITH CHECK 누락 (UPDATE/INSERT 우회 위험)
  - anonymousToken 매칭을 RLS 로 시도 (service_role 활용)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] 모든 테이블 RLS 활성 마이그레이션
- [ ] 3 Role 정책 정의
- [ ] service_role key 환경변수 분리 검증
- [ ] 공개 데이터 + 본인 데이터 정책
- [ ] 응답 시간 영향 측정
- [ ] CI 통합 (RLS 활성 자동 검증)
- [ ] PR 본문에 "REQ-NF-014 + OWASP Broken Access defense-in-depth" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-001~009 (모든 모델)
  - IF-SUP-001 (Supabase)
- **Blocks**:
  - REQ-NF-014 충족
  - 모든 사용자 데이터 보호
- **Related**:
  - NF-SEC-001 (인증·세션)
  - 보안 audit (Stage 1 외부 검토)
