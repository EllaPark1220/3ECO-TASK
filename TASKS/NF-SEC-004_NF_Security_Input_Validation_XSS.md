# [NF] NF-SEC-004: 감사 로그 90일 보관 (EventLog 확장 및 방어)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-SEC-004: 보안 인프라 — 관리자 행위 및 중요 정책 변경 감사 로그 90일 보관 및 변조 차단 (EventLog)"
labels: 'nf, security, audit-log, database, priority:high, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-SEC-004] 중요 행위 감사 로그 90일 보관 및 삭제 방어
- **목적**: REQ-NF-022 (감사 로그 90일). 단순 시스템 로그를 넘어, '관리자 접속', '콘텐츠(Lesson) 내용 개정', '라이선스 문구 변경', '시스템 설정 변경'과 같은 크리티컬 비즈니스 이벤트는 `EventLog` 테이블에 90일간 강제 보관되며, 어떠한 API도 이 데이터를 수정/삭제할 수 없도록 (Append-Only) DB 레이어에서 방어해야 합니다.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-022 (감사 로그 90일 유지)
- 선행: NF-OBS-007 (Vercel 로그 14일 / EventLog 30일 기본 정책)
- 관련: CT-DB-009 (EventLog 모델 및 인덱스)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **중요 이벤트 카테고리 (Severity/Type) 정의**:
  - `EventLog` 모델 상에 `isAudit: boolean` 필드를 추가하거나, 이벤트명을 `audit.` Prefix로 통일.
  - 대상 이벤트: `audit.admin_login`, `audit.lesson_revised`, `audit.license_changed`, `audit.user_role_changed`.
- [ ] **로그 발행 유틸리티 강제화**:
  - 관리자 전용 Server Action 들에서 로직 성공 시 무조건 `logAuditAction()` 헬퍼를 호출하도록 코드 구조화.
  ```ts
  // lib/security/audit.ts
  export async function logAuditAction(userId: string, action: string, details: any) {
    return prisma.eventLog.create({
      data: {
        userId,
        eventName: `audit.${action}`,
        payload: details,
        isAudit: true, // 감사 로그 플래그
      }
    });
  }
  ```
- [ ] **Supabase RLS 및 DB Trigger 삭제 방어 (Append-Only)**:
  - Application 레이어 버그로 인해 삭제되는 것을 막기 위해, PostgreSQL RLS를 통해 `EventLog` 테이블에 대한 `UPDATE`, `DELETE` 권한을 `service_role`을 포함하여 전면 박탈하거나, Trigger를 걸어 방어.
  ```sql
  -- DB 마이그레이션 스크립트: EventLog 삭제 금지 트리거
  CREATE OR REPLACE FUNCTION prevent_eventlog_delete_update()
  RETURNS trigger AS $$
  BEGIN
    RAISE EXCEPTION 'EventLog is append-only. Modification or deletion is strictly prohibited.';
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER trg_prevent_eventlog_modification
  BEFORE UPDATE OR DELETE ON "EventLog"
  FOR EACH ROW EXECUTE FUNCTION prevent_eventlog_delete_update();
  ```
- [ ] **90일 보존 생명주기(Retention) 문서화 및 관리자 대시보드 뷰**:
  - Supabase Pro로 전환 후 제공되는 백업 기능을 명시하고, 90일이 지난 일반 로그는 지우더라도 `isAudit = true` 인 로그는 지우지 않는 별도의 정기 삭제 Cron 로직 검증.
  - Admin 페이지에 감사 로그만 전용으로 열람할 수 있는 읽기 전용 대시보드 컴포넌트 개발.

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 중요 작업 후 Audit Log 적재 확인
- **Given**: 관리자 권한을 가진 사용자
- **When**: `L001` 레슨의 스크립트 텍스트를 수정하고 저장(Update)함
- **Then**: DB `EventLog` 테이블에 `eventName: audit.lesson_revised` 로그가 `L001` 식별자와 변경 내역(diff payload)을 포함하여 1건 생성됨

### Scenario 2: Audit Log 수정 시도 차단 (DB 레벨)
- **Given**: 악의적이거나 버그가 있는 백엔드 코드
- **When**: `EventLog` 테이블의 특정 행에 대해 Prisma `update()` 메서드 호출
- **Then**: 데이터베이스 Trigger에 의해 예외가 발생하며 수정이 완벽히 차단됨

