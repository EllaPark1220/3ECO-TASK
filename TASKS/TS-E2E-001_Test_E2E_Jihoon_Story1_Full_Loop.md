# [Test] TS-E2E-001: 박지훈 시나리오 E2E (Playwright) — Story 1 전체 학습 루프

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-E2E-001: 박지훈 시나리오 E2E (Playwright) — 가입 → 시청 → OX 통과 → 스탬프 맵 반영"
labels: 'test, e2e, playwright, story-1, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-E2E-001] Playwright E2E 테스트 — Story 1 (박지훈) 의 전체 학습 루프를 단일 시나리오로 검증
- **목적**: Alpha Exit 통합 게이트 (§6.7) 의 핵심 항목. SRS Story 1 의 Acceptance Criteria 6건 (REQ-FUNC-001~006) 을 자동화된 피드백 루프로 변환하며, 본 시나리오 통과 여부가 Alpha → Private Beta 진입의 단일 기준이다. UC-01 + UC-02 + UC-03 + UC-06 (가입) 동시 검증.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-001~006 전체 AC
  - `/docs/SRS_V0_9.md#3.5.2` — UC-01·02·03 시나리오
  - `/docs/SRS_V0_9.md#5.1` — TC-001~006
  - `/docs/SRS_V0_9.md#6.7` — Alpha Exit 통합 게이트
  - `/docs/SRS_V0_9.md#1.2.3` — 파일럿 4구간 (Alpha Exit 조건)
- 페르소나: SH-01 박지훈 (Q1-A · 개발자 27세 · P1 체계감 Pain)
- 선행 구현: FW-AUTH-002, FW-AUTH-003, FR-LES-003, FW-PROG-001, FW-OX-001, FW-OX-002, FR-STAMP-002

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `tests/e2e/story-1-jihoon.spec.ts` 신규 파일
- [ ] Playwright 설정 — `playwright.config.ts` 에 baseURL = Vercel Preview URL 또는 localhost
- [ ] beforeAll — 테스트용 사용자 시드 (Supabase Auth admin API 로 이메일 확인 완료 상태 사용자 생성)
- [ ] **Step 1 — 가입 또는 로그인**:
  - `/auth/signup` 접근
  - 이메일·닉네임·비밀번호 입력
  - 가입 후 이메일 확인 (테스트 환경에서는 Supabase admin API 로 자동 confirm 또는 사전 시드 사용자 활용)
  - `/auth/login` 에서 로그인
  - `/lessons` 또는 `/stamp-map` 으로 리다이렉트 확인
- [ ] **Step 2 — 레슨 시청 시작**:
  - 스탬프 맵에서 L001 카드 클릭
  - `/lesson/L001` 페이지 로드 확인
  - YouTube iframe 렌더 확인 (DOM 존재)
  - 자막 ON 검증 (`cc_load_policy=1`)
- [ ] **Step 3 — 진도 저장 검증**:
  - 시청 시뮬레이션 (Playwright 가 YouTube iframe 내부 제어 어려우므로, 직접 `saveProgress()` Server Action 을 페이지의 hidden API 또는 `evaluate()` 로 호출)
  - 30초 위치 저장 → DB 검증 (Prisma 직접 또는 API GET)
- [ ] **Step 4 — OX 제출**:
  - 스크롤하여 OX 영역 진입
  - 5문항 모두 정답 선택 (테스트 픽스처의 OxQuestion correct_answer 와 일치하는 답안)
  - "제출" 버튼 클릭
  - 응답 확인 — `passed: true` 결과 UI 노출
- [ ] **Step 5 — 스탬프 맵 반영 검증** (REQ-NF-003 p95 ≤500ms):
  - `/stamp-map` 으로 이동 (또는 동일 페이지 stamp map 영역 mutate)
  - L001 카드가 grayscale → 펄 그라데이션 전환 확인 (DOM class 또는 aria-label 변화)
  - 카운트 "10편 중 1편 학습 완료" 텍스트 검증
- [ ] **Step 6 — 멱등성 검증** (Bonus, REQ-FUNC-006):
  - 재시도 버튼 또는 동일 OX 재제출 시도
  - 새 Stamp 가 발급되지 않음 (DB 카운트 1 그대로) 검증
  - UI 응답은 첫 응답과 동일 (`passed: true`) 확인
- [ ] **Step 7 — 정리 (afterAll)**:
  - 테스트 사용자·LessonProgress·Stamp 삭제
  - 테스트 격리 보장
- [ ] CI 통합 — IF-CI-004 의 Playwright Job 에서 본 spec 자동 실행
- [ ] 시나리오 실행 시간 ≤ 90초 목표

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 전체 학습 루프 정상 통과 (Happy Path)
- **Given**: 클린 DB + Lesson L001 시드 + OxQuestion 5개 시드
- **When**: Step 1~6 순차 실행
- **Then**: 각 단계가 모두 통과. 최종 DB 상태 — User 1건 + LessonProgress 1건 (oxCompleted=true) + Stamp 1건. 스탬프 맵 UI 에 펄 그라데이션 표시

### Scenario 2: OX 오답 → 정답 재시도
- **Given**: Step 1~3 완료
- **When**: Step 4 에서 1문항 오답 → Step 4 재시도 (전 정답)
- **Then**: 첫 시도는 `passed: false` + 앵커 스크롤 검증. 재시도는 `passed: true`. Stamp 1건 발급

