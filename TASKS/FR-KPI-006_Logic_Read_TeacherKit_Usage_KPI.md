# [Feature] FR-KPI-006: 교안 실사용률 KPI — 다운로드 카운트 + used_in_class=true 비율 + REQ-NF-045 추적

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-KPI-006: GET /api/kpi/teacher-kit-usage — 교안 다운로드 카운트 + 실수업 활용률 + 교사 1인당 평균 (ADMIN 전용)"
labels: 'feature, backend, kpi, teacher, query, priority:high, mvp-in, private-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-KPI-006] 교안 PDF 다운로드 카운트 (lesson 별 + 전체) + TeacherFeedback 의 `used_in_class=true` 비율 + REQ-NF-045 (실사용 50% 목표) 진척도
- **목적**: Story 3 (장은혜) 의 **실수업 활용** 추적. 단순 다운로드만으로는 효용 측정 불가 — used_in_class=true 비율이 진짜 가치 지표. 비율이 낮으면 PDF 디자인·콘텐츠 점검 트리거. REQ-NF-045 (교안 실사용률 ≥50%) + REQ-NF-028 (KPI 자동) 충족.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-045 (교안 실사용률 ≥50%)
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-013, 016 (교안 다운로드 + 재사용 의사)
  - `/docs/SRS_V0_9.md#6.2.2` — TEACHER_FEEDBACK + EVENT_LOG (`teacher_kit.downloaded`)
  - `/docs/SRS_V0_9.md#6.1` — `/api/kpi/teacher-kit-usage` 엔드포인트
