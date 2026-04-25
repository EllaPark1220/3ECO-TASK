# [Feature] FW-PDF-001: @react-pdf/renderer + 나눔바른고딕·나눔명조 폰트 등록 (Vercel 번들 한도 검증)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-PDF-001: @react-pdf/renderer 설치 + 나눔바른고딕·나눔명조 SIL OFL 1.1 폰트 등록 + Vercel 50MB 번들 한도 검증"
labels: 'feature, backend, pdf, fonts, infra, priority:critical, mvp-in, private-beta, l2-risk'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-PDF-001] `@react-pdf/renderer` 라이브러리 설치 + 나눔바른고딕(고딕) + 나눔명조(세리프) 한글 폰트 등록 + Vercel Functions 번들 50MB 한도 충족 검증
- **목적**: Story 3 (장은혜 · 중학 사회 36세) 의 핵심 — 한국 공교육 교안 표준 (나눔바른고딕·나눔명조) 으로 PDF 를 생성하여 교사가 수업 자료로 즉시 활용 가능하게 한다. 본 태스크는 SRS §6.2.4 PDF 양식 규격의 인프라 기반이며, **L2 영역 (가장 높은 디버깅 위험) 으로 분류** 되어 일찍 노출시켜 한글 폰트 embedding · cold start · 번들 크기 3대 운영 리스크를 사전 검증한다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.2.4` — Teacher Kit PDF 양식 규격 (나눔바른고딕·나눔명조, SIL OFL 1.1)
  - `/docs/SRS_V0_9.md#3.1` — External Systems (Google Fonts CDN, Alpha 투입)
  - `/docs/SRS_V0_9.md#3.6.2` — PDF Generation 컴포넌트 (`@react-pdf/renderer`)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-020 (외부 폰트·스크립트 CDN 최소화)
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-013, 015, 019 (PDF 생성·개정이력·QR)
  - `/docs/SRS_V0_9.md#1.5.1.2` — C-TEC-001~007 (Next.js + Vercel 단일 풀스택)
  - `/docs/SRS_V0_9.md#6.6` — R8·R9 (Vercel Hobby 정책·cold start)
- 외부 문서:
  - `https://react-pdf.org/fonts` — Font.register() API
  - `https://fonts.google.com/noto/specimen/Noto+Sans+KR` — 나눔 폰트 라이선스
  - SIL OFL 1.1 — 자유 재배포 허용 (CC BY-NC-SA 4.0 호환)
- 선행 환경: IF-VC-001 (Vercel) · IF-FONT-001 (Google Fonts subset)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `npm install @react-pdf/renderer` 설치 (현재 안정 버전 검증)
- [ ] 한글 폰트 파일 다운로드 (Google Fonts 또는 GitHub `fonts-archive` 저장소):
  - **나눔바른고딕** Regular + Bold (제목·OX 문항용)
  - **나눔명조** Regular (본문 발췌용)
- [ ] **폰트 서브셋 생성** — `pyftsubset` (fonttools) 또는 `subset-font` 라이브러리 활용:
  - 한글 KS X 1001 완성형 2,350자 + 영문 + 숫자 + 공통 기호
  - 서브셋 후 파일 크기 목표 **각 < 1.5MB** (원본 ≈ 4MB)
- [ ] 폰트 파일 저장 위치 — `public/fonts/` (Vercel Functions 번들 포함). 개발자 의도 명확화 위해 `app/api/teacher/kit/[id]/fonts/` 같은 라우트별 위치는 금지
- [ ] `lib/pdf/fonts.ts` — 폰트 등록 모듈:
  ```ts
  import { Font } from '@react-pdf/renderer';
  Font.register({
    family: '나눔바른고딕',
    fonts: [
      { src: '/fonts/NanumBarunGothic-Regular.ttf' },
      { src: '/fonts/NanumBarunGothic-Bold.ttf', fontWeight: 'bold' },
    ],
  });
  Font.register({
    family: '나눔명조',
    src: '/fonts/NanumMyeongjo-Regular.ttf',
  });
  ```
