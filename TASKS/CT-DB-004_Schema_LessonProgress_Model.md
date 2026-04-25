# [Feature] CT-DB-004: LessonProgress 모델 + 복합 UNIQUE + 진도 상태 컬럼

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-DB-004: LessonProgress 모델 — userId+lessonId UNIQUE + lastPositionSec + oxCompleted + stampEarned"
labels: 'feature, backend, db, progress, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-DB-004] LessonProgress 테이블 정의 — 사용자별·레슨별 학습 진도 (재생 위치 + OX 완료 + 스탬프 발급) 관리 + `(userId, lessonId)` 복합 UNIQUE 로 자연 멱등 키 강제
- **목적**: Story 4 (오세은 · 재개 위치) + Story 1 (박지훈 · OX 통과) 의 데이터 기반. INV-04 (stampEarned 는 oxCompleted 전제) + INV-12 (LessonProgress 와 Stamp 정합) 데이터 레이어 강제. FW-PROG-001 (UPSERT) 의 멱등 키.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.2.2` — LESSON_PROGRESS 테이블 정의
  - `/docs/SRS_V0_9.md#4.1.4` — REQ-FUNC-020, 021, 024 (진도·재개·다기기)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-04 (stampEarned 전제), INV-12 (정합성)
  - `/docs/SRS_V0_9.md#1.5.1.1` — Option B 의 LessonProgress 활용 (read-only short-circuit)
- 선행: CT-DB-001 (Prisma), CT-DB-002 (User), CT-DB-003 (Lesson)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **LessonProgress 모델 정의**:
  ```prisma
  model LessonProgress {
    id              String   @id @default(uuid())
    userId          String
    user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

    lessonId        String
    lesson          Lesson   @relation(fields: [lessonId], references: [lessonId], onDelete: Cascade)

    lastPositionSec Int      @default(0)
    oxCompleted     Boolean  @default(false)
    stampEarned     Boolean  @default(false)

    createdAt       DateTime @default(now())
    updatedAt       DateTime @updatedAt

    @@unique([userId, lessonId])  // 자연 멱등 키
    @@index([userId])
    @@index([lessonId])
  }
  ```
- [ ] **`@@unique([userId, lessonId])` 의 의의**:
  - 자연 멱등 키 — Stamp 의 UNIQUE 와 짝
  - FW-PROG-001 의 UPSERT 가 본 제약 활용
  - INV-12 (LessonProgress 와 Stamp 정합) 의 한 축 — 동일 조합당 단일 row
- [ ] **cascade 정책**:
  - User 삭제 → LessonProgress 자동 DELETE
  - Lesson 삭제 → LessonProgress 자동 DELETE
- [ ] **INV-04 강제 (stampEarned 는 oxCompleted 전제)**:
  - DB CHECK 제약 (PostgreSQL):
    ```sql
    ALTER TABLE "LessonProgress" ADD CONSTRAINT stamp_requires_ox CHECK (NOT "stampEarned" OR "oxCompleted");
    ```
  - SQLite 호환을 위해 **애플리케이션 레이어 (FW-OX-001 의 트랜잭션) 가 우선 강제**
- [ ] **컬럼 의의**:
  - `lastPositionSec` — REQ-FUNC-020·021 의 데이터 진입점. 0 ~ 영상 길이
  - `oxCompleted` — OX 5문항 모두 정답 시 true
  - `stampEarned` — Stamp INSERT 성공 시 true. INV-04 에 따라 `oxCompleted=true` 일 때만 가능
- [ ] **인덱스 정책**:
  - `(userId, lessonId)` UNIQUE — 핫스팟 조회 (FR-PROG-001)
  - `userId` 단독 — 사용자별 진도 목록 (FR-STAMP-001 의 stamp 조회 + 진도 비교)
  - `lessonId` 단독 — 레슨별 KPI (완주율 집계)
- [ ] 마이그레이션 — `npx prisma migrate dev --name add_lesson_progress_model`
- [ ] 마이그레이션 SQL 검토:
  - UNIQUE INDEX
  - 2개 단독 INDEX
  - FK CASCADE
  - CHECK 제약 (PostgreSQL 만)
- [ ] **데이터 일관성 정책**:
  - LessonProgress 와 Stamp 의 정합성 — INV-12. 본 모델은 stampEarned boolean 만 보유. 실제 Stamp row 는 별도 (CT-DB-005)
  - 두 테이블 간 sync 깨짐 방지 — FW-OX-001 의 트랜잭션이 두 INSERT 동시 처리

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: LessonProgress 정상 INSERT (UPSERT)
- **Given**: User(`u1`) + Lesson(`L001`)
- **When**: `prisma.lessonProgress.upsert({ where: { userId_lessonId: { userId: 'u1', lessonId: 'L001' } }, create: { userId: 'u1', lessonId: 'L001', lastPositionSec: 30 }, update: { lastPositionSec: 30 } })`
- **Then**: 1건 INSERT. lastPositionSec=30, oxCompleted=false, stampEarned=false (default)

