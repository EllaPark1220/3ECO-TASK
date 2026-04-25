# [Feature] FR-KPI-011: 랜딩→첫 영상 전환율 ≥20% 퍼널 KPI — S2(랜딩) → S3(첫 영상)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-KPI-011: GET /api/kpi/landing-funnel — S2 랜딩 방문 → S3 첫 영상 시청 전환율 ≥20% + 단계별 drop-off 분석"
labels: 'feature, backend, kpi, funnel, query, priority:high, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-KPI-011] 랜딩 페이지 (S2) 방문 → 첫 영상 시청 (S3) 전환율 ≥20% 검증 + 4단계 퍼널 분석 (랜딩→가입→첫 lesson 진입→첫 영상 시청) + 단계별 drop-off 식별
- **목적**: 마케팅 funnel 의 핵심 지표 — **신규 방문자가 학습을 시작하는 비율**. 가설: ≥20% 면 랜딩 페이지 + 회원가입 흐름이 효과적. 미달 시 단계별 drop-off 식별 → 가장 큰 누수 단계 우선 개선. **GA 또는 Vercel Analytics + 본 사이트 EventLog** 조합 필요.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.4` — REQ-NF-029 (전환율 KPI)
  - `/docs/SRS_V0_9.md#1.4` — 페르소나 (랜딩 진입 시나리오)
  - `/docs/SRS_V0_9.md#6.2.2` — EVENT_LOG (`page.viewed`, `auth.signup_completed`, `lesson.started`)
- 외부: Vercel Analytics 또는 자체 EventLog
- 선행: CT-DB-009 (EventLog), FR-AUTH-002 (RBAC), IF-AN-001 (Analytics, 그룹 6 — Antigravity)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/kpi/landing-funnel/route.ts` Route Handler
- [ ] **`requireRole('ADMIN')` 가드**
- [ ] **응답 DTO**:
  ```ts
  export interface LandingFunnelKpiResponse {
    funnel_steps: Array<{
      step: 'S2_landing' | 'S2.5_signup' | 'S3_first_lesson_started' | 'S3_first_video_completed';
      label: string;
      count: number;
      conversion_from_previous: number | null;  // 이전 단계 대비 (%)
    }>;
    overall_conversion: {
      s2_to_s3_rate: number;        // 랜딩 → 첫 영상 시청
      target: 20;
      target_achieved: boolean;
    };
    biggest_drop_off: {
      step_from: string;
      step_to: string;
      drop_off_rate: number;          // 100 - conversion_rate
    };
    interpretation: string;
    period: { from: string; to: string };
  }
  ```
- [ ] **EventLog 의존 — 4단계 이벤트 정의**:
  - `page.viewed` (path='/' 또는 '/landing') — 랜딩 방문 (anon_id Cookie 기반)
  - `auth.signup_completed` — 가입 완료
  - `lesson.started` (lesson.viewed 1회 이상) — 첫 lesson 진입
  - `lesson.viewed_complete` (1회 이상) — 첫 영상 완시청
- [ ] **anon_id 와 user_id 매핑 정책**:
  - 가입 시점에 anon_id 와 user_id 매핑 보존 (별도 테이블 또는 EventLog `auth.signup_completed` 의 payload 에 anon_id 포함)
  - 랜딩 방문 (anon_id) → 가입 (anon_id + user_id) → 첫 lesson (user_id) 흐름 추적
- [ ] **데이터 쿼리 — 단계별 distinct count**:
  ```ts
  // S2 랜딩 — anon_id distinct
  const landingCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT payload->>'anon_id')::bigint AS count
    FROM "EventLog"
    WHERE event = 'page.viewed'
      AND payload->>'path' IN ('/', '/landing')
      AND "createdAt" >= ${periodFrom}
  `;

  // S2.5 가입 — user_id distinct
  const signupCount = await prisma.user.count({
    where: { createdAt: { gte: periodFrom } },
  });

  // S3 첫 lesson — distinct user_id
  const firstLessonCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT "userId")::bigint AS count
    FROM "EventLog"
    WHERE event = 'lesson.viewed'
      AND "userId" IS NOT NULL
      AND "createdAt" >= ${periodFrom}
  `;

  // S3 첫 영상 완시청 — distinct user_id
  const firstCompletedCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT "userId")::bigint AS count
    FROM "EventLog"
    WHERE event = 'lesson.viewed_complete'
      AND "userId" IS NOT NULL
      AND "createdAt" >= ${periodFrom}
  `;
  ```
- [ ] **단계별 conversion_from_previous 계산**:
  ```ts
  const steps = [
    { step: 'S2_landing', count: landingCount, conversion: null },
    { step: 'S2.5_signup', count: signupCount, conversion: landingCount > 0 ? (signupCount / landingCount) * 100 : 0 },
    { step: 'S3_first_lesson_started', count: firstLessonCount, conversion: signupCount > 0 ? (firstLessonCount / signupCount) * 100 : 0 },
    { step: 'S3_first_video_completed', count: firstCompletedCount, conversion: firstLessonCount > 0 ? (firstCompletedCount / firstLessonCount) * 100 : 0 },
  ];
  ```
