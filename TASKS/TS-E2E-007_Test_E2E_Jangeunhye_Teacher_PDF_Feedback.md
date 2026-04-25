# [Test] TS-E2E-007: 장은혜 시나리오 E2E (Playwright) — 교사 로그인 → PDF 다운로드 → 피드백 제출

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-E2E-007: 장은혜 시나리오 E2E — TEACHER 로그인 → PDF 다운로드 (QR·한글 폰트 검증) → submitTeacherFeedback(will_reuse=true) → 운영자 알림"
labels: 'test, e2e, playwright, story-3, private-beta-gate, priority:critical, mvp-in, private-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-E2E-007] Playwright E2E — Story 3 (장은혜 · 중학 사회 36세) 의 전체 사이클을 자동화 검증
- **목적**: Story 3 폐쇄의 검증 종착점이며 **Private Beta Exit 게이트의 자동화 안전망**. 본 시나리오는 단순 happy path 가 아니라, Story 3 의 4가지 핵심 AC 를 한 번에 검증한다 — (1) 교사 로그인 (RBAC TEACHER), (2) PDF 다운로드 (QR + 한글 폰트), (3) `submitTeacherFeedback(will_reuse=true)`, (4) 운영자 알림 발송. 통과 시 REQ-NF-046 (재사용 의사 ≥10명) 누적 카운트가 +1 증가한다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-013, 015, 016, 019 (Story 3 핵심 AC)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-021 (RBAC), REQ-NF-046 (재사용 의사)
  - `/docs/SRS_V0_9.md#3.4.2` — 교안 PDF 다운로드 시퀀스
  - `/docs/SRS_V0_9.md#3.5.2` — UC-07, UC-08
  - `/docs/SRS_V0_9.md#5.1` — TC-013, TC-019, TC-021 (PDF·QR·재사용 의사)
  - `/docs/SRS_V0_9.md#1.2.3` — 파일럿 4구간 (Private Beta Exit 조건)
  - `/docs/SRS_V0_9.md#6.6` — R2 (교사 신뢰 미확보 — Private Beta 노출)
- 페르소나: SH-05 장은혜 (중학 사회 교사 36세 · P14·P13)
- 선행 구현: FW-AUTH-003, FR-PDF-001, FW-PDF-002, FW-TF-001, CT-MOCK-002 (TEACHER 시드)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `tests/e2e/story-3-eunhye.spec.ts` 신규 파일
- [ ] beforeAll — TEACHER 역할 테스트 사용자 시드 (Supabase Auth admin API 로 이메일 확인 + role='TEACHER' 설정)
  - `tests/fixtures/story-3.ts` 에 TEACHER 픽스처 분리
- [ ] **Step 1 — TEACHER 로그인**:
  - `/auth/login` 진입 (또는 별도 교사 진입 페이지)
  - 이메일·비밀번호 입력
  - 로그인 후 보호된 라우트 접근 가능 검증 (`/teacher/*` 또는 `/lessons`)
  - 세션 쿠키 발급 확인 (HttpOnly 검증)
- [ ] **Step 2 — Lesson 진입 + Teacher Kit 다운로드 페이지 접근**:
  - `/lesson/L001` 또는 `/teacher/kit/L001` 접근
  - "교안 PDF 다운로드" 버튼 가시성 확인 (TEACHER 만 노출)
- [ ] **Step 3 — PDF 다운로드 + 검증**:
  - 다운로드 버튼 클릭 → `GET /api/teacher/kit/L001` 호출
  - 응답 헤더 검증 — `Content-Type: application/pdf`, `Content-Disposition: inline; filename="L001_..."` (한글 RFC 5987)
  - PDF 파일 다운로드 후 파일 크기 측정 (≤ 2MB 목표 — REQ-NF-004 의 다운로드 시간 한도)
  - **PDF 콘텐츠 검증**:
    - `pdf-parse` 또는 `pdfjs-dist` 라이브러리로 텍스트 추출
    - 레슨 ID `L001` 텍스트 포함 검증
    - 개정일 (`revision_last_updated`) 텍스트 포함 검증
    - CC BY-NC-SA 4.0 라이선스 텍스트 포함 검증
    - **한글 글리프 정상 렌더링** — 빈 박스(▢) 0건. 추출 텍스트에 정상 한글 포함
  - **QR 코드 검증** (선택 — pdfjs 로 이미지 추출 후 `qrcode-reader` 로 스캔):
    - PDF p.1 의 QR 이미지 추출
    - QR 디코드 결과가 유튜브 URL (`https://youtu.be/{id}` 또는 `https://www.youtube.com/watch?v={id}`) 와 일치
