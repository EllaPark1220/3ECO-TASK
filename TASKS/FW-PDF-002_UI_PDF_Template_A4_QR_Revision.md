# [Feature] FW-PDF-002: A4 2~3p 교안 PDF 템플릿 + QR 코드 + 개정이력 자동 삽입

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-PDF-002: A4 2~3p 템플릿 + QR 코드 + 개정이력 자동 삽입 + CC 라이선스 푸터"
labels: 'feature, backend, pdf, template, priority:critical, mvp-in, private-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-PDF-002] A4 2~3페이지 교안 PDF 템플릿 컴포넌트 — 머리글(레슨ID·제목·개정일·CC뱃지) + 학습 목표 박스 + 영상 QR 코드 + 본문 발췌 + OX 문항 + 개정 이력 + 라이선스 푸터
- **목적**: 장은혜 페르소나의 P14·P13 Pain (학생 자기학습 경로 부재 + 수업 준비 시간 부담) 을 한국 교사 관행에 이질감 없는 단일 원전 PDF 로 해소한다. REQ-FUNC-013 (단일 PDF) · REQ-FUNC-015 (출처·갱신일·개정이력 100% 자동 삽입) · REQ-FUNC-019 (QR 코드) · REQ-FUNC-037 (CC 라이선스 명시 3곳 중 1곳) 을 단일 템플릿에서 충족.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#6.2.4` — Teacher Kit PDF 양식 규격 (전체)
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-013, 015, 019 AC
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-037 (CC 라이선스 3곳 명시)
  - `/docs/SRS_V0_9.md#3.4.2` — 교안 PDF 다운로드 시퀀스
  - `/docs/SRS_V0_9.md#5.1` — TC-013, TC-015, TC-019, TC-037
- 페르소나: SH-05 장은혜 (중학 사회 36세 · P14·P13)
- 선행: FW-PDF-001 (폰트 등록 + Renderer 인프라)
- 디자인 참고: 한국 공교육 교안 표준 (제목 18pt 고딕 / 본문 11pt 명조)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/teacher/kit/[id]/components/TeacherKitPdf.tsx` (또는 `lib/pdf/templates/TeacherKit.tsx`) — `@react-pdf/renderer` 의 `Document` + `Page` 컴포넌트 정의
- [ ] **A4 페이지 설정**:
  - `<Page size="A4" style={{ padding: 18mm 18mm 20mm 20mm }}>` (좌우 18mm · 상하 20mm)
  - 페이지 수 2~3p (레슨 분량에 따라 자동 분할)
- [ ] **p.1 머리글 영역**:
  - 좌측: 레슨 ID (`L001`) + 제목 (나눔바른고딕 Bold 18pt) + 모듈명 (10pt)
  - 우측: 개정일 (`revision_last_updated`, `YYYY-MM-DD`) + CC BY-NC-SA 4.0 뱃지
  - 메타 정보는 나눔바른고딕 Regular 10pt
- [ ] **p.1 학습 목표 박스**:
  - 테두리 박스 안 "이 차시 이해 목표" 헤더 + 2~3줄 목표
  - 나눔바른고딕 11pt
  - 박스 padding 8pt, border 0.5pt
- [ ] **p.1 영상 접근 영역**:
  - 좌측: 유튜브 영상 URL (`https://youtu.be/{youtube_video_id}`) + 예상 시청 시간
  - 우측: **QR 코드 이미지** (`qrcode` npm 라이브러리로 생성)
  - QR 코드 크기 30×30mm. 인쇄 시 스캔 가능 해상도
- [ ] **QR 코드 생성 로직**:
  - `npm install qrcode`
  - `await QRCode.toDataURL(youtubeUrl, { errorCorrectionLevel: 'M', width: 200 })` → base64 PNG
  - `<Image src={dataUrl} style={{ width: 30mm, height: 30mm }}>` 로 PDF 임베디드
- [ ] **p.2 본문 발췌 영역**:
  - 스크립트 핵심 구절 발췌 (5~7개 문단)
  - **나눔명조 11pt** (장문 본문)
  - 문단별 line-height 1.4
  - 한국 맥락 예시 1개 이상 포함 (REQ-FUNC-008 — 편집 시점 SOP 가 보장)
