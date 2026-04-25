# [Feature] CT-DB-009: EventLog 모델 — append-only + JSON payload + 90일 retention

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-DB-009: EventLog 모델 — id+userId+event(VarChar)+payload(JsonB)+createdAt + append-only + 90일 retention"
labels: 'feature, backend, db, eventlog, observability, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-DB-009] EventLog 테이블 정의 — 모든 비즈니스 이벤트 (stamp.earned·ox.duplicate_idempotent·auth.signup 등) 의 append-only 기록 + JsonB payload + 90일 retention 정책
- **목적**: REQ-FUNC-002 (이벤트 누락 <0.5%) 의 데이터 진입점. INV-11 (append-only) + 모든 KPI 집계 (FR-KPI-001~009) 의 기반. FW-OX-003 의 발행 대상.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.2.2` — EVENT_LOG 테이블 정의
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-002 (이벤트 누락 <0.5%)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-11 (append-only)
  - `/docs/SRS_V0_9.md#3.6.2` — Event Bus 컴포넌트
  - `/docs/SRS_V0_9.md#4.2.4` — REQ-NF-029 (90일 retention)
- 선행: CT-DB-002 (User), FW-OX-003 (이벤트 발행자)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **EventLog 모델**:
  ```prisma
  model EventLog {
    id         String   @id @default(uuid())
    userId     String?  // anonymize 시 null 가능 (GDPR 대응)
    user       User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

    event      String   @db.VarChar(100)  // dot notation: stamp.earned
    payload    Json     // JsonB (PostgreSQL) / TEXT (SQLite)

    createdAt  DateTime @default(now())

    @@index([event])
    @@index([userId])
    @@index([createdAt])
    @@index([event, createdAt])  // KPI 집계 핫스팟 (event + 기간)
  }
  ```
- [ ] **`onDelete: SetNull` 정책**:
  - User 삭제 시 EventLog 의 userId → null (GDPR 대응 — 이력은 보존, 식별자만 anonymize)
  - cascade DELETE 미사용 — 통계·KPI 데이터 손실 방지
- [ ] **Json vs JsonB 호환**:
  - PostgreSQL — JsonB (인덱싱·쿼리 가능)
  - SQLite — TEXT (Json 직렬화)
  - Prisma `Json` 타입이 양 환경 자동 매핑
- [ ] **append-only 강제 정책**:
  - **코드 레이어** — `lib/events/emit.ts` 만 INSERT. UPDATE·DELETE 함수 미정의
  - **정적 분석** — ESLint custom rule 또는 grep 으로 `prisma.eventLog.update`, `prisma.eventLog.delete` 검출 시 빌드 차단
  - **RLS** — Supabase RLS 정책 (CT-DB-011) 에서 anon·authenticated 의 UPDATE·DELETE 차단. service_role 만 허용 (anonymize 용)
  - **DB 레벨** — PostgreSQL trigger 로 UPDATE·DELETE 차단 가능 (선택 — 운영 복잡도 증가, 본 태스크는 적용 안함)
- [ ] **anonymize Server Action (별도 admin)**:
  - GDPR "잊혀질 권리" 대응
  - service_role 권한으로 EventLog 의 userId 만 NULL UPDATE
  - 단 이는 INV-11 의 append-only 와의 예외 — 식별자 anonymize 만 허용 (event·payload 변경 금지)
- [ ] **payload 보호 정책**:
  - PII (email·password·comment 전체) 절대 미포함
  - lesson_id, position_sec, scroll_to_section, ox_passed 같은 식별자·메타만
  - emit 함수 (FW-OX-003) 의 별도 lint 검증
- [ ] **인덱스 정책 (KPI 집계 핫스팟)**:
  - `event` — 이벤트 타입별 카운트
  - `userId` — 사용자별 이벤트 조회
  - `createdAt` — 시계열 집계
  - `(event, createdAt)` 복합 — KPI 집계의 가장 빈번한 패턴 (예: 지난 30일 stamp.earned 카운트)
- [ ] **90일 retention 정책 (REQ-NF-029)**:
  - Vercel Cron (별도 cron 또는 IF-CRON-001 의 Job 추가) 으로 일 1회 실행
  - `DELETE FROM "EventLog" WHERE "createdAt" < NOW() - INTERVAL '90 days'`
  - 단 KPI·감사 추적성을 위해 집계 데이터는 별도 테이블로 보존 (Stage 2 설계)
  - **본 태스크는 retention 정책 정의만, 실제 cron 은 별도 (IF-CRON-002 등)**
- [ ] **DB 크기 모니터링**:
  - Supabase Free 한도 500MB
  - EventLog 가 가장 빠르게 성장하는 테이블
  - 사용자 1000명 × 이벤트 10건/일 × 90일 = 900K 건 ≈ 100MB 예상 (한도 20%)
  - 한도의 80% 도달 시 retention 정책 강화 또는 Pro 전환
- [ ] 마이그레이션 — `npx prisma migrate dev --name add_event_log_model`

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: EventLog 정상 INSERT
- **Given**: User(`u1`)
- **When**: `prisma.eventLog.create({ data: { userId: 'u1', event: 'stamp.earned', payload: { lesson_id: 'L001' } } })`
- **Then**: INSERT 정상. createdAt 자동 설정

