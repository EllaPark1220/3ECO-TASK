# [Feature] TS-UT-007: Stamp UNIQUE 제약 단위 테스트 — 직접 INSERT 시 P2002 + Option B 영구 멱등

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-UT-007: Stamp 모델 @@unique([userId, lessonId]) 검증 — 중복 INSERT 시 P2002 + FW-OX-001 의 catch 변환 검증"
labels: 'feature, test, unit, stamp, db-constraint, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-UT-007] CT-DB-005 (Stamp 모델) 의 `@@unique([userId, lessonId])` 제약 단위 테스트 — 직접 prisma.stamp.create 호출 시 동일 (userId, lessonId) 중복은 P2002 throw + FW-OX-001 의 catch → 200 변환 (Option B 영구 멱등) 검증
- **목적**: SRS §1.5.1.1 의 Option B (Stamp UNIQUE + P2002 catch) 회귀 방지. 사용자가 동일 lesson OX 통과 후 재시도 시 stamp 중복 INSERT 가 영구 차단되어야 한다 — 데이터 무결성 + 통계 왜곡 방지.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.1.1` — Option B (Stamp UNIQUE + P2002 영구 멱등)
  - `/docs/SRS_V0_9.md#6.2.2` — STAMP 테이블 (`@@unique([userId, lessonId])`)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-12 (Stamp vs LessonProgress 정합)
- 외부: Prisma P2002 UNIQUE 위반 에러
- 선행: CT-DB-005 (Stamp 모델), FW-OX-001 (catch 변환), CT-MOCK-001~003

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/services/stamp-unique.test.ts`
- [ ] **시나리오 1 — 첫 INSERT 정상**:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { Prisma } from '@prisma/client';
  import { resetTestDb, seedTestData, prismaTest } from '@/__tests__/helpers/db';

  describe('CT-DB-005 Stamp UNIQUE 제약', () => {
    beforeEach(async () => {
      await resetTestDb();
      await seedTestData();  // u1, L001~L010
    });

    it('첫 INSERT — 정상', async () => {
      const stamp = await prismaTest.stamp.create({
        data: { userId: 'u1', lessonId: 'L001' },
      });
      expect(stamp.id).toBeDefined();
      expect(stamp.userId).toBe('u1');
      expect(stamp.lessonId).toBe('L001');
    });
  });
  ```
- [ ] **시나리오 2 — 중복 INSERT — P2002 throw**:
  ```ts
  it('중복 INSERT — P2002 throw', async () => {
    await prismaTest.stamp.create({ data: { userId: 'u1', lessonId: 'L001' } });

    await expect(
      prismaTest.stamp.create({ data: { userId: 'u1', lessonId: 'L001' } })
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);

    try {
      await prismaTest.stamp.create({ data: { userId: 'u1', lessonId: 'L001' } });
    } catch (error) {
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
    }
  });
  ```
- [ ] **시나리오 3 — 다른 user — 정상**:
  ```ts
  it('다른 user 동일 lesson — 정상', async () => {
    await prismaTest.stamp.create({ data: { userId: 'u1', lessonId: 'L001' } });
    const stamp2 = await prismaTest.stamp.create({ data: { userId: 'u2', lessonId: 'L001' } });
    expect(stamp2.id).toBeDefined();

    const total = await prismaTest.stamp.count({ where: { lessonId: 'L001' } });
    expect(total).toBe(2);
  });
  ```
- [ ] **시나리오 4 — 다른 lesson — 정상**:
  ```ts
  it('동일 user 다른 lesson — 정상', async () => {
    await prismaTest.stamp.create({ data: { userId: 'u1', lessonId: 'L001' } });
    const stamp2 = await prismaTest.stamp.create({ data: { userId: 'u1', lessonId: 'L002' } });
    expect(stamp2.id).toBeDefined();

    const total = await prismaTest.stamp.count({ where: { userId: 'u1' } });
    expect(total).toBe(2);
  });
  ```
