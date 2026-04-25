# [NF] NF-OBS-006: Vercel Logs 14일 — 서버 로그 중앙 집계

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-OBS-006: Vercel Logs 14일 중앙 집계 — 서버 로그 보존 + 검색 + 알림 연동"
labels: 'nf, observability, logging, vercel, priority:medium, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-OBS-006] Vercel Logs 14일 중앙 집계
- **목적**: REQ-NF-030 (서버 로그 14일 보관) 충족. Vercel Hobby 플랜은 기본 1시간 로그만 제공하지만, **Vercel Log Drains** 또는 **자체 로깅 미들웨어**로 14일간 로그를 보존. 장애 분석·디버깅·감사 목적.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.2` — REQ-NF-030 (로그 14일)
- 선행: IF-VC-001 (Vercel 프로젝트)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Vercel 기본 로그 확인**: Hobby 플랜 = 실시간 1시간 (14일 불가)
- [ ] **방법 A — Vercel Log Drains** (Pro 전환 시):
  - Pro 플랜에서 Log Drains → 외부 서비스 (Axiom Free 등) 전송
  - 본 MVP 에서는 Free 한도 내 대안 사용
- [ ] **방법 B — 자체 로깅 미들웨어** (MVP 채택):
  ```ts
  // middleware.ts 또는 app/api/[...slug]/route.ts 공통
  import { prisma } from '@/lib/prisma';

  async function logRequest(req: Request, status: number, durationMs: number) {
    await prisma.serverLog.create({
      data: {
        method: req.method,
        url: new URL(req.url).pathname,
        status,
        durationMs,
        userAgent: req.headers.get('user-agent')?.slice(0, 200) || '',
        timestamp: new Date(),
      },
    });
  }
  ```
- [ ] **DB 모델** — `ServerLog`:
  ```prisma
  model ServerLog {
    id         String   @id @default(uuid())
    method     String   @db.VarChar(10)
    url        String   @db.VarChar(500)
    status     Int
    durationMs Int
    userAgent  String   @db.VarChar(200)
    timestamp  DateTime @default(now())
    @@index([timestamp])
    @@index([status])
  }
  ```
- [ ] **14일 자동 정리 Cron** — `app/api/cron/log-cleanup/route.ts`:
  ```ts
  export async function GET() {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const deleted = await prisma.serverLog.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });
    return Response.json({ deleted: deleted.count });
  }
  ```
- [ ] **검색 API** — ADMIN 전용:
  ```ts
  // GET /api/admin/logs?status=500&from=2026-04-01&to=2026-04-14
  ```
- [ ] **디스크 사용 모니터링**: 로그 테이블 크기 → D-TIER 트리거

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 요청 로그 기록
- **Given**: API 요청 발생
- **When**: 응답 완료
- **Then**: ServerLog 1건 생성

### Scenario 2: 14일 보존
- **Given**: 15일 전 로그
- **When**: Cron 실행
- **Then**: 15일 전 로그 삭제. 14일 이내 유지

### Scenario 3: 500 에러 검색
- **Given**: 500 에러 로그 존재
- **When**: `/api/admin/logs?status=500` 호출
- **Then**: 500 에러 로그 목록

### Scenario 4: ADMIN 전용 — 403
- **Given**: LEARNER
- **When**: 로그 검색 API 호출
- **Then**: 403

### Scenario 5: PII 미포함
- **Given**: 로그 레코드
- **When**: 필드 확인
- **Then**: IP·email 미포함 (userAgent 200자 제한)

### Scenario 6: 성능 영향 최소
- **Given**: 로그 미들웨어 활성
- **When**: 응답 시간 측정
- **Then**: 로깅 오버헤드 < 5ms

## :gear: Technical & Non-Functional Constraints
- **Hobby 한도**: Vercel Hobby 는 Log Drains 미지원 → 자체 DB 로깅
- **보존 기간**: 14일 (REQ-NF-030). Cron 일일 정리
- **PII 미포함**: IP 주소·사용자 이메일 미기록. userAgent 200자 제한
- **비동기 로깅**: `waitUntil` 또는 fire-and-forget (응답 지연 방지)
- **Pro 전환 시**: Log Drains (Axiom 등) 로 마이그레이션

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 시나리오 통과
- [ ] ServerLog 모델 + 미들웨어
- [ ] 14일 자동 정리 Cron
- [ ] ADMIN 검색 API
- [ ] PR 본문에 "REQ-NF-030 로그 14일. 자체 DB 로깅" 명시

## :construction: Dependencies & Blockers
- **Depends on**: IF-VC-001 (Vercel), CT-DB-001 (Prisma)
- **Blocks**: NF-OBS-002 (Sev1 — 로그 기반 분석)
- **Related**: REQ-NF-030
