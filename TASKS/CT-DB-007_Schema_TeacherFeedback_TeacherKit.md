# [Feature] CT-DB-007: TeacherFeedback + TeacherKit 모델 — 재사용 의사 + PDF 캐시 메타

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-DB-007: TeacherFeedback (will_reuse·used_in_class·comment) + TeacherKit (PDF 캐시 메타) 모델"
labels: 'feature, backend, db, teacher, priority:high, mvp-in, private-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-DB-007] TeacherFeedback (교사 피드백 — will_reuse·used_in_class·comment) + TeacherKit (PDF 캐시 메타 — revision_at_generated·storage_path) 2개 테이블 정의
- **목적**: Story 3 (장은혜) 의 데이터 기반. FW-TF-001 (피드백 제출) + FR-PDF-001 (PDF 다운로드 캐시) 의 데이터 진입점. INV-07 (TeacherFeedback 은 TEACHER role 만 INSERT) 의 데이터 레이어 강제 + REQ-NF-046 (재사용 의사 ≥10명) 누적 측정 기반.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.2.2` — TEACHER_FEEDBACK, TEACHER_KIT 테이블
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-013, 016, 017, 018 (PDF·재사용·구버전·폴백)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-046 (재사용 의사 누적)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-07 (역할 격리)
- 선행: CT-DB-002 (User), CT-DB-003 (Lesson)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **TeacherFeedback 모델**:
  ```prisma
  model TeacherFeedback {
    id            String   @id @default(uuid())
    teacherId     String
    teacher       User     @relation(fields: [teacherId], references: [id], onDelete: Cascade)

    lessonId      String
    lesson        Lesson   @relation(fields: [lessonId], references: [lessonId], onDelete: Cascade)

    willReuse     Boolean
    usedInClass   Boolean
    comment       String?  @db.Text  // 최대 2000자 (Zod 검증)

    reportedAt    DateTime @default(now())

    @@index([teacherId])
    @@index([lessonId])
    @@index([reportedAt])
    @@index([willReuse])  // KPI 집계 핫스팟
  }
  ```
- [ ] **TeacherKit 모델 (PDF 캐시 메타)**:
  ```prisma
  model TeacherKit {
    id                  String   @id @default(uuid())
    lessonId            String
    lesson              Lesson   @relation(fields: [lessonId], references: [lessonId], onDelete: Cascade)

    revisionAtGenerated DateTime  // 생성 시점의 Lesson.revisionLastUpdated 스냅샷
    storagePath         String    // Supabase Storage 의 PDF 경로 (예: "teacher-kit/L001/2026-04-25.pdf")
    fileSizeBytes       Int       // PDF 파일 크기
    generatedAt         DateTime @default(now())

    @@unique([lessonId, revisionAtGenerated])  // revision 별 단일 PDF 캐시
    @@index([lessonId])
    @@index([generatedAt])
  }
  ```
- [ ] **TeacherFeedback 정책**:
  - 재제출 허용 — 동일 (teacher, lesson) 도 새 row INSERT (이력 보존)
  - 집계 시 (FR-TF-001) `groupBy teacherId, lessonId` + `MAX(reportedAt)` 으로 가장 최근만
- [ ] **TeacherKit 정책**:
  - revision 별 단일 PDF 캐시 — `(lessonId, revisionAtGenerated)` UNIQUE
  - 구버전 PDF 도 보존 (FR-PDF-002 의 301 리디렉트 위함)
  - storagePath 는 Supabase Storage 의 `teacher-kit` 버킷 경로
- [ ] **INV-07 강제 (TeacherFeedback 은 TEACHER 만 INSERT)**:
  - 데이터 레이어 — TeacherFeedback 의 teacherId 가 User 참조. role 컬럼은 별도 검증
  - **CT-DB-011 의 RLS 정책** — Supabase 측에서 `INSERT WHERE auth.user.role = 'TEACHER'` 강제
  - 애플리케이션 레이어 — FW-TF-001 의 `requireRole('TEACHER')` 가드
  - 다층 방어 (defense-in-depth)
- [ ] **comment 길이 제한**: 2000자 (Zod). DB Text 는 무제한이라 애플리케이션 검증 우선
- [ ] **PII 보호 — comment 내 PII 자동 추출 정책 미사용**: comment 는 자유 텍스트. 본 태스크는 단순 저장. PII 분석은 별도 운영 SOP
- [ ] **인덱스 정책**:
  - TeacherFeedback — willReuse 인덱스 핵심 (REQ-NF-046 카운트)
  - TeacherKit — `(lessonId, revisionAtGenerated)` UNIQUE 가 캐시 lookup 핫스팟
- [ ] 마이그레이션 — `npx prisma migrate dev --name add_teacher_models`

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: TeacherFeedback 정상 INSERT
- **Given**: TEACHER 사용자 + Lesson L001
- **When**: `prisma.teacherFeedback.create({ data: { teacherId, lessonId: 'L001', willReuse: true, usedInClass: true, comment: '학생 반응 좋음' } })`
- **Then**: INSERT 정상. reportedAt 자동 설정

### Scenario 2: 재제출 허용 (동일 teacher + lesson)
- **Given**: 첫 피드백 존재
- **When**: 동일 (teacher, lesson) 로 다시 `create()`
- **Then**: 새 row INSERT 정상. UNIQUE 제약 없음 (재제출 정책)

### Scenario 3: User cascade DELETE
- **Given**: TEACHER 의 TeacherFeedback 10건 존재
- **When**: User DELETE
- **Then**: TeacherFeedback 10건 자동 DELETE

### Scenario 4: TeacherKit UNIQUE — revision 당 단일
- **Given**: TeacherKit (L001, 2026-04-25) 존재
- **When**: 동일 (L001, 2026-04-25) INSERT 시도
- **Then**: P2002 발생

### Scenario 5: TeacherKit revision 변경 시 새 row
- **Given**: 기존 (L001, 2026-04-25)
- **When**: revision 갱신 (2026-05-01) + 새 PDF 생성 + INSERT
- **Then**: 새 row 정상 INSERT. 구버전 row 도 보존

### Scenario 6: comment 2000자 초과 — 애플리케이션 거부
- **Given**: 2001자 comment
- **When**: FW-TF-001 의 Zod parse
- **Then**: 거부. DB INSERT 0

### Scenario 7: willReuse=true 카운트 조회 (REQ-NF-046)
- **Given**: 다양한 TeacherFeedback 시드
- **When**: `prisma.teacherFeedback.groupBy({ by: ['teacherId', 'lessonId'], _max: { reportedAt: true } })` + 가장 최근만 will_reuse=true 집계
- **Then**: 누적 카운트 정확. 인덱스 활용 p95 < 100ms

### Scenario 8: TeacherKit 캐시 lookup
- **Given**: TeacherKit 100건
- **When**: `prisma.teacherKit.findUnique({ where: { lessonId_revisionAtGenerated: { lessonId, revisionAtGenerated } } })`
- **Then**: p95 < 50ms (UNIQUE 인덱스)

### Scenario 9: SQLite + PostgreSQL 호환
- **Given**: 양 환경
- **When**: 마이그레이션 + INSERT
- **Then**: 동일 동작

### Scenario 10: INV-07 강제 (RLS + 가드)
- **Given**: LEARNER 가 직접 SQL 로 TeacherFeedback INSERT 시도
- **When**: Supabase RLS 정책 (CT-DB-011)
- **Then**: 거부. 애플리케이션 가드 (FW-TF-001) 가 1차, RLS 가 2차 방어

## :gear: Technical & Non-Functional Constraints
- **재제출 정책**: TeacherFeedback 은 동일 (teacher, lesson) 도 새 row INSERT. 이력 보존
- **TeacherKit UNIQUE**: revision 별 단일 PDF 캐시. 구버전도 보존
- **INV-07 강제 (다층 방어)**:
  - 애플리케이션 — FW-TF-001 의 RBAC 가드 (1차)
  - 데이터 — RLS 정책 (CT-DB-011 의 2차)
  - 본 태스크는 모델만, 두 layer 는 별도 태스크
- **comment 길이**: 2000자 (Zod). DB Text 무제한
- **인덱스 정책**:
  - TeacherFeedback `willReuse` — KPI 핫스팟
  - TeacherFeedback `(teacherId, lessonId)` 복합 (groupBy 가속, 선택)
  - TeacherKit `(lessonId, revisionAtGenerated)` UNIQUE — 캐시 lookup
- **fileSizeBytes 활용**: Storage 한도 모니터링. 합산이 1GB 한도 (Free) 80% 도달 시 알림
- **금지**:
  - TeacherFeedback 의 UNIQUE 제약 (재제출 차단 위반)
  - comment 무제한 길이 (성능 + DB 비대화)
  - LEARNER 의 TeacherFeedback INSERT (INV-07)
  - TeacherKit 구버전 자동 DELETE (구버전 리디렉트 위반)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] TeacherFeedback + TeacherKit 모델 정의
- [ ] UNIQUE·CASCADE·INDEX 제약 적용
- [ ] 마이그레이션 SQL 검토
- [ ] SQLite + PostgreSQL 호환
- [ ] willReuse 카운트 쿼리 성능 < 100ms
- [ ] FW-TF-001 (피드백 제출) 통합 검증
- [ ] FR-PDF-001 (PDF 캐시 lookup) 통합 검증
- [ ] PR 본문에 "Story 3 데이터 기반. INV-07 다층 방어의 데이터 layer" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-001 (Prisma)
  - CT-DB-002 (User)
  - CT-DB-003 (Lesson)
- **Blocks**:
  - FW-TF-001 (TeacherFeedback 제출)
  - FR-TF-001 (피드백 집계 — willReuse 카운트)
  - FR-PDF-001 (PDF 캐시 lookup)
  - FW-PDF-002 (PDF 생성 후 TeacherKit INSERT)
  - CT-DB-011 (RLS — INV-07 강제)
  - REQ-NF-046 (재사용 의사 ≥10명) 측정 기반
