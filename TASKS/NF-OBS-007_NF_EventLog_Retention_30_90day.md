# [NF] NF-OBS-007: event_log 보관 정책 — MVP 30일 → Pro 전환 시 90일

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-OBS-007: event_log 보관 정책 — MVP 30일 + Pro 전환 시 90일 자동 연장 + 감사 로그 분리"
labels: 'nf, observability, retention, event-log, priority:medium, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-OBS-007] event_log 보관 정책 — 30일/90일 자동 관리
- **목적**: REQ-NF-031 (이벤트 로그 보관 정책) 충족. CT-DB-009 의 EventLog 테이블에 보관 기한을 적용하여 디스크 사용량을 제어하면서 감사·분석 목적의 데이터를 충분히 보존. MVP(Free) = 30일, Pro 전환 시 = 90일 (REQ-NF-022 감사 로그 연장).

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.2` — REQ-NF-031 (이벤트 보관), REQ-NF-022 (감사 90일)
- 선행: CT-DB-009 (EventLog 모델), IF-SUP-002 (Pro 전환)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **보관 정책 상수 정의** — `lib/config/retention.ts`:
  ```ts
  export const RETENTION_DAYS = {
    event_log: parseInt(process.env.EVENT_LOG_RETENTION_DAYS || '30'),
    audit_log: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90'),
    server_log: 14, // NF-OBS-006
  };
  ```
- [ ] **이벤트 분류** — 일반 vs 감사:
  ```ts
  const AUDIT_EVENTS = [
    'admin.role_changed',
    'admin.content_updated',
    'admin.lesson_published',
    'admin.license_changed',
    'admin.user_deleted',
  ];

  function isAuditEvent(eventName: string): boolean {
    return AUDIT_EVENTS.includes(eventName);
  }
  ```
- [ ] **Cron 자동 정리** — `app/api/cron/eventlog-cleanup/route.ts`:
  ```ts
  export async function GET() {
    const generalCutoff = new Date(Date.now() - RETENTION_DAYS.event_log * 86400_000);
    const auditCutoff = new Date(Date.now() - RETENTION_DAYS.audit_log * 86400_000);

    // 일반 이벤트 — 30일 정리
    const generalDeleted = await prisma.eventLog.deleteMany({
      where: {
        timestamp: { lt: generalCutoff },
        eventName: { notIn: AUDIT_EVENTS },
      },
    });

    // 감사 이벤트 — 90일 정리
    const auditDeleted = await prisma.eventLog.deleteMany({
      where: {
        timestamp: { lt: auditCutoff },
        eventName: { in: AUDIT_EVENTS },
      },
    });

    return Response.json({
      general: { deleted: generalDeleted.count, cutoff: generalCutoff },
      audit: { deleted: auditDeleted.count, cutoff: auditCutoff },
    });
  }
  ```
- [ ] **Pro 전환 시 자동 연장** — 환경 변수 변경:
  ```env
  # Free (기본)
  EVENT_LOG_RETENTION_DAYS=30
  # Pro 전환 시
  EVENT_LOG_RETENTION_DAYS=90
  ```
- [ ] **디스크 사용량 모니터링**:
  ```sql
  SELECT pg_total_relation_size('event_logs') AS bytes,
         pg_size_pretty(pg_total_relation_size('event_logs')) AS human;
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 일반 이벤트 30일 정리
- **Given**: 31일 전 `lesson.viewed` 이벤트
- **When**: Cron 실행
- **Then**: 삭제됨

### Scenario 2: 감사 이벤트 90일 보존
- **Given**: 60일 전 `admin.content_updated` 이벤트
- **When**: Cron 실행
- **Then**: 보존 (90일 미만)

### Scenario 3: 감사 이벤트 91일 정리
- **Given**: 91일 전 감사 이벤트
- **When**: Cron 실행
- **Then**: 삭제됨

### Scenario 4: Pro 전환 — 일반 90일 보존
- **Given**: `EVENT_LOG_RETENTION_DAYS=90`
- **When**: 60일 전 일반 이벤트 + Cron
- **Then**: 보존 (90일 미만)

### Scenario 5: Cron 결과 로그
- **Given**: Cron 실행 완료
- **When**: 응답 확인
- **Then**: `{ general: { deleted: N }, audit: { deleted: M } }` 출력

### Scenario 6: 디스크 사용량 < 500MB
- **Given**: 30일 보관 후
- **When**: 테이블 크기 확인
- **Then**: < 500MB (Supabase Free 500MB 한도)

## :gear: Technical & Non-Functional Constraints
- **Free 한도**: Supabase Free DB 500MB. 30일 정리로 사용량 관리
- **감사 이벤트**: 관리자 행위 로그는 90일 고정 (Free 에서도)
- **Pro 전환**: 환경 변수만 변경 → 코드 수정 불필요
- **Cron 주기**: 일 1회 (야간)
- **금지**: 감사 이벤트 수동 삭제, 보관 기한 미적용

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 시나리오 통과
- [ ] 보관 정책 상수 + Cron 구현
- [ ] 일반/감사 이벤트 분류 로직
- [ ] Pro 전환 시 환경 변수 전환 검증
- [ ] PR 본문에 "REQ-NF-031 보관 30일/90일. REQ-NF-022 감사 90일" 명시

## :construction: Dependencies & Blockers
- **Depends on**: CT-DB-009 (EventLog), IF-SUP-002 (Pro 전환 트리거)
- **Blocks**: NF-SEC-004 (감사 로그 90일 보관)
- **Related**: REQ-NF-031, REQ-NF-022
