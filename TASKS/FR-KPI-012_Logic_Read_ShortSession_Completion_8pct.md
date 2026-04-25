# [Feature] FR-KPI-012: 단편 세션(<8분) 완주율 ≥8% — EXP-3 검증 KPI

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-KPI-012: 단편 세션(<8분) 완주율 ≥8% KPI 집계 — EXP-3 가설 검증 + 전체 세션 대비 격차 ≤2pp"
labels: 'feature, backend, kpi, experiment, story-4, priority:medium, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-KPI-012] 단편 세션(<8분) 완주율 KPI 집계 API — EXP-3 가설 검증
- **목적**: Story 4 (오세은 · 단편 세션 학습) 의 핵심 가설 — "단편 세션(<8분) 학습자도 일반 학습자와 비슷한 완주율을 달성한다"를 검증한다. REQ-FUNC-004 에서 정의한 단편 세션 완주율 ≥ 8% (전체 vs 단편 격차 ≤ 2pp) 를 정량 집계하여 EXP-3 실험의 자동 판정 기반을 제공.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-004 (단편 세션 완주율)
  - `/docs/SRS_V0_9.md#4.2.5` — EXP-3 (단편 세션 완주율 비율 비교)
  - `/docs/SRS_V0_9.md#1.2.1` — 보조 KPI (단편 세션 완주 ≥ 8%)
- 페르소나: SH-07 오세은 (5~10분 단편 세션, P16)
- 선행: FR-KPI-002 (L4 완주율 — 전체 기준), FW-PROG-001 (진도 저장), CT-DB-009 (EventLog)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/kpi/short-session/route.ts` Route Handler 생성
- [ ] **`requireRole('ADMIN')` 가드**
- [ ] **단편 세션 정의**: 1회 접속 시 총 시청 시간 < 8분 (480초)
  - 세션 기준: `lesson.started` → `lesson.paused/left` 간 EventLog 시간 차 < 480초
  - 또는: `LessonProgress.last_position_sec` 변화량으로 세션 시간 추정
- [ ] **집계 쿼리**:
  ```sql
  -- 단편 세션 사용자 중 L4(Lesson 4편 이상) 완주한 비율
  WITH session_users AS (
    SELECT DISTINCT user_id,
      CASE WHEN MAX(position_sec) - MIN(position_sec) < 480 THEN 'short' ELSE 'full' END AS session_type
    FROM lesson_progress
    GROUP BY user_id, lesson_id
  ),
  short_session_users AS (
    SELECT user_id FROM session_users WHERE session_type = 'short'
    GROUP BY user_id
    HAVING COUNT(*) >= 4  -- 4편 이상 세션 기록
  ),
  completed AS (
    SELECT su.user_id, COUNT(DISTINCT s.lesson_id) AS completed_count
    FROM short_session_users su
    JOIN stamp s ON su.user_id = s.user_id
    GROUP BY su.user_id
    HAVING COUNT(DISTINCT s.lesson_id) >= 4
  )
  SELECT
    (SELECT COUNT(*) FROM short_session_users) AS total_short_users,
    (SELECT COUNT(*) FROM completed) AS completed_short_users,
    ROUND(
      (SELECT COUNT(*) FROM completed)::numeric /
      NULLIF((SELECT COUNT(*) FROM short_session_users), 0) * 100, 2
    ) AS short_completion_pct
  ```
- [ ] **전체 완주율 대비 격차 계산**:
  ```ts
  const fullCompletionPct = await getFullCompletionRate(); // FR-KPI-002
  const gap = Math.abs(fullCompletionPct - shortCompletionPct);
  const gapWithinTarget = gap <= 2; // ≤ 2pp
  ```
- [ ] **응답 DTO**:
  ```ts
  interface ShortSessionKpiResponse {
    short_session_users: number;
    short_completed_users: number;
    short_completion_pct: number;
    full_completion_pct: number;
    gap_pp: number;
    gap_within_target: boolean; // ≤ 2pp
    target: { min_pct: 8, max_gap_pp: 2 };
  }
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 단편 세션 완주율 집계
- **Given**: 단편 세션 사용자 100명 + 그 중 10명 L4 완주
- **When**: `GET /api/kpi/short-session`
- **Then**: `short_completion_pct: 10.0`

### Scenario 2: 전체 대비 격차 ≤ 2pp
- **Given**: 전체 완주율 12%, 단편 완주율 10%
- **When**: 격차 계산
- **Then**: `gap_pp: 2.0, gap_within_target: true`

### Scenario 3: 격차 > 2pp — 경고
- **Given**: 전체 15%, 단편 8%
- **When**: 격차 계산
- **Then**: `gap_pp: 7.0, gap_within_target: false`

### Scenario 4: ADMIN 전용 — 403
- **Given**: LEARNER
- **When**: 호출
- **Then**: 403

### Scenario 5: 단편 세션 사용자 0명 — 안전 응답
- **Given**: 단편 세션 기록 없음
- **When**: 호출
- **Then**: `short_completion_pct: 0, gap_pp: null`

### Scenario 6: EXP-3 자동 판정 — 목표 충족
- **Given**: 단편 완주율 ≥ 8% + 격차 ≤ 2pp
- **When**: 판정
- **Then**: EXP-3 성공

### Scenario 7: 응답 시간 p95 ≤ 500ms
- **Given**: 호출
- **When**: 측정
- **Then**: p95 ≤ 500ms

### Scenario 8: Cache 정책
- **Given**: 응답
- **When**: 헤더
- **Then**: `Cache-Control: private, max-age=300`

## :gear: Technical & Non-Functional Constraints
- **단편 세션 기준**: 1회 접속 시청 시간 < 8분 (480초). EventLog `lesson.started`~`lesson.paused` 시간차 기반
- **EXP-3 통계**: n ≥ 200, 비율 비교 (카이제곱 또는 피셔 정확). 본 API 는 원 데이터 집계만. 통계 검정은 FR-EXP-003 에서 수행
- **금지**: 개별 사용자 세션 데이터 노출 (집계만)

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현 + ADMIN 가드
- [ ] 단편/전체 완주율 + 격차 계산
- [ ] EXP-3 자동 판정 플래그
- [ ] PR 본문에 "EXP-3 단편 세션 완주율. REQ-FUNC-004 검증" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-KPI-002 (전체 완주율 — 격차 비교 대상)
  - FW-PROG-001 (진도 저장 — 세션 시간 추정)
  - CT-DB-009 (EventLog — 세션 이벤트)
  - FR-AUTH-002 (RBAC 가드)
- **Blocks**:
  - FR-EXP-003 (EXP-3 통계 검정 — 본 데이터 활용)
- **Related**:
  - Story 4 (오세은), REQ-FUNC-004