- [ ] **biggest_drop_off 식별**:
  ```ts
  let biggestDropOff = { step_from: '', step_to: '', drop_off_rate: 0 };
  for (let i = 1; i < steps.length; i++) {
    const dropOff = 100 - (steps[i].conversion ?? 0);
    if (dropOff > biggestDropOff.drop_off_rate) {
      biggestDropOff = {
        step_from: steps[i - 1].step,
        step_to: steps[i].step,
        drop_off_rate: dropOff,
      };
    }
  }
  ```
- [ ] **overall s2_to_s3 계산**:
  ```ts
  const s2ToS3Rate = landingCount > 0 ? (firstCompletedCount / landingCount) * 100 : 0;
  const targetAchieved = s2ToS3Rate >= 20;
  ```
- [ ] **interpretation**:
  ```ts
  function interpret(rate: number, biggestDrop: typeof biggestDropOff): string {
    const dropMsg = `최대 누수 — ${biggestDrop.step_from} → ${biggestDrop.step_to} (${biggestDrop.drop_off_rate.toFixed(1)}% 이탈).`;
    if (rate >= 20) return `✅ 가설 충족. 랜딩→첫 영상 ${rate.toFixed(1)}% ≥ 20%. ${dropMsg}`;
    return `⚠️ 가설 미충족. ${rate.toFixed(1)}% < 20%. ${dropMsg} 우선 개선.`;
  }
  ```
- [ ] **응답 헤더**: `Cache-Control: private, max-age=600`
- [ ] **응답 시간**: p95 ≤ 800ms
- [ ] **PII 보호**: 카운트만
- [ ] **anon_id 보호**: payload 에 IP·User-Agent 등 식별자 미포함

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: ADMIN 정상 응답
- **Given**: ADMIN + 4단계 데이터
- **When**: 호출
- **Then**: 200 + 4단계 funnel + interpretation

### Scenario 2: 가설 충족 ≥20%
- **Given**: 랜딩 1000 + 첫 영상 250
- **When**: 호출
- **Then**: s2_to_s3_rate: 25, target_achieved: true

### Scenario 3: 가설 미충족
- **Given**: 랜딩 1000 + 첫 영상 100
- **When**: 호출
- **Then**: s2_to_s3_rate: 10, target_achieved: false

### Scenario 4: biggest_drop_off 식별
- **Given**: 랜딩→가입 50%, 가입→lesson 80%, lesson→완시청 70%
- **When**: 호출
- **Then**: biggest_drop_off: 랜딩→가입 (50% 이탈)

### Scenario 5: 랜딩 0 — graceful
- **Given**: 랜딩 0
- **When**: 호출
- **Then**: rate: 0. 에러 0

### Scenario 6: 단계별 conversion 정확성
- **Given**: 1000 → 500 → 400 → 300
- **When**: 호출
- **Then**: 각 단계 conversion 50/80/75 정확

### Scenario 7: anon_id 와 user_id 매핑 정합
- **Given**: 가입 후 lesson 진입 사용자
- **When**: 함수
- **Then**: signup → lesson 흐름 추적 정확

### Scenario 8: non-ADMIN — 403
- **Given**: LEARNER
- **When**: 호출
- **Then**: 403

### Scenario 9: PII 미노출
- **Given**: 응답
- **When**: 검사
- **Then**: 개별 user_id, IP 0

### Scenario 10: 응답 시간
- **Given**: EventLog 100K
- **When**: 호출
- **Then**: p95 ≤ 800ms

## :gear: Technical & Non-Functional Constraints
- **4단계 funnel — 랜딩→가입→lesson→완시청**: 명확한 의사결정 단계
- **biggest_drop_off 식별 — 운영 우선 개선 가이드**
- **anon_id Cookie 활용 (FW-EXP-001 정합)**: 익명 → 인증 흐름 추적
- **PII 보호**: 카운트만. IP·UA 미포함
- **target ≥ 20% — PRD 가설**: 실제 운영 후 재조정 가능 (constants 분리)
- **Cache 10분**
- **응답 시간 ≤ 800ms**: 4 쿼리 합산
- **GA/Vercel Analytics 통합 가능**: 본 KPI 는 EventLog 기반. Analytics 와 cross-check 별도 후속
- **금지**:
  - IP·UA 노출
  - 단계별 정의 임의 변경 (4단계 표준)
  - 비공개 데이터 노출

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] 4단계 funnel 정의
- [ ] biggest_drop_off 식별
- [ ] s2_to_s3_rate ≥ 20% 검증
- [ ] interpretation
- [ ] 응답 시간 측정
- [ ] OpenAPI 명세 추가
- [ ] PR 본문에 "랜딩 funnel KPI + drop-off 우선 개선 가이드" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-009 (EventLog)
  - CT-DB-002 (User)
  - FR-AUTH-002 (RBAC)
  - FW-EXP-001 (anon_id Cookie 패턴)
  - IF-AN-001 (Analytics 통합 — 그룹 6)
- **Blocks**:
  - 랜딩 페이지 + 가입 흐름 의사결정
  - 우선 개선 단계 식별
- **Related**:
  - FR-KPI-001 (가입 KPI 사촌)
  - 페르소나 진입 시나리오
