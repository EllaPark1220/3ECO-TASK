# [Feature] FR-AUTH-002: RBAC 가드 미들웨어 — learner/teacher/admin 라우트 분리

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-AUTH-002: RBAC 가드 미들웨어 — learner/teacher/admin 라우트 분리 (Server Action + Route Handler 양측)"
labels: 'feature, backend, auth, security, rbac, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-AUTH-002] 라우트별 권한 검증 가드 함수 — Server Action 진입 시점 + Route Handler GET/POST 시점 양쪽에서 사용자 role 을 검증하여 무권한 접근 차단
- **목적**: REQ-NF-021 (RBAC 3역할) 및 INV-07 (LEARNER 의 TeacherFeedback·TeacherKitDownload 생성 금지) 를 코드 레이어에서 강제. 본 가드는 §6.1 의 모든 API 엔드포인트가 일관된 권한 검증을 거치도록 하는 단일 진실 공급원이며, 누락 시 데이터 격리가 무너지는 보안 핵심.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-021 (RBAC 3역할)
  - `/docs/SRS_V0_9.md#6.2.3` — INV-07 (역할 격리)
  - `/docs/SRS_V0_9.md#3.6.2` — Component 책임 매트릭스 Auth 행
  - `/docs/SRS_V0_9.md#6.1` — 각 엔드포인트별 인증·권한 컬럼
  - `/docs/SRS_V0_9.md#5.3` — ADR-001 (개인사업자) → admin 역할 단일 운영자
