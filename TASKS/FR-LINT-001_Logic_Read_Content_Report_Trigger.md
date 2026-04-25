# [Feature] FR-LINT-001: 사용자 "과장됨" 리포트 5% 초과 시 게시 중단 트리거 + 운영자 알림

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-LINT-001: 콘텐츠별 \"과장됨\" 리포트 5% 초과 시 자동 게시 중단 + Resend 운영자 알림 + ADMIN 검토 큐"
labels: 'feature, lint, content-moderation, ci, priority:high, mvp-soft, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-LINT-001] 사용자가 콘텐츠 (lesson) 에 대해 "과장됨" 리포트 제출 → 동일 lesson 의 리포트 비율이 활성 사용자 대비 5% 초과 시 자동 게시 중단 (`isPublished=false`) + Resend 운영자 알림 + ADMIN 검토 큐 진입
- **목적**: 사후 사용자 피드백 기반 콘텐츠 보정 메커니즘. Hooking Linter (FW-LINT-001~004) 가 사전 검증이라면, 본 태스크는 **사후 검증** — 사용자가 실제 학습 후 "과장됨" 인지 시그널 자동 수집. PRD 원칙 1 (이해 우선) + CON-05 (후킹 금지) 의 운영 단계 보강.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.2` — REQ-FUNC-007 (Hooking Linter)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-029 (콘텐츠 품질 지표)
  - `/docs/SRS_V0_9.md#6.2.2` — EVENT_LOG (`content.report_exaggerated`)
- 선행: CT-DB-003 (Lesson — isPublished 컬럼 추가), CT-DB-009 (EventLog), FR-AUTH-002 (RBAC), IF-RES-001 (Resend), FW-LINT-001 (사전 검증)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **CT-DB-003 (Lesson) 의 후속 마이그레이션 — `isPublished` 컬럼 추가**:
  ```prisma
  model Lesson {
    // ... 기존 필드
    isPublished      Boolean   @default(true)
    unpublishedAt    DateTime?
    unpublishedReason String?  @db.Text
  }
  ```
  - 본 태스크 PR 에 마이그레이션 통합
- [ ] **사용자 리포트 Server Action — `reportContentExaggerated()`**:
  ```ts
  'use server';
  // app/lesson/[id]/actions.ts
  export async function reportContentExaggerated(input: {
    lesson_id: string;
    reason?: string;  // optional 자유 텍스트 (max 500자)
  }) {
    const requestId = crypto.randomUUID();
    const user = await getCurrentUser();
    if (!user) throw new ReportError('UNAUTHORIZED', requestId);

    // Rate Limit (분당 5 req per user — 악의적 대량 리포트 방지)
    await enforceRateLimit(`report:${user.id}`, 'report');

    // 동일 user + lesson 중복 리포트 방지 (EventLog 기반)
    const existing = await prisma.eventLog.findFirst({
      where: {
        userId: user.id,
        event: 'content.report_exaggerated',
        payload: { path: ['lesson_id'], equals: input.lesson_id },
      },
    });
    if (existing) {
      throw new ReportError('ALREADY_REPORTED', requestId);
    }

    // EventLog 발행
    await emitEvent({
      userId: user.id,
      event: 'content.report_exaggerated',
      payload: {
        lesson_id: input.lesson_id,
        reason: input.reason ?? null,  // 자유 텍스트 (max 500자, Zod 검증)
      },
    });

    // 트리거 검사 (별도 비동기 — 응답 영향 0)
    checkReportThreshold(input.lesson_id).catch(console.error);

    return { ok: true };
  }
  ```
