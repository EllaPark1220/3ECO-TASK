# [Feature] CT-API-003: saveProgress() Server Action DTO + Zod {lesson_id, position_sec} + UPSERT 응답

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-API-003: saveProgress() Server Action 시그니처 + Zod 입력 ({lesson_id, position_sec}) + UPSERT 응답 + sendBeacon 호환"
labels: 'feature, backend, api-spec, progress, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-API-003] `saveProgress()` Server Action + `/api/progress/sync` Route Handler 의 Contract 정의 — Zod 입력 (`lesson_id` + `position_sec`) + UPSERT 응답 + `navigator.sendBeacon` 호환 형식
- **목적**: FW-PROG-001 (Logic Write 본체) + FW-PROG-002 (10초 송신 훅) 의 Contract SSOT. 클라이언트가 Server Action 직접 호출 (active 상태) 또는 sendBeacon (페이지 unload) 양쪽 경로로 호출 가능. REQ-FUNC-020 (10초 간격 저장) + REQ-NF-006 (저장 주기 ≤10s) 의 데이터 진입.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.1` — `saveProgress()` 엔드포인트 정의
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-020 (10초 간격 저장)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-006 (저장 주기 ≤10s)
  - `/docs/SRS_V0_9.md#6.2.2` — LESSON_PROGRESS 테이블
  - `/docs/SRS_V0_9.md#6.2.3` — INV-04 (stampEarned ⇒ oxCompleted)
- 선행: CT-API-001, CT-DB-004 (LessonProgress 모델), FR-AUTH-001 (세션)
- 짝: FW-PROG-001 (Logic Write), FW-PROG-002 (송신 훅)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/contracts/progress.ts` 신규 파일 — Zod + TypeScript SSOT
- [ ] **Request 검증**:
  ```ts
  import { z } from 'zod';

  export const SaveProgressRequestSchema = z.object({
    lesson_id: z.string().regex(/^L\d{3}$/, 'lesson_id 포맷이 올바르지 않습니다'),
    position_sec: z.number().int().min(0).max(36000),  // 최대 10시간 (안전 한도)
  });
  export type SaveProgressRequest = z.infer<typeof SaveProgressRequestSchema>;
  ```
- [ ] **Response DTO**:
  ```ts
  export const SaveProgressResponseSchema = z.object({
    ok: z.literal(true),
    lesson_id: z.string(),
    saved_position_sec: z.number().int(),       // 실제 저장된 값 (서버 정정 가능성)
    saved_at: z.string(),                        // ISO datetime
    is_first_save: z.boolean(),                  // create vs update 구분
  });
  export type SaveProgressResponse = z.infer<typeof SaveProgressResponseSchema>;
  ```
- [ ] **두 가지 호출 경로 정의**:
  - **A. Server Action (`saveProgress`)** — RSC·Client Component 에서 직접 import
    - `'use server'` 지시어
    - 시그니처: `async function saveProgress(input: SaveProgressRequest): Promise<SaveProgressResponse>`
    - 인증·권한 체크는 본체 (FW-PROG-001) 가 담당
  - **B. Route Handler (`POST /api/progress/sync`)** — `navigator.sendBeacon` 의 transport
    - sendBeacon 은 Server Action 직접 호출 불가 → Route Handler 필요
    - 동일 Zod 스키마 활용
    - Content-Type: `application/json` (sendBeacon 의 Blob 으로 전송)
- [ ] **sendBeacon 호환 정책 (FW-PROG-002 의 unload 시나리오)**:
  ```ts
  // 클라이언트 측 (FW-PROG-002):
  const blob = new Blob(
    [JSON.stringify({ lesson_id: 'L001', position_sec: 45 })],
    { type: 'application/json' }
  );
  navigator.sendBeacon('/api/progress/sync', blob);
  ```
  - 응답 본문 클라이언트 처리 불가 (sendBeacon 특성) → 서버는 200/204 만 응답
- [ ] **인증 정책**:
  - **로그인 사용자**: `requireUser()` (FR-AUTH-002) 가드 → DB UPSERT
  - **미인증 사용자**: 401 응답 (FW-PROG-002 가 graceful 처리, 사용자 무인지)
- [ ] **응답 헤더**:
  - Server Action — Next.js 자동 처리
  - Route Handler — `Content-Type: application/json`, `X-Request-Id`
  - Cache-Control 미설정 (mutation 응답)
- [ ] **에러 응답 정의 (CT-API-001 의 ERROR_CODES 활용)**:
  - 400 — `INVALID_LESSON_ID` (Zod 실패)
  - 400 — `INVALID_POSITION` (음수 또는 36000 초과)
  - 401 — `UNAUTHORIZED` (세션 없음)
  - 404 — `LESSON_NOT_FOUND` (lesson_id 가 DB 에 없음)
  - 429 — `RATE_LIMIT_EXCEEDED` (분당 60 req — 일반 API 한도)
- [ ] **position_sec 검증 정책**:
  - 음수 거부 — DB CHECK 제약 (PostgreSQL) + Zod
  - 36000 초 (10시간) 상한 — 안전 한도. YouTube 영상 평균 5~15분 고려
  - 정수만 — `Math.floor()` 클라이언트 측 변환 강제 (FW-PROG-002 의 책임)
- [ ] **idempotency 정책 (REQ-FUNC-020)**:
  - 동일 (user_id, lesson_id) 의 UPSERT — 자연 멱등 (UPDATE 가 새 row 만들지 않음)
  - 같은 position_sec 으로 반복 호출 → 동일 응답 (DB 변경 0)
- [ ] **OpenAPI 명세 추가** — `/api/progress/sync` POST
- [ ] **타입 export** — Zod 스키마 + TypeScript 타입 + Mock 모두 단일 파일
- [ ] **Mock fixture** — `lib/contracts/__fixtures__/progress.ts`:
  ```ts
  export const mockSaveProgressRequest: SaveProgressRequest = { lesson_id: 'L001', position_sec: 30 };
  export const mockSaveProgressResponse: SaveProgressResponse = {
    ok: true,
    lesson_id: 'L001',
    saved_position_sec: 30,
    saved_at: '2026-04-25T12:00:00Z',
    is_first_save: false,
  };
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: Server Action 정상 응답
- **Given**: 로그인 사용자 + Lesson L001 시드
- **When**: `saveProgress({ lesson_id: 'L001', position_sec: 30 })` 호출
- **Then**: SaveProgressResponse 정상. ok: true, saved_position_sec: 30, is_first_save: true (첫 호출)

