# [Feature] FR-AUTH-005: GET /api/auth/preferences — 환경설정 조회 (FW-AUTH-005 의 Read 짝)

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FR-AUTH-005: GET /api/auth/preferences — accessibilityMode + mediaPreference + fontSize + colorMode 4종 조회 + private 캐시"
labels: 'feature, backend, auth, preferences, query, priority:high, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FR-AUTH-005] `GET /api/auth/preferences` Route Handler — 현재 사용자의 환경설정 4종 (accessibilityMode + mediaPreference + fontSize + colorMode) 반환
- **목적**: FW-AUTH-005 (PATCH) 의 Read 짝. 클라이언트 hook (FR-LES-004 의 글자 크기 토글, FR-AUTH-003 의 색 모드) 가 본 API 로 초기 상태 조회. localStorage 보조 캐시 + 서버 SSOT 우선 정책의 데이터 진입점.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.5` — REQ-FUNC-026~029 (환경설정)
  - `/docs/SRS_V0_9.md#4.2.6` — REQ-NF-039 (영속화)
  - `/docs/SRS_V0_9.md#3.5.2` — UC-09
  - `/docs/SRS_V0_9.md#6.1` — `/api/auth/preferences` 엔드포인트
- 선행: FR-AUTH-001 (getCurrentUser), CT-DB-002 (User), CT-API-001 (응답 포맷)
- 짝: FW-AUTH-005 (PATCH)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/api/auth/preferences/route.ts` Route Handler
- [ ] **`requireUser()` 가드**:
  ```ts
  export async function GET() {
    const user = await getCurrentUserOrThrow();
    return NextResponse.json({
      accessibility_mode: user.accessibilityMode,
      media_preference: user.mediaPreference,
      font_size: user.fontSize,
      color_mode: user.colorMode,
    }, {
      headers: {
        'Cache-Control': 'private, max-age=300',  // 5분 사적 캐시
      },
    });
  }
  ```
- [ ] **응답 DTO `UserPreferencesResponse`**:
  ```ts
  export interface UserPreferencesResponse {
    accessibility_mode: boolean;
    media_preference: 'VIDEO' | 'TEXT' | 'MIXED';
    font_size: 'SMALL' | 'MEDIUM' | 'LARGE';
    color_mode: 'LIGHT' | 'DARK' | 'SYSTEM';
  }
  ```
- [ ] **Cache 정책**:
  - `private, max-age=300` — 5분 사적 캐시
  - 사용자별 다른 데이터 → Edge cache 미사용
  - PATCH (FW-AUTH-005) 직후 SWR mutate 로 무효화
- [ ] **클라이언트 hook (선택) — `useUserPreferences()`**:
  ```ts
  // app/lib/hooks/usePreferences.ts
  import useSWR from 'swr';
  export function useUserPreferences() {
    return useSWR<UserPreferencesResponse>('/api/auth/preferences', fetcher);
  }
  ```
- [ ] **응답 시간 목표**: p95 ≤ 100ms (FR-AUTH-001 의 React.cache 활용 시 cache hit 으로 더 빠름)
- [ ] **세션 우선 (IDOR 방지)**: 본 API 는 user_id 입력을 받지 않음. 세션의 user.id 만 사용
- [ ] **에러 처리**:
  - 미인증 → 401 + `UNAUTHORIZED`
  - DB 조회 실패 → 500 + `INTERNAL_ERROR` + Sentry 알림

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 정상 조회
- **Given**: User(`u1`, accessibilityMode=true, fontSize='LARGE', ...)
- **When**: `GET /api/auth/preferences`
- **Then**: 200 + `{ accessibility_mode: true, font_size: 'LARGE', ... }`

### Scenario 2: 미인증 — 401
- **Given**: 세션 없음
- **When**: 호출
- **Then**: 401 + `UNAUTHORIZED`

### Scenario 3: PATCH 직후 변경 반영
- **Given**: PATCH 로 fontSize='LARGE' 변경 직후
- **When**: SWR mutate 후 GET
- **Then**: 새 fontSize 반영. cache 무효화 정상

### Scenario 4: 다른 사용자 데이터 접근 차단
- **Given**: User(`u1`) 가 호출
- **When**: 응답
- **Then**: u1 의 환경설정만. 다른 사용자 데이터 노출 0

### Scenario 5: Cache 정책 — 5분 사적 캐시
- **Given**: 응답
- **When**: 헤더 검사
- **Then**: `Cache-Control: private, max-age=300`

### Scenario 6: 응답 시간
- **Given**: 부하 100명 동시
- **When**: 호출
- **Then**: p95 ≤ 100ms (React.cache hit 시 더 빠름)

### Scenario 7: 응답 페이로드 — 4필드만
- **Given**: 응답
- **When**: JSON 검사
- **Then**: accessibility_mode, media_preference, font_size, color_mode 4필드만. email·role 등 미포함

### Scenario 8: enum 값 정확
- **Given**: 응답
- **When**: 각 enum 값 검사
- **Then**: media_preference 는 'VIDEO'/'TEXT'/'MIXED' 중 하나, font_size 는 'SMALL'/'MEDIUM'/'LARGE' 중 하나 등

### Scenario 9: SWR hook 통합
- **Given**: `useUserPreferences()` hook 사용
- **When**: 컴포넌트 mount
- **Then**: 자동 fetch + cache. 동일 페이지 내 다중 호출 시 1회만

### Scenario 10: 응답 헤더 X-Request-Id
- **Given**: 응답
- **When**: 헤더 검사
- **Then**: X-Request-Id (CT-API-001) 포함

## :gear: Technical & Non-Functional Constraints
- **응답 컬럼 화이트리스트**: 4필드만. email·role·createdAt 등 미포함 (불필요한 노출 방지)
- **세션 우선 (IDOR)**: user_id 입력 미허용
- **Cache 정책**: private 5분. PATCH 후 SWR mutate 로 무효화
- **응답 시간**: p95 ≤ 100ms (FR-AUTH-001 의 React.cache 활용)
- **금지**:
  - user_id 클라이언트 입력
  - 4필드 외 추가 노출
  - Edge cache 사용

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] Route Handler 구현
- [ ] 응답 DTO 정의
- [ ] Cache 정책 검증
- [ ] FW-AUTH-005 와 정합 — PATCH 후 mutate 동작
- [ ] 응답 시간 p95 ≤ 100ms
- [ ] OpenAPI 명세 업데이트
- [ ] PR 본문에 "FW-AUTH-005 의 Read 짝" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FR-AUTH-001 (getCurrentUser)
  - FR-AUTH-002 (RBAC 가드)
  - CT-DB-002 (User)
  - CT-API-001 (응답 포맷)
- **Blocks**:
  - FR-LES-003 (시청 페이지 — 매체 토글 초기 상태)
  - FR-LES-004 (글자 크기 토글)
  - FR-AUTH-003 (색 모드)
  - FW-AUTH-005 의 SWR mutate 효과 검증
