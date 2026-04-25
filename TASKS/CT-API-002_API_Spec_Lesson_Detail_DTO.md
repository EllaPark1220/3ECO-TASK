# [Feature] CT-API-002: GET /api/lesson/{id} 단건 조회 Route Handler DTO + 7필드 응답 + ETag 캐시

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-API-002: GET /api/lesson/{id} Route Handler DTO — 7필드 응답 + ETag(revision) 캐시 + Zod 검증"
labels: 'feature, backend, api-spec, lesson, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-API-002] `GET /api/lesson/{id}` Route Handler 의 Request/Response Contract 정의 — Zod 입력 검증 (`lessonId` path) + 7필드 응답 DTO (id·title·youtubeVideoId·script·pdfKitUrl·revisionLastUpdated·module 메타) + ETag (revision) 기반 304 Not Modified 캐시
- **목적**: FR-LES-001 (Lesson 단건 조회 API) 의 Contract SSOT. FR-LES-003 (시청 페이지) + FW-PDF-002 (PDF 템플릿) + 모든 Lesson 의존 코드의 데이터 진입점이며, **클라이언트와 서버 간 단일 진실 공급원**. ETag 활용으로 revision 변경 없을 때 304 응답 → 대역폭 절약 + REQ-NF-001 (LCP) 충족 보조.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.1` — `/api/lesson/{id}` 엔드포인트 정의 (공통 응답 규약)
  - `/docs/SRS_V0_9.md#6.2.2` — LESSON 테이블 (응답 필드 SSOT)
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-033 (lessonId 포맷 L\d{3})
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-014 (3매체 정합성)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-001 (LCP p95 ≤1.5s)
- 선행: CT-API-001 (공통 응답·오류 포맷), CT-DB-003 (Lesson 모델)
- 짝: FR-LES-001 (Logic Read 본체)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/contracts/lesson.ts` 신규 파일 — Zod 스키마 + TypeScript 타입 단일 정의
- [ ] **Request 검증 — path param**:
  ```ts
  import { z } from 'zod';

  export const LessonIdParamSchema = z.object({
    lessonId: z.string().regex(/^L\d{3}$/, 'lessonId 포맷이 올바르지 않습니다 (L001~L125)'),
  });
  export type LessonIdParam = z.infer<typeof LessonIdParamSchema>;
  ```
- [ ] **Response DTO — 7필드 + Module 메타**:
  ```ts
  export const LessonResponseSchema = z.object({
    lesson_id: z.string(),                    // L001
    title: z.string(),
    youtube_video_id: z.string(),             // 3매체 1
    script: z.string(),                       // 3매체 2
    pdf_kit_url: z.string(),                  // 3매체 3
    revision_last_updated: z.string(),        // ISO datetime
    revision_notes: z.string().nullable(),
    module: z.object({
      module_id: z.string(),                  // M1~M5
      name: z.string(),
      order_index: z.number().int().min(1).max(5),
    }),
  });
  export type LessonResponse = z.infer<typeof LessonResponseSchema>;
  ```
- [ ] **응답 필드 정책 — snake_case 강제** — JSON API 일관성 (REST 관행). 클라이언트는 TypeScript 변환 어댑터 또는 직접 사용
- [ ] **민감 필드 부재 검증** — 응답에 `oxQuestions`(correctAnswer 노출 위험)·내부 ID·createdAt 미포함. 콘텐츠 메타만
- [ ] **ETag 정책 — revision 기반**:
  - ETag 값: `"L001-2026-04-25"` (lessonId-revision_last_updated 의 strong validator)
  - 클라이언트 If-None-Match 와 일치 시 → 304 응답 + body 0 byte
  - revision 변경 시 → ETag 변경 → 200 + 새 body
- [ ] **응답 헤더 표준**:
  ```
  Content-Type: application/json
  Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=86400
  ETag: "L001-2026-04-25"
  X-Request-Id: <uuid>
  ```
  - `public` — Lesson 메타는 사용자 무관 (콘텐츠 SSOT)
  - `s-maxage=300` — Vercel Edge Cache 5분
  - `stale-while-revalidate=86400` — 24시간 stale 허용
- [ ] **에러 응답 정의 (CT-API-001 의 ERROR_CODES 활용)**:
  - 400 — `INVALID_LESSON_ID` (Zod 검증 실패)
  - 404 — `LESSON_NOT_FOUND` (DB 조회 결과 없음)
  - 429 — `RATE_LIMIT_EXCEEDED` (분당 60 req 초과)
- [ ] **OpenAPI 명세 추가** — `docs/openapi.yaml`:
  ```yaml
  /api/lesson/{lessonId}:
    get:
      summary: 레슨 단건 조회
      parameters:
        - name: lessonId
          in: path
          required: true
          schema: { type: string, pattern: '^L\d{3}$' }
      responses:
        200: { ... LessonResponse }
        304: { description: Not Modified }
        400: { ... ErrorResponse }
        404: { ... ErrorResponse }
  ```
- [ ] **타입 export 정책**:
  - Zod 스키마 + TypeScript 타입이 동일 파일에 정의 (SSOT)
  - 클라이언트·서버 양쪽 import (`@/lib/contracts/lesson`)
- [ ] **Mock fixture 헬퍼** — `lib/contracts/__fixtures__/lesson.ts` (CT-MOCK-004 와 정합):
  ```ts
  export const mockLessonResponse: LessonResponse = {
    lesson_id: 'L001',
    title: '화폐의 정의',
    youtube_video_id: 'abc123',
    script: '...',
    pdf_kit_url: '/teacher-kit/L001.pdf',
    revision_last_updated: '2026-04-25T00:00:00Z',
    revision_notes: 'v1.0: 최초 발행',
    module: { module_id: 'M1', name: '화폐와 가치 기초', order_index: 1 },
  };
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 응답 — 7필드 + Module 메타
- **Given**: Lesson L001 시드
- **When**: `GET /api/lesson/L001`
- **Then**: 200 + LessonResponse 정상. 7필드 모두 포함. ETag 헤더 존재

