# [Feature] NF-SEC-003: 환경변수·시크릿 관리 — Vercel + GitHub Secrets + .env.example + 노출 차단

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] NF-SEC-003: 환경변수·시크릿 관리 정책 — Vercel 환경변수 + GitHub Secrets + .env.example + Server-only enforce + git ignore + 분기 회전"
labels: 'nf, security, secrets, env, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-SEC-003] 환경변수·시크릿 관리 통합 정책 — (1) Vercel 환경변수 + GitHub Secrets 분리 + (2) `.env.example` 의무 + (3) Server-only enforce (NEXT_PUBLIC prefix 정책) + (4) `.gitignore` 의 `.env*` 보호 + (5) 분기별 시크릿 회전 SOP
- **목적**: OWASP Top 10 의 Cryptographic Failures + Sensitive Data Exposure 대응. 시크릿 (API 키·DB 패스워드·JWT secret) 의 git 노출 또는 클라이언트 번들 노출은 즉시 critical 보안 사고. 자동 정책 + 운영자 SOP 로 차단.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-014 (PII 보호)
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-AUTH·D-TIER (환경변수 활용)
- 외부:
  - https://vercel.com/docs/projects/environment-variables
  - https://docs.github.com/en/actions/security-guides/encrypted-secrets
- 선행: IF-VC-001 (Vercel), IF-CI-001 (CI), IF-GEM-001 (Gemini key)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **시크릿 분류 — 5 카테고리**:
  | 카테고리 | 예시 | 저장 위치 | NEXT_PUBLIC |
  |---|---|---|---|
  | DB | DATABASE_URL, DIRECT_URL | Vercel + GitHub | ❌ |
  | Auth | SUPABASE_SERVICE_ROLE_KEY | Vercel + GitHub | ❌ |
  | LLM | GOOGLE_GENERATIVE_AI_API_KEY | Vercel + GitHub | ❌ |
  | Email | RESEND_API_KEY | Vercel + GitHub | ❌ |
  | Cron | CRON_SECRET | Vercel + GitHub | ❌ |
  | Public | NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL | Vercel + GitHub | ✅ |
  | Public | NEXT_PUBLIC_SUPABASE_ANON_KEY | Vercel + GitHub | ✅ |

- [ ] **`.env.example` 의무 작성** — repo 의 시크릿 catalog:
  ```bash
  # .env.example (실제 값 없음 — 예시만)

  # === DB ===
  DATABASE_URL=postgresql://user:password@host:port/db?pgbouncer=true
  DIRECT_URL=postgresql://user:password@host:port/db

  # === Supabase ===
  NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
  SUPABASE_SERVICE_ROLE_KEY=eyJxxx...  # ⚠️ Server-only

  # === LLM ===
  GOOGLE_GENERATIVE_AI_API_KEY=AIzaSyxxx  # ⚠️ Server-only

  # === Email ===
  RESEND_API_KEY=re_xxx  # ⚠️ Server-only

  # === Cron ===
  CRON_SECRET=random-uuid-here  # ⚠️ Server-only

  # === App ===
  NEXT_PUBLIC_APP_URL=https://economic-judgment.app

  # === 운영자 ===
  OPERATOR_EMAIL=ella@example.com  # 알림 수신
  ```

- [ ] **`.gitignore` 의 `.env*` 보호**:
  ```gitignore
  # 환경변수
  .env
  .env.local
  .env.*.local
  .env.production
  .env.staging
  # .env.example 만 git 추적
  !.env.example
  ```

- [ ] **빌드 시점 환경변수 검증 — `lib/env.ts`** (zod):
  ```ts
  import { z } from 'zod';

  const EnvSchema = z.object({
    // Server-only
    DATABASE_URL: z.string().url(),
    DIRECT_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(40),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().startsWith('AIzaSy'),
    RESEND_API_KEY: z.string().startsWith('re_'),
    CRON_SECRET: z.string().min(32),
    OPERATOR_EMAIL: z.string().email(),

    // Public
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(40),
  });

  // 빌드 시점 검증 — 누락 시 빌드 fail
  export const env = EnvSchema.parse(process.env);
  ```

- [ ] **NEXT_PUBLIC prefix 정책 enforce**:
  - Server-only 시크릿에 `NEXT_PUBLIC_` 절대 사용 금지
  - 정적 분석 — 본 환경변수 catalog 와 코드 매칭 검증 (선택, 별도 후속)
  - 위반 시 즉시 회전 (분실로 간주)

- [ ] **클라이언트 번들 검사 — CI step**:
  ```yaml
  # IF-CI-001 의 추가 step
  - name: Check client bundle for secrets
    run: |
      npm run build
      # 빌드된 파일에 시크릿 패턴 검색
      if grep -rE 'SUPABASE_SERVICE_ROLE|GOOGLE_GENERATIVE_AI_API_KEY|RESEND_API_KEY|CRON_SECRET' .next/static/; then
        echo "❌ 클라이언트 번들에 시크릿 노출"
        exit 1
      fi
      echo "✓ 클라이언트 번들 시크릿 부재"
  ```

