# [Feature] FR-LES-003: 레슨 시청 페이지 — YouTube iframe + 매체 전환 UI

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-LES-003: 레슨 시청 페이지 — YouTube iframe 임베디드 + 매체 전환 (영상↔글) UI"
labels: 'feature, frontend, lesson, accessibility, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-LES-003] 레슨 시청 페이지 (`/lesson/[id]`) RSC + Client Component — YouTube 임베디드 플레이어 + "글로 읽기" 토글로 영상↔스크립트 전환 UI
- **목적**: Story 1 (박지훈) · Story 5 (한정숙·김성호) 의 핵심 학습 화면. UC-01 (레슨 시청) + UC-05 (매체 전환) 동시 충족. ADR-005 (유튜브 단독) 강제, REQ-FUNC-026 (매체 전환), REQ-FUNC-035 (유튜브 임베디드만) 의 클라이언트 구현체. shadcn/ui (Radix 기반) 활용으로 키보드·스크린 리더 접근성을 기본 충족 (REQ-NF-037).

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.5` — REQ-FUNC-026 (글로 읽기 토글)
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-035 (유튜브 임베디드만)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-002 (LCP p95 ≤1.5s), REQ-NF-005 (매체 전환 p95 ≤300ms)
  - `/docs/SRS_V0_9.md#4.2.6` — REQ-NF-034 (색 대비 4.5:1), REQ-NF-037 (키보드 100%)
  - `/docs/SRS_V0_9.md#3.5.2` — UC-01, UC-05
  - `/docs/SRS_V0_9.md#3.6.2` — Web Client 컴포넌트 (Tailwind + shadcn/ui)
  - `/docs/SRS_V0_9.md#1.5.1.2` — C-TEC-004 (Tailwind + shadcn/ui)
- 시퀀스 다이어그램: `/docs/SRS_V0_9.md#3.4.1` (OX 제출 흐름)
- 선행 결정: shadcn/ui Radix 기반으로 접근성 기본 충족

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/lesson/[id]/page.tsx` RSC 페이지 — `params.id` 검증 + `fetch('/api/lesson/[id]')` 또는 직접 Prisma 호출 (RSC 내부)
- [ ] `app/lesson/[id]/components/LessonPlayer.tsx` Client Component — YouTube iframe 임베디드
- [ ] iframe URL — `https://www.youtube.com/embed/{youtubeVideoId}?cc_load_policy=1&modestbranding=1` (자막 기본 ON · REQ-FUNC-022)
- [ ] iframe `title` 속성 — 레슨 제목 (스크린 리더 호환)
- [ ] 매체 전환 토글 — shadcn/ui `Switch` 컴포넌트 사용 (Radix 기반 — 키보드·ARIA 자동)
- [ ] "글로 읽기" 모드 — `script` 필드를 `<article>` 안에 렌더. Markdown 또는 HTML 형식 지원
- [ ] 토글 상태 영속화 — `User.mediaPreference` 컬럼 + 로컬 영속화 (localStorage 보조). 단 사용자 명시적 변경 시만 저장 (FW-AUTH-005 활용)
- [ ] 레슨 제목 + 모듈명 + 개정일 헤더 표시 (REQ-FUNC-015 클라이언트 측 표시)
- [ ] CC BY-NC-SA 4.0 라이선스 푸터 명시 (REQ-FUNC-037 의 3곳 중 1곳)
- [ ] 글자 크기 조절 토글은 별도 컴포넌트로 분리 (FR-LES-004 의 책임)
- [ ] 자체 영상 호스팅 경로 절대 미사용 (ADR-005). iframe src 는 youtube.com 도메인만 허용
- [ ] **YouTube iframe API** 통합 — 재생 위치 추적 (FW-PROG-002 의 의존). `onStateChange` 이벤트로 currentTime 추출
- [ ] **404 처리** — Lesson 미존재 시 `notFound()` 호출하여 Next.js 기본 404 페이지로 리다이렉트
- [ ] 로딩 상태 — RSC `loading.tsx` 파일로 streaming UI 처리
- [ ] 에러 경계 — `error.tsx` 파일로 5xx 발생 시 graceful fallback

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 영상 모드 정상 렌더 (기본)
- **Given**: 사용자가 `/lesson/L001` 접근. mediaPreference = 'MIXED' (기본)
- **When**: 페이지 로드
- **Then**: YouTube iframe 이 렌더되고, `cc_load_policy=1` 로 자막 자동 ON. 토글은 "영상" 상태

### Scenario 2: "글로 읽기" 토글 — 매체 전환
- **Given**: 영상 모드에서 사용자가 토글 클릭
- **When**: 토글이 OFF → ON
- **Then**: iframe 가 사라지고 `<article>` 안에 `script` 필드 렌더. 전환 시간 p95 ≤ 300ms (REQ-NF-005). YouTube iframe 은 unmount 되어 백그라운드 재생 중단

### Scenario 3: 토글 상태 영속화
- **Given**: 사용자가 "글로 읽기" 모드 선택
- **When**: 명시적 저장 액션 (자동 저장 또는 명시적 버튼)
- **Then**: `User.mediaPreference = 'TEXT'` 업데이트 (FW-AUTH-005 호출). 다음 로그인 시 글 모드로 자동 시작

### Scenario 4: LCP p95 ≤ 1.5s 달성
- **Given**: 신규 방문자 첫 페이지 로드
- **When**: Lighthouse 측정 (TS-LOAD-003)
- **Then**: LCP p95 ≤ 1500ms. iframe 은 lazy load (intersection observer 또는 `loading="lazy"`)

