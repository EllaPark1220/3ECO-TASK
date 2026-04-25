# [Feature] IF-GEM-001: Gemini API 키 + Vercel AI SDK 통합 + 모델 교체 가능 인터페이스

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] IF-GEM-001: Gemini API 키 환경변수 + Vercel AI SDK 통합 + lib/llm/client.ts 모델 추상화 인터페이스 + Free 한도 모니터링"
labels: 'infra, llm, gemini, ai-sdk, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-GEM-001] Google Gemini API 키 발급 + Vercel 환경변수 등록 + `npm install ai @ai-sdk/google` + `lib/llm/client.ts` 모델 추상화 인터페이스 (`getLintModel()`, `getGenerationModel()` 등) + Free 한도 모니터링 (분당 15 req, 일 1500 req)
- **목적**: ADR-004 (Vercel AI SDK + Gemini 단일 LLM 공급자) 의 인프라 진입. FW-LINT-002 (LLM 후킹 검증) 의 외부 의존성 + 향후 LLM 활용 기능 (자동 요약·번역 등) 의 공통 진입점. 모델 교체 가능 인터페이스로 Gemini → Claude → GPT 전환 시 영향 최소화.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.1` — ADR-004 (Vercel AI SDK + Gemini)
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-TIER (Gemini Free 한도)
  - `/docs/SRS_V0_9.md#3.1` — External Systems (Gemini)
- 외부 문서:
  - `https://sdk.vercel.ai/docs/getting-started`
  - `https://ai.google.dev/gemini-api/docs/quickstart`
  - Free 한도 — 분당 15 req, 일 1500 req (Gemini 1.5 Flash)
- 선행: IF-VC-001 (Vercel 환경변수 등록 위치)
- 짝: FW-LINT-002 (첫 사용처)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Google AI Studio 가입 + API 키 발급**:
  - https://aistudio.google.com/ 접속
  - GitHub OAuth 가입
  - "Get API key" → 새 키 발급
  - **Free 플랜 활성** — 결제 정보 없이 사용 가능 (분당 15 req)
- [ ] **Vercel 환경변수 등록**:
  - `GOOGLE_GENERATIVE_AI_API_KEY` (Vercel AI SDK 의 `@ai-sdk/google` 가 인식하는 키 이름)
  - 3환경 (Production / Preview / Development) 모두 등록
  - **Server-only** — `NEXT_PUBLIC_` prefix 절대 금지 (클라이언트 노출 시 무단 사용 위험)
- [ ] **GitHub Actions Secrets 등록** (CI 에서 LLM Lint 실행 위함):
  - 동일 `GOOGLE_GENERATIVE_AI_API_KEY` 등록
  - **단 PR 환경 (untrusted)** 에서 Secrets 노출 위험 → fork PR 은 LLM Lint skip 정책
- [ ] **의존성 설치**:
  ```bash
  npm install ai @ai-sdk/google zod
  ```
- [ ] **`lib/llm/client.ts` 모델 추상화 인터페이스**:
  ```ts
  import { google } from '@ai-sdk/google';
  import type { LanguageModel } from 'ai';

  /**
   * 후킹 검증용 — 정확한 판정 (낮은 temperature)
   */
  export function getLintModel(): LanguageModel {
    return google('gemini-2.0-flash-exp');  // 또는 'gemini-1.5-flash-002' (안정 버전)
  }

  /**
   * 생성용 — 자동 요약·번역 등 (선택, 향후)
   */
  export function getGenerationModel(): LanguageModel {
    return google('gemini-1.5-flash-002');
  }

  /**
   * 임베딩 (검색·유사도) — 향후
   */
  export function getEmbeddingModel(): string {
    return 'text-embedding-004';
  }

  /**
   * Free 한도 정보 (Stage 1 정책 모니터링)
   */
  export const GEMINI_LIMITS = {
    freeRpm: 15,         // 분당 요청
    freeRpd: 1500,       // 일 요청
    freeTpm: 1_000_000,  // 분당 토큰 (Flash)
  };
  ```
- [ ] **모델 버전 정책**:
  - 기본 — `gemini-1.5-flash-002` (안정 버전, 무료)
  - 실험 — `gemini-2.0-flash-exp` (성능 향상 시 전환 검토)
  - 모델 변경 시 본 인터페이스 한 줄만 수정 → 전체 코드 영향 0
- [ ] **호출 헬퍼 — Rate Limit 회피 + retry**:
  ```ts
  import { generateObject, generateText } from 'ai';
  import { z } from 'zod';

  /**
   * 재시도 + Rate Limit 회피 wrapper
   */
  export async function safeLlmCall<T>(
    fn: () => Promise<T>,
    options: { maxRetries?: number; retryDelayMs?: number } = {}
  ): Promise<T> {
    const { maxRetries = 3, retryDelayMs = 5000 } = options;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        const message = (error as Error).message;

        // Rate Limit 에러 — 재시도
        if (message.includes('429') || message.includes('quota')) {
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, retryDelayMs * (attempt + 1)));
            continue;
          }
        }

        // 다른 에러 — 즉시 throw
        throw error;
      }
    }
    throw lastError!;
  }
  ```
- [ ] **응답 시간 측정 + 모니터링**:
  - 각 LLM 호출 시 응답 시간 기록 (EventLog 또는 Sentry custom metric)
  - Gemini Flash p95 ≤ 5초 목표
- [ ] **Free 한도 모니터링**:
  - 일별 요청 카운트 추적 (별도 cache 또는 EventLog 집계)
  - 1200 도달 (한도 1500 의 80%) 시 Sentry 경고
  - 1500 도달 시 LLM 호출 차단 (자동 graceful fail)
