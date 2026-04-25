# [Feature] FR-KPI-007: 교사 재사용 의사 누적 KPI — REQ-NF-046 추적 (≥10명 목표) + Private Beta Exit 진척도

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-KPI-007: GET /api/kpi/teacher-reuse — will_reuse=true DISTINCT teacher 누적 + 30일 시계열 + Private Beta Exit Gate 자동 추적"
labels: 'feature, backend, kpi, teacher, query, priority:critical, mvp-in, private-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-KPI-007] TeacherFeedback 의 `will_reuse=true` 누적 카운트 (DISTINCT teacher_id, 가장 최근 피드백 기준) + 30일 일별 시계열 + REQ-NF-046 (≥10명) 진척도 + 10명 도달 시 운영자 자동 알림
- **목적**: **Private Beta Exit Gate 의 핵심 측정 지표**. PRD 의 "교사 재사용 의사 1건 이상 → 10명 누적" 진척도 자동 추적. 단일 제작자(CON-08) 가 매주 진척도를 인지하여 콘텐츠 개선·교사 outreach 의사결정에 활용. REQ-NF-046 (≥10명) 충족 자동 검증.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-046 (재사용 의사 ≥10명)
  - `/docs/SRS_V0_9.md#1.2.3` — Private Beta Exit 조건
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-016 (재사용 의사 누적)
  - `/docs/SRS_V0_9.md#6.2.2` — TEACHER_FEEDBACK 테이블
  - `/docs/SRS_V0_9.md#6.1` — `/api/kpi/teacher-reuse` 엔드포인트
