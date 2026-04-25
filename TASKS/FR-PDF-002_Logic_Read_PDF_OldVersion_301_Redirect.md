# [Feature] FR-PDF-002: 구버전 PDF URL 301 리디렉트

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-PDF-002: 구버전 PDF URL 301 Permanent Redirect — ?rev=old → 최신 revision 자동 전환"
labels: 'feature, backend, pdf, redirect, priority:medium, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-PDF-002] 구버전 PDF URL 요청 시 301 Permanent Redirect 로 최신 revision URL 로 전환
- **목적**: REQ-FUNC-017 (구버전 PDF 접근 시 최신 버전으로 안내) 충족. 교사가 이전 revision 의 PDF URL 을 북마크·공유했을 때, 해당 URL 이 영구 유효하되 최신 revision 으로 자동 리디렉트된다. 검색 엔진 크롤러에도 301 로 영구 전환 신호를 전달하여 SEO 정합성을 유지.

## :link: References (Spec & Context)
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-017 (구버전 PDF 리디렉트)
  - `/docs/SRS_V0_9.md#3.4.2` — 교안 PDF 다운로드 시퀀스 (리디렉트 분기)
  - `/docs/SRS_V0_9.md#6.1` — `/api/teacher/kit/{id}` 엔드포인트
- 선행: FR-PDF-001 (PDF 다운로드 Route Handler), FW-PDF-002 (PDF 템플릿)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **FR-PDF-001 Route Handler 확장** — revision 비교 로직:
  ```ts
  // app/api/teacher/kit/[id]/[revision]/route.ts
  export async function GET(req: Request, { params }: { params: { id: string; revision: string } }) {
    const lesson = await prisma.lesson.findUnique({
      where: { lessonId: params.id },
      select: { revisionLastUpdated: true },
    });

    if (!lesson) return notFound();

    const currentRevision = lesson.revisionLastUpdated.toISOString().slice(0, 10);
    const requestedRevision = params.revision;

    // 구버전 요청 → 301 Redirect
    if (requestedRevision !== currentRevision) {
      const newUrl = `/api/teacher/kit/${params.id}/${currentRevision}`;
      return new Response(null, {
        status: 301,
        headers: {
          'Location': newUrl,
          'Cache-Control': 'public, max-age=86400', // 301 캐시 24시간
          'X-Redirect-Reason': 'revision-updated',
          'X-Old-Revision': requestedRevision,
          'X-New-Revision': currentRevision,
        },
      });
    }

    // 최신 revision → 정상 PDF 응답 (기존 로직)
    return await servePdf(params.id, currentRevision);
  }
  ```
- [ ] **리디렉트 없는 경로** — revision 미지정 요청:
  ```ts
  // /api/teacher/kit/[id]/route.ts (revision 미포함)
  // → 항상 최신 revision 직접 응답 (리디렉트 없음)
  ```
- [ ] **EventLog 기록** — `pdf.redirect_301`:
  ```ts
  await prisma.eventLog.create({
    data: {
      eventName: 'pdf.redirect_301',
      payload: { lessonId: params.id, oldRevision: requestedRevision, newRevision: currentRevision },
      timestamp: new Date(),
    },
  });
  ```
- [ ] **301 vs 302 선택 근거**:
  - 301 Permanent — revision 변경은 영구적 (이전 revision 으로 되돌아가지 않음)
  - 302 Temporary — 부적합 (일시적이 아님)
  - 브라우저·크롤러가 301 을 캐시하여 다음 요청부터 직접 최신 URL 접근
- [ ] **이전 revision PDF 직접 접근 (IF-CACHE-001 보존)**:
  - 구버전 PDF 는 Supabase Storage 에 보존 (삭제하지 않음)
  - `?force=true` 쿼리 파라미터로 리디렉트 우회 가능 (관리자 디버깅용)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 구버전 URL → 301 최신 revision
