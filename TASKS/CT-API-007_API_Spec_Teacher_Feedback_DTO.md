# [Feature] CT-API-007: submitTeacherFeedback() Server Action DTO + will_reuse·used_in_class·comment + RBAC TEACHER

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-API-007: submitTeacherFeedback() Server Action DTO — {lesson_id, will_reuse, used_in_class, comment} + RBAC TEACHER 가드 + 재제출 허용"
labels: 'feature, backend, api-spec, teacher, priority:critical, mvp-in, private-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-API-007] `submitTeacherFeedback()` Server Action 의 Contract — Zod 입력 (`lesson_id` + `will_reuse` + `used_in_class` + optional `comment`) + RBAC TEACHER 가드 명시 + 재제출 허용 (UNIQUE 제약 미적용) + comment 2000자 제한 + XSS 방어 정책
- **목적**: FW-TF-001 (Logic Write 본체) 의 Contract SSOT. Story 3 (장은혜) 의 데이터 진입점 + Private Beta Exit Gate (REQ-NF-046 ≥10명) 의 SSOT. INV-07 (TEACHER 만 생성) 의 데이터 레이어 강제.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.1` — `submitTeacherFeedback()` 엔드포인트
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-016 (재사용 의사 누적)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-021 (RBAC), REQ-NF-046 (≥10명)
  - `/docs/SRS_V0_9.md#6.2.2` — TEACHER_FEEDBACK 테이블
  - `/docs/SRS_V0_9.md#6.2.3` — INV-07 (TEACHER 만 생성)
- 페르소나: SH-05 장은혜
- 선행: CT-API-001, CT-DB-007 (TeacherFeedback), FR-AUTH-002 (RBAC 가드)
- 짝: FW-TF-001 (Logic Write 본체)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/contracts/teacher-feedback.ts` 신규 파일 — Zod + TypeScript SSOT
- [ ] **Request 검증**:
  ```ts
  import { z } from 'zod';

  export const SubmitTeacherFeedbackRequestSchema = z.object({
    lesson_id: z.string().regex(/^L\d{3}$/, 'lesson_id 포맷이 올바르지 않습니다'),
    will_reuse: z.boolean(),
    used_in_class: z.boolean(),
    comment: z.string()
      .max(2000, '의견은 2000자 이하여야 합니다')
      .optional()
      .nullable(),
  });
  export type SubmitTeacherFeedbackRequest = z.infer<typeof SubmitTeacherFeedbackRequestSchema>;
  ```
- [ ] **Response DTO**:
  ```ts
  export const SubmitTeacherFeedbackResponseSchema = z.object({
    ok: z.literal(true),
    feedback_id: z.string().uuid(),
    reported_at: z.string(),  // ISO datetime
    will_reuse: z.boolean(),
    is_first_submission: z.boolean(),  // 동일 (teacher, lesson) 첫 제출 여부
  });
  export type SubmitTeacherFeedbackResponse = z.infer<typeof SubmitTeacherFeedbackResponseSchema>;
  ```
- [ ] **comment XSS 방어 정책 (DB 저장 + 출력 분리)**:
  - **DB 저장**: plain text 그대로 저장. HTML escape 안함 (정확한 사용자 입력 보존)
  - **출력 시점**: React 자동 escape 활용 + dangerouslySetInnerHTML 절대 금지
  - **공개 페이지 (FR-TF-002)**: 본인 동의 + 별도 sanitize 레이어
  - 본 Contract 는 plain text 입력 가정. HTML 입력해도 저장은 그대로
- [ ] **재제출 정책 (UNIQUE 미적용)**:
  - 동일 (teacherId, lessonId) 의 재제출 허용
  - 새 row INSERT (이력 보존)
  - 응답의 `is_first_submission` 으로 첫 제출/재제출 구분
- [ ] **RBAC 가드 명시 (INV-07)**:
  - `requireRole('TEACHER')` (FR-AUTH-002 활용)
  - LEARNER 시도 → 403 `FORBIDDEN`
  - ADMIN 시도 → 403 (TEACHER 역할 전용)
- [ ] **`teacher_id` 추출 정책 (IDOR 방지)**:
  - 본 Contract 는 teacher_id 입력 미허용
  - Server Action 본체가 세션의 user.id 를 항상 사용
- [ ] **에러 응답 (CT-API-001 활용)**:
  - 400 — `INVALID_LESSON_ID`
  - 400 — `COMMENT_TOO_LONG`
  - 401 — `UNAUTHORIZED`
  - 403 — `FORBIDDEN` (TEACHER 가 아님)
  - 404 — `LESSON_NOT_FOUND`
  - 429 — `RATE_LIMIT_EXCEEDED` (분당 10 req — 인증 API 한도 또는 별도)
- [ ] **Rate Limit 정책**:
  - **본 라우트는 일반 60 req/min 보다 엄격** — 분당 10 req per (IP + user_id) 검토
  - 악의적 대량 제출 방지 (KPI 카운트 왜곡 위험)
- [ ] **운영자 알림 호환 정책 (FW-TF-001 의 will_reuse=true 알림)**:
  - 본 Contract 는 알림 발송 결과 응답에 미포함 (silent fail)
  - 알림 비동기 처리 — Server Action 응답 시간 영향 0
- [ ] **OpenAPI 명세 추가**
- [ ] **Mock fixture**:
  ```ts
  export const mockSubmitTeacherFeedbackRequest: SubmitTeacherFeedbackRequest = {
    lesson_id: 'L001', will_reuse: true, used_in_class: true,
    comment: '학생 반응 좋음. 추후 재사용 예정',
  };
  export const mockSubmitTeacherFeedbackResponse: SubmitTeacherFeedbackResponse = {
    ok: true,
    feedback_id: '00000000-0000-0000-0000-000000000099',
    reported_at: '2026-04-25T12:00:00Z',
    will_reuse: true,
    is_first_submission: true,
  };
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: TEACHER 정상 제출
- **Given**: TEACHER 사용자 + Lesson L001
- **When**: `submitTeacherFeedback({ lesson_id: 'L001', will_reuse: true, used_in_class: true, comment: '...' })`
- **Then**: SubmitTeacherFeedbackResponse 정상. ok: true, is_first_submission: true

