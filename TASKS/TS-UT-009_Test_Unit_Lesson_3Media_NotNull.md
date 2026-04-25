# [Feature] TS-UT-009: 3매체 NOT NULL 단위 테스트 — youtube + script + pdf_kit 누락 시 Fail

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-UT-009: Lesson 3매체 NOT NULL 검증 — youtubeVideoId·script·pdfKitUrl 누락 시 INSERT 거부 + REQ-FUNC-014 강제"
labels: 'feature, test, unit, lesson, db-constraint, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-UT-009] Lesson 모델의 3매체 (`youtubeVideoId`, `script`, `pdfKitUrl`) NOT NULL 단위 테스트 — 셋 중 하나라도 누락하여 INSERT 시도 시 즉시 거부 + 시드 데이터의 정합성 검증 + 신규 lesson PR 의 자동 게이트
- **목적**: REQ-FUNC-014 (3매체 정합성) 회귀 방지. PRD 원칙 4 (3매체 유기체) 의 데이터 레이어 강제 — **모든 lesson 은 영상 + 텍스트 + PDF 셋 모두 보유**. 한 매체라도 누락 시 학습자의 매체 전환 불가 → 접근성 차단.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-014 (3매체 정합성)
  - `/docs/SRS_V0_9.md#1.2` — 5대 원칙 4번 (3매체 유기체)
  - `/docs/SRS_V0_9.md#6.2.2` — LESSON 테이블
