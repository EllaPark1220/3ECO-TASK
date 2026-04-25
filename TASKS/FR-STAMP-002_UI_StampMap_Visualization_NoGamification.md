# [Feature] FR-STAMP-002: 진주 스탬프 맵 시각화 — p95 ≤500ms + 자율 선택 + 게임화 방지

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-STAMP-002: 진주 스탬프 맵 시각화 컴포넌트 — p95 ≤500ms 렌더 + 자율 선택 (순서 강제 없음)"
labels: 'feature, frontend, stamp-map, accessibility, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-STAMP-002] 진주 스탬프 맵 시각화 React 컴포넌트 — 사용자별 학습 궤적을 시각적으로 렌더, 임의 lesson_id 클릭으로 자율 선택 허용
- **목적**: Story 1 (박지훈) 의 가시화 종착점. P1 체계감 부재 Pain 해소의 핵심 UI. UC-03 (스탬프 맵 조회) 의 클라이언트 구현체이며, ADR-003 (순서 강제 폐기) · INV-10 (자율 선택) 강제. REQ-FUNC-001 (스탬프 시각 반영) · REQ-NF-003 (이벤트→UI 델타 p95 ≤500ms) 충족.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-001, 004 (체류 시간 분포 — 게임화 방지)
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-038 (자율 선택)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-003 (스탬프 렌더 p95 ≤500ms)
  - `/docs/SRS_V0_9.md#4.2.6` — REQ-NF-034, 037 (접근성)
  - `/docs/SRS_V0_9.md#1.5.1` — ADR-003 (순서 자율)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-10 (자율 선택)
  - `/docs/SRS_V0_9.md#3.5.2` — UC-03
  - `/docs/SRS_V0_9.md#1.2.2` — Out-of-Scope (게임화 요소 배제)
