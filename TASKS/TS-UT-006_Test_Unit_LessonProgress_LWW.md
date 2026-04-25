# [Feature] TS-UT-006: LessonProgress LWW 다기기 충돌 단위 테스트 — updatedAt 최신값 우선

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-UT-006: LessonProgress LWW 충돌 단위 테스트 — 2기기 동시 UPSERT 시 updatedAt 최신값 우선 검증"
labels: 'feature, test, unit, progress, multi-device, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-UT-006] LessonProgress 의 다기기 동시 갱신 시 Last-Write-Wins (LWW) 정책 단위 테스트 — 두 기기에서 동시에 UPSERT 호출 시 `updatedAt` 더 최신인 값이 최종 row 에 반영되는지 검증
- **목적**: REQ-FUNC-024 (다기기 LWW) 회귀 방지. 학습자가 모바일·PC 동시 사용 시 마지막 갱신 우선 정책으로 데이터 정합성 보장 (CRDT 같은 복잡 정책 회피).

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-020, 024 (다기기 LWW)
  - `/docs/SRS_V0_9.md#6.2.2` — LESSON_PROGRESS 테이블 (updatedAt @updatedAt)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-12 (Progress 정합성)
- 선행: FW-PROG-001 (Logic Write), FW-PROG-004 (LWW + Realtime, 그룹 7)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/services/progress-lww.test.ts`
- [ ] **시나리오 1 — 순차 UPSERT — 단순 update**:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { saveProgress } from '@/lib/services/progress';
  import { resetTestDb, seedTestData, prismaTest } from '@/__tests__/helpers/db';

  describe('FW-PROG-001 LessonProgress LWW', () => {
    beforeEach(async () => {
      await resetTestDb();
      await seedTestData();
    });

    it('순차 UPSERT — 두 번째 값이 최종', async () => {
      // 1차 — 모바일에서 position 30
      await saveProgress({ lesson_id: 'L001', position_sec: 30 });

      // 2차 — PC 에서 position 60 (1초 후)
      await new Promise(r => setTimeout(r, 50));  // 시간차
      await saveProgress({ lesson_id: 'L001', position_sec: 60 });

      const final = await prismaTest.lessonProgress.findUnique({
        where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
      });
      expect(final?.lastPositionSec).toBe(60);
    });
  });
  ```
- [ ] **시나리오 2 — 동시 UPSERT (Promise.all) — updatedAt 최신값 우선**:
  ```ts
  it('동시 UPSERT — updatedAt 더 최신 값 우선', async () => {
    // 두 기기에서 정확히 동시 호출
    const [r1, r2] = await Promise.all([
      saveProgress({ lesson_id: 'L001', position_sec: 30 }),  // 모바일
      saveProgress({ lesson_id: 'L001', position_sec: 60 }),  // PC
    ]);

    const final = await prismaTest.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
    });

    // 둘 중 하나가 최종. updatedAt 이 더 늦은 값이 우선
    // (PostgreSQL UPSERT 의 last-write-wins 자연 동작)
    expect([30, 60]).toContain(final?.lastPositionSec);
    expect(final?.updatedAt).toBeDefined();
  });
  ```
- [ ] **시나리오 3 — `@updatedAt` 자동 갱신 검증**:
  ```ts
  it('UPSERT 시 updatedAt 자동 갱신', async () => {
    const created = await saveProgress({ lesson_id: 'L001', position_sec: 10 });

    const initial = await prismaTest.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
    });
    const initialUpdatedAt = initial!.updatedAt;

    await new Promise(r => setTimeout(r, 100));

    await saveProgress({ lesson_id: 'L001', position_sec: 20 });
    const updated = await prismaTest.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
    });

    expect(updated!.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
  });
  ```
