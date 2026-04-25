# [Feature] CT-MOCK-004: MSW 핸들러 — 프론트엔드 개발용 4종 API mock

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-MOCK-004: MSW(Mock Service Worker) 핸들러 — /api/lesson·/api/stamp/map·saveProgress·submitOx 4종 mock"
labels: 'feature, frontend, mock, dev-tooling, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-MOCK-004] 프론트엔드 개발용 MSW 핸들러 — 4종 API mock
- **목적**: 백엔드 API 구현 전에 프론트엔드 컴포넌트 개발·테스트를 가능하게 하는 Mock Service Worker 핸들러. Contract First 원칙에 따라 CT-API-002~005 의 DTO 를 기반으로 실제 API 응답과 동일한 형태의 mock 데이터를 반환한다. Storybook·단위 테스트·로컬 개발 환경에서 네트워크 의존 없이 동작.

## :link: References (Spec & Context)
- SRS 문서: `/docs/SRS_V0_9.md#6.1` — 4종 API 엔드포인트
- 외부: `https://mswjs.io/docs/` (MSW v2)
- 선행: CT-API-002~005 (DTO 정의), CT-MOCK-001 (Lesson 시드 데이터)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **MSW 설치**: `npm install msw --save-dev`
- [ ] **MSW 초기화**: `npx msw init public/ --save`
- [ ] `mocks/handlers.ts` — 4종 핸들러 정의:
  ```ts
  import { http, HttpResponse } from 'msw';
  import { lessons, stamps, oxQuestions } from './data';

  export const handlers = [
    // 1. GET /api/lesson/{id}
    http.get('/api/lesson/:id', ({ params }) => {
      const lesson = lessons.find(l => l.lessonId === params.id);
      if (!lesson) return HttpResponse.json(
        { error_code: 'LESSON_NOT_FOUND' }, { status: 404 }
      );
      return HttpResponse.json(lesson);
    }),

    // 2. GET /api/stamp/map
    http.get('/api/stamp/map', () => {
      return HttpResponse.json({
        user_id: 'mock-user-1',
        total_lessons: 10,
        earned_count: stamps.length,
        modules: buildModuleResponse(stamps),
      });
    }),

    // 3. saveProgress (Server Action mock — POST)
    http.post('/api/progress', async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json({ ok: true });
    }),

    // 4. submitOx (Server Action mock — POST)
    http.post('/api/ox/submit', async ({ request }) => {
      const body = await request.json();
      const question = oxQuestions.find(
        q => q.lessonId === body.lesson_id && q.questionOrder === body.question_order
      );
      const passed = question?.correctAnswer === body.answer;
      return HttpResponse.json({
        passed,
        correct_answer: question?.correctAnswer,
        explanation: question?.explanation,
        scroll_to_section: passed ? null : question?.scrollAnchor,
        stamp_earned: false, // mock: 스탬프 미발급
      });
    }),
  ];
  ```
- [ ] `mocks/data.ts` — CT-MOCK-001 시드 기반 mock 데이터:
  ```ts
  export const lessons = [
    { lessonId: 'L001', moduleId: 'M1', title: '화폐의 정의', youtubeVideoId: 'placeholder-L001', ... },
    // L002~L010
  ];
  export const stamps = [
    { lessonId: 'L001', earnedAt: '2026-04-25T10:00:00Z' },
    { lessonId: 'L003', earnedAt: '2026-04-25T11:00:00Z' },
  ];
  export const oxQuestions = [
    { lessonId: 'L001', questionOrder: 1, questionText: '...', correctAnswer: 'O', explanation: '...', scrollAnchor: 'anchor-1' },
    // 50건
  ];
  ```
- [ ] `mocks/browser.ts` — 브라우저 환경 워커:
  ```ts
  import { setupWorker } from 'msw/browser';
  import { handlers } from './handlers';
  export const worker = setupWorker(...handlers);
  ```
- [ ] `mocks/server.ts` — Node.js 환경 (Vitest):
  ```ts
  import { setupServer } from 'msw/node';
  import { handlers } from './handlers';
  export const server = setupServer(...handlers);
  ```
- [ ] **개발 환경 자동 시작** — `app/layout.tsx` 또는 별도 `providers.tsx`:
  ```ts
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_MSW === 'true') {
    const { worker } = await import('@/mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }
  ```
