# [Test] TS-E2E-008: PDF QR 코드 스캔 가능 해상도 검증

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Test] TS-E2E-008: PDF QR 코드 스캔 가능 해상도 검증 — 자동 해상도 체크 + 수동 스캔 QA"
labels: 'test, e2e, pdf, qr-code, accessibility, priority:medium, mvp-soft, private-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-E2E-008] 교안 PDF 내 QR 코드 스캔 가능 해상도 검증
- **목적**: REQ-FUNC-019 (교안 PDF 에 포함된 QR 코드가 모바일로 스캔 가능) 를 검증. QR 코드는 해당 레슨의 웹 페이지 URL 을 인코딩하며, 인쇄 후 교실에서 스마트폰 카메라로 스캔하여 즉시 접근. 최소 해상도 200×200px (300DPI A4 기준 ~25mm×25mm), 명도 대비 충분.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-019 (QR 스캔 가능)
- 선행: FW-PDF-002 (PDF 템플릿 — QR 삽입)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **자동 해상도 검증** — `tests/e2e/pdf-qr-resolution.spec.ts`:
  ```ts
  import { test, expect } from '@playwright/test';
  import { createCanvas } from 'canvas';
  import jsQR from 'jsqr';
  import * as pdfjs from 'pdfjs-dist';

  test('PDF QR 코드 해상도 ≥ 200×200px + 스캔 가능', async () => {
    // 1. PDF 다운로드
    const pdfBuffer = await fetch(`${BASE_URL}/api/teacher/kit/L001`).then(r => r.arrayBuffer());

    // 2. PDF → 이미지 변환 (300DPI)
    const pdf = await pdfjs.getDocument({ data: pdfBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 300 / 72 }); // 300DPI
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    // 3. QR 코드 디코딩
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const qr = jsQR(imageData.data, imageData.width, imageData.height);

    expect(qr).not.toBeNull();
    expect(qr!.data).toContain('/lessons/L001'); // URL 정합

    // 4. QR 크기 검증 (≥ 200×200px at 300DPI)
    const qrWidth = qr!.location.bottomRightCorner.x - qr!.location.topLeftCorner.x;
    const qrHeight = qr!.location.bottomRightCorner.y - qr!.location.topLeftCorner.y;
    expect(qrWidth).toBeGreaterThanOrEqual(200);
    expect(qrHeight).toBeGreaterThanOrEqual(200);
  });
  ```
- [ ] **수동 스캔 QA 체크리스트** — `docs/qa/pdf-qr-scan.md`:
  1. L001 PDF 인쇄 (A4 흑백)
  2. iOS 카메라 앱으로 QR 스캔 → URL 열림 확인
  3. Android 카메라 앱으로 QR 스캔 → URL 열림 확인
  4. 거리 30cm 에서 스캔 성공 확인
  5. 환경광 어두운 상태에서도 스캔 가능
- [ ] **10편 일괄 검증** — L001~L010 전체 PDF QR 스캔

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: QR 디코딩 성공
- **Given**: L001 PDF → **Then**: jsQR 디코딩 성공 + URL 포함

### Scenario 2: QR 크기 ≥ 200×200px
- **Given**: 300DPI 렌더 → **Then**: QR 영역 ≥ 200×200px

### Scenario 3: URL 정합
- **Given**: QR 디코딩 → **Then**: `/lessons/L001` 포함

### Scenario 4: 10편 일괄 통과
- **Given**: L001~L010 → **Then**: 10편 모두 QR 디코딩 성공

### Scenario 5: 수동 스캔 — iOS
- **Given**: 인쇄 PDF + iPhone → **Then**: 카메라 스캔 성공

### Scenario 6: 수동 스캔 — Android
- **Given**: 인쇄 PDF + Android → **Then**: 카메라 스캔 성공

### Scenario 7: 명도 대비 충분
- **Given**: QR 영역 → **Then**: 흑백 대비 (밝기 차 ≥ 128)

### Scenario 8: 흑백 인쇄 후 스캔
- **Given**: 흑백 프린터 → **Then**: 스캔 성공

## :gear: Technical & Non-Functional Constraints
- **QR 최소 크기**: 200×200px at 300DPI (~25mm×25mm 실물)
- **디코딩 라이브러리**: `jsqr` (Node.js), `zxing` (대안)
- **PDF 렌더링**: `pdfjs-dist` → Canvas 변환
- **수동 QA 필수**: 자동 디코딩은 인쇄 품질 반영 불가. 실제 인쇄+스캔 수동 QA 병행
- **금지**: QR 코드에 개인정보 인코딩 (URL 만)

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 통과
- [ ] 자동 해상도 검증 스크립트 구현
- [ ] 수동 스캔 QA 체크리스트 문서
- [ ] 10편 일괄 검증 통과
- [ ] PR 본문에 "REQ-FUNC-019 QR 스캔 검증. 자동+수동" 명시

## :construction: Dependencies & Blockers
- **Depends on**: FW-PDF-002 (PDF 템플릿 — QR 삽입)
- **Blocks**: 없음
- **Related**: REQ-FUNC-019, Story 3 (장은혜 — 교안 PDF)
