# [TS] TS-A11Y-002: NVDA 스크린 리더 수동 QA 시나리오 및 검증

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[TS] TS-A11Y-002: Test & QA — NVDA 스크린 리더 수동 QA 체크리스트 및 검증 시나리오 (WCAG 2.1 AA)"
labels: 'ts, a11y, qa, manual-testing, screen-reader, priority:high, mvp-in, stage-0'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-A11Y-002] NVDA 스크린 리더 기반 접근성 수동 검증
- **목적**: 페르소나 SH-08(김성호, 전맹)의 실질적인 사용자 경험을 보장하기 위함. axe-core나 Lighthouse 같은 자동화 도구는 ARIA 속성 누락이나 구조적 문제를 잡지만, 논리적인 포커스 흐름, 키보드 트랩, 동적 모달 읽기 등 실제 스크린 리더 환경의 맥락은 파악하지 못함. 이에 윈도우 환경 점유율 1위인 NVDA 스크린 리더를 이용한 표준화된 수동 QA 절차를 수립하고 강제함.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-040 (접근성 100% 충족)
- 관련: NF-A11Y-001 (Stage 0 Exit 접근성 게이트), NF-A11Y-005 (NVDA 기준 명세)
- 외부: WCAG 2.1 AA, NVDA 공식 가이드 (`https://www.nvaccess.org/`)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **NVDA 테스트 환경 구축 가이드 (`docs/qa/nvda-setup.md`)**:
  - Windows 환경에 NVDA 최신 버전 설치 가이드.
  - 주요 단축키 명세 (Tab, Shift+Tab, H(헤딩), B(버튼), Insert+F7(요소 목록)).
  - 스피치 뷰어(Speech Viewer) 활성화 방법 (화면에 읽히는 텍스트를 시각적으로 로그 출력).
- [ ] **수동 QA 대상 핵심 8개 플로우 정의**:
  1. 랜딩 페이지 -> 로그인 이동 플로우
  2. 홈 화면 헤딩 구조 탐색 및 레슨 진입
  3. 레슨 뷰어 내 동영상 재생/일시정지 포커스
  4. OX 퀴즈 폼(Form) 라벨 매칭 및 정답 라디오 버튼 조작
  5. OX 퀴즈 정답 제출 시 나오는 결과 모달(Live Region) 즉각 알림
  6. StampMap 모달 접근성
  7. 네비게이션(GNB)의 aria-current 상태 확인
  8. 로그아웃 팝업 내 키보드 트랩 테스트
- [ ] **QA 결과 리포팅 템플릿**:
  - 통과(Pass) / 실패(Fail) 뿐만 아니라, 맥락상 부자연스러움(Contextual Error)을 표기하는 템플릿 작성.
  - 위반 사항 발견 시 GitHub Issue 템플릿 (A11y Bug Report) 연결.

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 페이지 제목(title) 읽기 검증
- **Given**: NVDA 구동 상태
- **When**: SPA(Next.js) 내에서 라우팅 이동으로 홈(`/home`)에서 레슨(`/lesson/L001`)으로 이동
- **Then**: 즉시 `<title>` 태그가 변경되며, NVDA가 "레슨 1: 수요와 공급 - 경제 교과서" 라고 새로운 페이지의 용도를 올바르게 읽음

### Scenario 2: 논리적인 헤딩(Heading) 탐색
- **Given**: 홈 화면
- **When**: 사용자가 NVDA 단축키 `H`를 눌러 헤딩 단위로 건너뛰기 탐색 시도
- **Then**: 포커스가 h1 -> h2 -> h3 등 논리적 순서로 건너뛰며, 화면의 시각적 구조를 오디오로 정확히 재현함 (중간 단계 누락 없음)

### Scenario 3: 모달(Modal) 진입 시 백그라운드 격리
- **Given**: OX 퀴즈 해설 모달 창이 띄워짐
- **When**: 사용자가 `Tab` 키로 탐색 시도
- **Then**: 포커스가 모달 창 내부에만 갇혀 있으며(Trap), 모달 뒤편(백그라운드)의 요소들로 포커스가 빠져나가지 않음을 확인함 (Focus Trap)

