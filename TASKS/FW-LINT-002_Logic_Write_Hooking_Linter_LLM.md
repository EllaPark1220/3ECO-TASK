# [Feature] FW-LINT-002: Vercel AI SDK + Gemini API LLM 2차 후킹 검증 — 숨은 후킹·수익 약속 LLM 판정

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-LINT-002: Vercel AI SDK + Gemini API — 1차 정규식 통과 콘텐츠의 LLM 후킹 검증 + Pass/Fail + 위반 이유 문장"
labels: 'feature, lint, llm, gemini, ci, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-LINT-002] FW-LINT-001 (정규식 1차) 통과한 콘텐츠를 Gemini Flash 모델에 입력 → 숨은 후킹·암시적 수익 약속·과장 표현 LLM 판정 + Pass/Fail 결과 + 위반 이유 한국어 문장 출력
- **목적**: 정규식이 잡지 못하는 **간접 표현·완곡한 후킹** 검증. 예) "이 영상으로 자산을 늘릴 수 있다", "여러분의 인생이 바뀝니다" 같은 정규식 회피 표현. PRD 원칙 1 (이해 우선) + CON-05 (후킹 금지) 의 LLM 보강. **Vercel AI SDK** 채택 (ADR-004 + IF-GEM-001 통합).

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.2` — REQ-FUNC-007 (Hooking Linter 2차 LLM)
  - `/docs/SRS_V0_9.md#1.5.1` — ADR-004 (Vercel AI SDK + Gemini)
- 외부 문서:
  - `https://sdk.vercel.ai/docs`
  - `https://ai.google.dev/gemini-api`
- 선행: FW-LINT-001 (1차 정규식), IF-GEM-001 (Gemini 키), CT-DB-003 (Lesson)
- 짝: FW-LINT-001 (1차), IF-CI-006 (CI Gemini 게이트)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `npm install ai @ai-sdk/google` — Vercel AI SDK + Gemini provider
- [ ] `scripts/lint-hooking-llm.ts` 신규 — LLM 2차 검증 CLI
- [ ] **Vercel AI SDK + Gemini 클라이언트 설정**:
  ```ts
  import { google } from '@ai-sdk/google';
  import { generateObject } from 'ai';
  import { z } from 'zod';

  const model = google('gemini-2.0-flash-exp');  // 또는 'gemini-1.5-flash-002'
  ```
- [ ] **시스템 프롬프트 정책 — 한국어 + 명확한 기준**:
  ```ts
  const SYSTEM_PROMPT = `
당신은 무료 공공 경제교육 SaaS 의 콘텐츠 검수자입니다.
PRD 원칙: "이해 우선, 후킹·자극 표현 금지, 수익 약속 금지, 학습 깊이 우선"

다음 콘텐츠가 아래 정책 위반인지 판정하세요:
1. 후킹·자극 표현 (예: "지금 안하면 후회할 것", "마지막 기회")
2. 수익·재산 증식 약속 (예: "부자 되는 법", "이걸 알면 자산이 늘어요")
3. 시간 단축 약속 (예: "쉽게 마스터", "단숨에 이해")
4. 과장된 효과 (예: "인생이 바뀝니다", "절대 실패 안함")
5. 게임화·중독 표현 (예: "마지막 단계", "도전 클리어")

판정:
- pass: true/false
- violations: 위반 이유 한국어 문장 (없으면 빈 배열)
- severity: 'low'|'medium'|'high' (위반 강도)

콘텐츠 자체가 경제 개념을 정확히 설명하기 위한 표현은 위반이 아닙니다.
예: "GDP 가 국가 경제를 보여주는 지표" → 정상
"GDP 만 알면 돈을 벌 수 있다" → 위반 (수익 약속)
`;
  ```
- [ ] **응답 schema (structured output)**:
  ```ts
  const LintResultSchema = z.object({
    pass: z.boolean(),
    violations: z.array(z.object({
      type: z.enum(['hooking', 'monetization', 'time_promise', 'exaggeration', 'gamification']),
      severity: z.enum(['low', 'medium', 'high']),
      excerpt: z.string(),  // 위반된 부분 인용
      reason: z.string(),  // 한국어 설명
    })),
    overall_assessment: z.string(),  // 종합 평가
  });
  ```
