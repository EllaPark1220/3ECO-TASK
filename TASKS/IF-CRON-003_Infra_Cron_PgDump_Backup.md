# [Feature] IF-CRON-003: pg-dump 백업 Cron — 일 1회 Supabase Storage 저장 + RPO 24h + 7일 retention

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] IF-CRON-003: /api/cron/pg-dump Route Handler — 일 1회 (KST 03:00) PostgreSQL dump → Supabase Storage 업로드 + 7일 retention"
labels: 'feature, infra, cron, backup, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-CRON-003] `POST /api/cron/pg-dump` Route Handler — 일 1회 KST 03:00 Supabase PostgreSQL 의 `pg_dump` 실행 (또는 Supabase 의 backup API 활용) → 결과 파일 (`.sql.gz`) 을 Supabase Storage 의 `backups/` 버킷에 업로드 + 7일 retention 자동 정리
- **목적**: REQ-NF-011 (RPO 24h — 24시간 내 데이터 손실 허용) 충족. Supabase Free 플랜의 자동 백업 (7일 retention) 외 추가 보호 + 마이그레이션 직전 backup 강제 + 운영자가 직접 다운로드 가능한 형태로 보관. **Disaster Recovery (IF-CRON-004) 의 데이터 진입**.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.2` — REQ-NF-011 (RPO 24h), REQ-NF-012 (RTO 4h)
  - `/docs/SRS_V0_9.md#6.1` — `/api/cron/pg-dump` 엔드포인트
  - `/docs/SRS_V0_9.md#6.6` — R10·R11 (DB 손상 위험)
- 외부 문서:
  - `https://www.postgresql.org/docs/current/app-pgdump.html`
  - `https://supabase.com/docs/guides/storage`
- 선행: CT-API-010 (Cron Contract), IF-SUP-001 (Supabase Storage `backups` 버킷)
- 짝: IF-CRON-004 (DR Restore — 본 백업 파일 활용)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **백업 전략 결정 — Supabase 의 자동 backup 외 추가 정책 필요성 판단**:
  - **옵션 A**: `pg_dump` 직접 실행 (Vercel Functions 의 timeout 60초 한도 + 외부 라이브러리 의존성)
  - **옵션 B**: Supabase Management API 의 backup endpoint 활용 (있다면)
  - **옵션 C**: Vercel Functions 가 별도 외부 워커 (Railway·Fly.io 등) 의 backup 트리거만 호출
  - **본 태스크는 옵션 A (pg_dump) 채택** + Vercel Functions 60초 한도 내 처리 가능 검증 + 데이터 200MB 초과 시 옵션 C 전환
