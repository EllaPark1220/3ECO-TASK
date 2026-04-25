# [Feature] FR-KPI-001: 가입자 수 KPI 집계 — 누적·일별·주별 + ADMIN role 가드

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-KPI-001: GET /api/kpi/signups — 누적 가입자 + 일별/주별 신규 가입 + ADMIN 전용"
labels: 'feature, backend, kpi, admin, query, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-KPI-001] `GET /api/kpi/signups` Route Handler — 누적 가입자 + 지난 7일·30일 신규 가입 + 일별 시계열 (지난 30일) 반환. ADMIN role 만 접근.
- **목적**: 단일 제작자(CON-08) 의 운영 모니터링 진입점. PRD 의 북극성 KPI (L4 완주 300~1000명) 의 분모 추적. 다른 KPI 들 (FR-KPI-002~009) 의 패턴 기준점 — 본 태스크의 ADMIN 가드 + 시계열 집계 패턴이 후속 KPI 에 재사용됨.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.4` — REQ-NF-027 (KPI 자동 집계)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-021 (RBAC ADMIN)
  - `/docs/SRS_V0_9.md#1.2.1` — Stage 1 KPI (북극성 + 보조)
- 선행: FR-AUTH-002 (RBAC 가드), CT-DB-002 (User), CT-DB-009 (EventLog)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/kpi/signups/route.ts` Route Handler
- [ ] **`requireRole('ADMIN')` 가드 첫 줄 호출** — INV-07 강제
- [ ] **응답 DTO**:
  ```ts
  export interface SignupKpiResponse {
    cumulative: number;
    last_7_days: number;
    last_30_days: number;
    daily: Array<{
      date: string;  // YYYY-MM-DD
      count: number;
    }>;  // 지난 30일
  }
  ```
- [ ] **쿼리 — 단일 SQL with date_trunc**:
  ```ts
  const cumulative = await prisma.user.count();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const last7 = await prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } });
  const last30 = await prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } });

  // PostgreSQL 의 date_trunc 활용 (raw query)
  const daily = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
    SELECT TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS date, COUNT(*) AS count
    FROM "User"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE_TRUNC('day', "createdAt")
    ORDER BY date ASC
  `;
  ```
- [ ] **빈 날짜 채우기** — 가입 0인 날도 `{ date, count: 0 }` 으로 채워서 반환 (그래프 연속성):
  ```ts
  const dailyMap = new Map(daily.map(d => [d.date, Number(d.count)]));
  const filled: Array<{ date: string; count: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    filled.push({ date: dateStr, count: dailyMap.get(dateStr) ?? 0 });
  }
  ```
- [ ] **Cache 정책**:
  - `private, max-age=300` (5분 사적 캐시 — KPI 가 자주 변하지 않음)
- [ ] **SQLite 호환**:
  - `DATE_TRUNC` 는 PostgreSQL 전용
  - SQLite 환경 (로컬·테스트) 에서는 `strftime('%Y-%m-%d', createdAt)` 활용
  - 또는 본 KPI 는 PostgreSQL 환경에서만 동작 (운영 정책)
- [ ] **응답 시간 목표**: p95 ≤ 300ms (User 1000건 기준)
- [ ] **인덱스 활용**: User.createdAt 인덱스 (CT-DB-002)
- [ ] **EventLog 집계 활용 (선택 대안)**:
  - `auth.signup` 이벤트로 집계도 가능
  - 본 태스크는 User 테이블 직접 집계 채택 (정확성 + 단순성)
  - EventLog 활용은 비즈니스 이벤트별 분석 시 (FR-KPI-005 DAU 등)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: ADMIN — 정상 응답
- **Given**: ADMIN 사용자 + User 100건 (지난 30일에 50건 가입)
- **When**: `GET /api/kpi/signups`
- **Then**: 200 + `{ cumulative: 100, last_30_days: 50, daily: [...] }`

### Scenario 2: LEARNER 차단 — 403
- **Given**: LEARNER 사용자
- **When**: 호출
- **Then**: 403 + `FORBIDDEN`. 데이터 노출 0

### Scenario 3: TEACHER 차단 — 403
- **Given**: TEACHER 사용자
- **When**: 호출
- **Then**: 403. ADMIN 만 허용

### Scenario 4: 미인증 — 401
- **Given**: 세션 없음
- **When**: 호출
- **Then**: 401

### Scenario 5: 빈 날짜 채우기
- **Given**: 지난 30일 중 가입 0인 날 5일 존재
- **When**: 응답
- **Then**: daily 배열 30개 (모든 날 포함). 가입 0인 날은 count: 0

### Scenario 6: 응답 시간
- **Given**: User 1000건
- **When**: 호출
- **Then**: p95 ≤ 300ms

### Scenario 7: Cache 정책
- **Given**: 응답
- **When**: 헤더
- **Then**: `Cache-Control: private, max-age=300`

### Scenario 8: 시계열 정렬
- **Given**: daily 배열
- **When**: 검사
- **Then**: date ascending. 가장 최근 30일

### Scenario 9: 시간대 — UTC 정렬
- **Given**: 응답 date
- **When**: 형식 검사
- **Then**: `YYYY-MM-DD` UTC 기준. 별도 timezone 변환은 클라이언트 책임

### Scenario 10: 인덱스 활용
- **Given**: User 10K 건
- **When**: 쿼리 실행 plan
- **Then**: createdAt 인덱스 활용 검증

## :gear: Technical & Non-Functional Constraints
- **ADMIN 전용 (INV-07)**: 첫 줄 `requireRole('ADMIN')`
- **PostgreSQL 의존**: `DATE_TRUNC` 활용. SQLite 는 별도 분기
- **응답 시간**: p95 ≤ 300ms
- **Cache**: private 5분
- **응답 페이로드 일관**: 후속 KPI (FR-KPI-002~009) 도 동일 구조 (`cumulative + last_N_days + daily[]`)
- **응답 컬럼**: 가입자 카운트만. PII (email·nickname) 미포함
- **금지**:
  - LEARNER·TEACHER 의 KPI 접근
  - PII 노출 (개별 사용자 정보)
  - 지난 30일 외 임의 기간 (별도 query 파라미터 추가 가능 — 후속 PR)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] ADMIN 가드 첫 줄 검증
- [ ] 빈 날짜 채우기 동작
- [ ] 응답 시간 p95 ≤ 300ms
- [ ] PostgreSQL DATE_TRUNC + SQLite strftime 호환
- [ ] OpenAPI 명세 업데이트
- [ ] PR 본문에 "북극성 KPI 의 분모 추적 + 후속 KPI 패턴 기준" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-002 (User)
  - CT-API-001 (응답 포맷)
  - FR-AUTH-001 (getCurrentUser)
  - FR-AUTH-002 (RBAC 가드 — requireRole)
- **Blocks**:
  - FR-KPI-002~009 (본 패턴 재사용)
  - 운영 대시보드 (별도 UI 태스크)
