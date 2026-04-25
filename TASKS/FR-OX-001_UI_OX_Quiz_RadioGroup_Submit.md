# [Feature] FR-OX-001: OX 문항 UI — RadioGroup + 제출 + 정답 노출 0건

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-OX-001: OX 문항 렌더링 컴포넌트 + 제출 + 정답·오답 결과 표시 UI"
labels: 'feature, frontend, ox, accessibility, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-OX-001] OX 문항 5개 렌더링 + O/X 라디오 선택 + "제출" 버튼 + 정답·오답 결과 + 오답 시 스크립트 앵커 스크롤 트리거
- **목적**: Story 1 (박지훈) · Story 4 (오세은) 공용 — 시청 → 이해 확인 → 스탬프 사이클의 사용자 인터페이스. UC-02 (OX 체크 제출) 의 클라이언트 구현체이며, FW-OX-001 (채점) + FW-OX-002 (멱등) + FR-LES-005 (앵커 스크롤) 를 한 화면에서 통합 호출. 접근성 핵심 (REQ-NF-037 키보드 + REQ-NF-034 색 대비).

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-002 (OX 제출), 006 (멱등)
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-036 (앵커 스크롤)
  - `/docs/SRS_V0_9.md#3.5.2` — UC-02
  - `/docs/SRS_V0_9.md#4.2.6` — REQ-NF-034, 037
  - `/docs/SRS_V0_9.md#3.4.1` — OX 제출 시퀀스
