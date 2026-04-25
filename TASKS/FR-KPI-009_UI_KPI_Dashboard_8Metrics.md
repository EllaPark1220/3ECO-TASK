# [Feature] FR-KPI-009: 8개 KPI 통합 대시보드 — Supabase SQL + Vercel Analytics + Sentry

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-KPI-009: ADMIN 전용 8개 KPI 통합 대시보드 — Supabase SQL 집계 + Vercel Analytics + Sentry 조합"
labels: 'feature, fullstack, kpi, admin, dashboard, priority:high, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-KPI-009] ADMIN 전용 8개 KPI 통합 대시보드 UI
- **목적**: FR-KPI-001~007 의 개별 API 를 단일 대시보드 페이지로 통합하여 단일 제작자(CON-08) 가 서비스 상태를 한눈에 파악한다. REQ-NF-032 (KPI 대시보드 자동 집계 + 시각화) 를 충족. 8개 KPI 카드 + 시계열 차트 + 목표 대비 게이지를 제공하며, 추가로 캐시 HIT 비율 (IF-CACHE-002)·D-TIER 상태 (IF-VC-002)·Sentry 에러 카운트도 운영 지표로 포함.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.4` — REQ-NF-032 (KPI 대시보드)
  - `/docs/SRS_V0_9.md#1.2.1` — Stage 1 KPI 목표 (북극성 + 보조 7개)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-021 (ADMIN RBAC)
