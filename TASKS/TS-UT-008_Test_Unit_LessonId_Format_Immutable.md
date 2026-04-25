# [Feature] TS-UT-008: lessonId 포맷 L001~L125 UNIQUE·불변 단위 테스트

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-UT-008: lessonId 포맷 검증 — L\\d{3} 정규식 + UNIQUE 제약 + 불변성 (생성 후 수정 시도 차단)"
labels: 'feature, test, unit, lesson, db-constraint, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-UT-008] Lesson 모델의 `lessonId` 필드 단위 테스트 — (1) 포맷 정규식 (`L\d{3}`, L001~L125) 검증 + (2) UNIQUE 제약 + (3) 생성 후 수정 시도 차단 (불변성)
- **목적**: REQ-FUNC-033 (lessonId 포맷·불변) 회귀 방지. lessonId 는 모든 PDF 파일명·URL·EventLog payload·외부 인덱싱 의 키 — 변경되면 cascade 영향 거대. **생성 시점 strict 검증 + 수정 차단** 으로 데이터 무결성 보장.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-033 (lessonId 포맷·불변)
  - `/docs/SRS_V0_9.md#6.2.2` — LESSON 테이블 (`lessonId @unique`)
- 선행: CT-DB-003 (Lesson 모델), CT-MOCK-001 (시드)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/db/lesson-id.test.ts`
- [ ] **시나리오 1 — 정상 포맷 INSERT 통과**:
  ```ts
  it.each(['L001', 'L050', 'L125'])('정상 포맷 "%s" INSERT', async (id) => {
    const lesson = await prismaTest.lesson.create({
      data: { lessonId: id, title: 'Test', /* ... */ },
    });
    expect(lesson.lessonId).toBe(id);
  });
  ```
- [ ] **시나리오 2 — 잘못된 포맷 거부 (Zod refine 또는 CHECK)**:
  ```ts
  it.each([
    'L1',         // 자릿수 부족
    'L0001',      // 자릿수 초과
    'L00a',       // 알파벳 포함
    'l001',       // 소문자
    'M001',       // 잘못된 prefix
    '001',        // prefix 부재
    'LESSON-001', // 다른 패턴
  ])('잘못된 포맷 "%s" 거부', async (id) => {
    // 본 검증은 애플리케이션 Zod refine 또는 PostgreSQL CHECK 활용
    await expect(
      prismaTest.lesson.create({ data: { lessonId: id, title: 'Test', /* ... */ } })
    ).rejects.toThrow();
  });
  ```
- [ ] **시나리오 3 — UNIQUE 제약 — 중복 INSERT 거부**:
  ```ts
  it('중복 lessonId — P2002', async () => {
    await prismaTest.lesson.create({ data: { lessonId: 'L001', title: 'A', /* ... */ } });

    await expect(
      prismaTest.lesson.create({ data: { lessonId: 'L001', title: 'B', /* ... */ } })
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });
  ```
- [ ] **시나리오 4 — 불변성 — UPDATE 시도 차단 (애플리케이션 정책)**:
  ```ts
  it('lessonId UPDATE 차단 (애플리케이션 정책)', async () => {
    const lesson = await prismaTest.lesson.create({ data: { lessonId: 'L001', /* ... */ } });

    // 본 정책 — Service 레이어에서 lessonId 수정 차단
    // 직접 Prisma 호출은 가능하지만 Service 함수는 불가
    await expect(updateLesson(lesson.id, { lessonId: 'L002' }))
      .rejects.toThrow('lessonId is immutable');
  });
  ```
- [ ] **시나리오 5 — Database trigger 차단 (선택, 강도 보강)**:
  ```ts
  // PostgreSQL trigger 로 lessonId 컬럼 UPDATE 시 RAISE EXCEPTION
  it('직접 prisma update 도 trigger 로 차단', async () => {
    const lesson = await prismaTest.lesson.create({ data: { lessonId: 'L001', /* ... */ } });

    await expect(
      prismaTest.lesson.update({
        where: { id: lesson.id },
        data: { lessonId: 'L002' },
      })
    ).rejects.toThrow();
  });
  ```
- [ ] **시나리오 6 — DELETE → INSERT 우회 시 cascade 영향 검증**:
  ```ts
  it('lessonId 변경은 DELETE + INSERT 만 가능 — cascade 발생', async () => {
    await prismaTest.lesson.create({ data: { lessonId: 'L001', /* ... */ } });
    await prismaTest.stamp.create({ data: { userId: 'u1', lessonId: 'L001' } });

    // L001 삭제 → cascade 로 stamp 도 삭제
    await prismaTest.lesson.delete({ where: { lessonId: 'L001' } });
    const stamps = await prismaTest.stamp.findMany({ where: { lessonId: 'L001' } });
    expect(stamps.length).toBe(0);  // cascade 동작
  });
  ```
- [ ] **시나리오 7 — 범위 초과 (L126) 거부 (선택 정책)**:
  ```ts
  it('L126 이상 거부 (Stage 1 한도 정책)', async () => {
    // Zod refine 또는 CHECK 으로 L001~L125 강제
    await expect(
      prismaTest.lesson.create({ data: { lessonId: 'L126', /* ... */ } })
    ).rejects.toThrow();
  });
  ```
  - 본 정책은 Stage 1 한도 (125편). Stage 2 확장 시 정책 변경 가능
- [ ] **시나리오 8 — Mock 시드의 lessonId 정합 검증**:
  ```ts
  it('CT-MOCK-001 시드의 모든 lessonId 가 포맷 정합', async () => {
    await seedTestData();
    const lessons = await prismaTest.lesson.findMany();
    for (const lesson of lessons) {
      expect(lesson.lessonId).toMatch(/^L\d{3}$/);
    }
  });
  ```
- [ ] **시나리오 9 — 외부 의존성 — Stamp/LessonProgress/EventLog 의 lessonId 매칭**:
  ```ts
  it('Stamp.lessonId 가 Lesson.lessonId 와 정합 (FK)', async () => {
    await prismaTest.lesson.create({ data: { lessonId: 'L001', /* ... */ } });

    // 정상 — 존재하는 lessonId
    await prismaTest.stamp.create({ data: { userId: 'u1', lessonId: 'L001' } });

    // 비정상 — 존재 안하는 lessonId (FK 위반)
    await expect(
      prismaTest.stamp.create({ data: { userId: 'u1', lessonId: 'L999' } })
    ).rejects.toThrow();
  });
  ```
- [ ] **시나리오 10 — Zod schema 활용 검증**:
  ```ts
  import { LessonIdParamSchema } from '@/lib/contracts/lesson';

  it.each([
    ['L001', true],
    ['L125', true],
    ['L126', false],  // 범위 외 (선택 정책)
    ['l001', false],
    ['M001', false],
  ])('Zod schema "%s" → valid: %s', (id, expected) => {
    const result = LessonIdParamSchema.safeParse({ lessonId: id });
    expect(result.success).toBe(expected);
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 포맷 통과
- **Given**: L001, L050, L125
- **When**: INSERT
- **Then**: 정상

### Scenario 2: 잘못된 포맷 거부
- **Given**: L1, L0001, l001, M001
- **When**: INSERT
- **Then**: throw

### Scenario 3: UNIQUE — 중복 P2002
- **Given**: L001 존재
- **When**: 재 INSERT
- **Then**: P2002

### Scenario 4: Service 레이어 UPDATE 차단
- **Given**: 기존 lesson
- **When**: updateLesson 으로 lessonId 변경 시도
- **Then**: throw 'immutable'

### Scenario 5: Trigger 차단 (선택)
- **Given**: 직접 prisma.update
- **When**: lessonId 변경
- **Then**: throw

### Scenario 6: DELETE → cascade
- **Given**: lesson + stamp
- **When**: lesson 삭제
- **Then**: stamp 도 삭제

### Scenario 7: L126 거부 (Stage 1)
- **Given**: 데이터
- **When**: INSERT
- **Then**: throw

### Scenario 8: 시드 정합성
- **Given**: CT-MOCK-001
- **When**: 모든 lessonId 검사
- **Then**: 정규식 매칭 100%

### Scenario 9: FK 정합 — Stamp 의 lessonId
- **Given**: L001 존재
- **When**: Stamp INSERT (L001)
- **Then**: 정상. L999 는 FK 위반

### Scenario 10: Zod schema 검증
- **Given**: 다중 입력
- **When**: parse
- **Then**: 정상 패턴만 success

## :gear: Technical & Non-Functional Constraints
- **포맷 정규식 — `^L\d{3}$`**: L001~L999 허용 (Stage 1 정책 — L125 한도)
- **UNIQUE 제약**: @unique
- **불변성 — Service 레이어 차단 + (선택) DB trigger**: 다중 방어
- **CASCADE 정책**: lesson 삭제 시 stamp/progress/eventLog 의 영향 명시 검증
- **L126 거부**: Stage 1 정책. Stage 2 확장 시 변경
- **FK 정합**: Stamp/LessonProgress/EventLog 의 lessonId 모두 Lesson 존재 보장
- **Zod 정합**: 애플리케이션 Zod schema 와 DB 제약이 동일 정책
- **응답 시간**: 각 검증 ≤ 50ms
- **금지**:
  - lessonId UPDATE 허용 (cascade 영향 거대)
  - 잘못된 포맷 시드 (정책 위반)
  - 범위 외 lessonId (Stage 1 위반)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] 포맷 정규식 검증 (정상·비정상 다중)
- [ ] UNIQUE 제약 검증
- [ ] 불변성 — Service 레이어 차단
- [ ] 시드 정합성 검증
- [ ] FK 정합 검증
- [ ] Zod schema 정합 검증
- [ ] CI 통합 검증
- [ ] PR 본문에 "REQ-FUNC-033 회귀 방지" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-003 (Lesson 모델)
  - CT-API-002 (Zod schema)
  - CT-MOCK-001 (시드 정합)
  - IF-CI-001
- **Blocks**:
  - REQ-FUNC-033 회귀 방지
  - 운영 데이터 무결성
- **Related**:
  - INV-12 (Stamp/Progress 정합)
  - 콘텐츠 편집 SOP — 신규 lesson 추가 시 lessonId 정책
