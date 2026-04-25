# [Feature] FR-AUTH-001: getCurrentUser() 헬퍼 — Supabase 세션 → User 객체 조회 + React.cache

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-AUTH-001: getCurrentUser() Server-side 헬퍼 — Supabase Auth 세션 → public.User 조회 + React.cache 단일 요청 1회 강제"
labels: 'feature, backend, auth, query, priority:critical, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-AUTH-001] `getCurrentUser()` Server-side 헬퍼 — RSC·Server Action·Route Handler 어디서나 호출하면 현재 세션 사용자의 `User` 객체 (또는 `null`) 반환 + 동일 요청 내 1회 조회 강제
- **목적**: FR-AUTH-002 (RBAC 가드) 의 의존. 모든 인증 필요 코드의 사용자 조회 SSOT. React.cache 활용으로 동일 요청 내 다중 호출 시에도 DB SELECT 1회만 발생 — 성능 + 일관성. INV-06 (단방향 해시) 검증의 진입점.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#3.6.2` — Auth 컴포넌트 책임 매트릭스
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-019 (세션 관리), REQ-NF-021 (RBAC)
  - `/docs/SRS_V0_9.md#6.2.2` — User 테이블
  - `/docs/SRS_V0_9.md#6.1` — `/api/auth/me` 엔드포인트 (선택적 노출)
