# [Feature] CT-DB-006: OxQuestion 모델 + scrollAnchor 컬럼 + Lesson cascade

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-DB-006: OxQuestion 모델 — questionText + correctAnswer + scrollAnchor + questionOrder + Lesson 1:N relation"
labels: 'feature, backend, db, ox, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-DB-006] OxQuestion 테이블 정의 — Lesson 당 5문항 OX 퀴즈 + scrollAnchor (오답 시 본문 점프 위치) + correctAnswer (boolean)
- **목적**: REQ-FUNC-002 (OX 제출) + REQ-FUNC-036 (오답 앵커 스크롤) 의 데이터 기반. correctAnswer 컬럼은 **응답 페이로드에 절대 노출되지 않음** (FW-OX-001·FR-OX-001 가 SELECT 시 명시적 제외). scrollAnchor 가 FR-LES-005 의 앵커 매핑 진실 공급원.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.2.2` — OX_QUESTION 테이블 정의
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-002 (OX 제출), 006 (멱등)
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-036 (앵커 스크롤)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-09 (Lesson 당 OX 5문항)
- 선행: CT-DB-001 (Prisma), CT-DB-003 (Lesson)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **OxQuestion 모델 정의**:
  ```prisma
  model OxQuestion {
    id              String   @id @default(uuid())
    lessonId        String   // FK → Lesson.lessonId
    lesson          Lesson   @relation(fields: [lessonId], references: [lessonId], onDelete: Cascade)

    questionOrder   Int      // 1~5 (Lesson 내 순서)
    questionText    String   @db.Text
    correctAnswer   Boolean  // true=O, false=X
    explanation     String?  @db.Text  // 정답 해설 (PDF 의 OX 영역에 포함)
    scrollAnchor    String   // 본문 §N 앵커 ID (예: "anchor-3")

    createdAt       DateTime @default(now())
    updatedAt       DateTime @updatedAt

    @@unique([lessonId, questionOrder])  // Lesson 당 같은 순서 1개만
    @@index([lessonId])
  }
  ```
- [ ] **`@@unique([lessonId, questionOrder])` 제약 의의**:
  - INV-09 (Lesson 당 OX 5문항) 강제의 한 축 — 동일 순서 중복 방지
  - 실제 5문항 강제는 별도 — 시드 검증 + Server Action 의 sanity check
- [ ] **cascade 정책** — Lesson 삭제 시 OxQuestion 도 자동 DELETE (`onDelete: Cascade`):
  - 콘텐츠 일관성 보장
  - Lesson 이 삭제됐는데 orphan OxQuestion 이 남는 상황 방지
- [ ] **questionOrder 1~5 강제** — DB CHECK 제약 (PostgreSQL 만):
  ```sql
  ALTER TABLE "OxQuestion" ADD CONSTRAINT question_order_range CHECK ("questionOrder" BETWEEN 1 AND 5);
  ```
  - SQLite 호환 위해 애플리케이션 Zod 검증 우선
- [ ] **scrollAnchor 포맷 검증**:
  - 패턴 — `anchor-\d+` (예: `anchor-1`, `anchor-3`)
  - Zod 검증 — `regex(/^anchor-\d+$/)`
  - 별도 DB CHECK 는 선택 (PostgreSQL 만)
- [ ] **correctAnswer 보안 — SELECT 시 명시 제외 정책 문서화**:
  - 본 컬럼은 채점 로직 (FW-OX-001) 만 SELECT
  - 클라이언트 응답 (FR-OX-001) 의 props 에는 **절대 포함 금지**
  - SELECT 시 select 절 명시:
    ```ts
    prisma.oxQuestion.findMany({
      where: { lessonId },
      select: { id: true, questionOrder: true, questionText: true, scrollAnchor: true }
      // correctAnswer, explanation 제외
    });
    ```
- [ ] **explanation 컬럼 활용 (PDF 영역)**:
  - FW-PDF-002 의 PDF 템플릿이 OX 해설로 explanation 활용
  - 클라이언트 OX UI (FR-OX-001) 는 explanation 미사용 (오답 시 본문 재학습 유도가 정책)
- [ ] 마이그레이션 — `npx prisma migrate dev --name add_ox_question_model`
- [ ] 마이그레이션 SQL 검토:
  - `UNIQUE INDEX OxQuestion_lessonId_questionOrder_key`
  - `INDEX OxQuestion_lessonId_idx`
  - `FOREIGN KEY OxQuestion_lessonId_fkey ... ON DELETE CASCADE`
- [ ] **Lesson 시드와의 정합성** — CT-MOCK-001 의 Lesson 10편 × OxQuestion 5문항 = 50건 시드. 본 태스크는 모델 정의만, 시드는 CT-MOCK-001

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: OxQuestion 정상 INSERT
- **Given**: Lesson L001 존재
- **When**: `prisma.oxQuestion.create({ data: { lessonId: 'L001', questionOrder: 1, questionText: '화폐는 ...', correctAnswer: true, scrollAnchor: 'anchor-1' } })`
- **Then**: INSERT 정상

### Scenario 2: 동일 (lessonId, questionOrder) 중복 거부
- **Given**: OxQuestion(L001, order=1) 존재
- **When**: 동일 (L001, 1) INSERT 시도
- **Then**: P2002 발생 (UNIQUE 제약)

### Scenario 3: questionOrder 범위 위반
- **Given**: 데이터
- **When**: questionOrder=6 또는 0 INSERT 시도
- **Then**: PostgreSQL CHECK 제약 위반 (또는 애플리케이션 Zod 거부)

### Scenario 4: scrollAnchor 포맷 위반
- **Given**: 데이터
- **When**: scrollAnchor='invalid-format' INSERT 시도
- **Then**: 애플리케이션 Zod 거부

### Scenario 5: Lesson cascade DELETE
- **Given**: Lesson(L001) 의 OxQuestion 5건 존재
- **When**: `prisma.lesson.delete({ where: { lessonId: 'L001' } })`
- **Then**: OxQuestion 5건 자동 DELETE (cascade). orphan 0

### Scenario 6: correctAnswer 노출 부재 검증
- **Given**: FW-OX-001 (RSC 부모) 가 OxQuestion 을 클라이언트로 전달하는 경로
- **When**: select 절 검증
- **Then**: correctAnswer + explanation 미포함. 정적 분석으로 회귀 차단 (별도 CI 룰 또는 코드 리뷰)

### Scenario 7: Lesson 당 5문항 강제 (시드 검증)
- **Given**: 시드 스크립트 실행 후
- **When**: `prisma.oxQuestion.groupBy({ by: ['lessonId'], _count: true })`
- **Then**: 모든 lesson 의 _count === 5. 4 또는 6 건 발견 시 시드 검증 실패

### Scenario 8: SQLite + PostgreSQL 호환
- **Given**: 동일 schema
- **When**: 양 환경 마이그레이션
- **Then**: 정상. CHECK 제약은 PostgreSQL 만, 애플리케이션이 SQLite 보완

### Scenario 9: 인덱스 성능
- **Given**: 50건 OxQuestion 시드 (10 lesson × 5 문항)
- **When**: `prisma.oxQuestion.findMany({ where: { lessonId: 'L001' }, orderBy: { questionOrder: 'asc' } })`
- **Then**: p95 < 50ms

## :gear: Technical & Non-Functional Constraints
- **correctAnswer 보안 강제**:
  - 클라이언트 응답에 절대 노출 금지 (FW-OX-001 의 RSC 분리 + FR-OX-001 의 정적 분석)
  - DB 컬럼은 보존 (서버 채점 로직 활용). 응답 포함만 차단
- **cascade 정책 (Lesson → OxQuestion)**:
  - Lesson 삭제 시 OxQuestion 자동 DELETE
  - 단 운영상 Lesson 직접 삭제는 거의 없음 — soft delete 정책 별도 (별도 후속 태스크)
- **scrollAnchor 진실 공급원**:
  - 본 컬럼이 FR-LES-005 의 앵커 매핑 SSOT
  - script 텍스트의 `<section id="anchor-N">` 마크업이 본 값과 1:1 매칭
  - 콘텐츠 편집 SOP — script 편집 시 scrollAnchor 정합성 점검 필수
- **questionOrder 정책**: 1~5 강제. 클라이언트는 항상 questionOrder 기준 정렬
- **explanation 활용 분리**:
  - PDF (FW-PDF-002) 만 노출
  - 클라이언트 OX UI 는 미사용 (재학습 유도)
- **인덱스**:
  - `(lessonId, questionOrder)` UNIQUE — 핫스팟 조회
  - `lessonId` 단독 — 부분 매칭 시
- **금지**:
  - correctAnswer 를 클라이언트 응답에 포함
  - questionOrder 외의 정렬 (운영 일관성)
  - Lesson 당 5문항 외 (4 또는 6 건 — INV-09 위반)
  - scrollAnchor 누락 (REQ-FUNC-036 의 데이터 의존성)

## :checkered_flag: Definition of Done (DoD)
- [ ] 9개 GWT 시나리오 전부 통과
- [ ] OxQuestion 모델 + UNIQUE + CASCADE 제약 정의
- [ ] correctAnswer 노출 부재 정책 문서화 (PR 본문 + 코드 주석)
- [ ] questionOrder 1~5 + scrollAnchor 포맷 검증
- [ ] cascade DELETE 동작 검증
- [ ] 시드 검증 — Lesson 당 5문항 강제
- [ ] SQLite + PostgreSQL 호환
- [ ] 인덱스 성능 측정 (p95 < 50ms)
- [ ] PR 본문에 "OX 채점·앵커 스크롤의 데이터 기반. correctAnswer 보안 핵심" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-001 (Prisma 초기화)
  - CT-DB-003 (Lesson — relation 대상)
- **Blocks**:
  - CT-MOCK-001 (Lesson 시드 — OxQuestion 50건 포함)
  - FW-OX-001 (OX 채점 — correctAnswer SELECT)
  - FW-OX-002 (P2002 멱등 변환)
  - FR-OX-001 (OX UI — questionText·scrollAnchor SELECT)
  - FR-LES-005 (앵커 스크롤 — scrollAnchor 활용)
  - FW-PDF-002 (PDF 템플릿 — explanation 활용)
  - TS-UT-003 (OX 멱등 단위 테스트)
- **Related**:
  - INV-09 (Lesson 당 OX 5문항) 강제의 한 축
