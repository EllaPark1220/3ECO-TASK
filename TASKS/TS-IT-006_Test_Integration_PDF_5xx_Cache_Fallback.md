# [Feature] TS-IT-006: PDF 5xx 카오스 — 캐시 폴백 동작 검증

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] TS-IT-006: PDF 라우트 5xx 카오스 시 IF-CACHE-001 캐시 폴백 동작 통합 + 사용자 PDF 다운로드 차단 0"
labels: 'feature, test, integration, pdf, chaos, resilience, priority:high, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [TS-IT-006] PDF 생성 라우트 (FW-PDF-001) 또는 본 사이트 자체가 5xx 장애일 때 IF-CACHE-001 (Vercel Edge + Supabase Storage 2단 캐시) 폴백 동작 통합 검증 — 사용자 PDF 다운로드 차단 0 + 캐시 HIT 우선
- **목적**: REQ-NF-007 (PDF p95 ≤2초) + 회복탄력성. 단일 제작자 환경 (R7 외부 의존) 에서 한 컴포넌트 장애가 전체 서비스 차단을 초래하지 않도록 카오스 검증. **Antigravity 그룹 7 의 IF-CACHE-001~002 와 정합** — 본 통합 테스트는 캐시 정책 정상 동작 검증.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-007 (PDF p95 ≤2초)
  - `/docs/SRS_V0_9.md#4.2.2` — REQ-NF-009 (Resilience)
  - `/docs/SRS_V0_9.md#6.6` — R7 (외부 의존)
- 외부: Chaos Engineering 의 simulated 5xx
- 선행: FW-PDF-001 (PDF 생성), IF-CACHE-001 (캐시, Antigravity 그룹 7), FR-PDF-001 (다운로드)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **테스트 파일** — `__tests__/integration/pdf-fallback-cache.test.ts`
- [ ] **카오스 mock — PDF 생성 라우트 5xx 시뮬레이션**:
  ```ts
  import { vi } from 'vitest';
  vi.mock('@/lib/pdf/generator', () => ({
    generatePdf: vi.fn().mockImplementation(async () => {
      throw new Error('PDF generation 5xx (chaos)');
    }),
  }));
  ```
- [ ] **시나리오 1 — 캐시 HIT — 정상 PDF 반환 (5xx 무관)**:
  ```ts
  it('캐시 HIT — 정상 PDF 반환 (생성 5xx 무관)', async () => {
    // 1. 사전 캐시 시드 — Supabase Storage 에 PDF 존재
    await seedCachedPdf('L001');

    // 2. 다운로드 요청
    const response = await fetch('/teacher-kit/L001.pdf', { headers: signInAs('u1') });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/application\/pdf/);
    expect(response.headers.get('x-cache')).toBe('HIT');  // 캐시 출처 명시 (선택)
  });
  ```
- [ ] **시나리오 2 — 캐시 MISS + 생성 정상 — 200 + 캐시 INSERT**:
  ```ts
  it('캐시 MISS + 생성 정상 — PDF 반환 + 캐시 INSERT', async () => {
    // generatePdf mock 정상 동작
    (generatePdf as any).mockResolvedValueOnce(Buffer.from('mock-pdf-data'));

    const response = await fetch('/teacher-kit/L002.pdf', { headers: signInAs('u1') });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-cache')).toBe('MISS');

    // 후속 요청은 캐시 HIT
    const second = await fetch('/teacher-kit/L002.pdf', { headers: signInAs('u1') });
    expect(second.headers.get('x-cache')).toBe('HIT');
  });
  ```
