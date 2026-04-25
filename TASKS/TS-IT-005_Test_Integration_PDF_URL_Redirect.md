# [Feature] TS-IT-005: 구버전 PDF URL 301 리디렉트 — HTTP 검증 + 콘텐츠 갱신 후 호환성

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-IT-005: 구버전 PDF URL 301 리디렉트 통합 테스트 — Lesson 갱신 후 옛 PDF URL → 최신 URL HTTP 301 응답 + 외부 링크 호환"
labels: 'feature, test, integration, pdf, redirect, priority:high, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-IT-005] Lesson 콘텐츠 갱신 (revision 증가) 시 이전 버전 PDF URL 이 최신 URL 로 HTTP 301 영구 리디렉트되는지 통합 검증 — 외부에 공유된 옛 URL (블로그·커뮤니티 링크) 의 호환성 보장
- **목적**: REQ-FUNC-029 (PDF URL 영속성) 의 운영 신뢰성. 콘텐츠 갱신마다 PDF 파일명이 바뀌면 외부 공유 링크가 끊어지는 문제 → SEO 손실 + 사용자 신뢰 저하. **301 영구 리디렉트** 로 검색엔진 점수 보존 + 사용자 경험 보존.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.6` — REQ-FUNC-029 (PDF URL 영속성)
  - `/docs/SRS_V0_9.md#3.4.2` — PDF 다운로드 시퀀스