### Scenario 3: 멱등성 (Step 6 검증)
- **Given**: Stamp 발급 완료 상태
- **When**: 동일 OX 재제출
- **Then**: 응답은 동일 페이로드. DB Stamp 카운트 1 그대로

### Scenario 4: 미로그인 시 리다이렉트
- **Given**: 세션 없음
- **When**: `/lesson/L001` 직접 접근
- **Then**: `/auth/login?returnTo=/lesson/L001` 으로 리다이렉트

### Scenario 5: 자율 선택 — L003 직접 클릭 (ADR-003)
- **Given**: 신규 사용자 (스탬프 0건)
- **When**: 스탬프 맵에서 L003 클릭 (L001·L002 미수강)
- **Then**: `/lesson/L003` 정상 진입. 잠금·차단 0건

### Scenario 6: 시나리오 실행 시간
- **Given**: CI 환경
- **When**: 본 spec 단독 실행
- **Then**: 90초 이내 완료. 90초 초과 시 timeout

### Scenario 7: 시나리오 격리
- **Given**: 본 spec 가 실행되고 종료된 직후
- **When**: 다른 spec 실행
- **Then**: 본 테스트가 만든 사용자·진도·스탬프 데이터가 잔여하지 않음 (afterAll 삭제 검증)

## :gear: Technical & Non-Functional Constraints
- **Playwright 환경**: 최신 안정 버전. Chromium·Firefox·Safari 3브라우저 동시 검증 (CI 비용 고려 — Alpha 는 Chromium 만, Closed Beta 에서 확장)
- **YouTube iframe 핸들링**: iframe 내부는 cross-origin 이라 Playwright 로 직접 제어 불가. **재생 위치 저장은 페이지의 클라이언트 코드를 `evaluate()` 로 호출하여 모킹** 또는 **YouTube IFrame API 의 postMessage 시뮬레이션**
- **테스트 격리**: 각 spec 실행 시 독립적인 사용자 (예: `test-jihoon-{timestamp}@example.com`) 생성. 병렬 실행 시 충돌 0
- **시드 데이터**: Lesson L001 + OxQuestion 5개 + User 픽스처는 `tests/fixtures/story-1.ts` 로 분리
- **데이터 정리**: afterAll 에서 Prisma 직접 호출로 Stamp + LessonProgress + User 삭제. Supabase Auth 사용자도 admin API 로 삭제
- **선택자 정책**: data-testid 우선. CSS 셀렉터 + 텍스트 매칭은 회귀 위험. 본 spec 의 UI 의존도 최소화
- **시각 회귀 검증**: 스탬프 맵의 grayscale → 펄 전환은 시각적이지만, 구현 검증은 DOM class 또는 aria-label 사용 (스크린샷 비교는 Closed Beta)
- **재시도 정책**: flaky test 방지를 위해 Playwright `retries: 1` (1회 재시도 허용). 2회 연속 실패 시 진짜 실패
- **금지**:
  - `page.waitForTimeout(N)` 같은 임의 sleep 금지. `expect().toBeVisible()` 자동 retry 활용
  - 실제 YouTube 영상 재생 시도 (네트워크 의존성 + 시간 소요)
  - 프로덕션 DB 사용

## :checkered_flag: Definition of Done (DoD)
- [ ] 7개 GWT 시나리오 전부 통과
- [ ] `tests/e2e/story-1-jihoon.spec.ts` 구현 완료
- [ ] CI (IF-CI-004 Playwright Job) 에서 자동 실행
- [ ] 시나리오 실행 시간 ≤ 90초
- [ ] 테스트 격리 검증 — 두 번 연속 실행 시 두 번 다 통과
- [ ] data-testid 기반 선택자 사용 (CSS·텍스트 의존 최소)
- [ ] **Alpha Exit 게이트 진입** — 본 테스트가 통과하면 §6.7 통합 게이트의 "Story 1 E2E 1회 통과" 항목 체크
- [ ] flaky 검증 — 동일 spec 10회 연속 실행 통과
- [ ] PR 본문에 "본 테스트 통과는 Alpha → Private Beta 진입의 단일 핵심 기준" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-AUTH-002 (회원가입)
  - FW-AUTH-003 (로그인)
  - FR-LES-001 (레슨 API)
  - FR-LES-003 (레슨 시청 페이지)
  - FW-PROG-001 (진도 저장)
  - FW-OX-001 (OX 채점 본체)
  - FW-OX-002 (P2002 멱등 변환)
  - FR-OX-001 (OX UI)
  - FR-STAMP-001 (스탬프 맵 API)
  - FR-STAMP-002 (스탬프 맵 시각화)
  - CT-MOCK-001 (Lesson 시드)
- **Blocks**:
  - **Alpha Exit Gate** — §6.7 Appendix E 통합 게이트 4건 중 1건
  - TS-E2E-002 (오세은 E2E — 본 시나리오 인프라 재사용)
  - IF-CI-004 (Playwright CI Job — 본 spec 이 첫 번째 게이트 항목)
- **Related**:
  - SRS Story 1 의 모든 AC
