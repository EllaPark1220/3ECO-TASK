# [Infra] IF-SCALE-001: Lesson 1→125편 확장 검증 — 데이터 모델·API 변경 0건

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Infra] IF-SCALE-001: Lesson 시드 125건 추가 + 모델·API 무변경 회귀 검증 — REQ-NF-048 확장성"
labels: 'infra, scalability, content, regression, priority:medium, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-SCALE-001] Lesson 10편 → 125편 확장 시 데이터 모델·API 변경 0건 검증
- **목적**: REQ-NF-048 (데이터 모델·API 변경 없이 125편 수용) 을 정량적으로 검증한다. CT-MOCK-001 의 10편 시드를 125편으로 확장하여, Prisma 스키마·API Route Handler·DTO·UI 컴포넌트에 어떤 코드 변경도 없이 정상 동작하는지 회귀 테스트를 수행한다. 125편은 MVP 전체 콘텐츠 범위 (L001~L125) 이며, Stage 1 종료 목표 3년 분량 설계의 확장성 기반.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.8` — REQ-NF-048 (데이터 모델·API 변경 없이 125편 수용)
  - `/docs/SRS_V0_9.md#6.2.2` — LESSON 테이블 정의 (lessonId VARCHAR(4) `L001~L125`)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-01 (lessonId UNIQUE 불변), INV-02 (3매체 NOT NULL)
  - `/docs/SRS_V0_9.md#1.2.1` — 콘텐츠 범위 125편
- 선행: CT-MOCK-001 (Lesson 10편 시드 — 본 태스크의 기반 확장)
- 짝: IF-SCALE-002 (신규 레슨 1편 추가 30분 검증)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **확장 시드 스크립트 작성** — `prisma/seed/lessons-125.ts`:
  ```ts
  // L011~L125 (115편 추가) 자동 생성 스크립트
  const modules = ['M1', 'M2', 'M3', 'M4', 'M5'];

  for (let i = 11; i <= 125; i++) {
    const lessonId = `L${String(i).padStart(3, '0')}`;
    const moduleId = modules[(i - 1) % 5]; // 라운드 로빈 분배
    const lesson = {
      lessonId,
      moduleId,
      title: `경제 판단력 레슨 ${i}`,
      youtubeVideoId: `placeholder-${lessonId}`,
      script: generateScript(lessonId), // 한국 맥락 예시 포함 800~1500자
      pdfKitUrl: `/teacher-kit/${lessonId}.pdf`,
      revisionLastUpdated: new Date('2026-04-25'),
      revisionNotes: 'v1.0: 최초 발행 (확장 시드)',
    };
    await prisma.lesson.upsert({
      where: { lessonId },
      create: lesson,
      update: lesson,
    });

    // OX 5문항 시드
    for (let q = 1; q <= 5; q++) {
      await prisma.oxQuestion.upsert({
        where: { lessonId_questionOrder: { lessonId, questionOrder: q } },
        create: {
          lessonId,
          questionOrder: q,
          questionText: `${lessonId} 문항 ${q}`,
          correctAnswer: q % 2 === 0 ? 'X' : 'O',
          explanation: `정답 해설 — 본문 §${q} 참조`,
          scrollAnchor: `anchor-${q}`,
        },
        update: {},
      });
    }
  }
  ```
- [ ] **Module 확장 없음 검증** — 기존 M1~M5 에 L011~L125 를 라운드 로빈 분배. Module 추가 불필요
- [ ] **회귀 테스트 체크리스트**:
  - [ ] Prisma 스키마 변경 0건 (`git diff prisma/schema.prisma` → 변경 없음)
  - [ ] API Route Handler 변경 0건 (`git diff app/api/` → 변경 없음)
  - [ ] DTO/Zod 스키마 변경 0건 (`git diff lib/contracts/` → 변경 없음)
  - [ ] UI 컴포넌트 변경 0건 (`git diff app/` — Route Handler 외 → 변경 없음)
  - [ ] `package.json` 의존성 변경 0건
- [ ] **기능 회귀 테스트**:
  - [ ] `GET /api/lesson/L125` — 200 응답 (마지막 레슨)
  - [ ] `GET /api/stamp/map` — 125편 목록 정상 반환
  - [ ] OX 채점 — L125 의 문항 정상 동작
  - [ ] 스탬프 맵 UI — 125개 레슨 렌더링 (스크롤·페이지네이션 동작)
  - [ ] PDF 생성 — L125 교안 PDF 정상 생성
- [ ] **성능 회귀 테스트**:
  - [ ] 레슨 목록 조회 응답 시간 — 10편 vs 125편 비교 (p95 차이 ≤ 200ms)
  - [ ] 스탬프 맵 렌더 시간 — 125편 p95 ≤ 500ms (REQ-NF-003)
  - [ ] DB 크기 측정 — 125편 + OX 625건 + 예상 사용자 1000명 = 총 DB 크기 예측
- [ ] **무결성 검증** — CT-MOCK-001 의 `verify.ts` 확장:
  ```ts
  // verify-125.ts
  const lessons = await prisma.lesson.findMany({ include: { oxQuestions: true } });
  assert(lessons.length === 125, `Lesson 카운트 ${lessons.length} (기대 125)`);
  for (const l of lessons) {
    assert(l.oxQuestions.length === 5, `OX 카운트 ${l.oxQuestions.length}: ${l.lessonId}`);
    assert(l.youtubeVideoId, `youtubeVideoId 누락: ${l.lessonId}`);
    assert(l.script, `script 누락: ${l.lessonId}`);
    assert(l.pdfKitUrl, `pdfKitUrl 누락: ${l.lessonId}`);
  }
  ```