- 선행: FR-STAMP-001 (스탬프 맵 API)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/stamp-map/page.tsx` RSC 페이지 — `getCurrentUser()` + 스탬프 데이터 fetch
- [ ] `app/stamp-map/components/StampMap.tsx` Client Component
- [ ] **렌더 구조** — 모듈별 그룹화된 그리드 (M1 모듈 → 레슨 카드 N개, M2 → ...). 각 카드는 `lesson_id`, 제목, 스탬프 획득 여부 (gradient or grayscale 아이콘) 표시
- [ ] **인지 장치 디자인** (게임화 방지 — REQ-FUNC-004):
  - 진주 아이콘은 따뜻한 톤 (펄 화이트 → 골드 그라데이션)
  - "획득" 라벨 사용 금지. "완료" 또는 무라벨 (스탬프 자체로 표현)
  - 점수·랭킹·레벨 표기 절대 금지
  - 진도율 % 도 게임화 위험 — 단순 "10편 중 3편 학습 완료" 텍스트만
- [ ] **임의 lesson_id 클릭 가능 (ADR-003)** — 모든 카드는 `<Link href={`/lesson/${lessonId}`}>` 활성. 잠금 표시 절대 금지
- [ ] 모듈 헤더는 `<h2>` (스크린 리더 네비게이션). 카드는 `<article>` 또는 `<button>` 으로 의미 마크업
- [ ] **클라이언트 사이드 캐싱** — `useSWR` 또는 `React.use(fetch)` 로 1분 stale-while-revalidate
- [ ] **이벤트 → UI 델타 p95 ≤500ms** (REQ-NF-003) — OX 통과 후 스탬프 추가 시:
  - 옵션 A: optimistic UI — submitOx 응답 직후 클라이언트 상태 즉시 업데이트
  - 옵션 B: SWR mutate (`mutate('/api/stamp/map')`) — 서버 fetch 후 갱신
  - 본 태스크는 옵션 A + B 결합 — optimistic 즉시 + 서버 응답 후 검증 갱신
- [ ] **체류 시간 측정 훅** (FR-STAMP-003 의존 준비) — IntersectionObserver + visibility timer. 본 태스크에서는 측정 데이터 EventLog 발행 미구현 (FR-STAMP-003 가 처리), 단 hook 인프라만 준비
- [ ] 색 대비 4.5:1 검증 (axe-core CI)
- [ ] 키보드 네비게이션 — Tab 으로 카드 순차 이동, Enter 로 활성화
- [ ] 빈 상태 (스탬프 0건) UI — "첫 레슨을 선택해 시작하세요" 안내 (후킹 톤 금지)
- [ ] 미로그인 상태 — `/login?returnTo=/stamp-map` 리다이렉트

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 렌더 — 스탬프 0건
- **Given**: 신규 가입 사용자 (Stamp 0건)
- **When**: `/stamp-map` 접근
- **Then**: 모든 모듈·레슨 카드 grayscale 렌더. "10편 중 0편 학습 완료" 표기. 빈 상태 안내 노출

### Scenario 2: 정상 렌더 — 일부 스탬프 보유
- **Given**: 사용자가 L001, L003, L005 스탬프 보유
- **When**: `/stamp-map` 접근
- **Then**: 3개 카드만 활성 (펄 그라데이션). 나머지는 grayscale. 카운트 "10편 중 3편 학습 완료"

### Scenario 3: 자율 선택 — 임의 카드 클릭 (ADR-003)
- **Given**: 스탬프 0건인 사용자
- **When**: L005 카드 클릭 (앞 레슨 미수강 상태)
- **Then**: `/lesson/L005` 로 정상 이동. **잠금·차단 절대 없음**

### Scenario 4: OX 통과 후 즉시 반영 (p95 ≤500ms)
- **Given**: 스탬프 맵 페이지에 머문 상태에서 다른 탭에서 OX 통과
- **When**: 스탬프 맵 탭으로 돌아와 mutate 트리거
- **Then**: 새 스탬프 카드가 grayscale → 펄 그라데이션 전환. 이벤트→UI 델타 p95 ≤500ms (k6 + Performance API 측정)

### Scenario 5: optimistic UI — 동일 페이지에서 OX 통과
- **Given**: 동일 페이지에서 모달 또는 인라인 OX 제출
- **When**: submitOx 응답 받음 (성공)
- **Then**: 클라이언트 상태가 즉시 업데이트되어 카드가 펄로 전환. 서버 응답 fetch 는 백그라운드

### Scenario 6: 게임화 요소 부재 검증
- **Given**: 페이지 전체
- **When**: DOM 검사
- **Then**: 점수·랭킹·레벨·"+1" 효과·축하 애니메이션 0건 (게임화 Non-Goal). "완료" / "학습함" 등의 중립 라벨만 사용

### Scenario 7: 키보드 네비게이션 100%
- **Given**: 마우스 미사용 사용자
- **When**: Tab 키 반복
- **Then**: 모든 카드에 순차 포커스. Enter 로 레슨 페이지 이동. 포커스 시각 스타일 명확 (4.5:1 대비)

### Scenario 8: axe-core 색 대비 + ARIA 통과
- **Given**: 페이지 전체
- **When**: axe-core 검사 (TS-A11Y-001)
- **Then**: violation 0건. 모든 카드의 aria-label 명시 (예: "L001 화폐의 정의 — 학습 완료")

### Scenario 9: 미로그인 — 리다이렉트
- **Given**: 세션 없음
- **When**: `/stamp-map` 접근
- **Then**: `/login?returnTo=/stamp-map` 으로 리다이렉트

### Scenario 10: 빈 상태 후킹 톤 부재
- **Given**: 스탬프 0건
- **When**: 빈 상태 UI 검증
- **Then**: "지금 시작하면 부자가!" "1주일이면 마스터!" 등 후킹 표현 0건. "첫 레슨을 선택해 시작하세요" 같은 차분한 안내만 사용 (REQ-FUNC-007 정신 준수)

## :gear: Technical & Non-Functional Constraints
- **shadcn/ui + Tailwind 강제 (C-TEC-004)**: 카드는 shadcn `Card` 컴포넌트 활용
- **렌더 성능 (REQ-NF-003)**: 이벤트→UI 델타 p95 ≤500ms. 다음 기법 활용:
  - optimistic UI (즉시 반영)
  - React 18 `useTransition` 으로 비차단 업데이트
  - SVG 또는 CSS gradient 로 진주 아이콘 (이미지 fetch 없음)
- **lazy load 금지**: 스탬프 맵은 핵심 UI. 모든 카드 첫 렌더에 표시 (lazy 로 상호작용 지연 방지)
- **자율 선택 (ADR-003 · INV-10)**: 모든 lesson_id 카드는 항상 클릭 가능. 잠금 UI 0건
- **게임화 방지 (REQ-FUNC-004 · 1.2.2 Out-of-Scope)**:
  - 점수·랭킹·레벨업 효과 절대 금지
  - 진주 색상은 차분한 톤 (펄 화이트 → 골드 그라데이션. 형광색·네온 금지)
  - 카드 활성 전환 애니메이션은 0.3초 이내 부드러운 fade (펑펑 터지는 효과 금지)
- **체류 시간 모니터링 인프라**: IntersectionObserver hook 만 본 태스크에서 준비 (실제 EventLog 기록은 FR-STAMP-003)
- **접근성 (REQ-NF-034·037·038)**:
  - 색 대비 4.5:1 (모든 텍스트·상태 표시)
  - 키보드 100% 접근
  - aria-label 명시 (스탬프 상태 + 레슨 제목)
- **응답 페이로드 처리**: FR-STAMP-001 의 응답에서 `revalidate: 60` 활용. 클라이언트 측 추가 캐시 불필요
- **금지**:
  - 진주 획득 시 사운드·진동 효과 (P5 깊이·접근성 침해)
  - 카운트다운·긴박감 조성 UI (CON-05 후킹 금지)
  - 스탬프 미획득 카드를 흐릿하게 처리 (자율 선택 가시성 저해)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `StampMap.tsx` 컴포넌트 구현 + RSC 페이지 통합
- [ ] optimistic UI + SWR mutate 결합 동작 검증
- [ ] 이벤트→UI 델타 p95 ≤500ms 측정 (Performance API + Sentry custom metric)
- [ ] axe-core 색 대비 + ARIA 통과 (TS-A11Y-001)
- [ ] 키보드 네비게이션 E2E (TS-E2E-005 의 일부) 통과
- [ ] 게임화 요소 부재 코드 리뷰 통과 (점수·랭킹·레벨업 grep 0건)
- [ ] 자율 선택 — 모든 카드 클릭 활성화 검증
- [ ] 후킹 톤 부재 — 빈 상태 UI 의 텍스트 검토
- [ ] PR 본문에 "본 컴포넌트는 P1 체계감 Pain 해소의 가시화 종착점이며 게임화 Non-Goal 강제" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-STAMP-001 (스탬프 맵 API)
  - FW-AUTH-003 (로그인 — 미로그인 시 리다이렉트)
  - FR-AUTH-001 (현재 사용자 세션)
  - CT-MOCK-003 (스탬프 시드 — 다양한 진도 상태 테스트)
  - 디자인 토큰 (펄 그라데이션 색상 정의)
- **Blocks**:
  - FR-STAMP-003 (체류 시간 측정 — 본 컴포넌트의 hook 활용)
  - FW-STAMP-001 (스탬프 맵 공유 — 본 UI 의 공유 액션)
  - TS-E2E-001 (박지훈 E2E — 스탬프 맵 반영 단계)
  - TS-IT-001 (Story 1 통합 — UI 측 검증)
  - Alpha Exit (§6.7 Story 1·4 E2E 통합 게이트)
