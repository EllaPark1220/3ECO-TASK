# [Feature] FR-EXP-004: EXP-4 글로 읽기 전환자 완주율 ≥15% — n≥100 + 페르소나 SH-04 한정숙

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-EXP-004: GET /api/experiments/exp-4 — 글로 읽기 전환자의 완주율 ≥15% + 페르소나 SH-04 한정숙 검증 + video-only 보호"
labels: 'feature, backend, experiment, kpi, query, accessibility, priority:high, mvp-in, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-EXP-004] EXP-4 (글로 읽기 모드 노출 vs 영상 우선) 분석 — 글로 읽기 모드로 전환한 사용자의 완주율 ≥15% 충족 여부 + 페르소나 SH-04 한정숙 (저시력) 의 사용 패턴 + video-only 태그 사용자 보호 검증
- **목적**: PRD 원칙 4 (3매체 유기체) 의 글로 읽기 모드 효용 검증. 가설: 글로 읽기 전환자의 완주율 ≥15% 면 글로 읽기 모드가 단순 보조가 아닌 **유효한 대안 학습 매체** 입증 — 접근성 가치 + 저시력·청각 사용자 정합. 격차 시 글로 읽기 콘텐츠 품질 점검.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.8` — REQ-FUNC-043 (EXP-4)
  - `/docs/SRS_V0_9.md#4.1.5` — REQ-FUNC-026 (매체 전환)
  - `/docs/SRS_V0_9.md#1.4` — 페르소나 SH-04 한정숙 (저시력·글 모드)
  - `/docs/SRS_V0_9.md#6.2.2` — EVENT_LOG (`lesson.media_switched`, `lesson.completed`)
- 페르소나: SH-04 한정숙 (저시력)
- 선행: FW-EXP-001 (분배 + video-only 보호), CT-DB-009 (EventLog), FR-AUTH-002 (RBAC), FR-EXP-001~003 (패턴), FR-KPI-004 (매체 선호 사촌)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/experiments/exp-4/route.ts` Route Handler
- [ ] **`requireRole('ADMIN')` 가드**
- [ ] **응답 DTO**:
  ```ts
  export interface Exp4Response {
    sample_size: { control: number; treatment: number; total: number };
    minimum_sample_size: 100;
    sample_size_achieved: boolean;
    text_mode_switchers: number;       // 글로 읽기로 전환한 사용자 (treatment 또는 control 무관)
    text_mode_completion: {
      switchers: number;                 // 전환자 수
      completed: number;                 // 그 중 완주한 사용자 수
      rate: number;                      // 백분율
    };
    target: 15;                          // PRD 가설 (≥15%)
    target_achieved: boolean;
    accessibility_segment_breakdown: {
      // 추가 인사이트 — accessibilityMode=true 사용자
      a11y_users: number;
      a11y_text_switchers: number;
      a11y_completion_rate: number;
    };
    video_only_protection: {
      video_only_users: number;
      treatment_exposure_count: number;  // 0 강제
      protection_intact: boolean;
    };
    interpretation: string;
    period: { from: string; to: string };
  }
  ```
- [ ] **글로 읽기 전환 정의**:
  - EventLog `lesson.media_switched` 의 payload 에 `to: 'TEXT'`
  - 또는 User.mediaPreference = 'TEXT'
  - 본 EXP 는 **세션 단위 전환** — `lesson.media_switched` 이벤트 발행 사용자 카운트
  - 영구 영속화 (User.mediaPreference) 는 별도 메트릭
- [ ] **데이터 쿼리 — 글로 읽기 전환자 + 완주 카운트**:
  ```ts
  const switchers = await prisma.$queryRaw<Array<{
    user_id: string;
    switched_lessons: bigint;
  }>>`
    SELECT
      "userId" AS user_id,
      COUNT(DISTINCT payload->>'lesson_id') AS switched_lessons
    FROM "EventLog"
    WHERE event = 'lesson.media_switched'
      AND payload->>'to' = 'TEXT'
      AND "userId" IS NOT NULL
    GROUP BY "userId"
  `;

  const switcherIds = switchers.map(s => s.user_id);

  const completed = await prisma.$queryRaw<Array<{
    user_id: string;
    completed_count: bigint;
  }>>`
    SELECT
      "userId" AS user_id,
      COUNT(DISTINCT payload->>'lesson_id') AS completed_count
    FROM "EventLog"
    WHERE event = 'stamp.earned'
      AND "userId" IN (${Prisma.join(switcherIds)})
    GROUP BY "userId"
  `;
  ```
- [ ] **completion 계산 — 사용자 단위**:
  - "완주" = 글로 읽기 전환한 사용자 중 stamp 1건 이상 보유
  - 단, 더 보수적 정의 — stamp ≥ 시드된 lesson 의 ≥80% (FR-EXP-001 와 정합)
- [ ] **accessibility_segment_breakdown** — 추가 인사이트:
  ```ts
  const a11yUsers = await prisma.user.count({ where: { accessibilityMode: true } });
  const a11ySwitchers = switchers.filter(async s => {
    const u = await prisma.user.findUnique({ where: { id: s.user_id }, select: { accessibilityMode: true } });
    return u?.accessibilityMode;
  });
  ```
  - 페르소나 SH-04 한정숙 (accessibilityMode=true) 의 글로 읽기 전환률 + 완주율 분리 추적
- [ ] **video-only 보호 검증 (FW-EXP-001 정합)**:
  ```ts
  const videoOnlyExposure = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "EventLog" e
    JOIN "User" u ON u.id = e."userId"
    WHERE e.event = 'exp.assigned'
      AND e.payload->>'exp_id' = 'EXP-4'
      AND e.payload->>'variant' = 'treatment'
      AND 'video-only' = ANY(u."personaTags")
  `;
  const protectionIntact = Number(videoOnlyExposure[0].count) === 0;
  ```