- [ ] **Step 4 — 피드백 폼 진입**:
  - PDF 다운로드 후 피드백 폼으로 이동 (또는 모달 노출)
  - 폼 필드 가시성 확인 — `will_reuse` (checkbox 또는 radio), `used_in_class` (checkbox), `comment` (textarea)
- [ ] **Step 5 — 피드백 제출 (will_reuse=true)**:
  - `will_reuse=true` 선택
  - `used_in_class=true` 선택
  - `comment` 입력 ("학생 반응 좋음. 추후 재사용 예정")
  - 제출 버튼 클릭 → `submitTeacherFeedback()` Server Action 호출
  - 응답 확인 — `{ ok: true, feedback_id: '...' }`
  - DB 검증 — `prisma.teacherFeedback.findFirst({ where: { teacherId: ..., lessonId: 'L001', willReuse: true } })` 존재
- [ ] **Step 6 — 운영자 알림 발송 검증**:
  - Resend 통합 모킹 또는 Inbox 검증 (테스트 환경에서는 Resend 의 sandbox 모드 사용 권장)
  - **본 Step 은 Resend mock 검증 위주** — 실제 메일 발송 검증은 통합 테스트에서 분리 (TS-IT-016)
  - Server Action 응답 후 `expect(resendMock).toHaveBeenCalled()` 검증
- [ ] **Step 7 — REQ-NF-046 누적 카운트 검증**:
  - `prisma.teacherFeedback.count({ where: { willReuse: true } })` 호출
  - 카운트가 +1 증가 검증
  - 이는 Private Beta Exit 게이트 진척도의 데이터 검증
- [ ] **Step 8 — 정리 (afterAll)**:
  - TeacherFeedback + User (TEACHER) 삭제
  - PDF 파일 임시 저장 위치 cleanup
- [ ] CI 통합 — IF-CI-004 의 Playwright Job 추가 (Story 3 게이트 항목)
- [ ] 시나리오 실행 시간 ≤ 75초 목표 (PDF 생성 5초 cold start 포함)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 전체 사이클 정상 통과 (Happy Path)
- **Given**: 클린 DB + Lesson L001 시드 + OxQuestion 5개 + TEACHER 픽스처
- **When**: Step 1~7 순차 실행
- **Then**: 각 단계 모두 통과. 최종 DB 상태 — TeacherFeedback 1건 (will_reuse=true) + Resend mock 1회 호출. REQ-NF-046 누적 카운트 +1

### Scenario 2: PDF 한글 폰트 정상 렌더 (FW-PDF-001 검증)
- **Given**: Step 1~3 실행
- **When**: 다운로드된 PDF 의 텍스트 추출
- **Then**: 한글 글리프 정상. 빈 박스(▢) 0건. "경제 판단력 교과서" "이 차시 이해 목표" 등의 한글 정상 추출

### Scenario 3: PDF QR 코드 스캔 (REQ-FUNC-019)
- **Given**: 다운로드된 PDF
- **When**: pdfjs 로 QR 이미지 추출 + `qrcode-reader` 로 디코드
- **Then**: 디코드 결과가 유튜브 URL. `youtube_video_id` 와 일치

### Scenario 4: 개정일 + CC 라이선스 자동 삽입 (REQ-FUNC-015·037)
- **Given**: 다운로드된 PDF 의 추출 텍스트
- **When**: 검증
- **Then**: 개정일 (`revision_last_updated`, YYYY-MM-DD 형식) 포함 + "CC BY-NC-SA 4.0" 텍스트 포함

### Scenario 5: TEACHER RBAC — LEARNER 시도 차단
- **Given**: 동일 spec 의 변형 — LEARNER 역할 사용자 픽스처
- **When**: `submitTeacherFeedback()` 호출 시도
- **Then**: 403 응답. DB INSERT 0건. INV-07 강제 검증

### Scenario 6: 운영자 알림 발송 (will_reuse=true)
- **Given**: Step 5 의 will_reuse=true 제출
- **When**: Server Action 응답 후
- **Then**: Resend mock 1회 호출. 메일 본문에 leson_id + teacher 닉네임 포함

### Scenario 7: 재제출 허용
- **Given**: Step 1~6 완료 후 (TeacherFeedback 1건 존재)
- **When**: 동일 lesson 에 will_reuse=false 로 재제출
- **Then**: TeacherFeedback 새 row INSERT (총 2건). 집계 시 가장 최근 (will_reuse=false) 반영 → 재사용 의사 카운트 변동 없음 (이미 카운트된 1건 유지 vs 정정 — 정책 결정 필요)

