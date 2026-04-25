# [Feature] NF-FINAL-001: Stage 1 → Stage 2 전환 게이트 — 8 Criteria 자동 + 수동 검증 + admin 대시보드

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] NF-FINAL-001: Stage 1 → Stage 2 전환 Exit 게이트 — KPI 8종 자동 검증 + Cost·Burnout·DR 수동 + admin 통합 대시보드 + 분기 결정"
labels: 'nf, final, stage-1-2-transition, gate, priority:high, mvp-soft, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-FINAL-001] Stage 1 (Pilot 12개월) → Stage 2 (확장 운영) 전환의 Exit 게이트 — 8 Criteria 통합 검증 + admin 통합 대시보드 + 분기별 의사결정 회의 + 운영자 자가 평가
- **목적**: PRD 의 Stage 1 종료 시점 (12개월 후) 의 의사결정 자동 보조 — 직관 또는 휴리스틱이 아닌 **데이터 기반 결정**. 모든 KPI·Cost·Burnout·DR·Security 가 안정 운영 가능 수준에 도달했는지 자동 검증. **MVP-SOFT** — Public Pilot 진입 후 활성, Stage 1 종료 임박 시점에 본격 활용.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.2.5` — Stage 1 → 2 전환 정의
  - `/docs/SRS_V0_9.md#4.2.4` — REQ-NF-029 (KPI 통합)
- 선행: NF-A11Y-001 (a11y), NF-STAGE-001 (Stage 0 패턴), FR-KPI-001~012 (KPI 12종), NF-RISK-003·004·005, NF-SEC-001~005

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **8 Criteria 정의**:

  **Criteria 1 — 북극성 KPI 충족**: L4 완주 학습자 ≥ 300명 (PRD 의 최소 임계). FR-KPI-002 활용.

  **Criteria 2 — 콘텐츠 품질**: REQ-NF-029 의 콘텐츠 품질 지표 충족 (사용자 "과장됨" 리포트 5% 미만, FR-LINT-001 정합)

  **Criteria 3 — 페르소나 8 만족도**: SH-01~08 모두 핵심 KPI 충족 (FR-KPI-010 이수민 등 + FR-EXP-002·004 의 가설 충족)

  **Criteria 4 — 비용 안정성**: 90일 평균 운영 비용 ≤ 10만원/월 (NF-COST-001~002 정합, 그룹 15)

  **Criteria 5 — 운영 부담 안정성**: 90일 평균 주 운영 시간 ≤ 50시간 (NF-RISK-003)

  **Criteria 6 — DR drill 분기 1회 통과**: 최근 4 분기 모두 통과 (IF-CRON-004 + NF-RISK-005)

  **Criteria 7 — Security audit 통과**: NF-SEC-001~005 모든 게이트 + 외부 audit (Stage 1 후반 1회)

  **Criteria 8 — A/B 실험 결론 도달**: EXP-1~4 모두 n≥최소 + interpretation 도출 (FR-EXP-001~004)