- 외부: HTTP 301 (Moved Permanently)
- 선행: FR-PDF-001 (PDF 다운로드), FW-PDF-001 (PDF 생성), CT-DB-003 (Lesson — revision)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/integration/pdf-redirect.test.ts`
- [ ] **PDF URL 정책 — revision 기반 또는 lessonId 기반**:
  - 본 태스크는 **`/teacher-kit/{lessonId}.pdf`** 표준 (lessonId 영속)
  - revision 정보는 PDF 메타에 포함 (TS-UT-012 정합)
  - 즉 단일 URL 항상 최신 PDF 반환 — **301 리디렉트 부재가 정상**
- [ ] **변경 시 정책 — 옛 lesson_id 폐기 시점 (Stage 2)**:
  - lessonId 변경 → 별도 lesson 으로 취급 (TS-UT-008 의 불변성)
  - 본 태스크의 301 시나리오 — **legacy URL 패턴 → 표준 URL** (예: `/pdf/L001.pdf` → `/teacher-kit/L001.pdf`)
- [ ] **시나리오 1 — legacy URL 301 → 표준 URL**:
  ```ts
  it('legacy URL /pdf/L001.pdf → /teacher-kit/L001.pdf 301', async () => {
    const response = await fetch('/pdf/L001.pdf', { redirect: 'manual' });
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('/teacher-kit/L001.pdf');
  });
  ```
  - Next.js redirects 정책 — `next.config.ts` 의 redirects 함수 활용
- [ ] **시나리오 2 — 표준 URL 200**:
  ```ts
  it('표준 URL /teacher-kit/L001.pdf — 200 + Content-Type pdf', async () => {
    const response = await fetch('/teacher-kit/L001.pdf');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/application\/pdf/);
  });
  ```
- [ ] **시나리오 3 — 잘못된 lessonId — 404**:
  ```ts
  it('미존재 lesson — 404', async () => {
    const response = await fetch('/teacher-kit/L999.pdf');
    expect(response.status).toBe(404);
  });
  ```
- [ ] **시나리오 4 — Lesson 갱신 후 동일 URL 최신 PDF 반환**:
  ```ts
  it('Lesson 갱신 후 동일 URL 최신 PDF 반환', async () => {
    // 1차 요청
    const first = await fetch('/teacher-kit/L001.pdf');
    const firstBuffer = await first.arrayBuffer();

    // Lesson 갱신 (revision_last_updated 갱신)
    await prismaTest.lesson.update({
      where: { lessonId: 'L001' },
      data: { script: '갱신된 본문', revisionLastUpdated: new Date() },
    });

    // 캐시 무효화 (FR-PDF-001 의 정책 활용)
    await fetch('/api/pdf/invalidate', { method: 'POST', headers: signInAs('admin1'),
      body: JSON.stringify({ lesson_id: 'L001' }) });

    // 2차 요청 — 동일 URL
    const second = await fetch('/teacher-kit/L001.pdf');
    const secondBuffer = await second.arrayBuffer();

    // PDF 내용은 다름 (갱신됨)
    expect(secondBuffer.byteLength).not.toBe(firstBuffer.byteLength);  // 갱신
    expect(second.status).toBe(200);
  });
  ```
- [ ] **시나리오 5 — 301 의 캐시 정책 — Cache-Control**:
  ```ts
  it('301 응답 — Cache-Control: max-age=31536000 (1년)', async () => {
    const response = await fetch('/pdf/L001.pdf', { redirect: 'manual' });
    expect(response.status).toBe(301);
    expect(response.headers.get('cache-control')).toMatch(/max-age=\d+/);
    // 영구 리디렉트라 1년 캐시 권장
  });
  ```
- [ ] **시나리오 6 — 다중 legacy 패턴 지원**:
  ```ts
  it('다중 legacy 패턴 — /static/pdf/, /downloads/ 등도 리디렉트', async () => {
    const patterns = [
      ['/static/pdf/L001.pdf', '/teacher-kit/L001.pdf'],
      ['/downloads/L001.pdf', '/teacher-kit/L001.pdf'],
    ];
    for (const [legacy, standard] of patterns) {
      const response = await fetch(legacy, { redirect: 'manual' });
      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(standard);
    }
  });
  ```
- [ ] **시나리오 7 — 표준 URL → 표준 URL 리디렉트 무한 루프 방지**:
  ```ts
  it('표준 URL 자기 참조 리디렉트 부재', async () => {
    const response = await fetch('/teacher-kit/L001.pdf', { redirect: 'manual' });
    expect(response.status).not.toBe(301);  // 200 또는 404
  });
  ```
- [ ] **시나리오 8 — sitemap.xml 의 PDF URL 도 표준 URL**:
  ```ts
  it('sitemap.xml — PDF URL 표준 패턴만', async () => {
    const response = await fetch('/sitemap.xml');
    const text = await response.text();
    // legacy 패턴 부재
    expect(text).not.toMatch(/\/pdf\/L\d+\.pdf/);
    expect(text).not.toMatch(/\/static\/pdf/);
    expect(text).not.toMatch(/\/downloads/);
    // 표준 패턴 포함
    expect(text).toMatch(/\/teacher-kit\/L\d{3}\.pdf/);
  });
  ```
- [ ] **시나리오 9 — 외부 검색엔진 시뮬레이션 — User-Agent: Googlebot**:
  ```ts
  it('Googlebot 의 legacy URL 접근 — 301 정상', async () => {
    const response = await fetch('/pdf/L001.pdf', {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    });
    expect(response.status).toBe(301);
    // SEO 점수 보존을 위해 301 (영구) 가 정상. 302 (임시) 는 부적절
  });
  ```
- [ ] **시나리오 10 — 응답 시간 — 301 ≤ 50ms (단순 Redirect)**:
  ```ts
  it('응답 시간 301 ≤ 50ms', async () => {
    const start = Date.now();
    await fetch('/pdf/L001.pdf', { redirect: 'manual' });
    expect(Date.now() - start).toBeLessThan(50);
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: legacy URL 301
- **Given**: /pdf/L001.pdf
- **When**: GET
- **Then**: 301 + Location: /teacher-kit/L001.pdf

### Scenario 2: 표준 URL 200
- **Given**: 표준 URL
- **When**: GET
- **Then**: 200 + application/pdf

### Scenario 3: 미존재 lesson 404
- **Given**: L999
- **When**: GET
- **Then**: 404

### Scenario 4: 갱신 후 최신 PDF
- **Given**: Lesson 갱신
- **When**: 동일 URL 재요청
- **Then**: 최신 PDF + 200

### Scenario 5: 301 Cache-Control
- **Given**: 301 응답
- **When**: 헤더
- **Then**: max-age=31536000

### Scenario 6: 다중 legacy 패턴
- **Given**: /static/pdf, /downloads 등
- **When**: GET
- **Then**: 모두 301 → 표준

### Scenario 7: 자기 참조 무한 루프 부재
- **Given**: 표준 URL
- **When**: GET
- **Then**: 200 또는 404 (301 아님)

### Scenario 8: sitemap 표준 URL
- **Given**: sitemap.xml
- **When**: 검사
- **Then**: legacy 패턴 0 + 표준만

### Scenario 9: Googlebot 301
- **Given**: User-Agent
- **When**: GET
- **Then**: 301 정상

### Scenario 10: 응답 시간 ≤ 50ms
- **Given**: 301
- **When**: 측정
- **Then**: ≤ 50ms

## :gear: Technical & Non-Functional Constraints
- **Next.js redirects (next.config.ts) 정책**: 다중 legacy 패턴 정의
- **301 영구 — Cache-Control 1년**: SEO 점수 보존
- **단일 표준 URL — `/teacher-kit/{lessonId}.pdf`**: 영속성 보장
- **lessonId 불변 (TS-UT-008 정합)**: URL 안정성 기반
- **갱신 시 동일 URL 최신 PDF**: 캐시 무효화 (FR-PDF-001 의 정책)
- **sitemap.xml 표준 URL 만**
- **응답 시간 ≤ 50ms (Edge Redirect)**
- **자기 참조 무한 루프 부재**: 정책 검증 의무
- **금지**:
  - 302 (임시) 사용 (SEO 손실)
  - 다중 표준 URL (혼란)
  - sitemap 의 legacy 패턴 노출
  - 자기 참조 리디렉트

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] next.config.ts 의 redirects 함수
- [ ] 301 + Cache-Control 1년
- [ ] 다중 legacy 패턴 매핑
- [ ] sitemap 표준 URL 검증
- [ ] 자기 참조 부재 검증
- [ ] 응답 시간 ≤ 50ms
- [ ] CI 통합
- [ ] PR 본문에 "REQ-FUNC-029 PDF URL 영속성 + SEO 보존" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-PDF-001 (PDF 다운로드)
  - FW-PDF-001 (생성)
  - CT-DB-003 (Lesson)
  - TS-UT-008 (lessonId 불변)
  - next.config.ts redirects
- **Blocks**:
  - REQ-FUNC-029 운영 신뢰성
  - 외부 공유 링크 호환
  - SEO 점수 보존
- **Related**:
  - sitemap.xml 정책
