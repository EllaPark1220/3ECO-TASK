# [Feature] TS-UT-011: Hooking Linter 정규식 단위 테스트 — 통과 100% / 위반 시 Fail GWT

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-UT-011: FW-LINT-001 (정규식 1차) 단위 테스트 — 5 카테고리 키워드 + 정규식 패턴 + edge case 50+ 시나리오"
labels: 'feature, test, unit, lint, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-UT-011] FW-LINT-001 (정규식 Hooking Linter) 의 단위 테스트 — Vitest 기반 GWT 시나리오 + 5 카테고리 (exaggeration·fear·monetization·false_urgency·exclusivity) 키워드 매칭 + 정규식 패턴 + 정상 통과 + 의도적 위반 검출 + edge case (대소문자·띄어쓰기) 검증
- **목적**: FW-LINT-001 의 회귀 방지. 키워드 사전 추가·제거 시 검출 누락 또는 false positive 차단. CI 에서 매 PR 자동 실행으로 Linter 자체 신뢰성 보장.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#5.1` — TC-007 (단위 테스트 정책)
  - `/docs/SRS_V0_9.md#4.1.2` — REQ-FUNC-007 (Hooking Linter)
- 외부: `https://vitest.dev/`
- 선행: FW-LINT-001 (정규식 1차), TS-STATIC-001 (키워드 사전)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일 — `__tests__/lint/hooking-linter.test.ts`**:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { lintHookingContent } from '@/scripts/lint-hooking';  // FW-LINT-001 의 함수 export

  describe('FW-LINT-001 Hooking Linter 정규식', () => {
    // ... 시나리오들
  });
  ```
- [ ] **5 카테고리별 시나리오 — 각 카테고리 5건 이상**:

  **(1) exaggeration (과장)**:
  ```ts
  describe('exaggeration', () => {
    it.each([
      ['1주일 마스터', true],
      ['100% 보장', true],
      ['절대 실패 안함', true],
      ['월 천만원', true],
      ['일주일 만에 완성', true],  // 정규식 패턴 (\d+일\s*만에)
      ['3일 만에', true],            // 정규식
      ['경제 학습 가이드', false],   // 정상
      ['천천히 학습합니다', false],  // 정상
    ])('"%s" → 위반 = %s', (input, expectViolation) => {
      const result = lintHookingContent({ title: input, script: '' });
      const hasViolation = result.violations.some(v => v.category === 'exaggeration' || v.category === 'pattern');
      expect(hasViolation).toBe(expectViolation);
    });
  });
  ```

  **(2) fear_inducing (공포)**:
  ```ts
  describe('fear_inducing', () => {
    it.each([
      ['놓치면 후회', true],
      ['지금 안하면 늦어', true],
      ['마지막 기회', true],
      ['후회를 줄이는 방법', false],  // "후회" 단독은 정상 (false positive 방지)
    ])('"%s" → 위반 = %s', ...);
  });
  ```

  **(3) monetization_promise (수익 약속)**:
  ```ts
  describe('monetization', () => {
    it.each([
      ['부자 되는 법', true],
      ['주식 비법', true],
      ['빠른 부의 길', true],
      ['수익률 30%', true],   // 정규식 (수익률\s*\d+%)
      ['수익률 5%', true],    // 정규식
      ['주식 시장 이해', false],  // 정상
      ['부의 분배 원리', false],  // 정상 ("부" 단독은 정상)
    ])('"%s" → 위반 = %s', ...);
  });
  ```

  **(4) false_urgency (가짜 긴급)**:
  ```ts
  describe('false_urgency', () => {
    it.each([
      ['오늘만!', true],
      ['지금 시작!', true],
      ['바로 행동!', true],
      ['오늘 학습할 내용', false],   // 정상
      ['지금 살펴봅시다', false],     // 정상
    ])('"%s" → 위반 = %s', ...);
  });
  ```

  **(5) exclusivity_clickbait (클릭베이트)**:
  ```ts
  describe('exclusivity', () => {
    it.each([
      ['아무도 모르는', true],
      ['전문가만 아는', true],
      ['비밀 공개', true],
      ['전문가의 견해', false],     // 정상
      ['공개된 자료', false],        // 정상
    ])('"%s" → 위반 = %s', ...);
  });
  ```

- [ ] **Edge case 시나리오**:
  ```ts
  describe('edge cases', () => {
    it('대소문자 — 한글은 무관, 영문은 case-insensitive 검토', () => {
      // 영문 키워드의 경우 대소문자 처리 정책 (현재 사전은 한글 위주)
    });

    it('띄어쓰기 변형 — "1 주일 마스터" 도 검출', () => {
      const result = lintHookingContent({ title: '1 주일 마스터', script: '' });
      // 본 정책 — 띄어쓰기 무시 정규식 (\d+\s*일\s*만에) 활용 시 검출
      // 단순 indexOf 매칭은 "1주일" 만 검출 → 정규식 우선
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('정상 콘텐츠 — 전혀 위반 없음', () => {
      const result = lintHookingContent({
        title: 'GDP 의 의미',
        script: '국내총생산 (GDP) 은 한국은행이 발표하는 주요 경제 지표 중 하나로...',
      });
      expect(result.violations).toEqual([]);
    });

    it('빈 입력 — graceful', () => {
      const result = lintHookingContent({ title: '', script: '' });
      expect(result.violations).toEqual([]);
    });

    it('매우 긴 script — 응답 시간 ≤ 100ms', () => {
      const longScript = '정상 콘텐츠 '.repeat(10000);
      const start = Date.now();
      lintHookingContent({ title: 'Test', script: longScript });
      expect(Date.now() - start).toBeLessThan(100);
    });

    it('다중 위반 — 모두 출력', () => {
      const result = lintHookingContent({
        title: '1주일 마스터로 부자 되기',
        script: '지금 안하면 후회합니다',
      });
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
    });
  });
  ```

- [ ] **excerpt 검증**:
  ```ts
  describe('excerpt', () => {
    it('위반 위치 ±50자 출력', () => {
      const longContent = '경제 ' .repeat(50) + '1주일 마스터' + ' 학습'.repeat(50);
      const result = lintHookingContent({ title: '', script: longContent });
      const violation = result.violations.find(v => v.word === '1주일 마스터');
      expect(violation?.excerpt).toContain('1주일 마스터');
      expect(violation!.excerpt.length).toBeLessThanOrEqual(120);  // ±50자 + 키워드
    });
  });
  ```

- [ ] **사전 정합성 검증** — TS-STATIC-001 의 키워드 사전과 본 테스트의 시나리오가 모두 매칭되는지:
  ```ts
  describe('사전 정합성', () => {
    it.each(Object.entries(keywords.categories))('카테고리 %s 의 모든 키워드 검출', (category, words) => {
      for (const word of words as string[]) {
        const result = lintHookingContent({ title: word, script: '' });
        const detected = result.violations.some(v => v.word === word);
        expect(detected, `사전의 "${word}" 가 검출되어야 함`).toBe(true);
      }
    });
  });
  ```

- [ ] **package.json scripts**:
  ```json
  "test:unit:lint": "vitest run __tests__/lint/"
  ```

- [ ] **CI 통합** — IF-CI-001 의 unit-test Job 에 자동 포함 (별도 설정 불필요, vitest 가 모든 .test.ts 자동 검색)

- [ ] **커버리지 정책**:
  - 본 단위 테스트로 FW-LINT-001 의 카테고리 커버리지 100%
  - 사전 추가 시 본 테스트도 갱신 의무 (PR 리뷰 체크)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 5 카테고리별 키워드 검출 — 각 5건 이상
- **Given**: 25+ 시나리오
- **When**: `npm run test:unit:lint`
- **Then**: 모두 통과 (위반 검출 정확)

### Scenario 2: 정상 콘텐츠 — 위반 0
- **Given**: "GDP 의 의미" + 정상 script
- **When**: 검증
- **Then**: violations 배열 빈 배열

### Scenario 3: 정규식 패턴 검출 — 수익률·기간
- **Given**: "수익률 30%", "3일 만에"
- **When**: 검증
- **Then**: 두 패턴 모두 검출 (category: 'pattern')

### Scenario 4: false positive 방지
- **Given**: "후회를 줄이는 방법" (단독 "후회" 는 정상)
- **When**: 검증
- **Then**: violations 빈 배열 (사전이 "놓치면 후회" 같은 구절 매칭, 단독 단어 미매칭)

### Scenario 5: 띄어쓰기 변형 검출 (정규식 패턴)
- **Given**: "1 주일 만에" (띄어쓰기)
- **When**: 검증
- **Then**: 정규식 (\d+\s*일\s*만에) 매칭 → 검출

### Scenario 6: excerpt ±50자 출력
- **Given**: 긴 script + 키워드
- **When**: 검증
- **Then**: 위반의 excerpt 가 키워드 포함 + ±50자 범위

### Scenario 7: 다중 위반 — 모두 검출
- **Given**: title 과 script 양쪽에 위반
- **When**: 검증
- **Then**: 3건 이상 검출

### Scenario 8: 빈 입력 — graceful
- **Given**: title="", script=""
- **When**: 검증
- **Then**: 위반 0. 에러 0

### Scenario 9: 응답 시간 — 1만자 script ≤ 100ms
- **Given**: 1만자 script
- **When**: 검증
- **Then**: 응답 시간 ≤ 100ms

### Scenario 10: 사전 정합성 — 모든 사전 키워드 검출
- **Given**: TS-STATIC-001 의 사전
- **When**: 각 키워드 단독 입력으로 검증
- **Then**: 모두 검출 (사전이 실제 동작과 정합)

## :gear: Technical & Non-Functional Constraints
- **Vitest 기반**: vitest run + `it.each` 활용한 데이터 주도 테스트
- **5 카테고리 + edge + 정합성**: 총 50+ 시나리오
- **사전 정합성 자동 검증**: 사전 추가 시 본 테스트가 자동 검출
- **응답 시간 검증**: 1만자 script ≤ 100ms
- **false positive 방지**: 정상 콘텐츠 시나리오 의무
- **PR 리뷰 체크**: 사전 변경 시 본 테스트 갱신 의무
- **CI 자동 실행**: vitest 가 모든 .test.ts 자동 검색
- **커버리지 100%**: 5 카테고리 + 정규식 패턴 모두
- **금지**:
  - 정상 콘텐츠 시나리오 누락 (false positive 점검 안됨)
  - edge case 누락 (회귀 위험)
  - 응답 시간 검증 누락 (성능 회귀)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] 5 카테고리별 시나리오 각 5건 이상 (총 25+)
- [ ] Edge case 시나리오 (빈 입력·긴 script·다중 위반·띄어쓰기)
- [ ] excerpt 검증
- [ ] 사전 정합성 자동 검증 (it.each + Object.entries)
- [ ] 응답 시간 ≤ 100ms
- [ ] CI 통합 (자동 실행 검증)
- [ ] 커버리지 5 카테고리 + 정규식 패턴 100%
- [ ] PR 본문에 "FW-LINT-001 회귀 방지. 사전 변경 시 본 테스트 갱신 의무" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-LINT-001 (정규식 1차 — 본 테스트 대상)
  - TS-STATIC-001 (키워드 사전)
  - IF-CI-001 (워크플로 unit-test Job)
- **Blocks**:
  - FW-LINT-001 의 안정 운영
  - 사전 변경 시 회귀 방지
- **Related**:
  - REQ-FUNC-007 (Hooking Linter)
  - 콘텐츠 편집 SOP — 사전 추가·제거 시 본 테스트 갱신