- [ ] **interpretation**:
  ```ts
  function interpret(rate: number, sampleAchieved: boolean, protectionIntact: boolean, a11yRate: number): string {
    if (!protectionIntact) return `🚨 video-only 보호 위반. FW-EXP-001 검토 필요.`;
    if (!sampleAchieved) return `샘플 부족 (n < 100). 추가 데이터 필요.`;
    if (rate >= 15) {
      return `✅ 글로 읽기 모드 효용 검증. 전환자 완주율 ${rate.toFixed(1)}% ≥ 15%. ` +
             `접근성 사용자 완주율 ${a11yRate.toFixed(1)}% (한정숙 페르소나).`;
    }
    return `⚠️ 글로 읽기 전환자 완주율 ${rate.toFixed(1)}% < 15%. ` +
           `텍스트 콘텐츠 품질 점검 필요 (REQ-FUNC-014 정합성).`;
  }
  ```
- [ ] **응답 헤더**: `Cache-Control: private, max-age=600`
- [ ] **응답 시간**: p95 ≤ 1초
- [ ] **PII 보호**: 카운트·비율만

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: ADMIN 정상 응답
- **Given**: ADMIN + 데이터
- **When**: 호출
- **Then**: 200 + 모든 필드 정상

### Scenario 2: 가설 충족 — 완주율 ≥ 15%
- **Given**: 전환자 100명 + 완주 20명
- **When**: 호출
- **Then**: rate: 20, target_achieved: true

### Scenario 3: 가설 미충족
- **Given**: 전환자 100명 + 완주 10명
- **When**: 호출
- **Then**: rate: 10, target_achieved: false

### Scenario 4: video-only 보호 위반
- **Given**: video-only 사용자 treatment 노출 (시뮬레이션)
- **When**: 호출
- **Then**: protection_intact: false + 🚨

### Scenario 5: 페르소나 SH-04 한정숙 인사이트
- **Given**: a11y 사용자 30명 + a11y 전환자 20명 + a11y 완주 15명
- **When**: 호출
- **Then**: a11y_completion_rate: 75 (15/20)

### Scenario 6: 샘플 부족
- **Given**: 전환자 50명
- **When**: 호출
- **Then**: sample_size_achieved: false

### Scenario 7: 전환자 0명 — graceful
- **Given**: 글로 읽기 전환 0건
- **When**: 호출
- **Then**: rate: 0. 에러 0

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
- **Then**: p95 ≤ 1초

## :gear: Technical & Non-Functional Constraints
- **글로 읽기 전환 — `lesson.media_switched` payload `to: 'TEXT'`**: 세션 단위 (영속화 무관)
- **완주 보수적 정의 — 사용자 단위 stamp 보유**: 정확한 정의는 별도 후속 (≥80% 가능)
- **video-only 보호 자동 검증**
- **a11y 세그먼트 분리 — 페르소나 SH-04 인사이트**: accessibilityMode=true 사용자
- **n≥100 — 작은 샘플도 의미 있는 분석**: 접근성 사용자는 적은 모집단
- **PII 보호**
- **응답 시간 ≤ 1초**
- **interpretation — 한정숙 페르소나 명시 인사이트**
- **금지**:
  - 글로 읽기 전환 정의 변경 (`lesson.media_switched to=TEXT` 표준)
  - 개별 식별자 노출
  - video-only 보호 검증 누락

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] video-only 보호 검증
- [ ] a11y 세그먼트 인사이트
- [ ] target_achieved (≥15%) 검증
- [ ] interpretation (✅·⚠️·🚨)
- [ ] 응답 시간 측정
- [ ] OpenAPI 명세 추가
- [ ] PR 본문에 "글로 읽기 모드 효용 + SH-04 한정숙 인사이트" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-EXP-001 (분배 + video-only 보호)
  - CT-DB-009 (EventLog — lesson.media_switched)
  - CT-DB-002 (User — accessibilityMode + personaTags)
  - FR-LES-003 (lesson.media_switched 발행)
  - FR-AUTH-002 (RBAC)
- **Blocks**:
  - 글로 읽기 모드 정책 의사결정
  - 페르소나 SH-04 의 사용 검증
  - REQ-FUNC-026 운영 검증
- **Related**:
  - PRD 원칙 4 (3매체 유기체)
  - FR-KPI-004 (매체 선호 사촌)
