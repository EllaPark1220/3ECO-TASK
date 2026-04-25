# [Feature] IF-CI-003: 후킹 린터 CI Job — FW-LINT-001~004 통합 + 변경 lesson 만 LLM + main 차단

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] IF-CI-003: GitHub Actions 후킹 린터 Job — FW-LINT-001 (정규식) + LINT-003 (정의·맥락) + LINT-004 (CC) + LINT-002 (Gemini, 변경 lesson 만) + 위반 시 main 차단"
labels: 'feature, infra, ci, lint, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-CI-003] GitHub Actions 의 후킹 린터 통합 Job — `npm run lint:hooking` (정규식 1차) + `npm run lint:content` (정의·맥락) + `npm run lint:cc-license` (CC 3곳) + 변경된 lesson 만 `npm run lint:hooking:llm` (Gemini 2차) 자동 실행 + 위반 시 main 차단
- **목적**: REQ-FUNC-007 (Hooking Linter) + CON-05 (후킹 금지) + REQ-FUNC-037 (CC 라이선스) 의 자동 게이트. 단일 제작자가 매 PR 마다 수동 검증할 수 없음 — CI 가 모든 정책 자동 검증 + 위반 시 main 차단으로 콘텐츠 품질 강제. **Antigravity 가 진행한 IF-CI-006 (Gemini 호출 게이트) 와 정합** — 본 Job 이 호출 측.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#5.1` — CI 자동화
  - `/docs/SRS_V0_9.md#4.1.2` — REQ-FUNC-007 (Hooking Linter)
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-037 (CC 라이선스)
- 외부: `https://docs.github.com/en/actions`
- 선행: FW-LINT-001~004 (린터 본체), IF-CI-001 (워크플로 베이스), IF-GEM-001 (Gemini 인프라)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `.github/workflows/hooking-lint.yml` 신규 또는 IF-CI-001 의 quality.yml 확장
- [ ] **워크플로 정의**:
  ```yaml
  name: Hooking Linter
  on:
    pull_request:
      branches: [main]
    push:
      branches: [main]

  jobs:
    hooking-lint:
      runs-on: ubuntu-latest
      timeout-minutes: 15

      steps:
        - uses: actions/checkout@v4
          with:
            fetch-depth: 2  # PR diff 활용 위함

        - uses: actions/setup-node@v4
          with:
            node-version: '20'
            cache: 'npm'

        - run: npm ci

        # 1. DB 시드 (린터가 Lesson 데이터 활용)
        - name: DB Setup + Seed
          run: |
            npm run db:migrate:test
            npm run db:seed
          env:
            DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test

        # 2. 정규식 1차 (FW-LINT-001)
        - name: Regex Hooking Lint
          run: npm run lint:hooking

        # 3. 정의 + 한국 맥락 (FW-LINT-003)
        - name: Definition & Korean Context Lint
          run: npm run lint:content

        # 4. CC 라이선스 3곳 (FW-LINT-004)
        - name: CC License Lint
          run: npm run lint:cc-license

        # 5. 정적 문서 린터 (TS-STATIC-002)
        - name: Static Docs Lint
          run: npm run lint:docs

        # 6. PR 변경 lesson 만 LLM 2차 (FW-LINT-002)
        - name: Detect changed lesson IDs
          id: changed
          if: github.event_name == 'pull_request'
          run: |
            CHANGED=$(git diff --name-only origin/main...HEAD | \
              grep -oP 'L\d{3}' | sort -u | tr '\n' ',')
            echo "lessons=${CHANGED}" >> $GITHUB_OUTPUT

        - name: LLM Hooking Lint (changed lessons only)
          if: github.event_name == 'pull_request' && steps.changed.outputs.lessons != ''
          env:
            GOOGLE_GENERATIVE_AI_API_KEY: ${{ secrets.GOOGLE_GENERATIVE_AI_API_KEY }}
            CI_CHANGED_LESSONS: ${{ steps.changed.outputs.lessons }}
          run: npm run lint:hooking:llm
  ```
- [ ] **fork PR Secrets 미노출 정책** (IF-GEM-001 정합):
  ```yaml
  # fork PR 의 LLM Lint skip — Secrets 노출 위험
  - name: LLM Hooking Lint (changed lessons only)
    if: |
      github.event_name == 'pull_request' &&
      github.event.pull_request.head.repo.full_name == github.repository &&
      steps.changed.outputs.lessons != ''
  ```
- [ ] **nightly 전체 LLM 린터 — 별도 Job**:
  ```yaml
  jobs:
    nightly-llm-lint:
      if: github.event_name == 'schedule'
      runs-on: ubuntu-latest
      steps:
        # ... (PR 변경 감지 없이 전체 lesson 검증)
        - run: npm run lint:hooking:llm

    schedule:
      - cron: '0 19 * * *'  # UTC 19:00 = KST 04:00 (저녁)
  ```
- [ ] **위반 시 main 차단** — Branch Protection (IF-CI-004 정합):
  - 본 Job 이 fail 이면 PR merge 차단
  - main 직접 push 도 차단 (Branch Protection 의 required status check)
