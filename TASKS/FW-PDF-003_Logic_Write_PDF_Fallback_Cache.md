# [Feature] FW-PDF-003: PDF 생성 5xx 실패 시 최신 캐시 PDF 폴백 + 에러 로그

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-PDF-003: PDF 생성 실패 폴백 — 5xx 시 최신 캐시 PDF 응답 + Sentry 에러 로그 + 사용자 무중단"
labels: 'feature, backend, pdf, resilience, fallback, priority:medium, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-PDF-003] PDF 생성 5xx 실패 시 최신 캐시 PDF 폴백 응답 + 에러 로그
- **목적**: Story 3 (장은혜) 의 교안 PDF 다운로드 안정성 — `@react-pdf/renderer` 또는 Vercel Functions 장애 시에도 교사가 교안을 받을 수 있도록 최신 캐시 PDF 로 폴백한다. 사용자는 에러를 인지하지 못하고 정상 PDF 를 받으며, 운영자에게는 Sentry 알림이 전달된다. REQ-FUNC-018 (PDF 생성 실패 시 폴백) 충족.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-018 (PDF 생성 실패 시 폴백)
  - `/docs/SRS_V0_9.md#3.4.2` — 교안 PDF 다운로드 시퀀스 (폴백 분기)
  - `/docs/SRS_V0_9.md#4.2.8` — REQ-NF-049 (캐시 HIT ≥95%)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-027~029 (Severity Router)
- 페르소나: SH-05 장은혜 (중학 사회 · 수업 준비 시간에 PDF 필수)
- 선행: FR-PDF-001 (PDF 다운로드 Route Handler — 본 폴백의 호스트)
- 짝: IF-CACHE-001 (PDF 2단 캐시 — 폴백 소스)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **FR-PDF-001 의 Route Handler 확장** — `app/api/teacher/kit/[id]/route.ts` 의 catch 블록에 폴백 로직 삽입:
  ```ts
  // app/api/teacher/kit/[id]/route.ts
  export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
      // 1. Edge Cache 확인 (Vercel 자동)
      // 2. Supabase Storage 캐시 확인
      // 3. 동적 생성 (FW-PDF-002)
      const pdfBuffer = await generateOrFetchPdf(lessonId);
      return new Response(pdfBuffer, { headers: pdfHeaders(lesson) });
    } catch (error) {
      // ★ 폴백 로직 시작
      return await handlePdfFallback(lessonId, error);
    }
  }
  ```
