# [Feature] NF-RISK-003: 단일 제작자 burnout 위험 — 운영 부담 모니터링 + 자동 알림 + 비상 SOP

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] NF-RISK-003: 단일 제작자 burnout 위험 대응 — 주간 운영 시간 추적 + 임계 알림 + 콘텐츠 발행 일시중단 SOP"
labels: 'nf, risk, burnout, sop, priority:high, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-RISK-003] CON-08 (단일 제작자) 의 핵심 위험 — burnout 대응. 주간 운영 시간 (콘텐츠 제작·이슈 대응·운영자 SOP 수행) 추적 + 임계 (주 50시간) 도달 시 자동 알림 + 콘텐츠 발행 일시중단 SOP + 사용자 공지 템플릿
- **목적**: 본 사이트의 가장 큰 단일 실패 지점은 제작자 자신. 외부 의존성 (R7) 보다 운영자 burnout 이 더 큰 risk. 정량 측정 + 자동 알림 + 명확한 SOP 로 휴식 결정을 자동화 — 직관 또는 휴리스틱이 아닌 데이터 기반.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.2` — CON-08 (단일 제작자)
  - `/docs/SRS_V0_9.md#6.6` — Risk Register
- 페르소나: 본 사이트 제작자 (Ella) 자신
- 선행: CT-DB-009 (EventLog), FR-AUTH-002 (RBAC ADMIN)
- 짝: NF-RISK-005 (Rollback), IF-CRON-004 (DR — 운영 부담 사촌)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **운영 시간 추적 정책 — admin Server Action 으로 기록**:
  - 운영자가 매일 운영 시간 입력 (자가 보고)
  - 또는 GitHub commit 시간 + Notion·Linear API 의 작업 시간 자동 추정
  - 본 태스크는 **자가 보고 우선** (가장 정확) — admin 페이지에서 매일 입력
- [ ] **OperatorActivityLog 모델 — 신규**:
  ```prisma
  model OperatorActivityLog {
    id           String   @id @default(uuid())
    userId       String   // ADMIN 본인
    user         User     @relation(fields: [userId], references: [id])
    date         DateTime @db.Date
    hoursWorked  Float    // 0~24
    category     String   // 'content' | 'ops' | 'support' | 'feature' | 'bugfix'
    notes        String?  @db.Text
    createdAt    DateTime @default(now())

    @@unique([userId, date, category])
    @@index([date])
  }
  ```
- [ ] **자가 보고 admin Server Action**:
  ```ts
  'use server';
  // app/admin/burnout/actions.ts
  export async function logOperatorActivity(input: {
    date: string;  // YYYY-MM-DD
    hours_worked: number;
    category: 'content' | 'ops' | 'support' | 'feature' | 'bugfix';
    notes?: string;
  }) {
    const user = await getCurrentUser();
    if (user?.role !== 'ADMIN') throw new Error('FORBIDDEN');

    if (input.hours_worked < 0 || input.hours_worked > 24) {
      throw new Error('INVALID_HOURS');
    }

    await prisma.operatorActivityLog.upsert({
      where: { userId_date_category: { userId: user.id, date: new Date(input.date), category: input.category } },
      create: { userId: user.id, date: new Date(input.date), ...input },
      update: { hoursWorked: input.hours_worked, notes: input.notes },
    });
  }
  ```
