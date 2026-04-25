# [Feature] FR-KPI-002: L4 완주율 KPI — 북극성 KPI 추적 (300~1000명 목표)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-KPI-002: GET /api/kpi/lesson-completion — 모든 lesson 별 완주자 수 + L4 모듈 완주자 (북극성 KPI)"
labels: 'feature, backend, kpi, north-star, query, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-KPI-002] `GET /api/kpi/lesson-completion` Route Handler — 각 lesson 의 stamp 발급자 수 (= 완주자) + L1~L5 모듈별 완주자 + **L4 (금융과 위험) 완주자** (북극성 KPI 의 핵심 측정값)
- **목적**: PRD 의 Stage 1 북극성 KPI — "L4 완주 학습자 300~1000명" 의 자동 측정. 단일 제작자가 매주 진척도를 인지할 수 있도록 자동화. Public Pilot Exit 게이트의 핵심 지표.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.2.1` — Stage 1 북극성 KPI
  - `/docs/SRS_V0_9.md#4.2.4` — REQ-NF-027, 028 (KPI 자동 집계)
- PRD: 북극성 KPI = L4 완주자 300~1000명
- 선행: CT-DB-005 (Stamp), CT-DB-003 (Lesson + Module), FR-AUTH-002 (ADMIN 가드)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/kpi/lesson-completion/route.ts` Route Handler
- [ ] **`requireRole('ADMIN')` 가드**
- [ ] **응답 DTO**:
  ```ts
  export interface LessonCompletionKpiResponse {
    by_lesson: Array<{
      lesson_id: string;
      title: string;
      module_id: string;
      completion_count: number;  // stamp 발급자 수
    }>;
    by_module: Array<{
      module_id: string;
      name: string;
      lesson_count: number;
      module_completers: number;  // 해당 모듈의 모든 lesson 완주자
    }>;
    north_star: {
      l4_module_completers: number;  // L4 (금융과 위험) 모듈 완주자 수
      target_min: 300;
      target_max: 1000;
      progress_pct: number;  // (l4_module_completers / 300) * 100, capped at 100
    };
  }
  ```
- [ ] **쿼리 — by_lesson**:
  ```ts
  const byLesson = await prisma.$queryRaw<Array<{ lesson_id: string; title: string; module_id: string; completion_count: bigint }>>`
    SELECT l."lessonId" AS lesson_id, l.title, l."moduleId" AS module_id, COUNT(s.id) AS completion_count
    FROM "Lesson" l
    LEFT JOIN "Stamp" s ON s."lessonId" = l."lessonId"
    GROUP BY l."lessonId", l.title, l."moduleId"
    ORDER BY l."lessonId" ASC
  `;
  ```
- [ ] **쿼리 — by_module (모든 lesson 완주자)**:
  ```ts
  // 각 모듈의 lesson 모두 stamp 받은 사용자 카운트
  const byModule = await prisma.$queryRaw<Array<{ module_id: string; name: string; lesson_count: bigint; module_completers: bigint }>>`
    WITH module_lesson_counts AS (
      SELECT m."moduleId", m.name, COUNT(l."lessonId") AS lesson_count
      FROM "Module" m
      LEFT JOIN "Lesson" l ON l."moduleId" = m."moduleId"
      GROUP BY m."moduleId", m.name
    ),
    user_module_completion AS (
      SELECT s."userId", l."moduleId", COUNT(s.id) AS earned_in_module
      FROM "Stamp" s
      JOIN "Lesson" l ON l."lessonId" = s."lessonId"
      GROUP BY s."userId", l."moduleId"
    )
    SELECT mlc."moduleId" AS module_id, mlc.name, mlc.lesson_count,
           COUNT(CASE WHEN umc.earned_in_module = mlc.lesson_count THEN 1 END) AS module_completers
    FROM module_lesson_counts mlc
    LEFT JOIN user_module_completion umc ON umc."moduleId" = mlc."moduleId"
    GROUP BY mlc."moduleId", mlc.name, mlc.lesson_count
    ORDER BY mlc."moduleId" ASC
  `;
  ```
- [ ] **북극성 KPI 추출**:
  ```ts
  const l4 = byModule.find(m => m.module_id === 'M4');
  const northStar = {
    l4_module_completers: Number(l4?.module_completers ?? 0),
    target_min: 300,
    target_max: 1000,
    progress_pct: Math.min(100, Math.round((Number(l4?.module_completers ?? 0) / 300) * 100)),
  };
  ```
- [ ] **응답 시간 목표**: p95 ≤ 500ms (Stamp 5K 건 + Lesson 10편 + Module 5개 기준)
- [ ] **인덱스 활용**: Stamp.userId, Stamp.lessonId 인덱스
- [ ] **Cache**: `private, max-age=600` (10분, KPI 변동성 낮음)
- [ ] **PostgreSQL CTE 의존**: SQLite 호환 별도 분기 또는 PostgreSQL 전용 정책
- [ ] **로깅**: 본 KPI 가 운영 핵심 지표라 매 호출 시 Vercel Logs 에 결과 기록 — 운영자가 trend 확인 가능

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: ADMIN — 정상 응답
- **Given**: 100명 사용자 + Stamp 1500건 (다양한 lesson)
- **When**: 호출
- **Then**: 200 + by_lesson + by_module + north_star 모두 포함

### Scenario 2: 북극성 KPI — L4 완주자 50명
- **Given**: 50명이 M4 의 모든 lesson (L007, L008) 완주
- **When**: 응답
- **Then**: `north_star.l4_module_completers = 50`, `progress_pct = 16` (50/300=16.7% → 16)

### Scenario 3: L4 완주자 0명 (Alpha 초기)
- **Given**: M4 의 lesson 완주자 0
- **When**: 응답
- **Then**: `l4_module_completers: 0, progress_pct: 0`

### Scenario 4: L4 완주자 350명 (목표 초과)
- **Given**: 350명 완주
- **When**: 응답
- **Then**: `l4_module_completers: 350, progress_pct: 100` (capped)

### Scenario 5: by_lesson 정렬
- **Given**: 응답
- **When**: 검사
- **Then**: lesson_id ascending

### Scenario 6: by_module 정렬
- **Given**: 응답
- **When**: 검사
- **Then**: module_id ascending (M1, M2, ...)

### Scenario 7: 모든 lesson 미완주 사용자
- **Given**: User 가 L007 만 stamp, L008 미완주
- **When**: 응답
- **Then**: 본 사용자는 M4 module_completers 미카운트 (모든 lesson 완주 조건)

### Scenario 8: ADMIN 외 차단
- **Given**: LEARNER·TEACHER
- **When**: 호출
- **Then**: 403

### Scenario 9: 응답 시간
- **Given**: Stamp 10K 건
- **When**: 호출
- **Then**: p95 ≤ 500ms

### Scenario 10: Cache 정책
- **Given**: 응답
- **When**: 헤더
- **Then**: `Cache-Control: private, max-age=600`

## :gear: Technical & Non-Functional Constraints
- **북극성 KPI 핵심**: PRD 의 Stage 1 의 가장 중요한 지표. 본 API 가 SSOT
- **모듈 완주 정의**: "M4 의 모든 lesson 의 stamp 보유" — 본 쿼리의 CTE 가 강제
- **PostgreSQL CTE 의존**: SQLite 환경에서는 별도 처리 필요. 본 KPI 는 운영 환경 (Postgres) 만 활용 정책
- **인덱스 활용**: Stamp.userId, Stamp.lessonId 핫스팟
- **Cache**: 10분. 잦은 호출 회피
- **응답 컬럼**: 카운트만. 개별 사용자 식별자 미포함 (PII 보호)
- **응답 시간**: p95 ≤ 500ms (KPI 가 약간 느려도 실시간성 미요구)
- **금지**:
  - 개별 사용자 ID 노출
  - L4 외 임의 모듈을 북극성으로 설정 (PRD 정책 위반)
  - L4 완주 정의 변경 (모든 lesson 보유 → 일부만 보유 등)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] ADMIN 가드
- [ ] 북극성 KPI (L4) 정확 카운트
- [ ] by_lesson + by_module 시나리오 검증
- [ ] 응답 시간 p95 ≤ 500ms
- [ ] PostgreSQL CTE 활용 검증
- [ ] OpenAPI 명세 업데이트
- [ ] PR 본문에 "**북극성 KPI 의 SSOT — Stage 1 핵심 지표**" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-003 (Lesson + Module)
  - CT-DB-005 (Stamp)
  - CT-API-001 (응답 포맷)
  - FR-AUTH-002 (RBAC ADMIN)
  - CT-MOCK-001 (Lesson 시드 — M4 의 lesson 정의)
- **Blocks**:
  - 운영 대시보드 (UI)
  - **Public Pilot Exit Gate** — L4 300명 도달 측정
  - PRD Stage 1 → Stage 2 전환 트리거