- 페르소나: SH-04 한정숙 (글로 읽기 모드 의존), SH-08 김성호 (자막 의존)
- 선행: CT-DB-003 (Lesson 모델 — NOT NULL 제약), CT-MOCK-001

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/db/lesson-3media.test.ts`
- [ ] **시나리오 1 — 3매체 모두 — 정상 INSERT**:
  ```ts
  it('3매체 모두 입력 — 정상', async () => {
    const lesson = await prismaTest.lesson.create({
      data: {
        lessonId: 'L001',
        title: 'Test',
        moduleId: 'M1',
        youtubeVideoId: 'abc123',
        script: '본문 내용...',
        pdfKitUrl: '/teacher-kit/L001.pdf',
        revisionLastUpdated: new Date(),
      },
    });
    expect(lesson.youtubeVideoId).toBe('abc123');
    expect(lesson.script).toContain('본문');
    expect(lesson.pdfKitUrl).toBe('/teacher-kit/L001.pdf');
  });
  ```
- [ ] **시나리오 2 — youtubeVideoId 누락 — 거부**:
  ```ts
  it('youtubeVideoId NULL — 거부', async () => {
    await expect(
      prismaTest.lesson.create({
        data: {
          lessonId: 'L002', title: 'Test', moduleId: 'M1',
          // youtubeVideoId 누락
          script: '본문',
          pdfKitUrl: '/L002.pdf',
          revisionLastUpdated: new Date(),
        } as any,  // TypeScript 우회
      })
    ).rejects.toThrow();
  });
  ```
- [ ] **시나리오 3 — script 누락 — 거부**:
  ```ts
  it('script NULL — 거부', async () => {
    await expect(
      prismaTest.lesson.create({
        data: {
          lessonId: 'L003', title: 'Test', moduleId: 'M1',
          youtubeVideoId: 'abc',
          // script 누락
          pdfKitUrl: '/L003.pdf',
          revisionLastUpdated: new Date(),
        } as any,
      })
    ).rejects.toThrow();
  });
  ```
- [ ] **시나리오 4 — pdfKitUrl 누락 — 거부**:
  ```ts
  it('pdfKitUrl NULL — 거부', async () => {
    await expect(
      prismaTest.lesson.create({
        data: {
          lessonId: 'L004', title: 'Test', moduleId: 'M1',
          youtubeVideoId: 'abc',
          script: '본문',
          // pdfKitUrl 누락
          revisionLastUpdated: new Date(),
        } as any,
      })
    ).rejects.toThrow();
  });
  ```
- [ ] **시나리오 5 — 빈 문자열 거부 (선택, CHECK 활용)**:
  ```ts
  it('script 빈 문자열 거부 (Zod refine 또는 CHECK length > 0)', async () => {
    await expect(
      prismaTest.lesson.create({
        data: {
          lessonId: 'L005', title: 'Test', moduleId: 'M1',
          youtubeVideoId: 'abc',
          script: '',  // 빈 문자열
          pdfKitUrl: '/L005.pdf',
          revisionLastUpdated: new Date(),
        },
      })
    ).rejects.toThrow();  // 또는 Zod refine 으로 차단
  });
  ```
- [ ] **시나리오 6 — UPDATE 시 3매체 NULL 변경 거부**:
  ```ts
  it('기존 lesson 의 youtubeVideoId 를 NULL 로 변경 거부', async () => {
    const lesson = await prismaTest.lesson.create({
      data: {
        lessonId: 'L006', /* 정상 데이터 */,
        youtubeVideoId: 'abc', script: '...', pdfKitUrl: '/L006.pdf',
        title: 'Test', moduleId: 'M1', revisionLastUpdated: new Date(),
      },
    });

    await expect(
      prismaTest.lesson.update({
        where: { id: lesson.id },
        data: { youtubeVideoId: null } as any,
      })
    ).rejects.toThrow();
  });
  ```
- [ ] **시나리오 7 — CT-MOCK-001 시드 검증 — 모든 lesson 3매체 보유**:
  ```ts
  it('CT-MOCK-001 시드 — 모든 lesson 3매체 NOT NULL', async () => {
    await seedTestData();
    const lessons = await prismaTest.lesson.findMany();
    expect(lessons.length).toBeGreaterThanOrEqual(10);
    for (const lesson of lessons) {
      expect(lesson.youtubeVideoId).not.toBeNull();
      expect(lesson.script).not.toBeNull();
      expect(lesson.pdfKitUrl).not.toBeNull();
      expect(lesson.script.length).toBeGreaterThan(0);
    }
  });
  ```
- [ ] **시나리오 8 — youtubeVideoId 형식 검증 (선택)**:
  ```ts
  it('youtubeVideoId 형식 — YouTube ID 패턴 (영문·숫자·_·-)', async () => {
    // YouTube ID 는 11자리 영문/숫자/하이픈/언더스코어
    const validIds = ['abc123XYZ_-', 'aBcDeFgHiJk'];
    const invalidIds = ['ab', 'a'.repeat(12), 'abc!@#'];

    for (const id of validIds) {
      // Zod 또는 CHECK 로 검증
      // 본 검증은 정책에 따라 추가 (현재 단순 NOT NULL 만)
    }
  });
  ```
- [ ] **시나리오 9 — pdfKitUrl 형식 검증**:
  ```ts
  it('pdfKitUrl 형식 — /path/to/file.pdf 패턴', async () => {
    // Zod schema 활용
    const validUrls = ['/teacher-kit/L001.pdf', '/static/L002.pdf'];
    const invalidUrls = ['L001.pdf', 'http://external/file.pdf'];  // 절대 경로 또는 외부 URL 부적절

    // 본 검증은 정책에 따라 추가
  });
  ```
- [ ] **시나리오 10 — 3매체 메타 일관성 — revisionLastUpdated 갱신 시 매체 변경 추적**:
  ```ts
  it('script 변경 시 revisionLastUpdated 자동 갱신', async () => {
    const lesson = await prismaTest.lesson.create({
      data: { /* 정상 데이터 */ },
    });
    const initial = lesson.revisionLastUpdated;

    await new Promise(r => setTimeout(r, 100));

    await prismaTest.lesson.update({
      where: { id: lesson.id },
      data: { script: '갱신된 본문' },
    });
    const updated = await prismaTest.lesson.findUnique({ where: { id: lesson.id } });

    // revisionLastUpdated 가 자동 갱신되도록 @updatedAt 또는 trigger 정책
    // 본 검증은 schema 정책에 따라 — 본 태스크는 schema 가 @updatedAt 으로 처리한다고 가정
    expect(updated!.revisionLastUpdated.getTime()).toBeGreaterThanOrEqual(initial.getTime());
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 3매체 모두 — 정상
- **Given**: 데이터
- **When**: INSERT
- **Then**: 정상

### Scenario 2: youtubeVideoId NULL — 거부
- **Given**: 누락
- **When**: INSERT
- **Then**: throw

### Scenario 3: script NULL — 거부
- **Given**: 누락
- **When**: INSERT
- **Then**: throw

### Scenario 4: pdfKitUrl NULL — 거부
- **Given**: 누락
- **When**: INSERT
- **Then**: throw

### Scenario 5: 빈 문자열 거부 (선택)
- **Given**: script: ''
- **When**: INSERT
- **Then**: throw

### Scenario 6: UPDATE NULL 거부
- **Given**: 기존 lesson
- **When**: youtubeVideoId NULL 변경
- **Then**: throw

### Scenario 7: 시드 정합성
- **Given**: CT-MOCK-001
- **When**: 모든 lesson 검사
- **Then**: 3매체 NOT NULL 100%

### Scenario 8: youtubeVideoId 형식 (선택)
- **Given**: 정책 활성 시
- **When**: 잘못된 형식 INSERT
- **Then**: throw

### Scenario 9: pdfKitUrl 형식 (선택)
- **Given**: 정책 활성 시
- **When**: 잘못된 URL
- **Then**: throw

### Scenario 10: revisionLastUpdated 자동 갱신
- **Given**: script 변경
- **When**: UPDATE
- **Then**: revisionLastUpdated 갱신

## :gear: Technical & Non-Functional Constraints
- **3매체 NOT NULL 강제**: schema 레이어 (Prisma `String` 타입 — `?` 부재)
- **빈 문자열 거부 (선택)**: Zod refine 또는 PostgreSQL CHECK
- **UPDATE 차단**: NOT NULL 제약 자동 적용 (스키마 레벨)
- **시드 정합성**: 매 PR 자동 검증
- **revisionLastUpdated 갱신**: @updatedAt 또는 trigger
- **응답 시간**: 각 검증 ≤ 50ms
- **금지**:
  - 3매체 중 한 매체라도 NULL 허용 (REQ-FUNC-014 위반)
  - 빈 문자열 시드 (학습자 빈 콘텐츠 노출)
  - 시드 정합성 검증 누락 (PR 회귀)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] 3매체 NOT NULL 검증 (각 컬럼)
- [ ] UPDATE NULL 차단 검증
- [ ] 시드 정합성 자동 검증
- [ ] revisionLastUpdated 갱신 검증
- [ ] CI 통합 검증
- [ ] PR 본문에 "REQ-FUNC-014 회귀 방지" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-003 (Lesson 모델 — 3매체 NOT NULL)
  - CT-MOCK-001 (시드)
  - IF-CI-001
- **Blocks**:
  - REQ-FUNC-014 회귀 방지
  - PRD 원칙 4 (3매체 유기체) 데이터 강제
- **Related**:
  - 페르소나 SH-04, SH-08 의 매체 전환 의존성