- [ ] **트리거 함수 — `checkReportThreshold(lessonId)`**:
  ```ts
  // lib/services/content-moderation.ts
  export async function checkReportThreshold(lessonId: string): Promise<void> {
    // 1. 지난 30일 동안 lesson 학습한 distinct user (분모)
    const activeLearners = await prisma.eventLog.findMany({
      where: {
        event: { in: ['lesson.viewed', 'ox.submitted'] },
        payload: { path: ['lesson_id'], equals: lessonId },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        userId: { not: null },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    const activeCount = activeLearners.length;

    // 2. 동일 lesson 의 "과장됨" 리포트 distinct user (분자)
    const reports = await prisma.eventLog.findMany({
      where: {
        event: 'content.report_exaggerated',
        payload: { path: ['lesson_id'], equals: lessonId },
        userId: { not: null },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    const reportCount = reports.length;

    // 3. 임계 검사 — 5% 초과 + 최소 활성 사용자 20명 이상 (소표본 false positive 방지)
    if (activeCount < 20) return;  // 소표본 — 트리거 안함

    const reportRate = reportCount / activeCount;
    if (reportRate <= 0.05) return;  // 5% 이하 — 정상

    // 4. 게시 중단 (멱등 — 이미 unpublished 면 skip)
    const lesson = await prisma.lesson.findUnique({ where: { lessonId } });
    if (!lesson || !lesson.isPublished) return;

    await prisma.lesson.update({
      where: { lessonId },
      data: {
        isPublished: false,
        unpublishedAt: new Date(),
        unpublishedReason: `사용자 "과장됨" 리포트 ${(reportRate * 100).toFixed(1)}% (${reportCount}/${activeCount}, 임계 5%)`,
      },
    });

    // 5. EventLog 발행 (감사)
    await emitEvent({
      event: 'content.unpublished_auto',
      payload: { lesson_id: lessonId, report_rate: reportRate, report_count: reportCount, active_count: activeCount },
    });

    // 6. Resend 운영자 알림 (silent fail)
    try {
      const html = await render(ContentUnpublishedAlertEmail({ lessonId, reportRate, reportCount, activeCount }));
      await resend.emails.send({
        from: 'no-reply@economic-judgment.app',
        to: process.env.OPERATOR_EMAIL!,  // Ella 메일
        subject: `[자동] 콘텐츠 게시 중단 — ${lessonId}`,
        html,
      });
    } catch (e) {
      console.error('Operator alert failed:', e);
    }
  }
  ```
- [ ] **운영자 알림 메일 템플릿** — `lib/email/templates/contentUnpublishedAlert.tsx`:
  - 한국어 + 차분한 톤
  - 본문 — lesson_id + 리포트율 + 분자/분모 + 검토 페이지 링크
  - 후킹 표현 0
- [ ] **ADMIN 검토 페이지 (별도 후속, 본 태스크는 메일 알림까지)**:
  - `/admin/content-moderation` — 자동 unpublished lesson 목록
  - 운영자가 검토 후 (1) 콘텐츠 수정 → 재게시, (2) 영구 삭제, (3) 거짓 신고 판정 → 재게시 + 신고자 패널티
- [ ] **소표본 보호 — 활성 사용자 20명 미만 시 트리거 안함**:
  - false positive 방지 (Alpha 단계의 작은 집단에서 1~2명 신고로 차단되는 것 방지)
  - 임계는 환경변수로 조정 가능 (`MIN_ACTIVE_LEARNERS=20`)
- [ ] **임계 수치 환경변수화 — `REPORT_THRESHOLD_PCT=5`**:
  - Stage 1 운영 데이터 누적 후 재조정 가능
  - 변경 시 전체 코드 영향 0 (constants 분리)
- [ ] **재게시 절차 (운영자 SOP)**:
  - 별도 admin Server Action — `republishLesson(lessonId, adminNote)`
  - RBAC ADMIN 가드
  - EventLog `content.republished` 발행
  - 본 태스크는 자동 unpublish 만, 재게시는 별도 후속
- [ ] **악의적 대량 리포트 방지**:
  - Rate Limit 분당 5 req per user
  - distinct user 카운트로 소수 악의적 사용자 영향 제한
  - 동일 user + lesson 중복 리포트 차단

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 리포트 제출
- **Given**: 로그인 사용자 + lesson L001 학습 완료
- **When**: `reportContentExaggerated({ lesson_id: 'L001' })`
- **Then**: 200 + EventLog `content.report_exaggerated` 1건 INSERT

### Scenario 2: 임계 5% 초과 → 자동 unpublish
- **Given**: lesson L001 활성 학습자 100명 + "과장됨" 리포트 6명
- **When**: 6번째 리포트 직후 trigger 실행
- **Then**: Lesson.isPublished=false + unpublishedAt 설정 + Resend 메일 발송

