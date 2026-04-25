# [Feature] FW-STAMP-001: shareStampMap() 토큰 발급 — 공유 URL 생성

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-STAMP-001: shareStampMap() Server Action — 공유 토큰 발급 + 익명 열람 URL + 48시간 만료"
labels: 'feature, backend, stamp-map, share, could-have, priority:low, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-STAMP-001] `shareStampMap()` Server Action — 스탬프 맵 공유 토큰 발급 + 익명 열람 URL 생성
- **목적**: REQ-FUNC-041 (Could Have — 스탬프 맵 공유) 충족. 학습자가 자신의 스탬프 맵을 SNS·메신저로 공유할 때, 로그인 없이 열람 가능한 일회성 공유 URL 을 생성한다. 토큰은 48시간 만료, PII 미노출, 읽기 전용.

## :link: References (Spec & Context)
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.1` — REQ-FUNC-041 (Could Have — 스탬프 공유)
  - `/docs/SRS_V0_9.md#6.1` — `shareStampMap()` 엔드포인트
- 선행: CT-API-011 (DTO), FR-STAMP-001 (스탬프 맵 API)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `app/stamp/actions.ts` 에 `shareStampMap()` Server Action:
  ```ts
  'use server';
  export async function shareStampMap(): Promise<{ share_url: string; expires_at: string }> {
    const user = await requireUser();
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

    await prisma.stampShareToken.create({
      data: { token, userId: user.id, expiresAt },
    });

    const shareUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/stamp/shared/${token}`;
    return { share_url: shareUrl, expires_at: expiresAt.toISOString() };
  }
  ```
- [ ] `app/stamp/shared/[token]/page.tsx` — 공유 열람 페이지 (인증 불필요):
  ```tsx
  export default async function SharedStampMap({ params }: { params: { token: string } }) {
    const share = await prisma.stampShareToken.findUnique({
      where: { token: params.token },
      include: { user: { select: { nickname: true } } },
    });
    if (!share || share.expiresAt < new Date()) return notFound();

    const stamps = await getStampsForUser(share.userId);
    return <StampMapReadOnly stamps={stamps} nickname={share.user.nickname} />;
  }
  ```
- [ ] **DB 모델** — `StampShareToken`:
  ```prisma
  model StampShareToken {
    id        String   @id @default(uuid())
    token     String   @unique
    userId    String
    user      User     @relation(fields: [userId], references: [id])
    expiresAt DateTime
    createdAt DateTime @default(now())
  }
  ```
- [ ] **토큰 정책**: UUID v4, 48시간 만료, 사용자당 최대 5개 활성 토큰
- [ ] **만료 토큰 정리**: Cron 또는 쿼리 시 `WHERE expiresAt < NOW()` 자동 필터

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 공유 URL 생성
- **Given**: 로그인 사용자
- **When**: `shareStampMap()` 호출
- **Then**: `{ share_url: 'https://.../stamp/shared/{uuid}', expires_at: '...' }`

### Scenario 2: 익명 열람 — 인증 불필요
- **Given**: 공유 URL
- **When**: 비로그인 사용자가 접근
- **Then**: 읽기 전용 스탬프 맵 렌더 + 닉네임 표시

### Scenario 3: 만료 토큰 — 404
- **Given**: 48시간 경과 토큰
- **When**: 접근
- **Then**: 404 Not Found

### Scenario 4: PII 미노출
- **Given**: 공유 페이지
- **When**: 페이지 내용 확인
- **Then**: 닉네임만 표시. 이메일·user_id 노출 0

### Scenario 5: 사용자당 토큰 5개 제한
- **Given**: 활성 토큰 5개 존재
- **When**: 6번째 생성 시도
- **Then**: 가장 오래된 토큰 삭제 + 신규 발급

### Scenario 6: 미인증 — 생성 불가
- **Given**: 비로그인
- **When**: `shareStampMap()` 호출
- **Then**: 401

## :gear: Technical & Non-Functional Constraints
- **Could Have (MVP-DEFER)**: Public Pilot 이후 구현. 우선순위 낮음
- **토큰**: UUID v4 (추측 불가). 48시간 만료
- **PII 보호**: 공유 페이지에 닉네임만. 이메일·ID 미노출
- **읽기 전용**: 공유 페이지에서 어떤 Mutation 도 불가
- **금지**: 영구 공유 URL (만료 필수), 사용자 실명 노출

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 시나리오 통과
- [ ] `shareStampMap()` Server Action + `StampShareToken` 모델
- [ ] `/stamp/shared/[token]` 읽기 전용 페이지
- [ ] 48시간 만료 + 토큰 5개 제한
- [ ] PII 미노출 검증

## :construction: Dependencies & Blockers
- **Depends on**: CT-API-011 (DTO), FR-STAMP-001 (맵 API), CT-DB-005 (Stamp)
- **Blocks**: 없음 (Could Have)
- **Related**: REQ-FUNC-041
