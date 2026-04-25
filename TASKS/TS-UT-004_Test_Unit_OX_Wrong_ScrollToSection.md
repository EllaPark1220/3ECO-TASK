# [Feature] TS-UT-004: OX 오답 시 scroll_to_section 앵커 반환 단위 테스트

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-UT-004: FW-OX-001 단위 테스트 — 오답 시 scroll_to_section 앵커 + REQ-FUNC-005 (탐색 학습 흐름) 검증"
labels: 'feature, test, unit, ox, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-UT-004] FW-OX-001 (OX 채점 Server Action) 의 오답 케이스 단위 테스트 — `submitOx({ lessonId, answer })` 호출 시 정답이 아니면 응답에 `scrollToSection` 앵커 (개념 설명 위치) 가 포함되는지 검증
- **목적**: REQ-FUNC-005 (오답 시 학습자가 영상의 해당 개념 위치로 즉시 점프) 회귀 방지. 단순 정답/오답 외 **학습자의 탐색 흐름 (오답 → 재학습 → 재시도)** 을 자동화로 강제. PRD 원칙 1 (이해 우선) 정합 — 오답을 점수가 아닌 "다시 학습할 신호" 로 활용.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-002 (OX 제출), REQ-FUNC-005 (탐색 학습 흐름)
  - `/docs/SRS_V0_9.md#6.2.2` — OX_QUESTION 테이블 (scrollToSection 컬럼)
- 외부: `https://vitest.dev/`
- 선행: FW-OX-001 (OX 채점 본체), CT-DB-003 (Lesson + OxQuestion), CT-MOCK-001 (시드)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/services/ox-grade.test.ts`
- [ ] **테스트 픽스처 — OxQuestion 시드 활용 (CT-MOCK-001)**:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { submitOx } from '@/lib/services/ox';
  import { resetTestDb, seedTestData } from '@/__tests__/helpers/db';

  describe('FW-OX-001 OX 채점 — 오답 scroll_to_section', () => {
    beforeEach(async () => {
      await resetTestDb();
      await seedTestData();  // CT-MOCK-001 + 002 (User) + 003 (Progress)
      // OxQuestion: lessonId=L001, correctAnswer=true, scrollToSection='#concept-1'
    });

    // ... 시나리오들
  });
  ```
- [ ] **시나리오 1 — 오답 시 scrollToSection 반환**:
  ```ts
  it('오답 시 scrollToSection 앵커 반환', async () => {
    const result = await submitOx({ lessonId: 'L001', answer: false });  // correctAnswer=true 라 false 는 오답

    expect(result.passed).toBe(false);
    expect(result.scrollToSection).toBe('#concept-1');
    expect(result.explanation).toBeDefined();  // 정답 설명도 동봉
  });
  ```
- [ ] **시나리오 2 — 정답 시 scrollToSection null/undefined**:
  ```ts
  it('정답 시 scrollToSection 미포함', async () => {
    const result = await submitOx({ lessonId: 'L001', answer: true });

    expect(result.passed).toBe(true);
    expect(result.scrollToSection).toBeNull();  // 또는 undefined
    expect(result.stampEarned).toBe(true);
  });
  ```
- [ ] **시나리오 3 — 다중 오답 후 정답 (재시도) 시 stampEarned**:
  ```ts
  it('재시도 — 첫 오답 + 두 번째 정답 → stamp 획득', async () => {
    // 1차 오답
    const first = await submitOx({ lessonId: 'L001', answer: false });
    expect(first.passed).toBe(false);
    expect(first.stampEarned).toBe(false);

    // 2차 정답
    const second = await submitOx({ lessonId: 'L001', answer: true });
    expect(second.passed).toBe(true);
    expect(second.stampEarned).toBe(true);  // 재시도라도 stamp 획득
  });
  ```
- [ ] **시나리오 4 — scrollToSection 형식 검증 (HTML 앵커)**:
  ```ts
  it('scrollToSection 은 # 으로 시작하는 HTML 앵커', async () => {
    const result = await submitOx({ lessonId: 'L001', answer: false });
    expect(result.scrollToSection).toMatch(/^#[a-z0-9-]+$/);  // CSS selector 형식
  });
  ```
- [ ] **시나리오 5 — OxQuestion 의 scrollToSection 미정의 시 graceful**:
  ```ts
  it('OxQuestion.scrollToSection 이 NULL 인 경우 — 응답에 null', async () => {
    // 시드 — L002 의 OxQuestion 은 scrollToSection NULL
    const result = await submitOx({ lessonId: 'L002', answer: false });
    expect(result.passed).toBe(false);
    expect(result.scrollToSection).toBeNull();
    // 사용자 UI 는 자동 스크롤 안함
  });
  ```
- [ ] **시나리오 6 — 다중 OxQuestion 중 첫 번째 활용**:
  ```ts
  it('lesson 에 OxQuestion 다중 존재 시 첫 번째 활용', async () => {
    // 시드 — L003 의 OxQuestion 2건 (orderIndex 1, 2)
    const result = await submitOx({ lessonId: 'L003', answer: false });
    expect(result.scrollToSection).toBe('#concept-3-1');  // orderIndex 1
  });
  ```
- [ ] **시나리오 7 — 잘못된 lessonId — 404**:
  ```ts
  it('lesson 미존재 — 404', async () => {
    await expect(submitOx({ lessonId: 'L999', answer: true }))
      .rejects.toThrow('LESSON_NOT_FOUND');
  });
  ```
- [ ] **시나리오 8 — 미인증 — 401**:
  ```ts
  it('미인증 — 401', async () => {
    // 세션 없는 컨텍스트 활용
    await expect(submitOx({ lessonId: 'L001', answer: true }))
      .rejects.toThrow('UNAUTHORIZED');
  });
  ```
