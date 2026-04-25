# [Feature] CT-API-004: submitOx() Server Action DTO + P2002 처리 명세 (멱등 응답 계약)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-API-004: submitOx() Server Action DTO + P2002 처리 명세 (멱등 응답 계약)"
labels: 'feature, backend, api-spec, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-API-004] `submitOx()` Server Action 의 입출력 DTO 정의 및 **P2002 UNIQUE 충돌 → 200 동일 페이로드 재반환** 응답 계약 명세
- **목적**: OX 제출 API 의 단일 진실 공급원(SSOT) 을 확립한다. 본 DTO 가 결정되어야 프론트엔드(OX UI), 백엔드(채점 로직), 테스트(GWT 시나리오) 가 동일 계약을 참조할 수 있다. 특히 SRS §1.5.1.1 Option B 의 핵심인 "**중복 제출 시 200 응답 + 동일 페이로드 재반환**" 의 동작 명세가 본 태스크에서 확정된다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.1.1` — Option B 결정 내용 (구현 규약 1~4)
  - `/docs/SRS_V0_9.md#3.3` — API Overview (Server Action vs Route Handler 선택 기준)
  - `/docs/SRS_V0_9.md#6.1` — `submitOx()` 행 (DTO 컬럼)
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-002, 006 AC
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-036 (스크립트 앵커 스크롤)
- 시퀀스 다이어그램: `/docs/SRS_V0_9.md#3.4.1`
- 공통 규약: `/docs/SRS_V0_9.md#6.1` (응답 스키마 버저닝, 오류 포맷)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/contracts/ox.ts` 신규 — Zod 스키마 정의
- [ ] Request 스키마: `OxSubmitRequest` = `{ lesson_id: string (regex L\d{3}), answers: { question_order: int, answer: boolean }[] }`
- [ ] Success Response 스키마: `OxSubmitResponse` = `{ passed: boolean, stamp_earned: boolean, scroll_to_section?: string }`
- [ ] Error Response 스키마: `{ error_code: string, message: string, request_id: string }` (§6.1 공통 규약)
- [ ] **멱등 동작 명세 주석**: P2002 catch 시 `LessonProgress` 에서 기존 상태 조회하여 동일 페이로드 재반환 (200) — 이는 본 DTO 의 핵심 계약
- [ ] `OpenAPI.yaml` 또는 `api_v1.yaml` 업데이트 — submitOx 항목에 멱등성 표기
- [ ] TypeScript 타입 export — `import type { OxSubmitRequest, OxSubmitResponse } from '@/lib/contracts/ox'`
- [ ] MSW(Mock Service Worker) 핸들러 작성 (CT-MOCK-004 와 정합) — 정상/멱등/오답 3종 응답
- [ ] 계약 테스트 (contract test) 작성 — Zod parse 성공 케이스 + 잘못된 필드 거부 케이스

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 제출 응답 DTO 검증
- **Given**: 유효한 `OxSubmitRequest` 가 주어짐 (`lesson_id: "L001"`, 5개 answers)
- **When**: Zod 스키마로 parse
- **Then**: parse 성공, 첫 통과 시 응답은 `{ passed: true, stamp_earned: true, scroll_to_section: undefined }`

### Scenario 2: 오답 응답 DTO 검증
- **Given**: 일부 answers 가 오답
- **When**: 응답이 클라이언트로 전달됨
- **Then**: 응답은 `{ passed: false, stamp_earned: false, scroll_to_section: "#anchor-3" }`. `scroll_to_section` 은 `OxQuestion.scrollAnchor` 에서 가져온 값

### Scenario 3: 멱등 응답 DTO 검증 (Option B 핵심 계약)
- **Given**: 동일 (user_id, lesson_id) 의 OX 가 이미 통과되어 stamp 가 발급된 상태
- **When**: 동일한 `OxSubmitRequest` 가 재수신됨
- **Then**: 응답은 **첫 응답과 동일한 페이로드** `{ passed: true, stamp_earned: true }` (HTTP 200). 클라이언트는 두 응답을 구분할 수 없어야 한다 (read-only short-circuit, §1.5.1.1 구현 규약 3)

### Scenario 4: lesson_id 포맷 위반
- **Given**: `lesson_id: "INVALID"` (L001~L125 포맷 위반)
- **When**: Zod 스키마 parse
- **Then**: `ZodError` 발생. 서버에서는 400 Bad Request + `{ error_code: "INVALID_LESSON_ID", ... }`

### Scenario 5: answers 배열 누락
- **Given**: `answers: []`
- **When**: Zod 스키마 parse
- **Then**: parse 실패. min(1) 위반

## :gear: Technical & Non-Functional Constraints
- **계약 단방향성**: DTO 변경은 frontend·backend·test·mock 4곳을 동시 갱신해야 한다. 본 파일이 SSOT
- **버저닝**: 응답 스키마 버저닝은 `Accept: application/vnd.saas.v1+json` 헤더로 처리 (§6.1)
- **에러 코드 체계**: `INVALID_LESSON_ID`, `INVALID_ANSWER_FORMAT`, `LESSON_NOT_FOUND`, `UNAUTHORIZED` 5개 코드 정의
- **멱등성 표기**: OpenAPI 스펙에 `x-idempotent: true` 확장 필드 + 설명 주석으로 "P2002 → 200 변환은 §1.5.1.1 Option B 에 의함" 명시
- **타입 안전**: Server Action 시그니처가 Zod 스키마와 1:1 매핑됨을 보장 (`z.infer<typeof OxSubmitRequestSchema>`)
- **금지**: `idempotency_key` 같은 별도 헤더 도입 금지 (§1.5.1.1 에서 Option A 기각). 자연 멱등 키만 사용

## :checkered_flag: Definition of Done (DoD)
- [ ] 5개 GWT 시나리오 전부 통과
- [ ] `lib/contracts/ox.ts` 에 Zod 스키마·TypeScript 타입 export 완료
- [ ] OpenAPI/Swagger 명세 갱신 — submitOx 항목에 멱등성·5개 에러 코드 명시
- [ ] MSW 핸들러 4종 (정상 통과·오답·멱등 재제출·400) 동작 확인
- [ ] 계약 테스트 (Vitest) 통과
- [ ] 타입 추론 검증 — `OxSubmitRequest` 와 `OxSubmitResponse` 가 IDE 자동완성에 노출됨
- [ ] PR 본문에 "본 DTO 변경 시 영향 받는 파일 목록" 체크리스트 포함
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-001 (공통 응답·오류 포맷 + Rate Limit 미들웨어)
  - CT-DB-005 (Stamp UNIQUE 제약 — 본 DTO 의 멱등 동작 근간)
  - CT-DB-006 (OxQuestion 모델 — `scrollAnchor` 필드)
- **Blocks**:
  - FW-OX-001 (OX 채점 Server Action 구현)
  - FW-OX-002 (P2002 → 200 변환 로직 — 본 DTO 의 동작 명세를 구현)
  - FR-OX-001 (OX UI 컴포넌트)
  - FR-LES-005 (오답 시 앵커 스크롤)
  - TS-UT-003 (OX 멱등 GWT 테스트)
  - TS-IT-010 (OX 멱등 통합 테스트)
  - CT-MOCK-004 (MSW 핸들러)
