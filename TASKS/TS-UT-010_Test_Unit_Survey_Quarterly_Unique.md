# [Feature] TS-UT-010: Survey 분기당 1회 제한 단위 테스트 — INV-09 + P2002 변환

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-UT-010: FW-SUR-001 분기 1회 제한 단위 테스트 — 두 UNIQUE (userId / anonymousToken) + P2002 → 409 변환 + INV-09"
labels: 'feature, test, unit, survey, db-constraint, priority:high, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-UT-010] FW-SUR-001 (submitSurvey) 와 CT-DB-008 의 두 UNIQUE (`(userId, quarter, year)` + `(anonymousToken, quarter, year)`) 단위 테스트 — 분기 중복 시도 시 P2002 → 409 변환 + 익명/로그인 모드 분리
- **목적**: INV-09 (분기당 1회) 회귀 방지. REQ-NF-043 ("덜 두렵다" ≥60%) 측정의 데이터 무결성 — 동일 분기 다중 응답이 KPI 왜곡 위험.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.2.3` — INV-09 (분기당 1회)
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-003 (체감 변화 설문)
  - `/docs/SRS_V0_9.md#6.2.2` — SURVEY_RESPONSE 두 UNIQUE
- 선행: CT-DB-008 (모델), FW-SUR-001 (Server Action), CT-API-008 (Contract)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/services/survey-uniqueness.test.ts`
- [ ] **시나리오 1 — 로그인 모드 첫 INSERT 정상**:
  ```ts
  it('로그인 모드 — 첫 분기 INSERT 정상', async () => {
    const result = await submitSurvey({
      quarter: 'Q2', year: 2026,
      less_fear_score: 4, confidence_score: 4,
    });
    expect(result.ok).toBe(true);
    expect(result.is_anonymous).toBe(false);
  });
  ```
- [ ] **시나리오 2 — 로그인 모드 동일 분기 중복 — 409**:
  ```ts
  it('동일 (userId, Q2, 2026) 중복 — SURVEY_ALREADY_SUBMITTED', async () => {
    await submitSurvey({ quarter: 'Q2', year: 2026, less_fear_score: 4, confidence_score: 4 });

    await expect(
      submitSurvey({ quarter: 'Q2', year: 2026, less_fear_score: 5, confidence_score: 5 })
    ).rejects.toThrow('SURVEY_ALREADY_SUBMITTED');
  });
  ```
- [ ] **시나리오 3 — 다른 분기 정상**:
  ```ts
  it('동일 user, 다른 분기 — 정상', async () => {
    await submitSurvey({ quarter: 'Q1', year: 2026, less_fear_score: 3, confidence_score: 3 });
    const result = await submitSurvey({ quarter: 'Q2', year: 2026, less_fear_score: 4, confidence_score: 4 });
    expect(result.ok).toBe(true);
  });
  ```
- [ ] **시나리오 4 — 익명 모드 첫 INSERT 정상**:
  ```ts
  it('익명 모드 — anonymousToken 첫 INSERT 정상', async () => {
    const token = crypto.randomUUID();
    // 세션 없이 호출
    const result = await submitSurveyAnonymous({
      quarter: 'Q2', year: 2026,
      less_fear_score: 5, confidence_score: 4,
      anonymous_token: token,
    });
    expect(result.ok).toBe(true);
    expect(result.is_anonymous).toBe(true);
  });
  ```
- [ ] **시나리오 5 — 익명 모드 동일 토큰 중복 — 409**:
  ```ts
  it('동일 (anonymousToken, Q2, 2026) 중복 — SURVEY_ALREADY_SUBMITTED', async () => {
    const token = crypto.randomUUID();
    await submitSurveyAnonymous({ quarter: 'Q2', year: 2026, anonymous_token: token, less_fear_score: 4, confidence_score: 4 });

    await expect(
      submitSurveyAnonymous({ quarter: 'Q2', year: 2026, anonymous_token: token, less_fear_score: 5, confidence_score: 5 })
    ).rejects.toThrow('SURVEY_ALREADY_SUBMITTED');
  });
  ```
- [ ] **시나리오 6 — 다른 토큰 동일 분기 — 정상**:
  ```ts
  it('다른 anonymousToken 동일 분기 — 별도 row', async () => {
    const t1 = crypto.randomUUID();
    const t2 = crypto.randomUUID();
    await submitSurveyAnonymous({ quarter: 'Q2', year: 2026, anonymous_token: t1, /* ... */ });
    const r2 = await submitSurveyAnonymous({ quarter: 'Q2', year: 2026, anonymous_token: t2, /* ... */ });
    expect(r2.ok).toBe(true);

    const total = await prismaTest.surveyResponse.count();
    expect(total).toBe(2);
  });
  ```
- [ ] **시나리오 7 — 로그인 + 익명 모드 동일 분기 — 별도 row**:
  ```ts
  it('동일 분기에 로그인 + 익명 동시 — 별도 row (다른 키)', async () => {
    await submitSurvey({ quarter: 'Q2', year: 2026, less_fear_score: 4, confidence_score: 4 });

    const token = crypto.randomUUID();
    await submitSurveyAnonymous({ quarter: 'Q2', year: 2026, anonymous_token: token, less_fear_score: 5, confidence_score: 5 });

    const total = await prismaTest.surveyResponse.count();
    expect(total).toBe(2);  // 로그인 1건 + 익명 1건
  });
  ```
- [ ] **시나리오 8 — XOR 강제 — userId + token 둘 다 NULL — 거부**:
  ```ts
  it('userId 와 anonymousToken 동시 NULL — 거부', async () => {
    await expect(
      prismaTest.surveyResponse.create({
        data: {
          userId: null,
          anonymousToken: null,  // XOR 위반
          quarter: 'Q2', year: 2026,
          lessFearScore: 4, confidenceScore: 4,
        },
      })
    ).rejects.toThrow();  // CHECK 위반
  });
  ```
- [ ] **시나리오 9 — XOR — 둘 다 값 — 거부**:
  ```ts
  it('userId 와 anonymousToken 동시 값 — 거부', async () => {
    await expect(
      prismaTest.surveyResponse.create({
        data: {
          userId: 'u1',
          anonymousToken: crypto.randomUUID(),  // XOR 위반 — 둘 다 값
          quarter: 'Q2', year: 2026,
          lessFearScore: 4, confidenceScore: 4,
        },
      })
    ).rejects.toThrow();
  });
  ```
- [ ] **시나리오 10 — Likert 범위 — Zod 검증**:
  ```ts
  it('lessFearScore 6 — Zod 거부 (Server Action 진입 시)', async () => {
    await expect(
      submitSurvey({ quarter: 'Q2', year: 2026, less_fear_score: 6, confidence_score: 4 })
    ).rejects.toThrow();  // Zod refine
  });

  it('lessFearScore 0 — Zod 거부', async () => {
    await expect(
      submitSurvey({ quarter: 'Q2', year: 2026, less_fear_score: 0, confidence_score: 4 })
    ).rejects.toThrow();
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 로그인 첫 INSERT 정상
- **Given**: 신규
- **When**: submitSurvey
- **Then**: ok: true

### Scenario 2: 로그인 중복 — 409
- **Given**: 동일 분기 존재
- **When**: 재제출
- **Then**: throw SURVEY_ALREADY_SUBMITTED

### Scenario 3: 다른 분기 정상
- **Given**: Q1 후
- **When**: Q2 제출
- **Then**: ok: true

### Scenario 4: 익명 첫 INSERT
- **Given**: 신규 토큰
- **When**: 호출
- **Then**: is_anonymous: true

### Scenario 5: 익명 중복 — 409
- **Given**: 동일 토큰 + 동일 분기
- **When**: 재제출
- **Then**: throw

### Scenario 6: 다른 토큰 별도 row
- **Given**: 두 토큰
- **When**: 제출
- **Then**: row 2건

### Scenario 7: 로그인 + 익명 별도 row
- **Given**: 동일 분기
- **When**: 두 모드 모두
- **Then**: row 2건

### Scenario 8: XOR — 둘 다 NULL 거부
- **Given**: 데이터
- **When**: INSERT
- **Then**: throw

### Scenario 9: XOR — 둘 다 값 거부
- **Given**: 데이터
- **When**: INSERT
- **Then**: throw

### Scenario 10: Likert 범위 거부
- **Given**: 0 또는 6
- **When**: 호출
- **Then**: Zod throw

## :gear: Technical & Non-Functional Constraints
- **두 UNIQUE 제약**: (userId, quarter, year) + (anonymousToken, quarter, year)
- **XOR CHECK**: userId XOR anonymousToken 강제
- **P2002 → 409 변환**: FW-SUR-001 의 catch
- **Zod 우선**: Likert 범위 (1~5) 거부
- **PostgreSQL UNIQUE — NULL 허용 정책**: NULL 끼리는 unique 처리 (각 다른 값) — 본 schema 정책 정합
- **응답 시간**: 각 ≤ 100ms
- **금지**:
  - 분기 중복 허용 (KPI 왜곡)
  - XOR 위반 row (모순 데이터)
  - Likert 범위 외 (정책 위반)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] 두 UNIQUE 검증
- [ ] XOR CHECK 검증
- [ ] P2002 → 409 변환 검증
- [ ] Likert 범위 Zod 검증
- [ ] CI 통합
- [ ] PR 본문에 "INV-09 회귀 방지" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-008 (SurveyResponse 모델 — 두 UNIQUE + XOR CHECK)
  - FW-SUR-001 (Server Action — P2002 변환)
  - CT-API-008 (Zod schema)
  - IF-CI-001
- **Blocks**:
  - INV-09 회귀 방지
  - REQ-NF-043 측정 무결성
- **Related**:
  - FR-SUR-001 (KPI 집계)
  - FW-OX-004 (10자리 트리거 — 익명 토큰 활용)
