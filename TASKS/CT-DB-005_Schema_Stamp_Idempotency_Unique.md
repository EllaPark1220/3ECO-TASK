# [Feature] CT-DB-005: Stamp 모델 정의 (영구 멱등 키 UNIQUE 제약 포함)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-DB-005: Stamp 모델 정의 (영구 멱등 키 UNIQUE 제약 포함)"
labels: 'feature, backend, db, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-DB-005] `Stamp` Prisma 모델 정의 + `@@unique([userId, lessonId])` 제약 (영구 멱등 키 · §1.5.1.1 Option B)
- **목적**: OX 통과 시 발급되는 진주 스탬프의 데이터 무결성을 데이터 레이어에서 구조적으로 보장한다. 이 UNIQUE 제약은 단순한 중복 방지가 아니라, **REQ-FUNC-006의 멱등성 보장 메커니즘 자체**다. 동일 (user_id, lesson_id) 조합의 OX 재제출이 발생하더라도 Prisma `P2002` 에러를 트리거하여 애플리케이션 레이어가 200 응답으로 변환하는 전제조건을 제공한다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.1.1` — ADR-004 Pending Decision · Option B 결정 배경 및 트레이드오프 전수
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-006 (중복 채점·중복 스탬프 발급 방지)
  - `/docs/SRS_V0_9.md#6.2.2` — STAMP 테이블 정의
  - `/docs/SRS_V0_9.md#6.2.3` — INV-03 (조합당 최대 1건), INV-05 (영구 멱등)
- 시퀀스 다이어그램: `/docs/SRS_V0_9.md#3.4.1` (OX 제출 → 스탬프 발급)
- 데이터 모델 (ERD): `/docs/SRS_V0_9.md#6.2.1`
- 선행 결정: §1.5.1.2 C-TEC-003 (Prisma + 로컬 SQLite ↔ Supabase PostgreSQL)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `prisma/schema.prisma` 에 `Stamp` 모델 추가 (id UUID, userId, lessonId, earnedAt)
- [ ] `@@unique([userId, lessonId])` 복합 UNIQUE 제약 추가
- [ ] `User` ↔ `Stamp` (1:N), `Lesson` ↔ `Stamp` (1:N) relation 정의
- [ ] `earnedAt` 에 `@default(now())` 적용
- [ ] `prisma migrate dev` 로 마이그레이션 파일 생성 (`migrations/{ts}_add_stamp_table/migration.sql`)
- [ ] 마이그레이션 SQL 검토 — `CREATE UNIQUE INDEX "Stamp_userId_lessonId_key" ON "Stamp"("userId", "lessonId")` 라인 존재 확인
- [ ] `prisma generate` 로 클라이언트 재생성
- [ ] 로컬 SQLite와 Supabase PostgreSQL 양 환경에서 마이그레이션 검증 (DATABASE_URL 전환 후 `prisma migrate deploy`)
- [ ] Prisma Studio 또는 `psql` 로 제약 존재 시각 확인

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: Stamp 정상 INSERT
- **Given**: User(`u1`)와 Lesson(`L001`) 가 존재함
- **When**: `prisma.stamp.create({ data: { userId: 'u1', lessonId: 'L001' } })` 호출
- **Then**: Stamp 1건이 DB 에 INSERT 되고, `earnedAt` 이 자동 설정되며, 반환된 객체에 UUID 가 발급된다

### Scenario 2: 동일 조합 중복 INSERT 시 P2002 발생
- **Given**: Stamp(`userId=u1, lessonId=L001`) 가 이미 존재함
- **When**: 동일 조합으로 `prisma.stamp.create()` 재호출
- **Then**: `PrismaClientKnownRequestError` 가 throw 되며, `error.code === 'P2002'` 이고 `error.meta.target` 에 `['userId', 'lessonId']` (또는 인덱스명) 가 포함된다. **DB 레코드 수는 1건 그대로 유지된다**

### Scenario 3: 다른 lessonId 는 정상 INSERT
- **Given**: Stamp(`userId=u1, lessonId=L001`) 가 존재함
- **When**: `prisma.stamp.create({ data: { userId: 'u1', lessonId: 'L002' } })` 호출
- **Then**: 새 Stamp 가 정상 INSERT 되어, 동일 user 의 stamp 가 총 2건이 된다 (다른 lesson 은 독립)

### Scenario 4: 마이그레이션 idempotency
- **Given**: 마이그레이션이 한 번 적용된 상태
- **When**: `prisma migrate deploy` 를 다시 실행
- **Then**: "No pending migrations" 메시지 출력. 스키마 변경 없음

## :gear: Technical & Non-Functional Constraints
- **데이터 타입**: id 는 UUID v4 (`@default(uuid())`), userId/lessonId 는 FK 참조 무결성 보장
- **인덱스 성능**: `(userId, lessonId)` 복합 인덱스가 자동 생성되므로, 향후 `findUnique` 조회 p95 ≤ 50ms 달성
- **호환성**: 로컬 SQLite (개발) 와 Supabase PostgreSQL (배포) 양쪽에서 동일 동작 보장 (C-TEC-003)
- **보안**: Supabase RLS 정책은 본 태스크 범위 밖 (CT-DB-011 에서 별도 처리). 본 태스크는 **스키마 + 제약** 만 다룬다
- **마이그레이션 정책**: `prisma migrate dev` 로 생성된 SQL 은 review 후 커밋. 운영 환경에서는 `prisma migrate deploy` 만 사용
- **금지**: 본 태스크에서 임의로 `revision_at_earned` 같은 SRS 미정의 컬럼을 추가하지 말 것 (Constraints — SRS 미명시 기능 추가 금지)

## :checkered_flag: Definition of Done (DoD)
- [ ] 4개 GWT 시나리오 전부 통과
- [ ] `prisma/schema.prisma` 에 Stamp 모델·제약 정의 완료
- [ ] 마이그레이션 SQL 파일이 `prisma/migrations/` 에 커밋됨
- [ ] `prisma generate` 후 TypeScript 클라이언트가 `Stamp` 타입을 export
- [ ] SQLite 로컬 + Supabase 배포 양쪽에서 마이그레이션 검증 완료
- [ ] PR 리뷰 시 SQL 파일의 `CREATE UNIQUE INDEX` 라인 명시적 검토
- [ ] 단위 테스트 4건 (TS-UT-007 일부) 통과
- [ ] Linter (ESLint + Prisma Format) 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-001 (Prisma 초기화 + DATABASE_URL 환경 분리)
  - CT-DB-002 (User 모델 — relation 대상)
  - CT-DB-003 (Lesson 모델 — relation 대상)
- **Blocks**:
  - CT-DB-010 (초기 마이그레이션 + 시드)
  - CT-API-004 (OX 제출 API DTO 정의 — Stamp INSERT 경로 의존)
  - CT-API-005 (스탬프 맵 조회 API)
  - CT-MOCK-003 (진도·스탬프 시드)
  - FW-OX-001 (OX 채점 Server Action)
  - FW-OX-002 (P2002 → 200 변환 — 본 제약이 트리거 조건)
  - FW-STAMP-001 (스탬프 맵 공유)
  - TS-UT-007 (Stamp UNIQUE 제약 검증)
  - TS-UT-003 (OX 멱등 GWT)
