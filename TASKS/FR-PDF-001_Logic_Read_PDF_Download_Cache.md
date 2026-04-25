# [Feature] FR-PDF-001: GET /api/teacher/kit/{id} Route Handler — 2단 캐시 + 스트리밍

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-PDF-001: /api/teacher/kit/{id} Route Handler — Vercel Edge Cache + Supabase Storage 2단 캐시"
labels: 'feature, backend, pdf, query, cache, priority:critical, mvp-in, private-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-PDF-001] `GET /api/teacher/kit/{id}` Route Handler — 캐시 HIT 시 즉시 응답, MISS 시 동적 생성 후 Supabase Storage 저장 + 스트리밍 응답
- **목적**: Story 3 (장은혜) 의 PDF 다운로드 진입로. UC-07 (교안 PDF 다운로드) 의 데이터 공급원이며, REQ-NF-004 (PDF 다운로드 p95 ≤2초) · REQ-NF-049 (캐시 HIT ≥95%) 충족. 2단 캐시 (Edge + Storage) 로 Vercel Functions 의 cold start 영향을 최소화하고 동시 50명 부하를 안정적으로 처리.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#3.4.2` — 교사 모드 교안 PDF 다운로드 시퀀스
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-013, 017, 018 (교안 PDF·구버전 리디렉트·폴백)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-004 (p95 ≤2초)
  - `/docs/SRS_V0_9.md#4.2.8` — REQ-NF-049 (캐시 HIT ≥95%)
  - `/docs/SRS_V0_9.md#3.6.2` — PDF Cache 컴포넌트 (Vercel Edge + Supabase Storage 2단)
  - `/docs/SRS_V0_9.md#3.5.2` — UC-07 (교안 PDF 다운로드)
  - `/docs/SRS_V0_9.md#6.1` — `/api/teacher/kit/{id}` 엔드포인트 정의
