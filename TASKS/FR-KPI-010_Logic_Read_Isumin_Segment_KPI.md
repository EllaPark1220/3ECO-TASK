# [Feature] FR-KPI-010: 이수민 세그먼트 첫 영상 완시청률 ≥60% — hooking-averse 페르소나 KPI

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-KPI-010: GET /api/kpi/isumin-segment — hooking-averse 사용자의 첫 영상 완시청률 ≥60% + 페르소나 SH-02 이수민 가설 검증"
labels: 'feature, backend, kpi, persona, segment, query, priority:high, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-KPI-010] 페르소나 SH-02 이수민 (학습 회피·후킹 거부) 세그먼트의 첫 영상 완시청률 추적 — `hooking-averse` 태그 사용자의 첫 lesson `lesson.viewed_complete` 도달률 ≥60% 충족 검증 + 일반 사용자와 비교
- **목적**: PRD 의 핵심 페르소나 SH-02 이수민의 가설 검증 — **"후킹 거부 사용자도 차분한 도입부에서 학습 시작 가능한가?"** 가설 충족 (≥60%) 시 본 사이트의 정신 (CON-05 후킹 금지) 이 단순 정책이 아닌 실증된 효용 입증. FR-EXP-002 (실험) 와 사촌 — 본 KPI 는 운영 데이터 기반 지속 추적.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.4` — REQ-NF-029 (페르소나별 성과)
  - `/docs/SRS_V0_9.md#1.4` — 페르소나 SH-02 이수민
  - `/docs/SRS_V0_9.md#1.5.2` — CON-05 (후킹 금지)
  - `/docs/SRS_V0_9.md#6.2.2` — EVENT_LOG (`lesson.viewed_complete`)
