# [Feature] IF-CI-005: Husky Pre-commit Hook — 로컬 lint + type-check + 빠른 실패

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] IF-CI-005: Husky Pre-commit Hook — 로컬 ESLint + Prettier + tsc + lint:hooking 빠른 검증 + push 전 차단"
labels: 'feature, infra, ci, husky, pre-commit, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-CI-005] Husky 기반 git pre-commit hook — 로컬 commit 전에 ESLint + Prettier 자동 fix + TypeScript 타입 체크 + 후킹 키워드 빠른 검증 (정규식만, LLM 미호출) + 변경된 파일만 (lint-staged) 처리하여 빠른 실패
- **목적**: CI 가 main 차단 (IF-CI-004) 하기 전에 **로컬에서 미리 차단** — 단일 제작자(CON-08) 의 commit 시점 즉시 피드백 → CI 실행 시간 + 재push 사이클 단축. CI 통과 못할 commit 을 push 하지 않게 강제. **lint-staged 활용으로 변경 파일만 검증** → 응답 시간 ≤ 10초.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#5.1` — 정적 분석
  - `/docs/SRS_V0_9.md#1.5.2` — CON-08 (단일 제작자)
- 외부:
  - `https://typicode.github.io/husky/`
  - `https://github.com/lint-staged/lint-staged`
- 선행: IF-CI-001 (CI 워크플로 패턴), FW-LINT-001 (정규식 린터)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **의존성 설치**:
  ```bash
  npm install --save-dev husky lint-staged
  npx husky init
  ```
- [ ] **`.husky/pre-commit` 스크립트**:
  ```bash
  #!/usr/bin/env sh
  . "$(dirname -- "$0")/_/husky.sh"

  # 1. lint-staged — 변경 파일만 (빠른 실행)
  npx lint-staged

  # 2. 타입 체크 (전체 — 빠른 실패)
  npm run typecheck

  # 3. 후킹 키워드 검증 (정규식만, LLM 미호출)
  # 콘텐츠 변경 시에만 실행 (Lesson 시드 또는 .md 파일)
  STAGED=$(git diff --cached --name-only)
  if echo "$STAGED" | grep -qE '\.(tsx?|md|json)$'; then
    echo "📝 변경된 파일에 후킹 키워드 검증 실행..."
    npm run lint:hooking || {
      echo "❌ Pre-commit 차단 — 후킹 키워드 검출. 수정 후 재 commit 부탁드립니다."
      exit 1
    }
  fi
  ```
- [ ] **`package.json` 의 lint-staged 설정**:
  ```json
  {
    "lint-staged": {
      "*.{ts,tsx}": [
        "eslint --fix",
        "prettier --write"
      ],
      "*.{js,jsx}": [
        "eslint --fix",
        "prettier --write"
      ],
      "*.{md,json,yml}": [
        "prettier --write"
      ]
    }
  }
  ```
- [ ] **`package.json` 의 typecheck 스크립트**:
  ```json
  {
    "scripts": {
      "typecheck": "tsc --noEmit",
      "prepare": "husky"
    }
  }
  ```
- [ ] **`.husky/pre-push` (선택, 보강)**:
  ```bash
  #!/usr/bin/env sh
  . "$(dirname -- "$0")/_/husky.sh"

  # push 전 단위 테스트 빠른 실행 (선택)
  npm run test:unit:fast || {
    echo "❌ Push 차단 — 단위 테스트 fail. 수정 후 재 push."
    exit 1
  }
  ```
- [ ] **bypass 옵션 — `--no-verify`**:
  - 긴급 hotfix 시 `git commit --no-verify` 로 hook 우회 가능
  - 단 push 후 CI (IF-CI-001~004) 가 차단 → 정상 흐름 보존
  - **bypass 사용 시 운영 SOP** — bypass 이유 commit message 에 명시 의무
- [ ] **응답 시간 목표**:
  - lint-staged (변경 파일만) — ≤ 5초
  - typecheck (전체) — ≤ 10초
  - lint:hooking — ≤ 5초
  - 총합 ≤ 15초
