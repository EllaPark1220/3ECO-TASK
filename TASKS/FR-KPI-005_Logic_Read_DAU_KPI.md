# [Feature] FR-KPI-005: 일일 활성 사용자 (DAU/WAU/MAU) KPI — 30일 시계열 + sticky factor

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-KPI-005: GET /api/kpi/dau — DAU + WAU + MAU + 30일 시계열 + DAU/MAU 비율 (sticky factor)"
labels: 'feature, backend, kpi, engagement, query, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-KPI-005] DAU (지난 24시간 active) + WAU (7일) + MAU (30일) + 30일 일별 시계열 + DAU/MAU 비율 (sticky factor)
- **목적**: 사용자 몰입도 측정. PRD 원칙 1 (이해 우선) — 게임화 없는 학습 서비스의 차분한 몰입도 지표. DAU/MAU 비율이 너무 낮으면 (< 5%) 학습 흐름이 끊긴 시그널 — 콘텐츠 또는 UX 점검 트리거. REQ-NF-027 (사용자 몰입도) + REQ-NF-028 (KPI 자동 집계) 충족.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.4` — REQ-NF-027 (몰입도), 028 (KPI 자동)
  - `/docs/SRS_V0_9.md#6.2.2` — EVENT_LOG (active 정의)
  - `/docs/SRS_V0_9.md#6.1` — `/api/kpi/dau` 엔드포인트
