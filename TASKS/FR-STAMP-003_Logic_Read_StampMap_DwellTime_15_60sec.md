# [Feature] FR-STAMP-003: 스탬프 맵 체류 시간 — 중앙값 15~60초 (게임화 방지)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-STAMP-003: 스탬프 맵 진입 후 체류 시간 KPI — 중앙값 15~60초 (게이미피케이션 과몰입 방지)"
labels: 'feature, backend, kpi, stamp-map, gamification, priority:medium, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-STAMP-003] 스탬프 맵 페이지 체류 시간 측정 — 중앙값 15~60초 (게임화 과몰입 방지 가드레일)
- **목적**: PRD 원칙 3 (윤리 영구 배제) 의 정량 검증 — 스탬프 맵이 게이미피케이션 요소로 과도한 몰입을 유발하지 않는지 체류 시간으로 판단. 중앙값 15~60초 범위 = "확인 후 떠남" 패턴으로 건전 사용. 60초 초과 = 과몰입 위험 신호.

## :link: References (Spec & Context)
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-002 (게이미피케이션 방지 — 랭킹·경쟁 금지)
  - `/docs/SRS_V0_9.md#4.2.4` — REQ-NF-040 (스탬프 맵 체류 시간 중앙값)
- 선행: FR-STAMP-002 (스탬프 맵 UI), CT-DB-009 (EventLog)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **프론트엔드 이벤트 발행** — `FR-STAMP-002` 의 스탬프 맵 컴포넌트에 체류 시간 트래킹:
  ```ts
  // 마운트 시 시작, 언마운트 또는 visibility hidden 시 종료
  useEffect(() => {
    const enterTime = Date.now();
    return () => {
      const dwellSec = Math.round((Date.now() - enterTime) / 1000);
      logEvent('stamp_map.dwell', { dwell_sec: dwellSec });
    };
  }, []);
  ```
- [ ] **KPI 집계 API** — `app/api/kpi/stamp-dwell/route.ts`:
  ```sql
  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (payload->>'dwell_sec')::int) AS median_sec
  FROM event_logs
  WHERE event_name = 'stamp_map.dwell'
    AND timestamp >= NOW() - INTERVAL '30 days';
  ```
- [ ] **응답 DTO**:
  ```ts
  interface StampDwellKpiResponse {
    median_sec: number;
    p25_sec: number;
    p75_sec: number;
    total_visits: number;
    within_target: boolean; // 15 ≤ median ≤ 60
    alert: 'healthy' | 'too_short' | 'too_long';
  }
  ```
- [ ] **알림 정책**:
  - median < 15초: `too_short` (스탬프 맵 무시 — UX 가치 부족 의심)
  - 15~60초: `healthy`
  - median > 60초: `too_long` (과몰입 위험 — UI 단순화 검토)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 체류 시간 중앙값 30초 — healthy
- **Given**: 100명 방문, 중앙값 30초
- **When**: 집계
- **Then**: `median_sec: 30, alert: 'healthy', within_target: true`

### Scenario 2: 중앙값 > 60초 — too_long 경고
- **Given**: 중앙값 90초
- **When**: 집계
- **Then**: `alert: 'too_long', within_target: false`

### Scenario 3: 중앙값 < 15초 — too_short
- **Given**: 중앙값 5초
- **When**: 집계
- **Then**: `alert: 'too_short', within_target: false`

### Scenario 4: 이벤트 발행 — 마운트/언마운트
- **Given**: 사용자가 스탬프 맵 진입
- **When**: 20초 후 다른 페이지 이동
- **Then**: EventLog `stamp_map.dwell` + `{ dwell_sec: 20 }` 1건

### Scenario 5: ADMIN 전용 — 403
- **Given**: LEARNER
- **When**: 호출
- **Then**: 403

### Scenario 6: 방문 0건 — 안전 응답
- **Given**: 이벤트 0건
- **When**: 호출
- **Then**: `median_sec: null, total_visits: 0`

### Scenario 7: KPI 대시보드 통합
- **Given**: FR-KPI-009 대시보드
- **When**: 스탬프 체류 카드 확인
- **Then**: 중앙값 + 건전/과몰입 라벨 표시

### Scenario 8: visibilitychange 처리
- **Given**: 사용자가 탭 전환 (hidden)
- **When**: 탭 재활성화 없이 종료
- **Then**: hidden 시점까지의 체류 시간만 기록 (백그라운드 제외)

## :gear: Technical & Non-Functional Constraints
- **체류 시간 측정 정확도**: `Date.now()` 기반 (±1초)
- **이벤트 발행**: `logEvent('stamp_map.dwell', { dwell_sec })` — CT-DB-009 EventLog
- **통계**: `PERCENTILE_CONT` PostgreSQL 함수 (SQLite 미지원 — PostgreSQL 전용)
- **금지**: 체류 시간을 사용자에게 노출 (게이미피케이션 유발). ADMIN KPI 전용

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 통과
- [ ] 프론트엔드 dwell 이벤트 발행 (FR-STAMP-002 확장)
- [ ] KPI 집계 API 구현
- [ ] 중앙값 15~60초 가드레일 알림
- [ ] PR 본문에 "PRD 원칙 3 윤리. 게임화 과몰입 방지 KPI" 명시

## :construction: Dependencies & Blockers
- **Depends on**: FR-STAMP-002 (UI), CT-DB-009 (EventLog), FR-AUTH-002 (ADMIN)
- **Blocks**: FR-KPI-009 (대시보드 카드)
- **Related**: REQ-FUNC-002 (게이미피케이션 방지), REQ-NF-040
