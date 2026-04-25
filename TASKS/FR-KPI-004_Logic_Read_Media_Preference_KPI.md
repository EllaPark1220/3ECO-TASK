# [Feature] FR-KPI-004: 매체 선호도 분포 KPI — VIDEO/TEXT/MIXED 비율 + 매체 전환 빈도

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-KPI-004: GET /api/kpi/media-preference — User.mediaPreference 분포 + lesson.media_switched 이벤트 빈도 (ADMIN 전용)"
labels: 'feature, backend, kpi, media, query, priority:medium, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-KPI-004] User.mediaPreference 분포 (VIDEO·TEXT·MIXED 비율) + 매체 전환 이벤트 (`lesson.media_switched`) 빈도 + 사용자별 평균 전환 횟수
- **목적**: 콘텐츠 전략 의사결정 지표. PRD 원칙 4 (3매체 유기체) 의 운영 검증 — 매체 전환이 실제로 일어나는지, 어느 매체가 주로 선택되는지 측정. Story 5-A (한정숙) 의 글로 읽기 모드 사용률이 향후 콘텐츠 우선순위 (영상 중심 vs 텍스트 중심) 의사결정 근거. REQ-NF-028 (KPI 자동 집계) 충족.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.4` — REQ-NF-028 (KPI 자동 집계)
  - `/docs/SRS_V0_9.md#4.1.5` — REQ-FUNC-026 (매체 전환 영속화)
  - `/docs/SRS_V0_9.md#6.2.2` — USER 테이블 (mediaPreference) + EVENT_LOG (`lesson.media_switched`)
  - `/docs/SRS_V0_9.md#6.1` — `/api/kpi/media-preference` 엔드포인트