- **Given**: L001 현재 revision `2026-05-01`. 요청 URL `/api/teacher/kit/L001/2026-04-25`
- **When**: GET 요청
- **Then**: 301 + `Location: /api/teacher/kit/L001/2026-05-01`

### Scenario 2: 최신 revision URL → 정상 PDF 응답
- **Given**: 동일 lesson. 요청 `/api/teacher/kit/L001/2026-05-01`
- **When**: GET
- **Then**: 200 + PDF 응답 (리디렉트 없음)

### Scenario 3: revision 미지정 URL → 정상 PDF 응답
- **Given**: `/api/teacher/kit/L001` (revision 미포함)
- **When**: GET
- **Then**: 200 + 최신 revision PDF 직접 응답

### Scenario 4: 301 캐시 — 브라우저 재요청 시 직접 접근
- **Given**: 301 응답 수신 후 + 브라우저 캐시 존재
- **When**: 동일 구버전 URL 재요청
- **Then**: 브라우저가 캐시된 301 활용 → 최신 URL 직접 접근 (서버 미도달)

### Scenario 5: EventLog 기록
- **Given**: 구버전 URL 리디렉트 발생
- **When**: EventLog 확인
- **Then**: `pdf.redirect_301` + `{ oldRevision, newRevision }` 기록

### Scenario 6: 존재하지 않는 lessonId — 404
- **Given**: `L999` 미존재
- **When**: GET
- **Then**: 404

### Scenario 7: ?force=true — 리디렉트 우회
- **Given**: 구버전 URL + `?force=true`
- **When**: GET
- **Then**: 리디렉트 없이 구버전 PDF 직접 응답 (Storage 에서 조회)

### Scenario 8: SEO — Location 헤더 정합
- **Given**: 301 응답
- **When**: Location 헤더
- **Then**: 절대/상대 경로 정합. 깨진 URL 0건

### Scenario 9: 동일 revision — 리디렉트 없음
- **Given**: 요청 revision = 현재 revision
- **When**: GET
- **Then**: 200 (리디렉트 0회)

### Scenario 10: 연속 리디렉트 방지
- **Given**: 301 → 최신 URL
- **When**: 최신 URL 접근
- **Then**: 200 (2차 리디렉트 없음). 최대 1회 리디렉트

## :gear: Technical & Non-Functional Constraints
- **301 Permanent Redirect**: revision 변경은 영구적. 검색 엔진·브라우저에 명확한 신호
- **Cache-Control**: 301 응답 `max-age=86400` (24시간 캐시)
- **구버전 PDF 보존**: Supabase Storage 에서 삭제하지 않음 (FW-PDF-003 폴백 소스)
- **force 파라미터**: `?force=true` 는 관리자 디버깅 전용. 일반 사용자에게 UI 미노출
- **리디렉트 루프 방지**: revision 비교 후 동일 = 200, 다름 = 301. 최대 1회 리디렉트
- **금지**:
  - 302 Temporary Redirect (의미론적으로 부적합)
  - 구버전 PDF 자동 삭제 (폴백·아카이브 용도)
  - 리디렉트 체인 (2회 이상 연속 리디렉트)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 통과
- [ ] FR-PDF-001 Route Handler 에 revision 비교 + 301 로직 통합
- [ ] EventLog `pdf.redirect_301` 발행
- [ ] 301 Cache-Control 헤더 설정
- [ ] `?force=true` 우회 동작
- [ ] 리디렉트 루프 방지 검증
- [ ] PR 본문에 "REQ-FUNC-017 구버전 PDF 301. SEO 정합" 명시

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-PDF-001 (PDF 다운로드 Route Handler — 호스트)
  - FW-PDF-002 (PDF 템플릿 — revision 메타데이터)
  - IF-CACHE-001 (Storage — 구버전 PDF 보존)
- **Blocks**: 없음 (개선 태스크)
- **Related**: REQ-FUNC-017, §3.4.2 (PDF 시퀀스)
