# [Feature] FR-TF-001: 교사 will_reuse 누적 집계 — Stage 1 ≥10명 검증 + lesson 별 분포

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-TF-001: GET /api/teacher-feedback/summary — DISTINCT teacher_id (will_reuse=true, 가장 최근) + REQ-NF-046 진척도 (TEACHER 본인용)"
labels: 'feature, backend, teacher, query, priority:high, mvp-in, private-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-TF-001] `GET /api/teacher-feedback/summary` — TEACHER 본인의 피드백 이력 조회 + 전체 누적 (운영 KPI 가 아닌 본인 활동 요약) + lesson 별 분포 + REQ-NF-046 운영 진척도 (선택 노출)
- **목적**: TEACHER 사용자가 본인의 피드백 이력 + 전체 누적을 자가 확인할 수 있게 한다. **FR-KPI-007 (이미 발행 — ADMIN 전용 누적 KPI) 와 분리** — 본 태스크는 본인용 요약. 운영 진척도 (≥10명) 는 익명 카운트로만 노출 (TEACHER 도 자신 외 다른 교사 식별자 미노출).

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-016 (재사용 의사 누적)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-046 (≥10명)
  - `/docs/SRS_V0_9.md#6.2.2` — TEACHER_FEEDBACK 테이블
- 페르소나: SH-05 장은혜
- 선행: CT-DB-007 (TeacherFeedback), FW-TF-001 (Submit), FR-AUTH-002 (RBAC), FR-KPI-007 (ADMIN 용 KPI 사촌)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/teacher-feedback/summary/route.ts` Route Handler 생성
- [ ] **`requireRole('TEACHER')` 가드** — non-TEACHER 403
- [ ] **응답 DTO 정의 — `lib/contracts/teacher-feedback-summary.ts`**:
  ```ts
  export interface TeacherFeedbackSummaryResponse {
    my_feedback: {
      total_submissions: number;        // 본인 총 제출 수 (재제출 포함)
      latest_per_lesson: Array<{
        lesson_id: string;
        title: string;
        will_reuse: boolean;
        used_in_class: boolean;
        reported_at: string;
      }>;
      will_reuse_lesson_count: number;  // 본인이 will_reuse=true 표시한 lesson 수
    };
    overall_progress: {
      // 익명 카운트 — 다른 교사 식별자 미노출
      total_will_reuse_teachers: number;  // DISTINCT teacher 수
      target: 10;                          // REQ-NF-046
      progress_pct: number;                // (count / 10) * 100, capped 100
    };
  }
  ```
- [ ] **본인 피드백 쿼리 — 가장 최근 (lesson 별)**:
  ```ts
  const myLatest = await prisma.$queryRaw`
    SELECT DISTINCT ON ("lessonId")
      tf."lessonId" AS lesson_id,
      l.title,
      tf."willReuse" AS will_reuse,
      tf."usedInClass" AS used_in_class,
      tf."reportedAt" AS reported_at
    FROM "TeacherFeedback" tf
    JOIN "Lesson" l ON l."lessonId" = tf."lessonId"
    WHERE tf."teacherId" = ${user.id}
    ORDER BY tf."lessonId", tf."reportedAt" DESC
  `;
  ```
- [ ] **본인 will_reuse=true 카운트**:
  ```ts
  const willReuseLessonCount = myLatest.filter(f => f.will_reuse).length;
  ```
- [ ] **운영 진척도 — 익명 카운트 (FR-KPI-007 의 데이터 일부 노출)**:
  - 전체 DISTINCT teacher (will_reuse=true, 가장 최근) 수만 노출
  - 다른 teacher 식별자·comment 등 미노출
  - REQ-NF-046 진척도 (≥10명) 은 TEACHER 의 동기 부여 차원에서 표시 (선택)
  ```ts
  const totalWillReuseTeachers = await prisma.$queryRaw<Array<{ count: bigint }>>`
    WITH latest_feedback AS (
      SELECT DISTINCT ON ("teacherId", "lessonId")
        "teacherId", "willReuse"
      FROM "TeacherFeedback"
      ORDER BY "teacherId", "lessonId", "reportedAt" DESC
    )
    SELECT COUNT(DISTINCT "teacherId")::bigint AS count
    FROM latest_feedback
    WHERE "willReuse" = true
  `;
  ```
- [ ] **응답 헤더**: `Cache-Control: private, max-age=120` (2분 캐시 — 본인용 자주 새로고침)
- [ ] **응답 시간 목표**: p95 ≤ 300ms (DISTINCT ON + JOIN)
- [ ] **PII 보호 — TEACHER 본인 외 식별자 0**:
  - my_feedback — 본인 데이터만
  - overall_progress — 익명 카운트만
  - 다른 teacher 의 lesson·comment·식별자 미노출
- [ ] **Rate Limit**: general 60 req/min 적용
- [ ] **OpenAPI 명세 추가**

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: TEACHER 본인 데이터 조회
- **Given**: TEACHER 본인이 L001, L002, L003 에 피드백 제출
- **When**: `GET /api/teacher-feedback/summary`
- **Then**: 200 + my_feedback.latest_per_lesson 3건. total_submissions ≥ 3

### Scenario 2: 재제출 — latest 만 표시
- **Given**: TEACHER 가 L001 에 will_reuse=true → false 재제출
- **When**: 호출
- **Then**: my_feedback.latest_per_lesson 의 L001 = `will_reuse: false` (가장 최근)

### Scenario 3: non-TEACHER 차단
- **Given**: LEARNER 또는 ADMIN
- **When**: 호출
- **Then**: 403 + `FORBIDDEN`

### Scenario 4: 미인증 — 401
- **Given**: 세션 없음
- **When**: 호출
- **Then**: 401

### Scenario 5: 본인 will_reuse 카운트 정확
- **Given**: 본인이 5개 lesson 에 will_reuse=true (가장 최근), 2개에 false
- **When**: 호출
- **Then**: my_feedback.will_reuse_lesson_count: 5

### Scenario 6: 운영 진척도 — 익명 카운트
- **Given**: 전체 5명 will_reuse=true 교사 (본인 포함)
- **When**: 호출
- **Then**: overall_progress.total_will_reuse_teachers: 5, progress_pct: 50

### Scenario 7: 100% 도달 시 capped
- **Given**: 전체 15명
- **When**: 호출
- **Then**: progress_pct: 100 (cap)

### Scenario 8: 다른 교사 식별자 미노출
- **Given**: 응답
- **When**: payload 검사
- **Then**: my_feedback 외 다른 teacher_id·email·comment 0건

### Scenario 9: 응답 시간
- **Given**: TeacherFeedback 1K 건
- **When**: 호출
- **Then**: p95 ≤ 300ms

### Scenario 10: Cache 정책
- **Given**: 응답
- **When**: 헤더 검사
- **Then**: `Cache-Control: private, max-age=120`

## :gear: Technical & Non-Functional Constraints
- **본인 vs 운영 진척도 분리**:
  - my_feedback — 본인 데이터 (TEACHER 자가 확인)
  - overall_progress — 익명 카운트만 (다른 식별자 미노출)
- **DISTINCT ON 가장 최근 피드백 기준**: 재제출 반영
- **PII 보호**: 본인 외 식별자·comment 절대 노출 0
- **Cache private 2분**: 본인 자주 새로고침
- **응답 시간 ≤ 300ms**: DISTINCT ON + JOIN
- **FR-KPI-007 와 분담**:
  - FR-KPI-007 — ADMIN 전용 운영 KPI (전체 분포·시계열·gate 추적)
  - 본 태스크 — TEACHER 본인용 (자가 확인 + 익명 진척도)
- **Rate Limit**: general 60 req/min
- **금지**:
  - 다른 teacher 의 식별자·comment 노출
  - my_feedback 에 본인 외 데이터
  - public 캐시 (사용자별 데이터)
  - LEARNER·ADMIN 접근 허용

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] requireRole('TEACHER') 가드
- [ ] DISTINCT ON 가장 최근 피드백 검증
- [ ] 익명 운영 진척도 + REQ-NF-046 표시
- [ ] PII 보호 (본인 외 식별자 0) 검증
- [ ] 응답 시간 p95 ≤ 300ms 측정
- [ ] OpenAPI 명세 추가
- [ ] PR 본문에 "TEACHER 자가 확인 + 익명 진척도. FR-KPI-007 와 분담" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-007 (TeacherFeedback)
  - CT-DB-003 (Lesson — title)
  - FR-AUTH-002 (RBAC TEACHER)
  - CT-API-001 (응답 포맷)
  - FW-TF-001 (데이터 진입)
  - FR-KPI-007 (사촌 — 운영 KPI)
- **Blocks**:
  - FR-TF-002 (공개 사례 페이지 — 본 데이터 일부 활용)
  - TEACHER UI 의 "내 피드백 이력" 페이지
- **Related**:
  - REQ-NF-046 (≥10명) Private Beta Exit Gate
  - 페르소나 SH-05 장은혜
