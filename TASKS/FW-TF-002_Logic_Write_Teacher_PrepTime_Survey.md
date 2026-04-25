# [Feature] FW-TF-002: 교사 사전-사후 설문 — 평균 ≥60분 절감 검증 + REQ-NF-047 측정

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-TF-002: 교사 사전-사후 설문 폼 — preparation_time_before/after + 평균 절감 시간 ≥60분 검증 + 분기당 1회"
labels: 'feature, backend, teacher, survey, priority:medium, mvp-soft, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-TF-002] 교사 사전-사후 설문 — 본 사이트 콘텐츠 활용 **이전** vs **이후** 의 수업 준비 시간 (preparation_time_before, preparation_time_after) 입력 → 평균 절감 시간 집계 + REQ-NF-047 (≥60분 절감) 검증
- **목적**: 단순 다운로드 카운트 (FR-KPI-006) 외 **교사가 실제로 시간을 절감했는지** 정량 측정. PRD 의 "교안 활용 시 수업 준비 효율 ≥60분 절감" 검증. **MVP-SOFT** — Public Pilot 진입 후 활성. CT-DB-007 (TeacherFeedback) 의 컬럼 확장.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-047 (수업 준비 ≥60분 절감)
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-016 (재사용 의사)
  - `/docs/SRS_V0_9.md#6.2.2` — TEACHER_FEEDBACK 테이블
- 페르소나: SH-05 장은혜
- 선행: CT-DB-007 (TeacherFeedback), FW-TF-001 (Submit 본체), FR-AUTH-002 (RBAC)
- 짝: FR-KPI-007 (KPI), FR-TF-001 (본인 요약)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **CT-DB-007 의 후속 마이그레이션 — preparation_time 컬럼 2종 추가**:
  ```prisma
  model TeacherFeedback {
    // ... 기존 필드
    preparationTimeBefore  Int?  // 분 단위 (사전 — 본 사이트 활용 안하던 시기)
    preparationTimeAfter   Int?  // 분 단위 (사후 — 본 사이트 활용 후)
    surveyCompletedAt      DateTime?
  }
  ```
  - 본 태스크 PR 에 마이그레이션 통합
- [ ] **CT-API-007 의 Zod 확장 — preparation_time 필드 추가**:
  ```ts
  // lib/contracts/teacher-feedback.ts
  export const SubmitTeacherFeedbackRequestSchema = z.object({
    // ... 기존
    preparation_time_before: z.number().int().min(0).max(600).optional().nullable(),  // 분
    preparation_time_after: z.number().int().min(0).max(600).optional().nullable(),
  });
  ```
  - 0~600분 (10시간) 범위 — 비현실적 값 거부
  - optional — 기본 피드백은 시간 입력 없이 가능 (사용자 부담 최소)
- [ ] **분기당 1회 설문 정책**:
  - 동일 (teacher_id, lesson_id, quarter, year) — 시간 입력 1회만
  - 단 will_reuse, used_in_class, comment 는 재제출 허용 (FW-TF-001 정합)
  - 본 태스크는 시간 입력 부분만 분기 1회 강제 — 별도 검증 함수
- [ ] **시간 입력 검증 — Server Action 보강**:
  ```ts
  // FW-TF-001 의 submitTeacherFeedback 본체에 추가
  if (input.preparation_time_before !== null && input.preparation_time_after !== null) {
    // 동일 분기 시간 입력 중복 검증
    const quarter = getCurrentQuarter();  // 'Q1'~'Q4'
    const year = new Date().getFullYear();

    const existingTimeReport = await prisma.teacherFeedback.findFirst({
      where: {
        teacherId: user.id,
        lessonId: input.lesson_id,
        preparationTimeBefore: { not: null },
        // 동일 분기 검증 — surveyCompletedAt 기준
        surveyCompletedAt: {
          gte: getQuarterStart(quarter, year),
          lt: getQuarterEnd(quarter, year),
        },
      },
    });

    if (existingTimeReport) {
      throw new TeacherFeedbackError('TIME_SURVEY_ALREADY_SUBMITTED', requestId);
    }
  }
  ```