- PRD 원칙 1·4 (이해 우선·3매체 유기체) — 차분한 몰입도
- 선행: CT-DB-009 (EventLog), FR-AUTH-002, FR-KPI-001 (KPI 패턴)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/kpi/dau/route.ts` Route Handler 생성
- [ ] **`requireRole('ADMIN')` 가드** — non-ADMIN 403
- [ ] **응답 DTO 정의**:
  ```ts
  export interface DauKpiResponse {
    today: {
      dau: number;          // 지난 24시간 distinct user
      wau: number;          // 지난 7일
      mau: number;          // 지난 30일
      sticky_factor: number; // dau / mau (백분율)
    };
    daily: Array<{
      date: string;         // YYYY-MM-DD
      dau: number;
    }>;  // 지난 30일
    threshold_alert: {
      sticky_factor_low: boolean;  // sticky < 5% 시 true
      message: string | null;
    };
  }
  ```
- [ ] **active 정의**: 다음 이벤트 중 1건 이상 발행한 사용자
  - `lesson.viewed`, `ox.submitted`, `progress.saved`, `teacher_kit.downloaded`
  - 단순 페이지 뷰는 제외 (콘텐츠 상호작용만 active)
- [ ] **DAU 쿼리**:
  ```sql
  SELECT COUNT(DISTINCT "userId") AS dau
  FROM "EventLog"
  WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
    AND event IN ('lesson.viewed', 'ox.submitted', 'progress.saved', 'teacher_kit.downloaded')
    AND "userId" IS NOT NULL;
  ```
- [ ] **WAU + MAU 쿼리** — INTERVAL 만 다르게
- [ ] **30일 일별 시계열**:
  ```sql
  SELECT
    DATE("createdAt") AS date,
    COUNT(DISTINCT "userId") AS dau
  FROM "EventLog"
  WHERE "createdAt" >= NOW() - INTERVAL '30 days'
    AND event IN (...)
    AND "userId" IS NOT NULL
  GROUP BY DATE("createdAt")
  ORDER BY date ASC;
  ```
- [ ] **sticky factor 계산**: `(dau / mau) * 100`. mau=0 시 null
- [ ] **sticky factor 5% 미만 알림**:
  - `threshold_alert.sticky_factor_low = sticky_factor < 5`
  - message: "사용자 재방문율이 낮습니다. 콘텐츠 또는 UX 점검을 권장합니다."
- [ ] **응답 헤더**: `Cache-Control: private, max-age=300` (5분 캐시 — DAU 는 자주 확인)
- [ ] **응답 시간 목표**: p95 ≤ 700ms (시계열 30일 집계)
- [ ] **PII 보호**: distinct 카운트만. user_id 노출 0
- [ ] **시간대 정책**: `DATE()` 는 UTC 기준. 한국 시간대 변환 필요 시 `(... AT TIME ZONE 'Asia/Seoul')::date`
- [ ] **익명 사용자 제외**: `"userId" IS NOT NULL` 강제 (DAU 정의 정합)
- [ ] **OpenAPI 명세 갱신**

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: ADMIN 정상 응답
- **Given**: ADMIN + EventLog 30일 누적
- **When**: `GET /api/kpi/dau`
- **Then**: 200 + today (DAU/WAU/MAU/sticky) + daily 30일 + alert

### Scenario 2: non-ADMIN 차단
- **Given**: LEARNER
- **When**: 호출
- **Then**: 403

### Scenario 3: DAU 정확성 — distinct user
- **Given**: 24시간 내 동일 사용자 100건 이벤트, 다른 사용자 50명 각 1건
- **When**: 호출
- **Then**: DAU: 51 (distinct count)

### Scenario 4: 익명 사용자 제외
- **Given**: 24시간 내 anonymized 이벤트 (userId=null) 30건
- **When**: 호출
- **Then**: DAU 카운트에 포함 0

### Scenario 5: sticky factor 계산
- **Given**: DAU 50, MAU 1000
- **When**: 호출
- **Then**: sticky_factor: 5.0

### Scenario 6: sticky factor 임계 알림
- **Given**: sticky 4.5%
- **When**: 호출
- **Then**: alert.sticky_factor_low: true + message 비어있지 않음

### Scenario 7: MAU 0 시 graceful
- **Given**: 신규 서비스 (이벤트 0)
- **When**: 호출
- **Then**: today 모두 0 + sticky_factor: null. 에러 0

### Scenario 8: 시계열 정합 — 30일 모두 표시
- **Given**: 일부 날짜 활동 0
- **When**: 호출
- **Then**: daily 배열 30개 + 활동 0인 날짜는 dau:0 명시 (날짜 누락 0)

### Scenario 9: 응답 시간
- **Given**: EventLog 1M 건
- **When**: 호출
- **Then**: p95 ≤ 700ms

### Scenario 10: Cache 정책
- **Given**: 응답
- **When**: 헤더 검사
- **Then**: `Cache-Control: private, max-age=300`

## :gear: Technical & Non-Functional Constraints
- **active 이벤트 화이트리스트**: 콘텐츠 상호작용 4종만. 단순 페이지 뷰 제외
- **익명 사용자 제외**: DAU 정의 정합
- **sticky factor 5% 임계치**: 학습 서비스 평균 (게임 서비스의 20%+ 보다 낮음). 운영 데이터 누적 후 재조정
- **시간대**: UTC 기준. 한국 시간대 (KST) 표시는 클라이언트 변환 또는 별도 옵션
- **PII 미노출**: distinct count 만. 개별 user_id·email 등 절대 미포함
- **Cache**: 5분 (DAU 는 자주 확인 + 실시간성 어느 정도 필요)
- **응답 시간**: ≤ 700ms (시계열 30일 집계 부담)
- **인덱스**: EventLog `(event, createdAt, userId)` 복합 + DATE 함수 인덱스 (PostgreSQL 의 expression index)
- **시계열 빈 날짜 채우기**: SQL 결과를 JS 에서 30일 배열로 채움 (활동 0 날짜도 표시)
- **금지**:
  - 익명 사용자 카운트 포함
  - 단순 페이지 뷰 카운트 (active 정의 위반)
  - LEARNER·TEACHER 접근 허용
  - sticky factor 임계치를 매직 넘버로 하드코딩 (constants 분리)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] ADMIN 가드
- [ ] active 이벤트 화이트리스트 적용
- [ ] sticky factor 임계 알림 동작
- [ ] 시계열 30일 빈 날짜 채우기 검증
- [ ] 응답 시간 p95 ≤ 700ms 측정
- [ ] PII 부재 검증
- [ ] OpenAPI 명세 업데이트
- [ ] PR 본문에 "PRD 원칙 1 정합. 차분한 몰입도 지표" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-009 (EventLog)
  - FR-AUTH-002 (RBAC)
  - CT-API-001 (응답 포맷)
  - FW-OX-003 + 모든 active 이벤트 발행 코드 (lesson.viewed 등)
- **Blocks**:
  - REQ-NF-027 (몰입도) 검증
  - 콘텐츠 또는 UX 점검 트리거
- **Related**:
  - 운영 알림 SOP — sticky factor 5% 미만 시 액션