### Scenario 2: 잘못된 lessonId — 400
- **Given**: 데이터
- **When**: `GET /api/lesson/INVALID`
- **Then**: 400 + `INVALID_LESSON_ID` + Zod 에러 details

### Scenario 3: Lesson 미존재 — 404
- **Given**: L999 미시드
- **When**: `GET /api/lesson/L999`
- **Then**: 404 + `LESSON_NOT_FOUND`

### Scenario 4: ETag 일치 — 304 응답
- **Given**: 첫 요청 응답의 ETag = `"L001-2026-04-25"`
- **When**: 재요청 시 `If-None-Match: "L001-2026-04-25"` 헤더
- **Then**: 304 Not Modified + body 0 byte. 대역폭 절약

### Scenario 5: revision 변경 → ETag 변경
- **Given**: revision_last_updated 가 2026-04-25 → 2026-05-01 변경
- **When**: 같은 If-None-Match 헤더로 재요청
- **Then**: 200 + 새 body + 새 ETag `"L001-2026-05-01"`

### Scenario 6: Cache-Control 헤더 검증
- **Given**: 응답
- **When**: 헤더 검사
- **Then**: `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=86400`

### Scenario 7: 민감 필드 미포함
- **Given**: 응답
- **When**: payload 검사
- **Then**: oxQuestions·correctAnswer·내부 createdAt·updatedAt 미포함. 7필드 + module 만

### Scenario 8: snake_case 필드명 일관성
- **Given**: 응답
- **When**: JSON 키 검사
- **Then**: 모든 키가 snake_case (`lesson_id`, `youtube_video_id` 등). camelCase 0건

### Scenario 9: Rate Limit — 60 req/min
- **Given**: 동일 IP 가 1분 내 60 req 호출
- **When**: 61번째 시도
- **Then**: 429 + `RATE_LIMIT_EXCEEDED` + Retry-After 헤더

### Scenario 10: Mock fixture 정합성
- **Given**: `mockLessonResponse` import
- **When**: `LessonResponseSchema.parse(mockLessonResponse)` 실행
- **Then**: 검증 통과. CT-MOCK-001 시드와 schema 정합

## :gear: Technical & Non-Functional Constraints
- **단일 파일 SSOT**: `lib/contracts/lesson.ts` 하나에 Zod + TypeScript + Mock 모두. 분산 정의 금지
- **snake_case 정책**: REST API 표준 — JSON 응답은 snake_case. TypeScript 내부는 camelCase 변환 어댑터 활용
- **ETag — strong validator**: `"<lessonId>-<revision>"` 결정적 값. weak ETag (`W/"..."`) 사용 금지
- **Cache-Control 정책**:
  - public + s-maxage 5분 — Edge Cache 활용 (Lesson 은 사용자 무관)
  - stale-while-revalidate 24시간 — 갱신 중에도 stale 응답 허용
- **민감 필드 화이트리스트**: 7필드 + module 메타만. oxQuestions·correctAnswer 절대 미포함
- **응답 시간 (REQ-NF-001 영향)**: p95 ≤ 200ms (DB 조회 + Edge Cache hit 시 ≤ 50ms)
- **Rate Limit (CT-API-001 통합)**: general 60 req/min 적용
- **revision_notes nullable**: 첫 시드는 "v1.0: 최초 발행" 같은 값. 추후 null 가능성 고려
- **Mock fixture 의무**: 매 PR 의 단위 테스트가 schema parse 검증
- **금지**:
  - Zod 와 TypeScript 별도 정의 (SSOT 위반)
  - oxQuestions 응답 포함 (correctAnswer 노출 위험)
  - private 캐시 사용 (Lesson 은 public)
  - camelCase 응답 (REST 관행 위반)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/contracts/lesson.ts` Zod + TypeScript SSOT
- [ ] LessonIdParamSchema + LessonResponseSchema 정의
- [ ] ETag 정책 — revision 기반 strong validator
- [ ] Cache-Control 헤더 검증 (public, max-age, s-maxage, SWR)
- [ ] 민감 필드 화이트리스트 검증 (7필드 + module)
- [ ] snake_case 일관성 검증
- [ ] Rate Limit 통합 (CT-API-001 의 general 60 req/min)
- [ ] Mock fixture 작성 + schema parse 검증
- [ ] OpenAPI 명세 추가 (`docs/openapi.yaml`)
- [ ] PR 본문에 "FR-LES-001 의 Contract SSOT. ETag 기반 304 응답으로 대역폭 절약" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-001 (공통 응답·오류 포맷 + Rate Limit)
  - CT-DB-003 (Lesson 모델)
- **Blocks**:
  - FR-LES-001 (Lesson 단건 조회 본체 — 본 Contract 활용)
  - FR-LES-002 (Lesson 목록 조회 — 본 DTO 의 배열 형태)
  - FR-LES-003 (시청 페이지 — 응답 활용)
  - FW-PDF-002 (PDF 템플릿 — Lesson 메타 활용)
  - CT-MOCK-004 (MSW 핸들러 — 본 schema 활용)
  - 모든 Lesson 의존 클라이언트 코드
- **Related**:
  - REQ-NF-001 (LCP) — Edge Cache + ETag 활용으로 충족 보조