- [ ] **`package.json` 스크립트 추가**:
  ```json
  "db:seed:125": "tsx prisma/seed/lessons-125.ts",
  "db:seed:verify-125": "tsx prisma/seed/verify-125.ts"
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 125편 시드 정상 실행
- **Given**: 10편 시드 완료 상태
- **When**: `npm run db:seed:125`
- **Then**: L011~L125 (115편) + OX 575건 추가. 총 Lesson 125건, OxQuestion 625건. 에러 0건

### Scenario 2: Prisma 스키마 변경 0건
- **Given**: 125편 시드 후
- **When**: `git diff prisma/schema.prisma`
- **Then**: 변경 0줄. 스키마 수정 없이 125편 수용

### Scenario 3: API Route Handler 변경 0건
- **Given**: 125편 시드 후
- **When**: `git diff app/api/`
- **Then**: 변경 0줄. API 코드 수정 없이 동작

### Scenario 4: 마지막 레슨 조회 — L125
- **Given**: 125편 시드 완료
- **When**: `GET /api/lesson/L125`
- **Then**: 200 응답 + 정상 7필드 반환

### Scenario 5: 스탬프 맵 — 125편 렌더링
- **Given**: 125편 + 사용자 스탬프 데이터
- **When**: 스탬프 맵 UI 렌더
- **Then**: 125개 레슨 모두 표시. p95 ≤ 500ms (REQ-NF-003)

### Scenario 6: 성능 회귀 — 목록 조회
- **Given**: 10편 vs 125편 환경
- **When**: `GET /api/lesson/list` 응답 시간 비교
- **Then**: p95 차이 ≤ 200ms. 10편 대비 극적 성능 저하 없음

### Scenario 7: DB 크기 예측 — Free 한도 이내
- **Given**: 125편 + OX 625건 + User 1000명 + EventLog 100K건
- **When**: `SELECT pg_database_size('postgres')`
- **Then**: 예상 총 크기 ≤ 300MB (Supabase Free 500MB 한도 이내)

### Scenario 8: 무결성 검증 125편 통과
- **Given**: 시드 완료
- **When**: `npm run db:seed:verify-125`
- **Then**: 125편 × 5문항 정합 + 3매체 NOT NULL + lessonId 포맷 전수 통과

### Scenario 9: 재시드 idempotency
- **Given**: 125편 시드 완료
- **When**: 동일 스크립트 재실행
- **Then**: upsert 로 에러 0건. 데이터 동일

### Scenario 10: PDF 생성 — L125 정상
- **Given**: L125 시드 완료
- **When**: `GET /api/teacher/kit/L125`
- **Then**: PDF 정상 생성 (FW-PDF-002 템플릿 변경 0건)

## :gear: Technical & Non-Functional Constraints
- **확장성 원칙 (REQ-NF-048)**: "데이터 모델·API 변경 없이 125편 수용" — 코드 변경은 시드 스크립트 추가만
- **lessonId 범위**: `L001`~`L125` (VARCHAR(4) — 3자리 숫자. 126편 이상은 `L126`~`L999` 까지 포맷 호환)
- **Module 분배**: 기존 M1~M5 에 라운드 로빈. Module 추가 불필요 (125 / 5 = 25편/모듈)
- **시드 콘텐츠 품질**: 확장 시드 (L011~L125) 는 placeholder 콘텐츠. 실제 콘텐츠는 콘텐츠 제작 SOP 별도 트랙
- **DB 크기 예산**:
  - Lesson 125건 × ~2KB = ~250KB
  - OxQuestion 625건 × ~500B = ~312KB
  - LessonProgress 125K건 (1000 users × 125) = ~15MB
  - Stamp 125K건 = ~10MB
  - EventLog 100K건 = ~50MB
  - 합계 ~75MB (Supabase Free 500MB 한도 내)
- **금지**:
  - 125편 수용을 위한 스키마 변경 (REQ-NF-048 위반)
  - 하드코딩된 레슨 개수 제한 (UI·API 에 `WHERE lessonId <= 'L010'` 같은 필터)
  - 페이지네이션 없는 전체 목록 반환 (125편은 단일 응답 가능하지만 1000편 확장 시 문제)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] 125편 시드 스크립트 (`prisma/seed/lessons-125.ts`) 구현
- [ ] 무결성 검증 (`prisma/seed/verify-125.ts`) 통과
- [ ] 코드 변경 0건 검증 (`git diff` — 시드 파일 외 변경 없음)
- [ ] API 회귀 테스트 (L125 조회·OX·스탬프·PDF) 통과
- [ ] 성능 회귀 (10편 vs 125편 p95 차이 ≤ 200ms)
- [ ] DB 크기 예측 + Supabase Free 한도 내 확인
- [ ] PR 본문에 "REQ-NF-048 정량 검증. 코드 변경 0건 + 125편 회귀 통과" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-MOCK-001 (Lesson 10편 시드 — 기반)
  - CT-DB-003 (Lesson + Module 모델)
  - CT-DB-006 (OxQuestion 모델)
  - CT-DB-010 (마이그레이션 — 스키마 안정화)
- **Blocks**:
  - IF-SCALE-002 (신규 레슨 1편 추가 30분 검증 — 125편 환경에서 측정)
- **Related**:
  - REQ-NF-048 (125편 확장성)
  - §1.2.1 (콘텐츠 범위)
  - 콘텐츠 제작 SOP (placeholder → 실제 콘텐츠 교체 별도 트랙)
