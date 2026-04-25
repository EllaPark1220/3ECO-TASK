# [Feature] FW-AUTH-005: updateUserPreferences() Server Action — accessibility_mode + media_preference + font_size 묶음 영속화

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-AUTH-005: updateUserPreferences() Server Action — accessibility_mode + media_preference + font_size 묶음 PATCH"
labels: 'feature, backend, auth, preferences, accessibility, story-5, priority:high, mvp-in, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-AUTH-005] `updateUserPreferences()` Server Action — `accessibilityMode` (boolean) + `mediaPreference` (`VIDEO` | `TEXT` | `MIXED`) + `fontSize` (`SMALL` | `MEDIUM` | `LARGE`) 3종 환경설정을 묶음으로 영속화
- **목적**: Story 5 (한정숙·김성호) 의 접근성 영속화 핵심 — 사용자가 한 번 설정한 매체·글자 크기·접근성 모드가 다음 로그인 시·다른 디바이스에서도 일관되게 적용되도록 한다. UC-09 (사용자 환경설정 변경) 의 Write 진입점이며, REQ-NF-039 (접근성 환경 영속화) · REQ-FUNC-026 (매체 전환 영속화) 충족.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.5` — REQ-FUNC-026 (글로 읽기 토글 영속화), REQ-FUNC-027 (글자 크기), REQ-FUNC-028 (접근성 모드)
  - `/docs/SRS_V0_9.md#4.2.6` — REQ-NF-037, 038, 039 (접근성 영속화)
  - `/docs/SRS_V0_9.md#6.2.2` — USER 테이블 (accessibilityMode, mediaPreference, fontSize 컬럼)
  - `/docs/SRS_V0_9.md#3.5.2` — UC-09 (환경설정 변경)
  - `/docs/SRS_V0_9.md#6.1` — `updateUserPreferences()` 엔드포인트
- 페르소나: SH-04 한정숙 (저시력 · 매체 전환 + 글자 크기), SH-08 또는 SH-09 김성호 (청각·키보드 · 자막 + 키보드)
- 선행: FW-AUTH-001 (Supabase Auth), CT-DB-002 (User 모델), FR-AUTH-002 (RBAC 가드)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `lib/contracts/user.ts` 에 Zod 스키마 `UpdateUserPreferencesRequest` 정의:
  ```ts
  z.object({
    accessibility_mode: z.boolean().optional(),
    media_preference: z.enum(['VIDEO', 'TEXT', 'MIXED']).optional(),
    font_size: z.enum(['SMALL', 'MEDIUM', 'LARGE']).optional(),
  }).refine(data => Object.keys(data).length > 0, '하나 이상의 필드 필요')
  ```
- [ ] `app/auth/actions.ts` 또는 `lib/services/user.ts` 에 `updateUserPreferences()` Server Action 구현
- [ ] **첫 줄에 `requireUser()` 가드 호출** (FR-AUTH-002 활용 · 본인 환경설정만 변경 가능)
- [ ] **Partial UPDATE 패턴** — Zod 로 parse 된 객체에서 정의된 필드만 UPDATE 절에 포함:
  ```ts
  const updateData: Prisma.UserUpdateInput = {};
  if (parsed.accessibility_mode !== undefined) updateData.accessibilityMode = parsed.accessibility_mode;
  if (parsed.media_preference !== undefined) updateData.mediaPreference = parsed.media_preference;
  if (parsed.font_size !== undefined) updateData.fontSize = parsed.font_size;
  await prisma.user.update({ where: { id: userId }, data: updateData });
  ```
- [ ] **응답** — `{ ok: true, updated_fields: ['media_preference', 'font_size'] }` (디버깅·테스트 용이성)
- [ ] **EventLog 발행** — `user.preferences_updated` 이벤트 + payload (변경된 필드만)
- [ ] **RSC revalidate** — `revalidatePath('/lesson/[id]', 'page')` + `revalidatePath('/stamp-map')` (환경설정 즉시 반영)
- [ ] **응답 시간**: p95 ≤ 200ms (단순 UPDATE)
- [ ] **다른 사용자 변경 차단** — userId 는 항상 세션에서 추출. 클라이언트가 보낸 user_id 절대 사용 금지 (IDOR 방지)
- [ ] **마이그레이션** — User 테이블에 `fontSize` 컬럼 추가 (`accessibilityMode`, `mediaPreference` 는 CT-DB-002 에서 정의됨). default `'MEDIUM'`
- [ ] **다기기 LWW** — 단순 UPDATE 로 자동 충족. updatedAt 갱신
- [ ] **OpenAPI 명세 업데이트** — Partial PATCH 동작 명시

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 모든 필드 동시 변경
- **Given**: User(`u1`) 의 기본값 (accessibilityMode=false, mediaPreference='MIXED', fontSize='MEDIUM')
- **When**: `updateUserPreferences({ accessibility_mode: true, media_preference: 'TEXT', font_size: 'LARGE' })` 호출
- **Then**: 3필드 모두 UPDATE. 응답 `{ ok: true, updated_fields: ['accessibility_mode', 'media_preference', 'font_size'] }`. EventLog 1건

### Scenario 2: Partial 변경 — 1개 필드만
- **Given**: User(`u1`)
- **When**: `updateUserPreferences({ font_size: 'LARGE' })` 호출
- **Then**: fontSize 만 UPDATE. accessibilityMode·mediaPreference 는 기존 값 유지. 응답 `updated_fields: ['font_size']`

### Scenario 3: 빈 객체 — 400
- **Given**: User(`u1`)
- **When**: `updateUserPreferences({})` 호출
- **Then**: Zod refine 실패. 400 + `EMPTY_UPDATE`