### Scenario 3: Audit Log 삭제 시도 차단 (DB 레벨)
- **Given**: 데이터베이스 직접 접근 권한을 가진 연결 (또는 Prisma API)
- **When**: `EventLog` 테이블에 대해 `delete()` 또는 `deleteMany()` 쿼리 실행
- **Then**: "EventLog is append-only" 예외가 발생하며 레코드가 전혀 삭제되지 않음

### Scenario 4: 일반 이벤트와 감사 이벤트의 구분
- **Given**: `EventLog` 테이블
- **When**: `eventName: ox.submitted` (일반) 와 `eventName: audit.admin_login` (감사) 적재
- **Then**: 감사 로그 필터링 쿼리 (`where: { isAudit: true }` 혹은 `startsWith: 'audit.'`)를 통해 명확히 분리하여 조회 가능함

### Scenario 5: Admin 전용 대시보드 열람
- **Given**: 일반 사용자 계정
- **When**: Admin 감사 로그 API 엔드포인트 `/api/admin/audit-logs` 호출
- **Then**: `403 Forbidden` 상태 코드가 반환되며, 내부 로그가 전혀 노출되지 않음

### Scenario 6: 90일 Retention 기간 도래 시 처리
- **Given**: 시스템 관리용 Clean-up Cron Job
- **When**: 100일이 지난 데이터 삭제 스크립트 구동
- **Then**: 요구사항에 따라 90일이 지난 일반 로그는 삭제되지만, 법적 분쟁 소지가 있는 Audit Log의 경우 삭제를 스킵하거나 콜드 스토리지(S3 등)로 이관 후 삭제됨 (현 정책상 `deleteMany({ where: { isAudit: false, createdAt: < 90days } })` 만 수행)

### Scenario 7: 로그인 이벤트 감시
- **Given**: 관리자 역할(`ROLE=ADMIN`) 계정
- **When**: 성공적으로 시스템에 로그인함
- **Then**: 세션 발급과 동시에 즉시 `audit.admin_login` 이벤트가 IP 주소와 함께 로그로 남음

### Scenario 8: 권한 상승 이벤트 감시
- **Given**: 누군가가 특정 사용자의 Role을 `LEARNER`에서 `TEACHER` 로 변경함
- **When**: 변경 API 처리 완료 시점
- **Then**: `audit.user_role_changed` 이벤트 로그가 누가, 누구의 권한을 변경했는지 기록함

### Scenario 9: 페이로드(Payload) 길이 초과 에러 방지
- **Given**: 레슨 스크립트 수정 길이가 수 만자에 달함
- **When**: Audit Log로 Diff Payload를 저장하려 함
- **Then**: DB 컬럼(JSONB) 용량을 초과하지 않도록 텍스트가 너무 긴 경우 요약(Summary) 또는 Truncate 처리하여 안정적으로 로깅을 완료함

### Scenario 10: PostgreSQL Trigger 정상 등록 검증
- **Given**: DB 초기 마이그레이션 단계
- **When**: `npx prisma migrate deploy` 실행
- **Then**: 트리거 생성 SQL 구문이 에러 없이 DB 인스턴스에 정상 반영됨을 스키마에서 확인

## :gear: Technical & Non-Functional Constraints
- **Database Trigger**: Prisma 수준의 래핑이 아니라, 순수 PostgreSQL 레이어에 Trigger를 걸어, Supabase 대시보드 내장 SQL 툴에서 수동으로 쿼리를 날려도 삭제를 막는 강력한 락 다운(Lock-down) 적용.
- **Data Volume**: 감사 로그는 일반 학습 이벤트(OX 제출 등)에 비해 발생 빈도가 낮으므로 용량 문제는 적으나, JSONB 필드 내에 과도한 데이터를 담지 않도록 통제.

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 점검 및 단위 테스트(삭제 방어 테스트) 구현
- [ ] Prisma 마이그레이션 파일(`prevent_eventlog_delete.sql`) 생성 및 배포
- [ ] `lib/security/audit.ts` 공통 헬퍼 생성
- [ ] 관리자 기능 내 헬퍼 호출 로직 전면 주입
- [ ] PR 본문에 "REQ-NF-022 감사 로그 90일 강제화 (Append-Only)" 명시

## :construction: Dependencies & Blockers
- **Depends on**: CT-DB-009 (EventLog 초기 구성)
- **Blocks**: Closed Beta 배포 (관리자 기능 오픈 전에 반드시 락이 걸려있어야 함)
