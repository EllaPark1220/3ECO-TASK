# [Feature] NF-RISK-005: Rollback 정책 — Vercel Instant Rollback + DB 마이그레이션 역방향 + 콘텐츠 복구

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] NF-RISK-005: Rollback 표준 절차 — Vercel Instant Rollback + Prisma 역방향 마이그레이션 + 콘텐츠 복구 + 5분 내 정상화 SOP"
labels: 'nf, risk, rollback, sop, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-RISK-005] 배포 직후 critical 장애 발견 시 Rollback 표준 절차 — (1) Vercel Instant Rollback (코드) + (2) Prisma 역방향 마이그레이션 (DB schema) + (3) 콘텐츠 복구 (last-good-state) + 5분 내 정상화 + admin Server Action
- **목적**: REQ-NF-009 (회복탄력성) + R8 (장애 대응) 의 핵심. CI 가 main 차단해도 main merge 후 production 배포 시점에 발견되는 장애 (성능·UX·5xx) 는 빠른 rollback 만이 해결책. 단일 제작자(CON-08) 가 5분 내 결정·실행 가능한 명확한 SOP.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.2` — REQ-NF-009 (회복탄력성)
  - `/docs/SRS_V0_9.md#6.6` — R8 (장애 대응)
- 외부:
  - https://vercel.com/docs/deployments/instant-rollback
  - https://www.prisma.io/docs/concepts/components/prisma-migrate
- 선행: IF-VC-001 (Vercel), IF-CRON-003 (pg-dump 백업), IF-CRON-004 (DR Restore), CT-DB-001 (Prisma)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Rollback 절차 — `docs/rollback-runbook.md`**:
  ```markdown
  # Rollback 표준 절차 (RTO 5분)

  ## 트리거 조건
  - 배포 직후 5xx > 5% (Sentry alert)
  - 핵심 페이지 응답 시간 > 10초
  - 사용자 로그인 100% 실패
  - 데이터 무결성 위반 (INV-04·08·09·12)

  ## 절차

  ### A. 코드만 (DB schema 변경 없음)
  1. Vercel Dashboard → Deployments → 이전 정상 배포 → Promote (1분)
  2. Health check (smoke test 5 페이지) — 정상 확인
  3. EventLog `rollback.code_only` 발행
  4. 사용자 공지 (선택, 5분 이상 영향 시)

  ### B. DB schema 변경 포함
  1. **신규 배포 차단** — Vercel 의 deployment freeze
  2. **Prisma 역방향 마이그레이션** — `npx prisma migrate resolve --rolled-back <migration_name>`
  3. **이전 배포 promote** (Vercel)
  4. **데이터 복구 (필요 시)** — IF-CRON-004 의 DR Restore 절차
  5. **검증** — E2E 5플로 (TS-E2E-001) 통과
  6. **EventLog `rollback.with_db` 발행**

  ### C. 콘텐츠 변경만 (Lesson 데이터)
  1. 이전 lesson 데이터 백업에서 SELECT
  2. 현재 데이터 UPDATE (이전 값으로)
  3. EventLog `rollback.content` 발행

  ## 5분 내 정상화 RTO
  - 코드 only: 1~2분 (Vercel Instant)
  - DB schema: 5분 (역방향 마이그레이션 + 검증)
  - 콘텐츠: 3분
  ```
