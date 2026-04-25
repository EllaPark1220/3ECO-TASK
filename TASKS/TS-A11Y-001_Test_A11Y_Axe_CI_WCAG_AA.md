# [Test] TS-A11Y-001: axe-core CI 자동 검증 — 색 대비 4.5:1 + WCAG 2.1 AA + 빌드 차단

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-A11Y-001: axe-core CI 자동 검증 — 색 대비 ≥4.5:1 + WCAG 2.1 AA + 빌드 차단"
labels: 'test, a11y, ci, alpha-exit-gate, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-A11Y-001] axe-core 자동 접근성 검사를 GitHub Actions CI 에 통합 — 색 대비 4.5:1, WCAG 2.1 AA 룰셋, violation 1건 이상 시 빌드 차단
- **목적**: §6.7 Alpha Exit 통합 게이트의 세 번째 항목. CON-06 (접근성 체크리스트 100%) + REQ-NF-034 (색 대비) + REQ-NF-037 (키보드) 의 자동화 검증. R6 (접근성 미충족 — Alpha Exit 직전 노출) 의 영구 회귀 방지 안전망. IF-CI-002 의 한 축.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.6` — REQ-NF-033 ~ 039 (접근성 전체)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-06 (Stage 0 Exit 100% 충족)
  - `/docs/SRS_V0_9.md#6.6` — R6 (접근성 미충족 — Alpha Exit 직전 노출)
  - `/docs/SRS_V0_9.md#5.1` — TC-027, TC-031, TC-032 (접근성 테스트)
  - `/docs/SRS_V0_9.md#6.7` — Alpha Exit 통합 게이트 (axe CI 100% 통과)
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-CI (단일 quality.yml)
- 외부 문서: `https://github.com/dequelabs/axe-core` · WCAG 2.1 AA 표준 (REF-16)
- 선행: IF-CI-001 (quality.yml 단일 파일)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `npm install --save-dev @axe-core/playwright axe-core` (Playwright 통합 권장) 또는 `axe-cli` 단독
- [ ] `tests/a11y/axe-runner.ts` — 검사 대상 페이지 5종 정의:
  - `/` (랜딩)
  - `/lesson/L001` (레슨 시청 — Story 1·5)
  - `/stamp-map` (스탬프 맵)
  - `/auth/signup` (가입)
  - `/auth/login` (로그인)
- [ ] **Vercel Preview Deploy URL 대기** — GitHub Actions 의 `vercel/wait-for-deployment-action` 또는 webhook
- [ ] **axe-core 룰셋 설정**:
  - `wcag2a` + `wcag2aa` (WCAG 2.0 + 2.1 AA)
  - `best-practice` 도 포함하되 false positive 가 많으면 후속 디스에이블
  - 한국어 페이지 — `lang="ko"` 검증 강제
- [ ] **임계 정책**:
  - violations.length === 0 일 때만 Pass
  - critical·serious 위반 시 즉시 Fail
  - moderate·minor 는 PR 코멘트 경고 (Pass 유지 — 단계적 개선)
- [ ] **PR 코멘트 자동화**:
  - `peter-evans/create-or-update-comment` Action 활용
  - violation 별 element selector + 위반 룰 ID + 수정 제안 + WCAG 링크 포함
- [ ] **Job 설정 — `.github/workflows/quality.yml`** 의 accessibility Job (IF-CI-002 와 동일 파일):
  ```yaml
  - name: Run axe-core
    run: npx playwright test tests/a11y/axe-runner.ts
  - name: Comment results
    if: always()
    uses: peter-evans/create-or-update-comment@v3
  ```
- [ ] **로컬 재현 명령어** — `package.json` 에 `"test:a11y": "playwright test tests/a11y"` 스크립트 추가
- [ ] **axe rule disable 정책**:
  - `axe-disabled-rules.json` 파일에 disabled rule + 사유 + 담당자 + 만료일 명시
  - PR 리뷰 의무 (단순 disable 금지)
- [ ] **branch protection rule** — main 브랜치에 `accessibility` Job 을 required check 로 등록
- [ ] **첫 1주 운영 후 false positive 검토** — 의도적 violation 1건 (PR 테스트) + 정상 PR 5건 측정

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 PR — 접근성 통과
- **Given**: 색 대비 4.5:1 충족 + 키보드 100% + ARIA 적합
- **When**: PR 생성 + Vercel Preview 배포 완료
- **Then**: `accessibility` Job Pass. PR Checks 녹색

### Scenario 2: 색 대비 위반 — 빌드 차단
- **Given**: 신규 컴포넌트의 텍스트 색 대비비가 3.5:1 (4.5:1 미달)
- **When**: PR 생성
- **Then**: `accessibility` Job Fail. PR 코멘트에 violation 목록 노출 (요소 selector + 룰 ID `color-contrast` + 권장 수정값). main merge 차단

