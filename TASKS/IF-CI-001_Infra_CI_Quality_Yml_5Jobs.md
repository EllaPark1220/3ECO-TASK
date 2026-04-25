# [Infra] IF-CI-001: GitHub Actions quality.yml 단일 파일 + Vercel Preview 병렬 + 5종 Job 구조

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Infra] IF-CI-001: .github/workflows/quality.yml 단일 파일 + 5종 Job (lint/typecheck/unit/integration/static-analysis) + Vercel Preview 병렬"
labels: 'infra, ci, github-actions, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-CI-001] `.github/workflows/quality.yml` 단일 파일에 5종 Job (lint / typecheck / unit-test / integration-test / static-analysis) 통합 + Vercel Preview Deploy 와 병렬 실행 + main branch protection 의 required check
- **목적**: D-CI 결정 (단일 quality.yml 파일) 의 구현. 단일 제작자(CON-08) 가 매 PR 마다 다음을 수동 확인 없이 자동 검증할 수 있게 한다 — TypeScript 타입 + ESLint + 단위 테스트 + 통합 테스트 + 후킹·결제·PII 정적 분석. 후속 IF-CI-002 (axe·Lighthouse) · IF-CI-004 (Playwright) · IF-CI-005 (k6) 가 동일 파일에 추가되는 구조적 기반.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-CI (단일 quality.yml + Vercel Preview 병렬)
  - `/docs/SRS_V0_9.md#4.2.8` — REQ-NF-050 (CI 자동화 명세)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-08 (단일 제작자)
- 외부 문서: `https://docs.github.com/en/actions`
- 선행: IF-VC-001 (Vercel Preview), IF-SUP-001 (Supabase staging — 통합 테스트 DB)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `.github/workflows/quality.yml` 신규 파일
- [ ] **Trigger 정책**:
  ```yaml
  on:
    pull_request:
      branches: [main]
    push:
      branches: [main]
  ```
- [ ] **5종 Job 구조 — 병렬 실행**:
  ```yaml
  jobs:
    lint:
      name: Lint (ESLint + Prettier)
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: '20'
            cache: 'npm'
        - run: npm ci
        - run: npm run lint
        - run: npx prettier --check .

    typecheck:
      name: TypeScript Type Check
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: '20', cache: 'npm' }
        - run: npm ci
        - run: npx prisma generate
        - run: npx tsc --noEmit

    unit-test:
      name: Unit Tests (Vitest + SQLite)
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: '20', cache: 'npm' }
        - run: npm ci
        - run: npx prisma generate
        - run: npm run test:unit
        - uses: actions/upload-artifact@v4
          if: always()
          with:
            name: vitest-coverage
            path: coverage/

    integration-test:
      name: Integration Tests (Vitest + PostgreSQL)
      runs-on: ubuntu-latest
      services:
        postgres:
          image: postgres:15
          env:
            POSTGRES_PASSWORD: postgres
            POSTGRES_DB: test
          ports: ['5432:5432']
          options: >-
            --health-cmd pg_isready
            --health-interval 10s
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: '20', cache: 'npm' }
        - run: npm ci
        - run: npx prisma migrate deploy
          env:
            DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
            DATABASE_PROVIDER: postgresql
        - run: npm run db:seed
        - run: npm run db:seed:verify
        - run: npm run test:integration
          env:
            DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test

    static-analysis:
      name: Static Analysis (Hooking·Payment·PII)
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: '20', cache: 'npm' }
        - run: npm ci
        - run: npm run test:hooking          # TS-STATIC-001
        - run: npm run test:no-payment-pii   # 별도 정적 검사 (선택)
  ```
- [ ] **Vercel Preview 병렬 실행** — Vercel 자체 자동 배포가 GitHub Actions 와 독립 실행. 두 시스템이 동시 진행되어 PR 피드백 시간 최소화
- [ ] **Vercel Deploy 결과를 GitHub Checks 에 통합** — Vercel GitHub App 자동 등록
- [ ] **branch protection rule (main)**:
  - 5종 Job 모두 required check
  - Vercel Preview Deploy 도 required check (선택 — Preview URL 의존하는 IF-CI-002 가 따로 처리)
  - PR + 1 Approval (단일 제작자라 self-approve 정책) 또는 Approval 미요구
  - 직접 push 차단
