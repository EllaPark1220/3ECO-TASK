# [Infra] IF-FONT-001: next/font/google 한글 폰트 서브셋 + Vercel Functions 번들 검증

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Infra] IF-FONT-001: next/font/google 나눔바른고딕·나눔명조 SIL OFL 서브셋 + Vercel Functions 50MB 번들 검증"
labels: 'infra, font, performance, korean, priority:high, mvp-in, private-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-FONT-001] `next/font/google` 나눔바른고딕·나눔명조 한국어 서브셋 등록 + Vercel Functions 번들 50MB 한도 검증
- **목적**: Story 3 (장은혜) 의 교안 PDF 에서 한국어 텍스트가 정상 렌더되고, 웹 페이지에서도 일관된 타이포그래피를 제공한다. 나눔바른고딕(제목·라벨)과 나눔명조(본문·해설)은 SIL OFL 1.1 라이선스 (CC BY-NC-SA 4.0 호환) 이며, `next/font/google` 의 자동 서브셋 + self-hosting 으로 외부 CDN 의존을 제거한다 (REQ-NF-020). Vercel Functions 번들에 폰트 파일을 포함하여 `@react-pdf/renderer` 가 서버에서 한글을 렌더할 수 있도록 한다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.2.4` — Teacher Kit PDF 양식 규격 (폰트 사양)
  - `/docs/SRS_V0_9.md#4.2.2` — REQ-NF-020 (외부 CDN 의존 최소화)
  - `/docs/SRS_V0_9.md#1.5.1.2` — C-TEC-007 (Vercel), D-TIER (Hobby 한도)
- 외부 문서:
  - `https://nextjs.org/docs/app/building-your-application/optimizing/fonts`
  - `https://fonts.google.com/specimen/Nanum+Gothic`
  - `https://fonts.google.com/specimen/Nanum+Myeongjo`
  - SIL OFL 1.1 라이선스: `https://scripts.sil.org/cms/scripts/page.php?item_id=OFL`
  - Vercel Functions Size Limits: `https://vercel.com/docs/functions/serverless-functions/runtimes#size-limits`
- 페르소나: SH-05 장은혜 (교안 PDF — 인쇄용 한글 품질), SH-01 박지훈 (웹 가독성)
- 선행: IF-VC-001 (Vercel 프로젝트 설정)

## :white_check_mark: Task Breakdown (실행 계획)

### 웹 폰트 (next/font/google)
- [ ] `app/layout.tsx` 에 `next/font/google` 폰트 등록:
  ```tsx
  import { Nanum_Gothic, Nanum_Myeongjo } from 'next/font/google';

  const nanumGothic = Nanum_Gothic({
    subsets: ['latin'],
    weight: ['400', '700', '800'],
    display: 'swap',
    variable: '--font-gothic',
    preload: true,
  });

  const nanumMyeongjo = Nanum_Myeongjo({
    subsets: ['latin'],
    weight: ['400', '700', '800'],
    display: 'swap',
    variable: '--font-myeongjo',
    preload: true,
  });

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="ko" className={`${nanumGothic.variable} ${nanumMyeongjo.variable}`}>
        <body>{children}</body>
      </html>
    );
  }
  ```
- [ ] **CSS 변수 연결** — `app/globals.css`:
  ```css
  :root {
    --font-gothic: 'Nanum Gothic', sans-serif;
    --font-myeongjo: 'Nanum Myeongjo', serif;
  }

  body {
    font-family: var(--font-gothic);
  }

  .prose, .lesson-script, .ox-explanation {
    font-family: var(--font-myeongjo);
  }
  ```
- [ ] **한국어 서브셋 확인**: `next/font/google` 은 자동으로 한국어 글리프 서브셋 포함 (`subsets: ['latin']` 이라도 한국어 요청 시 자동 fetch). 명시적으로 `subsets: ['latin']` 만 지정 (한국어는 자동 감지 — Google Fonts API 특성)

### PDF 폰트 (@react-pdf/renderer)
- [ ] `@react-pdf/renderer` 는 `next/font` 와 별도. 직접 `.ttf` 파일 등록 필요:
  ```ts
  // lib/pdf/fonts.ts
  import { Font } from '@react-pdf/renderer';

  Font.register({
    family: 'NanumGothic',
    fonts: [
      { src: '/fonts/NanumGothic-Regular.ttf', fontWeight: 400 },
      { src: '/fonts/NanumGothic-Bold.ttf', fontWeight: 700 },
      { src: '/fonts/NanumGothic-ExtraBold.ttf', fontWeight: 800 },
    ],
  });

  Font.register({
    family: 'NanumMyeongjo',
    fonts: [
      { src: '/fonts/NanumMyeongjo-Regular.ttf', fontWeight: 400 },
      { src: '/fonts/NanumMyeongjo-Bold.ttf', fontWeight: 700 },
      { src: '/fonts/NanumMyeongjo-ExtraBold.ttf', fontWeight: 800 },
    ],
  });
  ```
