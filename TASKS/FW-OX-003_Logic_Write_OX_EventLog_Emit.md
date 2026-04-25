# [Feature] FW-OX-003: EventLog 발행 분리 — stamp.earned + ox.duplicate_idempotent + lesson.completed

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-OX-003: OX 채점·멱등 변환 직후 EventLog 발행 — stamp.earned/ox.duplicate_idempotent 분리 + KPI 집계 기반"
labels: 'feature, backend, eventlog, observability, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-OX-003] FW-OX-001 (정상 INSERT) + FW-OX-002 (P2002 멱등 변환) 직후 호출되는 EventLog 발행 함수 — `stamp.earned` (정상) + `ox.duplicate_idempotent` (멱등) + `lesson.completed` (필요 시) 이벤트 분리 기록
- **목적**: REQ-FUNC-002 (이벤트 누락 <0.5%) + KPI 집계 (FR-KPI-001~005) + §1.5.1.1 Option A 이전 트리거 측정의 데이터 진입점. 정상 INSERT 와 멱등 변환을 별도 이벤트로 분리하여 KPI 집계 시 중복 카운트 방지 + 운영 모니터링 기반 마련.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.1.1` — Option B 의 이벤트 분리 정책 (구현 규약 4)
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-002 (이벤트 누락 <0.5%)
  - `/docs/SRS_V0_9.md#6.2.2` — EVENT_LOG 테이블
  - `/docs/SRS_V0_9.md#6.2.3` — INV-11 (EventLog append-only)
  - `/docs/SRS_V0_9.md#3.6.2` — Event Bus 컴포넌트
  - `/docs/SRS_V0_9.md#5.1` — TC-002 (이벤트 누락 검증)
- 선행: CT-DB-009 (EventLog 모델), FW-OX-001, FW-OX-002

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **EventLog 모델 의존 확인** — CT-DB-009:
  ```prisma
  model EventLog {
    id         String   @id @default(uuid())
    userId     String?  // anonymize 시 null
    event      String   @db.VarChar(100)  // dot notation: stamp.earned
    payload    Json     @db.JsonB         // 이벤트별 데이터
    createdAt  DateTime @default(now())

    user       User?    @relation(fields: [userId], references: [id])

    @@index([event])
    @@index([userId])
    @@index([createdAt])
  }
  ```
- [ ] **이벤트 카탈로그 정의 — `lib/events/catalog.ts`**:
  ```ts
  export const EVENT_TYPES = {
    // OX
    STAMP_EARNED: 'stamp.earned',
    OX_DUPLICATE_IDEMPOTENT: 'ox.duplicate_idempotent',
    OX_SUBMITTED: 'ox.submitted',
    OX_FAILED: 'ox.failed',  // 오답 제출
    LESSON_COMPLETED: 'lesson.completed',  // OX 통과 + stamp 발급 = 1편 완료
    // Auth
    AUTH_SIGNUP: 'auth.signup',
    AUTH_SIGNIN_ATTEMPT: 'auth.signin_attempt',
    AUTH_ACCESS_DENIED: 'auth.access_denied',
    // Progress
    PROGRESS_SAVED: 'progress.saved',
    PROGRESS_ANOMALY: 'progress.anomaly',
    // Teacher
    TEACHER_KIT_DOWNLOADED: 'teacher_kit.downloaded',
    TEACHER_FEEDBACK_SUBMITTED: 'teacher_feedback.submitted',
    // User
    USER_PREFERENCES_UPDATED: 'user.preferences_updated',
  } as const;

  export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];
  ```
- [ ] **이벤트 발행 헬퍼 — `lib/events/emit.ts`**:
  ```ts
  import { prisma } from '@/lib/db';
  import type { EventType } from './catalog';

  export async function emitEvent(params: {
    userId?: string | null;
    event: EventType;
    payload: Record<string, unknown>;
  }): Promise<void> {
    try {
      await prisma.eventLog.create({
        data: {
          userId: params.userId ?? null,
          event: params.event,
          payload: params.payload as any,
        },
      });
    } catch (error) {
      // EventLog 발행 실패는 메인 비즈니스 로직 영향 금지
      // Sentry 알림 + 본 호출자에게는 silently fail
      console.error('emitEvent failed:', error);
      // Sentry.captureException(error);
    }
  }
  ```