- [ ] `lib/pdf/fallback.ts` — 폴백 핸들러 신규 생성:
  ```ts
  import { createClient } from '@supabase/supabase-js';
  import * as Sentry from '@sentry/nextjs';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  export async function handlePdfFallback(
    lessonId: string,
    originalError: unknown
  ): Promise<Response> {
    // 1. Sentry 에러 보고
    Sentry.captureException(originalError, {
      tags: { component: 'pdf-generation', lessonId },
      extra: { fallback: true },
    });

    // 2. Supabase Storage 에서 최신 캐시 PDF 검색
    const { data: files, error: listError } = await supabase.storage
      .from('teacher-kit')
      .list(lessonId, {
        sortBy: { column: 'created_at', order: 'desc' },
        limit: 1,
      });

    if (listError || !files || files.length === 0) {
      // 캐시도 없음 → 503 Service Unavailable
      return new Response(
        JSON.stringify({
          error_code: 'PDF_GENERATION_FAILED',
          message: '교안 PDF 생성에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
          request_id: crypto.randomUUID(),
        }),
        { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } }
      );
    }

    // 3. 최신 캐시 PDF 다운로드
    const latestFile = files[0];
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('teacher-kit')
      .download(`${lessonId}/${latestFile.name}`);

    if (downloadError || !fileData) {
      return new Response(
        JSON.stringify({ error_code: 'FALLBACK_FAILED', message: '폴백 PDF 조회 실패' }),
        { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } }
      );
    }

    // 4. 폴백 PDF 응답 (200 + 캐시 버전 고지 헤더)
    const buffer = await fileData.arrayBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${lessonId}_교안.pdf"`,
        'X-Cache': 'FALLBACK',
        'X-Fallback-Reason': 'pdf-generation-failed',
        'X-Fallback-Version': latestFile.name,
        'Cache-Control': 'no-cache', // 폴백은 캐시 안함
      },
    });
  }
  ```
- [ ] **EventLog 발행** — `pdf.generation_failed` + `pdf.fallback_served` 2종:
  ```ts
  await prisma.eventLog.create({
    data: {
      eventName: 'pdf.generation_failed',
      payload: { lessonId, error: String(originalError) },
      timestamp: new Date(),
    },
  });

  await prisma.eventLog.create({
    data: {
      eventName: 'pdf.fallback_served',
      payload: { lessonId, fallbackVersion: latestFile.name },
      timestamp: new Date(),
    },
  });
  ```
- [ ] **Sentry 알림 설정**:
  - `pdf.generation_failed` → Sev2 알림 (1시간 응답 · 4시간 조치)
  - 10분 내 동일 lessonId 3회 이상 실패 → Sev1 에스컬레이션
- [ ] **캐시 없음 시 응답 전략**:
  - 첫 번째 요청이 실패한 경우 (캐시 자체가 없음) → 503 + `Retry-After: 60`
  - 사용자 안내 메시지: "잠시 후 다시 시도해 주세요"
  - 이 경우는 극히 드뭄 (첫 요청 실패 = 서비스 초기 + 장애 동시 발생)
- [ ] **폴백 PDF 의 버전 고지**:
  - `X-Fallback-Version` 헤더로 어떤 캐시 버전인지 기록
  - 사용자에게는 별도 UI 표시 안함 (운영자만 헤더로 확인)
- [ ] **카오스 테스트 준비** — TS-IT-006 과 정합:
  - FW-PDF-002 의 `renderTeacherKitPdf()` 를 강제 throw 하는 테스트 더블 준비
  - Supabase Storage 장애 시뮬레이션 (MSW 또는 환경변수 조작)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: PDF 생성 실패 — 캐시 폴백 제공
- **Given**: Lesson L001 의 캐시 PDF 가 Supabase Storage 에 존재. `@react-pdf/renderer` 장애
- **When**: `GET /api/teacher/kit/L001`
- **Then**: 200 응답 + 최신 캐시 PDF 전달. 헤더 `X-Cache: FALLBACK`. 사용자는 에러 미인지

### Scenario 2: 폴백 PDF 제공 + Sentry 에러 보고
- **Given**: Scenario 1 조건
- **When**: 폴백 실행
- **Then**: Sentry 에 `pdf-generation` 태그 에러 보고. EventLog 에 `pdf.generation_failed` + `pdf.fallback_served` 2건 기록

### Scenario 3: 캐시 없음 — 503 + Retry-After
- **Given**: L001 의 캐시 PDF 가 Storage 에 없음 (첫 요청). 동적 생성도 실패
- **When**: `GET /api/teacher/kit/L001`
- **Then**: 503 + `{ error_code: 'PDF_GENERATION_FAILED' }` + `Retry-After: 60`

### Scenario 4: Storage 장애 — 이중 실패
- **Given**: PDF 생성 실패 + Supabase Storage 도 5xx
- **When**: 폴백 시도
- **Then**: 503 + `{ error_code: 'FALLBACK_FAILED' }`. Sentry 에 이중 실패 보고

### Scenario 5: revision 변경 후 생성 실패 — 이전 revision 캐시 제공
- **Given**: L001 revision `2026-04-25` 캐시 존재. revision `2026-05-01` 로 변경 후 생성 실패
- **When**: 폴백 실행
- **Then**: `2026-04-25` 버전 PDF 폴백 제공. `X-Fallback-Version: 2026-04-25.pdf`. 사용자는 구버전 수령 (무보다 나음)

### Scenario 6: 폴백 응답 캐시 안함
- **Given**: 폴백 PDF 응답
- **When**: 응답 헤더 검사
- **Then**: `Cache-Control: no-cache` — Edge 캐시에 저장 안함 (다음 요청에서 재생성 시도)

### Scenario 7: 정상 복구 후 — 새 PDF 생성 + 캐시 갱신
- **Given**: 장애 복구 후 동일 요청
- **When**: `GET /api/teacher/kit/L001`
- **Then**: 정상 동적 생성 + Storage 캐시 저장 + Edge 캐시. `X-Cache: MISS` (정상 흐름 복귀)

### Scenario 8: Sev2 알림 트리거
- **Given**: 10분 내 동일 lessonId 3회 생성 실패
- **When**: Sentry 이벤트 집계
- **Then**: Sev2 → Sev1 에스컬레이션 알림 (운영자에게 즉시 통보)

### Scenario 9: 카오스 테스트 — renderTeacherKitPdf throw
- **Given**: FW-PDF-002 의 renderTeacherKitPdf 가 강제 throw
- **When**: `GET /api/teacher/kit/L003`
- **Then**: 폴백 로직 정상 실행. TS-IT-006 통과

### Scenario 10: 응답 시간 — 폴백도 p95 ≤ 2초
- **Given**: Storage 에서 캐시 PDF 다운로드
- **When**: 폴백 응답
- **Then**: p95 ≤ 2초 (Storage 다운로드 + 응답. 동적 생성 없어 더 빠름)

## :gear: Technical & Non-Functional Constraints
- **폴백 소스**: Supabase Storage 의 `teacher-kit/{lessonId}/` 디렉토리에서 가장 최신 파일 (created_at DESC)
- **폴백 응답 코드**: 200 (사용자에게는 정상). `X-Cache: FALLBACK` 헤더로 운영 구분
- **캐시 안함 정책**: 폴백 응답은 `Cache-Control: no-cache` — Edge 에 캐시되면 장애 복구 후에도 구버전 고착
- **Sentry 연동**: `Sentry.captureException()` + 태그(`component: pdf-generation`, `fallback: true`)
- **EventLog 2종**: `pdf.generation_failed` (장애 기록) + `pdf.fallback_served` (폴백 기록)
- **에러 메시지 정책**: 사용자향 503 메시지는 기술 용어 배제. "잠시 후 다시 시도해 주세요" 만
- **카오스 테스트**: TS-IT-006 에서 FW-PDF-002 throw 강제 + Storage mock 으로 시뮬레이션
- **성능 목표**: 폴백 응답도 p95 ≤ 2초 (REQ-NF-004). Storage 다운로드는 ~500ms 예상
- **금지**:
  - 폴백 실패 시 빈 PDF 생성 (corrupted PDF 방지)
  - 폴백 응답을 Edge 캐시에 저장 (장애 고착 위험)
  - 사용자에게 "폴백 버전입니다" UI 표시 (혼란 유발)
  - 자동 복구 시도 (무한 재생성 루프 위험 — 다음 요청에서 자연 재시도)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/pdf/fallback.ts` — handlePdfFallback 구현