- [ ] **폰트 파일 배치** — `public/fonts/` 디렉토리:
  ```
  public/fonts/
  ├── NanumGothic-Regular.ttf    (~4MB)
  ├── NanumGothic-Bold.ttf       (~4MB)
  ├── NanumGothic-ExtraBold.ttf  (~4MB)
  ├── NanumMyeongjo-Regular.ttf  (~7MB)
  ├── NanumMyeongjo-Bold.ttf     (~7MB)
  └── NanumMyeongjo-ExtraBold.ttf(~7MB)
  → 합계 ~33MB
  ```
- [ ] **Vercel Functions 번들 크기 검증**:
  - Vercel Serverless Functions 한도: **50MB** (uncompressed)
  - 폰트 파일 ~33MB + Next.js 런타임 ~10MB = ~43MB → **한도 이내** (여유 7MB)
  - **위험 관리**: ExtraBold Weight 제외 시 ~20MB 절감 가능 (ExtraBold 사용 빈도 낮으면 제거)
  - 빌드 후 `vercel inspect` 또는 `.vercel/output/functions/` 크기 확인
- [ ] **폰트 파일 소스**: Google Fonts 공식 다운로드 페이지에서 `.ttf` 직접 다운로드
  - 또는 `npm install @fontsource/nanum-gothic @fontsource/nanum-myeongjo` (CSS 포함 — 웹용)
  - PDF 용은 `.ttf` 파일 직접 필요 (CSS 불가)
- [ ] **SIL OFL 1.1 라이선스 파일** — `public/fonts/LICENSE_OFL.txt` 포함 (라이선스 준수)

