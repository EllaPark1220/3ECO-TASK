# [Feature] CT-MOCK-003: 진도·스탬프 시드 — 5개·10개 시나리오 사용자 2명 + INV-04 정합 검증

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-MOCK-003: LessonProgress + Stamp 시드 — 스탬프 5개 보유 사용자 1명 + 10개 사용자 1명 + INV-04 정합 + idempotent"
labels: 'feature, backend, mock, progress, stamp, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-MOCK-003] LessonProgress + Stamp 시드 — 스탬프 5개 시나리오 사용자 1명 + 10개 (스탬프 트리거) 사용자 1명 + 진도 (lastPositionSec, oxCompleted) + INV-04 (stampEarned ⇒ oxCompleted) 정합 강제
- **목적**: Story 1 (박지훈 P1 체계감) + Story 4 (오세은 재진입 위치) 의 데이터 기반. FW-OX-004 (스탬프 10자리 트리거) 의 임계 시나리오 픽스처. KPI 집계 (FR-KPI-002 L4 완주) 의 시드 데이터.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.2.2` — LESSON_PROGRESS + STAMP 테이블
  - `/docs/SRS_V0_9.md#6.2.3` — INV-04 (stampEarned ⇒ oxCompleted), INV-12 (LessonProgress·Stamp 정합)
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-003 (스탬프 10자리 트리거)
- 페르소나: SH-01 박지훈 (체계감), SH-07 오세은 (단편 세션)
- 선행: CT-DB-004 (LessonProgress), CT-DB-005 (Stamp), CT-MOCK-001 (Lesson 10편), CT-MOCK-002 (User 5명)
- 짝: FW-OX-004 (스탬프 10자리 트리거), TS-IT-003 (10자리 → 설문 메일)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `prisma/seed/progress-stamps.ts` 신규 파일
- [ ] **시나리오 정의 (2명)**:
  ```ts
  const scenarios = [
    {
      // Scenario A: 박지훈 페르소나 — 스탬프 5개 (절반 진행)
      email: 'jihoon@test.example.com',  // CT-MOCK-002 에서 추가 필요 (별도 후속)
      // 또는 기존 learner@test.example.com 활용
      stamps: ['L001', 'L002', 'L003', 'L004', 'L005'],
      progress: [
        // 5개 stamp = 5개 lesson oxCompleted+stampEarned
        // + 진행 중인 lesson 1개 (L006 lastPositionSec=120)
        { lessonId: 'L001', oxCompleted: true, stampEarned: true, lastPositionSec: 300 },
        { lessonId: 'L002', oxCompleted: true, stampEarned: true, lastPositionSec: 280 },
        { lessonId: 'L003', oxCompleted: true, stampEarned: true, lastPositionSec: 350 },
        { lessonId: 'L004', oxCompleted: true, stampEarned: true, lastPositionSec: 220 },
        { lessonId: 'L005', oxCompleted: true, stampEarned: true, lastPositionSec: 270 },
        { lessonId: 'L006', oxCompleted: false, stampEarned: false, lastPositionSec: 120 },  // 진행 중
      ],
    },
    {
      // Scenario B: 스탬프 10개 시나리오 — FW-OX-004 트리거
      email: 'stamps10@test.example.com',
      stamps: ['L001', 'L002', 'L003', 'L004', 'L005', 'L006', 'L007', 'L008', 'L009', 'L010'],
      progress: [
        { lessonId: 'L001', oxCompleted: true, stampEarned: true, lastPositionSec: 300 },
        // ... L002~L010 모두 동일 패턴
      ],
    },
  ];
  ```
- [ ] **CT-MOCK-002 의 사용자 추가 — 박지훈 페르소나 + 10자리 시나리오 사용자**:
  - 본 시드는 CT-MOCK-002 와 통합 또는 별도 사용자 동적 추가 검토
  - **본 태스크는 별도 사용자 추가 정책 채택** — `prisma/seed/progress-stamps.ts` 가 사용자 시드도 포함
  - 추가 2명: `jihoon@test.example.com` (Scenario A), `stamps10@test.example.com` (Scenario B)
