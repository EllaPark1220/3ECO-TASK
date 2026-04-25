# [Feature] CT-DB-003: Lesson 모델 + 3매체 NOT NULL 제약 + Module relation

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-DB-003: Lesson 모델 + youtubeVideoId·script·pdfKitUrl NOT NULL + Module relation + revision 컬럼"
labels: 'feature, backend, db, content, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-DB-003] Lesson 테이블 정의 — 3매체 (youtube_video_id + script + pdf_kit_url) NOT NULL 제약 + Module(M1~M5) relation + revision 메타
- **목적**: PRD 원칙 4 (3매체 유기체) · 원칙 5 (1편=1교안=1장) 의 데이터 레이어 강제. NOT NULL 제약으로 3매체 중 하나라도 누락된 lesson 의 INSERT 자체를 차단. REQ-FUNC-033 (lesson_id 포맷) + REQ-FUNC-034 (3매체 NOT NULL) + REQ-FUNC-015 (개정 이력) 충족.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.2.2` — LESSON 테이블 정의
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-033, 034, 035, 037
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-015 (개정 이력 자동 삽입)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-08 (3매체 동시 발행)
  - `/docs/SRS_V0_9.md#1.5.1` — ADR-005 (유튜브 임베디드만)
- PRD 원칙 4·5 (3매체 유기체 + 1편=1교안=1장)
- 선행: CT-DB-001 (Prisma 초기화)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Module 모델 먼저 정의** (Lesson relation 위함):
  ```prisma
  model Module {
    id          String   @id @default(uuid())
    moduleId    String   @unique  // M1, M2, M3, M4, M5
    name        String   @db.VarChar(100)
    description String?  @db.Text
    orderIndex  Int      @unique  // 1~5

    lessons     Lesson[]
    createdAt   DateTime @default(now())
  }
  ```
- [ ] **Lesson 모델 정의 — 3매체 NOT NULL 강제**:
  ```prisma
  model Lesson {
    id                    String          @id @default(uuid())
    lessonId              String          @unique  // L001 ~ L125 포맷
    title                 String          @db.VarChar(200)

    // 3매체 NOT NULL (REQ-FUNC-034)
    youtubeVideoId        String          // YouTube video ID (예: dQw4w9WgXcQ)
    script                String          @db.Text  // 본문 스크립트 (글로 읽기 모드)
    pdfKitUrl             String          // Supabase Storage 의 PDF URL 경로

    // 메타
    moduleId              String          // FK → Module.moduleId
    module                Module          @relation(fields: [moduleId], references: [moduleId])
    revisionLastUpdated   DateTime        @default(now())
    revisionNotes         String?         @db.Text

    // Relations
    lessonProgress        LessonProgress[]
    stamps                Stamp[]
    oxQuestions           OxQuestion[]
    teacherFeedbacks      TeacherFeedback[]

    createdAt             DateTime        @default(now())
    updatedAt             DateTime        @updatedAt

    @@index([moduleId])
    @@index([revisionLastUpdated])
  }
  ```
- [ ] **lesson_id 포맷 강제 (REQ-FUNC-033)** — `L\d{3}` 패턴:
  - DB 레벨: PostgreSQL 의 CHECK 제약 추가 가능 (`CHECK ("lessonId" ~ '^L[0-9]{3}$')`). 단 SQLite 는 CHECK 부분 지원 — 양 환경 호환을 위해 **애플리케이션 레이어 (Zod) 에서 강제**
  - Prisma migrate 시점에 manual SQL 추가 옵션:
    ```sql
    ALTER TABLE "Lesson" ADD CONSTRAINT lesson_id_format CHECK ("lessonId" ~ '^L[0-9]{3}$');
    ```
- [ ] **3매체 NOT NULL 검증 — sanity check 코드**:
  - DB NOT NULL 은 Prisma `String` (NOT NULL default) 으로 강제됨
  - 추가로 Lesson 생성 코드에 sanity check — 빈 문자열 (`""`) 도 거부 (Zod `.min(1)`)
- [ ] **Module 시드** — M1~M5 사전 INSERT (CT-MOCK-001 의 의존):
  ```ts
  // prisma/seed/modules.ts
  const modules = [
    { moduleId: 'M1', name: '화폐와 가치 기초', orderIndex: 1 },
    { moduleId: 'M2', name: '시장과 가격', orderIndex: 2 },
    { moduleId: 'M3', name: '거시 경제 지표', orderIndex: 3 },
    { moduleId: 'M4', name: '금융과 위험', orderIndex: 4 },
    { moduleId: 'M5', name: '경제 정책 판단', orderIndex: 5 },
  ];
  ```
- [ ] 마이그레이션 — `npx prisma migrate dev --name add_module_lesson_models`
- [ ] 마이그레이션 SQL 검토:
  - `Lesson.lessonId` UNIQUE 인덱스 자동 생성
  - `Module.moduleId` UNIQUE 인덱스 자동 생성
  - `Lesson_moduleId_idx`, `Lesson_revisionLastUpdated_idx`
- [ ] **revision_last_updated 자동 갱신 정책**:
  - 본 태스크는 default `now()` + 수동 갱신 정책 (관리자가 콘텐츠 수정 시 명시적 UPDATE)
  - `@updatedAt` 은 별개 — 모든 변경 시 자동 갱신. revision 은 콘텐츠 의미 있는 변경 시만 (운영 SOP)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: Lesson 정상 INSERT
- **Given**: Module M1 시드 완료
- **When**: `prisma.lesson.create({ data: { lessonId: 'L001', title: '화폐의 정의', youtubeVideoId: 'abc', script: '본문', pdfKitUrl: '/teacher-kit/L001.pdf', moduleId: 'M1' } })`
- **Then**: Lesson 1건 INSERT. revisionLastUpdated 자동 설정

