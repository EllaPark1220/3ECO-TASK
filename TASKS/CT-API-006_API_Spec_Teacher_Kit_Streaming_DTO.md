# [Feature] CT-API-006: GET /api/teacher/kit/{id} Route Handler 스트리밍 DTO + 구버전 301 리디렉트 시그니처

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-API-006: GET /api/teacher/kit/{id} 스트리밍 응답 (PDF binary) + 구버전 301 리디렉트 + ?rev= 쿼리 파라미터 + Content-Disposition"
labels: 'feature, backend, api-spec, pdf, teacher, priority:critical, mvp-in, private-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-API-006] `GET /api/teacher/kit/{lessonId}` Route Handler 의 Contract — 응답이 JSON 이 아닌 **PDF binary 스트리밍** + `?rev=old` 구버전 쿼리 파라미터 → 최신 alias 로 301 리디렉트 + Content-Disposition (RFC 5987 한글 파일명)
- **목적**: FR-PDF-001 (Logic Read PDF 다운로드) + FR-PDF-002 (구버전 리디렉트) 의 Contract SSOT. JSON 이 아닌 binary 응답이라 다른 API 와 schema 패턴이 다름 — 별도 명세 필요. REQ-FUNC-013 (단일 PDF) + REQ-FUNC-017 (구버전 리디렉트) + REQ-NF-004 (PDF p95 ≤2초) 의 데이터 진입.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.1` — `/api/teacher/kit/{id}` 엔드포인트
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-013, 015, 017, 018 (PDF·개정·리디렉트·폴백)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-004 (p95 ≤2초)
  - `/docs/SRS_V0_9.md#4.2.8` — REQ-NF-049 (캐시 HIT ≥95%)
  - `/docs/SRS_V0_9.md#3.4.2` — 교안 PDF 다운로드 시퀀스
