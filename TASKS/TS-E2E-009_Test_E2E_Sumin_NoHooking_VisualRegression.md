# [Test] TS-E2E-009: 이수민 시나리오 E2E — 후킹 톤·게임화 부재 시각 회귀 (Story 2 폐쇄)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-E2E-009: 이수민 시나리오 E2E — 모든 페이지 후킹 톤·게임화 효과 부재 시각 회귀"
labels: 'test, e2e, playwright, hooking, story-2, priority:critical, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-E2E-009] Playwright E2E — 모든 핵심 페이지 (랜딩·레슨·스탬프 맵·가입·로그인·교사 PDF) 의 후킹 톤·게임화 효과 부재를 자동화 검증
- **목적**: Story 2 (이수민 · 미디어 노출 피로) 폐쇄의 검증 종착점. TS-STATIC-001 (정적 키워드) 가 1차 방어선이라면 본 태스크는 **렌더된 페이지 전체의 시각·동작 차원에서 후킹 부재를 검증** 하는 2차 방어선. 단순 키워드를 넘어 시각적 자극 (애니메이션·색상·레이아웃) 도 검사. REQ-FUNC-007 (랜딩 톤) + REQ-FUNC-004 (게임화 방지) + 1.2.2 Out-of-Scope (게임화 요소 배제) 통합 검증.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-007 (랜딩 차분 톤), REQ-FUNC-004 (체류 시간 분포 게임화 방지)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-013 (후킹 톤 검출 자동화)
  - `/docs/SRS_V0_9.md#1.2.2` — Out-of-Scope (게임화 요소 배제)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-05 (후킹 금지)
  - `/docs/SRS_V0_9.md#5.1` — TC-007 (랜딩 톤 시각 검증)
- 페르소나: SH-03 이수민 (Q3-A · 30대 직장인 · 미디어 노출 피로 + 후킹 거부감)
- 선행: TS-STATIC-001 (정적 키워드 1차), 모든 UI 컴포넌트 (FR-LES-003·005, FR-STAMP-002, FR-OX-001 등)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `tests/e2e/story-2-sumin-no-hooking.spec.ts` 신규 파일
- [ ] **검사 대상 페이지 6종**:
  - `/` (랜딩)
  - `/lesson/L001` (레슨 시청)
  - `/stamp-map` (스탬프 맵)
  - `/auth/signup` (가입)
  - `/auth/login` (로그인)
  - `/teacher/kit/L001` (교사 PDF 페이지 — TEACHER 컨텍스트)
- [ ] **Step 1 — 텍스트 콘텐츠 검사 (정적 키워드 보완)**:
  - 각 페이지에서 `page.evaluate(() => document.body.innerText)` 로 전체 텍스트 추출
  - 후킹 키워드 50+ 종 (TS-STATIC-001 의 사전 활용) 존재 검증
  - **검출 시 즉시 Fail** + 어느 페이지·어느 섹션인지 리포트
- [ ] **Step 2 — 게임화 시각 효과 부재 검사**:
  - 점수·랭킹·레벨·"+1" 효과·축하 애니메이션 DOM selector 0건 검증
  - 형광색·네온·진동 효과 부재 (CSS computed style 검사)
  - **금지 selector 목록**:
    ```ts
    const forbiddenSelectors = [
      '[class*="score"]', '[class*="rank"]', '[class*="level-up"]',
      '[class*="confetti"]', '[class*="celebration"]', '[class*="bonus"]',
      '[data-game]', '[data-points]'
    ];
    ```
  - 단 단순 카운트 ("10편 중 3편 완료") 는 게임화 아님 (제외)