- [ ] **p.2~3 OX 문항 영역**:
  - 문항 번호 + 지문 (나눔바른고딕 11pt)
  - 정답 + 해설 (나눔명조 10.5pt)
  - **OxQuestion.scrollAnchor 와 매핑되는 본문 위치 표시** ("본문 §3 참조" 같은 cross-reference)
- [ ] **마지막 페이지 푸터 영역**:
  - 개정 이력 (`revision_notes`) — 박스로 강조
  - 출처 — "경제 판단력 교과서 · {URL}"
  - **CC BY-NC-SA 4.0 라이선스 전문 링크** (REQ-FUNC-037 의 3곳 중 1곳)
  - 페이지 번호 (`Page X of Y`)
- [ ] **그레이스케일 호환** — 모든 색상이 흑백 인쇄에서 구분 가능. 포인트 컬러는 CC 뱃지 1개로 제한
- [ ] **줄바꿈 처리** — 한국어 단어 단위 wrap (CJK 조판 규칙). `<Text>` 의 `wrap` 속성 검토
- [ ] **렌더 함수 시그니처**:
  ```ts
  export async function renderTeacherKitPdf(lesson: Lesson, oxQuestions: OxQuestion[]): Promise<Buffer> {
    return await renderToBuffer(<TeacherKitDocument lesson={lesson} questions={oxQuestions} />);
  }
  ```
- [ ] FR-PDF-001 (다운로드 API) 가 본 함수를 호출하도록 인터페이스 노출

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 PDF 생성 — 모든 영역 포함
- **Given**: Lesson L001 (`title`, `youtubeVideoId`, `script`, `revisionLastUpdated`, `revisionNotes`) + OxQuestion 5개
- **When**: `renderTeacherKitPdf(lesson, questions)` 호출
- **Then**: 2~3페이지 PDF 생성. 머리글·학습 목표·영상 QR·본문·OX·개정이력·CC 라이선스 푸터 모두 정상 렌더

### Scenario 2: QR 코드 스캔 가능성 (REQ-FUNC-019)
- **Given**: PDF 인쇄 또는 600 DPI 렌더
- **When**: 스마트폰 QR 스캐너로 스캔
- **Then**: 유튜브 영상 URL 정확히 인식. errorCorrectionLevel='M' 으로 일부 손상 허용

### Scenario 3: 개정 이력 자동 삽입 (REQ-FUNC-015)
- **Given**: Lesson 의 `revision_last_updated = "2026-04-25"`, `revision_notes = "v1.1: 한국 사례 추가"`
- **When**: PDF 생성
- **Then**: p.1 머리글에 "개정일: 2026-04-25" 표기 + 마지막 페이지에 개정 이력 박스에 v1.1 노트 표기. **하나라도 누락 시 CI Fail** (TS-UT-012 와 정합)

### Scenario 4: CC 라이선스 명시 (REQ-FUNC-037)
- **Given**: PDF 생성
- **When**: 푸터 검사
- **Then**: "CC BY-NC-SA 4.0" 텍스트 + 라이선스 전문 URL (`https://creativecommons.org/licenses/by-nc-sa/4.0/`) 노출

### Scenario 5: 한국어 본문 정상 렌더 (FW-PDF-001 의존)
- **Given**: 한글 본문 발췌 텍스트
- **When**: PDF 생성
- **Then**: 나눔명조로 정상 렌더. 글리프 누락 0건. 한국어 줄바꿈이 단어 단위로 자연스러움

### Scenario 6: 그레이스케일 인쇄 호환
- **Given**: 컬러 PDF
- **When**: 흑백 프린터로 출력 (또는 PDF 뷰어의 그레이스케일 모드)
- **Then**: 모든 텍스트·박스·QR 코드 구분 가능. 정보 손실 0건

### Scenario 7: 페이지 분량 — 2~3p
- **Given**: 표준 분량 레슨 (스크립트 5~7문단 + OX 5문항)
- **When**: PDF 생성
- **Then**: 정확히 2 또는 3 페이지 (1p 또는 4p+ 발생 시 템플릿 조정 필요)

### Scenario 8: 외부 로고·광고 부재 (CON-03·05)
- **Given**: PDF 전체
- **When**: 시각 검사
- **Then**: 외부 회사 로고·광고 0건. 자극적 색상 0건. 차분한 톤만 사용