- [ ] **통합 검증 함수 — `lib/stage-gates/stage1to2-exit.ts`**:
  ```ts
  export async function verifyStage1to2Exit(): Promise<{
    overall_ready: boolean;
    criteria: Array<{ id: string; name: string; passed: boolean; detail: string }>;
    next_action: string;
  }> {
    const criteria = [];

    // (1) 북극성 KPI
    const kpiNorthStar = await fetch('/api/kpi/north-star').then(r => r.json());
    criteria.push({
      id: 'north-star',
      name: 'L4 완주 학습자 ≥ 300',
      passed: kpiNorthStar.l4_completed >= 300,
      detail: `${kpiNorthStar.l4_completed} 명`,
    });

    // (2) 콘텐츠 품질 — 자동 unpublish 0
    const contentReports = await prisma.eventLog.count({
      where: { event: 'content.unpublished_auto', createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
    });
    criteria.push({
      id: 'content-quality',
      name: '콘텐츠 품질 — 90일 자동 unpublish 0',
      passed: contentReports === 0,
      detail: `자동 unpublish ${contentReports} 건`,
    });

    // (3) 페르소나 8 만족도 — 핵심 3 검증
    const isumin = await fetch('/api/kpi/isumin-segment').then(r => r.json());
    const exp2 = await fetch('/api/experiments/exp-2').then(r => r.json());
    const exp4 = await fetch('/api/experiments/exp-4').then(r => r.json());
    const personaPassed = isumin.first_video_completion?.target_achieved
      && exp2.target_achieved
      && exp4.target_achieved;
    criteria.push({
      id: 'persona-8',
      name: '페르소나 8 가설 충족 (이수민 + EXP-2 + EXP-4)',
      passed: personaPassed,
      detail: personaPassed ? '3/3 충족' : '일부 미충족',
    });

    // (4) 비용 안정성
    const costStatus = await fetch('/api/kpi/cost-90d').then(r => r.json()).catch(() => null);
    criteria.push({
      id: 'cost-stable',
      name: '90일 평균 ≤ 10만원/월',
      passed: costStatus?.avg_monthly_cost ? costStatus.avg_monthly_cost <= 100000 : false,
      detail: costStatus?.avg_monthly_cost ? `평균 ${costStatus.avg_monthly_cost}원` : '데이터 부재',
    });

    // (5) 운영 부담
    const burnoutStatus = await fetch('/api/admin/burnout-status?window=90d').then(r => r.json());
    criteria.push({
      id: 'burnout-stable',
      name: '90일 평균 주 ≤ 50시간',
      passed: burnoutStatus.avg_weekly_hours <= 50,
      detail: `평균 ${burnoutStatus.avg_weekly_hours.toFixed(1)} 시간`,
    });

    // (6) DR drill 4 분기
    const drDrills = await prisma.eventLog.findMany({
      where: { event: 'dr.drill_completed', createdAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } },
    });
    criteria.push({
      id: 'dr-drill',
      name: '최근 4 분기 DR drill 통과',
      passed: drDrills.length >= 4,
      detail: `${drDrills.length} 회 통과`,
    });

    // (7) Security audit
    const securityAudit = await prisma.eventLog.findFirst({
      where: { event: 'security.audit_passed', createdAt: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } },
    });
    criteria.push({
      id: 'security-audit',
      name: '180일 내 Security audit 통과',
      passed: !!securityAudit,
      detail: securityAudit ? `${securityAudit.createdAt.toISOString().split('T')[0]}` : '180일 내 audit 0',
    });

    // (8) A/B 실험 결론
    const exps = await Promise.all(['exp-1', 'exp-2', 'exp-3', 'exp-4'].map(id =>
      fetch(`/api/experiments/${id}`).then(r => r.json())
    ));
    const expsConclusive = exps.every(e => e.sample_size_achieved);
    criteria.push({
      id: 'exp-conclusive',
      name: 'A/B 실험 4종 모두 결론 도달',
      passed: expsConclusive,
      detail: `${exps.filter(e => e.sample_size_achieved).length}/4 결론`,
    });

    const overallReady = criteria.every(c => c.passed);
    return {
      overall_ready: overallReady,
      criteria,
      next_action: overallReady
        ? '✅ Stage 2 전환 가능 — 분기 의사결정 회의 진행'
        : `⚠️ ${criteria.filter(c => !c.passed).map(c => c.name).join(', ')} 보완 필요`,
    };
  }
  ```
