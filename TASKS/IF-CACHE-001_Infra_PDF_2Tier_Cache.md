# [Infra] IF-CACHE-001: PDF 2단 캐시 — Vercel Edge Cache + Supabase Storage

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Infra] IF-CACHE-001: PDF 2단 캐시 인프라 — Vercel Edge Cache (L1) + Supabase Storage (L2) + revision 기반 캐시 키"
labels: 'infra, cache, pdf, performance, priority:high, mvp-in, private-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-CACHE-001] PDF 2단 캐시 인프라 — Vercel Edge Cache (L1 · 즉시 응답) + Supabase Storage (L2 · 영구 보존) + `lesson_id + revision_last_updated` 기반 캐시 키
- **목적**: Story 3 (장은혜) 의 교안 PDF 다운로드가 동시 50명 부하에서도 p95 ≤ 2초를 달성하고, 캐시 HIT ≥ 95% 를 유지하도록 한다. FR-PDF-001 (PDF 다운로드 Route Handler) 의 인프라 기반이며, REQ-NF-004 (p95 ≤ 2초) · REQ-NF-049 (캐시 HIT ≥ 95%) 를 충족하는 캐시 아키텍처를 구축한다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#3.6.2` — PDF Cache 컴포넌트 (Vercel Edge + Supabase Storage 2단)
  - `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-004 (PDF 다운로드 p95 ≤ 2초)
  - `/docs/SRS_V0_9.md#4.2.8` — REQ-NF-049 (캐시 HIT ≥ 95%)
  - `/docs/SRS_V0_9.md#3.4.2` — 교안 PDF 다운로드 시퀀스 다이어그램
  - `/docs/SRS_V0_9.md#6.1` — `/api/teacher/kit/{id}` 엔드포인트
- 외부 문서:
  - `https://vercel.com/docs/edge-network/caching`
  - `https://supabase.com/docs/guides/storage`
- 선행: FR-PDF-001 (PDF Route Handler — 본 캐시의 소비자)
- 짝: IF-CACHE-002 (캐시 HIT ≥ 95% 측정 검증)

## :white_check_mark: Task Breakdown (실행 계획)