### Scenario 2: LEARNER 시도 — 403 (INV-07)
- **Given**: LEARNER 사용자
- **When**: 호출
- **Then**: 403 + `FORBIDDEN`. DB 변경 0

### Scenario 3: ADMIN 시도 — 403
- **Given**: ADMIN 사용자
- **When**: 호출
- **Then**: 403 + `FORBIDDEN`. ADMIN 도 TEACHER 역할 전용 제한

### Scenario 4: 미인증 — 401
- **Given**: 세션 없음
- **When**: 호출
- **Then**: 401 + `UNAUTHORIZED`

### Scenario 5: 잘못된 lesson_id — 400
- **Given**: 데이터
- **When**: lesson_id: 'INVALID'
- **Then**: 400 + `INVALID_LESSON_ID`

### Scenario 6: comment 2001자 — 400
- **Given**: comment 2001자
- **When**: 호출
- **Then**: 400 + `COMMENT_TOO_LONG`

### Scenario 7: comment 미입력 (optional)
- **Given**: comment 미포함
- **When**: 호출
- **Then**: 200. comment null 로 DB 저장

### Scenario 8: 재제출 — is_first_submission: false
- **Given**: 동일 (teacher, lesson) 첫 제출 후
- **When**: will_reuse=false 로 재제출
- **Then**: 200 + `is_first_submission: false`. DB 에 새 row INSERT (총 2건)

### Scenario 9: comment XSS 시도 — plain text 저장
- **Given**: comment = `<script>alert(1)</script>`
- **When**: 호출
- **Then**: 200. DB 에 plain text 그대로 저장. 출력 시점에 React escape

### Scenario 10: Mock fixture schema parse
- **Given**: mockSubmitTeacherFeedbackRequest, Response
- **When**: 각 schema 의 parse 실행
- **Then**: 검증 통과

## :gear: Technical & Non-Functional Constraints
- **단일 파일 SSOT**: `lib/contracts/teacher-feedback.ts`
- **RBAC TEACHER 강제 (INV-07)**: 본 Contract 의 핵심. LEARNER·ADMIN 모두 거부
- **재제출 허용 정책**: UNIQUE 제약 미적용. 새 row INSERT (이력 보존). is_first_submission 으로 구분
- **comment 길이 제한 2000자**: Zod 단계에서 차단
- **XSS 방어 — 저장/출력 분리**:
  - 저장 — plain text (REACT escape 활용으로 충분)
  - 출력 — React 자동 escape, dangerouslySetInnerHTML 금지
  - 공개 페이지 (FR-TF-002) — 별도 sanitize 레이어 (DOMPurify 등)
- **IDOR 방지**: teacher_id 입력 미허용. 세션 기반
- **응답 시간**: p95 ≤ 300ms (단순 INSERT)
- **Rate Limit 별도 정책 검토**: 분당 10 req per (IP + user) — 악의적 대량 제출 방지
- **운영자 알림 비동기**: 본 Contract 응답 시간 영향 0
- **Mock fixture 의무**: schema parse 검증 + 단위 테스트 활용
- **금지**:
  - teacher_id 입력 허용 (IDOR 위반)
  - HTML 그대로 저장 후 dangerouslySetInnerHTML 출력 (XSS)
  - LEARNER·ADMIN 의 우회 (INV-07 위반)
  - UNIQUE 제약 추가 (재제출 차단)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/contracts/teacher-feedback.ts` Zod + TypeScript SSOT
- [ ] RBAC TEACHER 강제 명시
- [ ] comment 2000자 제한 + optional/nullable
- [ ] XSS 방어 정책 문서화
- [ ] is_first_submission 응답 필드
- [ ] IDOR 방지 (세션 우선)
- [ ] Rate Limit 정책 (10 req/min per user) 검토 후 결정
- [ ] Mock fixture + schema parse 검증
- [ ] OpenAPI 명세 추가
- [ ] PR 본문에 "FW-TF-001 의 Contract. INV-07 + Private Beta Exit Gate 데이터 진입" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-001 (공통 응답·오류 + Rate Limit)
  - CT-DB-007 (TeacherFeedback 모델)
  - CT-DB-003 (Lesson — 존재 검증)
  - FR-AUTH-002 (RBAC 가드 — requireRole('TEACHER'))
- **Blocks**:
  - FW-TF-001 (Logic Write 본체)
  - FR-TF-001 (집계 쿼리)
  - FR-TF-002 (공개 사례 페이지)
  - FR-KPI-006 (교안 활용 KPI — used_in_class 활용)
  - FR-KPI-007 (재사용 의사 KPI — will_reuse 활용)
  - TS-UT-013 (RBAC 단위 테스트)
  - TS-E2E-007 (장은혜 E2E)
- **Related**:
  - REQ-NF-046 (≥10명) Private Beta Exit Gate 의 데이터 진입
  - INV-07 (TEACHER 만 생성)