### Scenario 9: OX 해설의 본문 cross-reference
- **Given**: OxQuestion 의 scrollAnchor = "anchor-3"
- **When**: PDF 생성
- **Then**: OX 해설에 "본문 §3 참조" 같은 cross-reference 자동 삽입

### Scenario 10: 빈 revision_notes 처리
- **Given**: Lesson 이 신규 생성된 상태 (revision_notes = null)
- **When**: PDF 생성
- **Then**: 개정 이력 박스에 "최초 발행" 표기 (null silently fail 금지)

## :gear: Technical & Non-Functional Constraints
- **고딕 vs 명조 사용 규칙 (§6.2.4)**:
  - 제목·라벨·OX 문항 → 나눔바른고딕 (11pt 또는 18pt Bold)
  - 본문·해설 → 나눔명조 (11pt 또는 10.5pt)
- **단위 일관성**: A4 규격은 mm 단위. `@react-pdf/renderer` 는 px 기본이므로 변환 헬퍼 정의 (`mm(N)` 함수)
- **줄바꿈 정책**: 한국어 CJK 단어 단위 wrap. `<Text wrap>` 또는 `\n` 명시 필요
- **이미지 임베디드 (QR 코드)**: base64 dataURL 만 사용 (외부 URL 참조 금지 — REQ-NF-020)
- **그레이스케일 호환**: 색상은 정보 전달의 보조 수단으로만 사용. 모든 정보는 텍스트로 충분히 표현
- **CSS-in-JS 스타일**: `@react-pdf/renderer` 의 `StyleSheet.create()` 활용. inline style 최소화
- **렌더 시간**: 단일 PDF 생성 ≤ 1.5초 (warm). REQ-NF-004 의 2초 한도 내
- **PDF 메타데이터**:
  - Title: 레슨 제목
  - Author: "경제 판단력 교과서"
  - Creator: "@react-pdf/renderer"
  - Subject: 모듈명 + 레슨 ID
- **CC 라이선스 표기 위치**: PDF 푸터 1곳. 영상 설명·웹 푸터는 별도 태스크 (CC 라이선스 3곳 = PDF + 영상 + 웹)
- **금지**:
  - 외부 이미지 URL 사용 (CDN 의존)
  - JavaScript 실행 (PDF 보안)
  - 폼 필드·인터랙티브 요소 (단순 정적 PDF)
  - 회사 로고·광고 요소 (CON-03)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `TeacherKitPdf.tsx` 컴포넌트 구현
- [ ] QR 코드 생성 + base64 임베디드 동작
- [ ] 개정 이력 자동 삽입 (TS-UT-012 와 정합)
- [ ] CC 라이선스 푸터 명시 (TS-STATIC-002 의 PDF 측 검증)
- [ ] 그레이스케일 인쇄 호환 시각 검토
- [ ] 페이지 분량 2~3p 일관성 검증 (다양한 레슨 5종으로 테스트)
- [ ] PDF 메타데이터 (Title·Author·Creator·Subject) 검증
- [ ] 렌더 시간 p95 ≤ 1.5초 측정
- [ ] PR 본문에 "Story 3 의 단일 원전 PDF 템플릿. 한국 공교육 표준 정합" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-PDF-001 (Renderer + 폰트 등록 인프라)
  - CT-DB-003 (Lesson 모델 — `revision_last_updated`, `revision_notes`)
  - CT-DB-006 (OxQuestion 모델 — scrollAnchor 활용)
  - CT-DB-007 (TeacherKit 모델)
- **Blocks**:
  - FR-PDF-001 (PDF 다운로드 API — 본 템플릿 호출)
  - FW-PDF-003 (PDF 폴백 — 본 템플릿의 캐시 활용)
  - TS-UT-012 (PDF 메타 검증)
  - TS-IT-004 (PDF 부하 테스트)
  - TS-E2E-007 (장은혜 E2E)
  - TS-E2E-008 (PDF QR 스캔 가능성 검증)
- **Related**:
  - REQ-FUNC-008 (30초 개념 정의 + 한국 예시) 의 콘텐츠 편집 SOP 와 정합