- [ ] **시나리오 9 — explanation 정답 설명 동봉**:
  ```ts
  it('오답 시 explanation 정답 설명 동봉', async () => {
    const result = await submitOx({ lessonId: 'L001', answer: false });
    expect(result.explanation).toBeDefined();
    expect(result.explanation).not.toBe('');
    // 학습자가 왜 오답인지 인지할 수 있는 설명
  });
  ```
- [ ] **시나리오 10 — EventLog 발행 검증**:
  ```ts
  it('OX 제출 시 EventLog ox.submitted 발행', async () => {
    await submitOx({ lessonId: 'L001', answer: false });
    const events = await prisma.eventLog.findMany({ where: { event: 'ox.submitted' } });
    expect(events.length).toBe(1);
    expect(events[0].payload).toMatchObject({ lesson_id: 'L001', passed: false });
  });
  ```
- [ ] **응답 시간 측정**:
  ```ts
  it('단일 OX 채점 ≤ 100ms (DB 접근 포함)', async () => {
    const start = Date.now();
    await submitOx({ lessonId: 'L001', answer: true });
    expect(Date.now() - start).toBeLessThan(100);
  });
  ```
- [ ] **package.json scripts**:
  ```json
  "test:unit:ox": "vitest run __tests__/services/ox-grade.test.ts"
  ```
- [ ] **CI 통합** — IF-CI-001 의 unit-test Job 자동 실행

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 오답 + scrollToSection 반환
- **Given**: OxQuestion (correctAnswer=true, scrollToSection='#concept-1')
- **When**: `submitOx({ lessonId: 'L001', answer: false })`
- **Then**: passed: false, scrollToSection: '#concept-1', stampEarned: false

### Scenario 2: 정답 + scrollToSection null
- **Given**: 동일 OxQuestion
- **When**: `submitOx({ lessonId: 'L001', answer: true })`
- **Then**: passed: true, scrollToSection: null, stampEarned: true

### Scenario 3: 재시도 정답 시 stamp 획득
- **Given**: 1차 오답 후
- **When**: 2차 정답
- **Then**: stampEarned: true

### Scenario 4: scrollToSection HTML 앵커 형식
- **Given**: 응답
- **When**: 검증
- **Then**: `/^#[a-z0-9-]+$/` 매칭

### Scenario 5: scrollToSection NULL — graceful
- **Given**: OxQuestion.scrollToSection NULL
- **When**: 오답
- **Then**: scrollToSection: null. 에러 0

### Scenario 6: 다중 OxQuestion — 첫 번째 활용
- **Given**: lesson 에 OxQuestion 2건
- **When**: 오답
- **Then**: orderIndex 1 의 scrollToSection 활용

### Scenario 7: 잘못된 lessonId — 404
- **Given**: L999 미시드
- **When**: 호출
- **Then**: throw `LESSON_NOT_FOUND`

### Scenario 8: 미인증 — 401
- **Given**: 세션 없음
- **When**: 호출
- **Then**: throw `UNAUTHORIZED`

### Scenario 9: explanation 동봉
- **Given**: 오답
- **When**: 응답
- **Then**: explanation 비어있지 않음

### Scenario 10: EventLog ox.submitted 발행
- **Given**: 채점 후
- **When**: EventLog 조회
- **Then**: `ox.submitted` 1건 + payload 정합

## :gear: Technical & Non-Functional Constraints
- **Vitest + DB 시드**: CT-MOCK-001/002/003 의 픽스처 활용
- **응답 시간 ≤ 100ms (단일 채점)**: DB 접근 포함
- **scrollToSection 형식 강제**: HTML 앵커 (`#xxx`)
- **OxQuestion.scrollToSection NULL graceful**: 일부 lesson 은 미설정 가능
- **다중 OxQuestion — orderIndex 1 활용**: lesson 의 핵심 OxQuestion 표시
- **EventLog 검증 의무**: 채점이 항상 EventLog 발행하는지 확인
- **테스트 격리**: beforeEach 에 DB reset
- **CI 자동 실행**: vitest 가 .test.ts 자동 검색
- **응답 schema parse**: CT-API-004 의 schema 와 정합 검증
- **금지**:
  - DB seed 없이 단독 실행 (외부 의존성)
  - 응답 시간 검증 누락 (성능 회귀)
  - scrollToSection 형식 검증 누락 (UI 깨짐 위험)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `__tests__/services/ox-grade.test.ts` 작성
- [ ] CT-MOCK-001~003 의 픽스처 활용
- [ ] 오답 + 정답 + 재시도 시나리오 모두 검증
- [ ] scrollToSection 형식 검증 (#xxx 패턴)
- [ ] explanation 동봉 검증
- [ ] EventLog 발행 검증
- [ ] 응답 시간 ≤ 100ms 측정
- [ ] CI 통합 검증
- [ ] PR 본문에 "REQ-FUNC-005 회귀 방지" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-OX-001 (OX 채점 본체 — 본 테스트 대상)
  - CT-DB-003 (Lesson + OxQuestion)
  - CT-MOCK-001 (Lesson 시드 — scrollToSection 포함)
  - CT-MOCK-002 (User 시드)
  - CT-MOCK-003 (Progress 시드)
  - IF-CI-001 (워크플로)
- **Blocks**:
  - FW-OX-001 의 안정 운영
  - REQ-FUNC-005 회귀 방지
- **Related**:
  - TS-UT-007 (Stamp UNIQUE)
  - TS-IT-001 (OX → Stamp 통합 테스트)
