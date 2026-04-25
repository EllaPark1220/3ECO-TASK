# [Feature] IF-CI-006: Gemini 호출 게이트 — 변경 lesson 만 + Free 한도 보호 + fork PR skip

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] IF-CI-006: CI Gemini 호출 게이트 — git diff 변경 lesson 만 + Free 한도 모니터링 + fork PR skip + 일일 호출 한도 1500"
labels: 'feature, infra, ci, llm, gemini, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-CI-006] CI 환경에서 FW-LINT-002 (Gemini LLM 후킹 검증) 호출 시 — (1) git diff 로 변경된 lesson 만 검증 + (2) Free 한도 (분당 15, 일 1500) 모니터링 + (3) fork PR 의 Secrets 노출 회피 (skip) + (4) 일일 누적 호출 카운트
- **목적**: ADR-004 (Vercel AI SDK + Gemini Free) 의 한도 안전 운영 + IF-CI-003 의 Gemini step 게이트 명세화. 단일 제작자가 콘텐츠 작업 집중 시 일일 PR 1500건 미만이라 한도 충분하지만, 잘못된 패턴 (전체 lesson 매 PR 검증) 으로 한도 초과 위험 → 본 게이트로 차단.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-TIER (Gemini Free 한도)
  - `/docs/SRS_V0_9.md#5.1` — CI 정책
- 외부:
  - Gemini 1.5 Flash Free — 분당 15 req, 일 1500 req
- 선행: IF-GEM-001 (Gemini 인프라), FW-LINT-002 (LLM 린터), IF-CI-003 (호출 측 Job)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **변경 lesson 감지 — git diff 활용**:
  ```yaml
  # IF-CI-003 의 워크플로 step
  - name: Detect changed lesson IDs
    id: changed
    if: github.event_name == 'pull_request'
    run: |
      # PR base 와 head 사이 변경된 파일에서 lesson_id 추출
      CHANGED_FILES=$(git diff --name-only origin/main...HEAD)
      LESSON_IDS=$(echo "$CHANGED_FILES" | \
        grep -oP 'L\d{3}' | \
        sort -u | \
        tr '\n' ',' | \
        sed 's/,$//')
      echo "Detected lessons: $LESSON_IDS"
      echo "lessons=$LESSON_IDS" >> $GITHUB_OUTPUT
  ```
- [ ] **변경 lesson 0 시 LLM step skip**:
  ```yaml
  - name: LLM Hooking Lint
    if: |
      github.event_name == 'pull_request' &&
      steps.changed.outputs.lessons != '' &&
      github.event.pull_request.head.repo.full_name == github.repository
    env:
      GOOGLE_GENERATIVE_AI_API_KEY: ${{ secrets.GOOGLE_GENERATIVE_AI_API_KEY }}
      CI_CHANGED_LESSONS: ${{ steps.changed.outputs.lessons }}
    run: npm run lint:hooking:llm
  ```
- [ ] **fork PR Secrets 보호 (IF-GEM-001 정합)**:
  - 조건 — `head.repo.full_name == github.repository` (본인 repo PR 만)
  - fork PR 은 LLM step skip + Job 자체 fail 처리 안함 (다른 step 만 검증)
- [ ] **변경 lesson 카운트 한도 — 안전 임계**:
  ```yaml
  - name: Validate change count
    if: steps.changed.outputs.lessons != ''
    run: |
      COUNT=$(echo "${{ steps.changed.outputs.lessons }}" | tr ',' '\n' | wc -l)
      echo "Changed lesson count: $COUNT"
      if [ "$COUNT" -gt 50 ]; then
        echo "⚠️ 변경 lesson $COUNT 건 — 단일 PR 의 비정상 규모"
        echo "정상 PR 은 1~5 lesson 변경. 50 초과 시 의도 검토 필요."
        echo "Free 한도 보호 위해 본 PR 은 nightly 검증으로 위임."
        exit 0  # skip — fail 아님
      fi
  ```