- PRD 원칙 4 (3매체 유기체) — 매체 사용 패턴 운영 검증
- 페르소나: SH-04 한정숙 (저시력·글 모드 선호)
- 선행: CT-DB-002 (User), CT-DB-009 (EventLog), FR-AUTH-002, FR-KPI-001 (KPI 패턴)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/kpi/media-preference/route.ts` Route Handler 생성
- [ ] **`requireRole('ADMIN')` 가드** (FR-AUTH-002) — non-ADMIN 403
- [ ] **응답 DTO 정의**:
  ```ts
  export interface MediaPreferenceKpiResponse {
    distribution: {
      VIDEO: { count: number; pct: number };
      TEXT: { count: number; pct: number };
      MIXED: { count: number; pct: number };
    };
    total_users: number;
    switching_frequency: {
      total_switches_30d: number;       // 지난 30일 매체 전환 이벤트 수
      avg_switches_per_user: number;    // 사용자당 평균
      power_switchers: number;          // 일 1회 이상 전환하는 사용자 수
    };
    by_lesson: Array<{
      lesson_id: string;
      title: string;
      switch_count_30d: number;          // 해당 lesson 의 매체 전환 이벤트
    }>;
  }
  ```
- [ ] **분포 쿼리 — User.mediaPreference 단순 집계**:
  ```ts
  const distribution = await prisma.user.groupBy({
    by: ['mediaPreference'],
    _count: true,
  });
  // 결과를 DTO 의 distribution 으로 변환 (pct 계산 포함)
  ```
- [ ] **전환 빈도 쿼리 — EventLog 의 `lesson.media_switched`**:
  ```ts
  const switches = await prisma.eventLog.count({
    where: {
      event: 'lesson.media_switched',
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  const distinctSwitchers = await prisma.eventLog.findMany({
    where: { event: 'lesson.media_switched', createdAt: { gte: thirtyDaysAgo } },
    select: { userId: true },
    distinct: ['userId'],
  });
  ```
- [ ] **`lesson.media_switched` 이벤트 발행 정책** — FW-OX-003 패턴 활용:
  - FR-LES-003 의 매체 전환 토글이 호출 시 EventLog 발행
  - payload: `{ lesson_id, from: 'VIDEO', to: 'TEXT' }`
- [ ] **power_switchers 정의** — 30일간 30회 이상 전환 (일 1회) 사용자
- [ ] **lesson 별 전환 카운트** — payload 의 lesson_id 활용:
  ```sql
  SELECT payload->>'lesson_id' AS lesson_id, COUNT(*) AS switch_count
  FROM "EventLog"
  WHERE event = 'lesson.media_switched' AND "createdAt" >= NOW() - INTERVAL '30 days'
  GROUP BY payload->>'lesson_id'
  ```
- [ ] **응답 헤더**: `Cache-Control: private, max-age=600` (10분 캐시)
- [ ] **응답 시간 목표**: p95 ≤ 500ms
- [ ] **PII 보호**: 개별 사용자 식별자 미노출. distinct 카운트만
- [ ] **OpenAPI 명세 갱신**

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: ADMIN 정상 응답
- **Given**: ADMIN + User 1000명 (VIDEO 400, TEXT 200, MIXED 400) + EventLog 30일 누적 5000건 매체 전환
- **When**: `GET /api/kpi/media-preference`
- **Then**: 200 + distribution 정상 + switching_frequency 정상

### Scenario 2: non-ADMIN 차단
- **Given**: LEARNER 또는 TEACHER
- **When**: 호출
- **Then**: 403

### Scenario 3: 미인증 — 401
- **Given**: 세션 없음
- **When**: 호출
- **Then**: 401

### Scenario 4: 분포 비율 합계 100%
- **Given**: User 1000명
- **When**: distribution 합산
- **Then**: VIDEO.pct + TEXT.pct + MIXED.pct = 100 (반올림 오차 허용 ±1)

### Scenario 5: 사용자 0명 시 graceful
- **Given**: User 0명
- **When**: 호출
- **Then**: 200 + distribution 모두 0 + total_users: 0. 에러 0

### Scenario 6: 전환 이벤트 0건 시 graceful
- **Given**: 매체 전환 이벤트 0건
- **When**: 호출
- **Then**: switching_frequency.total_switches_30d: 0, avg: 0, power_switchers: 0

### Scenario 7: power_switchers 식별
- **Given**: 사용자 A 가 30일간 35회 전환, B 25회, C 5회
- **When**: 호출
- **Then**: power_switchers: 1 (A 만 30회 이상)

### Scenario 8: lesson 별 전환 빈도
- **Given**: lesson L001 의 전환 100건, L002 의 전환 50건
- **When**: by_lesson 검사
- **Then**: L001 — switch_count_30d: 100, L002 — 50. 정렬 desc

### Scenario 9: 응답 시간
- **Given**: User 10K + EventLog 100K
- **When**: 호출
- **Then**: p95 ≤ 500ms

### Scenario 10: PII 부재
- **Given**: 응답
- **When**: payload 검사
- **Then**: 개별 user_id 미포함. 카운트만

## :gear: Technical & Non-Functional Constraints
- **분포 vs 전환 분리**:
  - **분포** (User.mediaPreference) — 사용자가 영속화한 선호도
  - **전환 빈도** (EventLog) — 실제 토글 행동
  - 두 지표가 일치하지 않을 수 있음 — 사용자가 토글하지만 영속화 안할 수 있음 (미인증 또는 일시 사용)
- **lesson.media_switched 이벤트 의존**: FR-LES-003 의 토글 + FW-OX-003 패턴으로 발행
- **PII 보호**: 개별 사용자 식별자 미노출. distinct 카운트만
- **Cache**: 10분
- **응답 시간**: ≤ 500ms
- **power_switchers 임계치**: 30일 30회 (일 1회) — 실험적 임계. 운영 데이터 누적 후 재조정
- **인덱스**: User `(mediaPreference)` + EventLog `(event, createdAt)` + payload->lesson_id GIN
- **금지**:
  - 개별 사용자 매체 사용 패턴 노출 (PII)
  - 영속화 안된 일시 토글을 분포에 반영 (User 테이블 기준)
  - LEARNER·TEACHER 접근 허용

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] ADMIN 가드
- [ ] 분포 + 전환 빈도 분리 응답
- [ ] power_switchers 식별 동작
- [ ] 응답 시간 p95 ≤ 500ms 측정
- [ ] PII 부재 검증
- [ ] OpenAPI 명세 업데이트
- [ ] PR 본문에 "PRD 원칙 4 운영 검증. 콘텐츠 우선순위 의사결정 근거" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-002 (User 모델)
  - CT-DB-009 (EventLog 모델)
  - FR-AUTH-002 (RBAC)
  - CT-API-001 (응답 포맷)
  - FR-LES-003 (매체 전환 토글 — `lesson.media_switched` 이벤트 발행)
- **Blocks**:
  - 콘텐츠 전략 의사결정 (영상·텍스트 비중)
  - REQ-FUNC-026 운영 검증
- **Related**:
  - 페르소나 SH-04 한정숙 의 사용 패턴 추적