- [ ] 폰트 등록은 모듈 import 시 1회만 실행 (`Font.register` 중복 호출 방지)
- [ ] `app/api/teacher/kit/[id]/route.ts` 의 핸들러에서 본 모듈 import — Vercel Functions 가 폰트 파일을 번들에 포함하도록 강제
- [ ] **번들 크기 검증** — `vercel build` 후 `.vercel/output/functions/api/teacher/kit/[id]/.func/` 디렉토리 크기 측정. **50MB 이하 (Vercel Hobby Functions 한도)** 확인
- [ ] **Cold start 측정** — 첫 PDF 생성 요청의 응답 시간 측정. 목표: p95 ≤ 5초 (REQ-NF-004 의 2초 한도는 warm 상태 기준)
- [ ] Cold start 완화 연동 — IF-CRON-001 (Vercel Cron 5분 간격 warmup) 이 본 라우트도 hit 하도록 설정
- [ ] 라이선스 명시 — `public/fonts/LICENSE.md` 에 SIL OFL 1.1 전문 + 출처 (Naver `nanum-font` GitHub) 포함
- [ ] 헬스체크 라우트 `/api/health/pdf-fonts` 임시 추가 — 폰트 등록 정상 여부 확인
- [ ] 테스트용 더미 PDF 생성 스크립트 — 한글 + 영문 + 숫자 혼용 PDF 1장 생성하여 글리프 누락 검증

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 폰트 정상 등록 + PDF 렌더
- **Given**: 폰트 파일 3종이 `public/fonts/` 에 존재
- **When**: 더미 PDF 생성 스크립트 실행 (한글 "안녕하세요 경제 판단력 교과서입니다" + 영문 + 숫자)
- **Then**: PDF 파일 정상 생성. 한글 글리프 누락 0건. 나눔바른고딕·나눔명조 모두 정상 렌더

### Scenario 2: Vercel 50MB 번들 한도 충족
- **Given**: 폰트 서브셋 적용 후 `vercel build` 실행
- **When**: `.vercel/output/functions/api/teacher/kit/[id]/.func/` 디렉토리 크기 측정
- **Then**: **50MB 이하** (Vercel Hobby Functions 한도). 초과 시 PR 차단

### Scenario 3: Cold start 응답 시간
- **Given**: Vercel Functions 가 cold (15분 이상 호출 없음)
- **When**: 첫 PDF 생성 요청
- **Then**: 응답 시간 ≤ 5초 (cold). 두 번째 요청부터는 warm 상태로 ≤ 2초 (REQ-NF-004)

### Scenario 4: Cron warmup 연동 검증
- **Given**: IF-CRON-001 의 `/api/cron/warmup` 가 5분 간격 실행 중
- **When**: 12시간 동안 사용자 요청 0건 시뮬레이션
- **Then**: PDF 생성 라우트도 warm 상태 유지. 다음 사용자 요청 시 cold start 발생 0건

### Scenario 5: 한글 글리프 누락 회귀 검증
- **Given**: 서브셋된 폰트 파일
- **When**: 한국어 빈출 한자 50자 (예: 經濟·判斷·貨幣·...) PDF 렌더 시도
- **Then**: 한자 글리프는 fallback 폰트로 처리되거나 명시적 에러. **한글 한자 1자라도 빈 박스(▢) 출력 시 Fail** (서브셋 범위 재검토 필요)

### Scenario 6: 라이선스 명시
- **Given**: PR 리뷰 시점
- **When**: `public/fonts/LICENSE.md` 검사
- **Then**: SIL OFL 1.1 전문 + Naver 출처 + Copyright 표기 모두 포함. PDF 푸터에도 라이선스 인용 (`@react-pdf/renderer` 의 Text 컴포넌트로 작은 폰트 표기)

### Scenario 7: 폰트 등록 중복 호출 방지
- **Given**: `lib/pdf/fonts.ts` 가 동일 요청 내 5회 import 됨 (의도적 시뮬레이션)
- **When**: PDF 생성 요청
- **Then**: `Font.register()` 는 1회만 실제 등록 (모듈 캐싱 활용). console warning 0건

