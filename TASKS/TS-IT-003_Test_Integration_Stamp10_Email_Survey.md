# [Feature] TS-IT-003: 10번째 stamp 도달 → Resend Survey 메일 E2E 통합

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-IT-003: 10번째 stamp 획득 → FW-OX-004 트리거 → Resend 메일 발송 → 익명 토큰 → Survey API E2E 통합 테스트"
labels: 'feature, test, integration, ox, stamp, survey, email, priority:critical, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-IT-003] OX 통과 → 10번째 Stamp INSERT → FW-OX-004 트리거 → Resend 메일 발송 (mock) → 메일의 anonymousToken → Survey API 익명 제출의 E2E 흐름 통합 테스트 + 멱등 검증
- **목적**: REQ-FUNC-003 (체감 변화 설문 트리거) 의 전체 흐름 회귀 방지. 단일 컴포넌트 검증 (TS-UT-010·FR-SUR-001) 외 **컴포넌트 간 데이터 흐름** 자동화로 강제 — 메일 발송 silent fail 시 데이터 무결성 보존 + 익명 토큰의 정확한 전달 + 멱등성.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-003
  - `/docs/SRS_V0_9.md#3.4.1` — OX → 스탬프 → 메일 시퀀스
- 선행: FW-OX-001, FW-OX-004 (10자리 트리거), FW-SUR-001, IF-RES-001 (Resend), CT-MOCK-003 (시나리오 B 시드)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/integration/stamp-10-survey-email-flow.test.ts`
- [ ] **Resend mock — 메일 발송 캡처**:
  ```ts
  import { vi } from 'vitest';
  vi.mock('@/lib/email/client', () => ({
    resend: {
      emails: {
        send: vi.fn().mockImplementation(async (params) => {
          return { id: 'mock-email-' + Date.now(), ...params };
        }),
      },
    },
  }));
  ```
- [ ] **시나리오 1 — 9 stamp 보유 + 10번째 OX 통과 → 메일 발송**:
  ```ts
  it('10번째 stamp — Resend 메일 발송', async () => {
    // 시나리오 B 시드 — u_almost_10 가 stamps 9건 보유
    await seedScenarioB();

    // 10번째 OX 통과
    await fetch('/api/ox/submit', {
      method: 'POST', headers: signInAs('u_almost_10'),
      body: JSON.stringify({ lesson_id: 'L010', answer: true }),
    });

    // Resend 메일 호출 검증
    expect(resend.emails.send).toHaveBeenCalledTimes(1);
    expect(resend.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'almost10@example.com',
        subject: expect.stringContaining('학습 체감 변화 설문'),
        html: expect.stringContaining('survey?token='),
      }),
    );
  });
  ```
- [ ] **시나리오 2 — EventLog `survey.milestone_email_sent` 발행 + payload 의 토큰 추출**:
  ```ts
  it('EventLog 발행 + anonymous_token 추출', async () => {
    await seedScenarioB();
    await fetch('/api/ox/submit', {
      method: 'POST', headers: signInAs('u_almost_10'),
      body: JSON.stringify({ lesson_id: 'L010', answer: true }),
    });

    const event = await prismaTest.eventLog.findFirst({
      where: { event: 'survey.milestone_email_sent', userId: 'u_almost_10' },
    });
    expect(event).toBeDefined();
    const payload = event!.payload as any;
    expect(payload.stamp_count).toBe(10);
    expect(payload.anonymous_token).toMatch(/^[0-9a-f-]{36}$/);  // UUID v4
  });
  ```
- [ ] **시나리오 3 — 메일의 토큰으로 Survey 익명 제출**:
  ```ts
  it('메일 토큰 → Survey 익명 제출 → SurveyResponse INSERT', async () => {
    await seedScenarioB();
    await fetch('/api/ox/submit', {
      method: 'POST', headers: signInAs('u_almost_10'),
      body: JSON.stringify({ lesson_id: 'L010', answer: true }),
    });

    // EventLog 에서 토큰 추출
    const event = await prismaTest.eventLog.findFirst({
      where: { event: 'survey.milestone_email_sent', userId: 'u_almost_10' },
    });
    const token = (event!.payload as any).anonymous_token;

    // Survey 익명 제출 (세션 없이)
    const surveyRes = await fetch('/api/survey', {
      method: 'POST',
      // 세션 헤더 부재 — 익명 모드
      body: JSON.stringify({
        quarter: 'Q2', year: 2026,
        less_fear_score: 4, confidence_score: 4,
        anonymous_token: token,
      }),
    });
    expect(surveyRes.status).toBe(200);

    const survey = await prismaTest.surveyResponse.findFirst({ where: { anonymousToken: token } });
    expect(survey).toBeDefined();
    expect(survey?.userId).toBeNull();  // 익명성 보장
    expect(survey?.lessFearScore).toBe(4);
  });
  ```
- [ ] **시나리오 4 — 11번째 stamp — 메일 재발송 0 (멱등)**:
  ```ts
  it('11번째 stamp — 메일 재발송 0', async () => {
    await seedScenarioB();
    await fetch('/api/ox/submit', { method: 'POST', headers: signInAs('u_almost_10'),
      body: JSON.stringify({ lesson_id: 'L010', answer: true }) });

    // 첫 번째 메일 발송
    expect(resend.emails.send).toHaveBeenCalledTimes(1);

    // 11번째 OX 통과 (다른 lesson)
    await fetch('/api/ox/submit', { method: 'POST', headers: signInAs('u_almost_10'),
      body: JSON.stringify({ lesson_id: 'L011', answer: true }) });

    // 재발송 0
    expect(resend.emails.send).toHaveBeenCalledTimes(1);

    const events = await prismaTest.eventLog.findMany({
      where: { event: 'survey.milestone_email_sent', userId: 'u_almost_10' },
    });
    expect(events.length).toBe(1);  // 멱등
  });
  ```
- [ ] **시나리오 5 — Resend 발송 실패 — silent fail (메인 흐름 영향 0)**:
  ```ts
  it('Resend 5xx — OX 채점 정상 + Sentry 알림', async () => {
    (resend.emails.send as any).mockRejectedValueOnce(new Error('Resend 5xx'));
    const sentrySpy = vi.spyOn(Sentry, 'captureException');
    await seedScenarioB();

    const oxResponse = await fetch('/api/ox/submit', {
      method: 'POST', headers: signInAs('u_almost_10'),
      body: JSON.stringify({ lesson_id: 'L010', answer: true }),
    });
    expect(oxResponse.status).toBe(200);

    // Stamp 정상 INSERT
    const stamp = await prismaTest.stamp.findUnique({
      where: { userId_lessonId: { userId: 'u_almost_10', lessonId: 'L010' } },
    });
    expect(stamp).toBeDefined();

    // Sentry 알림 호출
    expect(sentrySpy).toHaveBeenCalled();

    // EventLog 미발행 (재시도 위함)
    const events = await prismaTest.eventLog.findMany({
      where: { event: 'survey.milestone_email_sent', userId: 'u_almost_10' },
    });
    expect(events.length).toBe(0);
  });
  ```
- [ ] **시나리오 6 — Survey 분기 중복 — 409**:
  ```ts
  it('동일 토큰 + 동일 분기 재제출 — 409', async () => {
    await seedScenarioB();
    await fetch('/api/ox/submit', { method: 'POST', headers: signInAs('u_almost_10'),
      body: JSON.stringify({ lesson_id: 'L010', answer: true }) });

    const event = await prismaTest.eventLog.findFirst({ where: { event: 'survey.milestone_email_sent', userId: 'u_almost_10' } });
    const token = (event!.payload as any).anonymous_token;

    // 첫 제출
    await fetch('/api/survey', { method: 'POST',
      body: JSON.stringify({ quarter: 'Q2', year: 2026, less_fear_score: 4, confidence_score: 4, anonymous_token: token }) });

    // 두 번째 제출
    const second = await fetch('/api/survey', { method: 'POST',
      body: JSON.stringify({ quarter: 'Q2', year: 2026, less_fear_score: 5, confidence_score: 5, anonymous_token: token }) });
    expect(second.status).toBe(409);
  });
  ```
- [ ] **시나리오 7 — 메일 본문 후킹 부재 (CON-05 정합)**:
  ```ts
  it('메일 본문 — 후킹 표현 0건', async () => {
    await seedScenarioB();
    await fetch('/api/ox/submit', { method: 'POST', headers: signInAs('u_almost_10'),
      body: JSON.stringify({ lesson_id: 'L010', answer: true }) });

    const sendCall = (resend.emails.send as any).mock.calls[0][0];
    const html = sendCall.html as string;

    // TS-STATIC-001 의 사전과 정합 — 후킹 키워드 부재
    const hookingKeywords = ['1주일 만에', '100% 보장', '월 천만원', '놓치면 후회'];
    for (const kw of hookingKeywords) {
      expect(html).not.toContain(kw);
    }
  });
  ```
- [ ] **시나리오 8 — User 미존재 — graceful**:
  ```ts
  it('User 미존재 — silent fail', async () => {
    // 의도적 시나리오 — User 삭제 후 트리거
    await seedScenarioB();
    await prismaTest.user.delete({ where: { id: 'u_almost_10' } });
    // OX 호출은 인증 실패라 의미 없음
    // 본 시나리오는 직접 함수 호출
    await checkStampMilestone('u_almost_10');  // FW-OX-004 의 함수 직접 호출

    expect(resend.emails.send).not.toHaveBeenCalled();
  });
  ```
- [ ] **시나리오 9 — 응답 시간 영향 0**:
  ```ts
  it('FW-OX-004 트리거가 OX 응답 시간 미증가', async () => {
    await seedScenarioB();
    const start = Date.now();
    await fetch('/api/ox/submit', { method: 'POST', headers: signInAs('u_almost_10'),
      body: JSON.stringify({ lesson_id: 'L010', answer: true }) });
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500);  // 메일 발송이 응답 시간 영향 0 (fire-and-forget)
  });
  ```
- [ ] **시나리오 10 — KPI 집계 정합 (FR-SUR-001)**:
  ```ts
  it('KPI 응답 — 익명 응답 카운트 +1', async () => {
    await seedScenarioB();
    await fetch('/api/ox/submit', { method: 'POST', headers: signInAs('u_almost_10'),
      body: JSON.stringify({ lesson_id: 'L010', answer: true }) });

    const event = await prismaTest.eventLog.findFirst({ where: { event: 'survey.milestone_email_sent' } });
    const token = (event!.payload as any).anonymous_token;
    await fetch('/api/survey', { method: 'POST',
      body: JSON.stringify({ quarter: 'Q2', year: 2026, less_fear_score: 4, confidence_score: 4, anonymous_token: token }) });

    const kpi = await fetch('/api/kpi/survey-results', { headers: signInAs('admin1') });
    const body = await kpi.json();
    expect(body.breakdown.anonymous_count).toBeGreaterThanOrEqual(1);
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 10번째 stamp — 메일 발송
- **Given**: 9 stamp 보유
- **When**: 10번째 OX 통과
- **Then**: Resend 1회 호출

### Scenario 2: EventLog 발행 + 토큰
- **Given**: 발송 후
- **When**: EventLog 조회
- **Then**: payload 에 stamp_count: 10 + UUID 토큰

### Scenario 3: Survey 익명 제출
- **Given**: 토큰
- **When**: POST /api/survey
- **Then**: SurveyResponse INSERT + userId NULL

### Scenario 4: 11번째 stamp — 멱등
- **Given**: 첫 메일 발송 후
- **When**: 11번째 OX
- **Then**: Resend 추가 호출 0

### Scenario 5: Resend 5xx — silent fail
- **Given**: Resend 실패
- **When**: 호출
- **Then**: OX 200 + Stamp 정상 + Sentry 알림 + EventLog 미발행

### Scenario 6: 분기 중복 — 409
- **Given**: 동일 토큰 + 동일 분기
- **When**: 재제출
- **Then**: 409

### Scenario 7: 메일 후킹 부재
- **Given**: 발송된 html
- **When**: 검사
- **Then**: 사전 키워드 0

### Scenario 8: User 미존재 graceful
- **Given**: User 삭제
- **When**: 함수 직접 호출
- **Then**: silent (메일 미발송)

### Scenario 9: 응답 시간 영향 0
- **Given**: OX 호출
- **When**: 측정
- **Then**: ≤ 500ms

### Scenario 10: KPI 정합
- **Given**: 익명 제출
- **When**: KPI 조회
- **Then**: anonymous_count ≥ 1

## :gear: Technical & Non-Functional Constraints
- **Resend mock 활용**: 외부 SDK 호출 없이 시그니처 검증
- **scenario_b 시드 활용 (CT-MOCK-003)**: 9 stamp 보유 사용자 사전 설정
- **silent fail 검증 의무**: 메인 흐름 영향 0
- **멱등 강제**: EventLog 기반 1회만 발송
- **CON-05 후킹 부재 검증**: 메일 본문도 정책 준수
- **응답 시간 영향 0**: fire-and-forget 패턴
- **익명성 강제**: SurveyResponse.userId NULL
- **CI 실행 시간**: ≤ 20초
- **금지**:
  - 메일 발송 실패가 OX 흐름 차단
  - 멱등 위반 (재발송)
  - 후킹 표현 메일 본문
  - User 식별자 SurveyResponse 저장 (익명성 위반)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Resend mock 활용
- [ ] scenario_b 시드 정합
- [ ] silent fail + Sentry 알림 검증
- [ ] 멱등 검증
- [ ] CON-05 후킹 부재 검증
- [ ] 응답 시간 영향 0 검증
- [ ] 익명성 강제
- [ ] CI 통합
- [ ] PR 본문에 "REQ-FUNC-003 E2E 회귀 방지 + 익명성 + 멱등 + silent fail" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-OX-001 (OX 채점)
  - FW-OX-004 (10자리 트리거)
  - FW-SUR-001 (Survey 본체)
  - IF-RES-001 (Resend mock)
  - CT-MOCK-003 (scenario_b)
  - TS-IT-001 (정상 흐름 패턴)
- **Blocks**:
  - REQ-FUNC-003 운영 신뢰성
  - Public Pilot 진입 시점의 Survey 흐름
- **Related**:
  - TS-UT-010 (Survey 단위 테스트)
  - FR-SUR-001 (KPI)