- [ ] **PR 코멘트 자동화 (선택)**:
  - 테스트 실패 시 결과 요약을 PR 코멘트로 자동 게시
  - `peter-evans/create-or-update-comment` 또는 GitHub Actions 의 native annotation
- [ ] **캐시 정책**:
  - `actions/setup-node` 의 `cache: 'npm'` — `npm ci` 가속
  - `node_modules` + `.next/cache` 추가 캐시 (선택)
- [ ] **실행 시간 목표**:
  - Lint Job ≤ 1분
  - Typecheck Job ≤ 2분
  - Unit Test Job ≤ 3분
  - Integration Test Job ≤ 5분 (Postgres 셋업 + 마이그레이션 + 테스트)
  - Static Analysis Job ≤ 30초
  - **5 Job 병렬 → 전체 ≤ 5분** (가장 긴 Job 기준)
- [ ] **Free 한도**: GitHub Actions 월 2,000분 (private repo) 또는 무제한 (public repo). 본 워크플로 1회 ≈ 5분 (병렬 5 Job × 평균 1분 합산 시) 또는 ≈ 12분 (직렬 합산). private repo 기준 월 160회 PR 가능
- [ ] **secrets 등록**:
  - `DATABASE_URL` (Integration test 용 — services 에 정의)
  - 기타 필요 환경변수
- [ ] **로컬 재현 npm scripts**:
  ```json
  "test:unit": "vitest run --dir tests/unit",
  "test:integration": "vitest run --dir tests/integration",
  "test:hooking": "tsx scripts/check-hooking-keywords.ts",
  "test:no-payment-pii": "tsx scripts/check-payment-pii.ts",
  "lint": "next lint",
  "typecheck": "tsc --noEmit"
  ```
- [ ] README + CONTRIBUTING.md 업데이트 — CI 흐름 + 로컬 재현 가이드

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 PR — 5 Job 모두 Pass
- **Given**: 정상 PR
- **When**: PR 생성
- **Then**: 5 Job 모두 녹색. Vercel Preview Deploy 도 성공. main merge 가능

### Scenario 2: 타입 에러 — typecheck Fail
- **Given**: TypeScript 타입 에러 포함 PR
- **When**: 워크플로 실행
- **Then**: typecheck Job Fail. 다른 Job 은 영향 받지 않음 (병렬). main merge 차단

### Scenario 3: Unit Test 실패
- **Given**: 의도적 단위 테스트 실패 PR
- **When**: 실행
- **Then**: unit-test Job Fail. coverage artifact 가 PR 에 첨부

### Scenario 4: Integration Test — Postgres 통합
- **Given**: PR
- **When**: integration-test Job 실행
- **Then**: Postgres service 가 spin up + 마이그레이션 + 시드 + 테스트 정상. SQLite 환경 차이 검증

### Scenario 5: Static Analysis — 후킹 키워드 검출
- **Given**: PR 에 "1주일 마스터" 텍스트 추가
- **When**: static-analysis Job 실행
- **Then**: TS-STATIC-001 의 검사가 검출. Fail. PR 코멘트에 violation 라인 명시

### Scenario 6: Vercel Preview 병렬 실행
- **Given**: PR
- **When**: GitHub Actions + Vercel Deploy 동시 진행
- **Then**: 두 시스템이 독립적으로 실행. 한쪽 실패가 다른쪽 차단 안함 (단 둘 다 required check)

### Scenario 7: 실행 시간 ≤ 5분
- **Given**: 정상 PR
- **When**: 워크플로 시작 ~ 완료
- **Then**: 5분 이내 (가장 긴 Job 기준 — Integration Test ≈ 5분)