- 선행: FW-PDF-001 (Renderer), FW-PDF-002 (Template), CT-DB-007 (TeacherKit 모델)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/teacher/kit/[id]/route.ts` Route Handler 생성
- [ ] `params.id` 검증 — Zod `lesson_id: regex(/^L\d{3}$/)`
- [ ] **인증·권한 정책 결정** — 교사 전용 라우트로 할지, 익명 다운로드 허용할지:
  - **본 태스크는 익명 다운로드 허용** 정책 채택 (CC BY-NC-SA 4.0 라이선스에 부합 + 비알고리즘 공공성)
  - 단 EventLog 의 `teacher_kit.downloaded` 이벤트는 로그인 사용자만 user_id 기록
- [ ] **2단 캐시 구조**:
  ```
  요청 → Vercel Edge Cache (1차) → HIT? 즉시 응답
                                  ↓ MISS
                                  Supabase Storage (2차) → HIT? 다운로드 + Edge에 캐시
                                                          ↓ MISS
                                                          동적 생성 (FW-PDF-002)
                                                          → Supabase Storage 저장
                                                          → Edge 캐시 + 응답
  ```
- [ ] **캐시 키 정책**: `teacher-kit/{lesson_id}/{revision_last_updated}.pdf`
  - 예: `teacher-kit/L001/2026-04-25.pdf`
  - revision 변경 시 자동 cache miss → 새 PDF 생성
- [ ] Lesson 조회 — `prisma.lesson.findUnique({ where: { lessonId }, select: { lessonId, title, youtubeVideoId, script, revisionLastUpdated, revisionNotes } })`
- [ ] OxQuestion 조회 — `prisma.oxQuestion.findMany({ where: { lessonId } })` (FW-PDF-002 의 props 위해)
- [ ] Lesson 미존재 → 404 (`LESSON_NOT_FOUND`)
- [ ] **응답 헤더**:
  - `Content-Type: application/pdf`
  - `Content-Disposition: inline; filename="{lessonId}_{title}.pdf"` (한글 파일명은 RFC 5987 인코딩)
  - `Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800` (Edge 24시간 캐시)
  - `X-Cache: HIT|MISS|REGENERATED` (디버깅용)
- [ ] **스트리밍 응답** — `new Response(pdfBuffer, { headers })` 또는 `ReadableStream` 활용
- [ ] **EventLog 발행** — 로그인 사용자의 경우 `teacher_kit.downloaded` 이벤트 + revision 정보 포함
- [ ] **에러 핸들링**:
  - PDF 생성 실패 (FW-PDF-002 throw) → FW-PDF-003 의 폴백 로직 (최신 캐시 PDF 응답 + 에러 로그)
  - Supabase Storage 5xx → 동적 생성 후 응답 (캐시는 일시적으로 비활성)
- [ ] **TS-IT-004 부하 테스트 준비** — 동시 50명 시나리오 셋업

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 첫 요청 — 캐시 MISS, 동적 생성
- **Given**: Lesson L001 시드. Supabase Storage 에 `teacher-kit/L001/{revision}.pdf` 부재
- **When**: `GET /api/teacher/kit/L001`
- **Then**: 200 응답 + `Content-Type: application/pdf`. PDF 동적 생성 후 Storage 에 저장. 응답 헤더 `X-Cache: MISS`. 응답 시간 p95 ≤ 5초 (cold start 포함)

### Scenario 2: 두 번째 요청 — Edge 캐시 HIT
- **Given**: Scenario 1 직후 (Edge Cache 에 PDF 존재)
- **When**: 60초 이내 동일 URL 재요청
- **Then**: Edge Cache HIT. 응답 시간 ≤ 100ms. 헤더 `X-Cache: HIT`

### Scenario 3: Edge 캐시 만료 후 Storage HIT
- **Given**: Edge Cache 만료 (24시간 경과). Storage 에는 PDF 존재
- **When**: 요청
- **Then**: Storage 다운로드 → Edge 재캐시 + 응답. 응답 시간 ≤ 1.5초. 헤더 `X-Cache: MISS` (Edge 기준)

### Scenario 4: revision 변경 → 자동 재생성
- **Given**: Lesson 의 `revision_last_updated` 가 `2026-04-25` → `2026-05-01` 로 변경
- **When**: 요청
- **Then**: 새 캐시 키로 cache miss → 동적 생성. 이전 PDF 는 Storage 에 보존 (구버전 리디렉트 위함)

### Scenario 5: Lesson 미존재 — 404
- **Given**: `L999` 가 DB 에 없음
- **When**: `GET /api/teacher/kit/L999`
- **Then**: 404 + `{ error_code: 'LESSON_NOT_FOUND' }`

### Scenario 6: 잘못된 ID 포맷 — 400
- **Given**: `INVALID-ID`
- **When**: `GET /api/teacher/kit/INVALID-ID`
- **Then**: 400 + `{ error_code: 'INVALID_LESSON_ID' }`. DB 조회 0회

### Scenario 7: 동시 50명 요청 — p95 ≤ 2초 (REQ-NF-004)
- **Given**: 캐시 HIT 상태에서 부하 50명 동시
- **When**: k6 부하 테스트 (TS-IT-004)
- **Then**: p95 응답 시간 ≤ 2초

### Scenario 8: 캐시 HIT 비율 ≥ 95%
- **Given**: 1주일간 운영 후
- **When**: 캐시 통계 분석
- **Then**: HIT 비율 ≥ 95% (REQ-NF-049). MISS 는 첫 요청 + revision 변경 시점에 한정

### Scenario 9: 익명 사용자도 다운로드 가능
- **Given**: 세션 없음
- **When**: `GET /api/teacher/kit/L001`
- **Then**: 200 응답 정상. EventLog 에는 user_id=null 인 익명 이벤트 기록 (또는 미기록 — 정책 결정)

### Scenario 10: 한글 파일명 — RFC 5987 인코딩
- **Given**: Lesson title = "화폐의 정의"
- **When**: 응답 헤더 검증
- **Then**: `Content-Disposition: inline; filename="L001_화폐의정의.pdf"; filename*=UTF-8''L001_%ED%99%94%ED%8F%90...` (한글 깨짐 방지)

### Scenario 11: PDF 생성 실패 → 폴백
- **Given**: FW-PDF-002 가 throw (예: 폰트 등록 실패)
- **When**: 요청
- **Then**: FW-PDF-003 의 폴백 로직이 호출되어 최신 캐시 PDF 응답 + Sentry 에러 로그. 사용자는 graceful 응답 받음

## :gear: Technical & Non-Functional Constraints
- **Route Handler 선택 (§3.3)**: 외부 URL 노출 + 캐시 헤더 + 스트리밍 응답 → Server Action 이 아닌 Route Handler 채택
- **2단 캐시 정책**:
  - **L1 (Vercel Edge)**: max-age=3600, s-maxage=86400. 빠른 응답 (≤100ms)
  - **L2 (Supabase Storage)**: revision 키 기반. 영구 보존 (구버전 리디렉트 위함)
- **캐시 키 불변성**: revision_last_updated 가 변경되면 자동 cache miss. 이전 PDF 는 Storage 에 보존되어 FR-PDF-002 의 구버전 리디렉트 활용 가능
- **인증 정책**: 익명 허용 (CC BY-NC-SA 4.0 공공 라이선스). 단 다운로드 통계는 로그인 사용자만 user_id 추적
- **응답 시간 (REQ-NF-004)**:
  - Cache HIT: ≤ 100ms
  - Storage HIT: ≤ 1.5초
  - 동적 생성 (cold): ≤ 5초
  - p95 종합: ≤ 2초 (HIT 비율 95% 가정)
- **스트리밍 응답**: PDF Buffer 를 한 번에 응답 본문에 쓰는 방식. 청크 스트리밍은 PDF 파일 특성상 불필요
- **에러 코드**: `LESSON_NOT_FOUND`, `INVALID_LESSON_ID`, `PDF_GENERATION_FAILED`, `STORAGE_UNAVAILABLE`
- **Storage 권한**: Supabase Storage 의 `teacher-kit` 버킷은 익명 read 허용 (Public bucket). 단 write 는 Service Role Key 만
- **EventLog 발행 정책**: 로그인 사용자 + 익명 사용자 분리 정책
- **금지**:
  - 캐시 키에 timestamp 포함 (cache miss 폭증)
  - 동기 PDF 생성 후 Buffer 통째로 메모리 보유 (대용량 시 메모리 부족)
  - HTML PDF (브라우저 인쇄 변환) 사용 — `@react-pdf/renderer` 만 사용

## :checkered_flag: Definition of Done (DoD)
- [ ] 11개 GWT 시나리오 전부 통과
- [ ] `app/api/teacher/kit/[id]/route.ts` 구현
- [ ] 2단 캐시 (Edge + Storage) 동작 검증
- [ ] revision 변경 시 자동 재생성 검증
- [ ] 동시 50명 부하 p95 ≤ 2초 (TS-IT-004)
- [ ] 캐시 HIT 비율 ≥ 95% (REQ-NF-049)
- [ ] 한글 파일명 RFC 5987 인코딩 정상
- [ ] FW-PDF-003 폴백 통합
- [ ] EventLog `teacher_kit.downloaded` 발행 (로그인 사용자)
- [ ] PR 본문에 "Story 3 의 PDF 다운로드 진입로 + 2단 캐시" 명시
- [ ] OpenAPI 명세 업데이트
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-PDF-001 (Renderer + 폰트)
  - FW-PDF-002 (PDF 템플릿 — 본 라우트가 호출)
  - CT-API-006 (Teacher Kit DTO)
  - CT-DB-003 (Lesson 모델)
  - CT-DB-006 (OxQuestion 모델)
  - CT-DB-007 (TeacherKit 모델)
  - IF-CACHE-001 (PDF 2단 캐시 인프라)
  - IF-SUP-001 (Supabase Storage 버킷 활성화)
- **Blocks**:
  - FR-PDF-002 (구버전 301 리디렉트 — 본 캐시 키 정책 활용)
  - FW-PDF-003 (PDF 폴백 — 본 라우트의 catch 블록 확장)
  - FW-TF-001 (Teacher Feedback — 본 다운로드 후 호출)
  - TS-IT-004 (PDF 부하 테스트)
  - TS-IT-005 (구버전 리디렉트)
  - TS-IT-006 (캐시 폴백 카오스)
  - TS-E2E-007 (장은혜 E2E)
  - **Private Beta 진입** — Story 3 의 핵심 기능 게이트