- [ ] **FW-OX-001 통합 (정상 INSERT)**:
  ```ts
  // submitOx 의 트랜잭션 직후
  await prisma.$transaction([...]);  // FW-OX-001
  await emitEvent({
    userId: user.id,
    event: 'stamp.earned',
    payload: { lesson_id, ox_passed: true, stamp_earned: true },
  });
  await emitEvent({
    userId: user.id,
    event: 'lesson.completed',
    payload: { lesson_id, completed_at: new Date().toISOString() },
  });
  ```
- [ ] **FW-OX-002 통합 (멱등 변환)**:
  ```ts
  // P2002 catch 블록
  catch (error) {
    if (error.code === 'P2002' && error.meta?.target === '...stamp_unique...') {
      await emitEvent({
        userId: user.id,
        event: 'ox.duplicate_idempotent',
        payload: { lesson_id, prior_earned_at: existingStamp.earnedAt },
      });
      return existingResponse;
    }
    throw error;
  }
  ```
- [ ] **오답 제출 발행 (FW-OX-001 정상 경로)**:
  ```ts
  // 오답 시
  await emitEvent({
    userId: user.id,
    event: 'ox.failed',
    payload: { lesson_id, scroll_to_section, wrong_count },
  });
  ```
- [ ] **PII 보호 정책 — payload 검증**:
  - email·비밀번호·comment 같은 PII 절대 포함 금지
  - lesson_id, scroll_to_section 등 식별자만
- [ ] **append-only 강제 (INV-11)**:
  - EventLog UPDATE/DELETE Server-side 금지
  - Prisma 의 `eventLog.update`·`delete` 사용 금지 (코드 리뷰 + 정적 분석)
  - 단 admin 도구의 anonymize (user_id null 변경) 은 GDPR 대응으로 예외 — 별도 admin Server Action
- [ ] **silent fail 정책**:
  - EventLog 발행 실패가 메인 비즈니스 로직 (OX 채점·스탬프 발급) 에 영향 0
  - 실패 시 Sentry 알림 + 호출자는 정상 응답 받음
  - 누락률 < 0.5% 보장 (REQ-FUNC-002 AC)
- [ ] **batched emission (선택)**: 다중 이벤트 동시 발행 시 `prisma.eventLog.createMany` 활용 — 성능 최적화

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 INSERT — stamp.earned + lesson.completed 발행
- **Given**: 사용자 OX 첫 통과
- **When**: FW-OX-001 트랜잭션 직후
- **Then**: EventLog 에 `stamp.earned` 1건 + `lesson.completed` 1건 INSERT. payload 에 lesson_id 포함

### Scenario 2: 멱등 변환 — ox.duplicate_idempotent 발행
- **Given**: 동일 OX 재제출 (P2002 catch)
- **When**: FW-OX-002 의 catch 블록
- **Then**: EventLog 에 `ox.duplicate_idempotent` 1건. **`stamp.earned` 추가 발행 0건** (KPI 중복 카운트 방지)

### Scenario 3: 오답 — ox.failed 발행
- **Given**: 오답 제출
- **When**: FW-OX-001 의 오답 분기
- **Then**: EventLog 에 `ox.failed` 1건. payload 에 scroll_to_section 포함

### Scenario 4: PII 미포함 검증
- **Given**: 이벤트 발행
- **When**: payload 검사
- **Then**: email·password·comment 부재. 식별자만 포함

### Scenario 5: 발행 실패 시 silent fail
- **Given**: DB 일시적 오류로 EventLog INSERT 실패
- **When**: emitEvent 호출
- **Then**: 호출자 (FW-OX-001) 는 정상 응답. Sentry 알림 자동. 사용자 영향 0

### Scenario 6: 동시 100 req 시나리오 (TS-IT-010 와 정합)
- **Given**: 동일 입력 100 req 동시
- **When**: 1개 정상 INSERT + 99개 멱등 변환
- **Then**: EventLog — `stamp.earned` 1건 + `ox.duplicate_idempotent` 99건. KPI 집계 시 stamp 1건만 카운트

### Scenario 7: append-only 검증
- **Given**: EventLog 1건 존재
- **When**: 코드에서 `eventLog.update()` 또는 `delete()` 시도
- **Then**: 정적 분석 또는 코드 리뷰로 차단. main merge 거부