- 페르소나: SH-05 장은혜 (재사용 의사 표시 진입점)
- 선행: CT-DB-007 (TeacherFeedback), FW-TF-001 (will_reuse 데이터 진입), FR-AUTH-002, FR-KPI-001 (KPI 패턴), IF-RES-001 (운영자 알림)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/kpi/teacher-reuse/route.ts` Route Handler 생성
- [ ] **`requireRole('ADMIN')` 가드 첫 줄** — non-ADMIN 403
- [ ] **응답 DTO 정의**:
  ```ts
  export interface TeacherReuseKpiResponse {
    cumulative_will_reuse_teachers: number;  // DISTINCT teacher_id (가장 최근 피드백 기준)
    target: 10;                              // REQ-NF-046 목표
    progress_pct: number;                    // (cumulative / 10) * 100, capped at 100
    gate_achieved: boolean;                  // cumulative >= 10
    gate_achieved_at: string | null;         // 10명 도달 시점 (ISO datetime)
    by_lesson: Array<{
      lesson_id: string;
      title: string;
      will_reuse_count: number;               // 해당 lesson 의 will_reuse=true 교사 수
    }>;
    daily: Array<{
      date: string;                          // YYYY-MM-DD
      new_will_reuse_teachers: number;       // 해당 날짜에 처음 will_reuse=true 표시한 교사 수
    }>;  // 지난 30일
  }
  ```
- [ ] **누적 카운트 쿼리 — 가장 최근 피드백 기준**:
  ```ts
  // 동일 (teacherId, lessonId) 의 가장 최근 피드백만. 재제출 시 will_reuse 변경 반영
  const cumulative = await prisma.$queryRaw<Array<{ count: bigint }>>`
    WITH latest_feedback AS (
      SELECT DISTINCT ON ("teacherId", "lessonId")
        "teacherId",
        "willReuse"
      FROM "TeacherFeedback"
      ORDER BY "teacherId", "lessonId", "reportedAt" DESC
    )
    SELECT COUNT(DISTINCT "teacherId")::bigint AS count
    FROM latest_feedback
    WHERE "willReuse" = true
  `;
  ```
- [ ] **by_lesson 쿼리** — 각 lesson 별 will_reuse=true (가장 최근) 교사 카운트:
  ```ts
  const byLesson = await prisma.$queryRaw`
    WITH latest_feedback AS (
      SELECT DISTINCT ON ("teacherId", "lessonId")
        "teacherId", "lessonId", "willReuse"
      FROM "TeacherFeedback"
      ORDER BY "teacherId", "lessonId", "reportedAt" DESC
    )
    SELECT "lessonId" AS lesson_id, COUNT(*)::bigint AS will_reuse_count
    FROM latest_feedback
    WHERE "willReuse" = true
    GROUP BY "lessonId"
    ORDER BY will_reuse_count DESC
  `;
  ```
- [ ] **daily 시계열 쿼리** — 각 teacher 의 첫 will_reuse=true 시점:
  ```ts
  const daily = await prisma.$queryRaw`
    WITH first_will_reuse AS (
      SELECT
        "teacherId",
        MIN("reportedAt") AS first_at
      FROM "TeacherFeedback"
      WHERE "willReuse" = true
      GROUP BY "teacherId"
    )
    SELECT
      DATE(first_at) AS date,
      COUNT(*)::bigint AS new_will_reuse_teachers
    FROM first_will_reuse
    WHERE first_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(first_at)
    ORDER BY date ASC
  `;
  ```
- [ ] **Lesson title join** — by_lesson 의 lesson_id 로 Lesson 테이블 조회 + title 추가
- [ ] **gate_achieved 계산**: `cumulative >= 10`
- [ ] **gate_achieved_at 계산** — daily 시계열에서 누적이 처음 10 도달한 날짜:
  ```ts
  let runningSum = 0;
  let gateAchievedAt: string | null = null;
  for (const day of daily) {
    runningSum += day.new_will_reuse_teachers;
    if (runningSum >= 10 && !gateAchievedAt) {
      gateAchievedAt = day.date;
      break;
    }
  }
  ```
- [ ] **10명 도달 시 운영자 알림 — 멱등 처리**:
  - 별도 테이블 `KpiAlertSent` 또는 단순 setting 으로 1회만 발송 강제
  - cumulative 가 처음 10 도달 시 Resend 메일 발송 (IF-RES-001 통합)
  - 메일 본문: "Private Beta Exit Gate 달성! 누적 교사 재사용 의사 10명 도달 (날짜)"
  - 본 알림은 비동기 — KPI 응답 시간 영향 0 (Promise 발사 후 대기 안함)
- [ ] **응답 헤더**: `Cache-Control: private, max-age=300` (5분 캐시 — Private Beta 진입 진척도 자주 확인)
- [ ] **응답 시간 목표**: p95 ≤ 500ms
- [ ] **PII 보호**: distinct teacher count + 비율만. teacher_id·email·comment 미노출
- [ ] **OpenAPI 명세 갱신**

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: ADMIN 정상 응답
- **Given**: ADMIN + TeacherFeedback 누적 (5명 will_reuse=true)
- **When**: `GET /api/kpi/teacher-reuse`
- **Then**: 200 + cumulative: 5, progress_pct: 50, gate_achieved: false

### Scenario 2: non-ADMIN 차단
- **Given**: LEARNER 또는 TEACHER
- **When**: 호출
- **Then**: 403

### Scenario 3: DISTINCT teacher_id 카운트
- **Given**: 동일 teacher 가 5개 lesson 에 will_reuse=true 표시
- **When**: 호출
- **Then**: cumulative: 1 (1명으로 카운트). by_lesson 에는 각 lesson 별 1로 5건

### Scenario 4: 재제출 — 가장 최근 피드백 기준
- **Given**: teacher A 가 will_reuse=true → false 로 재제출
- **When**: 호출
- **Then**: cumulative 카운트에서 A 제외 (가장 최근 = false)

### Scenario 5: 진척도 계산
- **Given**: cumulative: 7
- **When**: 호출
- **Then**: progress_pct: 70 ((7/10)*100)

### Scenario 6: 100% 도달 시 capped
- **Given**: cumulative: 15
- **When**: 호출
- **Then**: progress_pct: 100 (cap), gate_achieved: true

### Scenario 7: 10명 도달 시 운영자 알림 (1회만)
- **Given**: cumulative 가 9 → 10 으로 증가
- **When**: 호출
- **Then**: Resend 메일 1회 발송. KpiAlertSent 테이블에 기록. 다음 호출 시 재발송 0

### Scenario 8: gate_achieved_at 정확
- **Given**: 일별 누적이 10일에 처음 10 도달
- **When**: 호출
- **Then**: gate_achieved_at: 해당 날짜

### Scenario 9: by_lesson 정렬 + Lesson title join
- **Given**: 응답
- **When**: 검사
- **Then**: by_lesson 이 will_reuse_count desc 정렬 + 각 항목에 title 포함

### Scenario 10: PII 부재
- **Given**: 응답
- **When**: payload 검사
- **Then**: teacher_id·email·comment 미포함. distinct count 만

## :gear: Technical & Non-Functional Constraints
- **DISTINCT teacher_id 정책**: 동일 교사 1로 카운트 (lesson 5개에 표시해도 1명)
- **재제출 반영**: DISTINCT ON (teacherId, lessonId) ORDER BY reportedAt DESC — 가장 최근 피드백만
- **gate_achieved_at 정확성**: 일별 누적 시계열에서 처음 10 도달 날짜. 재제출로 감소 후 재도달 시에도 첫 도달 날짜 유지
- **운영자 알림 멱등**: KpiAlertSent 테이블 또는 setting 으로 1회만 발송. 중복 알림 방지
- **알림 비동기 발송**: KPI 응답 시간 영향 0. fire-and-forget 패턴
- **PII 보호**: distinct count + 비율만. teacher 식별자 절대 미노출
- **Cache**: 5분 (Private Beta 진입 진척도 자주 확인)
- **응답 시간**: ≤ 500ms (DISTINCT ON + GROUP BY 부담)
- **인덱스**: TeacherFeedback `(teacherId, lessonId, reportedAt)` 복합 + `(willReuse, reportedAt)`
- **금지**:
  - teacher_id 노출 (PII)
  - comment 노출 (PII + XSS 위험)
  - 알림 다중 발송 (운영자 메일 폭증)
  - LEARNER·TEACHER 접근 허용

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] ADMIN 가드
- [ ] DISTINCT ON 쿼리 (가장 최근 피드백) 검증
- [ ] gate_achieved_at 계산 검증
- [ ] 10명 도달 시 1회 알림 검증 (KpiAlertSent 멱등)
- [ ] by_lesson 정렬 + Lesson title join
- [ ] 응답 시간 p95 ≤ 500ms 측정
- [ ] PII 부재 검증
- [ ] OpenAPI 명세 업데이트
- [ ] PR 본문에 "**Private Beta Exit Gate 핵심 추적**. REQ-NF-046 자동 검증" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-007 (TeacherFeedback 모델)
  - CT-DB-003 (Lesson 모델 — title)
  - FW-TF-001 (will_reuse 데이터 진입)
  - FR-AUTH-002 (RBAC 가드)
  - CT-API-001 (응답 포맷)
  - IF-RES-001 (운영자 알림 메일)
- **Blocks**:
  - **Private Beta Exit Gate** 자동 추적
  - REQ-NF-046 (≥10명) 진척도 측정
  - SRS Stage 1 마일스톤 운영
- **Related**:
  - FR-KPI-006 (교안 활용 KPI — 사촌 지표)
  - PRD Stage 1 파일럿 4구간