### Scenario 2: 동일 (userId, lessonId) 중복 INSERT 거부
- **Given**: 위 row 존재
- **When**: `prisma.lessonProgress.create({ data: { userId: 'u1', lessonId: 'L001', ... } })` (upsert 가 아닌 create)
- **Then**: P2002 발생 (UNIQUE 제약)

### Scenario 3: INV-04 위반 시도 시 거부 (PostgreSQL CHECK)
- **Given**: PostgreSQL 환경
- **When**: `stampEarned=true, oxCompleted=false` INSERT 시도
- **Then**: CHECK 제약 위반 → 거부

### Scenario 4: User cascade DELETE
- **Given**: User(`u1`) 의 LessonProgress 5건 존재
- **When**: `prisma.user.delete({ where: { id: 'u1' } })`
- **Then**: LessonProgress 5건 자동 DELETE

### Scenario 5: Lesson cascade DELETE
- **Given**: Lesson(`L001`) 의 LessonProgress 100건 존재 (다양한 사용자)
- **When**: `prisma.lesson.delete({ where: { lessonId: 'L001' } })`
- **Then**: 100건 자동 DELETE

### Scenario 6: UPSERT 패턴 — FW-PROG-001 정합
- **Given**: 기존 row 존재 (lastPositionSec=30)
- **When**: `prisma.lessonProgress.upsert({ ..., update: { lastPositionSec: 60 } })`
- **Then**: lastPositionSec=60 으로 갱신. updatedAt 자동 갱신

### Scenario 7: SQLite 호환
- **Given**: SQLite 환경
- **When**: 마이그레이션 + INSERT
- **Then**: UNIQUE 정상. CHECK 제약은 SQLite 미적용 (애플리케이션 레이어 보완)

### Scenario 8: 인덱스 성능
- **Given**: LessonProgress 1000건
- **When**: `prisma.lessonProgress.findUnique({ where: { userId_lessonId: ... } })`
- **Then**: p95 < 50ms

### Scenario 9: 동시 100 UPSERT — race condition 부재
- **Given**: 동일 (userId, lessonId) 로 100 동시 UPSERT
- **When**: Promise.all
- **Then**: 결과 row 1건 (UPSERT 가 UNIQUE 제약과 함께 멱등). lastPositionSec 은 최후 값

### Scenario 10: stampEarned + oxCompleted 정합
- **Given**: oxCompleted=false, stampEarned=true 시도 (애플리케이션 레이어 검증)
- **When**: 코드에서 비정상 UPDATE 시도
- **Then**: 코드 리뷰 또는 단위 테스트 (TS-UT-006) 가 차단

## :gear: Technical & Non-Functional Constraints
- **자연 멱등 키**: `(userId, lessonId)` UNIQUE. UPSERT 패턴의 핵심 enabler
- **cascade 정책**: User·Lesson 삭제 시 자동 정리. orphan 방지
- **INV-04 강제 정책**:
  - DB CHECK (PostgreSQL 만)
  - 애플리케이션 레이어 (FW-OX-001) 우선
  - 단위 테스트로 회귀 방지
- **인덱스 정책**:
  - 복합 UNIQUE — 핫스팟
  - userId·lessonId 단독 — KPI 집계
- **컬럼 default**: 모든 boolean default false. lastPositionSec default 0
- **응답 시간 영향**: UPSERT p95 < 50ms (인덱스 활용)
- **Stamp 와의 분리**:
  - LessonProgress.stampEarned — boolean (UI 빠른 조회)
  - Stamp row — 발급 일자·통계 (KPI 활용)
  - 두 테이블 간 sync 는 FW-OX-001 트랜잭션이 보장
- **금지**:
  - lastPositionSec 음수 (애플리케이션 검증)
  - stampEarned=true 인데 oxCompleted=false (INV-04 위반)
  - LessonProgress 직접 DELETE (cascade 만 사용)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] LessonProgress 모델 + UNIQUE + CASCADE 제약 정의
- [ ] CHECK 제약 (PostgreSQL) 추가
- [ ] 마이그레이션 SQL 검토
- [ ] SQLite + PostgreSQL 양 환경 호환
- [ ] 인덱스 성능 측정 (p95 < 50ms)
- [ ] FW-PROG-001 (UPSERT) 와 정합 검증
- [ ] FW-OX-001 의 트랜잭션 INV-04 강제 검증
- [ ] PR 본문에 "Story 1·4 의 데이터 기반. INV-04·12 강제" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-001 (Prisma)
  - CT-DB-002 (User)
  - CT-DB-003 (Lesson)
- **Blocks**:
  - CT-DB-005 (Stamp — INV-12 정합)
  - FW-OX-001 (OX 채점 — LessonProgress UPDATE)
  - FW-PROG-001 (진도 저장 — UPSERT)
  - FR-PROG-001 (재진입 위치 복원)
  - FR-STAMP-001 (스탬프 맵 — 진도 정보)
  - FR-KPI-002 (완주율 KPI — oxCompleted 집계)
  - TS-IT-007 (재개 위치 100회 시나리오)
- **Related**:
  - INV-04, INV-12 (불변식)