- [ ] **시간 입력 UI 컴포넌트 — TEACHER 피드백 폼**:
  ```tsx
  // app/teacher/feedback/[lessonId]/components/TimeReportForm.tsx
  'use client';
  export function TimeReportForm({ lessonId }: { lessonId: string }) {
    const [before, setBefore] = useState<number | undefined>();
    const [after, setAfter] = useState<number | undefined>();
    // ... will_reuse, used_in_class, comment 입력 + 시간 2종

    return (
      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend>수업 준비 시간 (선택, 분기당 1회)</legend>
          <label>
            본 사이트 활용 이전 평균 준비 시간 (분):
            <input type="number" min={0} max={600} value={before ?? ''} onChange={...} />
          </label>
          <label>
            본 사이트 활용 이후 평균 준비 시간 (분):
            <input type="number" min={0} max={600} value={after ?? ''} onChange={...} />
          </label>
          <p style={{ fontSize: '12px', color: '#888' }}>
            본 입력은 익명 통계로만 활용되며, 분기당 1회만 가능합니다.
          </p>
        </fieldset>
        {/* 기존 will_reuse 등 입력 */}
        <button type="submit">제출</button>
      </form>
    );
  }
  ```
- [ ] **KPI 집계 — 평균 절감 시간 (FR-KPI-006 의 확장)**:
  ```ts
  // FR-KPI-006 의 응답 DTO 에 추가 (별도 PR 또는 본 태스크 통합)
  export interface TeacherKitUsageKpiResponse {
    // ... 기존
    time_savings: {
      respondent_count: number;          // 시간 입력한 교사 수
      avg_time_saved_minutes: number;    // 평균 절감 시간 (after - before 의 평균)
      target: 60;                         // REQ-NF-047
      target_achieved: boolean;
      progress_pct: number;
    };
  }
  ```
- [ ] **평균 계산 쿼리**:
  ```ts
  const timeSavings = await prisma.$queryRaw<Array<{
    respondent_count: bigint;
    avg_saved: number;
  }>>`
    SELECT
      COUNT(*)::bigint AS respondent_count,
      AVG("preparationTimeBefore" - "preparationTimeAfter")::float AS avg_saved
    FROM "TeacherFeedback"
    WHERE "preparationTimeBefore" IS NOT NULL
      AND "preparationTimeAfter" IS NOT NULL
      AND "preparationTimeBefore" > "preparationTimeAfter"  -- 절감 케이스만
  `;
  ```
- [ ] **PII 보호 정책 — 익명 통계만**:
  - KPI 응답에 평균 + 카운트만 노출
  - 개별 teacher 의 시간 데이터 절대 미노출 (FR-KPI-006 의 일부)
- [ ] **사전 시간 추정의 한계 인정 (UX 측면)**:
  - 사용자는 본 사이트 활용 이전 시간을 정확히 기억하기 어려움 — 추정값
  - 통계 집계 시 outlier (5σ 이상) 자동 제외 검토 (별도 후속)
  - 본 태스크는 단순 평균. outlier 제거는 KPI 분석 시점

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: TEACHER 정상 시간 입력
- **Given**: TEACHER 본인이 분기 첫 시간 입력
- **When**: `submitTeacherFeedback({ ..., preparation_time_before: 120, preparation_time_after: 30 })`
- **Then**: 200 + DB INSERT 정상. preparationTimeBefore=120, After=30, surveyCompletedAt 설정

### Scenario 2: 분기 중복 시간 입력 — 거부
- **Given**: 동일 분기 시간 입력 완료 후
- **When**: 동일 lesson 재시간 입력 시도
- **Then**: `TIME_SURVEY_ALREADY_SUBMITTED` 응답