### Scenario 8: 캐시 활용
- **Given**: 두 번째 이상 PR (npm cache 적중)
- **When**: 실행
- **Then**: `npm ci` 시간 < 30초 (cache hit). 첫 실행 (cold) 은 1~2분

### Scenario 9: GitHub Actions 한도 모니터링
- **Given**: 1주일 운영
- **When**: GitHub Settings 의 Actions usage 확인
- **Then**: 월 한도 (private repo 2,000분) 의 80% 미만. 초과 시 Sentry 알림 (선택)

### Scenario 10: 로컬 재현 — 동일 결과
- **Given**: 개발자 로컬 환경
- **When**: `npm run test:unit && npm run test:integration && npm run test:hooking`
- **Then**: CI 와 동일 결과. PR 전 사전 검증 가능

## :gear: Technical & Non-Functional Constraints
- **D-CI 단일 파일 정책**: `.github/workflows/quality.yml` 단일. 별도 워크플로 파일 분리 금지 (IF-CI-002·004·005 도 본 파일에 Job 추가)
- **5 Job 병렬 정책**: 의존성 없는 Job 들은 병렬. 의존성 있는 경우 (예: build → test) 만 직렬
- **branch protection 강제**: 5 Job 모두 required check. 우회 0
- **Postgres service container**: GitHub Actions 의 native services 활용. Docker 별도 셋업 불필요
- **캐시 정책**:
  - `actions/setup-node` 의 npm cache (LATEST 권장)
  - `.next/cache` 추가 캐시 (Next.js 빌드 가속, 선택)
- **실행 시간 목표 ≤ 5분**: PR 피드백 효율 핵심. 더 긴 Job (k6 부하·E2E Playwright) 은 IF-CI-005·004 가 별도 schedule 또는 manual trigger
- **GitHub Actions Free 한도**: 월 2,000분 (private). 5분 × 400 PR/월 = 한도 내. private repo 권장 (콘텐츠 보호) 시 한도 인지
- **Vercel Preview 와의 관계**: 두 시스템 독립. Vercel 이 Preview URL 제공 → IF-CI-002 (axe·Lighthouse) 가 활용
- **로컬 재현 강제**: 모든 Job 이 npm script 로 로컬 실행 가능. 개발자 사전 검증
- **금지**:
  - 워크플로 파일 분리 (D-CI 위반)
  - 직렬 의존성 과도 (병렬 가능한데 sequential 처리)
  - Postgres 외부 인스턴스 (Supabase staging) 를 통합 테스트에 직접 사용 (테스트 데이터 오염 + 비용)
  - secrets 를 평문 yaml 에 작성

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `.github/workflows/quality.yml` 5 Job 정의
- [ ] 5 Job 병렬 실행 + 실행 시간 ≤ 5분
- [ ] branch protection rule 등록 — 5 Job 모두 required
- [ ] Vercel Preview Deploy 와 독립 병렬
- [ ] Postgres service container 정상 동작
- [ ] 캐시 적용 — 두 번째 이상 실행 시 npm ci < 30초
- [ ] GitHub Actions Free 한도 모니터링 셋업
- [ ] 로컬 재현 npm scripts 6종 추가
- [ ] CONTRIBUTING.md CI 흐름 가이드
- [ ] PR 본문에 "D-CI 결정 구현. 모든 후속 CI 게이트의 구조적 기반" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-VC-001 (Vercel Preview)
  - IF-SUP-001 (선택 — staging Supabase 는 별도. CI 의 통합 테스트는 Postgres service container 사용)
  - GitHub repo
- **Blocks**:
  - IF-CI-002 (axe·Lighthouse — 본 quality.yml 에 Job 추가)
  - IF-CI-003 (정적 분석 — 본 static-analysis Job 의 호스트)
  - IF-CI-004 (Playwright E2E — 본 quality.yml 에 Job 추가)
  - IF-CI-005 (k6 부하 — 본 quality.yml 에 Job 추가)
  - 모든 PR 의 자동 검증
  - branch protection rule 활성화