- 외부 문서: `https://react.dev/reference/react/cache`
- 선행: FW-AUTH-001 (Supabase Auth), CT-DB-002 (User 모델)
- 짝: FR-AUTH-002 (RBAC 가드 — 본 헬퍼 활용)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/auth/session.ts` 생성
- [ ] **`getCurrentUser()` 함수 정의 — React.cache 활용**:
  ```ts
  import { cache } from 'react';
  import { createClient } from '@/lib/supabase/server';
  import { prisma } from '@/lib/db';
  import type { User } from '@prisma/client';

  export const getCurrentUser = cache(async (): Promise<User | null> => {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    // public.User 조회 (auth.users 와 1:1 매핑)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    return user;
  });
  ```
- [ ] **`getCurrentUserOrThrow()` 변형** — 인증 강제:
  ```ts
  export async function getCurrentUserOrThrow(): Promise<User> {
    const user = await getCurrentUser();
    if (!user) throw new AuthError('UNAUTHORIZED');
    return user;
  }
  ```
- [ ] **React.cache 의 의의 (성능)**:
  - 동일 RSC 요청 내 `getCurrentUser()` 가 N회 호출되어도 DB SELECT 는 1회만
  - Server Component·Server Action·Route Handler 가 같은 요청 컨텍스트에서 공유
  - request 별 격리 — 다른 요청 간 캐싱 영향 0 (메모리 누수 방지)
- [ ] **세션 미확인 vs DB 사용자 미존재 분리 처리**:
  - 세션 없음 → `null` 반환 (정상 케이스)
  - 세션 있는데 public.User 가 없음 → **에러 throw + Sentry 알림** (auth.users 와 sync 깨짐, 데이터 무결성 이슈)
- [ ] **응답 페이로드 정책**:
  - 본 헬퍼는 **Server-side 전용** — 클라이언트로 직접 노출 금지
  - 클라이언트 컴포넌트가 사용자 정보 필요 시 — RSC props 로 전달 (필요 필드만 선별)
  - 또는 별도 Route Handler `/api/auth/me` 노출 (선택적)
- [ ] **`/api/auth/me` Route Handler (선택적)**:
  ```ts
  // app/api/auth/me/route.ts
  export async function GET() {
    const user = await getCurrentUser();
    if (!user) return makeErrorResponse('UNAUTHORIZED', requestId);
    return NextResponse.json({
      id: user.id,
      nickname: user.nickname,
      role: user.role,
      accessibilityMode: user.accessibilityMode,
      mediaPreference: user.mediaPreference,
      fontSize: user.fontSize,
      colorMode: user.colorMode,
      // email 은 클라이언트에 노출하되, 본인만 확인 가능 — 마스킹은 UI 레이어 책임
      email: user.email,
    });
  }
  ```
- [ ] **클라이언트 hook (선택)** — `useCurrentUser()`:
  - SWR 또는 React Query 활용
  - `/api/auth/me` 호출 + 캐싱
  - 로그아웃 시 cache 무효화
- [ ] **세션 만료 처리**:
  - Supabase 의 access token 만료 임박 시 (5분 이내) middleware.ts 가 자동 refresh
  - 본 헬퍼는 refresh 결과 활용. 별도 처리 불필요
- [ ] **응답 시간 목표**:
  - 세션 없음 (null): ≤ 5ms
  - 세션 + DB 조회: ≤ 50ms (인덱스 활용)
  - cache hit (동일 요청 2번째 호출 이후): 0ms

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 인증 사용자 — User 객체 반환
- **Given**: 로그인 상태 (LEARNER 역할)
- **When**: `getCurrentUser()` 호출
- **Then**: User 객체 반환 (`{ id, email, nickname, role: 'LEARNER', ... }`)

### Scenario 2: 미인증 — null 반환
- **Given**: 세션 없음
- **When**: `getCurrentUser()` 호출
- **Then**: `null` 반환. 에러 throw 안함

### Scenario 3: getCurrentUserOrThrow — 미인증 시 throw
- **Given**: 세션 없음
- **When**: `getCurrentUserOrThrow()` 호출
- **Then**: `AuthError('UNAUTHORIZED')` throw

### Scenario 4: React.cache — 동일 요청 1회 조회
- **Given**: RSC 페이지에서 `getCurrentUser()` 를 5회 호출
- **When**: 페이지 렌더
- **Then**: Prisma SELECT 1회만 발생 (Vercel Logs 카운트 검증)

### Scenario 5: 다른 요청 간 캐시 격리
- **Given**: 두 사용자 (u1, u2) 가 동시 요청
- **When**: 각자 `getCurrentUser()` 호출
- **Then**: 서로 다른 User 객체 반환. cache 누수 0

### Scenario 6: auth.users 있는데 public.User 없음 — 에러 + Sentry
- **Given**: Supabase auth.users 에는 있지만 public.User 가 누락 (sync 깨짐)
- **When**: `getCurrentUser()` 호출
- **Then**: throw + Sentry 알림. 운영자 즉시 인지

### Scenario 7: /api/auth/me 응답
- **Given**: 로그인 상태
- **When**: `GET /api/auth/me`
- **Then**: 200 + 사용자 정보 (email, nickname, role, 환경설정 4종)

### Scenario 8: /api/auth/me 미인증
- **Given**: 세션 없음
- **When**: `GET /api/auth/me`
- **Then**: 401 + `UNAUTHORIZED`

### Scenario 9: 응답 시간 — cache miss
- **Given**: 신규 요청
- **When**: getCurrentUser 첫 호출
- **Then**: ≤ 50ms (Supabase getSession + Prisma SELECT)

### Scenario 10: 응답 시간 — cache hit
- **Given**: 동일 요청 내 2번째 호출
- **When**: getCurrentUser 재호출
- **Then**: 0ms (React.cache hit)

## :gear: Technical & Non-Functional Constraints
- **Server-side 전용 정책**: `getCurrentUser()` 는 Server Component·Server Action·Route Handler 만. 클라이언트 컴포넌트 import 금지 (`'use server'` 또는 server-only 태그)
- **React.cache 활용 강제**: 모든 호출이 cache 통과. 직접 `prisma.user.findUnique` 우회 금지
- **null vs throw 분리**:
  - `getCurrentUser()` — 정상 case 로 null 반환 (선택적 인증 라우트용)
  - `getCurrentUserOrThrow()` — 인증 강제 (Server Action 첫 줄 활용)
- **Sync 깨짐 처리**: auth.users ↔ public.User 불일치는 critical 사고. Sentry 자동 알림 + 운영자 인지
- **응답 컬럼 정책**:
  - 본 헬퍼는 User 전체 객체 반환 (Server-side 활용 위함)
  - 클라이언트 노출 시 필요 필드만 선별 (`/api/auth/me` 의 select)
  - email 은 본인 만 확인 (다른 사용자의 email 노출 금지)
- **세션 토큰 자체는 별도**: 본 헬퍼는 User 객체만 반환. JWT·access token 은 미들웨어가 별도 처리
- **응답 시간**:
  - cache miss ≤ 50ms (REQ-NF-001 영향 미미)
  - cache hit 0ms (성능 최적화)
- **금지**:
  - 클라이언트 컴포넌트에서 직접 import (`'use client'` 분리)
  - role 정보를 클라이언트 cookies·localStorage 에 저장
  - cache 우회하여 직접 DB 조회 (성능 + 일관성 위반)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `lib/auth/session.ts` 의 `getCurrentUser()` + `getCurrentUserOrThrow()` 구현
- [ ] React.cache 적용 + 동일 요청 1회 조회 검증
- [ ] auth.users ↔ public.User sync 깨짐 시 Sentry 알림 동작
- [ ] `/api/auth/me` Route Handler (선택) 구현
- [ ] Server-side 전용 정책 — 클라이언트 import 시 빌드 에러
- [ ] 응답 시간 cache miss ≤ 50ms, cache hit 0ms 측정
- [ ] PR 본문에 "FR-AUTH-002 의 핵심 의존. React.cache 로 성능 최적화" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-AUTH-001 (Supabase Auth 클라이언트)
  - CT-DB-002 (User 모델)
  - CT-API-001 (공통 응답 포맷 + AuthError 정의)
- **Blocks**:
  - FR-AUTH-002 (RBAC 가드 — 본 헬퍼 활용)
  - FW-AUTH-005 (User Preferences PATCH — 본인 확인)
  - FR-STAMP-001, 002 (스탬프 맵 — 사용자별 데이터)
  - FR-PROG-001 (재진입 위치 — 사용자별 진도)
  - FW-OX-001 (OX 채점 — 사용자 식별)
  - 거의 모든 인증 필요 코드