### Scenario 3: 시간 입력 없이 일반 피드백 — 정상
- **Given**: preparation_time_before/after 미입력
- **When**: `submitTeacherFeedback({ lesson_id, will_reuse: true, ... })`
- **Then**: 200 + 일반 피드백 INSERT. 시간 컬럼 NULL

### Scenario 4: 시간 범위 위반 (601 분) — 400
- **Given**: preparation_time_before: 601
- **When**: 호출
- **Then**: 400 + Zod 에러

### Scenario 5: 음수 시간 — 400
- **Given**: preparation_time_after: -10
- **When**: 호출
- **Then**: 400 + Zod 에러

### Scenario 6: KPI 집계 — 평균 절감 시간
- **Given**: 5명 교사 입력 (각각 90, 80, 60, 100, 70 분 절감)
- **When**: FR-KPI-006 의 time_savings 조회
- **Then**: avg_time_saved_minutes: 80, target_achieved: true (≥60)

### Scenario 7: REQ-NF-047 진척도
- **Given**: avg 30 분
- **When**: 응답
- **Then**: progress_pct: 50 ((30/60)*100), target_achieved: false

### Scenario 8: 100% 도달 시 capped
- **Given**: avg 90 분
- **When**: 응답
- **Then**: progress_pct: 100 (cap), target_achieved: true

### Scenario 9: 응답자 0명 — graceful
- **Given**: 시간 입력자 0명
- **When**: KPI 조회
- **Then**: respondent_count: 0, avg null. 에러 0

### Scenario 10: PII 보호 — 개별 시간 미노출
- **Given**: KPI 응답
- **When**: payload 검사
- **Then**: 개별 teacher 의 시간 미노출. 평균 + 카운트만

## :gear: Technical & Non-Functional Constraints
- **시간 범위 0~600분**: 비현실적 값 거부
- **분기당 1회 강제**: 시간 입력 부분만. will_reuse·comment 는 재제출 허용
- **optional 입력**: 사용자 부담 최소 — 시간 모르면 미입력 허용
- **outlier 제거 (별도 후속)**: 5σ 이상 통계 제외
- **PII 보호**: 평균 + 카운트만. 개별 식별자 미노출
- **REQ-NF-047 진척도**: (avg / 60) * 100, capped 100
- **사전 시간 추정의 한계**: UX 안내 — "추정값으로 입력해 주세요"
- **CT-DB-007 마이그레이션 통합**: preparation_time 컬럼 2종 + surveyCompletedAt
- **CT-API-007 Zod 확장**: 본 태스크 PR 에 통합
- **KPI 응답 (FR-KPI-006) 확장**: time_savings 섹션 추가
- **금지**:
  - 분기당 다중 시간 입력 (왜곡)
  - 음수·600 초과 시간 허용
  - 개별 teacher 의 시간 노출 (PII)
  - 절감 안된 케이스 (after > before) 평균 포함 (별도 검토)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] CT-DB-007 마이그레이션 (preparation_time, surveyCompletedAt)
- [ ] CT-API-007 Zod 확장
- [ ] FW-TF-001 본체에 분기 1회 검증 추가
- [ ] TimeReportForm 클라이언트 컴포넌트
- [ ] FR-KPI-006 응답 확장 (time_savings)
- [ ] 평균 계산 쿼리 + REQ-NF-047 진척도
- [ ] PII 보호 검증
- [ ] PR 본문에 "REQ-NF-047 측정. 단순 다운로드 외 시간 절감 정량화" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-007 (TeacherFeedback — preparation_time 추가)
  - CT-API-007 (Zod 확장)
  - FW-TF-001 (Submit 본체 — 분기 검증 추가)
  - FR-AUTH-002 (RBAC TEACHER)
  - FR-KPI-006 (응답 확장 통합)
- **Blocks**:
  - REQ-NF-047 (≥60분 절감) 자동 검증
  - 운영 KPI — 시간 절감 시계열 분석 (별도 후속)
- **Related**:
  - 페르소나 SH-05 장은혜
  - FR-KPI-007 (재사용 의사 KPI 사촌)
