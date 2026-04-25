# [Feature] FW-SUR-001: submitSurvey() Server Action 본체 — 분기당 1회 + 익명 토큰 + P2002 → 409 변환

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-SUR-001: submitSurvey() Server Action — Zod 검증 + INSERT + P2002 catch → SURVEY_ALREADY_SUBMITTED 변환 + 익명/로그인 모드 분기"
labels: 'feature, backend, survey, write, priority:high, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-SUR-001] CT-API-008 의 Contract 를 구현하는 Server Action 본체 — Zod 입력 검증 + 로그인/익명 모드 분기 + SurveyResponse INSERT + UNIQUE 제약 P2002 catch → 409 `SURVEY_ALREADY_SUBMITTED` 변환 + EventLog 발행
- **목적**: REQ-FUNC-003 (체감 변화 설문) 구현. INV-09 (분기당 1회) 의 데이터 레이어 강제를 활용하여 자연 멱등 (UPSERT 가 아닌 자연 멱등 — 중복 시 거부). FW-OX-004 의 10자리 트리거가 본 Server Action 호출 가능. **익명성 핵심** — anonymousToken 모드에서 user_id 절대 저장 0.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.1` — `submitSurvey()` Server Action
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-003
  - `/docs/SRS_V0_9.md#6.2.3` — INV-09