- [ ] **Vitest 통합** — `vitest.setup.ts`:
  ```ts
  import { server } from '@/mocks/server';
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  ```
- [ ] **에러 시나리오 핸들러** — 테스트용 오버라이드:
  ```ts
  // 특정 테스트에서 5xx 강제
  server.use(
    http.get('/api/lesson/:id', () => HttpResponse.json({ error: 'Server Error' }, { status: 500 }))
  );
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: GET /api/lesson/L001 — mock 응답
- **Given**: MSW 활성
- **When**: `fetch('/api/lesson/L001')`
- **Then**: 200 + lesson 7필드 반환

### Scenario 2: GET /api/lesson/L999 — 404
- **Given**: L999 미존재
- **When**: fetch
- **Then**: 404 + `LESSON_NOT_FOUND`

### Scenario 3: GET /api/stamp/map — mock 스탬프
- **Given**: 2개 스탬프 시드
- **When**: fetch
- **Then**: `earned_count: 2` + 모듈 구조

### Scenario 4: POST saveProgress — ok
- **Given**: 정상 요청
- **When**: fetch
- **Then**: `{ ok: true }`

### Scenario 5: POST submitOx — 정답
- **Given**: L001 Q1 answer='O' (정답)
- **When**: fetch
- **Then**: `{ passed: true, stamp_earned: false }`

### Scenario 6: POST submitOx — 오답
- **Given**: L001 Q1 answer='X' (오답)
- **When**: fetch
- **Then**: `{ passed: false, scroll_to_section: 'anchor-1' }`

### Scenario 7: Vitest 통합 — server.listen
- **Given**: Vitest 환경
- **When**: 테스트 실행
- **Then**: MSW server 자동 시작 + 종료. 네트워크 요청 0건

### Scenario 8: 에러 오버라이드 — 5xx 강제
- **Given**: `server.use(http.get(..., 500))`
- **When**: fetch
- **Then**: 500 응답. 원래 핸들러 복구 후 정상

### Scenario 9: 프로덕션 빌드 — MSW 미포함
- **Given**: `NODE_ENV=production`
- **When**: 빌드
- **Then**: MSW 코드 번들 미포함. `--save-dev` 로 설치

### Scenario 10: public/mockServiceWorker.js 존재
- **Given**: `npx msw init public/`
- **When**: 파일 확인
- **Then**: `public/mockServiceWorker.js` 존재

## :gear: Technical & Non-Functional Constraints
- **MSW v2**: `msw@2.x` 사용 (v1 API 미지원)
- **Contract First**: 핸들러 응답은 CT-API-002~005 DTO 와 동일 구조
- **데이터 소스**: CT-MOCK-001 시드 데이터 기반 (하드코딩이 아닌 시드 참조)
- **환경 분리**: `NEXT_PUBLIC_MSW=true` 환경변수로 개발 환경만 활성
- **프로덕션 안전**: `msw` 는 `devDependencies` 만. 번들 미포함
- **Server Action mock**: Next.js Server Action 은 직접 mock 불가 → POST 엔드포인트로 대체 mock
- **금지**:
  - 프로덕션에서 MSW 활성화
  - mock 데이터에 실제 PII 포함
  - `onUnhandledRequest: 'error'` (다른 API 호출 차단 방지 — `bypass` 사용)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 통과
- [ ] `mocks/handlers.ts` — 4종 핸들러
- [ ] `mocks/data.ts` — 시드 기반 mock 데이터
- [ ] `mocks/browser.ts` + `mocks/server.ts`
- [ ] Vitest 통합 (`vitest.setup.ts`)
- [ ] 개발 환경 자동 시작
- [ ] 프로덕션 미포함 검증
- [ ] PR 본문에 "Contract First mock. 프론트엔드 병렬 개발 지원" 명시

## :construction: Dependencies & Blockers
- **Depends on**: CT-API-002~005 (DTO), CT-MOCK-001 (시드 데이터)
- **Blocks**: 프론트엔드 개발 전체 (FR-LES·FR-OX·FR-STAMP 등 — mock 기반 개발)
- **Related**: Storybook 통합 (향후), Vitest 테스트 환경
