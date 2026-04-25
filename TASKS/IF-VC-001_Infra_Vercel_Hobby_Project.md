# [Infra] IF-VC-001: Vercel Hobby 프로젝트 + Git Push 자동 배포 + 환경 분리

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Infra] IF-VC-001: Vercel Hobby 프로젝트 셋업 + Git Push 자동 배포 + Production/Preview/Development 환경 변수 분리"
labels: 'infra, vercel, deployment, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-VC-001] Vercel Hobby 플랜 프로젝트 생성 + GitHub repo 연결 + 자동 배포 파이프라인 + 3환경 변수 분리 (Production/Preview/Development)
- **목적**: 모든 후속 배포·CI 인프라의 기반. ADR-004 + D-TIER (Vercel Hobby + Supabase Free 출발) 의 첫 인프라 태스크. 단일 제작자(CON-08) 가 추가 운영 부담 없이 GitHub Push 만으로 자동 배포·Preview 검증·운영 환경 분리를 활용할 수 있게 한다. R8 (Vercel Hobby 비영리 정책) 준수의 진입점.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-TIER (Vercel Hobby + Supabase Free 출발), C-TEC-007 (Vercel)
  - `/docs/SRS_V0_9.md#1.5.1` — ADR-004 (Next.js + Vercel 단일 풀스택)
  - `/docs/SRS_V0_9.md#3.1` — External Systems
  - `/docs/SRS_V0_9.md#6.6` — R8 (Vercel Hobby 비영리), R9 (cold start)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-07 (월 0~10만원 비용)
- 외부 문서:
  - `https://vercel.com/docs/projects/overview`
  - `https://vercel.com/docs/projects/environment-variables`
  - Vercel Hobby 한도: Functions 100GB-Hours/월, Bandwidth 100GB/월, 빌드 6000분/월

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Vercel 계정 생성 및 Hobby 플랜 활성화**:
  - GitHub OAuth 로 Vercel 가입
  - Hobby 플랜 (개인용 무료) 선택
  - **R8 준수 — 비영리/개인 학습 프로젝트로 사용 명시** (Pro 전환 트리거 도달 전까지)
- [ ] **GitHub repo 연결**:
  - `economic-judgment-textbook` (또는 합의된 이름) repo 를 Vercel 프로젝트로 import
  - Framework Preset — Next.js 자동 감지
  - Build Command — `npm run build` (default)
  - Output Directory — `.next` (default)
  - Install Command — `npm ci` (lockfile 정합)
- [ ] **3환경 분리 정책**:
  - **Production** — `main` 브랜치 → 운영 도메인 (예: `economic-judgment.app`)
  - **Preview** — 모든 PR 브랜치 → 자동 unique URL (예: `economic-judgment-pr-42.vercel.app`)
  - **Development** — `vercel dev` 로컬 명령
- [ ] **환경 변수 등록 (3환경 별도)**:
  ```
  # 공통 (Production + Preview + Development)
  DATABASE_PROVIDER (sqlite | postgresql)
  DATABASE_URL
  DIRECT_URL
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  RESEND_API_KEY
  UPSTASH_REDIS_REST_URL
  UPSTASH_REDIS_REST_TOKEN
  SENTRY_DSN

  # Production 전용
  NEXT_PUBLIC_APP_URL=https://economic-judgment.app

  # Preview 전용
  NEXT_PUBLIC_APP_URL=동적 (Vercel 자동 주입 활용)
  ```
- [ ] **Vercel CLI 설치 + 로컬 연동**:
  ```bash
  npm install -g vercel
  vercel link  # 프로젝트 연결
  vercel env pull .env.local  # 로컬 환경변수 동기화
  ```
- [ ] **branch protection rule 설정** (GitHub 측):
  - `main` 브랜치 — direct push 금지 + PR 필수
  - PR 머지 조건 — Vercel Preview 배포 성공 + CI 통과
- [ ] **도메인 정책**:
  - Hobby 단계 — Vercel 의 무료 서브도메인 (`*.vercel.app`) 사용
  - Public Pilot 진입 시점 — 자체 도메인 구매 + 연결 (별도 후속 태스크)
- [ ] **Functions 설정**:
  - Region — `icn1` (Seoul, Hobby 가능 시) 또는 가까운 region
  - Memory — 1024MB (default, Hobby 한도)
  - Max Duration — 10초 (Hobby 한도. PDF 생성 cold start 5초 + 여유)
  - **PDF 라우트 (`/api/teacher/kit/[id]`) 만 Max Duration 30초 설정** (선택 — `vercel.json` 의 functions config)
- [ ] **`vercel.json` 작성**:
  ```json
  {
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "regions": ["icn1"],
    "functions": {
      "app/api/teacher/kit/[id]/route.ts": {
        "maxDuration": 30
      }
    }
  }
  ```
- [ ] **GitHub Actions 권한** — Vercel 의 GitHub 통합이 PR 마다 Preview Deploy + 결과 코멘트 자동 생성
- [ ] **D-TIER 트리거 모니터링 셋업**:
  - Functions invocations 80K 도달 (한도 100K 의 80%)
  - Bandwidth 80GB 도달 (한도 100GB 의 80%)
  - Build minutes 4800 도달 (한도 6000 의 80%)
  - **Sentry 또는 Vercel native alerts** 로 알림 설정
- [ ] **로깅 정책**:
  - Vercel Logs 활용 (Hobby 는 1시간 retention)
  - 장기 로그 보존 — Sentry + Better Stack (선택, 별도 태스크)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: GitHub Push → Production 자동 배포