- 선행: FR-KPI-001~007 (개별 KPI API), IF-AN-001 (Analytics), NF-OBS-001 (Sentry)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/admin/dashboard/page.tsx` — ADMIN 전용 서버 컴포넌트:
  ```tsx
  import { requireRole } from '@/lib/auth/guards';
  export default async function KpiDashboard() {
    await requireRole('ADMIN');
    // 8개 KPI API 병렬 fetch
    const [signups, l4, oxAccuracy, mediaPref, dau, teacherKit, teacherReuse, cacheHit] =
      await Promise.all([
        fetch('/api/kpi/signups'),
        fetch('/api/kpi/l4-completion'),
        fetch('/api/kpi/ox-accuracy'),
        fetch('/api/kpi/media-preference'),
        fetch('/api/kpi/dau'),
        fetch('/api/kpi/teacher-kit'),
        fetch('/api/kpi/teacher-reuse'),
        fetch('/api/kpi/cache-hit'),
      ].map(p => p.then(r => r.json())));
    return <DashboardGrid data={{ signups, l4, oxAccuracy, mediaPref, dau, teacherKit, teacherReuse, cacheHit }} />;
  }
  ```
- [ ] `app/admin/dashboard/components/DashboardGrid.tsx` — 8카드 그리드:
  - 2열 × 4행 반응형 그리드 (모바일 1열)
  - 각 카드: 제목 + 현재값 + 목표 + 달성률 게이지 + 미니 시계열 sparkline
- [ ] **KPI 카드 8종**:

  | # | 카드 | 데이터 소스 | 목표 |
  |---|---|---|---|
  | 1 | 가입자 수 | FR-KPI-001 | ≥1,000 (Stage 1) |
  | 2 | L4 완주율 | FR-KPI-002 | 300~1,000명 |
  | 3 | OX 정답률 | FR-KPI-003 | 70~85% |
  | 4 | 매체 선호 분포 | FR-KPI-004 | 3매체 고른 분포 |
  | 5 | DAU | FR-KPI-005 | ≥50 |
  | 6 | 교안 다운로드 | FR-KPI-006 | ≥100회/월 |
  | 7 | 교사 재사용 | FR-KPI-007 | ≥70% |
  | 8 | 캐시 HIT | IF-CACHE-002 | ≥95% |

- [ ] **시계열 차트** — `recharts` 또는 `chart.js` 라이트 활용:
  ```tsx
  import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
  // 30일 시계열 sparkline
  ```
- [ ] **목표 대비 게이지** — CSS 기반 원형 프로그레스:
  - 초록 (≥100% 달성), 노랑 (80~99%), 빨강 (<80%)
- [ ] **D-TIER 상태 패널** (IF-VC-002 연동):
  - 5개 트리거 현재값 / 한도 바 차트
- [ ] **Sentry 에러 카운트** (NF-OBS-001 연동):
  - 지난 24시간 에러 카운트 + Sev 분포
- [ ] **자동 갱신**: 5분 간격 `revalidate` 또는 SWR polling
- [ ] **접근성**: WCAG AA — 색상 외 텍스트 라벨 필수 (색맹 고려)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: ADMIN 접근 — 8카드 대시보드 렌더
- **Given**: ADMIN 로그인
- **When**: `/admin/dashboard` 접근
- **Then**: 8개 KPI 카드 렌더. 각 카드에 현재값 + 목표 + 달성률 표시

### Scenario 2: LEARNER 차단 — 403
- **Given**: LEARNER 로그인
- **When**: `/admin/dashboard` 접근
- **Then**: 403 또는 /lessons 리다이렉트

### Scenario 3: 시계열 sparkline — 30일 데이터
- **Given**: 가입자 카드
- **When**: sparkline 확인
- **Then**: 지난 30일 일별 가입 추이 라인차트

### Scenario 4: 목표 달성 게이지 — 색상 분기
- **Given**: OX 정답률 82%
- **When**: 게이지 확인
- **Then**: 초록 표시 (70~85% 범위 내)

### Scenario 5: D-TIER 상태 패널
- **Given**: Functions 50K/100K
- **When**: D-TIER 패널 확인
- **Then**: 50% 게이지 (초록)

### Scenario 6: 자동 갱신 — 5분
- **Given**: 대시보드 열린 상태
- **When**: 5분 경과
- **Then**: 데이터 자동 갱신 (SWR revalidate)

### Scenario 7: 모바일 반응형 — 1열 레이아웃
- **Given**: 모바일 (width < 768px)
- **When**: 대시보드 접근
- **Then**: 카드 1열 세로 배치. 스크롤 가능

### Scenario 8: 접근성 — 텍스트 라벨
- **Given**: 색맹 사용자
- **When**: 게이지 확인
- **Then**: 색상 외 텍스트 라벨 ("달성"/"미달") 표시

### Scenario 9: 데이터 로딩 상태
- **Given**: API 응답 대기 중
- **When**: 대시보드 렌더
- **Then**: 스켈레톤 로딩 UI 표시 (빈 카드 깜빡임 없음)

### Scenario 10: 에러 상태 — 일부 API 실패
- **Given**: FR-KPI-003 API 5xx
- **When**: 대시보드 렌더
- **Then**: 해당 카드만 에러 표시 ("데이터 조회 실패"). 나머지 7카드 정상

## :gear: Technical & Non-Functional Constraints
- **ADMIN 전용 (INV-07)**: `requireRole('ADMIN')` 첫 줄
- **차트 라이브러리**: `recharts` (~45KB gzip) 추천. 최소 번들
- **데이터 fetch 전략**: 서버 컴포넌트에서 `Promise.all` 8개 API 병렬 호출 (SSR). SWR 클라이언트 갱신
- **갱신 주기**: `revalidate: 300` (5분) 또는 SWR `refreshInterval: 300_000`
- **반응형 그리드**: CSS Grid `grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))`
- **금지**:
  - KPI 대시보드 공개 (ADMIN 만)
  - 외부 대시보드 서비스 (Grafana 등) 의존 — 자체 구축
  - 개별 사용자 PII 노출 (집계 값만)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `app/admin/dashboard/page.tsx` + 컴포넌트 구현
- [ ] 8개 KPI 카드 렌더 + sparkline + 게이지
- [ ] D-TIER 상태 패널 통합
- [ ] 모바일 반응형 (1열) 검증
- [ ] 접근성 (텍스트 라벨) 검증
- [ ] 자동 갱신 5분 동작
- [ ] PR 본문에 "REQ-NF-032 KPI 대시보드. FR-KPI-001~007 통합" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-KPI-001~007 (개별 KPI API)
  - IF-CACHE-002 (캐시 HIT 비율)
  - IF-VC-002 (D-TIER 상태)
  - FR-AUTH-002 (RBAC 가드)
- **Blocks**:
  - 없음 (최종 소비자 UI)
- **Related**:
  - REQ-NF-032 (KPI 대시보드)
  - CON-08 (단일 제작자 운영 편의)