- [ ] **INV-04 정합 강제 (Zod refine)**:
  ```ts
  const ProgressSeedSchema = z.object({
    lessonId: z.string().regex(/^L\d{3}$/),
    oxCompleted: z.boolean(),
    stampEarned: z.boolean(),
    lastPositionSec: z.number().int().min(0).max(36000),
  }).refine(
    data => !data.stampEarned || data.oxCompleted,
    'INV-04: stampEarned=true 면 oxCompleted 도 true 여야 함'
  );
  ```
- [ ] **INV-12 정합 강제 (LessonProgress vs Stamp)**:
  - 시드 내 stampEarned=true 인 lesson 수 = Stamp INSERT 카운트
  - verify 스크립트에서 검증
- [ ] **트랜잭션 시드** — User 추가 + LessonProgress upsert + Stamp create 를 하나의 트랜잭션:
  ```ts
  await prisma.$transaction(async (tx) => {
    for (const progress of scenario.progress) {
      await tx.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId: progress.lessonId } },
        create: { userId, ...progress },
        update: progress,
      });
    }
    for (const lessonId of scenario.stamps) {
      await tx.stamp.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        create: { userId, lessonId, earnedAt: new Date() },
        update: {},  // earnedAt 보존
      });
    }
  });
  ```
- [ ] **idempotent 정책**:
  - upsert 활용
  - earnedAt 은 첫 INSERT 시점만 (재실행 시 보존)
- [ ] **verify-progress 검증 스크립트**:
  ```ts
  // 1. 시나리오 A 의 사용자가 Stamp 5건 + LessonProgress 6건 (5건 stampEarned + 1건 진행)
  // 2. 시나리오 B 의 사용자가 Stamp 10건 + LessonProgress 10건 (모두 stampEarned)
  // 3. INV-04 — stampEarned=true 인 모든 row 의 oxCompleted=true 검증
  // 4. INV-12 — 사용자별 Stamp 카운트 = LessonProgress 의 stampEarned=true 카운트
  ```
- [ ] **`prisma/seed/index.ts` 통합 순서**: Module → Lesson → User (CT-MOCK-002) → OxQuestion → Progress·Stamp (본 태스크)
- [ ] **CI 통합** — `npm run db:seed:verify-progress`

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 시드 정상 실행
- **Given**: 클린 DB + Module/Lesson/User 시드 완료
- **When**: `npm run db:seed:progress`
- **Then**: 박지훈 — Stamp 5건 + LessonProgress 6건. 10자리 사용자 — Stamp 10건 + LessonProgress 10건

### Scenario 2: idempotent 재실행
- **Given**: 1차 시드 완료
- **When**: 재실행
- **Then**: 에러 0. earnedAt 보존 (변경 0)

### Scenario 3: INV-04 정합
- **Given**: 시드 후
- **When**: `findMany({ where: { stampEarned: true, oxCompleted: false } })`
- **Then**: 결과 0건 (INV-04 위반 0)

### Scenario 4: INV-12 정합
- **Given**: 시드 후
- **When**: 사용자별 Stamp 카운트 vs LessonProgress(stampEarned=true) 카운트 비교
- **Then**: 두 카운트 일치 (각 사용자별)

### Scenario 5: 박지훈 진행 중 lesson
- **Given**: 시드 후
- **When**: 박지훈의 L006 LessonProgress 조회
- **Then**: oxCompleted=false, stampEarned=false, lastPositionSec=120

### Scenario 6: 10자리 사용자 — FW-OX-004 트리거 픽스처
- **Given**: 시드 후
- **When**: `prisma.stamp.count({ where: { userId: stamps10UserId } })`
- **Then**: 10. FW-OX-004 의 트리거 시나리오 검증 가능