- 외부 표준: RFC 5987 (Content-Disposition 한글), RFC 7232 (304/ETag)
- 선행: CT-API-001, CT-DB-007 (TeacherKit), FR-PDF-001 (이미 발행)
- 짝: FR-PDF-001 (Logic Read 본체), FR-PDF-002 (구버전 리디렉트), FW-PDF-003 (폴백)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/contracts/teacher-kit.ts` 신규 파일 — Zod 입력 + 응답 헤더 정의 (binary 응답이라 body Zod 미적용)
- [ ] **Request 검증**:
  ```ts
  import { z } from 'zod';

  export const TeacherKitParamSchema = z.object({
    lessonId: z.string().regex(/^L\d{3}$/, 'lessonId 포맷이 올바르지 않습니다'),
  });

  export const TeacherKitQuerySchema = z.object({
    rev: z.string().optional(),  // 구버전 revision 지정 (예: ?rev=2026-04-01)
  });
  ```
- [ ] **응답 정의 — JSON 이 아닌 binary**:
  - 정상 — `200 OK` + `Content-Type: application/pdf` + PDF body (스트리밍)
  - 캐시 HIT — `200 OK` + `X-Cache: HIT` 헤더
  - 304 — `304 Not Modified` (ETag 일치 시) + body 0 byte
  - 301 — `301 Moved Permanently` (구버전 리디렉트) + `Location: /api/teacher/kit/L001` (latest)
  - 404 — `404 Not Found` + JSON `{ error_code: 'LESSON_NOT_FOUND', ... }`
  - 503 — `503 Service Unavailable` + JSON `{ error_code: 'STORAGE_UNAVAILABLE', ... }` (FW-PDF-003 폴백 후)
- [ ] **응답 헤더 — 한글 파일명 RFC 5987**:
  ```
  Content-Type: application/pdf
  Content-Disposition: inline; filename="L001_lesson.pdf"; filename*=UTF-8''L001_%ED%99%94%ED%8F%90%EC%9D%98%20%EC%A0%95%EC%9D%98.pdf
  Content-Length: <byte 수>
  Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800
  ETag: "L001-2026-04-25-pdf"
  X-Cache: HIT|MISS|REGENERATED
  X-Request-Id: <uuid>
  ```
  - **`inline`** — 브라우저 미리보기 가능 (사용자 친화). `attachment` 도 클라이언트 옵션으로 변경 가능
  - `filename` (ASCII fallback) + `filename*` (UTF-8 percent-encoded) 양쪽 명시
- [ ] **구버전 리디렉트 정책 (REQ-FUNC-017)**:
  - URL 패턴: `/api/teacher/kit/L001?rev=2026-04-01` (구 revision)
  - DB 의 TeacherKit 테이블에서 해당 (lessonId, revision) 조회
  - **존재 + revision 이 최신과 다름** → 301 리디렉트 to `/api/teacher/kit/L001` (rev 미지정)
  - **존재 + revision = 최신** → 정상 PDF 응답
  - **존재 안함** → 404
- [ ] **인증 정책**:
  - **익명 다운로드 허용** (CC BY-NC-SA 4.0 정책 부합)
  - 단 EventLog `teacher_kit.downloaded` 발행 시 user_id (로그인 시) 또는 null (익명)
  - **TEACHER 전용으로 변경할 수 있는 옵션** — 본 Contract 는 익명 허용, 정책 변경 시 한 줄 추가
- [ ] **Rate Limit (CT-API-001)**:
  - general 60 req/min — 부족할 수 있음 (한 교사가 여러 lesson PDF 받을 때)
  - **본 라우트 전용 — 분당 30 req per IP** 별도 정책 검토 (별도 후속)
- [ ] **에러 응답 — JSON 폴백**:
  - PDF 응답이 정상이 아닌 경우만 JSON
  - 표준 ErrorResponse 포맷 (CT-API-001)
- [ ] **OpenAPI 명세 추가** — content type 분기:
  ```yaml
  responses:
    '200':
      content:
        application/pdf:
          schema: { type: string, format: binary }
    '301': { description: Moved Permanently }
    '304': { description: Not Modified }
    '404': { ... ErrorResponse }
  ```
- [ ] **스트리밍 응답 정책**:
  - PDF Buffer 를 한 번에 응답 본문에 쓰는 방식 채택 (Vercel Edge 호환성 + PDF 파일 특성상 청크 스트리밍 효과 미미)
  - `new Response(pdfBuffer, { headers })` 패턴
- [ ] **Mock fixture 정의 (binary 라 schema parse 부적용)**:
  ```ts
  // 헤더 검증용
  export const expectedTeacherKitHeaders = {
    'Content-Type': 'application/pdf',
    'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
  };
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 응답 — PDF binary
- **Given**: Lesson L001 시드 + TeacherKit 캐시 존재
- **When**: `GET /api/teacher/kit/L001`
- **Then**: 200 + `Content-Type: application/pdf` + PDF magic bytes (`%PDF-`) + Content-Disposition (한글 RFC 5987)

### Scenario 2: 캐시 HIT 헤더
- **Given**: 두 번째 요청
- **When**: 호출
- **Then**: 응답 + `X-Cache: HIT`. 응답 시간 ≤ 100ms

### Scenario 3: ETag 일치 — 304
- **Given**: 첫 응답 ETag = `"L001-2026-04-25-pdf"`
- **When**: `If-None-Match: "L001-2026-04-25-pdf"` 헤더로 재요청
- **Then**: 304 + body 0 byte

### Scenario 4: 구버전 ?rev= 쿼리 → 301 리디렉트
- **Given**: TeacherKit (L001, 2026-04-01) 존재 + 최신 revision = 2026-05-01
- **When**: `GET /api/teacher/kit/L001?rev=2026-04-01`
- **Then**: 301 + `Location: /api/teacher/kit/L001` (rev 미포함)

### Scenario 5: ?rev= 가 최신과 일치 — 정상 200
- **Given**: 최신 revision = 2026-05-01
- **When**: `GET /api/teacher/kit/L001?rev=2026-05-01`
- **Then**: 200 + 정상 PDF (리디렉트 0)

### Scenario 6: 잘못된 lessonId — 400
- **Given**: 데이터
- **When**: `GET /api/teacher/kit/INVALID`
- **Then**: 400 + JSON `{ error_code: 'INVALID_LESSON_ID' }`

### Scenario 7: Lesson 미존재 — 404
- **Given**: L999 미시드
- **When**: 호출
- **Then**: 404 + JSON `{ error_code: 'LESSON_NOT_FOUND' }`