- [ ] `app/api/cron/pg-dump/route.ts` Route Handler 구현
- [ ] **Bearer 인증 (CT-API-010 활용)**:
  ```ts
  import { verifyCronAuth } from '@/lib/contracts/cron';
  import { createClient } from '@supabase/supabase-js';
  import { NextResponse } from 'next/server';
  import { exec as execCb } from 'node:child_process';
  import { promisify } from 'node:util';
  import { readFile, unlink } from 'node:fs/promises';
  import crypto from 'node:crypto';

  const exec = promisify(execCb);
  export const dynamic = 'force-dynamic';
  export const runtime = 'nodejs';
  export const maxDuration = 60;  // Vercel Hobby 한도

  export async function POST(req: Request) {
    if (!verifyCronAuth(req)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const startMs = Date.now();
    const backupId = crypto.randomUUID();
    const dateStr = new Date().toISOString().split('T')[0];  // YYYY-MM-DD
    const fileName = `pg-dump-${dateStr}-${backupId.slice(0, 8)}.sql.gz`;
    const tmpPath = `/tmp/${fileName}`;

    try {
      // 1. pg_dump 실행 — DIRECT_URL 활용 (PgBouncer 우회)
      const directUrl = process.env.DIRECT_URL!;
      await exec(`pg_dump --format=custom --no-owner --no-privileges --compress=9 --file=${tmpPath} "${directUrl}"`);

      // 2. 파일 읽기 + Supabase Storage 업로드
      const buffer = await readFile(tmpPath);
      const fileSize = buffer.byteLength;

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      const storageUrl = `backups/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('backups')
        .upload(storageUrl, buffer, {
          contentType: 'application/gzip',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      // 3. 임시 파일 정리
      await unlink(tmpPath);

      // 4. 7일 retention — 7일 이상 백업 자동 삭제
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const { data: oldFiles } = await supabase.storage
        .from('backups')
        .list('', { limit: 100 });
      const toDelete = oldFiles
        ?.filter(f => f.created_at && new Date(f.created_at) < sevenDaysAgo)
        .map(f => f.name) ?? [];
      if (toDelete.length > 0) {
        await supabase.storage.from('backups').remove(toDelete);
      }

      // 5. EventLog 발행
      await prisma.eventLog.create({
        data: {
          event: 'cron.pg_dump.success',
          payload: { backup_id: backupId, file_name: fileName, file_size: fileSize, deleted_old: toDelete.length },
        },
      });

      return NextResponse.json({
        ok: true,
        backup_id: backupId,
        storage_url: storageUrl,
        backup_size_bytes: fileSize,
        backup_created_at: new Date().toISOString(),
        duration_ms: Date.now() - startMs,
        deleted_old_count: toDelete.length,
      });
    } catch (error) {
      console.error('pg-dump failed:', error);
      // Sentry 즉시 알림 — RPO 영향
      // Sentry.captureException(error);
      return NextResponse.json({
        ok: false,
        backup_id: backupId,
        error: 'BACKUP_FAILED',
        duration_ms: Date.now() - startMs,
      }, { status: 503 });
    }
  }
  ```
- [ ] **Supabase Storage `backups` 버킷 생성 (IF-SUP-001 와 통합)**:
  - Public read **금지** (백업 파일은 PII 포함)
  - Service Role 만 read·write
  - 정책 — `INSERT/SELECT/DELETE` Service Role 만
- [ ] **외부 cron 스케줄 — 일 1회 KST 03:00**:
  - **GitHub Actions** — `.github/workflows/cron-pg-dump.yml`:
    ```yaml
    name: pg-dump Backup
    on:
      schedule:
        - cron: '0 18 * * *'  # UTC 18:00 = KST 03:00
      workflow_dispatch:
    jobs:
      backup:
        runs-on: ubuntu-latest
        steps:
          - run: |
              curl -fsSL -X POST \
                -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
                --max-time 70 \
                https://economic-judgment.app/api/cron/pg-dump
    ```
  - 새벽 시간대 — 트래픽 최소 + Vercel Functions cold start 영향 미미
- [ ] **maxDuration 60초 (Vercel Hobby 한도)**:
  - `vercel.json` 의 functions config 또는 본 라우트의 `export const maxDuration = 60`
  - 데이터 200MB 초과 시 옵션 C 전환 검토
- [ ] **pg_dump 명령어 정책**:
  - `--format=custom` — Supabase 권장 (selective restore 가능)
  - `--no-owner --no-privileges` — Supabase 환경에서 권한 충돌 방지
  - `--compress=9` — 최대 압축 (gzip)
  - DIRECT_URL 활용 (PgBouncer 우회)
- [ ] **7일 retention 자동 정리**:
  - 본 cron 실행 시 7일 이전 백업 파일 자동 삭제
  - Supabase Storage Free 1GB 한도 내 (백업 1건 ~10MB × 7일 = 70MB)
- [ ] **DR Restore 절차 (IF-CRON-004 의 후속)**:
  - Supabase Storage 에서 backup 파일 다운로드
  - `pg_restore --format=custom <file>` 로 복원
  - 별도 staging DB 에서 검증 후 production 복원

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 백업 실행
- **Given**: Bearer 토큰 + DB 정상 + Storage 활성
- **When**: `POST /api/cron/pg-dump`
- **Then**: 200 + `backup_id, storage_url, backup_size_bytes` 정상. Storage 에 파일 존재

### Scenario 2: Bearer 미인증 — 401
- **Given**: 인증 누락
- **When**: 호출
- **Then**: 401

### Scenario 3: pg_dump 실패 — 503 + Sentry
- **Given**: DB 접근 실패 또는 디스크 부족
- **When**: 호출
- **Then**: 503 + `BACKUP_FAILED`. Sentry 즉시 알림 (RPO 영향)

### Scenario 4: Storage 업로드 실패 — 503
- **Given**: Supabase Storage 5xx
- **When**: 호출
- **Then**: 503 + 임시 파일 정리. Sentry 알림

### Scenario 5: 7일 retention 동작
- **Given**: 8일 이전 backup 파일 3건 존재
- **When**: 본 cron 실행
- **Then**: 3건 자동 삭제. 응답에 `deleted_old_count: 3`

### Scenario 6: 응답 시간 — 60초 이내
- **Given**: 정상 환경 + 데이터 200MB
- **When**: 호출
- **Then**: 응답 시간 ≤ 60초 (Vercel Hobby 한도). 초과 시 timeout

### Scenario 7: 백업 파일명 패턴
- **Given**: 응답
- **When**: storage_url 검사
- **Then**: `backups/pg-dump-YYYY-MM-DD-<8자UUID>.sql.gz` 패턴

### Scenario 8: Service Role 만 접근
- **Given**: anon key 로 backup 파일 접근 시도
- **When**: GET
- **Then**: 403 (RLS 정책)

### Scenario 9: 매일 1회 정확 실행
- **Given**: GitHub Actions schedule 활성
- **When**: 일주일 모니터링
- **Then**: 정확히 7건 실행 (매일 03:00 KST). 실패 시 Sentry

### Scenario 10: Vercel maxDuration 60초 정합
- **Given**: 본 라우트
- **When**: vercel.json 또는 export 검사
- **Then**: maxDuration 60 명시. Hobby 한도 내

## :gear: Technical & Non-Functional Constraints
- **CT-API-010 Contract 정합**: Bearer 인증 + 응답 schema
- **maxDuration 60초 (Vercel Hobby)**: 데이터 200MB 한도 내. 초과 시 옵션 C 전환
- **DIRECT_URL 활용**: PgBouncer 우회 — pg_dump 의 prepared statement 호환
- **Service Role 보안**: `backups` 버킷은 anon 접근 차단
- **압축 정책**: gzip 최대 압축 (--compress=9). 200MB → 10~30MB 예상
- **7일 retention 자동 정리**: Free Storage 1GB 한도 안전
- **Sentry 즉시 알림 (5xx)**: RPO 영향 — critical
- **EventLog 발행 (silent fail)**: 분석·감사용
- **임시 파일 정리**: `/tmp/` 가 Vercel Functions 의 ephemeral. 재실행 시 자동 클린이지만 명시적 unlink 권장
- **DR Restore 절차 별도**: 본 태스크는 backup 만. Restore 는 IF-CRON-004
- **금지**:
  - DIRECT_URL 미사용 (PgBouncer + pg_dump 충돌)
  - public 버킷 사용 (PII 노출)
  - retention 미설정 (Storage 한도 초과)
  - timeout 미설정 (Vercel 60초 무한 hang)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `app/api/cron/pg-dump/route.ts` 구현
- [ ] Supabase Storage `backups` 버킷 생성 (Service Role 만)
- [ ] CT-API-010 응답 schema 정합
- [ ] GitHub Actions schedule 활성 (KST 03:00)
- [ ] maxDuration 60초 명시
- [ ] DIRECT_URL 활용 검증
- [ ] 7일 retention 동작 검증
- [ ] Sentry 알림 통합 (5xx)
- [ ] EventLog 발행
- [ ] PR 본문에 "RPO 24h 충족. DR Restore (IF-CRON-004) 의 데이터 진입" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-API-010 (Cron Contract)
  - IF-VC-001 (Vercel)
  - IF-SUP-001 (Supabase + Storage `backups` 버킷)
- **Blocks**:
  - IF-CRON-004 (DR Restore — 본 백업 활용)
  - REQ-NF-011 (RPO 24h) 충족
  - REQ-NF-012 (RTO 4h) 검증의 데이터 기반
- **Related**:
  - R11 (DB 손상 위험)
  - D-TIER (Storage 한도 모니터링)