- 선행: CT-API-008 (Survey Contract), CT-DB-008 (SurveyResponse 모델), CT-API-001 (응답 포맷), FR-AUTH-001 (선택 — 로그인 모드)
- 짝: CT-API-008 (Contract), FR-SUR-001 (집계 쿼리)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/services/survey.ts` 신규 파일 — Server Action 정의
- [ ] **Server Action 시그니처 — `'use server'`**:
  ```ts
  'use server';
  import { prisma } from '@/lib/db';
  import { getCurrentUser } from '@/lib/auth/session';
  import { SubmitSurveyRequestSchema, SubmitSurveyResponse } from '@/lib/contracts/survey';
  import { emitEvent } from '@/lib/events/emit';
  import { enforceRateLimit } from '@/lib/api/rate-limit';
  import { Prisma } from '@prisma/client';
  import crypto from 'node:crypto';

  export async function submitSurvey(
    rawInput: unknown,
    options?: { ipAddress?: string }
  ): Promise<SubmitSurveyResponse> {
    const requestId = crypto.randomUUID();

    // 1. Zod 검증
    const input = SubmitSurveyRequestSchema.parse(rawInput);

    // 2. 로그인/익명 모드 분기
    const user = await getCurrentUser();
    const isAnonymous = !user;

    if (isAnonymous && !input.anonymous_token) {
      // 익명 모드인데 토큰 없음 → 401
      throw new SurveyError('UNAUTHORIZED', requestId);
    }

    // 3. Rate Limit (분당 5 req per IP)
    const rateLimitKey = isAnonymous
      ? `survey:${options?.ipAddress ?? 'unknown'}`
      : `survey:${user!.id}`;
    try {
      await enforceRateLimit(rateLimitKey, 'survey');
    } catch {
      throw new SurveyError('RATE_LIMIT_EXCEEDED', requestId);
    }

    // 4. SurveyResponse INSERT — INV-09 자연 멱등
    try {
      const created = await prisma.surveyResponse.create({
        data: {
          userId: isAnonymous ? null : user!.id,
          anonymousToken: isAnonymous ? input.anonymous_token : null,
          quarter: input.quarter,
          year: input.year,
          lessFearScore: input.less_fear_score,
          confidenceScore: input.confidence_score,
          freeResponse: input.free_response ?? null,
        },
      });

      // 5. EventLog 발행 (silent fail)
      await emitEvent({
        userId: isAnonymous ? null : user!.id,
        event: 'survey.submitted',
        payload: {
          quarter: input.quarter,
          year: input.year,
          is_anonymous: isAnonymous,
          // 응답 점수는 EventLog 미저장 (PII 우려) — KPI 는 SurveyResponse 직접 쿼리
        },
      });

      return {
        ok: true,
        survey_id: created.id,
        quarter: created.quarter,
        year: created.year,
        is_anonymous: isAnonymous,
        submitted_at: created.submittedAt.toISOString(),
      };
    } catch (error) {
      // 6. P2002 → 409 변환 (INV-09)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new SurveyError('SURVEY_ALREADY_SUBMITTED', requestId);
      }
      // 기타 에러 → 500
      console.error('submitSurvey failed:', error);
      throw new SurveyError('INTERNAL_ERROR', requestId);
    }
  }
  ```
- [ ] **`SurveyError` 클래스 (CT-API-001 의 에러 코드 활용)**:
  ```ts
  export class SurveyError extends Error {
    constructor(public code: ErrorCode, public requestId: string) {
      super(ERROR_CODES[code].message);
    }
  }
  ```
- [ ] **Route Handler 보조 (POST `/api/survey`)** — Server Action 직접 호출 외 RESTful 호출 위함:
  ```ts
  // app/api/survey/route.ts
  export async function POST(req: Request) {
    try {
      const body = await req.json();
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0];
      const result = await submitSurvey(body, { ipAddress: ip ?? undefined });
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof SurveyError) {
        return makeErrorResponse(error.code, error.requestId);
      }
      throw error;
    }
  }
  ```
- [ ] **로그인 + 익명 모드 분기 정책**:
  - **로그인 모드** — getCurrentUser() 가 user 반환 → userId 저장
  - **익명 모드** — getCurrentUser() null + anonymous_token 동봉 → anonymousToken 저장
  - **혼합 케이스** (로그인 + anonymous_token 동봉) — 로그인 우선, anonymous_token 무시
- [ ] **익명성 강제 검증**:
  - 익명 모드에서는 user_id 추적 불가 (DB 에 저장 0)
  - EventLog payload 에도 user_id 미포함
  - 정책 위반 시 정적 분석 또는 코드 리뷰
- [ ] **Rate Limit 분당 5 req**:
  - CT-API-001 의 `rateLimits.survey` (별도 limiter, 5 req/min)
  - 키 — IP (익명) 또는 user_id (로그인)
- [ ] **응답 시간 목표**: p95 ≤ 300ms (단순 INSERT + Zod)
- [ ] **EventLog 발행 정책 — PII 우려 분리**:
  - `survey.submitted` 만 발행
  - payload — quarter·year·is_anonymous (점수·자유응답 미포함)
  - KPI 집계는 SurveyResponse 테이블 직접 쿼리 (FR-SUR-001)
- [ ] **OpenAPI 명세 갱신** (CT-API-008 와 정합)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 로그인 모드 정상 제출
- **Given**: 로그인 사용자 + Q2 미제출
- **When**: `submitSurvey({ quarter: 'Q2', year: 2026, less_fear_score: 4, confidence_score: 4 })`
- **Then**: 200 + ok: true, is_anonymous: false. DB INSERT (userId 저장)

### Scenario 2: 익명 모드 정상 제출
- **Given**: 세션 없음 + anonymous_token 동봉
- **When**: 호출
- **Then**: 200 + is_anonymous: true. DB userId NULL + anonymousToken 저장

### Scenario 3: 분기 중복 — 409
- **Given**: 동일 (userId, Q2, 2026) 가 이미 존재
- **When**: 재제출
- **Then**: P2002 catch → 409 + `SURVEY_ALREADY_SUBMITTED`

### Scenario 4: 익명 분기 중복 — 409
- **Given**: 동일 (anonymousToken, Q2, 2026) 가 존재
- **When**: 재제출
- **Then**: 409 + `SURVEY_ALREADY_SUBMITTED`

### Scenario 5: 익명 모드 + 토큰 누락 — 401
- **Given**: 세션 없음 + anonymous_token 미동봉
- **When**: 호출
- **Then**: 401 + `UNAUTHORIZED`

### Scenario 6: 잘못된 Likert (6) — 400
- **Given**: less_fear_score: 6
- **When**: 호출
- **Then**: 400 + Zod 에러 (`INVALID_SCORE`)

### Scenario 7: 자유 응답 2001자 — 400
- **Given**: free_response 2001자
- **When**: 호출
- **Then**: 400 + `FREE_RESPONSE_TOO_LONG`

### Scenario 8: 혼합 케이스 — 로그인 우선
- **Given**: 로그인 + anonymous_token 동봉
- **When**: 호출
- **Then**: 로그인 모드로 저장. anonymousToken 무시

### Scenario 9: EventLog 발행 — PII 미포함
- **Given**: 정상 제출
- **When**: EventLog 검사
- **Then**: payload 에 quarter·year·is_anonymous 만. less_fear_score·free_response 미포함

### Scenario 10: Rate Limit — 분당 5 req
- **Given**: 동일 키 분당 5 req
- **When**: 6번째 호출
- **Then**: 429 + `RATE_LIMIT_EXCEEDED`

## :gear: Technical & Non-Functional Constraints
- **CT-API-008 Contract 정합**: Zod schema · 응답 포맷 · 에러 코드 모두 일치
- **자연 멱등 (P2002 catch)**: UPSERT 아닌 INSERT + UNIQUE → 중복 시 거부
- **익명성 강제**: anonymousToken 모드에서 userId 절대 저장 0
- **EventLog PII 분리**: 점수·자유응답 미포함. KPI 는 SurveyResponse 직접 쿼리
- **혼합 케이스 정책**: 로그인 우선 (anonymousToken 무시)
- **Rate Limit**: 분당 5 req per (IP 또는 user_id)
- **응답 시간**: p95 ≤ 300ms
- **silent fail (EventLog)**: 발행 실패가 메인 INSERT 영향 0
- **금지**:
  - 익명 모드에서 user_id 저장 (익명성 위반)
  - EventLog payload 에 점수·자유응답 (PII 위반)
  - UPSERT 활용 (INV-09 위반 — 사용자 응답 덮어쓰기)
  - Rate Limit 우회

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/services/survey.ts` Server Action 구현
- [ ] CT-API-008 Contract 정합 검증
- [ ] P2002 catch → 409 변환 검증
- [ ] 익명/로그인 모드 분기 + 익명성 강제
- [ ] EventLog PII 분리 검증
- [ ] Rate Limit 분당 5 req
- [ ] Route Handler 보조 추가 (`/api/survey`)
- [ ] 응답 시간 p95 ≤ 300ms 측정
- [ ] PR 본문에 "INV-09 자연 멱등 + 익명성 강제" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-001 (응답 포맷 + Rate Limit)
  - CT-API-008 (Survey Contract)
  - CT-DB-008 (SurveyResponse 모델)
  - FR-AUTH-001 (getCurrentUser — 로그인 모드)
  - FW-OX-003 (EventLog 패턴)
- **Blocks**:
  - FR-SUR-001 (집계 쿼리)
  - FW-OX-004 (10자리 트리거 — 본 Server Action 호출)
  - TS-UT-010 (분기 1회 제한 단위 테스트)
  - TS-IT-003 (10자리 → 설문 메일 통합 테스트)
- **Related**:
  - REQ-NF-043 ("덜 두렵다" ≥60%)
  - INV-09 (분기당 1회)
