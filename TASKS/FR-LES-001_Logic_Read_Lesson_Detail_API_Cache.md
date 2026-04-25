# [Feature] FR-LES-001: 레슨 단건 조회 Route Handler — 3매체 메타 + 캐시

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-LES-001: 레슨 단건 조회 Route Handler — youtube_video_id·script·pdf_kit_url·revision 메타 반환"
labels: 'feature, backend, lesson, query, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-LES-001] `GET /api/lesson/{id}` Route Handler — Lesson 단건 메타 데이터 반환 + Next.js `revalidate` 캐싱 적용
- **목적**: Story 1 (박지훈 · 레슨 시청) 와 Story 4 (오세은 · 재개 위치) 의 진입로. UC-01 (레슨 시청) 의 데이터 공급원이며, REQ-FUNC-035 (유튜브 임베디드만) · REQ-FUNC-034 (3매체 NOT NULL) 를 응답 시점에 보장한다. 본 Route Handler 는 Read 전용이므로 캐시 적극 활용으로 LCP p95 ≤ 1.5s (REQ-NF-002) 달성에 기여한다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#3.3` — Server Action vs Route Handler 선택 기준 (본 태스크는 Route Handler — 외부 URL 노출 + 캐시 헤더)
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-033, 034, 035, 037
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-020 (재개 위치 의존)
  - `/docs/SRS_V0_9.md#6.1` — `/api/lesson/{id}` 엔드포인트 정의
  - `/docs/SRS_V0_9.md#6.2.2` — LESSON 테이블 정의
  - `/docs/SRS_V0_9.md#3.5.2` — UC-01 레슨 시청
  - `/docs/SRS_V0_9.md#5.1` — TC-033, TC-034, TC-035