- [ ] **시나리오 5 — FW-OX-001 의 catch 변환 — 200 응답**:
  ```ts
  // FW-OX-001 의 submitOx 본체가 P2002 catch → 200 응답 변환
  import { submitOx } from '@/lib/services/ox';

  it('OX 통과 후 재시도 — Stamp 중복이지만 200 응답', async () => {
    // 1차 OX 통과 → Stamp INSERT
    const first = await submitOx({ lessonId: 'L001', answer: true });
    expect(first.passed).toBe(true);
    expect(first.stampEarned).toBe(true);

    // 2차 동일 OX 재시도 → Stamp 중복 — Option B 변환
    const second = await submitOx({ lessonId: 'L001', answer: true });
    expect(second.passed).toBe(true);  // 200 응답 (에러 0)
    expect(second.stampEarned).toBe(true);  // 이미 보유 — true 표시
    expect(second.alreadyEarned).toBe(true);  // 추가 플래그 (Option B 시그널)
  });
  ```
- [ ] **시나리오 6 — Stamp 카운트 1건 유지 (재시도 후)**:
  ```ts
  it('재시도 후 Stamp 카운트 1건 유지', async () => {
    await submitOx({ lessonId: 'L001', answer: true });
    await submitOx({ lessonId: 'L001', answer: true });
    await submitOx({ lessonId: 'L001', answer: true });

    const stamps = await prismaTest.stamp.findMany({ where: { userId: 'u1', lessonId: 'L001' } });
    expect(stamps.length).toBe(1);
  });
  ```
- [ ] **시나리오 7 — earnedAt 첫 INSERT 시점 보존**:
  ```ts
  it('재시도 시 earnedAt 첫 INSERT 시점 보존 (변경 0)', async () => {
    const first = await prismaTest.stamp.create({ data: { userId: 'u1', lessonId: 'L001' } });
    const initialEarnedAt = first.earnedAt;

    await new Promise(r => setTimeout(r, 100));

    // 직접 upsert
    await prismaTest.stamp.upsert({
      where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
      create: { userId: 'u1', lessonId: 'L001' },
      update: {},  // 변경 0
    });

    const final = await prismaTest.stamp.findUnique({
      where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
    });
    expect(final?.earnedAt.getTime()).toBe(initialEarnedAt.getTime());
  });
  ```
- [ ] **시나리오 8 — Stamp INSERT 시 EventLog `ox.duplicate_idempotent` 발행 (재시도)**:
  ```ts
  it('재시도 시 EventLog ox.duplicate_idempotent 발행', async () => {
    await submitOx({ lessonId: 'L001', answer: true });  // 1차
    await submitOx({ lessonId: 'L001', answer: true });  // 2차 (재시도)

    const events = await prismaTest.eventLog.findMany({
      where: { event: 'ox.duplicate_idempotent' },
    });
    expect(events.length).toBe(1);
    expect(events[0].payload).toMatchObject({ lesson_id: 'L001' });
  });
  ```
- [ ] **시나리오 9 — 동시 Stamp INSERT (race condition) — 1건만 성공**:
  ```ts
  it('동시 Stamp INSERT race condition — 1건만 성공', async () => {
    const promises = Array.from({ length: 10 }, () =>
      prismaTest.stamp.create({ data: { userId: 'u1', lessonId: 'L001' } }).catch(() => null)
    );
    const results = await Promise.all(promises);

    const success = results.filter(r => r !== null);
    expect(success.length).toBe(1);  // 정확히 1건만 성공

    const stamps = await prismaTest.stamp.findMany({ where: { userId: 'u1', lessonId: 'L001' } });
    expect(stamps.length).toBe(1);
  });
  ```
