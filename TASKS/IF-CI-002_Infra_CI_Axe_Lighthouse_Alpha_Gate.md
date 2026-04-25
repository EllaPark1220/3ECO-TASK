# [Infra] IF-CI-002: GitHub Actions 품질 게이트 — axe-core + Lighthouse CI (Alpha 필수 2종)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Infra] IF-CI-002: GitHub Actions 품질 게이트 — axe-core + Lighthouse CI (Alpha 필수 2종)"
labels: 'infra, ci, accessibility, performance, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-CI-002] `.github/workflows/quality.yml` 에 **axe-core 접근성 검사 + Lighthouse LCP 성능 검사** 2종을 배포 차단형 필수 게이트로 통합
- **목적**: SRS §6.7 Appendix E 의 Alpha Exit 통합 게이트 (axe-core CI 100% 통과 + Lighthouse CI LCP p95 ≤1.5s 통과) 를 자동화한다. 단일 제작자(CON-08) 가 매 PR 마다 수동 QA 없이 접근성·성능 회귀를 즉시 감지하도록 하여 R6 (접근성 미충족) 및 REQ-NF-002·034 의 영구 회귀 방지 안전망을 구축한다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-CI 결정 (단일 quality.yml + Vercel Preview 병렬)
  - `/docs/SRS_V0_9.md#4.2.6` — REQ-NF-033, 034 (접근성 체크리스트 100%, 색 대비 4.5:1)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-002 (LCP p95 ≤1.5s)
  - `/docs/SRS_V0_9.md#4.2.8` — REQ-NF-050 (CI 자동화 명세)
  - `/docs/SRS_V0_9.md#6.7` — Appendix E Alpha Exit 통합 게이트
  - `/docs/SRS_V0_9.md#6.6` — R6 (접근성 미충족 — Alpha Exit 직전 노출)
- 도구: axe-core CLI 또는 `@axe-core/playwright`, Lighthouse CI (`@lhci/cli`)
- 선행 결정: §1.5.1.2 D-CI — Alpha 단계는 axe + Lighthouse 2종만 (Playwright·k6·Gemini 는 Closed Beta)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `.github/workflows/quality.yml` 신규 (또는 IF-CI-001 의 파일 확장)
- [ ] Trigger: `pull_request` (모든 브랜치) + `push` to main
- [ ] Job 1 — `accessibility`:
  - Vercel Preview Deploy URL 대기 (Vercel GitHub Action 또는 webhook)
  - `axe-core` 설치 및 핵심 페이지 5종 스캔 (랜딩 / 레슨 시청 / 스탬프 맵 / 가입 / 교사 PDF 다운로드)
  - `wcag2aa` 룰셋 + 색 대비 ≥4.5:1 강제
  - violations 0 일 때만 Pass. violation 1건 이상 시 Fail
- [ ] Job 2 — `performance`:
  - Lighthouse CI 설치 (`@lhci/cli`)
  - `lighthouserc.json` 작성 — `assertions.first-contentful-paint < 1500ms`, `largest-contentful-paint < 1500ms` (REQ-NF-002 p95 ≤1.5s)
  - 핵심 페이지 3종 측정 (랜딩 / 레슨 시청 / 스탬프 맵)
  - 각 페이지별 3회 시행 후 p95 산출
  - 임계치 초과 시 Fail
- [ ] **배포 차단 정책** — 두 Job 중 하나라도 Fail 이면 Vercel Production Deploy 가 차단됨 (Vercel 의 GitHub Check 통합)
- [ ] 결과 리포트 — PR 코멘트로 axe violations 목록 + Lighthouse 점수 자동 업로드
- [ ] 캐시 — `node_modules`, `.next/cache`, Lighthouse 의 history 캐싱
- [ ] 분기별 정합화 — D-TIER 트리거 #5 (Functions 100K) 도달 시 Vercel Pro 전환되면 본 워크플로 동작 영향 없음을 확인
- [ ] README 또는 CONTRIBUTING.md 업데이트 — 로컬에서 동일 검사 실행하는 명령어 추가
- [ ] 워크플로 첫 실행 시 발생하는 false positive 검토 후 axe rule disable 정책 명시 (변경 시 PR 필수)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 PR — 모든 게이트 통과
- **Given**: 색 대비 4.5:1 충족 + LCP 1.2s 인 정상 PR
- **When**: PR 생성 → Vercel Preview 배포 완료
- **Then**: `accessibility` Job Pass + `performance` Job Pass. PR 의 GitHub Checks 가 모두 녹색. main merge 가능

### Scenario 2: 색 대비 위반 시 배포 차단
- **Given**: 새 컴포넌트의 텍스트 색 대비비가 3.5:1 (4.5:1 미달)
- **When**: PR 생성
- **Then**: `accessibility` Job Fail. PR 코멘트에 axe violation 목록 노출 (요소 selector + 위반 룰 ID + 수정 제안). main merge 차단