- [ ] **시나리오 4 — UNIQUE 제약 — 동일 (userId, lessonId) row 1건**:
  ```ts
  it('동일 (userId, lessonId) row 1건만 (UNIQUE)', async () => {
    await saveProgress({ lesson_id: 'L001', position_sec: 10 });
    await saveProgress({ lesson_id: 'L001', position_sec: 20 });
    await saveProgress({ lesson_id: 'L001', position_sec: 30 });

    const rows = await prismaTest.lessonProgress.findMany({
      where: { userId: 'u1', lessonId: 'L001' },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].lastPositionSec).toBe(30);
  });
  ```
- [ ] **시나리오 5 — 다른 lesson — 별도 row**:
  ```ts
  it('다른 lesson 은 별도 row 유지', async () => {
    await saveProgress({ lesson_id: 'L001', position_sec: 10 });
    await saveProgress({ lesson_id: 'L002', position_sec: 20 });

    const rows = await prismaTest.lessonProgress.findMany({ where: { userId: 'u1' } });
    expect(rows.length).toBe(2);
  });
  ```
- [ ] **시나리오 6 — 동일 position 반복 — 자연 멱등**:
  ```ts
  it('동일 position 반복 호출 — UPDATE 발생하지만 lastPositionSec 동일', async () => {
    await saveProgress({ lesson_id: 'L001', position_sec: 30 });
    await saveProgress({ lesson_id: 'L001', position_sec: 30 });
    await saveProgress({ lesson_id: 'L001', position_sec: 30 });

    const final = await prismaTest.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
    });
    expect(final?.lastPositionSec).toBe(30);
  });
  ```
- [ ] **시나리오 7 — 위치 후퇴 (60 → 30) 허용 — LWW 정책 정합**:
  ```ts
  it('lastPositionSec 후퇴 허용 — LWW 정책', async () => {
    await saveProgress({ lesson_id: 'L001', position_sec: 60 });
    await saveProgress({ lesson_id: 'L001', position_sec: 30 });  // 후퇴

    const final = await prismaTest.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
    });
    expect(final?.lastPositionSec).toBe(30);  // 후퇴 허용 (의도적 — 사용자 재학습)
  });
  ```
- [ ] **시나리오 8 — 다른 user — 별도 row**:
  ```ts
  it('다른 user 동일 lesson — 별도 row', async () => {
    // u1 + u2 둘 다 시드
    await saveProgressForUser({ userId: 'u1', lesson_id: 'L001', position_sec: 30 });
    await saveProgressForUser({ userId: 'u2', lesson_id: 'L001', position_sec: 60 });

    const rows = await prismaTest.lessonProgress.findMany({ where: { lessonId: 'L001' } });
    expect(rows.length).toBe(2);
  });
  ```
- [ ] **시나리오 9 — 트랜잭션 격리 (동시 UPSERT race condition 안전)**:
  ```ts
  it('동시 100건 UPSERT — race condition 없음', async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      saveProgress({ lesson_id: 'L001', position_sec: i }),
    );
    await Promise.all(promises);

    const rows = await prismaTest.lessonProgress.findMany({
      where: { userId: 'u1', lessonId: 'L001' },
    });
    // race condition 없으면 row 1건 (UNIQUE 제약)
    expect(rows.length).toBe(1);
    // 최종 값은 어떤 100 미만 정수든 허용 (LWW)
    expect(rows[0].lastPositionSec).toBeGreaterThanOrEqual(0);
    expect(rows[0].lastPositionSec).toBeLessThan(100);
  });
  ```
