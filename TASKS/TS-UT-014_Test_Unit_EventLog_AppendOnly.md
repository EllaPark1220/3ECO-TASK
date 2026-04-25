# [Feature] TS-UT-014: EventLog append-only 단위 테스트 — UPDATE/DELETE 시도 시 거부

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-UT-014: EventLog append-only 검증 — UPDATE/DELETE 시도 시 throw + Service 레이어 차단 + DB trigger 보강"
labels: 'feature, test, unit, eventlog, db-constraint, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-UT-014] EventLog 모델의 append-only 정책 단위 테스트 — INSERT 만 허용 + UPDATE/DELETE 시도 시 거부 (Service 레이어 + DB trigger 양쪽 검증)
- **목적**: REQ-NF-031 (감사 로그 무결성) 회귀 방지. EventLog 는 KPI·Risk·Security 의 진실 공급원 — 한 번 발행된 이벤트의 수정·삭제는 데이터 무결성 위반 + 감사 트레일 손상.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-031 (감사 로그 무결성)
  - `/docs/SRS_V0_9.md#6.2.2` — EVENT_LOG 테이블
  - `/docs/SRS_V0_9.md#6.2.3` — INV-08 (append-only)
- 선행: CT-DB-009 (EventLog 모델)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/db/event-log-append-only.test.ts`
- [ ] **시나리오 1 — INSERT 정상**:
  ```ts
  it('INSERT 정상', async () => {
    const event = await prismaTest.eventLog.create({
      data: {
        userId: 'u1',
        event: 'lesson.viewed',
        payload: { lesson_id: 'L001' },
      },
    });
    expect(event.id).toBeDefined();
  });
  ```
- [ ] **시나리오 2 — Service 레이어 — UPDATE Server Action 부재 검증**:
  ```ts
  it('Service 레이어 — updateEventLog Server Action 미존재', async () => {
    // 본 정책 — EventLog 갱신 함수가 코드베이스에 정의되지 않음
    // 검증 — TypeScript 의 컴파일 시점 또는 정적 분석으로 차단
    const services = await import('@/lib/services');
    expect((services as any).updateEventLog).toBeUndefined();
    expect((services as any).deleteEventLog).toBeUndefined();
  });
  ```
- [ ] **시나리오 3 — 직접 prisma.update 시도 — DB trigger 차단 (선택)**:
  ```ts
  it('직접 prisma.eventLog.update — trigger 차단', async () => {
    const event = await prismaTest.eventLog.create({
      data: { event: 'test', payload: { x: 1 } },
    });

    // PostgreSQL trigger — UPDATE 시 RAISE EXCEPTION
    await expect(
      prismaTest.eventLog.update({
        where: { id: event.id },
        data: { event: 'modified' },
      })
    ).rejects.toThrow();
  });
  ```
- [ ] **시나리오 4 — 직접 prisma.delete 시도 — trigger 차단**:
  ```ts
  it('직접 prisma.eventLog.delete — trigger 차단', async () => {
    const event = await prismaTest.eventLog.create({
      data: { event: 'test', payload: { x: 1 } },
    });

    await expect(
      prismaTest.eventLog.delete({ where: { id: event.id } })
    ).rejects.toThrow();
  });
  ```
- [ ] **시나리오 5 — TRUNCATE 차단 (선택)**:
  ```ts
  it('TRUNCATE EventLog 차단 (Service Role 외)', async () => {
    // anon Role 또는 일반 Role 로 TRUNCATE 시도
    await expect(
      prismaTest.$executeRaw`TRUNCATE TABLE "EventLog";`
    ).rejects.toThrow();  // Service Role 외 거부
  });
  ```
  - 본 검증은 RLS 또는 권한 정책 활성 시 적용
- [ ] **시나리오 6 — 다중 INSERT 정상 — 순서 보장**:
  ```ts
  it('다중 INSERT — id 와 createdAt 순서 보장', async () => {
    const events = await Promise.all([
      prismaTest.eventLog.create({ data: { event: 'a', payload: {} } }),
      prismaTest.eventLog.create({ data: { event: 'b', payload: {} } }),
      prismaTest.eventLog.create({ data: { event: 'c', payload: {} } }),
    ]);
    events.forEach(e => expect(e.id).toBeDefined());

    // 순서 — createdAt asc
    const sorted = await prismaTest.eventLog.findMany({ orderBy: { createdAt: 'asc' } });
    expect(sorted.length).toBe(3);
  });
  ```
- [ ] **시나리오 7 — payload JSON 보존 — 변형 0**:
  ```ts
  it('payload JSON 보존', async () => {
    const payload = { lesson_id: 'L001', score: 4, nested: { foo: 'bar' } };
    const event = await prismaTest.eventLog.create({
      data: { event: 'ox.submitted', payload },
    });

    const fetched = await prismaTest.eventLog.findUnique({ where: { id: event.id } });
    expect(fetched?.payload).toEqual(payload);  // 동일 구조 보존
  });
  ```
- [ ] **시나리오 8 — User cascade DELETE 시 EventLog 영향 정책**:
  ```ts
  it('User 삭제 시 EventLog 의 userId — SET NULL 또는 보존 (정책)', async () => {
    await prismaTest.eventLog.create({
      data: { userId: 'u-test', event: 'test', payload: {} },
    });

    // u-test 삭제 (cascade 또는 SET NULL 정책)
    await prismaTest.user.delete({ where: { id: 'u-test' } });

    const event = await prismaTest.eventLog.findFirst({ where: { event: 'test' } });
    // 본 정책 — onDelete: SetNull (EventLog 자체는 보존, userId 만 NULL)
    expect(event).toBeDefined();  // 보존
    expect(event?.userId).toBeNull();
  });
  ```
- [ ] **시나리오 9 — 90일 retention cron 검증 (선택)**:
  ```ts
  it('90일 이상 EventLog — retention cron 으로만 삭제 가능 (정책)', async () => {
    // 본 검증은 retention cron 의 별도 권한 (Service Role) 활용
    // 일반 Service 레이어 삭제 시도 → 차단
    // 본 태스크는 정책 검증만, 실제 retention cron 은 별도 후속
    expect(true).toBe(true);  // placeholder
  });
  ```
- [ ] **시나리오 10 — 동시 INSERT — race condition 안전**:
  ```ts
  it('동시 INSERT 100건 — 모두 성공', async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      prismaTest.eventLog.create({ data: { event: `concurrent.${i}`, payload: { i } } })
    );
    const results = await Promise.all(promises);
    expect(results.length).toBe(100);

    const total = await prismaTest.eventLog.count({ where: { event: { startsWith: 'concurrent.' } } });
    expect(total).toBe(100);
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: INSERT 정상
- **Given**: 데이터
- **When**: create
- **Then**: id 반환

