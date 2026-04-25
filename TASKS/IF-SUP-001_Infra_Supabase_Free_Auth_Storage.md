# [Infra] IF-SUP-001: Supabase Free 프로젝트 + Auth 활성화 + Storage 버킷 + DB 연결

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Infra] IF-SUP-001: Supabase Free 프로젝트 + Auth (이메일·비밀번호) + Storage (teacher-kit 버킷) + DB 연결 정보"
labels: 'infra, supabase, auth, storage, db, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-SUP-001] Supabase Free 프로젝트 생성 + Auth 활성화 (이메일·비밀번호 + Email 확인) + Storage 버킷 (`teacher-kit` Public + `assets` Private) + Vercel 통합 환경변수 추출
- **목적**: ADR-004 의 Supabase 측 구현. D-AUTH (자체 bcrypt 관리 없음) + FR-PDF-001 (PDF 2단 캐시의 L2) + CT-DB-002·005·007 등 모든 DB 의 PostgreSQL 인스턴스 제공. Supabase Free 한도 (DB 500MB, Storage 1GB, Auth 50K MAU, Bandwidth 5GB/월) 내 운영. R10 (Supabase pause 정책) 의 인지 + IF-CRON-001 의 keepalive 와 정합.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.1.2` — C-TEC-002 (Supabase), D-AUTH (Supabase Auth), D-TIER
  - `/docs/SRS_V0_9.md#1.5.1` — ADR-004 (단일 풀스택)
  - `/docs/SRS_V0_9.md#6.6` — R10 (Supabase pause)
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-017, 019 (비밀번호·세션)
- 외부 문서:
  - `https://supabase.com/docs/guides/auth/server-side/nextjs`
  - `https://supabase.com/docs/guides/storage`
- 선행: IF-VC-001 (Vercel — 환경변수 등록 대상)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Supabase 계정 생성** — 개인 GitHub 연동 (ADR-001 개인사업자 정합)
- [ ] **2개 프로젝트 생성**:
  - `economy-textbook-prod` — Production
  - `economy-textbook-staging` — Preview·Development 공용
- [ ] **각 프로젝트 region 선택** — `Northeast Asia (Seoul)` (한국 사용자 latency 최소화)
- [ ] **Auth 설정**:
  - **Email/Password 활성화** — 기본 Provider
  - **Email 확인 강제 ON** — 가입 후 메일 클릭 필수
  - **JWT 만료 1시간** (REQ-NF-019)
  - **Refresh token 만료 30일**
  - **Password 최소 8자**
  - **외부 OAuth 비활성** (Google·GitHub 등 — REQ-NF-014 PII 최소)
  - **Auth Email 템플릿** — 한국어 (가입 확인·비밀번호 재설정·매직 링크). REQ-NF-007 정합
  - **Site URL** — Production: `https://economy-textbook.kr` (또는 Vercel 도메인). Staging: `*.vercel.app`
  - **Redirect URLs** — `https://{vercel}/auth/callback` 등록
- [ ] **Storage 버킷 생성**:
  - **`teacher-kit` (Public bucket)** — PDF 2단 캐시의 L2. 익명 read 허용. write 는 Service Role Key 만
  - **`assets` (Private bucket)** — 향후 추가 자산. 본 태스크는 빈 버킷만 생성
- [ ] **Storage 정책 (RLS)**:
  - `teacher-kit` — read: anyone, write: service_role
  - `assets` — read: authenticated user, write: service_role
  - 본 태스크는 정책 정의만, Supabase Dashboard 의 Storage Policies 에서 설정
- [ ] **DB 연결 정보 추출**:
  - **Connection string (Pooled)** — Vercel Functions 용 (`?pgbouncer=true&connection_limit=1`)
  - **Connection string (Direct)** — 마이그레이션 용 (`directUrl`)
  - **Service Role Key** — admin 작업 (절대 클라이언트 노출 금지)
  - **Anon Key** — 클라이언트 SSR
  - **Project URL** — `https://{project}.supabase.co`
- [ ] **Vercel 환경변수 등록 (IF-VC-001 의 3환경)**:
  - Production — prod 프로젝트 키
  - Preview·Development — staging 프로젝트 키
  - 9개 환경변수 매핑 (DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY 등)
- [ ] **Free 한도 인지**:
  - DB 500MB (Lesson 10편 + 사용자 1000명 + EventLog 100K = 약 100MB 예상 — 한도 내)
  - Storage 1GB (PDF 125편 × 2MB = 250MB — 한도 내)
  - Auth 50K MAU (Stage 1 KPI 1000명 — 한도 내)
  - Bandwidth 5GB/월
- [ ] **R10 Supabase pause 대응**:
  - Free 프로젝트는 7일 무활동 시 자동 pause
  - IF-CRON-001 의 5분 warmup 이 본 인스턴스 hit 하도록 설정
  - 또는 별도 keepalive cron (5분 간격으로 `SELECT 1` 쿼리)
- [ ] **백업 정책**:
  - Free 플랜은 자동 백업 7일 보존
  - 추가 백업은 수동 (`pg_dump`)
  - Pro 전환 시 Point-in-Time Recovery 활성
- [ ] **모니터링**:
  - Supabase Dashboard 의 Usage 페이지 주 1회 확인
  - DB 크기·Storage·Auth MAU·Bandwidth 측정
- [ ] **헬스체크 통합** — `/api/health/supabase` 라우트로 Auth + DB + Storage 응답 검증

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 2개 프로젝트 생성 + region
- **Given**: Supabase 계정
- **When**: 프로젝트 생성
- **Then**: prod + staging 2개. Region 모두 `Northeast Asia (Seoul)`