- [ ] **일일 누적 호출 카운트 — 운영 모니터링**:
  - GitHub Actions 의 누적 실행 로그 활용 (별도 모델 미필요)
  - 또는 EventLog 의 `ci.gemini_called` 이벤트 발행 (PR 마다 1건)
  ```ts
  // scripts/lint-hooking-llm.ts 의 후속 호출
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ci/gemini-quota`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({ lesson_count: changedLessons.length }),
  });
  ```
- [ ] **`/api/ci/gemini-quota` Route Handler — 일일 카운트 응답**:
  ```ts
  export async function GET(req: Request) {
    if (!verifyCronAuth(req)) return new Response('Unauthorized', { status: 401 });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const dailyCount = await prisma.eventLog.count({
      where: {
        event: 'ci.gemini_called',
        createdAt: { gte: today },
      },
    });

    return NextResponse.json({
      ok: true,
      daily_count: dailyCount,
      free_limit: 1500,
      utilization_pct: (dailyCount / 1500) * 100,
      threshold_warning: dailyCount >= 1200,  // 80% 도달
    });
  }
  ```
- [ ] **80% 도달 시 Sentry 알림 (IF-GEM-001 의 정책 정합)**:
  - 일일 1200 req 도달 시 Sentry 경고
  - 1500 도달 시 LLM step 자동 skip (다음 호출은 그날 차단)
- [ ] **분당 15 req — Vercel AI SDK 의 자체 retry**:
  - safeLlmCall wrapper (IF-GEM-001 정의) 가 429 catch + 재시도
  - 본 게이트는 일일 한도 + 변경 감지에 집중
- [ ] **응답 시간 영향**:
  - git diff — ≤ 1초
  - LLM 호출 (lesson 1편당) — ≤ 5초
  - 평균 PR (1~3 lesson) — ≤ 30초
  - 한도 초과 PR (50+) — skip + 즉시 종료
- [ ] **운영자 SOP — 한도 80% 알림 시**:
  - Sentry 알림 → 일일 PR 패턴 확인
  - 50 lesson 초과 PR 분리 (소규모 PR 로 분할)
  - 한도 도달 시 nightly 검증으로 미루기

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 PR — 변경 lesson 1편
- **Given**: PR 에서 L001 만 변경
- **When**: CI 실행
- **Then**: lessons=L001 + LLM 호출 1회

### Scenario 2: 변경 lesson 0 — LLM skip
- **Given**: 코드만 변경 (lesson 무관)
- **When**: 실행
- **Then**: LLM step skip + Job pass

### Scenario 3: 50+ lesson 변경 — skip + 안내
- **Given**: 51 lesson 변경
- **When**: 실행
- **Then**: skip + nightly 위임 메시지 + Job pass (fail 아님)

### Scenario 4: fork PR — LLM skip
- **Given**: fork repo PR
- **When**: 실행
- **Then**: LLM step skip (Secrets 보호)

### Scenario 5: 일일 카운트 응답
- **Given**: ADMIN cron 호출
- **When**: GET /api/ci/gemini-quota
- **Then**: 200 + daily_count 정확

### Scenario 6: 80% 도달 — Sentry 경고
- **Given**: daily_count 1200
- **When**: 호출
- **Then**: threshold_warning: true + Sentry 알림

### Scenario 7: 100% 도달 — LLM skip 자동
- **Given**: daily_count 1500
- **When**: PR 실행
- **Then**: LLM step skip + nightly 위임

### Scenario 8: nightly — 전체 검증
- **Given**: 새벽 04:00 KST schedule
- **When**: 실행
- **Then**: 125편 모두 LLM 호출

### Scenario 9: git diff 정확성 — base 갱신
- **Given**: PR base 가 main 의 최신
- **When**: diff
- **Then**: 정확한 변경 lesson 만

### Scenario 10: 응답 시간 — 평균 PR ≤ 30초
- **Given**: 1~3 lesson 변경 PR
- **When**: 측정
- **Then**: ≤ 30초

## :gear: Technical & Non-Functional Constraints
- **변경 감지 — git diff base...HEAD**: PR 효율
- **fork PR Secrets 보호 (head.repo 매칭)**: 보안
- **변경 50+ — skip + nightly 위임**: 한도 보호
- **일일 누적 카운트 모니터링**: EventLog `ci.gemini_called`
- **80%·100% 임계 자동 차단**
- **분당 15 req — safeLlmCall wrapper 활용** (IF-GEM-001)
- **nightly 전체 검증 (cron schedule)**
- **운영자 SOP — 80% 알림 대응**
- **금지**:
  - 매 PR 전체 lesson LLM (Free 한도 위반)
  - fork PR 의 Secrets 노출
  - 한도 초과 시 강제 호출 (Gemini 차단됨)
  - 변경 감지 미적용 (효율 손실)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] git diff 변경 감지
- [ ] fork PR Secrets 보호
- [ ] 50+ lesson skip + nightly 위임
- [ ] /api/ci/gemini-quota Route Handler
- [ ] 80%·100% 자동 차단
- [ ] safeLlmCall wrapper 활용 (IF-GEM-001)
- [ ] nightly schedule
- [ ] 응답 시간 ≤ 30초 (평균 PR)
- [ ] PR 본문에 "Free 한도 안전 + 변경 감지 효율" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-GEM-001 (Gemini 인프라)
  - FW-LINT-002 (LLM 린터)
  - IF-CI-003 (호출 측 Job)
  - CT-DB-009 (EventLog — ci.gemini_called)
- **Blocks**:
  - Gemini Free 한도 안전
  - REQ-FUNC-007 (LLM 2차) 운영 신뢰성
- **Related**:
  - D-TIER (Free 한도)
  - 운영자 SOP — 80% 대응