### Scenario 8: 한글 파일명 RFC 5987
- **Given**: Lesson title = "화폐의 정의"
- **When**: 응답 헤더 검사
- **Then**: `filename="L001.pdf"` (ASCII fallback) + `filename*=UTF-8''L001_%ED%99%94...` (UTF-8 인코딩)

### Scenario 9: 익명 다운로드 가능
- **Given**: 세션 없음
- **When**: 호출
- **Then**: 200 + 정상 PDF. 익명 사용자도 다운로드 가능 (CC 라이선스 정책)

### Scenario 10: 폴백 시 503
- **Given**: PDF 생성 실패 + 캐시 부재 (FW-PDF-003 의 catch 블록)
- **When**: 호출
- **Then**: 503 + JSON `{ error_code: 'STORAGE_UNAVAILABLE' }` + Sentry 알림

## :gear: Technical & Non-Functional Constraints
- **binary 응답 — JSON 아님**: 정상 응답은 `application/pdf` MIME. 에러만 JSON 폴백
- **단일 파일 SSOT**: `lib/contracts/teacher-kit.ts` — Zod 입력 검증 + 헤더 표준
- **RFC 5987 한글 파일명**: `filename` (ASCII) + `filename*` (UTF-8 percent-encoded) 동시 명시. IE·구 브라우저 호환
- **Cache-Control public**: PDF 는 사용자 무관 콘텐츠 SSOT (CC 라이선스). public 활용
- **ETag 정책**: revision + "-pdf" suffix. revision 변경 시 자동 cache miss
- **301 vs 302 정책**: 구버전 → 최신은 **301 (영구 리디렉트)** — 검색엔진·클라이언트 캐싱 활용
- **익명 다운로드 정책 (REQ-FUNC-037 + CC 라이선스)**: 본 Contract 는 익명 허용. TEACHER 전용 변경은 별도 정책 결정 필요
- **응답 시간 (REQ-NF-004)**:
  - 캐시 HIT — ≤ 100ms
  - 캐시 MISS (Storage 다운로드) — ≤ 1.5s
  - cold start (동적 생성) — ≤ 5s
  - p95 종합 — ≤ 2s
- **OpenAPI binary 표현**: `content: { application/pdf: { schema: { type: string, format: binary } } }`
- **Mock 정책**: 헤더만 mock (binary body 는 fixture 어려움). 실제 PDF 는 통합 테스트 (TS-IT-005·006)
- **금지**:
  - JSON 응답 (정상 case)
  - private 캐시 (PDF 는 public)
  - 302 리디렉트 (검색엔진 부정적)
  - filename 만 명시 (한글 깨짐)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/contracts/teacher-kit.ts` Zod 입력 + 헤더 표준 정의
- [ ] PDF binary 응답 + Content-Disposition 한글 RFC 5987
- [ ] ?rev= 쿼리 → 301 리디렉트 검증
- [ ] ETag 304 응답 검증
- [ ] 응답 시간 (캐시 HIT ≤100ms, MISS ≤1.5s, cold ≤5s) 측정
- [ ] OpenAPI 명세 — binary 응답 + 301/304 분기 명시
- [ ] Mock 헤더 fixture
- [ ] PR 본문에 "FR-PDF-001 의 Contract. binary 응답 + 한글 RFC 5987 + 301 리디렉트" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-001 (공통 응답·오류 + Rate Limit)
  - CT-DB-007 (TeacherKit 모델 — revision 매핑)
  - FR-PDF-001 (이미 발행 — 본 Contract 와 짝)
- **Blocks**:
  - FR-PDF-002 (구버전 301 리디렉트 — 본 Contract 의 ?rev= 활용)
  - FW-PDF-003 (폴백 — 본 Contract 의 503 응답)
  - TS-IT-005 (구버전 리디렉트 통합 테스트)
  - TS-IT-006 (PDF 5xx 카오스 — 본 Contract 활용)
  - TS-E2E-007 (장은혜 E2E)
- **Related**:
  - REQ-FUNC-017 (구버전 리디렉트), REQ-NF-049 (캐시 HIT)