### Scenario 2: Route Handler 경로 (sendBeacon)
- **Given**: 로그인 + 페이지 unload
- **When**: `navigator.sendBeacon('/api/progress/sync', blob)` 발사
- **Then**: 서버 200/204 응답. DB UPSERT 정상

### Scenario 3: 두 번째 호출 — UPDATE
- **Given**: Scenario 1 직후 (LessonProgress 1건 존재)
- **When**: `saveProgress({ lesson_id: 'L001', position_sec: 60 })` 재호출
- **Then**: ok: true, is_first_save: false. DB row 1건 유지 (UPDATE)

### Scenario 4: 잘못된 lesson_id — 400
- **Given**: 데이터
- **When**: `saveProgress({ lesson_id: 'INVALID', position_sec: 30 })`
- **Then**: 400 + `INVALID_LESSON_ID` + Zod 에러 details

### Scenario 5: 음수 position_sec — 400
- **Given**: 데이터
- **When**: `saveProgress({ lesson_id: 'L001', position_sec: -5 })`
- **Then**: 400 + `INVALID_POSITION`

### Scenario 6: 상한 초과 (36001) — 400
- **Given**: 데이터
- **When**: position_sec: 36001
- **Then**: 400 + `INVALID_POSITION`

### Scenario 7: 미인증 — 401
- **Given**: 세션 없음
- **When**: 호출
- **Then**: 401 + `UNAUTHORIZED`. DB 변경 0

### Scenario 8: Lesson 미존재 — 404
- **Given**: L999 미시드
- **When**: 호출
- **Then**: 404 + `LESSON_NOT_FOUND`

### Scenario 9: idempotency — 동일 입력 반복
- **Given**: position_sec: 30 으로 1회 호출 후
- **When**: 동일 입력으로 5회 추가 호출
- **Then**: 모두 200 + 응답 일치. DB row 1건 유지. UPDATE 발생하지만 의미 변경 0

### Scenario 10: Mock fixture schema parse
- **Given**: mockSaveProgressRequest, mockSaveProgressResponse
- **When**: 각 schema 의 `parse()` 실행
- **Then**: 검증 통과. 단위 테스트에서 활용 가능

## :gear: Technical & Non-Functional Constraints
- **두 경로 분리 (Server Action + Route Handler)**:
  - Server Action — RSC·Client 에서 type-safe 직접 호출
  - Route Handler — sendBeacon transport (페이지 unload)
  - 둘 다 동일 Zod 스키마 + 동일 본체 로직 (FW-PROG-001) 호출
- **position_sec 정수 + 0~36000 범위**: 음수·소수·10시간 초과 거부
- **idempotency**: 자연 멱등 (UPSERT 의 UPDATE). 별도 P2002 catch 불필요
- **Cache 정책**: mutation 응답이라 Cache-Control 미설정
- **Rate Limit**: general 60 req/min. 본 API 는 10초 간격 호출 → 분당 6회 — 한도 충분
- **응답 시간**: p95 ≤ 200ms (UPSERT + 인증 가드)
- **민감 필드 부재**: 응답에 user_id 미포함 (세션에서 식별)
- **sendBeacon 응답 무시 정책**: 클라이언트는 200/204 응답 본문 활용 불가. 본 응답은 디버깅·로그용
- **금지**:
  - Server Action 만 정의하고 Route Handler 누락 (sendBeacon 호환 깨짐)
  - position_sec 소수점 허용 (DB 정수 타입 위반)
  - 상한 없이 허용 (악의적 큰 값 → 디스플레이 오류)
  - private 캐시 (mutation 응답에 부적절)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/contracts/progress.ts` Zod + TypeScript SSOT
- [ ] Server Action + Route Handler 양쪽 경로 정의
- [ ] sendBeacon 호환 검증
- [ ] position_sec 0~36000 검증
- [ ] idempotency 검증 (자연 멱등)
- [ ] Rate Limit 통합
- [ ] 응답 시간 p95 ≤ 200ms 측정
- [ ] Mock fixture 작성 + schema parse 검증
- [ ] OpenAPI 명세 추가
- [ ] PR 본문에 "FW-PROG-001 의 Contract. sendBeacon 호환 양 경로 지원" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-001 (공통 응답·오류 + Rate Limit)
  - CT-DB-004 (LessonProgress 모델)
  - CT-DB-003 (Lesson — 존재 검증)
  - FR-AUTH-001 (getCurrentUser)
- **Blocks**:
  - FW-PROG-001 (Logic Write 본체)
  - FW-PROG-002 (10초 송신 훅 — 본 Contract 호출)
  - FW-PROG-003 (IndexedDB 큐잉 — 본 schema 로 큐 항목 정의)
  - FW-PROG-004 (다기기 LWW)
  - TS-UT-005 (단위 테스트)
- **Related**:
  - REQ-FUNC-020·024 (다기기 LWW)
  - REQ-NF-006 (저장 주기)