- [ ] **주간 집계 + 임계 검사 — `/api/admin/burnout-status` Route Handler**:
  ```ts
  export async function GET(req: Request) {
    if (await requireRole('ADMIN', req) === false) {
      return new Response('Forbidden', { status: 403 });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recent = await prisma.operatorActivityLog.findMany({
      where: { date: { gte: sevenDaysAgo } },
      orderBy: { date: 'asc' },
    });

    const totalHours = recent.reduce((sum, log) => sum + log.hoursWorked, 0);
    const dailyAvg = totalHours / 7;
    const byCategory = recent.reduce((acc, log) => {
      acc[log.category] = (acc[log.category] || 0) + log.hoursWorked;
      return acc;
    }, {} as Record<string, number>);

    const threshold_warning = totalHours >= 50;   // 주 50시간 — 경고
    const threshold_critical = totalHours >= 60;  // 주 60시간 — critical (즉시 휴식 권장)

    return NextResponse.json({
      ok: true,
      week_total_hours: totalHours,
      daily_avg: dailyAvg,
      by_category: byCategory,
      threshold_warning,
      threshold_critical,
      recommendation: getRecommendation(totalHours),
    });
  }

  function getRecommendation(hours: number): string {
    if (hours >= 60) return '🚨 critical — 즉시 콘텐츠 발행 일시중단. 1주 휴식 권장.';
    if (hours >= 50) return '⚠️ 경고 — 다음 주 운영 부담 줄이기. 비필수 작업 연기.';
    if (hours >= 40) return '정상 범위. 균형 유지.';
    return '여유 — 콘텐츠 작업 추가 가능.';
  }
  ```
- [ ] **자동 알림 cron — 매주 일요일 09:00 KST**:
  ```ts
  // app/api/cron/burnout-check/route.ts
  export async function POST(req: Request) {
    if (!verifyCronAuth(req)) return new Response('Unauthorized', { status: 401 });

    const result = await getBurnoutStatus();

    if (result.threshold_critical) {
      await resend.emails.send({
        from: 'no-reply@economic-judgment.app',
        to: process.env.OPERATOR_EMAIL!,
        subject: '🚨 [Burnout Critical] 주 60시간 도달 — 즉시 휴식 권장',
        html: render(BurnoutCriticalEmail({ hours: result.week_total_hours, byCategory: result.by_category })),
      });

      // EventLog
      await prisma.eventLog.create({
        data: { event: 'burnout.critical', payload: result },
      });
    } else if (result.threshold_warning) {
      // 경고 이메일 (덜 강한 톤)
      await resend.emails.send({
        from: 'no-reply@economic-judgment.app',
        to: process.env.OPERATOR_EMAIL!,
        subject: '⚠️ [Burnout 경고] 주 50시간 — 다음 주 부담 조절',
        html: render(BurnoutWarningEmail({ hours: result.week_total_hours })),
      });
    }

    return NextResponse.json(result);
  }
  ```
- [ ] **콘텐츠 발행 일시중단 SOP — `docs/burnout-content-pause-sop.md`**:
  ```markdown
  # Burnout 콘텐츠 발행 일시중단 SOP

  ## 트리거
  - 주 60시간 초과 (자동 알림)
  - 또는 운영자 주관 판단 (피로 누적·집중력 저하·수면 부족)

  ## 절차 (1주 일시중단 기준)
  1. **공지 작성** — 본 SOP 의 템플릿 활용
  2. **랜딩 배너 노출** — `/api/admin/banner` 에 ANNOUNCE 등록
  3. **신규 lesson 발행 0** — 1주
  4. **사용자 문의 응답 only** — 24시간 내 (긴급만)
  5. **CI 자동 게이트 유지** — IF-CI-001~006 정상 운영
  6. **DR drill 일정 연기** — 1주

  ## 사용자 공지 템플릿
  ```html
  <p>안녕하세요, 경제 판단력 교과서 제작자입니다.</p>
  <p>이번 주는 운영자의 휴식을 위해 신규 lesson 발행을 일시중단합니다.</p>
  <p>기존 콘텐츠는 정상 이용 가능하며, 다음 주부터 정상 운영됩니다.</p>
  <p>감사합니다.</p>
  ```

  ## 재개 절차
  - 1주 후 운영자 자가 진단 (정상 컨디션 확인)
  - 점진 재개 — 첫 주는 50% 부담만
  - admin 대시보드의 burnout-status 정상 범위 도달 시 정상 운영
  ```
- [ ] **admin 대시보드 — `/admin/burnout`**:
  - 최근 4주 시간 시계열 차트
  - 카테고리별 분포 (content / ops / support / feature / bugfix)
  - 임계 알림 + recommendation
  - 자가 보고 입력 폼
