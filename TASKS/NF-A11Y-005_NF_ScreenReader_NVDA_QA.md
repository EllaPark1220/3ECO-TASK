# [NF] NF-A11Y-005: 스크린 리더 NVDA 수동 QA + axe 보완

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-A11Y-005: 스크린 리더 NFR — NVDA 수동 QA + axe-core 보완 + 실패 시 배포 차단"
labels: 'nf, accessibility, screen-reader, nvda, priority:critical, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-A11Y-005] 스크린 리더(NVDA) 수동 QA + axe-core 자동 보완
- **목적**: REQ-NF-038 (스크린 리더 읽기 순서 정상) 의 비기능 수준 보장. axe-core 자동 검증(TS-A11Y-001)으로는 발견하지 못하는 **읽기 순서, 의미 구조, 동적 콘텐츠 알림(aria-live)** 등을 NVDA 스크린 리더로 수동 QA 하고, 실패 시 배포를 차단하는 정책.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-038 (스크린 리더)
- SRS: `/docs/SRS_V0_9.md#5.1` — TC-031 (NVDA QA)
- 선행: TS-A11Y-002 (NVDA 수동 QA — 테스트 태스크. 본 태스크는 NFR 정책)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **NVDA QA 체크리스트** — `docs/qa/nvda-screen-reader.md`:
  | # | 페이지 | 검증 항목 | 기준 |
  |---|---|---|---|
  | 1 | 랜딩 | 제목(h1) → 네비게이션 → 본문 순서 | 논리적 순서 |
  | 2 | 레슨 목록 | 레슨 카드 목록 aria-label | 카드 제목 읽기 |
  | 3 | 레슨 상세 | 영상 → OX → 콘텐츠 순서 | DOM 순서 = 시각 순서 |
  | 4 | OX 퀴즈 | 문제 → 선택지 → 제출 → 결과 | aria-live="polite" 결과 알림 |
  | 5 | 스탬프 맵 | 카드별 "획득/미획득" 상태 | aria-label 에 상태 포함 |
  | 6 | 모달 | 포커스 트랩 + Esc 닫기 | 모달 외부 읽기 차단 |
  | 7 | 글자 크기 토글 | 현재 크기 음성 안내 | aria-valuenow |
  | 8 | 매체 전환 | 전환 후 콘텐츠 변경 알림 | aria-live="polite" |
  | 9 | PDF 다운로드 | 다운로드 완료 알림 | status role |
  | 10 | 에러 상태 | 에러 메시지 즉시 알림 | role="alert" |
- [ ] **axe-core 보완 규칙** — TS-A11Y-001 에 추가:
  ```ts
  // axe 로 자동 검출 가능한 NVDA 관련 규칙
  const rules = [
    'aria-required-attr',
    'aria-valid-attr-value',
    'heading-order',
    'landmark-one-main',
    'region',
    'aria-hidden-body',
    'duplicate-id',
  ];
  ```
- [ ] **배포 차단 정책**:
  ```
  NVDA QA 결과: PASS/FAIL
  - PASS → 배포 허용
  - FAIL → 배포 차단 + 이슈 생성 + 수정 후 재QA
  ```
- [ ] **QA 주기**: 매 릴리즈 전 수동 QA (자동화 불가)
- [ ] **QA 환경**: Windows + NVDA (무료) + Chrome

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 랜딩 페이지 읽기 순서
- **Given**: NVDA ON + 랜딩 페이지
- **When**: Tab 순회
- **Then**: h1 → 네비게이션 → 본문 논리적 순서

### Scenario 2: OX 퀴즈 결과 알림
- **Given**: OX 제출 후
- **When**: 결과 표시
- **Then**: NVDA 가 "정답입니다" 또는 "오답입니다" 즉시 읽음 (aria-live)

### Scenario 3: 스탬프 맵 상태
- **Given**: 스탬프 맵 카드 포커스
- **When**: NVDA 읽기
- **Then**: "화폐의 정의 — 스탬프 획득" 또는 "— 미획득" 읽음

### Scenario 4: 모달 포커스 트랩
- **Given**: 모달 열림
- **When**: Tab 순회
- **Then**: 모달 내부만 순회. 외부 콘텐츠 접근 차단

### Scenario 5: heading 계층 — h1 단일
- **Given**: 모든 페이지
- **When**: heading 분석
- **Then**: h1 1개 + h2/h3 논리적 계층

### Scenario 6: aria-live 동적 알림
- **Given**: 매체 전환 (영상 → 글)
- **When**: 전환 발생
- **Then**: "글로 읽기 모드로 전환되었습니다" aria-live 알림

### Scenario 7: axe 자동 보완 — 7규칙
- **Given**: axe-core 실행
- **When**: 7개 NVDA 관련 규칙 검사
- **Then**: 위반 0건

### Scenario 8: 배포 차단 — NVDA FAIL 시
- **Given**: NVDA QA 체크리스트 1건 이상 FAIL
- **When**: 릴리즈 시도
- **Then**: 배포 차단. 수정 후 재QA 필수

## :gear: Technical & Non-Functional Constraints
- **NVDA**: 무료 오픈소스 스크린 리더 (Windows 전용). macOS 는 VoiceOver 별도
- **자동화 한계**: NVDA 읽기 순서·음성 출력은 자동 테스트 불가. 수동 QA 필수
- **axe 보완**: 자동 검출 가능한 aria 속성·heading 순서는 axe 로 사전 차단
- **복잡도**: H (수동 QA + 정책 수립)
- **금지**: NVDA QA 없이 릴리즈, aria-hidden 남용, 시각적으로만 의미 전달

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 통과
- [ ] NVDA QA 체크리스트 10항목 문서 작성
- [ ] 10항목 전수 QA 통과
- [ ] axe 보완 7규칙 CI 통합
- [ ] 배포 차단 정책 문서화
- [ ] PR 본문에 "REQ-NF-038 스크린 리더 NFR. NVDA 수동 QA" 명시

## :construction: Dependencies & Blockers
- **Depends on**: TS-A11Y-002 (NVDA 수동 QA 테스트)
- **Blocks**: NF-A11Y-001 (접근성 체크리스트 100%)
- **Related**: REQ-NF-038, TC-031, WCAG 2.1 (1.3.1, 1.3.2, 4.1.2)