- [ ] **CLI 구현 — Lesson 단위 검증**:
  ```ts
  async function lintHookingLlm() {
    const lessons = await prisma.lesson.findMany({
      select: { lessonId: true, title: true, script: true },
    });

    let totalFail = 0;

    for (const lesson of lessons) {
      const content = `제목: ${lesson.title}\n\n본문:\n${lesson.script}`;

      try {
        const { object } = await generateObject({
          model,
          schema: LintResultSchema,
          system: SYSTEM_PROMPT,
          prompt: content,
          temperature: 0.1,  // 결정적 응답
          maxTokens: 1500,
        });

        if (!object.pass) {
          totalFail++;
          console.error(`❌ ${lesson.lessonId}: ${object.violations.length}건 위반`);
          object.violations.forEach(v => {
            console.error(`  [${v.type}/${v.severity}] ${v.excerpt}`);
            console.error(`    이유: ${v.reason}`);
          });
        } else {
          console.log(`✓ ${lesson.lessonId}: 통과`);
        }
      } catch (error) {
        console.error(`⚠ ${lesson.lessonId}: LLM 호출 실패 (continue)`);
        // graceful — LLM 호출 실패가 전체 차단하지 않음 (별도 정책)
        // 단 CI 에서는 fail 로 처리 옵션 (--strict)
      }
    }

    process.exit(totalFail > 0 ? 1 : 0);
  }
  ```
- [ ] **비용 정책 — Gemini Free 한도 대응**:
  - Gemini 1.5 Flash Free — 분당 15 req, 일 1500 req
  - Lesson 125편 검증 → 분당 15 권장. 약 8분 소요
  - **CI 정책 — PR 마다 변경된 lesson 만 검증** (전체 검증은 nightly 또는 manual)
  - 변경 감지 — git diff 활용
- [ ] **변경된 lesson 만 검증 (CI 비용 절감)**:
  ```ts
  // PR 환경에서 git diff 활용
  const changedLessons = process.env.CI_CHANGED_LESSONS?.split(',') ?? [];
  const lessons = changedLessons.length > 0
    ? await prisma.lesson.findMany({ where: { lessonId: { in: changedLessons } } })
    : await prisma.lesson.findMany();  // 전체 검증 (nightly)
  ```
- [ ] **모델 교체 가능 인터페이스 (IF-GEM-001 와 정합)**:
  - `lib/llm/client.ts` 에 모델 추상화 — `getLintModel()` 함수
  - 모델 변경 시 한 곳만 수정 (Gemini → Claude → GPT 등)
- [ ] **응답 시간 정책**:
  - lesson 1편당 ≤ 5초 (Gemini Flash 응답 시간)
  - 125편 nightly 검증 — 약 10분
  - PR 변경 lesson (평균 1~3편) — ≤ 30초
- [ ] **Sentry 알림 — LLM 호출 실패 시**:
  - 한 번 실패 — graceful (continue)
  - 5건 이상 연속 실패 — Sentry 즉시 알림 (Gemini API 장애 시그널)
- [ ] **EventLog 발행 (운영 환경)**:
  - `content.lint_llm_pass`
  - `content.lint_llm_fail` — payload 에 violations 포함

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 lesson — Pass
- **Given**: 후킹 0건 lesson
- **When**: `npm run lint:hooking:llm`
- **Then**: pass: true. 통과 출력

### Scenario 2: 간접 후킹 — Fail
- **Given**: script 에 "이 강의를 들으면 인생이 바뀝니다"
- **When**: 실행
- **Then**: violations 에 'exaggeration' 검출 + 한국어 이유 + severity: 'high'

### Scenario 3: 암시적 수익 약속 — Fail
- **Given**: "GDP 의 비밀을 알면 자산이 늘어요"
- **When**: 실행
- **Then**: violations 에 'monetization' 검출