- 선행 결정: D-AUTH (Supabase Auth Role 통합)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/auth/guards.ts` — 가드 함수 4종 정의:
  - `requireUser()` — 인증된 사용자만 (역할 무관). 미인증 시 401
  - `requireRole(role: Role)` — 특정 역할 (`LEARNER` | `TEACHER` | `ADMIN`)
  - `requireRoleAny(roles: Role[])` — 역할 OR 조건
  - `requireSelfOrAdmin(userId: string)` — 본인 또는 관리자만 접근
- [ ] 각 가드는 Supabase Auth 세션 → User 테이블 role 컬럼 조회 → 검증 로직
- [ ] **세션 캐싱**: 동일 요청 내 가드 다중 호출 시 DB 조회 1회로 제한 (`React.cache` 또는 request-scoped cache)
- [ ] Server Action 가드 헬퍼 — 각 Server Action 함수 첫 줄에서 호출. 실패 시 throw 후 에러 응답 변환
- [ ] Route Handler 가드 헬퍼 — `withRoleGuard(handler, role)` 고차 함수 wrapper
- [ ] 미들웨어(`middleware.ts`) 통합 — 정적 라우트 패턴 매칭 (`/teacher/**` → TEACHER 강제, `/admin/**` → ADMIN 강제)
- [ ] 에러 응답 표준화 — 401 (인증 없음) vs 403 (권한 없음) 명확 구분
- [ ] 감사 로그 — 권한 거부 시 EventLog 에 `auth.access_denied` 기록 (의심스러운 접근 감지)
- [ ] 테스트 픽스처 — 3역할 사용자 + 의도적 권한 위반 시나리오

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 인증 사용자 정상 통과
- **Given**: LEARNER 역할 사용자 `u1` 가 로그인 상태
- **When**: `requireUser()` 호출
- **Then**: 사용자 객체 반환 (`{ id: 'u1', role: 'LEARNER', ... }`). 에러 없음

### Scenario 2: 미인증 — 401 Unauthorized
- **Given**: 세션 없는 익명 사용자
- **When**: `requireUser()` 호출
- **Then**: throw `AuthError('UNAUTHORIZED')`. HTTP 응답으로 변환 시 401

### Scenario 3: LEARNER 가 TEACHER 전용 라우트 접근 — 403 Forbidden
- **Given**: LEARNER 역할 사용자가 `/teacher/kit/L001` 접근
- **When**: 미들웨어 또는 가드 발동
- **Then**: throw `AuthError('FORBIDDEN', requiredRole='TEACHER')`. HTTP 403. EventLog 에 `auth.access_denied` 1건 기록

### Scenario 4: TEACHER 가 LEARNER 전용 동작 시도 — INV-07 위반 차단
- **Given**: TEACHER 역할 사용자가 `submitOx()` 호출 시도 (학습 진도는 LEARNER 만)
- **When**: 가드 발동
- **Then**: 본 시나리오는 정책 결정 필요. 옵션 A — 모든 사용자가 학습 가능 / 옵션 B — TEACHER 도 학습 가능. **본 태스크는 옵션 A 채택 (TEACHER 도 학습 가능). 단 INV-07 의 반대 방향은 강제** — LEARNER 가 TeacherFeedback 생성 시 차단

### Scenario 5: LEARNER 가 TeacherFeedback 생성 시도 — INV-07 차단
- **Given**: LEARNER 역할 사용자
- **When**: `submitTeacherFeedback()` Server Action 호출
- **Then**: `requireRole('TEACHER')` 발동. throw `AuthError('FORBIDDEN')`. 403 응답. DB INSERT 발생 안함

### Scenario 6: 본인 데이터 조회 — requireSelfOrAdmin
- **Given**: LEARNER `u1` 가 `/api/user/u2/progress` 조회 시도 (다른 사용자)
- **When**: `requireSelfOrAdmin('u2')` 호출
- **Then**: throw `AuthError('FORBIDDEN')`. 본인 데이터 (`u1` 자신) 또는 ADMIN 만 통과 가능

### Scenario 7: 동일 요청 내 다중 가드 호출 — DB 1회 조회
- **Given**: Route Handler 에서 `requireUser()` + `requireRole('TEACHER')` 연속 호출
- **When**: 해당 라우트가 호출됨
- **Then**: User 테이블 SELECT 는 1회만 발생 (request-scoped cache 적용). p95 영향 무시 가능

### Scenario 8: ADMIN 만접근 가능 라우트
- **Given**: TEACHER 역할 사용자가 `/admin/kpi-dashboard` 접근
- **When**: 미들웨어 발동
- **Then**: 403 응답. ADMIN 만 접근 가능

## :gear: Technical & Non-Functional Constraints
- **에러 분리 (RFC 7235)**: 401 (Unauthenticated) ≠ 403 (Unauthorized). 클라이언트가 재로그인 vs 권한 부족을 구분 가능해야 함
- **세션 캐싱**: `React.cache` 활용. 동일 요청 내 User 테이블 SELECT 1회 제한
- **타입 안전**: `Role` enum 은 Prisma 와 Zod 가 동일 정의 공유 (`type Role = 'LEARNER' | 'TEACHER' | 'ADMIN'`)
- **감사 로그**: 권한 거부 이벤트 (`auth.access_denied`) 는 EventLog 에 기록되어 비정상 접근 패턴 분석 가능 (REQ-NF-022)
- **미들웨어 vs 가드 함수 역할 분리**:
  - 미들웨어 — 정적 라우트 패턴 매칭 (`/teacher/**`, `/admin/**`). 빠른 차단
  - 가드 함수 — 동적 권한 검증 (예: 본인 데이터). Server Action·Route Handler 내부에서 호출
- **세션 만료 처리**: 세션 만료된 경우 401 응답 + 클라이언트가 자동 재로그인 페이지로 리다이렉트
- **RLS 와의 관계**: Supabase RLS (CT-DB-011) 가 데이터 레이어 최종 방어선. 본 가드는 그 앞단의 애플리케이션 레이어 방어선. 두 레이어 모두 통과해야 데이터 접근 가능 (defense-in-depth)
- **응답 시간**: 가드 추가로 인한 지연 ≤ 20ms (DB 조회 1회 + cache hit 시 0ms)
- **금지**: role 정보를 클라이언트 쿠키나 localStorage 에 저장 금지. 항상 서버에서 검증

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 전부 통과
- [ ] `lib/auth/guards.ts` 의 4개 가드 함수 구현
- [ ] `middleware.ts` 정적 라우트 매칭 동작 확인 (`/teacher/**`, `/admin/**`)
- [ ] 401 vs 403 에러 응답 분리 검증
- [ ] EventLog 에 `auth.access_denied` 기록 동작 확인
- [ ] React.cache 적용으로 동일 요청 내 DB 조회 1회 검증 (Vercel Logs 카운트)
- [ ] Role enum 의 단일 정의가 Prisma + Zod + 가드 함수에서 공유됨
- [ ] TS-UT-013 (RBAC 가드 단위 테스트) 통과 — LEARNER 의 TeacherFeedback 생성 시 403 검증
- [ ] PR 본문에 "본 가드는 RLS(CT-DB-011) 와 함께 defense-in-depth 의 앞단" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-AUTH-001 (Supabase Auth 클라이언트)
  - CT-DB-002 (User 모델 + Role enum)
  - FR-AUTH-001 (현재 세션 조회 헬퍼 — 가드는 이를 활용)
- **Blocks**:
  - FW-TF-001 (Teacher Feedback 제출 — TEACHER 가드 필요)
  - FR-PDF-001 (Teacher Kit 다운로드 — TEACHER 또는 익명 정책)
  - FR-KPI-009 (KPI 대시보드 — ADMIN 가드)
  - 모든 권한이 필요한 API 엔드포인트
  - TS-UT-013 (RBAC 단위 테스트)
- **Related**:
  - CT-DB-011 (Supabase RLS — 본 가드와 짝을 이루는 데이터 레이어 방어선)