- [ ] **시나리오 3 — 캐시 MISS + 생성 5xx — 503 또는 fallback 정책**:
  ```ts
  it('캐시 MISS + 생성 5xx — 503 + Sentry 알림', async () => {
    // L003 — 캐시 부재 + 생성 mock 실패
    (generatePdf as any).mockRejectedValueOnce(new Error('5xx chaos'));
    const sentrySpy = vi.spyOn(Sentry, 'captureException');

    const response = await fetch('/teacher-kit/L003.pdf', { headers: signInAs('u1') });
    expect(response.status).toBe(503);  // 또는 fallback HTML 페이지

    expect(sentrySpy).toHaveBeenCalled();
  });
  ```
- [ ] **시나리오 4 — Vercel Edge 캐시 HIT — Supabase Storage 미접근**:
  ```ts
  it('Edge 캐시 HIT — Supabase 호출 0', async () => {
    await seedCachedPdf('L001');  // Supabase + Edge 모두 캐시
    const supabaseSpy = vi.spyOn(supabaseStorage, 'download');

    await fetch('/teacher-kit/L001.pdf', { headers: signInAs('u1') });
    await fetch('/teacher-kit/L001.pdf', { headers: signInAs('u1') });  // 2번째 — Edge HIT

    expect(supabaseSpy).toHaveBeenCalledTimes(1);  // 첫 호출만. 두 번째는 Edge 에서
  });
  ```
- [ ] **시나리오 5 — Supabase Storage 5xx + Edge 캐시 부재 — 503**:
  ```ts
  it('두 캐시 모두 5xx — 503', async () => {
    vi.spyOn(supabaseStorage, 'download').mockRejectedValueOnce(new Error('Supabase 5xx'));
    (generatePdf as any).mockRejectedValueOnce(new Error('Generator 5xx'));

    const response = await fetch('/teacher-kit/L004.pdf', { headers: signInAs('u1') });
    expect(response.status).toBe(503);
  });
  ```
- [ ] **시나리오 6 — 응답 시간 — 캐시 HIT ≤ 200ms (REQ-NF-007 정합)**:
  ```ts
  it('캐시 HIT 응답 시간 ≤ 200ms', async () => {
    await seedCachedPdf('L001');

    const durations: number[] = [];
    for (let i = 0; i < 50; i++) {
      const start = Date.now();
      await fetch('/teacher-kit/L001.pdf', { headers: signInAs('u1') });
      durations.push(Date.now() - start);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)];
    expect(p95).toBeLessThanOrEqual(200);
  });
  ```
- [ ] **시나리오 7 — 캐시 무효화 후 — 최신 콘텐츠 반환**:
  ```ts
  it('캐시 무효화 후 — 최신 PDF 반환', async () => {
    await seedCachedPdf('L001');  // v1 캐시
    (generatePdf as any).mockResolvedValueOnce(Buffer.from('v2-content'));  // 다음 호출은 v2

    // 무효화
    await fetch('/api/pdf/invalidate', { method: 'POST', headers: signInAs('admin1'),
      body: JSON.stringify({ lesson_id: 'L001' }) });

    // 재요청 — v2
    const response = await fetch('/teacher-kit/L001.pdf', { headers: signInAs('u1') });
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.toString()).toBe('v2-content');
  });
  ```
- [ ] **시나리오 8 — 캐시 HIT 비율 측정 (IF-CACHE-002 정합)**:
  ```ts
  it('캐시 HIT 비율 ≥ 95% (IF-CACHE-002 측정)', async () => {
    await seedCachedPdf('L001');
    let hit = 0;
    let miss = 0;
    for (let i = 0; i < 100; i++) {
      const r = await fetch('/teacher-kit/L001.pdf', { headers: signInAs('u1') });
      if (r.headers.get('x-cache') === 'HIT') hit++;
      else miss++;
    }
    expect(hit / (hit + miss)).toBeGreaterThanOrEqual(0.95);
  });
  ```