- 선행 구현: FW-OX-001, FW-OX-002, CT-API-004, CT-DB-006

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/lesson/[id]/components/OxQuiz.tsx` Client Component
- [ ] RSC 부모에서 OxQuestion 5개 fetch 후 props 로 전달 (서버에서 정답 제외하고 — 보안)
- [ ] **응답 페이로드에서 `correctAnswer` 제거 강제** — 서버 RSC 가 OxQuestion 을 클라이언트에 전달할 때 `select: { id, questionOrder, questionText, scrollAnchor }` 만 (correctAnswer 제외)
- [ ] 5개 문항을 `<form>` 또는 `<fieldset>` 으로 그룹화. 각 문항은 라디오 그룹 (O / X)
- [ ] shadcn/ui `RadioGroup` + `RadioGroupItem` 사용 (Radix 기반 — 키보드·ARIA 자동)
- [ ] 각 라디오 그룹의 legend 는 문항 텍스트
- [ ] "제출" 버튼 — 모든 5문항 답변 완료 시에만 활성화 (검증 UI)
- [ ] 제출 시 Server Action `submitOx()` 호출 (Issue #12 + #3)
- [ ] **로딩 상태** — 제출 중 버튼 disabled + spinner. useFormStatus 훅 활용
- [ ] **응답 처리 분기**:
  - `passed: true, stamp_earned: true` → 성공 메시지 + 스탬프 맵 mutate (FR-STAMP-002 갱신)
  - `passed: true, stamp_earned: true (멱등 응답)` → 동일 처리. 별도 표기 안함 (UX 일관성)
  - `passed: false, scroll_to_section` → 오답 메시지 + 첫 오답 문항 하이라이트 + scroll_to_section 호출 (FR-LES-005 의 함수)
- [ ] **오답 표시 정책**:
  - 어느 문항이 오답인지는 명시적으로 표시하지 않음 (스크립트 재학습 유도)
  - 단 "다시 학습 후 재제출" 안내 + 첫 오답 위치 앵커 스크롤
- [ ] **재제출 정책** — 답안 초기화 후 재제출 가능. 멱등 보장이라 안전
- [ ] **에러 핸들링** — 401 (로그인 필요) → 로그인 모달 또는 리다이렉트. 5xx → 재시도 버튼
- [ ] 색 대비 4.5:1 검증 (axe-core)
- [ ] 키보드 네비게이션 — Tab 으로 라디오 이동, Space 로 선택, Enter 로 제출
- [ ] aria-live 영역 — 결과 메시지 ("정답입니다" / "오답이 있습니다") 를 스크린 리더가 자동 읽음

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 5문항 모두 정답 — 성공 처리
- **Given**: Lesson L001 시청 완료 + OxQuestion 5개 렌더 + 모두 정답 선택
- **When**: 제출 버튼 클릭
- **Then**: `submitOx()` 호출 → `{ passed: true, stamp_earned: true }`. UI 에 "이해 확인 완료" 메시지 + 스탬프 맵 갱신

### Scenario 2: 1문항 오답 — 앵커 스크롤
- **Given**: 3번째 문항 오답 선택
- **When**: 제출
- **Then**: `{ passed: false, scroll_to_section: '#anchor-3' }`. UI 에 "다시 학습 후 재제출하세요" 메시지 (어느 문항인지 명시 안함) + `scrollToAnchor('#anchor-3')` 호출 (FR-LES-005)

### Scenario 3: 일부 미응답 — 제출 차단
- **Given**: 5문항 중 3개만 답변
- **When**: 제출 버튼 활성 상태 검증
- **Then**: 제출 버튼 disabled. 미응답 문항 시각 표시 (예: 좌측 인디케이터)

### Scenario 4: 멱등 재제출 — 동일 응답
- **Given**: 이미 OX 통과 + Stamp 발급 상태
- **When**: 동일 정답으로 재제출
- **Then**: `{ passed: true, stamp_earned: true }` (멱등 변환). UI 는 첫 응답과 동일 처리. 사용자는 멱등 처리됨을 인지하지 못함

### Scenario 5: 정답 노출 부재 검증 (보안)
- **Given**: OxQuiz 컴포넌트 렌더 후
- **When**: 클라이언트 DOM·React DevTools 검사
- **Then**: `correctAnswer` 필드 노출 0건. 네트워크 응답에도 미포함

### Scenario 6: 키보드 네비게이션
- **Given**: 마우스 미사용 사용자
- **When**: Tab 으로 라디오 그룹 이동, Space 로 선택, Tab 으로 제출 버튼 이동, Enter 로 제출
- **Then**: 모든 동작이 키보드만으로 가능

### Scenario 7: aria-live 결과 알림
- **Given**: 스크린 리더 사용자 (NVDA·VoiceOver)
- **When**: 정답·오답 결과 메시지 노출
- **Then**: aria-live="polite" 영역의 메시지가 자동 음성 출력

### Scenario 8: 색 대비 4.5:1
- **Given**: 페이지 전체
- **When**: axe-core 검사
- **Then**: 라디오·버튼·메시지 모든 텍스트 색 대비 ≥ 4.5:1

### Scenario 9: 제출 중 로딩 상태
- **Given**: 5문항 답변 완료
- **When**: 제출 버튼 클릭 직후 (서버 응답 받기 전)
- **Then**: 버튼 disabled + spinner 표시. 사용자가 동일 버튼 재클릭 시 무시 (이중 제출 방지)

### Scenario 10: 5xx 에러 — 재시도 UI
- **Given**: 서버가 5xx 응답 (트랜잭션 실패 등)
- **When**: 응답 받음
- **Then**: 에러 메시지 + "재시도" 버튼. 답안 상태는 유지 (사용자가 다시 입력할 필요 없음)

## :gear: Technical & Non-Functional Constraints
- **shadcn/ui RadioGroup 강제 (C-TEC-004)**: Radix 기반으로 키보드·ARIA 기본 충족
- **정답 노출 금지**: 클라이언트 props·네트워크 응답·React DevTools 어디에도 `correctAnswer` 노출 0건. RSC 부모에서 select 명시적 제외
- **오답 문항 비공개 정책**: 어느 문항이 오답인지 명시 표시 안함 (스크립트 재학습 유도). 단 첫 오답 위치 앵커는 scroll_to_section 으로 안내
- **이중 제출 방지**: useFormStatus + 서버측 멱등 (Issue #3) 이중 보호
- **aria-live**: 결과 메시지 영역에 `aria-live="polite"` + `role="status"` 적용
- **응답 시간 (REQ-NF-003)**: 제출 → 결과 표시까지 p95 ≤ 500ms (서버 측 FW-OX-001 와 합산)
- **로딩 UX**: 제출 버튼 spinner + 입력 영역 disabled. 사용자 의도 명확화
- **에러 코드 분기**: 401·5xx 별도 처리. 그 외는 일반 에러 메시지
- **모바일 터치 타겟**: 라디오 버튼 + 라벨 클릭 영역 ≥ 48×48px (모바일 접근성)
- **금지**:
  - 정답 미리 표시 (`correctAnswer` 클라이언트 노출)
  - "축하합니다!", "잘하셨어요!" 등의 게임화 메시지
  - 제출 후 자동 다음 레슨 이동 (자율 선택 — INV-10)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `OxQuiz.tsx` 컴포넌트 구현
- [ ] correctAnswer 노출 0건 검증 (네트워크 + DOM + React DevTools)
- [ ] shadcn/ui RadioGroup 키보드·ARIA 동작 확인
- [ ] aria-live 영역 NVDA 스크린 리더 음성 출력 검증
- [ ] axe-core 색 대비 통과
- [ ] 멱등 재제출 시 UI 일관성 검증 (Scenario 4)
- [ ] 5xx 시 재시도 버튼 + 답안 상태 유지 검증
- [ ] FR-LES-005 의 scrollToAnchor 함수 호출 통합 (오답 시)
- [ ] TS-UT-004 (오답 scroll_to_section 반환 검증) 의 UI 측 부분 통과
- [ ] PR 본문에 "본 컴포넌트는 Story 1·4 공용. 정답 노출 보안 핵심" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-OX-001 (OX 채점 본체)
  - FW-OX-002 (P2002 멱등 변환)
  - CT-API-004 (DTO 계약)
  - CT-DB-006 (OxQuestion 모델)
  - FR-LES-003 (시청 페이지 — 본 컴포넌트의 호스트)
  - FR-LES-005 (앵커 스크롤 함수)
- **Blocks**:
  - TS-E2E-001 (박지훈 E2E — Step 4 OX 제출)
  - TS-E2E-002 (오세은 E2E — OX 통과 단계)