### Scenario 2: Auth 정상 동작
- **Given**: Auth 활성화 + Email 확인 ON
- **When**: `auth.signUp({ email, password })` 호출 (FW-AUTH-002)
- **Then**: 사용자 생성 + 확인 메일 발송 (한국어). 클릭 전 로그인 차단

### Scenario 3: Storage 버킷 — teacher-kit 익명 read
- **Given**: `teacher-kit` 버킷 + 정책 설정
- **When**: 익명 사용자가 `https://{project}.supabase.co/storage/v1/object/public/teacher-kit/L001.pdf` 접근
- **Then**: 200 응답. PDF 다운로드 가능

### Scenario 4: Storage 버킷 — write 차단
- **Given**: 동일 버킷
- **When**: 익명 사용자가 PUT 요청
- **Then**: 403. Service Role Key 만 허용

### Scenario 5: Vercel 환경변수 매핑
- **Given**: Vercel 의 3환경
- **When**: 각 환경변수 확인
- **Then**: Production 은 prod Supabase, Preview·Development 는 staging Supabase

### Scenario 6: Pooled vs Direct URL 분리
- **Given**: 환경변수 등록
- **When**: 마이그레이션 (`prisma migrate deploy`) 실행
- **Then**: DIRECT_URL 사용 (PgBouncer 우회). Functions 런타임은 Pooled URL

### Scenario 7: Free 한도 모니터링
- **Given**: 1주일 운영
- **When**: Supabase Dashboard Usage 확인
- **Then**: DB·Storage·Auth·Bandwidth 모두 한도 80% 미만

### Scenario 8: pause 회피 (R10)
- **Given**: 7일 무활동 시뮬레이션 (또는 IF-CRON-001 비활성)
- **When**: 추적
- **Then**: IF-CRON-001 의 5분 warmup 이 본 인스턴스 hit. pause 0건

### Scenario 9: 헬스체크 응답
- **Given**: 정상 환경
- **When**: `GET /api/health/supabase`
- **Then**: 200 + `{ ok: true, auth: 'ok', db: 'ok', storage: 'ok' }`

### Scenario 10: 한국어 Auth Email
- **Given**: 가입 시
- **When**: 확인 메일 수신
- **Then**: 한국어 본문. 제목 "이메일 인증을 완료해주세요" 같은 자연 한국어

## :gear: Technical & Non-Functional Constraints
- **2 프로젝트 분리 정책**: prod + staging 분리. PR 데이터가 prod 오염 절대 금지
- **Region 일치**: Vercel Functions (Tokyo/Seoul) 와 Supabase (Seoul) 동일 region — latency 최소화
- **Auth 정책**:
  - Email/Password + Email 확인 ON
  - 외부 OAuth 비활성 (PII 최소)
  - 한국어 Email 템플릿
- **Storage 버킷 정책**:
  - `teacher-kit` Public — CC BY-NC-SA 4.0 라이선스 정합
  - `assets` Private — 향후 사용자별 자산 (Stage 2 가능성)
- **Free 한도 관리**:
  - DB 500MB — EventLog 가 가장 빠르게 성장 가능. 90 일 retention 정책 (별도 cron)
  - Storage 1GB — PDF 캐시 누적 모니터링
  - Bandwidth 5GB/월 — Edge 캐시 (Vercel) 가 우선 처리하므로 Supabase 측 부하 미미
- **R10 pause 대응**: IF-CRON-001 의 5분 warmup 이 핵심. Free 플랜 유지 위함
- **백업 정책**: Free 자동 백업 7일. critical 마일스톤 (Alpha Exit·Closed Beta 등) 시 수동 pg_dump
- **Service Role Key 보안**:
  - Vercel 환경변수만 (절대 git 커밋 금지)
  - 클라이언트 번들 미포함 검증 (FW-AUTH-001 의 격리 정책)
- **Pro 전환 트리거**:
  - DB 400MB 도달 (한도의 80%)
  - Bandwidth 4GB/월 도달
  - Auth MAU 40K 도달
  - 신규 기능 — Realtime, Edge Functions 필요
- **금지**:
  - Service Role Key 클라이언트 노출
  - prod 와 staging Supabase 인스턴스 혼용
  - Free 한도 초과 시 데이터 손실 위험 (Pro 전환 또는 retention 정책 필수)
  - 외부 OAuth 활성화 (PII 최소 위반)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] prod + staging 2개 프로젝트 생성 + Seoul region
- [ ] Auth 정책 (Email + 8자 + 한국어 템플릿 + OAuth 비활성) 적용
- [ ] Storage 2개 버킷 + RLS 정책
- [ ] Vercel 환경변수 9개 매핑 (3환경)
- [ ] Pooled + Direct URL 분리
- [ ] 헬스체크 `/api/health/supabase` 200 OK
- [ ] R10 pause 대응 — IF-CRON-001 통합 (별도 PR 가능)
- [ ] Free 한도 모니터링 셋업
- [ ] 백업 정책 문서화 (Pro 전환 트리거 + 수동 pg_dump SOP)
- [ ] PR 본문에 "ADR-004 의 Supabase 측 구현. R10 pause 대응 핵심" 명시

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-VC-001 (Vercel 환경변수 등록 대상)
- **Blocks**:
  - CT-DB-001 (Prisma DATABASE_URL)
  - CT-DB-011 (RLS 정책 — Supabase 인스턴스 위에 적용)
  - FW-AUTH-001 (Supabase Auth 클라이언트)
  - FR-PDF-001 (PDF 2단 캐시 L2 — Storage 활용)
  - FW-PDF-001 (Storage 업로드)
  - IF-CRON-001 (warmup — Supabase pause 회피 위함)
  - 모든 후속 DB·Auth·Storage 사용
- **Related**:
  - R10 (Supabase pause)
  - D-TIER (Pro 전환 트리거)