- [ ] **시나리오 10 — INV-12 정합 — Stamp 카운트 = LessonProgress(stampEarned=true) 카운트**:
  ```ts
  it('INV-12 정합 — Stamp 카운트 = LessonProgress(stampEarned=true) 카운트', async () => {
    await submitOx({ lessonId: 'L001', answer: true });
    await submitOx({ lessonId: 'L002', answer: true });
    await submitOx({ lessonId: 'L003', answer: false });  // 오답

    const stampCount = await prismaTest.stamp.count({ where: { userId: 'u1' } });
    const earnedCount = await prismaTest.lessonProgress.count({
      where: { userId: 'u1', stampEarned: true },
    });
    expect(stampCount).toBe(earnedCount);  // 둘 다 2
    expect(stampCount).toBe(2);
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 첫 INSERT 정상
- **Given**: 빈 Stamp 테이블
- **When**: create({ userId, lessonId })
- **Then**: 정상 + id 반환

### Scenario 2: 중복 INSERT P2002
- **Given**: 1건 존재
- **When**: 동일 (userId, lessonId) 재 create
- **Then**: throw P2002

### Scenario 3: 다른 user 정상
- **Given**: u1 의 stamp
- **When**: u2 의 동일 lesson create
- **Then**: 정상 + 카운트 2

### Scenario 4: 다른 lesson 정상
- **Given**: L001 stamp
- **When**: L002 create
- **Then**: 정상 + 카운트 2

### Scenario 5: FW-OX-001 catch 변환 — 200 응답
- **Given**: 1차 OX 통과
- **When**: 동일 lesson 재시도 (정답)
- **Then**: 200 응답 + alreadyEarned: true

### Scenario 6: 재시도 카운트 1건
- **Given**: 3회 재시도
- **When**: 조회
- **Then**: Stamp 1건

### Scenario 7: earnedAt 첫 시점 보존
- **Given**: 1차 INSERT
- **When**: upsert (변경 0)
- **Then**: earnedAt 변경 0

### Scenario 8: 재시도 시 ox.duplicate_idempotent EventLog
- **Given**: 재시도
- **When**: EventLog 조회
- **Then**: `ox.duplicate_idempotent` 1건 + payload 정합

### Scenario 9: 동시 race condition — 1건만
- **Given**: Promise.all 10건
- **When**: 완료
- **Then**: 정확히 1건 success + 9건 P2002

### Scenario 10: INV-12 정합
- **Given**: OX 통과 2건 + 오답 1건
- **When**: 카운트 비교
- **Then**: Stamp = LessonProgress(stampEarned=true) = 2

## :gear: Technical & Non-Functional Constraints
- **CT-DB-005 의 @@unique 강제**: 데이터 레이어 정책
- **Option B (영구 멱등) 정합**: P2002 catch 가 200 응답 변환
- **earnedAt 보존**: 재시도가 첫 발급 시점 손상 0
- **INV-12 정합**: Stamp 카운트 = LessonProgress(stampEarned=true) 카운트
- **race condition 안전**: PostgreSQL UNIQUE atomic
- **EventLog ox.duplicate_idempotent**: Option A 트리거 측정용 (재시도 카운트)
- **응답 시간**: 각 INSERT/upsert ≤ 50ms
- **금지**:
  - earnedAt 재시도 시 갱신 (이력 손상)
  - P2002 catch 누락 (사용자 에러 노출)
  - INV-12 위반 시드

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `__tests__/services/stamp-unique.test.ts` 작성
- [ ] @@unique 제약 검증
- [ ] FW-OX-001 의 catch 변환 검증
- [ ] earnedAt 보존 검증
- [ ] INV-12 정합 검증
- [ ] race condition 안전 검증
- [ ] EventLog ox.duplicate_idempotent 발행 검증
- [ ] CI 통합 검증
- [ ] PR 본문에 "Option B 영구 멱등 회귀 방지" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-005 (Stamp 모델 — @@unique)
  - FW-OX-001 (P2002 catch 변환)
  - CT-MOCK-001~003
  - IF-CI-001
- **Blocks**:
  - SRS §1.5.1.1 Option B 안정 운영
  - INV-12 정합 보장
- **Related**:
  - TS-UT-006 (LWW)
  - TS-IT-001 (OX → Stamp 통합)