- [ ] **에러 메시지 한국어화**:
  - `RATE_LIMIT_EXCEEDED` 의 메시지 — "AI 서비스 사용량이 일시적으로 한도에 도달했습니다"
  - `LLM_UNAVAILABLE` — "AI 서비스를 일시적으로 사용할 수 없습니다"
- [ ] **PII 보호 정책**:
  - LLM 입력에 사용자 PII (이메일·이름·자유응답) 절대 미포함
  - 콘텐츠 검증 입력 — Lesson.title, Lesson.script 만 (운영 콘텐츠)
  - 향후 자유응답 분석 시 — 익명화 후 입력 (별도 후속)
- [ ] **모델 응답 로깅 정책**:
  - 개발 환경 — 응답 본문 로그 (디버깅)
  - 운영 환경 — 응답 메타만 (토큰 카운트, 응답 시간). 본문 로그 0 (PII·비용)
- [ ] **CI 환경 정책**:
  - main 브랜치 push — LLM Lint 실행 (Secrets 안전)
  - fork PR — LLM Lint skip (Secrets 노출 위험)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: API 키 등록 + 정상 호출
- **Given**: Vercel 환경변수 GOOGLE_GENERATIVE_AI_API_KEY 등록
- **When**: `getLintModel()` 으로 generateObject 호출
- **Then**: 정상 응답. 에러 0

### Scenario 2: API 키 누락 — 빌드 차단
- **Given**: 환경변수 누락
- **When**: 빌드
- **Then**: lib/env.ts 의 zod 검증 실패. 빌드 명시적 fail

### Scenario 3: Rate Limit (429) — 재시도
- **Given**: 분당 15 req 초과
- **When**: safeLlmCall 호출
- **Then**: 5초 대기 후 재시도. 최대 3회

### Scenario 4: 일 한도 초과 — graceful fail
- **Given**: 일 1500 req 도달
- **When**: 추가 호출
- **Then**: 429 + 모니터링 알림. 호출자 graceful 처리

### Scenario 5: 모델 교체 — 인터페이스만 수정
- **Given**: getLintModel() 의 모델 ID 변경 (gemini-1.5-flash → gemini-2.0)
- **When**: 호출 코드 0줄 수정
- **Then**: 새 모델로 호출. 호환 정상

### Scenario 6: Server-only 검증
- **Given**: 클라이언트 번들
- **When**: 검사
- **Then**: GOOGLE_GENERATIVE_AI_API_KEY 미포함 (Server-only)

### Scenario 7: 응답 시간 측정
- **Given**: 정상 호출
- **When**: 응답 시간 측정
- **Then**: p95 ≤ 5초 (Gemini Flash)

### Scenario 8: PII 미포함 검증
- **Given**: LLM 입력 콘텐츠
- **When**: 정적 분석 또는 코드 리뷰
- **Then**: 사용자 email·이름·자유응답 0건

### Scenario 9: fork PR LLM Lint skip
- **Given**: fork repo 의 PR
- **When**: GitHub Actions
- **Then**: LLM Lint Job skip. 다른 Job 정상 진행

### Scenario 10: 80% 한도 도달 알림
- **Given**: 일 1200 req 도달
- **When**: 모니터링
- **Then**: Sentry 경고 발송

## :gear: Technical & Non-Functional Constraints
- **Server-only API 키**: NEXT_PUBLIC prefix 절대 금지
- **모델 추상화 인터페이스 강제**: 모든 LLM 호출이 lib/llm/client.ts 통과. 직접 `google(...)` 사용 금지
- **Free 한도 모니터링**: 80% 알림 + 100% 차단
- **Rate Limit 재시도**: safeLlmCall wrapper 활용. 단일 실패 즉시 throw 금지
- **PII 보호**: LLM 입력에 PII 0건. 콘텐츠만
- **모델 응답 로깅**: 운영 환경은 메타만 (본문 미로깅)
- **응답 시간 p95 ≤ 5초** (Gemini Flash)
- **CI fork PR skip**: Secrets 노출 위험 회피
- **모델 교체 가능**: 인터페이스 한 곳 수정 → 전체 영향 0
- **에러 메시지 한국어**: 사용자 노출 메시지
- **금지**:
  - 클라이언트에서 직접 LLM 호출 (API 키 노출)
  - 직접 google(...) 사용 (인터페이스 우회)
  - 사용자 PII 를 LLM 입력에 포함
  - Rate Limit 재시도 없이 즉시 throw

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Google AI Studio API 키 발급
- [ ] Vercel 환경변수 GOOGLE_GENERATIVE_AI_API_KEY 등록 (3환경)
- [ ] GitHub Secrets 등록
- [ ] `npm install ai @ai-sdk/google` 의존성
- [ ] `lib/llm/client.ts` 모델 추상화 인터페이스
- [ ] `safeLlmCall()` 재시도 wrapper
- [ ] Free 한도 모니터링 (80% 알림, 100% 차단)
- [ ] PII 보호 정책 + 코드 리뷰
- [ ] fork PR LLM Lint skip 정책
- [ ] PR 본문에 "ADR-004 인프라 진입. 모든 LLM 활용의 공통 entry" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-VC-001 (Vercel 환경변수)
- **Blocks**:
  - FW-LINT-002 (LLM 후킹 검증 — 본 인프라 활용)
  - IF-CI-006 (CI Gemini 호출 게이트)
  - 향후 LLM 활용 기능 (자동 요약·번역 등)
- **Related**:
  - ADR-004 (Vercel AI SDK + Gemini)
  - D-TIER (Gemini Free 한도)