### Scenario 4: 잘못된 enum 값 — 400
- **Given**: User(`u1`)
- **When**: `updateUserPreferences({ media_preference: 'INVALID' })` 호출
- **Then**: Zod parse 실패. 400 + `INVALID_MEDIA_PREFERENCE`

### Scenario 5: 미인증 — 401
- **Given**: 세션 없음
- **When**: `updateUserPreferences()` 호출
- **Then**: 401 + `UNAUTHORIZED`. UPDATE 0건

### Scenario 6: 다른 사용자 변경 시도 차단 (IDOR)
- **Given**: User(`u1`) 가 로그인 + 클라이언트가 user_id='u2' 를 위조하여 전송
- **When**: `updateUserPreferences()` 호출
- **Then**: Server Action 은 세션의 userId(`u1`) 만 사용. `u2` 는 변경되지 않음. **u2 의 데이터 변경 0건**

### Scenario 7: 다기기 LWW
- **Given**: Device A 가 fontSize='LARGE' 로 변경 직후
- **When**: Device B 가 fontSize='SMALL' 로 변경
- **Then**: 최종 fontSize='SMALL' (최후 값 우선). updatedAt 은 B 의 시각

### Scenario 8: RSC revalidate 동작
- **Given**: 사용자가 `/lesson/L001` 에 머문 상태
- **When**: 다른 탭에서 `updateUserPreferences({ media_preference: 'TEXT' })` 호출
- **Then**: 다음 페이지 새로고침 시 글 모드로 자동 시작 (RSC 캐시 무효화)

### Scenario 9: 응답 시간 목표
- **Given**: 부하 100명 동시 호출
- **When**: k6 부하 테스트
- **Then**: p95 응답 시간 ≤ 200ms

### Scenario 10: 영속화 검증 (다음 로그인)
- **Given**: User(`u1`) 가 fontSize='LARGE' 변경 후 로그아웃
- **When**: 다음 로그인 후 페이지 진입
- **Then**: fontSize='LARGE' 가 자동 적용. localStorage 보조 캐시 + 서버 SSOT 동시 일치

## :gear: Technical & Non-Functional Constraints
- **Partial UPDATE 패턴**: Zod 의 `.optional()` + 정의된 필드만 SQL UPDATE 에 포함. SRS 미정의 컬럼 (예: `nickname`, `email`) 은 본 액션 범위 밖
- **세션 우선 (IDOR 방지)**: userId 는 세션에서 추출. 클라이언트 입력 절대 사용 금지
- **마이그레이션**: User 테이블에 `fontSize` enum 컬럼 신규 추가. default 'MEDIUM'. 기존 사용자는 기본값 자동 적용
- **enum 정의 단일 출처**: `Role`, `MediaPreference`, `FontSize` enum 은 Prisma `schema.prisma` + Zod + TypeScript 가 동일 정의 공유
- **EventLog payload**: 변경된 필드만 기록. 전체 객체 dump 금지 (PII 가능성)
- **응답 시간 (REQ-NF-005 근접)**: 매체 전환 자체는 클라이언트 상태 변경이라 ≤ 300ms. 본 액션은 영속화만 담당하므로 ≤ 200ms 충분
- **클라이언트 보조 캐시**: localStorage 에 동일 값 동시 저장 (서버 SSOT 우선, localStorage 보조). 다음 페이지 진입 시 즉시 반영 (서버 fetch 대기 안함)
- **혼합 시나리오 처리** — accessibilityMode=true 일 때 fontSize 자동 LARGE 강제? → **자동 강제 금지**. 사용자 자율 선택 (INV-10 정신)
- **금지**:
  - 클라이언트가 보낸 user_id 사용 (IDOR 취약)
  - SRS 미정의 컬럼 추가 (nickname 변경은 별도 태스크)
  - 비밀번호 변경 본 액션에 포함 (별도 보안 흐름 필요)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `updateUserPreferences()` Server Action 구현
- [ ] Partial UPDATE 패턴 검증 (1필드만 변경 시 다른 필드 유지)
- [ ] IDOR 방어 검증 (Scenario 6) — 세션 우선
- [ ] RSC revalidatePath 동작 확인
- [ ] EventLog `user.preferences_updated` 발행
- [ ] User.fontSize 마이그레이션 추가 + 기존 사용자 default='MEDIUM'
- [ ] 응답 시간 p95 ≤ 200ms 측정
- [ ] OpenAPI 명세 업데이트
- [ ] TS-UT-002 (영속화 검증) + TS-UT-013 (RBAC) 통과
- [ ] PR 본문에 "Story 5 의 접근성 영속화 진입점. IDOR 방어 핵심" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - FW-AUTH-001 (Supabase Auth)
  - FR-AUTH-002 (RBAC 가드 — `requireUser()`)
  - CT-DB-002 (User 모델)
  - CT-API-001 (공통 응답·오류 포맷)
- **Blocks**:
  - FR-LES-003 (레슨 시청 페이지의 mediaPreference 토글이 본 액션 호출)
  - FR-LES-004 (글자 크기 조절 토글 — fontSize 영속화)
  - FR-AUTH-003 (시스템 색 모드 — accessibilityMode 활용)
  - FR-AUTH-005 (현재 환경설정 조회 — Read 페어)
  - TS-E2E-003 (한정숙 E2E — 매체 전환 영속화)
  - TS-E2E-004 (김성호 E2E — 키보드·자막)
  - **Closed Beta Exit** — REQ-NF-039 (접근성 영속화) 검증의 Write 진입점
- **Related**:
  - INV-10 (자율 선택) — 자동 강제 금지 정책