- [ ] **외부 응원 정책 (선택, 별도 후속)**:
  - 사용자 후원 페이지 (Toss 후원 등)
  - 자원봉사자 모집 (콘텐츠 검토 외주)
  - 본 태스크는 SOP 까지만. 후원·모집은 Stage 2 검토
- [ ] **PII 보호**: hoursWorked + category 만. 본인 외 노출 0
- [ ] **응답 시간**: ≤ 200ms

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 자가 보고 정상
- **Given**: ADMIN
- **When**: logOperatorActivity({ date: '2026-04-26', hours_worked: 8, category: 'content' })
- **Then**: OperatorActivityLog INSERT

### Scenario 2: 24시간 초과 — 거부
- **Given**: hours_worked: 25
- **When**: 호출
- **Then**: throw INVALID_HOURS

### Scenario 3: 음수 시간 — 거부
- **Given**: hours_worked: -1
- **When**: 호출
- **Then**: throw

### Scenario 4: 동일 (date, category) 재보고 — UPSERT
- **Given**: 동일 키 존재
- **When**: 재호출 with 다른 hours
- **Then**: hoursWorked 갱신

### Scenario 5: 주 50시간 — 경고 알림
- **Given**: 주 누적 50시간
- **When**: 일요일 cron
- **Then**: warning 이메일 + EventLog (없음 — warning 만)

### Scenario 6: 주 60시간 — critical
- **Given**: 누적 60
- **When**: cron
- **Then**: critical 이메일 + EventLog `burnout.critical`

### Scenario 7: 주 35시간 — 알림 없음
- **Given**: 정상 범위
- **When**: cron
- **Then**: 메일 0

### Scenario 8: GET /api/admin/burnout-status — 응답
- **Given**: 데이터
- **When**: ADMIN GET
- **Then**: 200 + 모든 필드

### Scenario 9: non-ADMIN — 403
- **Given**: LEARNER
- **When**: 호출
- **Then**: 403

### Scenario 10: SOP 문서 + 대시보드 작성
- **Given**: 본 태스크 PR
- **When**: 검토
- **Then**: docs/burnout-content-pause-sop.md + /admin/burnout 페이지 모두 존재

## :gear: Technical & Non-Functional Constraints
- **자가 보고 우선**: 자동 추정보다 정확
- **임계 — 50 (warning) / 60 (critical)**: 환경변수화 가능
- **카테고리 5종**: content / ops / support / feature / bugfix
- **UPSERT 정책**: 동일 (date, category) 재보고 허용 (편집)
- **cron 매주 일요일 09:00 KST (UTC 일 00:00)**
- **PII 보호**: 본인 외 노출 0 (관리자도 본인만)
- **SOP 명확성**: 일시중단·재개 모두 정량 기준
- **응답 시간 ≤ 200ms**
- **금지**:
  - 24시간 초과 또는 음수 허용
  - 자동 추정만 활용 (자가 진단 우선)
  - critical 알림 silent fail
  - 다른 사용자의 시간 노출

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] OperatorActivityLog 모델
- [ ] logOperatorActivity() Server Action
- [ ] /api/admin/burnout-status Route Handler
- [ ] /api/cron/burnout-check Route Handler
- [ ] /admin/burnout 페이지
- [ ] burnout-content-pause-sop.md 문서
- [ ] 메일 템플릿 (warning + critical)
- [ ] EventLog `burnout.critical` 발행
- [ ] PR 본문에 "CON-08 단일 제작자 burnout 자동 모니터링" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-002 (User)
  - CT-DB-009 (EventLog)
  - FR-AUTH-002 (RBAC)
  - IF-RES-001 (Resend)
  - CT-API-010 (Cron 패턴)
- **Blocks**:
  - CON-08 운영 안정성
  - 장기 운영 지속 가능성
- **Related**:
  - NF-RISK-005 (Rollback — 운영 부담 사촌)
  - IF-CRON-004 (DR — 분기 drill)