- [ ] **Step 3 — 색상 톤 검사**:
  - 페이지의 dominant 색상 추출 (`page.screenshot` + 색상 분석 라이브러리, 또는 컴포넌트별 background-color 검사)
  - 형광색·네온 (#FF0000, #00FF00, #FF00FF 등 채도 100% 색상) 부재 검증
  - 차분한 톤 — 회색 계열 + 부드러운 포인트 컬러만
- [ ] **Step 4 — FOMO 요소 부재**:
  - 카운트다운 타이머·"오늘만"·"마지막 기회" 같은 긴박감 UI 부재
  - selector 검사 + 텍스트 검사
- [ ] **Step 5 — 자동 재생·소리 부재**:
  - YouTube iframe 의 `autoplay=0` 검증
  - 페이지 로드 시 자동 사운드 재생 0건
- [ ] **Step 6 — 광고·트래킹 픽셀 부재**:
  - 페이지의 outgoing requests 모니터링 (`page.on('request')`)
  - Google Analytics, Facebook Pixel, ads.* 등 트래킹·광고 도메인 요청 0건 검증
  - 본 검증은 페르소나 신뢰 핵심 (이수민의 미디어 피로 해소)
- [ ] **Step 7 — 차분한 톤 핵심 표현 검증**:
  - 랜딩 페이지의 메인 헤드라인 검사 — 후킹 키워드 0건 + 정보 전달형 톤
  - 예시 표준 헤드라인: "경제를 이해하는 가장 차분한 방법" (의도 명시 + 자극 부재)
- [ ] **Step 8 — 시각 회귀 (선택)**:
  - Playwright `expect(page).toHaveScreenshot()` 활용
  - **본 태스크는 스크린샷 회귀 미사용** — 디자인 변경에 취약. 대신 의미적 검사 (selector + 텍스트) 우선
  - 향후 디자인 시스템 안정화 후 도입 (Public Pilot 후반)
- [ ] **Step 9 — 정리 (afterAll)**:
  - 임시 사용자·세션 정리
- [ ] CI 통합 — IF-CI-004 의 Playwright Job
- [ ] 시나리오 실행 시간 ≤ 90초 (6 페이지 검사)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 PR — 모든 페이지 후킹 부재
- **Given**: 차분한 톤의 정상 PR
- **When**: 6 페이지 모두 검사
- **Then**: 모든 검사 Pass. PR Checks 녹색

### Scenario 2: 랜딩에 "부자 되는 법" 추가 — Fail
- **Given**: 랜딩 헤드라인이 "차분한 경제 학습" → "부자 되는 가장 빠른 길" 로 변경
- **When**: 검사
- **Then**: Step 1 텍스트 검사 검출. Fail. PR 코멘트에 "랜딩 페이지에서 후킹 키워드 '부자' 검출" 명시

### Scenario 3: 스탬프 맵에 "+10점" 효과 추가 — Fail
- **Given**: OX 통과 후 스탬프 맵에 "+10점!" 애니메이션 추가
- **When**: Step 2 게임화 시각 효과 검사
- **Then**: `[class*="score"]` 또는 `[data-points]` selector 검출. Fail

### Scenario 4: 형광 빨강 (#FF0000) 텍스트 추가 — Fail
- **Given**: 어느 페이지에 채도 100% 빨강 텍스트
- **When**: Step 3 색상 톤 검사
- **Then**: 검출 + Fail. 차분한 디자인 토큰 위반

### Scenario 5: 카운트다운 타이머 추가 — Fail
- **Given**: 가입 페이지에 "남은 시간 03:42" 카운트다운
- **When**: Step 4 FOMO 검사
- **Then**: 검출 + Fail

### Scenario 6: YouTube autoplay=1 회귀 — Fail
- **Given**: iframe URL 이 의도적으로 `autoplay=1` 로 변경
- **When**: Step 5 자동 재생 검사
- **Then**: 검출 + Fail. 사용자 의도 우선 정책 위반

### Scenario 7: Google Analytics 추가 — Fail
- **Given**: 트래킹 픽셀 `https://www.google-analytics.com/...` 추가
- **When**: Step 6 outgoing requests 모니터링
- **Then**: 검출 + Fail. 페르소나 신뢰 위반 (이수민의 미디어 피로)

### Scenario 8: 단순 진도 카운트는 제외 (false positive 방지)
- **Given**: 스탬프 맵의 "10편 중 3편 학습 완료" 텍스트
- **When**: Step 2 검사
- **Then**: 본 텍스트는 게임화 아님 → Pass. selector 검사가 텍스트가 아닌 class·data attribute 기반이므로 false positive 부재

### Scenario 9: 6 페이지 모두 검사 + 페이지별 리포트
- **Given**: 의도적 violation 이 3개 페이지에 분산 발생
- **When**: 검사
- **Then**: 페이지별 violation 리스트 + 라인·selector·키워드 명시. 단일 Fail 메시지가 아닌 종합 리포트

### Scenario 10: 시나리오 실행 시간
- **Given**: CI 환경
- **When**: 본 spec 실행
- **Then**: 90초 이내 (6 페이지 × 7 단계 검사)

## :gear: Technical & Non-Functional Constraints
- **TS-STATIC-001 와의 역할 분리**:
  - TS-STATIC-001 (정적 분석) — 코드·시드 파일의 텍스트 키워드만
  - TS-E2E-009 (본 태스크) — **렌더된 페이지의 텍스트 + 시각 효과 + 색상 + 트래킹 + 동적 동작**
  - 두 게이트를 모두 통과해야 후킹 부재 영구 보장
- **시각 회귀 vs 의미 검사 정책**: 본 태스크는 **의미 검사 우선** (selector + 텍스트 + computed style). 스크린샷 회귀는 디자인 변경에 취약하여 보류
- **selector 목록 유지보수**: `tests/e2e/anti-hooking/forbidden-selectors.json` 별도 파일로 관리. PR 리뷰 의무
- **outgoing requests 화이트리스트**:
  - 허용 도메인: `*.youtube.com`, `*.supabase.co`, `*.vercel.app`, `*.googleusercontent.com` (Google Fonts), `*.resend.com`
  - 차단 도메인: `*.google-analytics.com`, `*.googletagmanager.com`, `*.facebook.com`, `*.doubleclick.net`, `*.ads.*`
- **TEACHER 페이지 컨텍스트**: `/teacher/kit/L001` 검사를 위해 TEACHER 픽스처 + 로그인 단계 포함
- **flaky 방지**: outgoing requests 는 페이지 완전 로드 후 측정 (`page.waitForLoadState('networkidle')`)
- **재시도 정책**: Playwright `retries: 1`
- **금지**:
  - 스크린샷 회귀 사용 (디자인 변경 시 false positive 폭증)
  - 임의 sleep
  - 프로덕션 DB 사용

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `tests/e2e/story-2-sumin-no-hooking.spec.ts` 구현
- [ ] 6 페이지 × 7 단계 검사 동작
- [ ] outgoing requests 화이트리스트 검증
- [ ] forbidden selectors 목록 + 분기별 갱신 정책
- [ ] CI (IF-CI-004) 자동 실행
- [ ] 시나리오 실행 시간 ≤ 90초
- [ ] flaky 검증 — 동일 spec 10회 연속 실행 통과
- [ ] **Story 2 폐쇄** — 본 spec + TS-STATIC-001 양 게이트 통과 시 후킹 부재 영구 보장
- [ ] PR 본문에 "Story 2 폐쇄 + 후킹 부재 이중 방어선 2차" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - TS-STATIC-001 (정적 키워드 1차 — 키워드 사전 공유)
  - 모든 UI 컴포넌트 (FR-LES-003·004·005, FR-STAMP-002, FR-OX-001)
  - FR-PDF-001 (교사 PDF 페이지)
  - 디자인 토큰 (차분한 색상 팔레트 정의)
  - CT-MOCK-002 (TEACHER 픽스처)
- **Blocks**:
  - **Story 2 폐쇄** — 모든 5개 Story 의 마지막
  - REQ-FUNC-007 (랜딩 톤 차분) 영구 회귀 방지
  - REQ-FUNC-004 (게임화 방지) 영구 회귀 방지
  - **Public Pilot 진입 준비** — Story 모두 폐쇄
- **Related**:
  - PRD 원칙 1 (이해 우선) 영구 회귀 방지 안전망