### Scenario 8: SQLite 로컬 환경 호환
- **Given**: 개발자 로컬 환경 (`DATABASE_URL=file:./dev.db`)
- **When**: 더미 PDF 스크립트 실행
- **Then**: 폰트 등록 + PDF 생성 모두 정상. 로컬과 Vercel 배포 환경 동일 동작

## :gear: Technical & Non-Functional Constraints
- **라이브러리 선택 (§6.2.4)**: `@react-pdf/renderer` 강제. `puppeteer` 또는 `pdfkit` 같은 대안은 cold start·번들 크기 문제로 기각
- **폰트 라이선스 (ADR-002 호환)**: SIL OFL 1.1 만 허용. 상업 라이선스·CC BY-ND 같은 제한 라이선스 금지
- **서브셋 크기 목표**: 각 폰트 < 1.5MB. KS X 1001 완성형 2,350자 + ASCII 범위 충분
- **Vercel 한도 (§1.5.1.2 D-TIER)**:
  - Functions 번들 크기 ≤ 50MB (Hobby)
  - Cold start ≤ 5초 (R9 — Cron warmup 으로 완화)
  - Pro 전환 트리거 시점에는 한도 250MB 로 확장 가능 (현 시점 적용 안함)
- **폰트 위치 정책**: `public/fonts/` 단일 디렉토리. 라우트별 분산 금지 (Vercel 번들 중복 포함 위험)
- **모듈 패턴**: `Font.register()` 는 모듈 최상위에서 1회 호출. 함수 내부 호출 금지 (성능 + 중복 등록 방지)
- **Cold start 완화 (R9)**: IF-CRON-001 의 5분 간격 warmup 이 본 라우트도 hit. Cron 등록 시 path 추가 필수
- **로컬 호환**: SQLite 환경에서도 동일 동작. Supabase 실 인스턴스 의존 0
- **금지**:
  - 폰트 파일을 외부 CDN 에서 런타임 fetch (REQ-NF-020 외부 의존 최소화 위반)
  - 폰트 변환 도구 (FontForge, ttf2woff 등) 를 빌드 시점에 실행 (빌드 시간 폭증)
  - 한국어 외 다국어 폰트 추가 (CON 한국어 단일)

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 전부 통과
- [ ] `@react-pdf/renderer` 설치 + 안정 버전 lock
- [ ] 나눔바른고딕 Regular/Bold + 나눔명조 Regular 3개 폰트 파일이 `public/fonts/` 에 위치
- [ ] 서브셋 후 각 폰트 파일 크기 < 1.5MB
- [ ] `lib/pdf/fonts.ts` 의 `Font.register()` 모듈 1회 실행 검증
- [ ] Vercel build 후 Functions 번들 크기 ≤ 50MB 확인
- [ ] Cold start p95 ≤ 5초, warm p95 ≤ 2초 측정
- [ ] IF-CRON-001 warmup path 에 본 라우트 추가
- [ ] `public/fonts/LICENSE.md` SIL OFL 1.1 + Naver 출처 명시
- [ ] 헬스체크 `/api/health/pdf-fonts` 200 OK
- [ ] 더미 PDF 생성 스크립트가 한글 누락 0건으로 통과
- [ ] PR 본문에 "본 태스크는 L2 위험 영역 (한글 폰트 + Vercel 번들). Story 3 의 인프라 기반" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-VC-001 (Vercel Hobby 프로젝트)
  - IF-CRON-001 (Vercel Cron warmup — 본 라우트도 hit 하도록 path 추가 필요)
  - IF-FONT-001 (Google Fonts subset — 본 태스크와 정합)
- **Blocks**:
  - FW-PDF-002 (PDF 템플릿 — 본 태스크의 폰트 등록을 사용)
  - FR-PDF-001 (PDF 다운로드 API)
  - FW-PDF-003 (PDF 폴백)
  - TS-E2E-007 (장은혜 E2E)
  - **Private Beta 진입** — Story 3 PDF 단일 원전 제공의 인프라 기반
- **Related**:
  - SRS §6.6 R8·R9·R10 (Vercel Hobby 비영리 정책·cold start·Supabase pause)
