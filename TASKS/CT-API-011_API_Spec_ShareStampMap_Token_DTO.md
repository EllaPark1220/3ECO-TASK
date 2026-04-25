# [Contract] CT-API-011: shareStampMap() 토큰 발급 DTO

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Contract] CT-API-011: shareStampMap() 토큰 발급 DTO — Request/Response Zod 스키마 + 공유 URL 규격"
labels: 'contract, api, stamp-map, share, could-have, priority:low, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-API-011] `shareStampMap()` Server Action 의 Request/Response DTO + Zod 스키마
- **목적**: FW-STAMP-001 (공유 토큰 발급) 의 Contract First 계약. Server Action 시그니처, 응답 형식, 공유 URL 규격을 사전 정의하여 프론트엔드·백엔드 병렬 개발을 지원.

## :link: References (Spec & Context)
- SRS 문서: `/docs/SRS_V0_9.md#6.1` — `shareStampMap()` 엔드포인트
- 선행: CT-DB-005 (Stamp), CT-API-001 (공통 응답 포맷)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/contracts/stamp.ts` 에 DTO 추가:
  ```ts
  import { z } from 'zod';

  // Request — 입력 없음 (세션에서 userId 추출)
  export const ShareStampMapRequest = z.object({}).strict();

  // Response
  export const ShareStampMapResponse = z.object({
    share_url: z.string().url(),
    token: z.string().uuid(),
    expires_at: z.string().datetime(),
    nickname: z.string(),
  });

  export type ShareStampMapResponseType = z.infer<typeof ShareStampMapResponse>;

  // 공유 페이지 응답 (익명 열람용)
  export const SharedStampMapViewResponse = z.object({
    nickname: z.string(),
    total_lessons: z.number().int(),
    earned_count: z.number().int(),
    modules: z.array(z.object({
      module_id: z.string(),
      name: z.string(),
      lessons: z.array(z.object({
        lesson_id: z.string(),
        title: z.string(),
        earned: z.boolean(),
      })),
    })),
    expires_at: z.string().datetime(),
  });
  ```
- [ ] **공유 URL 규격**: `{BASE_URL}/stamp/shared/{uuid-v4-token}`
- [ ] **에러 코드 정의**:
  - `SHARE_LIMIT_EXCEEDED` — 활성 토큰 5개 초과
  - `SHARE_TOKEN_EXPIRED` — 만료된 토큰 접근 시
  - `SHARE_TOKEN_NOT_FOUND` — 존재하지 않는 토큰

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: DTO 정합성 — Zod parse 성공
- **Given**: 유효한 응답 `{ share_url, token, expires_at, nickname }`
- **When**: `ShareStampMapResponse.parse(data)`
- **Then**: 에러 없음

### Scenario 2: 잘못된 URL — Zod 실패
- **Given**: `share_url: 'not-a-url'`
- **When**: parse
- **Then**: ZodError

### Scenario 3: 공유 뷰 DTO — 모듈 구조
- **Given**: 공유 페이지 응답
- **When**: `SharedStampMapViewResponse.parse(data)`
- **Then**: modules 내 lessons 배열 정합

### Scenario 4: 에러 코드 3종
- **Given**: 에러 응답
- **When**: `error_code` 검사
- **Then**: 3종 중 하나

## :gear: Technical & Non-Functional Constraints
- **Contract First**: DTO 가 FW-STAMP-001 구현보다 선행
- **PII 배제**: `SharedStampMapViewResponse` 에 email·userId 미포함 (닉네임만)

## :checkered_flag: Definition of Done (DoD)
- [ ] 4개 GWT 시나리오 통과
- [ ] `lib/contracts/stamp.ts` 에 3개 Zod 스키마 추가
- [ ] 에러 코드 3종 정의
- [ ] PR 본문에 "FW-STAMP-001 의 Contract First. Could Have" 명시

## :construction: Dependencies & Blockers
- **Depends on**: CT-API-001 (공통 응답 포맷), CT-DB-005 (Stamp)
- **Blocks**: FW-STAMP-001 (공유 토큰 발급 구현)
- **Related**: REQ-FUNC-041
