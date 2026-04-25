# [Feature] CT-DB-001: Prisma 초기화 + DATABASE_URL 환경 분리 (로컬 SQLite ↔ Supabase PostgreSQL)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-DB-001: Prisma 초기화 + DATABASE_URL 환경 분리 (SQLite 로컬 + PostgreSQL 배포)"
labels: 'feature, backend, db, infra, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-DB-001] Prisma ORM 초기화 + `DATABASE_URL` 환경 분리 — 로컬 개발은 SQLite, Vercel 배포는 Supabase PostgreSQL
- **목적**: 모든 후속 DB 모델 (CT-DB-002~011) 의 기반 인프라. C-TEC-003 결정에 따라 단일 Prisma 스키마로 양 환경 동시 지원하여, 단일 제작자(CON-08) 가 로컬 개발 시 Supabase 의존 없이 빠른 iteration 가능하면서도 배포 시점에는 Supabase RLS·인증을 활용할 수 있게 한다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.1.2` — C-TEC-003 (Prisma + SQLite 로컬 + PostgreSQL 배포)
  - `/docs/SRS_V0_9.md#3.6.2` — DB 컴포넌트 책임 매트릭스
  - `/docs/SRS_V0_9.md#6.2.1` — ERD (모든 모델의 기반)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-08 (단일 제작자 운영 부담)
- 외부 문서: `https://www.prisma.io/docs/getting-started/quickstart`
- 선행: IF-VC-001 (Vercel 프로젝트), IF-SUP-001 (Supabase 프로젝트)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `npm install prisma @prisma/client` 설치
- [ ] `npx prisma init` 으로 `prisma/schema.prisma` + `.env` 초기화
- [ ] **schema.prisma 의 datasource 설정** — provider 환경 변수화:
  ```prisma
  datasource db {
    provider = env("DATABASE_PROVIDER")  // "sqlite" 또는 "postgresql"
    url      = env("DATABASE_URL")
  }

  generator client {
    provider = "prisma-client-js"
  }
  ```
- [ ] `.env.local` (로컬):
  ```
  DATABASE_PROVIDER=sqlite
  DATABASE_URL=file:./dev.db
  ```
- [ ] Vercel 환경변수 (Production / Preview):
  ```
  DATABASE_PROVIDER=postgresql
  DATABASE_URL=postgresql://...supabase...?pgbouncer=true&connection_limit=1
  DIRECT_URL=postgresql://...supabase... (마이그레이션용)
  ```
- [ ] **DIRECT_URL 분리 정책** — Supabase 의 PgBouncer 가 마이그레이션 prepared statement 와 충돌. `directUrl = env("DIRECT_URL")` 추가하여 마이그레이션 시 직접 연결 사용
- [ ] `lib/db.ts` — Prisma Client 싱글톤 패턴:
  ```ts
  import { PrismaClient } from '@prisma/client';
  const globalForPrisma = globalThis as { prisma?: PrismaClient };
  export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  });
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
  ```
- [ ] **Vercel Functions cold start 대응** — `connection_limit=1` + `pgbouncer=true` (Supabase 권장)
- [ ] **provider 호환성 매트릭스 작성** — `docs/db-compat.md`:
  - SQLite 미지원 기능 (예: `Json` 타입, `array` 컬럼) 회피 정책
  - 양 환경에서 동일 동작하는 컬럼 타입 화이트리스트
- [ ] **마이그레이션 정책**:
  - 개발: `npx prisma migrate dev --name {description}`
  - 배포: `npx prisma migrate deploy` (CI 또는 Vercel build hook)
  - rollback 정책 — 마이그레이션 파일은 git 영구 보존, DB 직접 수정 금지
- [ ] `.gitignore` — `prisma/dev.db`, `prisma/dev.db-journal` 추가 (로컬 SQLite 커밋 방지)
- [ ] `.env.example` 작성 — 키 이름만, 실제 값 제외
- [ ] `package.json` scripts:
  ```json
  "db:generate": "prisma generate",
  "db:migrate": "prisma migrate dev",
  "db:deploy": "prisma migrate deploy",
  "db:studio": "prisma studio"
  ```
- [ ] 헬스체크 라우트 `/api/health/db` — Prisma `$queryRaw` 로 `SELECT 1` 응답 검증

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 로컬 SQLite — Prisma Client 정상 동작
- **Given**: `.env.local` 의 `DATABASE_PROVIDER=sqlite`, `DATABASE_URL=file:./dev.db`
- **When**: `npx prisma migrate dev --name init` 실행
- **Then**: `prisma/dev.db` 파일 생성. `prisma/migrations/` 디렉토리에 마이그레이션 파일 생성