### Scenario 8: 이벤트 누락률 < 0.5% (REQ-FUNC-002 AC)
- **Given**: 1주일 운영
- **When**: KPI 집계 시 stamp INSERT 카운트 vs `stamp.earned` 이벤트 카운트 비교
- **Then**: 일치율 > 99.5%. 일치하지 않는 0.5% 미만은 silent fail 케이스 (Sentry 알림 후 운영 검증)

### Scenario 9: 인덱스 활용 (KPI 쿼리 성능)
- **Given**: EventLog 100K 건
- **When**: `prisma.eventLog.findMany({ where: { event: 'stamp.earned', createdAt: { gte: ... } } })`
- **Then**: p95 < 100ms (인덱스 활용)

### Scenario 10: payload JSON 직렬화
- **Given**: 다양한 타입의 payload (string, number, boolean, nested object)
- **When**: emitEvent 호출
- **Then**: JsonB 컬럼에 정상 저장. 직렬화 실패 0건

## :gear: Technical & Non-Functional Constraints
- **이벤트 카탈로그 단일 출처**: `EVENT_TYPES` 상수. 매직 스트링 사용 금지
- **dot notation 강제**: `domain.action` (예: `stamp.earned`, `auth.signup`). 대문자·언더스코어 금지
- **PII 보호**: payload 검증 (별도 lint 룰 또는 코드 리뷰). email·password·comment 등 자동 차단
- **append-only (INV-11)**:
  - UPDATE/DELETE 금지 — 정적 분석으로 차단
  - 단 admin 의 anonymize 는 별도 Server Action (GDPR 대응)
- **silent fail 정책**: emitEvent 실패가 메인 로직 영향 0. 본 호출은 try/catch 내부
- **누락률 모니터링 (REQ-FUNC-002 AC)**:
  - 주 1회 KPI 집계 시 stamp INSERT vs stamp.earned 이벤트 카운트 비교
  - 일치율 < 99.5% 시 Sentry 알림
- **인덱스 정책**: event·userId·createdAt 모두 인덱스. KPI 집계 핫스팟
- **발행 시점 정책**:
  - 트랜잭션 외부에서 호출 (트랜잭션 락 시간 단축)
  - 단 발행 실패가 비즈니스 로직 영향 0 이므로 트랜잭션 내부도 가능 (성능 트레이드오프)
- **batched emission**: 다중 이벤트 동시 발행 시 createMany 활용 권장
- **응답 시간 영향**: emitEvent 호출 추가로 인한 지연 ≤ 30ms (단순 INSERT)
- **금지**:
  - PII 를 payload 에 포함
  - 매직 스트링 이벤트명 사용 (카탈로그 import 강제)
  - EventLog UPDATE/DELETE (admin anonymize 외)
  - 발행 실패 시 메인 로직 throw (silent fail)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/events/catalog.ts` + `lib/events/emit.ts` 구현
- [ ] FW-OX-001·FW-OX-002 통합 (정상·멱등 분리 발행)
- [ ] PII 보호 정책 — payload 검증
- [ ] append-only 정적 분석 — UPDATE/DELETE 차단
- [ ] silent fail 동작 검증 (Sentry 알림 통합)
- [ ] TS-IT-010 (동시 100 req) 의 EventLog 분리 검증 통과
- [ ] 누락률 모니터링 KPI 쿼리 작성 (FR-KPI-* 와 정합)
- [ ] 인덱스 활용 — p95 < 100ms 측정
- [ ] PR 본문에 "REQ-FUNC-002 + §1.5.1.1 Option A 이전 트리거 측정 기반" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-009 (EventLog 모델 — 본 태스크와 별도 PR 또는 병행)
  - FW-OX-001 (정상 INSERT 호출자)
  - FW-OX-002 (멱등 변환 호출자)
  - NF-OBS-001 (Sentry — silent fail 알림)
- **Blocks**:
  - FR-KPI-001~009 (모든 KPI 집계 — 본 이벤트 데이터 활용)
  - TS-IT-010 (동시 100 req — 이벤트 분리 검증)
  - TS-UT-014 (EventLog append-only 검증)
  - §1.5.1.1 Option A 이전 트리거 모니터링 (UNIQUE 충돌율 측정)
- **Related**:
  - REQ-FUNC-002 (이벤트 누락 <0.5%) 충족
  - INV-11 (EventLog append-only)