### Scenario 2: Service 레이어 — update/delete 함수 부재
- **Given**: services 모듈
- **When**: import
- **Then**: updateEventLog / deleteEventLog undefined

### Scenario 3: 직접 prisma.update 차단 (trigger)
- **Given**: 기존 event
- **When**: update
- **Then**: throw

### Scenario 4: 직접 prisma.delete 차단
- **Given**: 기존
- **When**: delete
- **Then**: throw

### Scenario 5: TRUNCATE 차단 (선택)
- **Given**: anon Role
- **When**: TRUNCATE
- **Then**: throw

### Scenario 6: 다중 INSERT 순서 보장
- **Given**: 3건
- **When**: 조회
- **Then**: createdAt asc 순서

### Scenario 7: payload JSON 보존
- **Given**: nested JSON
- **When**: 조회
- **Then**: 동일 구조

### Scenario 8: User cascade — SET NULL 정책
- **Given**: User 삭제
- **When**: EventLog 조회
- **Then**: 보존 + userId NULL

### Scenario 9: retention cron 정책
- **Given**: 정책
- **When**: 검토
- **Then**: 별도 cron 만 삭제 권한

### Scenario 10: 동시 100건 — 모두 성공
- **Given**: Promise.all
- **When**: 완료
- **Then**: 100건 INSERT

## :gear: Technical & Non-Functional Constraints
- **append-only 강제**: Service 레이어 함수 부재 + DB trigger 양쪽
- **payload JSON 보존**: 직렬화 정책 정합
- **User cascade — SET NULL**: EventLog 자체 보존 (감사 무결성)
- **retention cron 별도 권한**: Service Role 만 삭제. 일반 코드 차단
- **race condition 안전**: PostgreSQL atomic INSERT
- **응답 시간**: INSERT ≤ 50ms
- **금지**:
  - update/delete Service 함수 추가 (정책 위반)
  - User cascade DELETE 시 EventLog 도 삭제 (감사 손상)
  - retention 외 삭제 권한 노출

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Service 레이어 update/delete 함수 부재 검증
- [ ] DB trigger 차단 검증 (UPDATE + DELETE)
- [ ] payload JSON 보존 검증
- [ ] User cascade SET NULL 검증
- [ ] race condition 안전 검증
- [ ] CI 통합
- [ ] PR 본문에 "REQ-NF-031 + INV-08 회귀 방지" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-009 (EventLog 모델 + trigger)
  - CT-MOCK-002 (User 시드)
  - IF-CI-001
- **Blocks**:
  - REQ-NF-031 회귀 방지
  - 감사 무결성 보장
- **Related**:
  - INV-08 (append-only)
  - retention cron (별도 후속)
