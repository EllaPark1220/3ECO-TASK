# [Feature] CT-DB-010: 초기 마이그레이션 + 시드 통합 스크립트 + Vercel build hook

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] CT-DB-010: 초기 마이그레이션 단일 SQL + 시드 + verify 통합 + Vercel deploy hook"
labels: 'feature, backend, db, migration, infra, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [CT-DB-010] CT-DB-001~009 의 모든 모델·제약·인덱스를 단일 마이그레이션으로 통합 + 시드 (Module + Lesson + OxQuestion + admin 사용자) + verify 검증 + Vercel deploy 시점 자동 적용
- **목적**: Alpha 배포 시점에 Supabase prod 인스턴스가 즉시 운영 가능 상태가 되도록 모든 DB 셋업을 자동화. 마이그레이션 실수·누락·순서 오류 방지. 단일 제작자(CON-08) 가 `git push` 한 번으로 prod DB 스키마·콘텐츠·관리자 사용자가 모두 준비되도록 한다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.1.2` — C-TEC-003 (Prisma + 양 환경)
  - `/docs/SRS_V0_9.md#6.2` — 데이터 모델 전체
  - `/docs/SRS_V0_9.md#6.7` — Alpha Exit (시드 정합)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-08 (단일 제작자 자동화)
- 외부 문서: `https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding`
- 선행: CT-DB-001~009 (모든 스키마), CT-MOCK-001 (Lesson 시드)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **마이그레이션 통합 정책**:
  - 개발 단계 — 각 모델 PR 마다 별도 마이그레이션 생성 (`prisma migrate dev`)
  - **prod 첫 배포 전** — 모든 마이그레이션을 단일 `_init` 마이그레이션으로 squash (선택). 또는 순차 적용 그대로 유지
  - 본 태스크는 **순차 적용 채택** (마이그레이션 이력 보존). prod 에서 `prisma migrate deploy` 가 누적 적용
- [ ] **시드 스크립트 통합** — `prisma/seed/index.ts`:
  ```ts
  import { PrismaClient } from '@prisma/client';
  import { seedModules } from './modules';
  import { seedLessons } from './lessons';
  import { seedOxQuestions } from './ox-questions';
  import { seedAdminUser } from './admin-user';

  const prisma = new PrismaClient();

  async function main() {
    console.log('Seeding...');

    // 1. Modules (M1~M5)
    await seedModules(prisma);

    // 2. Admin user (운영자 1명 — ADMIN role)
    await seedAdminUser(prisma);

    // 3. Lessons (L001~L010) — CT-MOCK-001 활용
    await seedLessons(prisma);

    // 4. OxQuestions (50건)
    await seedOxQuestions(prisma);

    console.log('Seeding done.');
  }

  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
  ```
- [ ] **admin user 시드 — `prisma/seed/admin-user.ts`**:
  - **prod 환경 정책** — 환경변수의 `ADMIN_EMAIL` + Supabase Auth 의 admin API 로 사용자 생성 후 `public.User.role = 'ADMIN'` UPDATE
  - **dev 환경 정책** — 더미 admin (예: `admin@example.com`) 생성. 비밀번호는 환경변수 `ADMIN_DEV_PASSWORD`
  - admin 1명만 시드 (개인사업자 단일 운영자)
- [ ] **package.json**:
  ```json
  {
    "prisma": {
      "seed": "tsx prisma/seed/index.ts"
    },
    "scripts": {
      "db:reset": "prisma migrate reset --force",
      "db:push": "prisma db push",
      "db:migrate": "prisma migrate dev",
      "db:deploy": "prisma migrate deploy",
      "db:seed": "prisma db seed",
      "db:seed:verify": "tsx prisma/seed/verify.ts",
      "db:setup": "prisma migrate deploy && prisma db seed && tsx prisma/seed/verify.ts"
    }
  }
  ```
- [ ] **Vercel build hook 통합 — Build Command 갱신**:
  - 옵션 A — `npm run build` 가 자체적으로 마이그레이션 적용 (권장 안 함 — 빌드와 DB 작업 분리 원칙)
  - **옵션 B (채택)** — Vercel 의 `vercel.json` 또는 별도 GitHub Action 으로 main push 시 `prisma migrate deploy` 자동 실행. 시드는 수동 (한 번만)
  - 본 태스크는 **GitHub Action 의 별도 deploy Job 채택**:
    ```yaml
    deploy-db:
      runs-on: ubuntu-latest
      if: github.ref == 'refs/heads/main'
      needs: [lint, typecheck, unit-test, integration-test, static-analysis]
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
        - run: npm ci
        - run: npx prisma migrate deploy
          env:
            DATABASE_URL: ${{ secrets.PROD_DIRECT_URL }}
    ```
- [ ] **시드 idempotency 강제**:
  - 모든 시드 함수가 upsert 사용
  - 재실행 안전 — prod 에서도 부담 없이 재시드 가능
- [ ] **verify.ts 통합 (CT-MOCK-001 의 무결성 검증)**:
  - 마이그레이션 + 시드 후 자동 verify 실행
  - 7개 검증 항목 (Lesson 10편·OX 5문항·후킹 키워드 부재 등) 통과 시만 deploy 성공
- [ ] **rollback 정책**:
  - 마이그레이션 적용 후 critical 버그 시 — Prisma 의 `migrate resolve --rolled-back` + 수동 SQL
  - 본 프로젝트 규모는 자동 rollback 미구현. 백업 (Supabase Free 7일 자동 백업) 활용
