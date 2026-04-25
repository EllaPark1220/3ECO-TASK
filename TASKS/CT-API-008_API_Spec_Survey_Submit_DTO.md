# [Feature] CT-API-008: submitSurvey() Server Action DTO + 분기당 1회 제한 + 익명 토큰 + 거부 응답 코드

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-API-008: submitSurvey() Server Action DTO — 분기 (Q1~Q4) 1회 제한 + 익명 토큰 + Likert 1~5 + 자유 응답 + 'SURVEY_ALREADY_SUBMITTED' 에러"
labels: 'feature, backend, api-spec, survey, priority:high, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-API-008] `submitSurvey()` Server Action 의 Contract — Likert 1~5 응답 + 자유 텍스트 + 분기당 1회 제한 (INV-09) + 익명 토큰 (anonymous_token) 으로 PII 분리 + 거부 응답 코드 (`SURVEY_ALREADY_SUBMITTED`)
- **목적**: REQ-FUNC-003 (체감 변화 설문) 의 Contract SSOT. 사용자가 스탬프 10자리 도달 시 (FW-OX-004 트리거) 또는 분기별 자발적 제출. REQ-NF-043 ("덜 두렵다" 응답 ≥60%) 의 데이터 진입. **익명성 핵심** — user_id 와 응답을 분리하여 솔직한 응답 유도.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.1` — `submitSurvey()` 엔드포인트
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-003 (체감 변화 설문)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-043 ("덜 두렵다" ≥60%)
  - `/docs/SRS_V0_9.md#6.2.2` — SURVEY_RESPONSE 테이블
  - `/docs/SRS_V0_9.md#6.2.3` — INV-09 (분기당 1회)
- 선행: CT-API-001, CT-DB-008 (SurveyResponse 모델 — 그룹 3 에서 발행), FR-AUTH-001 (선택)
- 짝: FW-SUR-001 (Logic Write 본체 — 그룹 3)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/contracts/survey.ts` 신규 파일 — Zod + TypeScript SSOT
- [ ] **Quarter enum 정의 (Q1~Q4 분기)**:
  ```ts
  export const QuarterSchema = z.enum(['Q1', 'Q2', 'Q3', 'Q4']);
  export type Quarter = z.infer<typeof QuarterSchema>;
  ```
- [ ] **Request 검증**:
  ```ts
  import { z } from 'zod';

  export const SubmitSurveyRequestSchema = z.object({
    quarter: QuarterSchema,                                      // Q1~Q4
    year: z.number().int().min(2026).max(2030),                  // 연도
    less_fear_score: z.number().int().min(1).max(5),             // Likert (1=매우 두려움, 5=덜 두려움)
    confidence_score: z.number().int().min(1).max(5),            // 자신감
    free_response: z.string().max(2000).optional().nullable(),   // 자유 응답
    anonymous_token: z.string().uuid().optional(),               // 익명 모드 (선택)
  });
  export type SubmitSurveyRequest = z.infer<typeof SubmitSurveyRequestSchema>;
  ```
- [ ] **Response DTO**:
  ```ts
  export const SubmitSurveyResponseSchema = z.object({
    ok: z.literal(true),
    survey_id: z.string().uuid(),
    quarter: QuarterSchema,
    year: z.number().int(),
    is_anonymous: z.boolean(),
    submitted_at: z.string(),  // ISO datetime
  });
  export type SubmitSurveyResponse = z.infer<typeof SubmitSurveyResponseSchema>;
  ```
- [ ] **익명 모드 정책**:
  - **로그인 모드**: user_id (세션) + (quarter, year) 조합으로 INV-09 검증
  - **익명 모드**: anonymous_token (UUID) + (quarter, year) 조합으로 검증
  - 두 모드 모두 분기당 1회 강제
  - 익명 모드는 user_id NULL 저장 → 솔직한 응답 유도 + KPI 집계 시 user_id 추적 불가
- [ ] **분기당 1회 제한 (INV-09) — Zod 외 추가 검증**:
  - 본 Contract 는 입력 검증만. 1회 제한은 본체 (FW-SUR-001) 가 DB UNIQUE 제약 + P2002 catch
  - 본 Contract 는 거부 응답 코드 정의만 — `SURVEY_ALREADY_SUBMITTED` (409 Conflict)
- [ ] **에러 응답 (CT-API-001 활용)**:
  - 400 — `INVALID_QUARTER`, `INVALID_SCORE` (1~5 범위 위반)
  - 400 — `FREE_RESPONSE_TOO_LONG` (2000자 초과)
  - 401 — `UNAUTHORIZED` (로그인 모드인데 세션 없음)
  - 409 — `SURVEY_ALREADY_SUBMITTED` (INV-09 위반)
  - 429 — `RATE_LIMIT_EXCEEDED` (분당 10 req — 악의적 대량 제출 방지)
- [ ] **Rate Limit 정책**:
  - 본 라우트는 매우 엄격 — 분당 5 req per IP. 정상 사용자는 분기당 1회만 제출
  - 악의적 대량 제출은 KPI 카운트 왜곡 위험
- [ ] **자유 응답 (free_response) 정책**:
  - 2000자 제한 (Zod)
  - 익명 모드에서는 PII 자동 추출 검토 (이메일·전화·주소 정규식 차단 — 별도 후속)
  - 출력 시 React escape (FW-TF-001 와 동일)
- [ ] **OpenAPI 명세 추가**
- [ ] **Mock fixture**:
  ```ts
  export const mockSubmitSurveyRequest: SubmitSurveyRequest = {
    quarter: 'Q2', year: 2026,
    less_fear_score: 4, confidence_score: 4,
    free_response: '경제 관련 뉴스를 보는 것이 덜 부담스러워졌다.',
  };
  export const mockSubmitSurveyResponse: SubmitSurveyResponse = {
    ok: true,
    survey_id: '00000000-0000-0000-0000-000000000003',
    quarter: 'Q2', year: 2026,
    is_anonymous: false,
    submitted_at: '2026-04-25T15:00:00Z',
  };
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 로그인 사용자 정상 제출
- **Given**: 로그인 사용자 + 해당 분기 미제출
- **When**: `submitSurvey({ quarter: 'Q2', year: 2026, less_fear_score: 4, confidence_score: 4 })`
- **Then**: SubmitSurveyResponse 정상. is_anonymous: false