- [ ] **CI 와의 분담 정책**:
  - **로컬 (pre-commit)** — 빠른 실패 (lint + type + 정규식)
  - **로컬 (pre-push, 선택)** — 빠른 단위 테스트
  - **CI (main 차단)** — 전체 검증 (LLM + 통합·E2E·Load·a11y·Performance)
  - 로컬은 "빠르게 잡을 수 있는 것" 만, CI 는 "느리지만 완전한 검증"
- [ ] **OS 호환성**:
  - macOS·Linux — sh 정상
  - Windows — Git Bash 또는 PowerShell 호환 검증
- [ ] **실패 메시지 한국어 + 명확한 가이드**:
  ```
  ❌ Pre-commit 차단 — ESLint 위반 3건
    파일: app/page.tsx:12
    수정 명령: npm run lint:fix
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 commit 통과
- **Given**: ESLint·Prettier·typecheck·후킹 모두 통과
- **When**: `git commit -m "..."`
- **Then**: hook 정상 통과 + commit 생성

### Scenario 2: ESLint 위반 — 자동 fix + 통과
- **Given**: 변경 파일에 ESLint 위반
- **When**: commit
- **Then**: 자동 fix 후 commit 생성

### Scenario 3: TypeScript 에러 — 차단
- **Given**: 타입 에러
- **When**: commit
- **Then**: typecheck fail + commit 차단

### Scenario 4: 후킹 키워드 위반 — 차단
- **Given**: title 에 "1주일 만에"
- **When**: commit
- **Then**: lint:hooking fail + 차단

### Scenario 5: 콘텐츠 외 변경 — 후킹 검증 skip
- **Given**: 변경 파일이 .yml 만 (코드/콘텐츠 0)
- **When**: commit
- **Then**: lint:hooking skip + 정상 commit

### Scenario 6: bypass 옵션 — `--no-verify`
- **Given**: 긴급 hotfix
- **When**: `git commit --no-verify`
- **Then**: hook 우회 + commit 생성 (단 CI 가 후속 차단)

### Scenario 7: 응답 시간 ≤ 15초
- **Given**: 평균 commit
- **When**: 시간 측정
- **Then**: ≤ 15초

### Scenario 8: pre-push (선택) — 단위 테스트
- **Given**: 본 hook 활성
- **When**: push
- **Then**: 빠른 단위 테스트 + 통과 시 push 진행

### Scenario 9: Windows 호환
- **Given**: Windows 환경
- **When**: commit
- **Then**: Git Bash 또는 PowerShell 정상 동작

### Scenario 10: 실패 메시지 가이드
- **Given**: 위반 검출
- **When**: 출력
- **Then**: 한국어 + 파일·line + 수정 명령 명시

## :gear: Technical & Non-Functional Constraints
- **Husky + lint-staged 조합**: 변경 파일만 처리 → 빠른 실행
- **CI 와 분담**: 로컬 빠른 실패 vs CI 완전 검증
- **bypass `--no-verify` 허용**: 긴급 hotfix
- **응답 시간 ≤ 15초**: 단일 제작자 commit 흐름 방해 0
- **OS 호환**: macOS·Linux·Windows
- **실패 메시지 한국어 + 가이드**
- **콘텐츠 외 변경 — 후킹 검증 skip**: 효율
- **금지**:
  - bypass 사용 후 SOP 미기록
  - 응답 시간 30초 초과 (commit 흐름 방해)
  - LLM 호출 (CI 에서만)
  - hook 누락 후 직접 push (CI 에서 차단됨)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] husky + lint-staged 의존성 설치
- [ ] `.husky/pre-commit` 스크립트
- [ ] lint-staged 설정 (.ts/.tsx/.md/.json/.yml)
- [ ] typecheck + lint:hooking 통합
- [ ] pre-push (선택) — 단위 테스트
- [ ] bypass SOP 문서화
- [ ] 응답 시간 ≤ 15초 측정
- [ ] OS 호환 검증 (CI 매트릭스)
- [ ] PR 본문에 "로컬 빠른 실패 + CI 분담" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-CI-001 (CI 워크플로 — 로컬과 분담)
  - FW-LINT-001 (정규식 린터)
  - npm install husky lint-staged
- **Blocks**:
  - 단일 제작자의 빠른 피드백 사이클
  - CI 부담 감소
- **Related**:
  - IF-CI-003 (CI 후킹 린터)
  - IF-CI-004 (Branch Protection)
