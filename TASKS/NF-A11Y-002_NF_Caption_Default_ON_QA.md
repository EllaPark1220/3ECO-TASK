# [NF] NF-A11Y-002: 자막 기본 ON — 영상 + 차트·수치 자막 100% (편집 QA 체크리스트)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-A11Y-002: 자막 기본 ON — YouTube CC 기본 활성 + 차트·수치 음성 해설 자막 100% QA 체크리스트"
labels: 'nf, accessibility, caption, content-qa, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-A11Y-002] 자막 기본 ON + 차트·수치 자막 100% 편집 QA 체크리스트
- **목적**: REQ-NF-035 (영상 자막 기본 ON) + REQ-FUNC-022 (차트·수치 음성 해설) 을 충족. 청각장애 학습자, 소리 없는 환경 학습자(오세은 — 대중교통), 외국인 학습자 모두가 영상 콘텐츠를 텍스트로 접근 가능하도록 보장. YouTube CC 자막 기본 활성화 + 콘텐츠 제작 시 차트·수치에 반드시 음성 해설을 포함하는 편집 QA 프로세스.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-035 (자막 기본 ON)
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-022 (차트·수치 음성 해설)
  - `/docs/SRS_V0_9.md#4.1.5` — REQ-FUNC-028 (자막 일시정지 시 유지)
- 선행: 없음 (콘텐츠 정책 + 코드 설정)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **YouTube CC 자막 기본 ON** — FR-LES-003 의 YouTube IFrame Player 파라미터:
  ```ts
  // components/YouTubePlayer.tsx
  const playerVars: YT.PlayerVars = {
    cc_load_policy: 1, // 자막 기본 ON
    cc_lang_pref: 'ko', // 한국어 자막 우선
    hl: 'ko',
    rel: 0,
    modestbranding: 1,
  };
  ```
- [ ] **자막 일시정지 유지** — REQ-FUNC-028:
  ```ts
  // 일시정지 시 자막 패널 유지 (YouTube 기본 동작 — cc_load_policy=1 로 충분)
  // 별도 구현 불필요. TS-E2E-004 에서 검증
  ```
- [ ] **편집 QA 체크리스트** — `docs/qa/caption-qa-checklist.md`:
  | # | 항목 | 기준 | 검증 방법 |
  |---|---|---|---|
  | 1 | YouTube CC 자막 존재 | 모든 영상에 한국어 CC 자막 업로드 | YouTube Studio 확인 |
  | 2 | 차트 음성 해설 | 차트가 나올 때 수치를 음성으로 읽어줌 | 영상 시청 QA |
  | 3 | 수치 음성 해설 | 화면에 숫자만 표시될 때 음성 해설 동반 | 영상 시청 QA |
  | 4 | 자막 동기화 | 음성과 자막 시간차 ≤ 1초 | YouTube Studio 타임스탬프 |
  | 5 | 자막 오타 0건 | 맞춤법·경제 용어 정확 | 수동 리뷰 |
  | 6 | 배경음 중 자막 | 배경음악 구간에도 자막 표시 | 시청 QA |
  | 7 | 화면 전환 자막 | 장면 전환 시 자막 끊김 없음 | 시청 QA |
  | 8 | CC 기본 ON 확인 | 임베디드 재생 시 자막 자동 표시 | Playwright 검증 |
- [ ] **Playwright 자동 검증** — `tests/e2e/caption-default-on.spec.ts`:
  ```ts
  test('YouTube CC 자막 기본 ON', async ({ page }) => {
    await page.goto('/lessons/L001');
    const iframe = page.frameLocator('iframe[src*="youtube"]');
    // cc_load_policy=1 파라미터 확인
    const src = await page.locator('iframe[src*="youtube"]').getAttribute('src');
    expect(src).toContain('cc_load_policy=1');
    // 자막 버튼 활성 상태 확인
    const ccButton = iframe.locator('.ytp-subtitles-button');
    const pressed = await ccButton.getAttribute('aria-pressed');
    expect(pressed).toBe('true');
  });
  ```
- [ ] **신규 콘텐츠 게이트**: 자막 미포함 영상 업로드 차단 (운영 SOP)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: CC 자막 기본 ON — 파라미터
- **Given**: 레슨 페이지 로드
- **When**: YouTube iframe src 확인
- **Then**: `cc_load_policy=1` 포함

### Scenario 2: 자막 버튼 활성
- **Given**: 영상 로드 완료
- **When**: 자막 버튼 상태
- **Then**: `aria-pressed="true"`

### Scenario 3: 차트 음성 해설 — L001
- **Given**: L001 영상 재생, 차트 등장 구간
- **When**: 해당 구간 청취
- **Then**: 차트 수치를 음성으로 설명

### Scenario 4: 자막 동기화 ≤ 1초
- **Given**: 영상 재생
- **When**: 음성과 자막 비교
- **Then**: 시간차 ≤ 1초

### Scenario 5: 일시정지 시 자막 유지
- **Given**: 자막 표시 중
- **When**: 일시정지
- **Then**: 자막 패널 유지 (사라지지 않음)

### Scenario 6: 한국어 자막 우선
- **Given**: `cc_lang_pref='ko'`
- **When**: 다국어 자막 존재 시
- **Then**: 한국어 자막 기본 선택

### Scenario 7: 편집 QA 체크리스트 통과
- **Given**: 10편 전수 검사
- **When**: 체크리스트 8항목
- **Then**: 전항목 통과

### Scenario 8: 자막 미포함 영상 차단
- **Given**: 신규 영상 업로드
- **When**: CC 자막 미포함
- **Then**: 발행 차단 (운영 SOP)

## :gear: Technical & Non-Functional Constraints
- **YouTube 의존**: CC 자막은 YouTube Studio 에서 업로드. 앱 코드는 `cc_load_policy=1` 만 설정
- **자막 품질**: 자동 생성(ASR) 자막 금지 — 수동 편집 자막만 허용 (정확도 보장)
- **QA 주기**: 신규 콘텐츠 발행 시마다 체크리스트 실행
- **금지**: 자막 OFF 기본 설정, ASR 자동 자막에만 의존

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 통과
- [ ] `cc_load_policy=1` + `cc_lang_pref='ko'` 설정
- [ ] 편집 QA 체크리스트 문서 작성
- [ ] L001~L010 전수 QA 통과
- [ ] Playwright CC 기본 ON 테스트
- [ ] PR 본문에 "REQ-NF-035 자막 기본 ON. REQ-FUNC-022 차트 해설" 명시

## :construction: Dependencies & Blockers
- **Depends on**: 없음 (콘텐츠 정책 + 코드 파라미터)
- **Blocks**: NF-A11Y-001 (접근성 체크리스트 100%)
- **Related**: REQ-NF-035, REQ-FUNC-022, REQ-FUNC-028, TS-E2E-004 (자막 검증)