- [ ] **fail 시 사용자 메시지** — 위반 카테고리 + 파일·line 출력:
  ```
  ❌ 후킹 린터 위반 검출
    - L001.title [exaggeration]: "1주일 만에"
    - L003.script [monetization]: "수익률 30%"
    수정 후 재푸시 부탁드립니다.
  ```
- [ ] **GITHUB_STEP_SUMMARY 활용**:
  ```yaml
  - name: Lint Summary
    if: always()
    run: |
      echo "## 후킹 린터 결과" >> $GITHUB_STEP_SUMMARY
      echo "- 정규식: ${{ steps.regex.outcome }}" >> $GITHUB_STEP_SUMMARY
      echo "- 정의·맥락: ${{ steps.context.outcome }}" >> $GITHUB_STEP_SUMMARY
      echo "- CC 라이선스: ${{ steps.cc.outcome }}" >> $GITHUB_STEP_SUMMARY
      echo "- LLM (changed only): ${{ steps.llm.outcome }}" >> $GITHUB_STEP_SUMMARY
  ```
- [ ] **timeout 15분**: 빠른 실패 + Gemini Free 한도 (분당 15 req) 고려한 여유
- [ ] **응답 시간 목표**:
  - 전체 Job (PR) — ≤ 5분 (정규식 + 정의 + CC 빠름 + 변경 lesson 1~3편 LLM)
  - nightly LLM (전체 125편) — ≤ 30분

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 PR — Job 통과
- **Given**: 위반 0
- **When**: PR 생성
- **Then**: 모든 step success + main merge 가능

### Scenario 2: 정규식 위반 — Job fail + 차단
- **Given**: title 에 "1주일 만에"
- **When**: PR
- **Then**: regex step fail + main 차단

### Scenario 3: 정의·맥락 위반 — fail
- **Given**: lesson 에 한국 맥락 0
- **When**: PR
- **Then**: content step fail

### Scenario 4: CC 라이선스 누락 — fail
- **Given**: PDF 템플릿에서 CC 제거
- **When**: PR
- **Then**: cc-license step fail

### Scenario 5: 변경 lesson 만 LLM — 효율
- **Given**: PR 에서 L001 만 변경
- **When**: 실행
- **Then**: LLM 호출 1회만 (L001)

### Scenario 6: 변경 lesson 부재 — LLM step skip
- **Given**: PR 에서 lesson 변경 0 (코드만)
- **When**: 실행
- **Then**: LLM step skip + Job pass

### Scenario 7: fork PR — Secrets 미노출
- **Given**: fork repo PR
- **When**: 실행
- **Then**: LLM step skip (Secrets 보호)

### Scenario 8: nightly 전체 검증
- **Given**: cron 19:00 UTC
- **When**: 실행
- **Then**: 125편 모두 LLM 검증 + ≤ 30분

### Scenario 9: GITHUB_STEP_SUMMARY 출력
- **Given**: Job 종료
- **When**: Summary 검사
- **Then**: 4개 step 결과 명시

### Scenario 10: timeout 15분 정합
- **Given**: 비정상 hang
- **When**: 15분 경과
- **Then**: Job 자동 종료

## :gear: Technical & Non-Functional Constraints
- **단일 Job 통합**: 4종 린터 + 변경 감지 + LLM
- **fork PR Secrets 보호**: LLM step 조건 분기
- **nightly 전체 — 별도 schedule Job**
- **GITHUB_STEP_SUMMARY**: PR 검토자 즉시 인지
- **timeout 15분**: 빠른 실패 + Gemini 여유
- **db:seed 의무**: 린터가 Lesson 데이터 의존
- **PR 변경 감지 (git diff)**: 효율 + Gemini Free 한도
- **위반 차단 강제 (Branch Protection)**: IF-CI-004 정합
- **응답 시간 목표 — PR ≤ 5분, nightly ≤ 30분**
- **금지**:
  - fork PR 의 Secrets 노출
  - 전체 lesson PR 마다 LLM 호출 (Free 한도 위반)
  - timeout 미설정 (무한 hang)
  - 위반 시 PR merge 허용

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `.github/workflows/hooking-lint.yml` 작성
- [ ] 4종 린터 step + 변경 감지 + LLM step
- [ ] fork PR Secrets 보호
- [ ] nightly schedule Job
- [ ] GITHUB_STEP_SUMMARY 통합
- [ ] timeout 15분 명시
- [ ] Branch Protection 정합 (IF-CI-004 사촌)
- [ ] PR 본문에 "REQ-FUNC-007 + REQ-FUNC-037 자동 게이트" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-LINT-001~004 (린터 본체)
  - TS-STATIC-002 (정적 문서 린터)
  - IF-CI-001 (워크플로 베이스)
  - IF-GEM-001 (Gemini 인프라)
- **Blocks**:
  - REQ-FUNC-007 자동 게이트
  - main 콘텐츠 품질 강제
- **Related**:
  - IF-CI-004 (Branch Protection)
  - IF-CI-006 (Gemini 호출 게이트)