- 페르소나: SH-02 이수민
- 선행: FW-EXP-001 (페르소나 태그), CT-DB-009 (EventLog), FR-AUTH-002 (RBAC), FR-EXP-002 (실험 사촌)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/kpi/isumin-segment/route.ts` Route Handler
- [ ] **`requireRole('ADMIN')` 가드**
- [ ] **응답 DTO**:
  ```ts
  export interface IsuminSegmentKpiResponse {
    segment: 'hooking-averse';
    total_users_in_segment: number;
    first_video_completion: {
      started_first: number;       // 첫 lesson 시작한 사용자 수
      completed_first: number;      // 첫 lesson 완시청 (90% 이상) 사용자 수
      rate: number;
      target: 60;
      target_achieved: boolean;
    };
    comparison_with_general: {
      general_users: number;
      general_completion_rate: number;
      diff_pp: number;             // segment - general (양수면 segment 우위)
    };
    interpretation: string;
    period: { from: string; to: string };
  }
  ```
- [ ] **세그먼트 정의 — `personaTags` 에 `'hooking-averse'` 포함**:
  ```ts
  const segmentUsers = await prisma.user.findMany({
    where: { personaTags: { has: 'hooking-averse' } },
    select: { id: true },
  });
  const segmentUserIds = segmentUsers.map(u => u.id);
  ```
- [ ] **첫 영상 완시청 정의**:
  - 사용자별 가장 빠른 (시간 순 첫) `lesson.viewed_complete` 이벤트
  - 단 `lesson.viewed` 가 발행됐는데 `lesson.viewed_complete` 가 없으면 미완시청
  - 첫 lesson 단위 분석 (한 번이라도 완시청 시 success)
- [ ] **데이터 쿼리**:
  ```ts
  // 첫 lesson 시작 사용자
  const startedUsers = await prisma.$queryRaw<Array<{ user_id: string }>>`
    SELECT DISTINCT "userId" AS user_id
    FROM "EventLog"
    WHERE event = 'lesson.viewed'
      AND "userId" IN (${Prisma.join(segmentUserIds)})
  `;

  // 첫 lesson 완시청 사용자 (한 번이라도 완시청)
  const completedUsers = await prisma.$queryRaw<Array<{ user_id: string }>>`
    SELECT DISTINCT "userId" AS user_id
    FROM "EventLog"
    WHERE event = 'lesson.viewed_complete'
      AND "userId" IN (${Prisma.join(segmentUserIds)})
  `;

  const segmentRate = startedUsers.length > 0
    ? (completedUsers.length / startedUsers.length) * 100
    : 0;
  ```
- [ ] **일반 사용자 비교**:
  ```ts
  // hooking-averse 가 아닌 사용자 비교
  const generalUsers = await prisma.user.findMany({
    where: { personaTags: { isEmpty: true } },  // 또는 NOT contains 'hooking-averse'
    select: { id: true },
  });
  // 동일 쿼리 적용 → general_completion_rate 계산
  ```
- [ ] **interpretation**:
  ```ts
  function interpret(segmentRate: number, diffPp: number): string {
    if (segmentRate >= 60) {
      const note = diffPp >= 0
        ? `일반 사용자 대비 +${diffPp.toFixed(1)}pp 우위 (이수민 세그먼트가 차분한 도입부에 더 강한 반응).`
        : `일반 사용자 대비 ${diffPp.toFixed(1)}pp (이수민 세그먼트도 일반 수준 효용).`;
      return `✅ 이수민 가설 충족. 첫 영상 완시청률 ${segmentRate.toFixed(1)}% ≥ 60%. ${note}`;
    }
    return `⚠️ 이수민 가설 미충족. ${segmentRate.toFixed(1)}% < 60%. 도입부 콘텐츠 점검 필요.`;
  }
  ```
- [ ] **응답 헤더**: `Cache-Control: private, max-age=600`
- [ ] **응답 시간**: p95 ≤ 600ms
- [ ] **PII 보호**: 카운트만
- [ ] **샘플 부족 시 graceful**: total_users_in_segment < 20 시 안내

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: ADMIN 정상 응답
- **Given**: ADMIN + hooking-averse 사용자 50명
- **When**: 호출
- **Then**: 200 + 정상

### Scenario 2: 가설 충족 — ≥60%
- **Given**: 시작 50명 + 완시청 35명
- **When**: 호출
- **Then**: rate: 70, target_achieved: true, ✅

### Scenario 3: 가설 미충족
- **Given**: 시작 50명 + 완시청 25명
- **When**: 호출
- **Then**: rate: 50, target_achieved: false, ⚠️

### Scenario 4: 일반 사용자 대비 우위
- **Given**: segment 70%, general 55%
- **When**: 호출
- **Then**: diff_pp: +15, interpretation 에 우위 표시

### Scenario 5: 일반 사용자 대비 동등
- **Given**: segment 65%, general 60%
- **When**: 호출
- **Then**: diff_pp: +5, "일반 수준 효용"

### Scenario 6: 세그먼트 사용자 0명 — graceful
- **Given**: hooking-averse 0명
- **When**: 호출
- **Then**: total_users_in_segment: 0, rate: 0. 에러 0

### Scenario 7: 시작 0건 — graceful
- **Given**: 시작 0
- **When**: 호출
- **Then**: rate: 0

### Scenario 8: non-ADMIN — 403
- **Given**: LEARNER
- **When**: 호출
- **Then**: 403

### Scenario 9: PII 미노출
- **Given**: 응답
- **When**: 검사
- **Then**: 개별 user_id 0

### Scenario 10: 응답 시간
- **Given**: EventLog 50K
- **When**: 호출
- **Then**: p95 ≤ 600ms

## :gear: Technical & Non-Functional Constraints
- **세그먼트 정의 — `personaTags has 'hooking-averse'`**: User 모델 활용 (FW-EXP-001 의 schema)
- **첫 영상 완시청 — `lesson.viewed_complete` 1회 이상**: 사용자 단위 boolean
- **일반 사용자 비교 — 페르소나 태그 부재 사용자**: 대조군
- **샘플 부족 임계 (20명 미만)**: 분석 신뢰도 약함 안내
- **PII 보호**
- **응답 시간 ≤ 600ms**
- **interpretation — 한국어 + 시그널**
- **금지**:
  - 세그먼트 식별자 노출
  - 일반 사용자 정의 임의 변경
  - 샘플 부족 시 강제 결론

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] 세그먼트 정의 (personaTags has 'hooking-averse')
- [ ] 일반 사용자 비교
- [ ] interpretation 한국어
- [ ] 응답 시간 측정
- [ ] OpenAPI 명세 추가
- [ ] PR 본문에 "페르소나 SH-02 이수민 가설 운영 검증" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-EXP-001 (페르소나 태그 schema)
  - CT-DB-009 (EventLog — lesson.viewed_complete)
  - FR-AUTH-002 (RBAC)
  - FR-LES-003 (lesson.viewed_complete 발행)
- **Blocks**:
  - 페르소나 SH-02 가설 운영 검증
  - 도입부 콘텐츠 정책 의사결정
- **Related**:
  - FR-EXP-002 (실험 사촌 — 본 KPI 는 운영 데이터)
  - CON-05 (후킹 금지)