### Scenario 4: 정상적 경제 개념 — Pass
- **Given**: "GDP 는 국가 경제를 보여주는 지표"
- **When**: 실행
- **Then**: pass: true. 위반 0

### Scenario 5: 변경된 lesson 만 검증 (CI)
- **Given**: PR 에서 L001·L002 만 변경
- **When**: CI 환경 실행
- **Then**: L001·L002 만 LLM 호출. 다른 lesson 미호출

### Scenario 6: LLM 호출 실패 — graceful
- **Given**: Gemini API 일시 5xx
- **When**: 실행
- **Then**: 해당 lesson skip + 다음 lesson 진행. CI 는 별도 --strict 옵션 시 fail

### Scenario 7: 5건 연속 실패 — Sentry
- **Given**: Gemini API 장애 (5건 연속 timeout)
- **When**: 실행
- **Then**: Sentry 즉시 알림

### Scenario 8: 응답 시간 — lesson 1편당 ≤ 5초
- **Given**: lesson 1편
- **When**: LLM 호출
- **Then**: 응답 ≤ 5초

### Scenario 9: 모델 교체 가능
- **Given**: `getLintModel()` 인터페이스
- **When**: Gemini → Claude 변경
- **Then**: 본 스크립트 0줄 수정. 인터페이스만 교체

### Scenario 10: 응답 schema 정합 — Zod parse
- **Given**: Gemini 응답
- **When**: LintResultSchema.parse
- **Then**: 검증 통과. structured output 정상

## :gear: Technical & Non-Functional Constraints
- **Vercel AI SDK + Gemini Flash**: 결정적 응답 (temperature 0.1)
- **모델 교체 가능 (IF-GEM-001 와 정합)**: lib/llm/client.ts 추상화
- **Free 한도 대응**: 분당 15 req. 변경된 lesson 만 PR 검증
- **graceful 호출 실패**: 단일 실패는 continue. 5건 연속 시 Sentry
- **structured output (Zod schema)**: 응답 파싱 안정성
- **시스템 프롬프트 한국어**: 검증 기준 + 예시 명확
- **응답 시간**: lesson 1편당 ≤ 5초. PR 평균 ≤ 30초
- **CI 비용 절감**: 전체 검증은 nightly. PR 은 변경 lesson 만
- **EventLog 발행 (선택)**: 운영 환경 분석용
- **Sentry 통합**: 5건 연속 실패 시 critical 알림
- **금지**:
  - PR 마다 전체 lesson 검증 (Free 한도 위반)
  - LLM 응답 무비판 적용 (false positive 가능 — 운영자 검토 의무)
  - graceful 처리 없는 단일 실패 = 전체 차단 (운영 부담)
  - 모델 하드코딩 (교체 불가)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `npm install ai @ai-sdk/google` 의존성
- [ ] `scripts/lint-hooking-llm.ts` 구현
- [ ] 시스템 프롬프트 + Zod schema
- [ ] 변경된 lesson 만 PR 검증 (git diff 활용)
- [ ] 모델 교체 가능 인터페이스 (lib/llm/client.ts)
- [ ] graceful 호출 실패 + 5건 연속 시 Sentry
- [ ] 응답 시간 측정 (lesson 1편 ≤ 5초)
- [ ] CI 통합 (IF-CI-006 와 정합)
- [ ] PR 본문에 "정규식 1차 회피 표현 LLM 검증. Vercel AI SDK + Gemini" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-LINT-001 (1차 정규식 — 본 LLM 은 2차)
  - IF-GEM-001 (Gemini API 키 + Vercel AI SDK)
  - CT-DB-003 (Lesson)
  - CT-MOCK-001 (Lesson 시드)
- **Blocks**:
  - IF-CI-006 (CI Gemini 호출 게이트 — 본 스크립트 호출)
  - REQ-FUNC-007 (Hooking Linter LLM 2차) 충족
- **Related**:
  - ADR-004 (Vercel AI SDK)
  - CON-05 (후킹 금지)