### Scenario 3: LCP 회귀 시 배포 차단
- **Given**: 큰 비최적화 이미지 추가로 LCP 가 2.3s 로 회귀
- **When**: PR 생성
- **Then**: `performance` Job Fail. PR 코멘트에 Lighthouse 점수 + LCP 값 + 회귀 페이지 URL 노출. main merge 차단

### Scenario 4: 키보드 트랩 검출
- **Given**: 모달이 Tab 포커스를 가두지 않고 외부로 빠지는 코드
- **When**: PR 생성
- **Then**: axe-core 가 `focus-trap` 또는 `keyboard-accessible` 위반 검출. Fail

### Scenario 5: 동시 PR 처리
- **Given**: 3개의 PR 이 동시에 열려있음
- **When**: 각 PR 의 워크플로가 병렬 실행
- **Then**: 각 PR 의 Vercel Preview URL 이 독립적으로 처리되고, 결과 코멘트가 올바른 PR 에 매핑됨 (cross-PR 오염 0)

### Scenario 6: 워크플로 자체 실패 (도구 오류)
- **Given**: axe-core 패키지 다운로드 실패 또는 Lighthouse Chrome 시작 실패
- **When**: 워크플로 실행
- **Then**: Job 이 명확한 에러 메시지로 Fail. retry 버튼으로 재시도 가능. 도구 오류로 인한 false negative 가 main 머지로 이어지지 않음

## :gear: Technical & Non-Functional Constraints
- **단일 파일 정책**: D-CI 에 따라 `.github/workflows/quality.yml` 단일 파일 유지. 별도 워크플로 파일 분리 금지
- **배포 차단형**: 본 게이트는 informational(경고만) 이 아니라 **required check** 로 설정. branch protection rule 에서 강제
- **실행 시간**: 두 Job 합산 ≤ 5분 (PR 피드백 루프 효율성)
- **Vercel Preview 의존**: Preview Deploy 가 완료되어야 검사 시작. 최대 대기 시간 10분, 그 이상이면 워크플로 Fail
- **GitHub Actions Free 한도**: 월 2,000분 내 (REQ-NF-024 외부 도구 비용). 본 워크플로 1회 ≈ 5분 → 월 400회 PR/push 까지 무료 운영 가능
- **확장 가능성**: Closed Beta 단계에서 `playwright` `k6` `gemini-lint` Job 이 같은 quality.yml 에 추가 가능하도록 구조화
- **로컬 재현**: 개발자가 로컬에서 동일 검사를 실행할 수 있는 npm script (`npm run test:a11y`, `npm run test:lighthouse`) 제공
- **false positive 관리**: axe rule 의 disable 은 PR 리뷰 의무. `axe-disabled-rules.json` 파일에 사유 주석 필수
- **금지**: WCAG AAA 룰까지 강제하지 말 것 (CON-06 은 AA 기준). 과도한 엄격성으로 false positive 양산 방지

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 시나리오 전부 통과
- [ ] `.github/workflows/quality.yml` 에 2개 Job 정의 완료
- [ ] `lighthouserc.json` 임계치 설정 (LCP < 1500ms 등)
- [ ] axe rule 룰셋 (`wcag2aa`) + 색 대비 ≥4.5:1 강제 검증
- [ ] PR 코멘트로 결과 자동 업로드 동작 확인
- [ ] branch protection rule 에서 본 워크플로가 required check 로 등록됨
- [ ] 의도적 위반을 포함한 테스트 PR 1건으로 차단 동작 검증
- [ ] CONTRIBUTING.md 또는 README 에 로컬 재현 가이드 추가
- [ ] 첫 1주간 발생한 false positive 1건 이상에 대한 disable 사유 문서화
- [ ] 실행 시간 ≤ 5분 측정 결과 기록

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-CI-001 (`.github/workflows/quality.yml` 단일 파일 + Vercel Preview Deploy 병렬 작동 — 본 태스크가 확장)
  - IF-VC-001 (Vercel Hobby 프로젝트 + Git Push 자동 배포)
  - FR-LES-003, FR-STAMP-002 (테스트 대상 페이지가 존재해야 검사 가능)
- **Blocks**:
  - IF-CI-003, IF-CI-004, IF-CI-005 (후킹 린터, Playwright, k6 — 본 워크플로 구조에 추가됨)
  - TS-A11Y-001 (axe CI 자동 검증 — 본 게이트가 실행 인프라)
  - TS-LOAD-003 (Lighthouse LCP 검증 — 동일)
  - NF-A11Y-001 (Stage 0 Exit 접근성 100% 게이트)
  - **Alpha Exit** — §6.7 Appendix E 통합 게이트 4건 중 2건 (axe + Lighthouse) 이 본 태스크에 의존