### Scenario 8: PDF 다운로드 응답 시간 (REQ-NF-004)
- **Given**: 캐시 HIT 상태
- **When**: PDF 다운로드
- **Then**: 응답 시간 ≤ 2초 (p95)

### Scenario 9: 시나리오 실행 시간
- **Given**: CI 환경
- **When**: 본 spec 단독 실행
- **Then**: 75초 이내 완료 (PDF cold start 5초 포함)

### Scenario 10: 시나리오 격리
- **Given**: 본 spec 종료 직후
- **When**: TS-E2E-001, TS-E2E-002 실행
- **Then**: 본 테스트가 만든 데이터 잔여 0. spec 간 충돌 0

## :gear: Technical & Non-Functional Constraints
- **PDF 콘텐츠 검증**: `pdf-parse` 또는 `pdfjs-dist` 라이브러리 활용. 텍스트 추출 후 정규식 매칭 + 한글 인코딩 검증
- **QR 코드 검증 (선택)**: pdfjs 로 이미지 추출 + `qrcode-reader` 로 디코드. 본 검증은 시간 소요라 별도 spec 분리 가능 (TS-E2E-008)
- **Resend mock 정책**: 테스트 환경에서는 Resend Sandbox API 활용 또는 `vi.mock()` 으로 발송 호출만 검증. 실제 메일은 발송 안함
- **테스트 격리**: `test-eunhye-{timestamp}@example.com` 형식 동적 사용자 생성. 병렬 실행 시 충돌 0
- **시드 데이터**: TEACHER 픽스처 + Lesson L001 + OxQuestion 5개 + 정상 PDF 캐시 1건 (선택)
- **데이터 정리**: afterAll 에서 Prisma 직접 호출로 TeacherFeedback + User 삭제. Supabase Auth 사용자도 admin API 로 삭제
- **선택자 정책**: data-testid 우선. 한글 텍스트 매칭은 회귀 위험 (한글 띄어쓰기 변경에 취약)
- **재시도 정책**: Playwright `retries: 1`. PDF cold start 변동성 고려
- **CI 비용**: PDF 생성 + 검증으로 다른 E2E 보다 시간 소요. CI 비용 모니터링
- **금지**:
  - 실제 Resend API 호출 (테스트 비용 + 운영자 메일 폭증)
  - 실제 YouTube 영상 재생 시도
  - 임의 sleep
  - 프로덕션 DB 사용

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `tests/e2e/story-3-eunhye.spec.ts` 구현 완료
- [ ] PDF 텍스트 추출 + 한글·개정일·CC 라이선스 검증
- [ ] QR 코드 디코드 검증 (또는 별도 spec 으로 분리)
- [ ] Resend mock 발송 검증
- [ ] REQ-NF-046 누적 카운트 +1 증가 검증
- [ ] LEARNER 시도 차단 (Scenario 5) 검증
- [ ] CI (IF-CI-004) 자동 실행
- [ ] 시나리오 실행 시간 ≤ 75초
- [ ] flaky 검증 — 동일 spec 10회 연속 실행 통과
- [ ] **Story 3 폐쇄** — 본 spec 통과 시 Story 3 학습 루프 자동화 검증 완성
- [ ] **Private Beta Exit Gate 진입** — "교사 재사용 의사 1건 이상" 의 자동화 검증
- [ ] PR 본문에 "Story 3 폐쇄 + Private Beta Exit 게이트 자동화" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-AUTH-003 (로그인)
  - FR-AUTH-002 (RBAC 가드 — TEACHER 검증)
  - FR-PDF-001 (PDF 다운로드 API)
  - FW-PDF-001 (Renderer + 폰트)
  - FW-PDF-002 (PDF 템플릿)
  - FW-TF-001 (Teacher Feedback Server Action)
  - CT-MOCK-002 (TEACHER 픽스처 시드)
  - IF-RES-001 (Resend Setup — 운영자 알림 mock)
- **Blocks**:
  - **Private Beta Exit Gate** — Story 3 의 자동화 안전망
  - TS-E2E-008 (PDF QR 스캔 별도 spec — 본 spec 분리 시)
  - REQ-NF-046 (재사용 의사 ≥10명) 누적 추적의 신뢰성
- **Related**:
  - SRS Story 3 의 모든 AC
  - PRD Stage 1 마일스톤 (Private Beta 진입 조건)