- [ ] **테스트**:
  - 로컬 — `npm run db:reset && npm run db:setup` 으로 클린 셋업 검증
  - Staging Preview — PR 마다 자동 적용
  - Prod — main merge 시 자동 적용

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 클린 환경 — 단일 명령으로 셋업
- **Given**: 빈 DB
- **When**: `npm run db:setup`
- **Then**: 마이그레이션 + 시드 + verify 모두 성공. Module 5 + Lesson 10 + OxQuestion 50 + admin 1 INSERT

### Scenario 2: 마이그레이션 적용 순서
- **Given**: CT-DB-001~009 의 마이그레이션 파일들
- **When**: `prisma migrate deploy`
- **Then**: 의존성 순서대로 적용 (User → Lesson → LessonProgress → ...). FK 위반 0건

### Scenario 3: 시드 idempotency
- **Given**: 이미 시드된 DB
- **When**: `npm run db:seed` 재실행
- **Then**: upsert 로 중복 INSERT 거부. 데이터 동일 유지

### Scenario 4: verify 실패 시 deploy 차단
- **Given**: 시드 후 OxQuestion 49건만 (1건 누락)
- **When**: verify 실행
- **Then**: 에러 throw — "OX 카운트 49 (기대 50)". CI Job Fail. Production deploy 차단

### Scenario 5: GitHub Actions deploy-db Job
- **Given**: main 브랜치 merge
- **When**: GitHub Action 실행
- **Then**: deploy-db Job 이 5종 quality Job 통과 후 실행. prod Supabase 에 마이그레이션 적용

### Scenario 6: Staging vs Prod 환경 분리
- **Given**: PR 생성
- **When**: deploy-db Job
- **Then**: Production deploy Job 은 main merge 시만 실행. PR 은 staging 만 (선택 — Preview Supabase 별도)

### Scenario 7: admin 사용자 정책 — prod 환경
- **Given**: prod 시드
- **When**: `seedAdminUser`
- **Then**: ADMIN_EMAIL 환경변수의 사용자가 Supabase Auth + public.User 양쪽 INSERT. role='ADMIN'

### Scenario 8: rollback — Supabase 백업 활용
- **Given**: 마이그레이션 적용 후 critical 버그
- **When**: Supabase Dashboard 의 백업 복원
- **Then**: 7일 이내 시점으로 복원 가능

### Scenario 9: 마이그레이션 idempotency
- **Given**: 이미 마이그레이션 적용된 prod
- **When**: `prisma migrate deploy` 재실행
- **Then**: "No pending migrations". 변경 0

### Scenario 10: 로컬 reset 안전
- **Given**: 로컬 SQLite 환경
- **When**: `npm run db:reset` (개발 전용)
- **Then**: 모든 데이터 삭제 + 재셋업. prod 영향 0 (별도 환경)

## :gear: Technical & Non-Functional Constraints
- **단일 명령 셋업**: `npm run db:setup` 으로 마이그레이션 + 시드 + verify 통합
- **deploy-db Job 정책**:
  - main merge 시만 실행
  - 5 quality Job 통과 후 실행 (`needs:` 의존성)
  - DIRECT_URL 사용 (PgBouncer 우회)
- **시드 idempotency 강제**: 모든 시드 함수 upsert. 재실행 안전
- **verify 자동 실행**: 시드 직후 verify. 실패 시 deploy 중단
- **rollback 정책**: 자동 rollback 미구현. Supabase 백업 + 수동 마이그레이션 resolve
- **prod admin 정책**:
  - ADMIN_EMAIL 환경변수의 1명만 시드
  - Supabase Auth + public.User 양쪽 sync
- **dev admin 정책**:
  - 더미 사용자 (`admin@example.com`)
  - ADMIN_DEV_PASSWORD 환경변수
- **마이그레이션 squash (선택)**: prod 첫 배포 전 squash 가능. 본 태스크는 순차 적용 채택 (이력 보존)
- **응답 시간**: 마이그레이션 + 시드 합산 ≤ 30초 (prod 환경, Lesson 10편 기준)
- **금지**:
  - prod DB 직접 SQL 수정 (마이그레이션 우회)
  - 시드를 매 deploy 재실행 (수동 1회만 권장. 단 idempotency 보장은 함)
  - rollback 자동화 시도 (마이그레이션 무결성 위험)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `prisma/seed/index.ts` 통합 시드
- [ ] admin-user 시드 (prod·dev 분리)
- [ ] `package.json` 6개 db scripts
- [ ] GitHub Action 의 deploy-db Job 통합
- [ ] verify 자동 실행 + 실패 시 차단
- [ ] 로컬 `npm run db:setup` 동작
- [ ] prod 첫 배포 시 (Alpha 진입) 마이그레이션 + 시드 + verify 정상
- [ ] rollback SOP 문서화 (Supabase 백업 활용)
- [ ] PR 본문에 "Alpha 배포 자동화의 마지막 인프라" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-001~009 (모든 모델)
  - CT-MOCK-001 (Lesson·OxQuestion 시드)
  - IF-VC-001 (Vercel)
  - IF-SUP-001 (Supabase)
  - IF-CI-001 (quality.yml)
- **Blocks**:
  - **Alpha 배포 자동화 완성** — main merge 시 prod DB 자동 셋업
  - 모든 후속 운영 (Alpha 시작점)
  - CT-DB-011 (RLS 정책 — 본 마이그레이션 후 별도 적용)
- **Related**:
  - SRS Alpha Exit (시드 정합성)
  - rollback SOP (Supabase 백업 + 수동 마이그레이션 resolve)