### 번들 크기 최적화 (한도 초과 시)
- [ ] **전략 A**: ExtraBold 제거 → ~20MB 절감 (Bold 만으로 충분한 경우)
- [ ] **전략 B**: 폰트 파일을 Supabase Storage 에 호스팅 + URL 기반 로드:
  ```ts
  Font.register({
    family: 'NanumGothic',
    src: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/fonts/NanumGothic-Regular.ttf`,
  });
  ```
  - 장점: Functions 번들 0MB 추가
  - 단점: PDF 생성 시 네트워크 요청 추가 (~200ms)
- [ ] **전략 C**: `woff2` 서브셋 활용 (한국어 빈용 2,350자 + 기본 라틴) → 파일당 ~500KB:
  - `pyftsubset` 도구로 한국어 빈용 글리프만 추출
  - 교안 PDF 의 어휘 범위가 제한적이므로 실용적
  - 단, 비빈용 글자 누락 위험 → 안전하지 않으면 전체 폰트 유지

### 검증 항목
- [ ] **웹 페이지 검증**: LCP 에 폰트 영향 확인 (FOUT/FOIT). `display: 'swap'` 으로 FOUT 허용
- [ ] **PDF 렌더 검증**: 한글 5,000자 + 특수문자 + 숫자가 포함된 테스트 PDF 생성 → 글리프 누락 0건
- [ ] **외부 CDN 0건 검증**: 빌드 후 `grep -r "fonts.googleapis.com" .next/` → 0건 (NF-SEC-003 과 정합)
- [ ] **Functions 번들 크기 측정**: `vercel build` → `.vercel/output/functions/` 크기 확인 → 50MB 이내

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 웹 페이지 — 나눔바른고딕 정상 렌더
- **Given**: `next/font/google` 등록 완료
- **When**: 레슨 페이지 로드
- **Then**: 제목·라벨에 나눔바른고딕 적용. DevTools Computed Style 확인. FOUT (flash of unstyled text) 0.1초 이내

### Scenario 2: 웹 페이지 — 나눔명조 본문 적용
- **Given**: 레슨 스크립트 영역
- **When**: 스크립트 토글 활성화
- **Then**: 본문 텍스트에 나눔명조 적용. 가독성 우수 (line-height 1.6)

### Scenario 3: PDF — 한글 정상 렌더
- **Given**: `@react-pdf/renderer` + `Font.register()` 완료
- **When**: `renderTeacherKitPdf(lesson, questions)` 호출 (FW-PDF-002)
- **Then**: PDF 내 모든 한글 텍스트 정상. **글리프 누락 0건** (□ 문자 0건)

### Scenario 4: PDF — 나눔바른고딕 Bold 제목
- **Given**: PDF 머리글에 레슨 제목
- **When**: PDF 열기
- **Then**: 제목이 나눔바른고딕 Bold 18pt 로 렌더. 시각적 구분 명확

### Scenario 5: Vercel Functions 번들 — 50MB 이내
- **Given**: 폰트 파일 포함 빌드
- **When**: `vercel build` 실행
- **Then**: `.vercel/output/functions/` 크기 ≤ 50MB. 경고 없음

### Scenario 6: 외부 CDN 의존 0건
- **Given**: 빌드 완료
- **When**: `grep -r "fonts.googleapis.com\|fonts.gstatic.com" .next/`
- **Then**: 매칭 0건. `next/font/google` 의 self-hosting 동작 검증

### Scenario 7: SIL OFL 1.1 라이선스 포함
- **Given**: `public/fonts/LICENSE_OFL.txt`
- **When**: 파일 존재 확인
- **Then**: SIL OFL 1.1 전문 포함. CC BY-NC-SA 4.0 과 호환

### Scenario 8: LCP 영향 — p95 ≤ 1.5초 유지
- **Given**: 폰트 로드 포함 LCP 측정
- **When**: Lighthouse CI (TS-LOAD-003)
- **Then**: LCP p95 ≤ 1.5초 (REQ-NF-002). `display: 'swap'` 으로 렌더 차단 없음

### Scenario 9: 한글 특수 글리프 — ㄱ~ㅎ, ㅏ~ㅣ, 단자모
- **Given**: 한글 자모 (ㄱ, ㅎ, ㅏ 등) + 특수 기호 (₩, %, ° 등) 포함 텍스트
- **When**: PDF 렌더
- **Then**: 모든 글리프 정상. 대체 문자 (□, ?) 0건

### Scenario 10: 번들 초과 시 — ExtraBold 제거 폴백
- **Given**: 전체 폰트 포함 시 50MB 초과
- **When**: ExtraBold weight 3종 제거
- **Then**: 번들 ~30MB 로 감소. Bold 로 대체. 시각적 차이 최소

## :gear: Technical & Non-Functional Constraints
- **폰트 선택 근거 (§6.2.4)**:
  - 나눔바른고딕: 제목·라벨·OX 문항 (고딕 계열 — 가독성 우수, 강조)
  - 나눔명조: 본문·해설 (명조 계열 — 장문 가독성, 인쇄 친화)
- **라이선스**: SIL OFL 1.1 — 무료 배포·수정·임베디드 허용. CC BY-NC-SA 4.0 호환
- **폰트 로딩 전략**:
  - 웹: `next/font/google` + `display: 'swap'` → self-hosting + FOUT 허용
  - PDF: `@react-pdf/renderer` `Font.register()` + `.ttf` 직접 로드
- **번들 크기 예산**:
  - 폰트 6종 × ~5MB avg = ~33MB
  - Next.js 런타임 ~10MB
  - 합계 ~43MB (한도 50MB — 여유 7MB)
  - 안전 마진 확보 위해 ExtraBold 제거 검토 → ~20MB 절감
- **서브셋 정책**: 전체 한국어 글리프 유지 (PDF 에서 예측 불가 글자 사용). 웹은 `next/font` 자동 서브셋
- **preload 정책**: `preload: true` — 한국 사용자 100% 대상이므로 한글 폰트 즉시 로드
- **fallback 폰트**: `sans-serif` / `serif` (시스템 폰트) — FOUT 기간 동안 시스템 폰트 표시
- **금지**:
  - `@import url('https://fonts.googleapis.com/...')` 직접 사용 (외부 CDN 의존)
  - 웹폰트 CDN (Adobe Fonts, Typekit 등)
  - 라이선스 미포함 폰트 사용 (저작권 위반)
  - `font-display: block` (렌더 차단 → LCP 악화)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `next/font/google` 나눔바른고딕·나눔명조 등록 (layout.tsx)
- [ ] CSS 변수 (`--font-gothic`, `--font-myeongjo`) 정의 (globals.css)
- [ ] `@react-pdf/renderer` `Font.register()` — 6종 폰트 (lib/pdf/fonts.ts)
- [ ] `public/fonts/` 디렉토리에 `.ttf` 6종 + `LICENSE_OFL.txt`
- [ ] Vercel Functions 번들 ≤ 50MB 검증 (`vercel build` 후 측정)
- [ ] 외부 CDN 0건 검증 (`grep` 정적 분석)
- [ ] PDF 한글 렌더 — 글리프 누락 0건 검증
- [ ] LCP p95 ≤ 1.5초 유지 검증 (Lighthouse)
- [ ] PR 본문에 "나눔 폰트 SIL OFL 1.1 + self-hosting + PDF 번들 포함" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-VC-001 (Vercel 프로젝트 — Functions 번들 환경)
- **Blocks**:
  - FW-PDF-001 (Renderer — 폰트 등록 의존)
  - FW-PDF-002 (PDF 템플릿 — 나눔바른고딕·나눔명조 사용)
  - FR-LES-003 (레슨 시청 페이지 — 웹 폰트 사용)
  - FR-LES-004 (글로 읽기 토글 — 나눔명조 본문)
  - NF-SEC-003 (외부 폰트·스크립트 최소화 감사)
  - TS-LOAD-003 (Lighthouse CI — LCP 폰트 영향)
- **Related**:
  - REQ-NF-020 (외부 CDN 최소화)
  - §6.2.4 (PDF 폰트 사양)
  - SIL OFL 1.1 라이선스