### Scenario 2: 익명 모드 — anonymous_token
- **Given**: 세션 없음 + anonymous_token 동봉
- **When**: 호출
- **Then**: 200 + `is_anonymous: true`. DB 에 user_id NULL 저장

### Scenario 3: 분기 중복 제출 — 409
- **Given**: 동일 (user_id, quarter=Q2, year=2026) 가 이미 존재
- **When**: 재제출
- **Then**: 409 + `SURVEY_ALREADY_SUBMITTED`. DB 변경 0

### Scenario 4: Likert 점수 범위 외 — 400
- **Given**: less_fear_score: 6
- **When**: 호출
- **Then**: 400 + `INVALID_SCORE`

### Scenario 5: free_response 2001자 — 400
- **Given**: free_response 2001자
- **When**: 호출
- **Then**: 400 + `FREE_RESPONSE_TOO_LONG`

### Scenario 6: 미인증 + anonymous_token 미동봉 — 401
- **Given**: 세션 없음 + anonymous_token 미동봉
- **When**: 호출
- **Then**: 401 + `UNAUTHORIZED`

### Scenario 7: 잘못된 quarter — 400
- **Given**: quarter: 'Q5'
- **When**: 호출
- **Then**: 400 + `INVALID_QUARTER`

### Scenario 8: 익명 모드 분기 중복 — 409
- **Given**: 동일 (anonymous_token, quarter, year) 가 존재
- **When**: 재제출
- **Then**: 409 + `SURVEY_ALREADY_SUBMITTED`

### Scenario 9: free_response optional
- **Given**: free_response 미포함
- **When**: 호출
- **Then**: 200. DB 에 NULL 저장

### Scenario 10: Mock fixture schema parse
- **Given**: Mock 객체
- **When**: schema parse 실행
- **Then**: 검증 통과

## :gear: Technical & Non-Functional Constraints
- **익명성 핵심**: 익명 모드 활용 시 user_id NULL 저장. KPI 집계 시 추적 불가. 솔직한 응답 유도
- **anonymous_token 정책**: UUID v4. 클라이언트가 localStorage 에 저장하여 분기 동안 재사용 가능
- **분기당 1회 제한 — 두 키 (user_id 또는 token) + (quarter, year)**: DB UNIQUE 제약은 본체 (FW-SUR-001) 가 정의
- **거부 응답 코드 명확성**: `SURVEY_ALREADY_SUBMITTED` — 사용자에게 "이미 제출하셨습니다" UI 표시
- **Likert 1~5 표준**: `1=매우 두려움, 5=덜 두려움`. 클라이언트 UI 가 의미 표시 (FR-SUR-001 의 클라이언트 측)
- **Rate Limit 매우 엄격**: 분당 5 req. 정상 사용자는 분기당 1회만
- **자유 응답 보호**:
  - 2000자 제한 (Zod)
  - PII 추출 차단 검토 (이메일·전화·주소 정규식 — 별도 후속)
  - 출력 시 React escape
- **응답 시간**: p95 ≤ 300ms (단순 INSERT + UNIQUE 검증)
- **Mock fixture 의무**
- **금지**:
  - 동일 분기 다중 제출 허용 (INV-09 위반)
  - 익명 모드에서 user_id 저장 (익명성 위반)
  - free_response 의 PII 자동 추출 (별도 정책 필요)
  - 매우 큰 free_response 허용 (2000자 한도)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/contracts/survey.ts` Zod + TypeScript SSOT
- [ ] Quarter enum + Request/Response 정의
- [ ] 익명 모드 (anonymous_token) 분기 정의
- [ ] `SURVEY_ALREADY_SUBMITTED` 응답 코드 정의
- [ ] Likert 1~5 + free_response 2000자 검증
- [ ] Rate Limit 5 req/min 정책
- [ ] Mock fixture + schema parse 검증
- [ ] OpenAPI 명세 추가
- [ ] PR 본문에 "FW-SUR-001 의 Contract. 익명성 + INV-09 분기 1회 제한" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-001 (공통 응답 + Rate Limit)
  - CT-DB-008 (SurveyResponse 모델 — 그룹 3 에서 발행 예정)
  - FR-AUTH-001 (getCurrentUser — 로그인 모드)
- **Blocks**:
  - FW-SUR-001 (Logic Write 본체 — 그룹 3)
  - FR-SUR-001 (집계 쿼리 — "덜 두렵다" ≥60%)
  - TS-UT-010 (분기 1회 제한 단위 테스트)
  - TS-IT-003 (스탬프 10자리 → 설문 메일 통합 — FW-OX-004)
- **Related**:
  - REQ-NF-043 (덜 두렵다 ≥60%) 측정 기반
  - INV-09 (분기 1회 제한)
  - FW-OX-004 (스탬프 10자리 트리거 → 본 API 호출)
