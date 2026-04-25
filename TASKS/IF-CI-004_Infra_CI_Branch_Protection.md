# [Feature] IF-CI-004: GitHub Branch Protection — main 직접 push 차단 + required status check

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] IF-CI-004: GitHub Branch Protection — main 직접 push 차단 + required status check (4 Job 통과 강제) + admin override 비활성"
labels: 'feature, infra, ci, branch-protection, security, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-CI-004] GitHub repo 의 main 브랜치 보호 정책 — (1) 직접 push 차단 (모든 변경은 PR 통해서만) + (2) required status check (unit-test + hooking-lint + a11y-lint + cc-license-lint 4 Job 통과 강제) + (3) admin override 비활성 (단일 제작자도 정책 우회 불가)
- **목적**: 단일 제작자(CON-08) 의 자기 통제 + 운영 무결성. 콘텐츠 품질 자동 게이트 (IF-CI-003) 가 PR 검증해도 main 직접 push 가능하면 게이트 우회 → 정책 무력화. **Branch Protection 으로 강제** + admin 도 정책 우회 차단으로 일관성 보장.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#5.1` — CI 정책
  - `/docs/SRS_V0_9.md#1.5.2` — CON-08 (단일 제작자)
- 외부: `https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches`
- 선행: IF-CI-001 (워크플로 베이스), IF-CI-002·003 (Job 정의)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **GitHub repo 설정 — Settings → Branches → Branch protection rules**
- [ ] **main 브랜치 보호 규칙 정의**:
  - **Require a pull request before merging** ✓
    - Require approvals: 0 (단일 제작자 — self-PR 가능)
    - Dismiss stale pull request approvals when new commits are pushed: ✓
  - **Require status checks to pass before merging** ✓
    - Require branches to be up to date before merging: ✓
    - Required status checks (4 Job):
      - `unit-test` (TS-UT-* 모두 + Vitest)
      - `hooking-lint` (FW-LINT-001~004)
      - `a11y-lint` (axe-core + Lighthouse, IF-CI-002)
      - `cc-license-lint` (FW-LINT-004)
  - **Require conversation resolution before merging** ✓
  - **Require linear history** ✓ (squash merge 활용)
  - **Do not allow bypassing the above settings** ✓ — admin 도 우회 불가
  - **Restrict who can push to matching branches** — main 직접 push 0
  - **Restrict who can dismiss pull request reviews** — 비활성 (self-PR 허용)
  - **Allow force pushes** ✗
  - **Allow deletions** ✗
- [ ] **단일 제작자 self-PR 정책**:
  - approval 0 — 본인이 본인 PR 승인 가능
  - 단 status check 4종 통과 의무 — 자동 검증
  - 본 정책은 "혼자라서 검증 우회" 가 아닌 "혼자라서 자동 검증에 더 의존" 정책
- [ ] **CODEOWNERS 파일 (선택)** — `.github/CODEOWNERS`:
  ```
  # 단일 제작자 — 모든 파일의 owner
  *           @kdt-eg20-cmd
  /TASKS/     @kdt-eg20-cmd
  /docs/      @kdt-eg20-cmd
  ```
  - 본인이 owner 라 self-PR 시 자동 지정
- [ ] **Branch Protection 설정 자동화 (선택)** — Terraform 또는 GitHub CLI:
  ```bash
  # gh CLI 활용
  gh api -X PUT \
    repos/kdt-eg20-cmd/3ECO-SRS-from-PRD/branches/main/protection \
    -f required_status_checks[strict]=true \
    -f required_status_checks[contexts][]=unit-test \
    -f required_status_checks[contexts][]=hooking-lint \
    -f required_status_checks[contexts][]=a11y-lint \
    -f required_status_checks[contexts][]=cc-license-lint \
    -f enforce_admins=true \
    -f required_pull_request_reviews[required_approving_review_count]=0 \
    -f required_pull_request_reviews[dismiss_stale_reviews]=true \
    -f restrictions=null
  ```
  - 본 자동화는 옵션. 수동 설정도 충분
- [ ] **정책 검증 — 운영자 SOP**:
  - 매 분기 (DR drill 과 함께) Branch Protection 설정 확인
  - 위반 시 즉시 복원
