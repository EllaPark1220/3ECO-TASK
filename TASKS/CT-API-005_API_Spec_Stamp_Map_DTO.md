# [Feature] CT-API-005: GET /api/stamp/map 응답 DTO + revalidate 60 캐시 + StampMapResponse 정의

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-API-005: GET /api/stamp/map 응답 DTO — 모듈별 그룹화 + earned 매핑 + private 60s 캐시 + 진척도 메타"
labels: 'feature, backend, api-spec, stamp-map, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-API-005] `GET /api/stamp/map` Route Handler 의 Contract 정의 — 사용자별 모든 lesson 의 stamp 획득 여부 + 모듈 그룹화 + 진척도 메타 (earned_count·total_lessons·by_module_progress)
- **목적**: FR-STAMP-001 (Logic Read 본체) 의 Contract SSOT. FR-STAMP-002 (UI 시각화) 의 클라이언트 fetch 진입점. REQ-FUNC-001 (스탬프 시각 반영) + REQ-FUNC-003 (완주율 표시) + REQ-NF-003 (이벤트→UI 델타 p95 ≤500ms) 의 데이터 진입.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.1` — `/api/stamp/map` 엔드포인트
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-001, 003 (스탬프 시각·완주율)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-003 (이벤트→UI 델타)
  - `/docs/SRS_V0_9.md#6.2.2` — STAMP·LESSON·MODULE 테이블
  - `/docs/SRS_V0_9.md#3.5.2` — UC-03
- 선행: CT-API-001, CT-DB-005 (Stamp), CT-DB-003 (Lesson + Module), FR-AUTH-001
- 짝: FR-STAMP-001 (Logic Read 본체)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/contracts/stamp.ts` 신규 파일 — Zod + TypeScript SSOT
- [ ] **Response DTO — 모듈별 그룹화 + 진척도 메타**:
  ```ts
  import { z } from 'zod';

  export const StampMapLessonItemSchema = z.object({
    lesson_id: z.string(),
    title: z.string(),
    earned: z.boolean(),
    earned_at: z.string().nullable(),  // ISO datetime, 미획득 시 null
  });

  export const StampMapModuleSchema = z.object({
    module_id: z.string(),               // M1~M5
    name: z.string(),
    order_index: z.number().int().min(1).max(5),
    lessons: z.array(StampMapLessonItemSchema),
    earned_in_module: z.number().int().min(0),  // 모듈 내 획득 카운트
    total_in_module: z.number().int().min(0),    // 모듈 내 총 lesson 수
  });

  export const StampMapResponseSchema = z.object({
    user_id: z.string().uuid(),
    total_lessons: z.number().int().min(0),
    earned_count: z.number().int().min(0),
    completion_pct: z.number().min(0).max(100),  // (earned_count / total_lessons) * 100
    modules: z.array(StampMapModuleSchema),
    last_earned_at: z.string().nullable(),       // 가장 최근 stamp 발급 시각
  });
  export type StampMapResponse = z.infer<typeof StampMapResponseSchema>;
  ```
- [ ] **응답 필드 정책**:
  - `total_lessons` — 시드된 모든 lesson 카운트 (사용자가 마주칠 수 있는 모든 단원)
  - `earned_count` — 본 사용자의 stamp 카운트
  - `completion_pct` — 클라이언트 계산 부담 제거 (백엔드에서 정수 또는 소수 1자리)
  - `modules[].earned_in_module / total_in_module` — 모듈별 진척률 표시 위함 (FR-STAMP-002 의 UI 단순화)
  - `last_earned_at` — 가장 최근 활동 시각 (FR-PROG-001 의 "이어서 학습" 후보)
- [ ] **응답 헤더 — private 캐시 + 짧은 max-age**:
  ```
  Content-Type: application/json
  Cache-Control: private, max-age=60
  X-Request-Id: <uuid>
  ```
  - **public 금지** — 사용자별 데이터
  - max-age 60 — 짧게 설정 (OX 통과 직후 SWR mutate 활용)
- [ ] **인증 강제** — `requireUser()` (FR-AUTH-002). user_id 는 세션에서 추출 (IDOR 방지)
- [ ] **에러 응답**:
  - 401 — `UNAUTHORIZED`
  - 429 — `RATE_LIMIT_EXCEEDED`
- [ ] **응답 정렬 정책**:
  - `modules` 배열 — `order_index` ascending (M1 → M5)
  - `lessons` 배열 — `lesson_id` ascending (L001 → L0nn)
- [ ] **빈 데이터 처리**:
  - 신규 사용자 (Stamp 0건) — `earned_count: 0, completion_pct: 0, last_earned_at: null` + 모든 lessons[].earned: false
  - Lesson 시드 0건 — `total_lessons: 0, modules: []` + 200 응답 (에러 0)
- [ ] **OpenAPI 명세 추가**
- [ ] **OX 통과 후 SWR mutate 호환 정책**:
  - 클라이언트가 `submitOx()` 응답 직후 `mutate('/api/stamp/map')` 호출
  - 본 schema 의 응답이 즉시 새로고침
  - REQ-NF-003 (p95 ≤ 500ms) 충족 위해 백엔드 ≤ 200ms 목표
- [ ] **Mock fixture** — `lib/contracts/__fixtures__/stamp.ts`:
  ```ts
  export const mockStampMapResponse: StampMapResponse = {
    user_id: '00000000-0000-0000-0000-000000000001',
    total_lessons: 10,
    earned_count: 3,
    completion_pct: 30,
    modules: [
      {
        module_id: 'M1', name: '화폐와 가치 기초', order_index: 1,
        lessons: [
          { lesson_id: 'L001', title: '화폐의 정의', earned: true, earned_at: '2026-04-25T10:00:00Z' },
          { lesson_id: 'L002', title: '가치 측정', earned: false, earned_at: null },
        ],
        earned_in_module: 1, total_in_module: 2,
      },
      // ... M2~M5
    ],
    last_earned_at: '2026-04-25T10:00:00Z',
  };
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 응답 — 신규 사용자 (Stamp 0건)
- **Given**: User u1 + Lesson 10편 시드 + Stamp 0건
- **When**: `GET /api/stamp/map`
- **Then**: 200 + `{ total_lessons: 10, earned_count: 0, completion_pct: 0, modules: [...5개], last_earned_at: null }`. 모든 lessons[].earned: false