### Scenario 3: 임계 5% 이하 — 정상 유지
- **Given**: 활성 학습자 100명 + 리포트 4명
- **When**: 트리거
- **Then**: Lesson.isPublished 변경 0. 알림 0

### Scenario 4: 소표본 보호 — 활성 20명 미만
- **Given**: 활성 학습자 15명 + 리포트 3명 (20%)
- **When**: 트리거
- **Then**: 트리거 안함 (소표본 보호). isPublished 유지

### Scenario 5: 동일 user 중복 리포트 — 거부
- **Given**: 사용자 A 가 L001 에 1차 리포트 후
- **When**: 동일 lesson 재리포트 시도
- **Then**: `ALREADY_REPORTED` 응답. EventLog 추가 0

### Scenario 6: 미인증 — 401
- **Given**: 세션 없음
- **When**: 호출
- **Then**: 401 + `UNAUTHORIZED`

### Scenario 7: Rate Limit — 분당 5 req
- **Given**: 동일 user 분당 5 req
- **When**: 6번째 호출
- **Then**: 429

### Scenario 8: 멱등 — 이미 unpublished 시 재트리거 안함
- **Given**: L001 이미 isPublished=false
- **When**: 추가 리포트 + 트리거
- **Then**: 메일 재발송 0. unpublishedAt 변경 0

### Scenario 9: 운영자 메일 — 본문 정합
- **Given**: 자동 unpublish 발생
- **When**: 메일 수신
- **Then**: 한국어 + 차분한 톤 + lesson_id, 리포트율, 분자/분모, 검토 링크 포함

### Scenario 10: EventLog 감사 트레일
- **Given**: 자동 unpublish
- **When**: EventLog 조회
- **Then**: `content.unpublished_auto` 1건 + payload 에 report_rate·active_count·report_count 포함

## :gear: Technical & Non-Functional Constraints
- **사전 vs 사후 검증 분리**: FW-LINT-001~004 (사전) + 본 태스크 (사후)
- **소표본 보호 — 활성 20명 이상**: false positive 방지
- **임계 환경변수화**: REPORT_THRESHOLD_PCT, MIN_ACTIVE_LEARNERS
- **distinct user 카운트**: 동일 user 다중 리포트 영향 0
- **멱등 정책**: 이미 unpublished 면 skip
- **운영자 알림 silent fail**: 메일 실패가 unpublish 영향 0
- **재게시 별도 SOP**: 본 태스크는 자동 unpublish 만
- **Rate Limit**: 악의적 대량 리포트 방지
- **응답 시간**: 트리거 비동기. Server Action 응답 ≤ 200ms
- **PII 보호**: EventLog payload 에 lesson_id + 자유 텍스트만 (사용자 식별자는 userId 컬럼)
- **금지**:
  - 임계 하드코딩 (운영 조정 어려움)
  - 동일 user 다중 카운트 (왜곡)
  - 소표본에서 트리거 (false positive)
  - 재게시 자동화 (운영자 검토 의무)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] CT-DB-003 마이그레이션 (isPublished, unpublishedAt, unpublishedReason)
- [ ] reportContentExaggerated() Server Action
- [ ] checkReportThreshold() 트리거 함수
- [ ] 운영자 알림 메일 템플릿
- [ ] 소표본 보호 + 임계 환경변수화
- [ ] 멱등 + Rate Limit
- [ ] EventLog 감사 트레일
- [ ] PR 본문에 "사후 콘텐츠 검증. 사전 Linter 의 보강" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-003 (Lesson — isPublished 컬럼 추가)
  - CT-DB-009 (EventLog)
  - FR-AUTH-001 (getCurrentUser)
  - CT-API-001 (Rate Limit)
  - IF-RES-001 (Resend 알림)
  - FW-LINT-001~004 (사전 검증 — 본 태스크와 보강)
- **Blocks**:
  - 운영자 검토 페이지 (`/admin/content-moderation` — 별도 후속)
  - 재게시 SOP (별도 후속)
  - REQ-NF-029 (콘텐츠 품질 지표) 보강
- **Related**:
  - 운영자 SOP — 검토 절차 + 거짓 신고 패널티