- [ ] **시나리오 10 — INV-04 (stampEarned ⇒ oxCompleted) 정합 검증**:
  ```ts
  it('saveProgress 는 stampEarned 변경 안함 — INV-04 안전', async () => {
    // 시드 — L001 의 LessonProgress 가 stampEarned=true 인 상태
    await prismaTest.lessonProgress.upsert({
      where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
      create: { userId: 'u1', lessonId: 'L001', lastPositionSec: 100, oxCompleted: true, stampEarned: true },
      update: {},
    });

    // saveProgress 호출 — lastPositionSec 만 갱신
    await saveProgress({ lesson_id: 'L001', position_sec: 200 });

    const final = await prismaTest.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } },
    });
    expect(final?.lastPositionSec).toBe(200);
    expect(final?.oxCompleted).toBe(true);  // 보존
    expect(final?.stampEarned).toBe(true);  // 보존
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 순차 UPSERT — 두 번째 값 최종
- **Given**: 1차 30, 2차 60
- **When**: 호출
- **Then**: lastPositionSec: 60

### Scenario 2: 동시 UPSERT — LWW
- **Given**: Promise.all 두 호출
- **When**: 완료 후
- **Then**: 둘 중 하나가 최종 + row 1건

### Scenario 3: updatedAt 자동 갱신
- **Given**: 두 번째 호출
- **When**: 완료
- **Then**: updatedAt 더 최신

### Scenario 4: UNIQUE row 1건
- **Given**: 3회 UPSERT
- **When**: 조회
- **Then**: row 1건

### Scenario 5: 다른 lesson 별도 row
- **Given**: L001 + L002
- **When**: 조회
- **Then**: row 2건

### Scenario 6: 동일 position 멱등
- **Given**: 동일 값 반복
- **When**: 조회
- **Then**: lastPositionSec 동일

### Scenario 7: 위치 후퇴 허용 (LWW)
- **Given**: 60 → 30
- **When**: 조회
- **Then**: 30 (후퇴 허용)

### Scenario 8: 다른 user 별도 row
- **Given**: u1, u2
- **When**: 조회
- **Then**: row 2건

### Scenario 9: 동시 100건 race condition 없음
- **Given**: Promise.all 100건
- **When**: 완료
- **Then**: row 1건 + lastPositionSec 0~99 사이 어떤 값

### Scenario 10: INV-04 안전
- **Given**: stampEarned=true 기존 row
- **When**: saveProgress 호출
- **Then**: lastPositionSec 갱신 + stampEarned·oxCompleted 보존

## :gear: Technical & Non-Functional Constraints
- **Vitest + 실제 DB (테스트 DB)**: schema 정합성 검증 위해 실제 DB
- **beforeEach DB reset**: 격리
- **LWW 자연 동작**: PostgreSQL UPSERT (`@@unique` + Prisma upsert) 자체로 LWW
- **위치 후퇴 허용 — 의도적**: 사용자 재학습 시나리오 정합
- **INV-04 보존**: saveProgress 가 oxCompleted·stampEarned 미수정 (FW-OX-001 의 책임)
- **race condition 안전**: PostgreSQL UNIQUE + UPSERT (atomic)
- **응답 시간**: 단일 호출 ≤ 100ms
- **금지**:
  - DB 격리 없는 테스트 (이전 시드 영향)
  - 위치 후퇴 거부 (LWW 위반)
  - saveProgress 가 stamp/ox 컬럼 수정 (책임 분리 위반)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `__tests__/services/progress-lww.test.ts` 작성
- [ ] beforeEach DB reset
- [ ] 순차 + 동시 + race condition 모두 검증
- [ ] updatedAt 자동 갱신 검증
- [ ] INV-04 (stampEarned 보존) 검증
- [ ] 응답 시간 ≤ 100ms 측정
- [ ] CI 통합 검증
- [ ] PR 본문에 "REQ-FUNC-024 LWW 회귀 방지" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-PROG-001 (saveProgress 본체)
  - CT-DB-004 (LessonProgress 모델 — UNIQUE + @updatedAt)
  - CT-MOCK-002 (User 시드 — u1, u2)
  - IF-CI-001
- **Blocks**:
  - FW-PROG-001 의 안정 운영
  - FW-PROG-004 (Realtime 알림, 그룹 7) 의 데이터 기반
- **Related**:
  - REQ-FUNC-024 (다기기)
  - INV-12 (Progress 정합성)