### L1 — Vercel Edge Cache 설정
- [ ] **Cache-Control 헤더 설계** — FR-PDF-001 의 Route Handler 에서 설정:
  ```ts
  // app/api/teacher/kit/[id]/route.ts
  const headers = new Headers({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${lessonId}_교안.pdf"`,
    // L1 Edge Cache 정책
    'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    'CDN-Cache-Control': 'public, max-age=86400', // Vercel CDN 전용
    'Vercel-CDN-Cache-Control': 'public, max-age=86400', // Vercel 명시
  });
  ```
- [ ] **캐시 키 자동화** — URL 경로가 캐시 키:
  - `/api/teacher/kit/L001` → revision 정보는 URL 에 포함 안함 (쿼리 파라미터로 분리)
  - **revision 기반 cache bust**: `?rev=2026-04-25` 쿼리 파라미터 → revision 변경 시 자동 MISS
  - 또는 URL 경로에 revision 포함: `/api/teacher/kit/L001/2026-04-25` (더 확실한 cache bust)
  - **선택**: 경로 포함 방식 채택 → `/api/teacher/kit/L001/{revision}` (정적 URL = 더 높은 HIT)
- [ ] **Edge Cache 동작 검증**:
  ```
  첫 요청: X-Vercel-Cache: MISS → 동적 생성 → Edge 캐시 저장
  2번째:   X-Vercel-Cache: HIT  → ≤ 100ms 응답
  24시간 후: X-Vercel-Cache: STALE → stale-while-revalidate 응답 (구 캐시 즉시 + 백그라운드 갱신)
  ```
- [ ] **Vary 헤더**: `Vary: Accept-Encoding` (gzip/brotli 분기 — PDF 는 이미 압축이라 효과 제한)

### L2 — Supabase Storage 설정
- [ ] **버킷 생성** — `teacher-kit` Public 버킷:
  ```sql
  -- Supabase Dashboard 또는 SQL
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('teacher-kit', 'teacher-kit', true);
  ```
- [ ] **디렉토리 구조**:
  ```
  teacher-kit/
  ├── L001/
  │   ├── 2026-04-25.pdf
  │   └── 2026-05-01.pdf  ← revision 변경 시 새 파일
  ├── L002/
  │   └── 2026-04-25.pdf
  └── ...
  ```
- [ ] **파일 업로드 헬퍼** — `lib/storage/pdfStorage.ts`:
  ```ts
  import { createClient } from '@supabase/supabase-js';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  export async function uploadPdf(lessonId: string, revision: string, pdfBuffer: Buffer): Promise<string> {
    const path = `${lessonId}/${revision}.pdf`;
    const { error } = await supabase.storage
      .from('teacher-kit')
      .upload(path, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true, // 동일 revision 재생성 시 덮어쓰기
      });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    return path;
  }

  export async function downloadPdf(lessonId: string, revision: string): Promise<Buffer | null> {
    const path = `${lessonId}/${revision}.pdf`;
    const { data, error } = await supabase.storage
      .from('teacher-kit')
      .download(path);

    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  export async function getLatestPdf(lessonId: string): Promise<{ path: string; buffer: Buffer } | null> {
    const { data: files } = await supabase.storage
      .from('teacher-kit')
      .list(lessonId, { sortBy: { column: 'created_at', order: 'desc' }, limit: 1 });

    if (!files || files.length === 0) return null;

    const buffer = await downloadPdf(lessonId, files[0].name.replace('.pdf', ''));
    if (!buffer) return null;

    return { path: `${lessonId}/${files[0].name}`, buffer };
  }
  ```
- [ ] **Storage RLS 정책**:
  ```sql
  -- Public Read (익명 다운로드 허용 — CC BY-NC-SA 4.0)
  CREATE POLICY "Public read teacher-kit" ON storage.objects
  FOR SELECT USING (bucket_id = 'teacher-kit');

  -- Service Role Write (서버만 업로드)
  CREATE POLICY "Service write teacher-kit" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'teacher-kit' AND auth.role() = 'service_role');

  CREATE POLICY "Service update teacher-kit" ON storage.objects
  FOR UPDATE USING (bucket_id = 'teacher-kit' AND auth.role() = 'service_role');
  ```

### 캐시 흐름 통합 (FR-PDF-001 와 정합)
- [ ] **캐시 조회 순서** 구현 — `lib/pdf/cacheResolver.ts`:
  ```ts
  export async function resolveFromCache(
    lessonId: string,
    revision: string
  ): Promise<{ buffer: Buffer; source: 'edge' | 'storage' | 'generated' } | null> {
    // L1: Edge Cache 는 Vercel 이 자동 처리 (Route Handler 도달 = MISS)
    // → Route Handler 에 도달했다면 L1 MISS

    // L2: Supabase Storage 확인
    const storageBuffer = await downloadPdf(lessonId, revision);
    if (storageBuffer) {
      return { buffer: storageBuffer, source: 'storage' };
    }

    // MISS: 동적 생성 필요
    return null;
  }
  ```
- [ ] **캐시 저장 후처리** — 동적 생성 후 Storage 저장:
  ```ts
  // FR-PDF-001 Route Handler 내부
  const pdfBuffer = await renderTeacherKitPdf(lesson, questions);
  await uploadPdf(lessonId, revision, pdfBuffer); // L2 저장
  // L1 은 응답 헤더로 자동 저장
  ```

### 캐시 무효화 정책
- [ ] **revision 변경 = 자동 무효화**: 캐시 키가 `{lessonId}/{revision}` 이므로 revision 변경 시 자연 MISS
- [ ] **수동 무효화**: Supabase Storage 에서 파일 삭제 → L2 MISS. L1 은 `s-maxage` 만료 대기 또는 Vercel Purge API
- [ ] **이전 revision 보존**: 구버전 PDF 는 삭제하지 않음 (FR-PDF-002 구버전 리디렉트 위함)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 첫 요청 — L1 MISS, L2 MISS, 동적 생성 + 저장
- **Given**: L001 revision `2026-04-25`. Edge 캐시 없음, Storage 없음
- **When**: `GET /api/teacher/kit/L001/2026-04-25`
- **Then**: 동적 생성 → Storage 업로드 → 응답. `X-Cache: MISS`. `X-Vercel-Cache: MISS`

### Scenario 2: 두 번째 요청 — L1 HIT (Edge)
- **Given**: Scenario 1 직후 (Edge 캐시 존재)
- **When**: 동일 URL 재요청 (60초 이내)
- **Then**: `X-Vercel-Cache: HIT`. 응답 시간 ≤ 100ms. Route Handler 미실행

### Scenario 3: L1 만료, L2 HIT (Storage)
- **Given**: Edge 캐시 만료 (24시간 경과). Storage 에는 PDF 존재
- **When**: 요청
- **Then**: Route Handler 실행 → Storage 다운로드 → 응답. `X-Cache: STORAGE_HIT`. 응답 ≤ 1.5초

### Scenario 4: revision 변경 — 자동 cache bust
- **Given**: L001 revision `2026-04-25` 캐시 존재. revision 이 `2026-05-01` 로 변경
- **When**: `GET /api/teacher/kit/L001/2026-05-01`
- **Then**: 새 URL → L1 MISS, L2 MISS → 동적 생성. 이전 `2026-04-25.pdf` 는 Storage 보존

### Scenario 5: Storage 업로드 성공 검증
- **Given**: 동적 생성 완료 (Buffer)
- **When**: `uploadPdf('L001', '2026-04-25', buffer)` 호출
- **Then**: Supabase Storage `teacher-kit/L001/2026-04-25.pdf` 파일 존재

### Scenario 6: Storage Public Read — 인증 불필요
- **Given**: `teacher-kit` 버킷 Public
- **When**: 익명 사용자가 Storage URL 직접 접근
- **Then**: PDF 다운로드 가능 (RLS `SELECT` 정책)

### Scenario 7: Storage Write — Service Role 만 허용
- **Given**: 클라이언트 anon key 로 업로드 시도
- **When**: `supabase.storage.from('teacher-kit').upload(...)` (anon key)
- **Then**: 403 Forbidden (RLS 정책)

### Scenario 8: stale-while-revalidate 동작
- **Given**: L1 `s-maxage` 만료 (24시간). `stale-while-revalidate=604800`
- **When**: 요청
- **Then**: 구 캐시 즉시 응답 (STALE) + 백그라운드에서 새 PDF 생성·캐시 갱신

### Scenario 9: 이전 revision 보존 — 구버전 접근 가능
- **Given**: L001 revision `2026-04-25` (구) + `2026-05-01` (신) 모두 Storage 존재
- **When**: `GET /api/teacher/kit/L001/2026-04-25`
- **Then**: 구버전 PDF 정상 응답 (FR-PDF-002 리디렉트 검증)

### Scenario 10: 동시 50명 — p95 ≤ 2초
- **Given**: L1 HIT 상태에서 동시 50명 요청
- **When**: k6 부하 테스트 (TS-IT-004)
- **Then**: p95 ≤ 2초. L1 HIT 시 ≤ 100ms

## :gear: Technical & Non-Functional Constraints
- **2단 캐시 아키텍처**:
  ```
  Client → Vercel Edge (L1) → Route Handler → Supabase Storage (L2) → 동적 생성
           ↑ HIT: ≤100ms       ↑ L2 HIT: ≤1.5s     ↑ 생성: ≤5s
  ```
- **캐시 키 형식**: `teacher-kit/{lessonId}/{revision_last_updated}.pdf`
  - 예: `teacher-kit/L001/2026-04-25.pdf`
  - revision 변경 = 자동 cache bust (새 키)
- **L1 정책 (Vercel Edge)**:
  - `max-age=3600` (브라우저 1시간)
  - `s-maxage=86400` (Edge CDN 24시간)
  - `stale-while-revalidate=604800` (7일간 stale 허용)
- **L2 정책 (Supabase Storage)**:
  - 영구 보존 (구버전 리디렉트 위함)
  - Public Read / Service Role Write
  - `upsert: true` (동일 revision 재생성 시 덮어쓰기)
- **캐시 무효화**:
  - 자연 무효화: revision 변경 → 새 키
  - 수동 무효화: Storage 파일 삭제 + Vercel Purge API (긴급 시)
- **Storage 비용**: Supabase Free — 1GB Storage 포함. PDF 1개 ~200KB → 5,000개 = ~1GB (한도 이내)
- **보안**: Storage Write 는 `SUPABASE_SERVICE_ROLE_KEY` (서버 전용). 클라이언트 노출 금지
- **금지**:
  - 캐시 키에 timestamp (milliseconds) 포함 → 캐시 HIT 0%
  - 동적 캐시 키 (user_id 등) → 사용자별 캐시 → HIT 급감
  - Storage 파일 자동 삭제 (구버전 리디렉트 불가)
  - L1 캐시 `private` 설정 → Edge 캐시 미저장

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/storage/pdfStorage.ts` — uploadPdf/downloadPdf/getLatestPdf 구현
- [ ] `lib/pdf/cacheResolver.ts` — resolveFromCache 구현
- [ ] Supabase Storage `teacher-kit` Public 버킷 생성
- [ ] Storage RLS 정책 (Public Read + Service Write) 설정
- [ ] FR-PDF-001 Route Handler 에 Cache-Control 헤더 통합
- [ ] Edge Cache 동작 검증 (`X-Vercel-Cache: HIT/MISS/STALE`)
- [ ] revision 변경 시 자동 cache bust 검증
- [ ] 동시 50명 부하 p95 ≤ 2초 (TS-IT-004 과 정합)
- [ ] PR 본문에 "2단 캐시 (Edge L1 + Storage L2). REQ-NF-004·049 충족" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-PDF-001 (PDF 다운로드 Route Handler — 캐시 소비자)
  - IF-SUP-001 (Supabase 프로젝트 — Storage 활성화)
  - IF-VC-001 (Vercel — Edge Cache 인프라)
  - FW-PDF-002 (PDF 템플릿 — 동적 생성 소스)
- **Blocks**:
  - IF-CACHE-002 (캐시 HIT ≥ 95% 측정 검증)
  - FW-PDF-003 (PDF 폴백 — Storage 에서 최신 캐시 조회)
  - TS-IT-004 (PDF 부하 테스트)
  - TS-IT-006 (PDF 카오스 테스트 — 캐시 폴백)
- **Related**:
  - REQ-NF-004 (PDF 다운로드 p95 ≤ 2초)
  - REQ-NF-049 (캐시 HIT ≥ 95%)
  - §3.6.2 (PDF Cache 아키텍처)