- [ ] **Vercel Instant Rollback API 호출 자동화 — `lib/rollback/vercel.ts`**:
  ```ts
  // Vercel API 활용 — 가장 최근 정상 배포로 promote
  export async function rollbackVercel(reason: string): Promise<{ ok: boolean; deployment_id: string }> {
    const previousDeployment = await fetch('https://api.vercel.com/v6/deployments?limit=10', {
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
    }).then(r => r.json());

    // 가장 최근 정상 (READY) 이전 배포 찾기
    const target = previousDeployment.deployments
      .filter(d => d.state === 'READY')
      .sort((a, b) => b.created - a.created)[1];  // 현재 외 가장 최근

    if (!target) throw new Error('No previous deployment to rollback');

    const promoted = await fetch(`https://api.vercel.com/v9/projects/${process.env.VERCEL_PROJECT_ID}/promote/${target.uid}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
    });

    await prisma.eventLog.create({
      data: {
        event: 'rollback.code_only',
        payload: { deployment_id: target.uid, reason, executed_at: new Date().toISOString() },
      },
    });

    return { ok: true, deployment_id: target.uid };
  }
  ```
- [ ] **admin Server Action — `executeRollback()`**:
  ```ts
  'use server';
  // app/admin/rollback/actions.ts
  export async function executeRollback(input: {
    type: 'code_only' | 'with_db' | 'content_only';
    reason: string;
  }) {
    const user = await getCurrentUser();
    if (user?.role !== 'ADMIN') throw new Error('FORBIDDEN');

    if (input.type === 'code_only') {
      return await rollbackVercel(input.reason);
    } else if (input.type === 'with_db') {
      throw new Error('DB Rollback 은 수동 SOP 따라 실행. docs/rollback-runbook.md 참조.');
    } else {
      // 콘텐츠 rollback 은 별도 절차
      throw new Error('Content Rollback 은 lesson 별 admin 페이지에서.');
    }
  }
  ```
- [ ] **/admin/rollback 페이지** — 비상시 1클릭:
  - 최근 배포 5개 표시 (Vercel API 활용)
  - 각 배포에 "Promote (Rollback)" 버튼 + 확인 모달
  - 마지막 배포의 health check 결과 (Smoke test) 표시
- [ ] **사용자 공지 자동 — 5분 이상 영향 시**:
  - rollback 실행 시 랜딩 페이지에 배너 자동 노출 (10분 내 자동 제거)
  - 본문: "일시적 시스템 점검 중입니다. 곧 정상화됩니다."
- [ ] **EventLog 발행 (감사 트레일)**:
  - `rollback.code_only` (Vercel Instant)
  - `rollback.with_db` (DB schema 복원)
  - `rollback.content` (Lesson 데이터 복원)
  - payload — reason, target_deployment_id, executed_by, duration_seconds
- [ ] **Prisma 역방향 마이그레이션 정책**:
  - 모든 마이그레이션은 **idempotent + reversible** 작성
  - 컬럼 ADD 는 가역. DROP 은 비가역 (데이터 손실 위험) → DROP 마이그레이션 별도 SOP
  - 본 정책은 Prisma 의 `down` 마이그레이션 작성 의무
- [ ] **Rollback drill — 분기 1회**:
  - DR drill (IF-CRON-004) 과 함께 분기 1회 시뮬레이션
  - staging 환경에서 rollback 절차 직접 실행
  - 5분 RTO 충족 검증
  - drill 결과 — `docs/rollback-drill-history.md`
- [ ] **응답 시간**:
  - executeRollback (code_only) — Vercel API 호출 ≤ 30초
  - 전체 RTO — code_only 2분, with_db 5분
- [ ] **PII 부재**: rollback 메타만

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 코드 only Rollback — Vercel Instant
- **Given**: ADMIN + 정상 이전 배포 존재
- **When**: executeRollback({ type: 'code_only', reason: '5xx 5%' })
- **Then**: Vercel API promote 성공 + EventLog `rollback.code_only`

### Scenario 2: 이전 배포 부재 — graceful
- **Given**: 첫 배포 또는 이전 모두 fail
- **When**: 호출
- **Then**: throw 'No previous deployment'

### Scenario 3: with_db rollback — 수동 SOP 안내
- **Given**: type 'with_db'
- **When**: 호출
- **Then**: throw with SOP 안내

### Scenario 4: non-ADMIN — 403
- **Given**: LEARNER
- **When**: 호출
- **Then**: 403

### Scenario 5: EventLog 발행 정합
- **Given**: rollback 후
- **When**: 조회
- **Then**: payload 에 reason, deployment_id, executed_by

### Scenario 6: 사용자 공지 배너 자동
- **Given**: rollback 실행
- **When**: 랜딩 접속
- **Then**: 배너 노출 + 10분 후 자동 제거

### Scenario 7: 분기 drill — 5분 RTO 충족
- **Given**: 분기 첫 토요일
- **When**: staging 시뮬레이션
- **Then**: 전체 절차 ≤ 5분

### Scenario 8: drill 결과 기록
- **Given**: drill 종료
- **When**: docs/rollback-drill-history.md
- **Then**: 일자 + 시간 + 발견 이슈

### Scenario 9: 응답 시간 — Vercel API ≤ 30초
- **Given**: executeRollback
- **When**: 측정
- **Then**: ≤ 30초

### Scenario 10: SOP 문서 충실성
- **Given**: docs/rollback-runbook.md
- **When**: 검토
- **Then**: A·B·C 3 시나리오 + RTO + 트리거 조건 명시

## :gear: Technical & Non-Functional Constraints
- **5분 RTO 강제**: code_only 2분, with_db 5분
- **Vercel Instant Rollback 활용**: 1클릭 promote
- **Prisma 마이그레이션 — idempotent + reversible 필수**: DROP 별도 SOP
- **분기 drill 의무**: DR drill 과 함께
- **사용자 공지 배너 자동**: 5분 이상 영향 시
- **EventLog 감사 트레일**: 3 type 모두
- **SOP 명확성 — A·B·C 3 시나리오 분리**
- **DB rollback 수동 — 자동화 위험**: 데이터 손실 위험 방지
- **금지**:
  - DB schema 변경 자동 rollback (데이터 손실 위험)
  - SOP 없이 production rollback
  - drill 미실행 (실전 시 실패 위험)
  - Vercel Token 클라이언트 노출

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] docs/rollback-runbook.md 3 시나리오
- [ ] rollbackVercel() 함수
- [ ] executeRollback() Server Action
- [ ] /admin/rollback 페이지
- [ ] 사용자 공지 배너 자동
- [ ] EventLog 3 type
- [ ] 분기 drill 캘린더 등록
- [ ] docs/rollback-drill-history.md
- [ ] PR 본문에 "REQ-NF-009 + 5분 RTO 운영 SOP" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-VC-001 (Vercel)
  - IF-CRON-003 (pg-dump)
  - IF-CRON-004 (DR Restore)
  - CT-DB-009 (EventLog)
  - FR-AUTH-002 (RBAC)
- **Blocks**:
  - REQ-NF-009 회복탄력성
  - 단일 제작자 비상 대응
- **Related**:
  - NF-RISK-003 (burnout — 위급 대응 부담)
  - NF-RISK-004 (외부 의존성 monitoring)
  - DR drill (분기 1회)