- [ ] **분기별 시크릿 회전 SOP — `docs/secret-rotation-sop.md`**:
  ```markdown
  # 시크릿 회전 SOP

  ## 빈도
  - 정기: 분기 1회 (DR drill 과 함께)
  - 비상: 시크릿 노출 의심 시 즉시

  ## 절차
  1. 새 시크릿 발급 (해당 SaaS Console)
  2. Vercel 환경변수 갱신 (Production / Preview / Development 모두)
  3. GitHub Secrets 갱신
  4. 이전 시크릿 폐기 (해당 SaaS Console — revoke)
  5. 빌드 재배포 (Vercel 자동)
  6. health check (Smoke test 5 페이지)
  7. EventLog `secret.rotated` 발행

  ## 노출 의심 시
  1. 즉시 회전 + 이전 시크릿 revoke (절차 5분 내)
  2. 영향 범위 분석 — 이전 시크릿으로 가능했던 작업 추적
  3. 사용자 통지 (필요 시)
  4. 사후 분석 보고서 — `docs/security-incident-YYYY-MM-DD.md`
  ```

- [ ] **시크릿 노출 감지 — git history 검사**:
  ```bash
  # git history 에 .env 노출 검사
  git log --all -p | grep -E '(SUPABASE_SERVICE_ROLE_KEY|GOOGLE_GENERATIVE|RESEND_API)=[^"]+' && {
    echo "❌ git history 에 시크릿 노출 감지"
    exit 1
  }
  ```
  - 발견 시 — git filter-branch 또는 BFG Repo-Cleaner 활용 (단 GitHub 의 cache 는 영구 — 시크릿 즉시 회전이 더 빠른 해결)

- [ ] **운영자 시크릿 access 제한**:
  - Vercel 의 시크릿 — 본인 (Owner) 만 접근
  - GitHub Secrets — 본인 + Settings 권한자만
  - 본인 외 외주자 (있을 경우) — 별도 시크릿 (제한적 권한) 발급

- [ ] **Sentry / Slack 등 외부 알림 통합 시크릿 별도 관리**: NF-OBS-* (그룹 14·15) 와 정합

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: .env.example 작성
- **Given**: repo
- **When**: ls .env.example
- **Then**: 존재 + 모든 시크릿 catalog (실제 값 없음)

### Scenario 2: .gitignore 보호
- **Given**: .env, .env.local
- **When**: git status
- **Then**: tracked 0

### Scenario 3: 빌드 시점 환경변수 검증
- **Given**: DATABASE_URL 누락
- **When**: build
- **Then**: zod parse 실패 + 빌드 fail

### Scenario 4: NEXT_PUBLIC prefix 정책
- **Given**: 코드 검사
- **When**: SUPABASE_SERVICE_ROLE 활용 시 NEXT_PUBLIC prefix 검증
- **Then**: Server-only 코드 (Server Action·Route) 만 활용

### Scenario 5: 클라이언트 번들 시크릿 부재
- **Given**: 빌드된 .next/static
- **When**: grep 검사
- **Then**: 시크릿 패턴 0

### Scenario 6: git history 시크릿 부재
- **Given**: git log
- **When**: 검사
- **Then**: 시크릿 노출 0

### Scenario 7: 분기 회전 SOP 실행
- **Given**: 분기 첫 토요일
- **When**: 회전
- **Then**: 모든 절차 + EventLog `secret.rotated`

### Scenario 8: 노출 의심 시 비상 회전 — 5분 내
- **Given**: 의심
- **When**: 회전
- **Then**: 5분 내 완료

### Scenario 9: 운영자 access 제한
- **Given**: Vercel · GitHub
- **When**: 권한 검사
- **Then**: 본인만

### Scenario 10: SOP 문서
- **Given**: docs/secret-rotation-sop.md
- **When**: 검토
- **Then**: 절차 + 빈도 + 비상 절차 명시

## :gear: Technical & Non-Functional Constraints
- **5 카테고리 분류 + Server-only / Public 명확**
- **`.env.example` 의무 — repo catalog**
- **`.gitignore` 보호**
- **빌드 시점 zod 검증 — 누락 시 fail**
- **클라이언트 번들 시크릿 부재 검증 (CI step)**
- **분기 회전 + 비상 회전 (5분)**
- **git history 시크릿 부재 검증**
- **NEXT_PUBLIC prefix 정책 — Server-only 시크릿 0 사용**
- **금지**:
  - .env 직접 git commit
  - NEXT_PUBLIC + Server-only 시크릿 조합
  - 시크릿 노출 후 회전 안함
  - SOP 없이 회전
  - 분기 회전 누락

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] .env.example 작성
- [ ] .gitignore 보호
- [ ] lib/env.ts zod 검증
- [ ] CI step — 클라이언트 번들 검사
- [ ] git history 검사 (1회 + 분기)
- [ ] secret-rotation-sop.md 문서
- [ ] 분기 회전 캘린더 등록
- [ ] PR 본문에 "OWASP Cryptographic Failures 대응 + 분기 회전" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-VC-001 (Vercel)
  - IF-CI-001 (CI step)
  - IF-GEM-001 (Gemini)
  - IF-RES-001 (Resend)
- **Blocks**:
  - 시크릿 노출 위험 mitigation
  - REQ-NF-014 충족
- **Related**:
  - NF-SEC-001 (인증)
  - DR drill (분기 통합)