### Scenario 2: 일부 stamp 보유
- **Given**: User u1 의 Stamp (L001, L003) 2건
- **When**: 호출
- **Then**: `earned_count: 2, completion_pct: 20`. modules[0].lessons[0].earned: true, [0].earned_at: 정상 timestamp

### Scenario 3: 모듈 그룹화 + 정렬
- **Given**: 응답
- **When**: 검사
- **Then**: modules 가 order_index 1~5 순서. 각 modules[].lessons 가 lesson_id ascending

### Scenario 4: 미인증 — 401
- **Given**: 세션 없음
- **When**: 호출
- **Then**: 401 + `UNAUTHORIZED`

### Scenario 5: completion_pct 계산
- **Given**: total_lessons: 10, earned_count: 3
- **When**: 응답
- **Then**: completion_pct: 30 (정수 또는 30.0)

### Scenario 6: Cache 정책 — private 60s
- **Given**: 응답
- **When**: 헤더 검사
- **Then**: `Cache-Control: private, max-age=60`. public 또는 s-maxage 부재

### Scenario 7: Lesson 시드 0건 graceful
- **Given**: Lesson 0건 (Module 만 존재)
- **When**: 호출
- **Then**: 200 + `total_lessons: 0, completion_pct: 0` + modules 배열 (모든 lessons: [])

### Scenario 8: last_earned_at 가장 최근 stamp
- **Given**: Stamp 3건 (각 다른 시각)
- **When**: 호출
- **Then**: last_earned_at = MAX(earned_at) 의 ISO datetime

### Scenario 9: IDOR 방지 — 다른 user_id 차단
- **Given**: User u1 로그인 + 클라이언트가 ?user_id=u2 추가 시도
- **When**: 호출
- **Then**: 본 API 는 query 파라미터 무시. 항상 세션의 user_id 사용. u2 데이터 노출 0

### Scenario 10: Mock fixture schema parse
- **Given**: mockStampMapResponse
- **When**: `StampMapResponseSchema.parse(mockStampMapResponse)` 실행
- **Then**: 검증 통과

## :gear: Technical & Non-Functional Constraints
- **단일 파일 SSOT**: `lib/contracts/stamp.ts` 에 Zod + TypeScript + Mock 모두
- **private 캐시 강제**: 사용자별 데이터. public 절대 금지
- **max-age 60 — 짧게**: OX 통과 후 SWR mutate 로 즉시 무효화 가능. 캐시 효과는 제한적이지만 동일 페이지 내 중복 fetch 방지
- **응답 페이로드 — 단일 라운드트립**: 클라이언트가 추가 API 호출 없이 모든 정보 활용 (modules + 진척도 메타)
- **completion_pct 백엔드 계산**: 클라이언트 부담 제거. 정수 또는 소수 1자리
- **세션 우선 (IDOR)**: query/body 의 user_id 절대 사용 금지
- **응답 시간**: p95 ≤ 200ms (백엔드). 클라이언트 합산 p95 ≤ 500ms (REQ-NF-003)
- **정렬 정책**: order_index → lesson_id 양 단계 모두 ascending
- **Rate Limit (CT-API-001)**: general 60 req/min. 사용자가 1초 미만 간격으로 새로고침해도 한도 내
- **민감 필드 부재**: stamp 의 createdAt 등 내부 메타 미포함. earned_at (의미 있는 값) 만
- **금지**:
  - public 캐시 (사용자 데이터)
  - user_id 클라이언트 입력 허용 (IDOR)
  - completion_pct 클라이언트 계산 강제 (단일 라운드트립 위반)
  - lessons 배열 정렬 누락 (UI 일관성 위반)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/contracts/stamp.ts` Zod + TypeScript SSOT
- [ ] StampMapResponseSchema 정의 (user_id + 진척도 + modules)
- [ ] 모듈별 그룹화 + 정렬 정책 적용
- [ ] Cache-Control private 60s 검증
- [ ] IDOR 방지 (세션 우선) 검증
- [ ] completion_pct 백엔드 계산
- [ ] Mock fixture + schema parse 검증
- [ ] OpenAPI 명세 추가
- [ ] PR 본문에 "FR-STAMP-001 의 Contract. SWR mutate 호환 짧은 캐시" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-001 (공통 응답·오류 + Rate Limit)
  - CT-DB-002 (User)
  - CT-DB-003 (Lesson + Module)
  - CT-DB-005 (Stamp)
  - FR-AUTH-001 (getCurrentUser)
- **Blocks**:
  - FR-STAMP-001 (Logic Read 본체)
  - FR-STAMP-002 (UI 시각화 — 본 schema 의 클라이언트)
  - FW-STAMP-001 (Stamp Map 공유)
  - FR-KPI-002 (L4 완주 KPI — 본 데이터 활용)
  - TS-E2E-001 (박지훈 E2E)
- **Related**:
  - REQ-NF-003 (이벤트→UI 델타) 백엔드 측 충족