- [ ] **분기별 의사결정 회의 SOP — `docs/stage1to2-decision-sop.md`**:
  ```markdown
  # Stage 1 → 2 전환 분기 결정 SOP

  ## 빈도
  - 분기별 (3·6·9·12개월) 1회

  ## 절차
  1. /admin/stage-gates/stage1to2 의 8 Criteria 검토
  2. 자동 검증 + 운영자 자가 평가 (직관·시장 환경)
  3. Stage 2 전환 결정 시
     - 콘텐츠 확장 (125 → 300+ lesson)
     - 외주 콘텐츠 검토자 모집
     - 마이그레이션 SOP 활성 (NF-RISK-004)
     - 비용 한도 상향 (10 → 50만원/월)
  4. Stage 1 유지 결정 시
     - 보완 항목 우선순위
     - 다음 분기 재검토 일정

  ## 결정 기록
  - `docs/stage-decisions/YYYY-QN.md` 작성
  - 8 Criteria 결과 + 의사결정 + 다음 분기 액션
  ```
- [ ] **/admin/stage-gates/stage1to2 페이지** — 8 Criteria 카드 + next_action
- [ ] **분기별 자동 알림 — Resend 메일** — 분기 첫째 날
- [ ] **EventLog `stage1.exit_checked` + `stage2.transition_approved`**

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 8 Criteria 모두 통과 — overall_ready true
- **Given**: 모든 조건
- **When**: verifyStage1to2Exit
- **Then**: overall_ready: true + ✅

### Scenario 2: 1 Criteria 미통과 — overall fail
- **Given**: north-star 280
- **When**: 검증
- **Then**: overall_ready: false + 보완 안내

### Scenario 3: 페르소나 가설 미충족
- **Given**: EXP-2 미충족
- **When**: 검증
- **Then**: persona-8 passed: false

### Scenario 4: 비용 초과
- **Given**: 평균 12만원/월
- **When**: 검증
- **Then**: cost-stable passed: false

### Scenario 5: burnout 60시간 초과
- **Given**: 평균 60시간
- **When**: 검증
- **Then**: burnout-stable passed: false

### Scenario 6: DR drill 부족
- **Given**: 최근 1년 3회
- **When**: 검증
- **Then**: dr-drill passed: false

### Scenario 7: Security audit 만료
- **Given**: 180일 초과
- **When**: 검증
- **Then**: security-audit passed: false

### Scenario 8: 분기 알림 메일
- **Given**: 분기 첫째 날
- **When**: cron
- **Then**: Resend 발송

### Scenario 9: ADMIN 대시보드 응답
- **Given**: ADMIN
- **When**: GET 페이지
- **Then**: 8 Criteria 카드

### Scenario 10: 결정 기록
- **Given**: 분기 회의 후
- **When**: 운영자
- **Then**: docs/stage-decisions/YYYY-QN.md 작성

## :gear: Technical & Non-Functional Constraints
- **8 Criteria 모두 충족 (AND)**: 단일 누락도 보완 신호
- **MVP-SOFT — Public Pilot 후반 활성**
- **분기별 자동 알림 (3·6·9·12 개월)**
- **수동 결정 보존**: 자동 검증 + 운영자 자가 평가 결합
- **NF-COST-001·002 (그룹 15) 와 정합**
- **외부 audit 180일 retention**
- **결정 기록 docs 표준**
- **금지**:
  - 자동만으로 Stage 2 전환 결정 (시장 환경 무시)
  - Stage 1 종료 직전 보완 시작 (사전 분기 검토 의무)
  - 결정 기록 누락

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] verifyStage1to2Exit() 함수
- [ ] 8 Criteria 자동 검증
- [ ] /admin/stage-gates/stage1to2 페이지
- [ ] stage1to2-decision-sop.md 문서
- [ ] 분기 알림 cron + 메일
- [ ] EventLog 발행
- [ ] PR 본문에 "Stage 1→2 8 Criteria 자동 + 분기 결정 SOP" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - 모든 KPI Route Handler (FR-KPI-001~012)
  - FR-EXP-001~004 (실험)
  - NF-RISK-003 (burnout)
  - NF-COST-001~002 (그룹 15 — 비용)
  - IF-CRON-004 (DR drill)
  - NF-SEC-001~005
- **Blocks**:
  - Stage 2 의사결정 데이터 기반 보조
- **Related**:
  - PRD 12개월 종료 시점
  - NF-FINAL-002 (운영 SOP 통합)