- [ ] **시나리오 9 — 카오스 후 회복**:
  ```ts
  it('5xx 카오스 → 회복 → 정상', async () => {
    (generatePdf as any).mockRejectedValueOnce(new Error('5xx'));
    let response = await fetch('/teacher-kit/L005.pdf', { headers: signInAs('u1') });
    expect(response.status).toBe(503);

    // 카오스 회복
    (generatePdf as any).mockResolvedValueOnce(Buffer.from('recovered'));
    response = await fetch('/teacher-kit/L005.pdf', { headers: signInAs('u1') });
    expect(response.status).toBe(200);
  });
  ```
- [ ] **시나리오 10 — Sentry 알림 통합**:
  ```ts
  it('두 캐시 + 생성 모두 5xx — Sentry critical 알림', async () => {
    const sentrySpy = vi.spyOn(Sentry, 'captureException');
    vi.spyOn(supabaseStorage, 'download').mockRejectedValueOnce(new Error('5xx'));
    (generatePdf as any).mockRejectedValueOnce(new Error('5xx'));

    await fetch('/teacher-kit/L006.pdf', { headers: signInAs('u1') });

    expect(sentrySpy).toHaveBeenCalled();
  });
  ```

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 캐시 HIT — 5xx 무관
- **Given**: 캐시 시드
- **When**: 다운로드
- **Then**: 200 + x-cache: HIT

### Scenario 2: MISS + 생성 정상
- **Given**: 캐시 부재
- **When**: 생성 정상
- **Then**: 200 + 캐시 INSERT + 후속 HIT

### Scenario 3: MISS + 5xx — 503
- **Given**: 캐시 + 생성 모두 fail
- **When**: 호출
- **Then**: 503 + Sentry

### Scenario 4: Edge HIT — Supabase 0 호출
- **Given**: 두 단 캐시
- **When**: 2번째 호출
- **Then**: Supabase 호출 0

### Scenario 5: 두 캐시 모두 5xx
- **Given**: 카오스
- **When**: 호출
- **Then**: 503

### Scenario 6: HIT 응답 ≤ 200ms
- **Given**: HIT
- **When**: 50건
- **Then**: p95 ≤ 200ms

### Scenario 7: 무효화 후 v2
- **Given**: 무효화 + 새 생성
- **When**: 재요청
- **Then**: v2 반환

### Scenario 8: HIT 비율 ≥ 95%
- **Given**: 100건 요청
- **When**: 측정
- **Then**: ≥ 95%

### Scenario 9: 카오스 회복
- **Given**: 5xx → 정상
- **When**: 재요청
- **Then**: 200

### Scenario 10: Sentry critical
- **Given**: 모든 fail
- **When**: 호출
- **Then**: 알림

## :gear: Technical & Non-Functional Constraints
- **2단 캐시 — Vercel Edge + Supabase Storage**: IF-CACHE-001 정합
- **카오스 mock — 의도적 5xx 시뮬레이션**
- **응답 시간 HIT ≤ 200ms**
- **HIT 비율 ≥ 95% (IF-CACHE-002)**
- **Sentry 알림 critical**: 두 캐시 + 생성 모두 fail 시
- **회복탄력성 검증**: 카오스 → 회복 자동 동작
- **CI 실행 시간 ≤ 30초**
- **금지**:
  - 캐시 무효화 누락 (stale data)
  - 5xx 시 사용자 직접 노출 (UX 손상)
  - HIT 비율 측정 누락

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] 카오스 mock 활용
- [ ] 2단 캐시 동작 검증
- [ ] 응답 시간 + HIT 비율 측정
- [ ] Sentry 알림 통합
- [ ] CI 통합
- [ ] PR 본문에 "REQ-NF-007 회복탄력성 + IF-CACHE-001 폴백" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-PDF-001 (PDF 생성)
  - IF-CACHE-001~002 (Antigravity 그룹 7)
  - FR-PDF-001 (다운로드)
- **Blocks**:
  - REQ-NF-007 운영 검증
  - 회복탄력성 보장
- **Related**:
  - R7 (외부 의존)
  - 운영 SOP — 카오스 발견 시 대응