### Scenario 2: Supabase PostgreSQL — 동일 마이그레이션 적용
- **Given**: Vercel 배포 환경 (`DATABASE_PROVIDER=postgresql`)
- **When**: `npx prisma migrate deploy` 실행
- **Then**: Supabase DB 에 동일 스키마 적용. 에러 0건

### Scenario 3: Prisma Client 싱글톤 — Hot Reload 안전
- **Given**: Next.js 개발 서버 (`npm run dev`)
- **When**: 코드 변경 → Hot Reload 10회 발생
- **Then**: Prisma Client 인스턴스가 1개만 유지 (메모리 누수 0). `globalThis.prisma` 패턴 정상 동작

### Scenario 4: DATABASE_URL 누락 시 빌드 차단
- **Given**: `.env` 또는 Vercel 에서 `DATABASE_URL` 누락
- **When**: `npm run build` 실행
- **Then**: 빌드 명시적 에러로 실패. 누락 변수명 명시 (lib/env.ts 의 zod 검증)

### Scenario 5: Vercel cold start — 연결 풀 안정
- **Given**: `?pgbouncer=true&connection_limit=1` 설정
- **When**: 100 동시 Vercel Functions 호출
- **Then**: 연결 폭주 0건. PgBouncer 가 Supabase 연결을 효율 관리

### Scenario 6: 마이그레이션 idempotency
- **Given**: 마이그레이션 1회 적용 완료
- **When**: 동일 명령 재실행
- **Then**: "No pending migrations" 출력. DB 변경 0

### Scenario 7: 헬스체크 응답
- **Given**: 정상 환경
- **When**: `GET /api/health/db`
- **Then**: 200 + `{ ok: true, provider: 'postgresql' or 'sqlite' }`

### Scenario 8: provider 미지원 컬럼 타입 사용 시 빌드 차단
- **Given**: 누군가 `Json` 타입을 schema 에 추가 (SQLite 미지원)
- **When**: `prisma migrate dev` (SQLite 환경)
- **Then**: Prisma CLI 가 호환성 에러 출력. 빌드 차단

## :gear: Technical & Non-Functional Constraints
- **단일 schema 파일 정책 (C-TEC-003)**: 양 환경에서 동일 schema.prisma 사용. 환경별 분기 금지
- **provider 환경 변수화**: schema 의 provider 값을 hardcoding 하지 않고 `env("DATABASE_PROVIDER")` 사용
- **싱글톤 패턴**: `globalThis` 활용으로 Next.js Hot Reload 시 메모리 누수 방지
- **Vercel + Supabase 권장 설정**:
  - `?pgbouncer=true` — connection pool 활용
  - `?connection_limit=1` — Function 당 단일 연결
  - `directUrl` 분리 — 마이그레이션은 직접 연결
- **로깅 정책**: 개발 환경만 `query` 로깅. 운영은 `error` 만 (성능 + 보안)
- **마이그레이션 보존**: 모든 마이그레이션 파일 git 커밋. 운영 환경에서 직접 SQL 수정 금지
- **호환성 매트릭스**: SQLite 미지원 기능 (Json, Array, ENUM 의 일부 변형) 회피. 양 환경에서 동일 동작하는 컬럼 타입만 사용
- **응답 시간**: Prisma 쿼리 p95 < 100ms (단순 SELECT). 인덱스 활용 강제
- **금지**:
  - schema 분기 (`schema.sqlite.prisma`, `schema.postgres.prisma` 분리)
  - DB 직접 수정 (마이그레이션 우회)
  - 운영 환경에서 `migrate dev` 사용 (deploy 만)

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 전부 통과
- [ ] Prisma 설치 + schema.prisma 초기화 + provider 환경 변수화
- [ ] 양 환경 (SQLite + PostgreSQL) 마이그레이션 적용 검증
- [ ] `lib/db.ts` 싱글톤 패턴 + Hot Reload 안전 검증
- [ ] `.env.example` 커밋 (`.env.local` `.gitignore`)
- [ ] Vercel 3환경 (Prod/Preview/Dev) 환경변수 등록
- [ ] DIRECT_URL 분리 정책 적용
- [ ] `lib/env.ts` 환경 검증 통과
- [ ] 헬스체크 `/api/health/db` 200 OK
- [ ] `docs/db-compat.md` 호환성 매트릭스 작성
- [ ] PR 본문에 "모든 후속 DB 모델의 기반 인프라" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-VC-001 (Vercel 프로젝트)
  - IF-SUP-001 (Supabase 프로젝트)
- **Blocks**:
  - CT-DB-002, 003, 004, 005, 006, 007, 008, 009 (모든 DB 모델)
  - CT-DB-010 (마이그레이션 + 시드)
  - CT-DB-011 (Supabase RLS)
  - 모든 Prisma 사용 코드 (FW-AUTH-002, FW-OX-001, FW-PROG-001 등)