### Scenario 5: 키보드 네비게이션 100%
- **Given**: 마우스 미사용 사용자가 Tab 키로 네비게이션
- **When**: Tab 키 반복 입력
- **Then**: 헤더 → 토글 → iframe (또는 article) → 푸터 순서로 포커스 이동. iframe 내부는 YouTube 의 자체 키보드 네비게이션 활용. 토글은 Space/Enter 로 활성화 가능 (Radix 기본)

### Scenario 6: 색 대비 ≥ 4.5:1
- **Given**: 페이지 전체
- **When**: axe-core CI 검사 (TS-A11Y-001)
- **Then**: 모든 텍스트 색 대비 ≥ 4.5:1. Violation 0건

### Scenario 7: 자막 기본 ON 검증 (REQ-FUNC-022)
- **Given**: 페이지 로드
- **When**: iframe URL 검증
- **Then**: `cc_load_policy=1` 파라미터 확인. iframe 로드 직후 자막 ON 상태로 시작

### Scenario 8: 자체 영상 호스팅 경로 부재 (ADR-005)
- **Given**: LessonPlayer 컴포넌트 코드
- **When**: 정적 분석 (TS-STATIC-001)
- **Then**: `<video>` 태그 0건. iframe `src` 가 youtube.com 도메인만 허용 (`https://www.youtube.com/embed/...`)

### Scenario 9: 잘못된 lesson_id — 404
- **Given**: `/lesson/L999` 접근 (DB 에 없음)
- **When**: 페이지 로드
- **Then**: Next.js 404 페이지 표시. iframe 또는 article 렌더 안함

### Scenario 10: YouTube iframe API 통합 — currentTime 추출
- **Given**: 사용자가 영상 재생 중 30초 시점
- **When**: FW-PROG-002 의 `usePositionSync` 훅이 currentTime 요청
- **Then**: iframe API 의 `getCurrentTime()` 으로 30초 값 반환. 본 hook 으로 saveProgress 호출

## :gear: Technical & Non-Functional Constraints
- **shadcn/ui 강제 (C-TEC-004)**: 토글·버튼·다이얼로그는 shadcn/ui 컴포넌트만 사용. 자체 UI 라이브러리 도입 금지
- **YouTube 임베디드 강제 (ADR-005, REQ-FUNC-035)**: iframe src 는 youtube.com 도메인만. `<video>`, `<audio>`, 자체 CDN URL 절대 금지
- **자막 기본 ON (REQ-FUNC-022)**: `cc_load_policy=1` 파라미터 필수
- **lazy load**: iframe 은 viewport 진입 시점에 로드 (`loading="lazy"` 또는 IntersectionObserver) — LCP 영향 최소화
- **매체 전환 즉시성 (REQ-NF-005)**: script 데이터는 페이지 로드 시 RSC 가 미리 fetch 해 둠. 토글은 클라이언트 상태만 변경
- **접근성 기본 (REQ-NF-037)**: shadcn/ui Switch 가 Radix 기반이므로 키보드 + ARIA 기본 충족
- **iframe title 속성**: 스크린 리더가 iframe 내용을 인식하기 위한 title 속성 필수 (axe-core 검출)
- **CSP**: Content-Security-Policy 헤더에 `frame-src youtube.com www.youtube.com` 명시. 다른 도메인 iframe 차단
- **YouTube iframe API 의존 최소**: 정식 IFrame Player API 만 사용 (`https://www.youtube.com/iframe_api`). 비공식 API 또는 스크래핑 금지
- **글자 크기 조절은 별도 컴포넌트** (FR-LES-004): 본 태스크는 매체 전환 토글만 다룸. 글자 크기는 별도 의존
- **금지**: 자동 재생 (autoplay) 사용 금지 — 사용자 의도 우선 (P5 깊이·접근성)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `app/lesson/[id]/page.tsx` 와 `LessonPlayer.tsx` 구현
- [ ] YouTube iframe + 매체 전환 토글 동작 확인
- [ ] Lighthouse LCP p95 ≤ 1.5s 측정 (TS-LOAD-003)
- [ ] axe-core 검사 색 대비·키보드·ARIA 모두 통과 (TS-A11Y-001)
- [ ] iframe `title` 속성 + `cc_load_policy=1` 파라미터 검증
- [ ] CSP 헤더에 youtube 도메인 화이트리스트 적용
- [ ] 정적 분석 — `<video>` 태그 0건, 비유튜브 iframe src 0건 (TS-STATIC-001)
- [ ] TS-E2E-001 (박지훈 시나리오 — 시청 → OX 통과) 의 시청 단계 통과
- [ ] TS-E2E-003 (한정숙 시나리오 — 매체 전환) 통과
- [ ] PR 본문에 "Story 1·5 의 학습 화면 진입로, ADR-005 강제" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-LES-001 (`/api/lesson/{id}` API — 데이터 공급원)
  - FW-AUTH-005 (mediaPreference 영속화)
  - CT-MOCK-001 (Lesson 시드)
  - 시각 자산 — 디자인 토큰 (색 팔레트, 타이포) — 별도 디자인 시스템 정의
- **Blocks**:
  - FR-LES-004 (글자 크기 조절 토글 — 본 페이지에 통합)
  - FR-LES-005 (OX 오답 앵커 스크롤 — script 영역 스크롤)
  - FW-PROG-002 (10초 위치 동기화 — YouTube iframe API 의존)
  - FR-OX-001 (OX UI — 본 페이지 하단에 렌더)
  - TS-E2E-001, TS-E2E-002, TS-E2E-003 (Story 1·4·5 E2E)
  - TS-LOAD-003 (Lighthouse LCP 측정 대상 페이지)