- 데이터 모델: `/docs/SRS_V0_9.md#6.2.1`

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/lesson/[id]/route.ts` Route Handler 생성
- [ ] `params.id` 검증 — Zod로 `L\d{3}` 패턴 검증 (REQ-FUNC-033). 위반 시 400 응답
- [ ] Prisma 쿼리 — `prisma.lesson.findUnique({ where: { lessonId }, select: {...} })`
- [ ] **응답 SELECT 컬럼 명시** — `lessonId`, `title`, `youtubeVideoId`, `script`, `pdfKitUrl`, `revisionLastUpdated`, `revisionNotes`, `module: { moduleId, name }`. PII 또는 내부 메타 누출 방지
- [ ] Lesson 미존재 — 404 응답 + `{ error_code: 'LESSON_NOT_FOUND', ... }`
- [ ] 응답 헤더 — `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` (Vercel Edge 캐시 활용)
- [ ] Next.js `export const revalidate = 60` 설정 (RSC 캐시)
- [ ] 응답 페이로드는 §6.1 의 DTO 정의와 1:1 매핑
- [ ] OpenAPI/Swagger 명세 업데이트
- [ ] Lesson 의 3매체 NOT NULL 검증 — `youtubeVideoId`, `script`, `pdfKitUrl` 중 하나라도 null 인 경우 절대 발생하지 않아야 함 (DB 제약 + 응답 시점 sanity check)
- [ ] 인증은 선택적 — 미로그인 사용자도 조회 가능 (UC-01 + 비알고리즘 유입). 단 `/lesson/{id}` 조회 이벤트는 로그인 사용자만 EventLog 기록

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 조회
- **Given**: Lesson `L001` 이 시드되어 있음
- **When**: `GET /api/lesson/L001`
- **Then**: 200 응답 + 7필드 모두 포함된 JSON. `Cache-Control` 헤더에 `s-maxage=60` 명시

### Scenario 2: 존재하지 않는 lesson_id
- **Given**: `L999` 가 DB 에 없음
- **When**: `GET /api/lesson/L999`
- **Then**: 404 응답 + `{ error_code: 'LESSON_NOT_FOUND', message: '...', request_id: '...' }`

### Scenario 3: 잘못된 ID 포맷
- **Given**: 임의 문자열 `INVALID-ID`
- **When**: `GET /api/lesson/INVALID-ID`
- **Then**: 400 응답 + `{ error_code: 'INVALID_LESSON_ID' }`. DB 조회 발생 안함

### Scenario 4: 캐시 hit 시 응답 시간
- **Given**: 동일 lesson_id 에 대한 두 번째 요청 (60초 이내)
- **When**: `GET /api/lesson/L001` 재호출
- **Then**: Vercel Edge Cache HIT. 응답 시간 ≤ 50ms. DB 조회 발생 안함

### Scenario 5: 미로그인 사용자도 조회 가능
- **Given**: 세션 쿠키 없는 익명 요청
- **When**: `GET /api/lesson/L001`
- **Then**: 200 응답 정상. EventLog 에는 기록되지 않음 (user_id = null 인 lesson.viewed 이벤트는 발행 안함 — 익명 트래픽 분리 정책)

### Scenario 6: 3매체 NOT NULL 검증 (응답 sanity check)
- **Given**: Lesson 시드가 정상이라 youtubeVideoId·script·pdfKitUrl 모두 존재
- **When**: 응답 페이로드 검증
- **Then**: 3필드 모두 비어있지 않음. 비어있으면 sanity check 가 5xx 응답으로 변환하고 Sentry 에 critical 알림

### Scenario 7: 응답 시간 목표
- **Given**: 부하 100명 동시 요청
- **When**: k6 부하 테스트 (TS-LOAD-003 와 정합)
- **Then**: p95 응답 시간 ≤ 200ms (캐시 미스 포함), 캐시 hit 시 ≤ 50ms

### Scenario 8: 재개 위치 정보 별도 분리
- **Given**: 로그인 사용자가 본 엔드포인트 호출
- **When**: 응답 페이로드 검증
- **Then**: 응답에는 `lastPositionSec` 가 포함되지 **않음**. 진도 정보는 별도 `getLastPosition()` Server Action 으로 조회 (캐시 키 분리 위함)

## :gear: Technical & Non-Functional Constraints
- **Route Handler 선택 (§3.3)**: 외부 URL 노출 + 캐시 헤더 제어 + 익명 접근 허용 → Server Action 이 아닌 Route Handler 채택
- **캐시 정책**: `revalidate: 60` + `s-maxage=60`. Lesson 메타는 거의 불변 (revision_last_updated 변경 시만 갱신)
- **응답 컬럼 화이트리스트**: SELECT 시 `select` 명시로 우발적 PII 누출 방지. `*` 절대 금지
- **DB 인덱스**: `lessonId` 는 PK 라 자동 인덱스. 추가 인덱스 불필요
- **에러 응답 일관성**: §6.1 공통 오류 포맷 `{ error_code, message, request_id }` 준수
- **요청 ID**: 각 응답에 `X-Request-Id` 헤더로 추적성 확보
- **익명 트래픽 정책**: lesson 메타는 익명 조회 허용. 단 EventLog 에는 user_id 가 있는 경우에만 기록
- **버전 라이선스 메타**: 응답에 `revision_last_updated` 와 `revision_notes` 포함되어야 함 (REQ-FUNC-015 의 클라이언트 측 표시 위함)
- **금지**: 학습자 진도 정보 (`lastPositionSec`, `oxCompleted`) 를 본 응답에 혼합 금지 — 캐시 무효화 폭증 방지

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 전부 통과
- [ ] `app/api/lesson/[id]/route.ts` 구현
- [ ] Prisma 쿼리의 SELECT 명시 (PII 누출 방지)
- [ ] Cache-Control 헤더 + `revalidate` 동시 적용 검증
- [ ] 캐시 HIT 응답 시간 ≤ 50ms 측정 (Vercel Edge)
- [ ] DB 미스 시 응답 시간 p95 ≤ 200ms 측정
- [ ] OpenAPI 명세 업데이트
- [ ] TS-UT-008, TS-UT-009 (lessonId 포맷·3매체 NOT NULL 검증) 통과
- [ ] TS-LOAD-003 (Lighthouse) 의 LCP 측정에서 본 엔드포인트 사용 확인
- [ ] PR 본문에 "본 엔드포인트는 Story 1·4 의 진입로이며 캐시 정책이 LCP 달성에 기여" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-002 (Lesson Route Handler DTO)
  - CT-DB-003 (Lesson 모델)
  - CT-DB-010 (마이그레이션 + 시드 — 최소 L001 1건 필요)
  - CT-MOCK-001 (Lesson 10편 시드)
  - CT-API-001 (공통 응답·오류 포맷)
- **Blocks**:
  - FR-LES-002 (레슨 목록 조회 — 단건 조회 패턴 재사용)
  - FR-LES-003 (레슨 시청 페이지 — 본 API 의 클라이언트)
  - FR-LES-004 (글로 읽기 토글 — script 필드 사용)
  - FR-LES-005 (오답 앵커 스크롤)
  - FW-PROG-001 (재개 위치 저장 — lesson 메타 검증 후 진도 갱신)
  - TS-E2E-001, TS-E2E-002 (Story 1·4 E2E)