- [ ] **위반 case 시나리오** — 의도적 main 직접 push:
  - GitHub 가 거부 (Permission denied) — 정상 동작 확인
- [ ] **runner 의 status check 이름 정합** — 워크플로 Job 이름과 정확히 일치:
  - IF-CI-001 의 `unit-test` Job
  - IF-CI-002 의 `a11y-lint` Job
  - IF-CI-003 의 `hooking-lint` Job
  - IF-CI-003 의 `cc-license-lint` Job
- [ ] **신규 Job 추가 시 Branch Protection 갱신 정책**:
  - Phase 4 의 추가 CI Job (Observability, Security 등) 도 required status check 에 추가
  - 운영 SOP 에 명시 — "신규 CI Job 추가 시 Branch Protection 갱신 의무"
- [ ] **Force push 차단**:
  - 의도적 시나리오에도 차단 (rewrite history 방지)
  - PR 의 squash merge 만 허용 → linear history

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: main 직접 push — 거부
- **Given**: 본인이 main 에 직접 push 시도
- **When**: git push origin main
- **Then**: GitHub Permission denied + Branch Protection 동작

### Scenario 2: PR 생성 + status check 4개 통과 — merge 가능
- **Given**: 정상 PR + 4 Job 모두 success
- **When**: merge 버튼
- **Then**: merge 가능

### Scenario 3: PR + 1개 Job fail — merge 차단
- **Given**: hooking-lint fail
- **When**: merge 시도
- **Then**: merge 버튼 disabled

### Scenario 4: admin override — 차단
- **Given**: admin 권한으로 우회 시도
- **When**: bypass
- **Then**: 거부 (do not allow bypassing)

### Scenario 5: stale PR — 새 commit 시 approval reset
- **Given**: 승인된 PR + 새 commit
- **When**: push
- **Then**: 기존 approval dismiss

### Scenario 6: force push — 차단
- **Given**: git push --force
- **When**: 시도
- **Then**: 거부

### Scenario 7: branch deletion — 차단
- **Given**: main 삭제 시도
- **When**: GitHub UI 또는 API
- **Then**: 거부

### Scenario 8: linear history 강제 — squash merge
- **Given**: PR merge
- **When**: 옵션
- **Then**: squash merge 만 활성

### Scenario 9: 신규 Job 추가 — required check 갱신
- **Given**: Phase 4 신규 Job
- **When**: 운영자 SOP 따라 갱신
- **Then**: required status checks 에 추가

### Scenario 10: 분기 검증 — 정책 보존
- **Given**: 매 분기 검증
- **When**: GitHub 설정 확인
- **Then**: 모든 정책 유지

## :gear: Technical & Non-Functional Constraints
- **main 직접 push 100% 차단**: PR 통해서만
- **required status check 4 Job**: unit-test + hooking-lint + a11y-lint + cc-license-lint
- **admin override 비활성 (enforce_admins: true)**: 정책 일관성
- **approval 0 (self-PR 허용)**: 단일 제작자 환경
- **stale PR approval dismiss**: 새 commit 시 재검증
- **force push + branch deletion 차단**
- **linear history (squash merge)**: 단순 history
- **CODEOWNERS — 본인 owner**: 자동 지정
- **분기별 정책 검증**: DR drill 과 함께
- **금지**:
  - main 직접 push 허용
  - admin override 활성
  - approval 1 강제 (단일 제작자 차단됨)
  - rebase merge (linear history 위반)
  - force push 허용 (history 손상)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] GitHub Settings 의 Branch Protection 활성
- [ ] required status check 4 Job 등록
- [ ] admin override 비활성
- [ ] CODEOWNERS 파일 작성
- [ ] 분기별 검증 SOP 문서화 (`docs/branch-protection-sop.md`)
- [ ] 운영자 SOP — 신규 Job 추가 시 갱신 의무
- [ ] PR 본문에 "main 100% 차단 + 4 Job 자동 게이트" 명시

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-CI-001 (unit-test Job)
  - IF-CI-002 (a11y-lint Job)
  - IF-CI-003 (hooking-lint + cc-license-lint Job)
- **Blocks**:
  - 모든 CI Job 의 강제 게이트
  - main 무결성 보장
- **Related**:
  - DR drill SOP (분기별 검증)
  - CON-08 (단일 제작자 자기 통제)
