# [Infra] IF-AN-001: Vercel Analytics + Plausible(선택) — privacy-first 분석 통합

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Infra] IF-AN-001: Vercel Analytics 활성화 + Plausible(선택) privacy-first 분석 — 쿠키 0 + GDPR 준수"
labels: 'infra, analytics, privacy, priority:medium, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-AN-001] Vercel Analytics 활성화 + Plausible CE (선택 대안) — 쿠키 없는 privacy-first 웹 분석
- **목적**: REQ-NF-020 (외부 CDN·트래커 최소화) 와 REQ-NF-014 (PII 최소) 를 준수하면서 페이지 조회·방문자·유입 경로·디바이스 등 기본 웹 분석 데이터를 수집한다. Vercel Analytics 는 Hobby 플랜에서 무료 제공 (Web Vitals + Audience). Google Analytics 는 PII 수집 우려로 사용하지 않음.

## :link: References (Spec & Context)
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.2` — REQ-NF-020 (외부 CDN 최소화)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-014 (PII 최소)
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-TIER (Vercel Hobby Analytics 포함)
- 외부: `https://vercel.com/docs/analytics`, `https://plausible.io/docs`
- 선행: IF-VC-001 (Vercel 프로젝트)

## :white_check_mark: Task Breakdown (실행 계획)

### Vercel Analytics (기본)
- [ ] **Vercel Dashboard → Analytics 활성화** (Hobby 플랜 무료)
- [ ] `@vercel/analytics` 패키지 설치:
  ```bash
  npm install @vercel/analytics
  ```
- [ ] `app/layout.tsx` 에 Analytics 컴포넌트 추가:
  ```tsx
  import { Analytics } from '@vercel/analytics/react';
  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="ko">
        <body>
          {children}
          <Analytics />
        </body>
      </html>
    );
  }
  ```
- [ ] **Web Vitals 수집** — `@vercel/speed-insights` (선택):
  ```tsx
  import { SpeedInsights } from '@vercel/speed-insights/next';
  // <SpeedInsights /> 추가
  ```
- [ ] **커스텀 이벤트 전송** (선택 — EventLog 와 병행 가능):
  ```ts
  import { track } from '@vercel/analytics';
  track('lesson_completed', { lessonId: 'L001' });
  ```

### Plausible CE (선택 대안)
- [ ] **채택 조건**: Vercel Analytics 만으로 부족한 경우 (유입 경로·UTM 분석 필요)
- [ ] **Self-hosted Plausible CE**: Docker 기반 자체 운영 (무료) 또는 Cloud ($9/월)
- [ ] **스크립트 삽입**: `<script defer data-domain="economy-textbook.kr" src="..." />`
- [ ] **쿠키 0 확인**: Plausible 은 쿠키 없이 fingerprint 기반. GDPR 배너 불필요
- [ ] **본 MVP 결정**: Vercel Analytics 만 채택 (무료 + 쿠키 없음 + 1줄 코드). Plausible 은 Stage 2 검토

### privacy-first 검증
- [ ] **쿠키 0건 확인**: 빌드 후 DevTools Application → Cookies 탭 → analytics 관련 쿠키 0건
- [ ] **외부 트래커 0건**: `grep -r "google-analytics\|gtag\|fbevents" .next/` → 0건
- [ ] **CSP 헤더 정합**: Vercel Analytics 도메인 (`vitals.vercel-insights.com`) 만 허용

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: Vercel Analytics 활성 — Web Vitals 수집
- **Given**: `<Analytics />` 컴포넌트 삽입
- **When**: 페이지 로드
- **Then**: Vercel Dashboard Analytics 에 LCP·FID·CLS 데이터 수집

### Scenario 2: 쿠키 0건
- **Given**: 분석 활성화 후
- **When**: DevTools Cookies 탭 검사
- **Then**: analytics 관련 쿠키 0건

### Scenario 3: Google Analytics 미사용
- **Given**: 빌드 완료
- **When**: `grep` 검사
- **Then**: `google-analytics`·`gtag`·`fbevents` 0건

### Scenario 4: 페이지 조회 카운트
- **Given**: 10회 페이지 조회
- **When**: Vercel Analytics Dashboard
- **Then**: Page Views ≥ 10

### Scenario 5: Web Vitals — LCP ≤ 1.5초
- **Given**: Speed Insights 활성
- **When**: 데이터 수집
- **Then**: LCP p75 ≤ 1.5초 (REQ-NF-002)

### Scenario 6: CSP 헤더 정합
- **Given**: Content-Security-Policy 설정
- **When**: Analytics 스크립트 로드
- **Then**: CSP 위반 0건

### Scenario 7: 번들 크기 영향 최소
- **Given**: `@vercel/analytics` 설치
- **When**: 번들 분석
- **Then**: 추가 ~1KB gzip. First Load JS 영향 미미

### Scenario 8: Hobby 플랜 한도 이내
- **Given**: Vercel Hobby Analytics
- **When**: 월간 사용량 확인
- **Then**: Free 한도 이내 (2,500 data points/월)

## :gear: Technical & Non-Functional Constraints
- **Vercel Analytics 채택 이유**: Hobby 무료, 쿠키 없음, 1줄 코드, Next.js 네이티브
- **Google Analytics 미사용 이유**: 쿠키 필수, PII 수집 우려, GDPR 배너 필요, REQ-NF-014·020 위반 위험
- **Plausible 보류 이유**: 추가 인프라 (Docker 또는 $9/월). Stage 2 에서 UTM 분석 필요 시 검토
- **번들 영향**: `@vercel/analytics` ~1KB, `@vercel/speed-insights` ~1KB. 합산 ~2KB
- **금지**:
  - Google Analytics 삽입
  - 쿠키 기반 트래커 (PII 수집)
  - Facebook Pixel 등 광고 트래커
  - 사용자 식별 가능한 fingerprinting (IP 해시도 금지)

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 통과
- [ ] Vercel Analytics 활성화 + `<Analytics />` 삽입
- [ ] Speed Insights (선택) 활성화
- [ ] 쿠키 0건 검증
- [ ] Google Analytics 0건 검증
- [ ] CSP 정합 검증
- [ ] PR 본문에 "privacy-first 분석. REQ-NF-014·020 준수. GA 미사용" 명시

## :construction: Dependencies & Blockers
- **Depends on**: IF-VC-001 (Vercel 프로젝트)
- **Blocks**: FR-KPI-009 (대시보드 — Analytics 데이터 참조)
- **Related**: REQ-NF-014 (PII 최소), REQ-NF-020 (외부 트래커 최소)
