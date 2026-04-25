# [Feature] FW-TF-001: submitTeacherFeedback() Server Action — 재사용 의사 + RBAC TEACHER 가드

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-TF-001: submitTeacherFeedback() Server Action — will_reuse + used_in_class + comment 저장 (RBAC TEACHER 가드)"
labels: 'feature, backend, teacher, rbac, priority:high, mvp-in, private-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-TF-001] `submitTeacherFeedback()` Server Action — 교사가 PDF 다운로드 후 `will_reuse`(재사용 의사)·`used_in_class`(수업 활용 여부)·`comment`(자유 의견) 을 제출하는 Write 로직
- **목적**: Story 3 (장은혜) 의 종착점이며 Private Beta Exit 게이트 핵심 — "교사 재사용 의사 1건 이상" (REQ-NF-046 의 누적 ≥10명 으로 향하는 시발점). UC-08 (교사 피드백 제출) + REQ-FUNC-016 (재사용 의사 누적) + INV-07 (LEARNER 의 TeacherFeedback 생성 차단) 충족.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-016 (재사용 의사 누적)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-021 (RBAC), REQ-NF-045 (교안 실사용률), REQ-NF-046 (재사용 의사 ≥10명)
  - `/docs/SRS_V0_9.md#6.2.2` — TEACHER_FEEDBACK 테이블
  - `/docs/SRS_V0_9.md#6.2.3` — INV-07 (LEARNER 의 TeacherFeedback 생성 금지)
  - `/docs/SRS_V0_9.md#3.5.2` — UC-08
  - `/docs/SRS_V0_9.md#6.1` — `submitTeacherFeedback()` 엔드포인트