### Scenario 2: lessonId UNIQUE 제약
- **Given**: Lesson(`L001`) 존재
- **When**: 동일 lessonId 로 INSERT 시도
- **Then**: P2002 발생

### Scenario 3: 3매체 NULL 시도 시 거부
- **Given**: 정상 데이터
- **When**: `script: ''` (빈 문자열) 로 INSERT 시도
- **Then**: 애플리케이션 레이어 (Zod) 가 거부. 또는 DB 가 NULL 거부 (Prisma 의 String 은 NOT NULL)

### Scenario 4: lessonId 포맷 위반
- **Given**: 데이터
- **When**: `lessonId: 'INVALID'` 로 INSERT 시도
- **Then**: PostgreSQL CHECK 제약 위반 (또는 애플리케이션 Zod 검증)

### Scenario 5: Module 미존재 시 FK 위반
- **Given**: Module(`M99`) 가 없음
- **When**: `lessonId: 'L001', moduleId: 'M99'` INSERT 시도
- **Then**: FK 위반 에러. INSERT 거부

### Scenario 6: M1~M5 시드 정합
- **Given**: 시드 후
- **When**: `prisma.module.findMany({ orderBy: { orderIndex: 'asc' } })`
- **Then**: 5개 모듈 반환. orderIndex 1~5 순서

### Scenario 7: revision 수정 시점
- **Given**: Lesson(`L001`) 의 script 가 수정됨
- **When**: `prisma.lesson.update({ where: { lessonId: 'L001' }, data: { script: '...새 본문...', revisionLastUpdated: new Date(), revisionNotes: 'v1.1: 한국 사례 추가' } })`
- **Then**: revisionLastUpdated 갱신. updatedAt 도 자동 갱신

### Scenario 8: SQLite + PostgreSQL 호환
- **Given**: 동일 schema
- **When**: 양 환경 마이그레이션
- **Then**: 정상. CHECK 제약은 PostgreSQL 만 적용 (애플리케이션 레이어가 SQLite 보완)

### Scenario 9: 인덱스 성능
- **Given**: Lesson 10편 시드
- **When**: `prisma.lesson.findUnique({ where: { lessonId: 'L001' } })`
- **Then**: p95 < 50ms (인덱스 활용)

## :gear: Technical & Non-Functional Constraints
- **3매체 NOT NULL 강제 (REQ-FUNC-034 · INV-08)**:
  - Prisma 의 `String` (Optional 미지정) 이 NOT NULL
  - 빈 문자열 거부는 애플리케이션 레이어 (Zod `.min(1)`)
  - 본 정책 위반 시 PR 차단 — 시드 검증 + 런타임 검증 이중
- **lesson_id 포맷 (REQ-FUNC-033)**:
  - PostgreSQL CHECK 제약 (선택 — 양 환경 호환 위해 애플리케이션 우선)
  - 모든 API 엔드포인트의 Zod 스키마가 `regex(/^L\d{3}$/)`
- **Module 단일 출처**: Module 시드는 M1~M5 5개 고정. 추가는 별도 PR 필수 (콘텐츠 구조 변경)
- **revision 정책**:
  - `revisionLastUpdated` — 콘텐츠 의미 있는 변경 시만 수동 갱신
  - `updatedAt` — 모든 변경 자동 (Prisma `@updatedAt`)
  - 두 컬럼 분리로 캐시 키 정확성 (FR-PDF-001 의 캐시 키 = revision)
- **인덱스 정책**:
  - `lessonId` UNIQUE (조회 핫스팟)
  - `moduleId` (모듈별 lesson 목록)
  - `revisionLastUpdated` (KPI 집계)
- **VarChar 제한**:
  - `title` 200자 (한국어 100자 정도)
  - `script` Text (제한 없음 — 긴 본문)
  - `revisionNotes` Text
- **금지**:
  - 3매체 중 하나라도 Optional (`String?`) 처리
  - lesson_id 를 자동 증가 정수로 변경 (포맷 강제 위배)
  - Module 추가를 콘텐츠 PR 에 섞기 (구조 변경 분리)

## :checkered_flag: Definition of Done (DoD)
- [ ] 9개 GWT 시나리오 전부 통과
- [ ] Module 모델 + Lesson 모델 정의
- [ ] 3매체 NOT NULL + 빈 문자열 거부 검증
- [ ] M1~M5 시드 적용
- [ ] lessonId 포맷 검증 (Zod 또는 CHECK)
- [ ] 마이그레이션 SQL 파일 커밋
- [ ] SQLite + PostgreSQL 호환 검증
- [ ] 인덱스 성능 측정 (p95 < 50ms)
- [ ] PR 본문에 "PRD 원칙 4·5 의 데이터 레이어 강제" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-001 (Prisma 초기화)
- **Blocks**:
  - CT-DB-004 (LessonProgress — Lesson relation)
  - CT-DB-005 (Stamp — Lesson relation)
  - CT-DB-006 (OxQuestion — Lesson relation)
  - CT-DB-007 (TeacherFeedback·TeacherKit — Lesson relation)
  - CT-MOCK-001 (Lesson 10편 시드)
  - FR-LES-001 (레슨 단건 조회 API)
  - FR-LES-002 (레슨 목록 조회)
  - FR-LES-003 (레슨 시청 페이지)
  - FW-PDF-001~002 (PDF 렌더링 — Lesson 데이터 의존)
- **Related**:
  - 콘텐츠 편집 SOP — revision 갱신 시점 가이드