### Scenario 3: ARIA 라벨 누락 — 차단
- **Given**: 버튼에 텍스트도 aria-label 도 없음
- **When**: PR 생성
- **Then**: violation `button-name` 검출. Fail

### Scenario 4: 이미지 alt 누락 — 차단
- **Given**: `<img src="..." />` 에 alt 속성 없음
- **When**: PR 생성
- **Then**: violation `image-alt` 검출. Fail

### Scenario 5: 의도적 disable — 통과 (사유 명시)
- **Given**: `axe-disabled-rules.json` 에 `"region": { "reason": "...", "expires": "2026-07-01", "owner": "..." }` 등록
- **When**: PR 생성
- **Then**: 해당 룰 검사 skip. Pass. 단 만료일 경과 시 자동 재활성

### Scenario 6: 5개 페이지 모두 검사
- **Given**: 정상 PR
- **When**: axe runner 실행
- **Then**: 5개 페이지 모두 검사 + 각 페이지별 결과 리포트

### Scenario 7: 워크플로 도구 오류 — false negative 방지
- **Given**: axe-core 패키지 다운로드 실패
- **When**: 워크플로 실행
- **Then**: Job 이 명확한 에러로 Fail (도구 오류로 인한 잘못된 Pass 방지)

### Scenario 8: 실행 시간
- **Given**: 5개 페이지 검사
- **When**: Job 시작 ~ 완료
- **Then**: 3분 이내 (IF-CI-002 의 5분 한도 내)

### Scenario 9: 한국어 페이지 — lang 속성
- **Given**: `<html lang="ko">` 미설정
- **When**: PR 생성
- **Then**: violation `html-has-lang` 또는 `valid-lang` 검출. Fail

### Scenario 10: PR 코멘트 자동화
- **Given**: violation 발생 PR
- **When**: Job 완료 후
- **Then**: PR 에 자동 코멘트 — element selector + 룰 ID + 수정 제안 + WCAG 링크. 동일 PR 재push 시 코멘트 update (스팸 방지)

## :gear: Technical & Non-Functional Constraints
- **WCAG 2.1 AA 강제**: 본 룰셋 외 추가 (AAA) 강제 금지 — false positive 양산 방지. CON-06 은 AA 기준
- **룰 선택**: `wcag2a` + `wcag2aa` + 한국어 lang 필수. `best-practice` 는 단계적 적용
- **violations === 0 정책**: critical·serious 는 즉시 차단. moderate·minor 는 경고 + 단계적 개선
- **disable 관리**: 단순 disable 금지. 사유 + 만료일 + 담당자 명시. 만료일 경과 시 자동 재활성
- **Vercel Preview 의존**: Preview 배포 완료 대기. 최대 10분, 초과 시 워크플로 Fail
- **로컬 재현**: 개발자가 로컬에서 동일 검사 가능 (`npm run test:a11y`)
- **PR 코멘트 update vs new**: 동일 PR 재push 시 update (스팸 방지)
- **branch protection 강제**: required check 로 등록. 우회 금지
- **GitHub Actions 비용**: 1회 실행 ≈ 3분. 월 400회 PR 까지 무료 한도 내
- **금지**:
  - violation 무시하고 수동 merge (branch protection 강제)
  - axe rule 임의 disable (사유 문서화 의무)
  - 한국어 페이지를 영어로 위장 (lang="en") — 룰 우회

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `.github/workflows/quality.yml` 의 accessibility Job 동작
- [ ] 5개 페이지 모두 검사 + violation 0건 (Alpha 진입 시점)
- [ ] PR 코멘트 자동화 동작 (peter-evans Action)
- [ ] `axe-disabled-rules.json` 파일 + 만료일 정책 명시
- [ ] branch protection rule 에 required check 등록
- [ ] 의도적 violation PR 1건으로 차단 동작 검증
- [ ] 로컬 `npm run test:a11y` 실행 가능
- [ ] CONTRIBUTING.md 에 접근성 가이드 추가
- [ ] **Alpha Exit 게이트 진입** — §6.7 통합 게이트 4건 중 "axe CI 통과" 항목 체크
- [ ] 첫 1주 false positive 1건 이상에 대한 disable 사유 문서화
- [ ] PR 본문에 "본 게이트 통과는 R6 (접근성 미충족) 영구 회귀 방지" 명시

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-CI-001 (quality.yml 단일 파일 + Vercel Preview 병렬)
  - IF-CI-002 (axe + Lighthouse 게이트 — 본 태스크가 그 중 axe 부분 구현)
  - IF-VC-001 (Vercel Preview)
  - FR-LES-003, FR-STAMP-002 (검사 대상 페이지 존재)
- **Blocks**:
  - **Alpha Exit Gate** — §6.7 통합 게이트 4건 중 1건
  - NF-A11Y-001 (Stage 0 Exit 100% 게이트)
  - TS-A11Y-002 (NVDA 수동 QA — 본 자동 검사가 1차 게이트, NVDA 가 Public Pilot 의 2차 게이트)