- 페르소나: SH-05 장은혜
- 선행: CT-DB-007 (TeacherFeedback·TeacherKit), CT-DB-009 (EventLog), FR-AUTH-002, FR-KPI-001 (KPI 패턴)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/kpi/teacher-kit-usage/route.ts` Route Handler 생성
- [ ] **`requireRole('ADMIN')` 가드** — non-ADMIN 403
- [ ] **응답 DTO 정의**:
  ```ts
  export interface TeacherKitUsageKpiResponse {
    overall: {
      total_downloads_30d: number;       // 30일 누적 다운로드 (anonymous + 로그인)
      authenticated_downloads_30d: number; // 로그인 사용자만
      distinct_teachers_30d: number;     // distinct teacher (로그인만)
      avg_downloads_per_teacher: number; // authenticated_downloads / distinct_teachers
    };
    actual_usage: {
      total_feedback_30d: number;        // TeacherFeedback 30일 누적 (가장 최근 기준)
      used_in_class_count: number;       // used_in_class=true 카운트
      used_in_class_pct: number;         // 비율 (%)
      target: 50;                        // REQ-NF-045 목표
      progress_pct: number;              // (used_in_class_pct / 50) * 100, capped 100
    };
    by_lesson: Array<{
      lesson_id: string;
      title: string;
      downloads_30d: number;
      feedback_count: number;
      used_in_class_count: number;
      used_in_class_pct: number;
    }>;
  }
  ```
- [ ] **다운로드 카운트 쿼리 — EventLog**:
  ```ts
  // 본 KPI 는 로그인 사용자 + 익명 사용자 모두 카운트
  // 단 distinct teacher 는 로그인 + role=TEACHER 만
  const totalDownloads = await prisma.eventLog.count({
    where: {
      event: 'teacher_kit.downloaded',
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  const authenticatedDownloads = await prisma.eventLog.count({
    where: {
      event: 'teacher_kit.downloaded',
      createdAt: { gte: thirtyDaysAgo },
      userId: { not: null },
    },
  });

  const distinctTeachers = await prisma.eventLog.findMany({
    where: { event: 'teacher_kit.downloaded', createdAt: { gte: thirtyDaysAgo }, userId: { not: null } },
    select: { userId: true },
    distinct: ['userId'],
  });
  ```
- [ ] **used_in_class 쿼리 — 가장 최근 피드백 기준**:
  ```ts
  // 동일 (teacherId, lessonId) 의 가장 최근 피드백만 카운트 (DISTINCT ON)
  const latestFeedback = await prisma.$queryRaw<Array<{
    teacher_id: string;
    lesson_id: string;
    used_in_class: boolean;
  }>>`
    SELECT DISTINCT ON ("teacherId", "lessonId")
      "teacherId" AS teacher_id,
      "lessonId" AS lesson_id,
      "usedInClass" AS used_in_class
    FROM "TeacherFeedback"
    WHERE "reportedAt" >= NOW() - INTERVAL '30 days'
    ORDER BY "teacherId", "lessonId", "reportedAt" DESC
  `;

  const usedInClassCount = latestFeedback.filter(f => f.used_in_class).length;
  const totalFeedback = latestFeedback.length;
  const usedInClassPct = totalFeedback > 0 ? (usedInClassCount / totalFeedback) * 100 : 0;
  ```
- [ ] **REQ-NF-045 진척도**: `progress_pct = (used_in_class_pct / 50) * 100, capped 100`
- [ ] **lesson 별 집계**:
  ```sql
  SELECT
    payload->>'lesson_id' AS lesson_id,
    COUNT(*) AS downloads_30d
  FROM "EventLog"
  WHERE event = 'teacher_kit.downloaded' AND "createdAt" >= NOW() - INTERVAL '30 days'
  GROUP BY payload->>'lesson_id'
  ```
- [ ] **응답 헤더**: `Cache-Control: private, max-age=600` (10분 캐시)
- [ ] **응답 시간 목표**: p95 ≤ 500ms
- [ ] **PII 보호**: distinct count 만. teacher_id·comment 미노출
- [ ] **OpenAPI 명세 갱신**

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: ADMIN 정상 응답
- **Given**: ADMIN + 30일 누적 100 다운로드 + 20 TeacherFeedback (10 used_in_class=true)
- **When**: `GET /api/kpi/teacher-kit-usage`
- **Then**: 200 + overall + actual_usage (50% 진척) + by_lesson

### Scenario 2: non-ADMIN 차단
- **Given**: LEARNER 또는 TEACHER
- **When**: 호출
- **Then**: 403

### Scenario 3: 다운로드 — 익명 + 로그인 분리
- **Given**: 익명 다운로드 50건 + 로그인 50건
- **When**: 호출
- **Then**: total_downloads_30d: 100, authenticated_downloads_30d: 50

### Scenario 4: distinct teacher 카운트
- **Given**: TEACHER A 가 10건 다운로드, B 가 5건
- **When**: 호출
- **Then**: distinct_teachers_30d: 2, avg_downloads_per_teacher: 7.5

### Scenario 5: used_in_class 가장 최근 피드백 기준
- **Given**: 동일 (teacherId, lessonId) 에 used_in_class=false 후 used_in_class=true 재제출
- **When**: 호출
- **Then**: used_in_class_count 에 포함 (가장 최근 = true)

### Scenario 6: REQ-NF-045 진척도
- **Given**: used_in_class_pct: 30%
- **When**: 호출
- **Then**: progress_pct: 60 ((30/50)*100)

### Scenario 7: 100% 도달 시 capped
- **Given**: used_in_class_pct: 75%
- **When**: 호출
- **Then**: progress_pct: 100 (cap)

### Scenario 8: 다운로드 0건 시 graceful
- **Given**: 30일간 다운로드 0
- **When**: 호출
- **Then**: 200 + 모든 카운트 0 + avg null

### Scenario 9: 응답 시간
- **Given**: EventLog 100K + TeacherFeedback 1K
- **When**: 호출
- **Then**: p95 ≤ 500ms

### Scenario 10: PII 부재
- **Given**: 응답
- **When**: payload 검사
- **Then**: 개별 teacher_id, comment, email 미포함

## :gear: Technical & Non-Functional Constraints
- **다운로드 vs used_in_class 분리**:
  - 다운로드 — 단순 PDF 호출 (효용 약함)
  - used_in_class — 실수업 활용 (진짜 효용)
  - 두 지표 차이가 클수록 PDF 디자인·콘텐츠 점검 시그널
- **익명 다운로드 카운트 포함 정책**: total_downloads 에 익명 포함 (CC 라이선스 정책 부합). 단 distinct teacher 는 로그인 + TEACHER 역할만
- **used_in_class — 가장 최근 피드백 기준**: 재제출 시 변경 반영. DISTINCT ON 활용
- **REQ-NF-045 진척도**: (실사용률 / 50) * 100 — 50% 도달 시 100. 수치 명확
- **PII 보호**: distinct count + 비율만. 개별 식별자 미노출
- **Cache**: 10분
- **응답 시간**: ≤ 500ms
- **인덱스**: EventLog `(event, createdAt)` + TeacherFeedback `(teacherId, lessonId, reportedAt)`
- **금지**:
  - comment 텍스트 노출
  - 개별 teacher 식별자 노출
  - LEARNER 접근 허용

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] ADMIN 가드
- [ ] 익명·로그인 다운로드 분리 검증
- [ ] used_in_class 가장 최근 피드백 기준 검증
- [ ] REQ-NF-045 진척도 계산 검증
- [ ] 응답 시간 p95 ≤ 500ms 측정
- [ ] PII 부재 검증
- [ ] OpenAPI 명세 업데이트
- [ ] PR 본문에 "Story 3 실수업 활용 추적. REQ-NF-045 진척도" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-007 (TeacherFeedback + TeacherKit)
  - CT-DB-009 (EventLog)
  - FR-AUTH-002 (RBAC)
  - CT-API-001 (응답 포맷)
  - FR-PDF-001 (PDF 다운로드 — `teacher_kit.downloaded` 이벤트 발행)
  - FW-TF-001 (피드백 — used_in_class 데이터 진입)
- **Blocks**:
  - REQ-NF-045 (교안 실사용률 ≥50%) 검증
  - 콘텐츠 편집 SOP — used_in_class 비율 낮은 lesson 점검
- **Related**:
  - FR-KPI-007 (재사용 의사 — 사촌 지표)