- 페르소나: SH-05 장은혜
- 선행: FR-AUTH-002 (RBAC 가드), CT-DB-007 (TeacherFeedback 모델), CT-API-007 (DTO)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/contracts/teacher.ts` 에 Zod 스키마 `TeacherFeedbackRequest` 정의:
  ```ts
  z.object({
    lesson_id: z.string().regex(/^L\d{3}$/),
    will_reuse: z.boolean(),
    used_in_class: z.boolean(),
    comment: z.string().max(2000).optional(),
  })
  ```
- [ ] `app/teacher/actions.ts` 에 `submitTeacherFeedback()` Server Action 구현
- [ ] **첫 줄에 `requireRole('TEACHER')` 가드 호출** (FR-AUTH-002 활용 · INV-07 강제)
- [ ] 입력 Zod parse 후 Prisma INSERT — `prisma.teacherFeedback.create({ data: { teacherId, lessonId, willReuse, usedInClass, comment, reportedAt: new Date() } })`
- [ ] **중복 제출 정책 결정** — 동일 (teacher_id, lesson_id) 의 재제출 허용 여부:
  - 본 태스크는 **재제출 허용** (의견 변경 가능). 단 매번 새 row INSERT (이력 보존)
  - 집계 시 (FR-TF-001) 가장 최근 제출만 반영
- [ ] Lesson 미존재 → 404 (`LESSON_NOT_FOUND`)
- [ ] EventLog 발행 — `teacher_feedback.submitted` 이벤트 (will_reuse 값 포함)
- [ ] **Resend 알림 (선택)** — `will_reuse=true` 인 경우 운영자에게 즉시 알림 (PRD 단일 제작자 + Private Beta Exit 게이트 추적)
- [ ] 응답 — `{ ok: true, feedback_id: '...' }`
- [ ] **댓글 안전성** — XSS 방지:
  - comment 는 plain text 만 허용
  - 출력 시 React 의 자동 escape 활용
  - HTML 태그·script 입력은 Zod 단계에서 sanitize 또는 서버 저장 전 strip
- [ ] **개인정보 보호** — comment 가 다른 사용자에게 노출되는 경우 (FR-TF-002 공개 페이지) 본인 동의 필드 추가 검토 (별도 태스크)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: TEACHER 가 정상 제출
- **Given**: TEACHER 역할 사용자가 로그인 + Lesson L001 존재
- **When**: `submitTeacherFeedback({ lesson_id: 'L001', will_reuse: true, used_in_class: true, comment: '학생 반응 좋음' })` 호출
- **Then**: TeacherFeedback INSERT 성공. 응답 `{ ok: true, feedback_id: '...' }`. EventLog `teacher_feedback.submitted` 1건 + `will_reuse=true` payload

### Scenario 2: LEARNER 가 시도 — 403 (INV-07)
- **Given**: LEARNER 역할 사용자
- **When**: `submitTeacherFeedback()` 호출
- **Then**: `requireRole('TEACHER')` 가드가 throw. 403 + `FORBIDDEN`. DB INSERT 0건

### Scenario 3: 미인증 — 401
- **Given**: 세션 없음
- **When**: `submitTeacherFeedback()` 호출
- **Then**: 401 + `UNAUTHORIZED`

### Scenario 4: 잘못된 lesson_id — 400
- **Given**: TEACHER 사용자
- **When**: `submitTeacherFeedback({ lesson_id: 'INVALID', ... })` 호출
- **Then**: Zod parse 실패. 400 + `INVALID_LESSON_ID`

### Scenario 5: Lesson 미존재 — 404
- **Given**: TEACHER 사용자
- **When**: `submitTeacherFeedback({ lesson_id: 'L999', ... })` 호출
- **Then**: 404 + `LESSON_NOT_FOUND`. INSERT 0건

### Scenario 6: comment 길이 초과 — 400
- **Given**: 2001자 이상의 comment
- **When**: 호출
- **Then**: Zod parse 실패. 400 + `COMMENT_TOO_LONG`

### Scenario 7: 동일 (teacher_id, lesson_id) 재제출 허용
- **Given**: 첫 제출 후 24시간 경과
- **When**: 동일 lesson 에 다시 `submitTeacherFeedback({ ..., will_reuse: false })` 호출
- **Then**: 새 row INSERT 정상. DB 에 2개 row 존재. 집계 시 가장 최근 (will_reuse=false) 반영

### Scenario 8: comment XSS 시도 차단
- **Given**: comment = `'<script>alert(1)</script>'`
- **When**: 호출
- **Then**: 저장 시 plain text 로 변환 (또는 거부). 출력 시 React escape 로 안전. `<script>` 실행 0건

### Scenario 9: will_reuse=true 운영자 알림
- **Given**: TEACHER 가 will_reuse=true 로 첫 제출
- **When**: Server Action 완료
- **Then**: Resend API 로 운영자(SH-08) 에게 알림 메일 발송 큐. PRD Private Beta Exit 추적

### Scenario 10: 집계 쿼리 — will_reuse=true 누적
- **Given**: 5명 TEACHER 가 각자 다른 lesson 에 will_reuse=true 제출
- **When**: FR-TF-001 의 집계 쿼리 실행
- **Then**: 누적 카운트 5. REQ-NF-046 의 ≥10명 진척도 50%

## :gear: Technical & Non-Functional Constraints
- **RBAC 강제 (REQ-NF-021 · INV-07)**: 첫 줄 `requireRole('TEACHER')` 호출. LEARNER·ADMIN 거부
- **재제출 정책**: 새 row INSERT 허용. UPDATE 금지 (이력 보존)
- **comment 안전성**:
  - Zod 단계에서 max 2000자
  - 저장 전 HTML 태그 strip (또는 plain text 변환)
  - 출력 시 React 자동 escape
- **응답 시간**: p95 ≤ 300ms (단순 INSERT)
- **에러 코드**: `LESSON_NOT_FOUND`, `INVALID_LESSON_ID`, `COMMENT_TOO_LONG`, `UNAUTHORIZED`, `FORBIDDEN`
- **EventLog 발행**: `teacher_feedback.submitted` + payload (lesson_id, will_reuse, used_in_class). comment 는 EventLog 에 기록 금지 (PII 가능성)
- **운영자 알림 정책**: Private Beta 단계에서만 활성. Public Pilot 에서는 일일 집계로 전환 (메일 폭증 방지)
- **개인정보 보호**: comment 는 본인 동의 없이 외부 노출 금지 (FR-TF-002 공개 페이지는 별도 동의 필드 필요)
- **금지**:
  - LEARNER 의 우회 시도 차단 (RBAC 가드 누락 금지)
  - comment 에 PII 자동 추출·저장 (의견 자체만 저장)
  - 익명 제출 허용 (TEACHER 인증 필수)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `submitTeacherFeedback()` Server Action 구현
- [ ] `requireRole('TEACHER')` 가드 첫 줄 호출 검증
- [ ] comment XSS 방어 검증 (script 태그 입력 → 안전 저장·출력)
- [ ] 재제출 시 새 row INSERT 검증
- [ ] EventLog `teacher_feedback.submitted` 발행 + payload 검증
- [ ] will_reuse=true 시 운영자 알림 메일 발송 (Resend 통합)
- [ ] FR-TF-001 (집계 쿼리) 와 정합 — 가장 최근 제출 기준
- [ ] OpenAPI 명세 업데이트
- [ ] PR 본문에 "Private Beta Exit 게이트 추적의 시작점 (will_reuse=true 1건 이상)" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-AUTH-002 (RBAC 가드 — `requireRole('TEACHER')` 활용)
  - CT-API-007 (Teacher Feedback DTO)
  - CT-DB-007 (TeacherFeedback 모델)
  - CT-DB-011 (RLS 정책 — Supabase 측 데이터 격리)
  - IF-RES-001 (Resend Setup — will_reuse=true 알림)
  - FW-AUTH-003 (로그인 — TEACHER 세션 발급)
- **Blocks**:
  - FR-TF-001 (집계 쿼리 — 본 액션이 데이터 공급원)
  - FR-TF-002 (공개 사례 페이지)
  - FR-KPI-006 (교안 실사용률 — used_in_class 활용)
  - FR-KPI-007 (재사용 의사 누적)
  - TS-UT-013 (RBAC 가드 검증 — LEARNER 의 시도 → 403)
  - TS-E2E-007 (장은혜 E2E)
  - **Private Beta Exit Gate** — "교사 재사용 의사 1건 이상" 의 데이터 입구
- **Related**:
  - REQ-NF-046 (재사용 의사 ≥10명) 누적 시작점