### Scenario 2: anonymous 이벤트 (userId null)
- **Given**: 익명 사용자
- **When**: `prisma.eventLog.create({ data: { userId: null, event: 'page.viewed', payload: {} } })`
- **Then**: INSERT 정상. user relation 은 null

### Scenario 3: User 삭제 시 anonymize (SetNull)
- **Given**: User(`u1`) 의 EventLog 100건
- **When**: User DELETE
- **Then**: EventLog 100건 보존 + 모든 row 의 userId → null. event·payload 는 그대로

### Scenario 4: append-only — UPDATE 시도 차단 (정적 분석)
- **Given**: 코드에서 `prisma.eventLog.update()` 추가 PR
- **When**: CI 정적 분석
- **Then**: 검출 + 빌드 차단

### Scenario 5: append-only — DELETE 시도 차단 (정적 분석)
- **Given**: 코드에서 `prisma.eventLog.delete()` 추가
- **When**: CI 검사
- **Then**: 차단. 단 `lib/admin/anonymize.ts` 의 화이트리스트 경로는 예외

### Scenario 6: KPI 집계 — event + createdAt 복합 인덱스 활용
- **Given**: EventLog 100K 건
- **When**: `prisma.eventLog.count({ where: { event: 'stamp.earned', createdAt: { gte: thirtyDaysAgo } } })`
- **Then**: p95 < 100ms (복합 인덱스)

### Scenario 7: payload PII 부재 검증
- **Given**: EventLog 샘플 1000건
- **When**: payload JSON 검사
- **Then**: email·password·comment 전체 키 0건. 식별자만 포함

### Scenario 8: 90일 retention cron 동작 (별도 IF-CRON-002 의존)
- **Given**: 91일 이전 EventLog 100건 + 89일 이전 100건
- **When**: retention cron 실행
- **Then**: 91일 이전 100건 DELETE. 89일 이전 100건 보존

### Scenario 9: SQLite + PostgreSQL 호환
- **Given**: 양 환경
- **When**: payload JSON INSERT
- **Then**: SQLite 는 TEXT 로 직렬화, PostgreSQL 은 JsonB. 둘 다 정상 read·write

### Scenario 10: DB 크기 모니터링
- **Given**: 90일 운영
- **When**: Supabase Dashboard 의 DB size 확인
- **Then**: EventLog 테이블 크기 < 100MB (Free 한도의 20% 이하)

## :gear: Technical & Non-Functional Constraints
- **append-only (INV-11) 강제 다층**:
  - 코드 — emit 함수만 INSERT
  - 정적 분석 — UPDATE·DELETE 호출 차단 (anonymize 화이트리스트 예외)
  - RLS — Supabase 정책 (CT-DB-011)
- **anonymize 정책 (GDPR 대응)**:
  - userId 만 SetNull 가능 — `lib/admin/anonymize.ts` 의 service_role Server Action
  - event·payload 절대 변경 금지
- **payload 보호**:
  - PII 키 사전 정의 + emit 함수의 검증
  - 의심 키워드 (email, password, ssn 등) 자동 거부
- **인덱스 정책**:
  - 4개 인덱스 — event, userId, createdAt, (event+createdAt)
  - KPI 쿼리 패턴 분석 후 추가 인덱스 (선택)
- **90일 retention**:
  - 본 태스크는 정책 정의만
  - 실제 cron 은 IF-CRON-002 (별도)
  - 90일 이전은 집계 데이터로 별도 보존 (Stage 2 — 별도 테이블 또는 외부 시스템)
- **DB 크기 정책**:
  - Free 500MB 한도 모니터링
  - 80% 도달 시 retention 단축 (90일 → 60일) 또는 Pro 전환
- **응답 시간**: emit (INSERT) p95 < 30ms. 비즈니스 로직 영향 최소
- **금지**:
  - emit 외 함수에서 UPDATE·DELETE
  - PII 키를 payload 에 포함
  - User cascade DELETE (이력 손실 위험)
  - retention 미적용 (DB 한도 초과 위험)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] EventLog 모델 + 4개 인덱스 정의
- [ ] `onDelete: SetNull` 정책 검증
- [ ] append-only 정적 분석 통합 (CI)
- [ ] anonymize Server Action 화이트리스트 정책 문서화
- [ ] payload PII 검증 — emit 함수 (FW-OX-003) 와 정합
- [ ] 마이그레이션 SQL 검토
- [ ] SQLite + PostgreSQL 호환
- [ ] KPI 집계 쿼리 p95 < 100ms 측정
- [ ] DB 크기 모니터링 셋업
- [ ] 90일 retention 정책 문서화 (실제 cron 은 IF-CRON-002 별도)
- [ ] PR 본문에 "REQ-FUNC-002 + INV-11 + 모든 KPI 의 데이터 기반" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-001 (Prisma)
  - CT-DB-002 (User)
- **Blocks**:
  - FW-OX-003 (이벤트 발행 — 본 모델 INSERT)
  - 모든 Server Action 의 EventLog 발행 (auth.signup·auth.signin_attempt·progress.saved·teacher_feedback.submitted 등)
  - FR-KPI-001~009 (모든 KPI 집계)
  - CT-DB-011 (RLS — append-only 강제)
  - IF-CRON-002 (선택 — 90일 retention cron)
  - TS-UT-014 (append-only 검증)
- **Related**:
  - REQ-NF-029 (90일 retention)
  - GDPR 대응 (anonymize)