### Scenario 7: lastPositionSec 검증
- **Given**: 시드 후
- **When**: 모든 LessonProgress 의 lastPositionSec 검사
- **Then**: 0~36000 범위 내. 음수 0건

### Scenario 8: 트랜잭션 — 부분 실패 시 롤백
- **Given**: 시나리오 A 의 stamp INSERT 중 하나가 의도적으로 fail
- **When**: 시드 실행
- **Then**: 트랜잭션 전체 롤백. 박지훈의 progress·stamp 모두 미시드

### Scenario 9: verify-progress 통과
- **Given**: 시드 후
- **When**: `npm run db:seed:verify-progress`
- **Then**: 검증 4건 (시나리오 A·B 각자 + INV-04 + INV-12) 모두 통과

### Scenario 10: SQLite + PostgreSQL 호환
- **Given**: 동일 시드 스크립트
- **When**: 양 환경 실행
- **Then**: 양 환경 동일 결과

## :gear: Technical & Non-Functional Constraints
- **트랜잭션 강제**: User + LessonProgress + Stamp 를 단일 트랜잭션. 부분 실패 롤백
- **idempotent**: upsert + earnedAt 보존. 재실행 안전
- **INV-04 정합 (Zod refine + verify)**: 시드 단계 + verify 단계 양쪽 검증
- **INV-12 정합**: Stamp 카운트 = LessonProgress(stampEarned=true) 카운트 — verify 강제
- **두 시나리오 분리**:
  - **A** — 절반 진행 (Story 1·4 일반 케이스)
  - **B** — 10자리 도달 (FW-OX-004 트리거 + REQ-FUNC-003 시나리오)
- **earnedAt 시점 정책**: 시드 시점 (`new Date()`). 재실행 시 보존 (upsert update 절에 earnedAt 미포함)
- **사용자 동적 추가 정책**: CT-MOCK-002 의 5명 외 추가 2명을 본 시드에서 처리. 의존 사슬 분리
- **CI 통합**: 매 PR 시드 + verify 자동 실행
- **응답 시간**: 시드 전체 ≤ 30초 (User + Lesson + OxQuestion + Progress·Stamp 합산)
- **금지**:
  - INV-04 위반 시드 (stampEarned=true + oxCompleted=false)
  - INV-12 위반 (Stamp 와 LessonProgress 카운트 불일치)
  - 트랜잭션 외 단일 INSERT (부분 실패 위험)
  - earnedAt 재시드 시 갱신 (이력 손상)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `prisma/seed/progress-stamps.ts` 시드 스크립트
- [ ] 박지훈 (5 stamps + 1 진행 중) + 10자리 사용자 시드
- [ ] 트랜잭션 + idempotent 검증
- [ ] INV-04 + INV-12 정합 강제
- [ ] verify-progress 검증 스크립트
- [ ] CI 통합
- [ ] SQLite + PostgreSQL 양 환경 호환
- [ ] PR 본문에 "Story 1·4 데이터 기반 + FW-OX-004 트리거 픽스처" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-004 (LessonProgress 모델)
  - CT-DB-005 (Stamp 모델)
  - CT-DB-002 (User)
  - CT-MOCK-001 (Lesson 10편 시드)
  - CT-MOCK-002 (User 5명 시드)
- **Blocks**:
  - TS-E2E-001 (박지훈 E2E — 5 stamp 픽스처 활용)
  - TS-E2E-002 (오세은 E2E — 진행 중 lesson 픽스처)
  - TS-IT-001 (Stamp INSERT 통합 테스트)
  - TS-IT-003 (10자리 → 설문 메일)
  - FR-KPI-002 (L4 완주 KPI — 본 시드의 Stamp 카운트 활용)
  - FW-OX-004 (스탬프 10자리 트리거 픽스처)
- **Related**:
  - INV-04 (stampEarned ⇒ oxCompleted)
  - INV-12 (LessonProgress vs Stamp 정합)