- **Given**: Vercel 프로젝트 + main 브랜치 연결
- **When**: main 브랜치에 commit push
- **Then**: Vercel 이 자동 빌드 + Production 배포. 5분 내 완료. `https://economic-judgment.app` 접근 가능

### Scenario 2: PR 생성 → Preview 자동 배포
- **Given**: 새 feature 브랜치
- **When**: PR 생성
- **Then**: Vercel 이 unique Preview URL 생성. PR 코멘트에 자동 게시 (`https://economic-judgment-pr-42.vercel.app`)

### Scenario 3: Preview 환경변수 분리
- **Given**: Preview 환경
- **When**: 빌드 시점
- **Then**: Production 의 환경변수가 아닌 Preview 전용 값 사용 (예: 별도 Supabase staging DB)

### Scenario 4: 빌드 실패 시 배포 차단
- **Given**: TypeScript 에러 PR
- **When**: PR 생성
- **Then**: Vercel 빌드 실패. PR Checks 빨강. main merge 차단

### Scenario 5: Functions Max Duration — PDF 라우트
- **Given**: PDF 생성 요청 (cold start 8초 소요)
- **When**: 응답
- **Then**: 30초 한도 내 정상 응답 (vercel.json 의 functions config)

### Scenario 6: Region 정합 — Seoul
- **Given**: 정상 운영
- **When**: Vercel Functions 응답 헤더 검사
- **Then**: `x-vercel-id` 에 `icn1` 포함 (한국 사용자 대상 지연 최소화)

### Scenario 7: 환경변수 누락 시 빌드 차단
- **Given**: `DATABASE_URL` 누락
- **When**: 빌드
- **Then**: lib/env.ts 의 zod 검증으로 빌드 명시적 fail

### Scenario 8: D-TIER 트리거 도달 시 알림
- **Given**: 한도의 80% 도달
- **When**: Vercel native alerts 또는 Sentry
- **Then**: 운영자 (Ella) 에게 알림 발송. Pro 전환 검토 트리거

### Scenario 9: Vercel CLI 로컬 동기화
- **Given**: 신규 개발 환경
- **When**: `vercel env pull .env.local`
- **Then**: Vercel 의 Development 환경변수가 로컬 `.env.local` 에 다운로드

### Scenario 10: branch protection 강제
- **Given**: main 브랜치 직접 push 시도
- **When**: GitHub 응답
- **Then**: 거부됨. PR 필수 + Vercel Preview 통과 필수

## :gear: Technical & Non-Functional Constraints
- **Hobby 플랜 한도 (R8 준수)**:
  - Functions 100GB-Hours/월 (대략 100K invocations × 1초 평균)
  - Bandwidth 100GB/월
  - Build minutes 6000/월
  - Edge Functions 1M requests/월
  - Concurrent Builds 1
  - Functions Max Duration 10초 (PDF 라우트 30초)
- **Region 정책**: `icn1` (Seoul) — 한국 사용자 대상. `hnd1` (Tokyo) 차선
- **3환경 변수 분리 강제**: 같은 키라도 환경별 다른 값. Vercel CLI 로 환경별 등록
- **Preview Deploy 의 의의**: PR 마다 unique URL 로 시각 검증 + axe-core CI (IF-CI-002) + Playwright (TS-E2E-*) 의 baseURL 활용
- **branch protection 강제**: main 직접 push 금지. PR + Preview Pass 필수
- **빌드 시간 ≤ 3분 목표**: Next.js + Prisma generate 합산. 3분 초과 시 의존성 최적화 검토
- **Functions cold start 완화**: IF-CRON-001 (5분 warmup) 과 통합
- **Pro 전환 트리거 (D-TIER)**: Functions 80K, Bandwidth 80GB, Build 4800분 도달 시 검토
- **로깅 retention 한계**: Hobby 1시간. 장기 보존은 Sentry·Better Stack 통합 (별도)
- **금지**:
  - Hobby 에서 상업 활동 (R8 위반 — Anthropic 계정 정지 위험)
  - 환경변수를 코드에 hardcoding
  - main 직접 push (branch protection 우회)
  - Functions Max Duration 60초 이상 (Hobby 미지원)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Vercel 프로젝트 생성 + GitHub repo 연결
- [ ] 3환경 (Prod/Preview/Dev) 환경변수 등록
- [ ] `vercel.json` 작성 + Functions config (PDF 30초)
- [ ] Region `icn1` 설정 + 응답 헤더 검증
- [ ] branch protection rule (main PR 필수 + Preview Pass)
- [ ] `vercel env pull` 로컬 동기화 동작
- [ ] D-TIER 트리거 모니터링 알림 설정 (Vercel native + Sentry)
- [ ] 빌드 시간 ≤ 3분 측정
- [ ] 첫 배포 성공 + Production URL 접근 가능
- [ ] PR 본문에 "모든 후속 배포·CI 의 기반. R8 비영리 정책 준수" 명시
- [ ] Vercel Dashboard 스크린샷 첨부 (환경변수·도메인 설정 증빙)

## :construction: Dependencies & Blockers
- **Depends on**:
  - GitHub repo 생성 (별도 사전 작업)
- **Blocks**:
  - IF-SUP-001 (Supabase 환경변수 등록 위치)
  - IF-CI-001 (Vercel Preview 가 CI 의 baseURL)
  - IF-CI-002 (axe + Lighthouse — Vercel Preview 활용)
  - IF-CRON-001 (Vercel Cron — 본 프로젝트 위에 등록)
  - FW-AUTH-001 (Supabase Auth 환경변수 등록)
  - FW-PDF-001 (PDF 라우트 Functions config)
  - 모든 배포 의존 태스크
- **Related**:
  - SRS §6.6 R8 (비영리 정책), R9 (cold start), CON-07 (비용)