### Scenario 4: 라이브 리전 (aria-live) 즉각 반응
- **Given**: 제출 버튼을 눌러 피드백을 기다리는 상태
- **When**: "정답입니다! 10 포인트를 획득했습니다." 라는 토스트(Toast) 알림이 DOM에 추가됨
- **Then**: 포커스를 수동으로 옮기지 않아도, NVDA가 `aria-live="polite"` 혹은 `assertive`를 감지하여 해당 메시지를 즉각적으로 읽어줌

### Scenario 5: 버튼 및 폼 라벨 매칭
- **Given**: OX 퀴즈의 'O', 'X' 라디오 버튼
- **When**: 포커스 진입
- **Then**: 단순 "라디오 버튼 선택됨"이 아니라, "O 선택됨, 1/2 라디오 버튼" 같이 연관된 `<label>` 텍스트와 그룹 내 순서 정보를 정확히 읽음

### Scenario 6: 아이콘 버튼 대체 텍스트
- **Given**: 텍스트 없이 X 아이콘만 있는 모달 닫기 버튼
- **When**: 해당 버튼으로 포커스 진입
- **Then**: 시각적인 X 표시 대신, 스크린 리더가 내부에 적용된 `aria-label="닫기"` 또는 `sr-only` 텍스트를 인식하여 "닫기 버튼"이라고 읽음

### Scenario 7: 커스텀 콤보박스/드롭다운 (ARIA Roles)
- **Given**: 설정 메뉴의 언어 또는 폰트 크기 변경 드롭다운
- **When**: Enter를 눌러 드롭다운 메뉴 전개
- **Then**: NVDA가 "확장됨(Expanded)" 상태를 알려주고, 방향키로 드롭다운 옵션들을 순회하며 읽을 수 있음 (`aria-expanded`, `role="listbox"`)

### Scenario 8: 키보드 트랩(Keyboard Trap) 탈출 확인
- **Given**: 레슨 내 YouTube 동영상 임베드 iframe
- **When**: iframe 영역으로 탭 진입
- **Then**: 사용자가 동영상 조작 후 `Tab` 또는 `Shift+Tab`을 눌렀을 때, iframe 안에 포커스가 갇히지 않고 외부 페이지 UI로 정상적으로 빠져나옴

### Scenario 9: 탭 컨트롤 (Tabpanel) 맥락 파악
- **Given**: 여러 탭으로 구성된 설정 페이지 (예: '일반', '접근성', '계정')
- **When**: 탭 헤더 간 방향키 조작
- **Then**: "접근성 탭 선택됨, 2/3" 과 같이 현재 선택된 탭의 역할(`role="tab"`)과 상태(`aria-selected="true"`)를 명확히 안내함

### Scenario 10: 자동화 도구의 맹점(Blind Spot) 커버 검증
- **Given**: axe-core CI에서 100% Pass를 받은 컴포넌트
- **When**: NVDA로 수동 청취
- **Then**: `aria-hidden="true"`가 실수로 최상위 컨테이너에 걸려 화면 전체가 스크린 리더에 잡히지 않는 등의 '논리적 오류'를 발견하고 반려(Fail) 처리할 수 있음

## :gear: Technical & Non-Functional Constraints
- **환경 고정**: macOS의 VoiceOver 환경도 우수하나, 공공/교육 현장에서 윈도우 점유율이 압도적이므로 기준 환경을 Windows + NVDA 로 강제함.
- **반복 검증 한계**: 수동 QA는 코스트가 크므로, 매 PR마다 진행하지 않고 **Stage 0 Exit (Alpha 배포 전)** 및 주요 메이저 UI 변경 시점에만 필수(Mandatory) 검증으로 수행함 (NF-A11Y-001 참조).

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 시나리오에 기반한 NVDA 테스트 스크립트 작성 완료 (`docs/qa/nvda-test-script.md`)
- [ ] NVDA 단축키 및 스피치 뷰어 세팅 가이드 문서화 완료
- [ ] 테스트 수행 결과를 리포팅할 Markdown 템플릿 파일 생성
- [ ] PR 본문에 "WCAG 2.1 AA 기준 NVDA 수동 검증 시나리오 확보" 명시

## :construction: Dependencies & Blockers
- **Depends on**: NF-A11Y-001 (수동 QA 결과가 Alpha Exit 게이트에 연동됨)
- **Blocks**: Stage 0 Alpha Exit