- [ ] FR-PDF-001 의 catch 블록에 폴백 통합
- [ ] Sentry 에러 보고 + 태그 설정
- [ ] EventLog 2종 (`pdf.generation_failed`, `pdf.fallback_served`) 발행
- [ ] 폴백 응답 헤더 (`X-Cache: FALLBACK`, `X-Fallback-Version`, `Cache-Control: no-cache`)
- [ ] 503 응답 — `Retry-After: 60` + 사용자 친화 메시지
- [ ] TS-IT-006 (카오스 테스트) 통과
- [ ] 폴백 응답 시간 p95 ≤ 2초 검증
- [ ] PR 본문에 "Story 3 PDF 안정성. REQ-FUNC-018 폴백. Sentry 연동" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-PDF-001 (PDF 다운로드 Route Handler — 본 폴백의 호스트)
  - FW-PDF-002 (PDF 템플릿 — 생성 실패 시 본 폴백 트리거)
  - IF-CACHE-001 (PDF 2단 캐시 — 폴백 소스)
  - IF-SUP-001 (Supabase Storage — 캐시 저장소)
  - NF-OBS-001 (Sentry — 에러 보고 인프라)
- **Blocks**:
  - TS-IT-006 (PDF 5xx 카오스 테스트)
- **Related**:
  - REQ-FUNC-018 (PDF 생성 실패 시 폴백)
  - REQ-NF-049 (캐시 HIT ≥95%)
  - NF-OBS-002·003 (Severity Router — 에스컬레이션)
