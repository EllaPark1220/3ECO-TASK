# [NF] NF-RISK-005: R8 Vercel Hobby non-commercial — 수익 시점 Pro 전환 트리거

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-RISK-005: R8 Vercel Hobby 비영리 정책 — 라이선스 수익 시 Pro 전환 (IF-VC-002 재사용)"
labels: 'nf, risk, vercel, license, priority:medium, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-RISK-005] R8 Vercel Hobby non-commercial 준수
- **목적**: §6.6 R8 완화. Vercel Hobby = non-commercial only. 라이선스 수익 실현 시 즉시 Pro 전환($20/월). IF-VC-002 D-TIER 트리거를 재사용하되, R8 고유의 **라이선스 수익 감지 + 법적 증빙**을 추가.

> **IF-VC-002 와의 차이**: IF-VC-002 = 5건 인프라 트리거 (Functions, MAU, 메일 등). NF-RISK-005 = 그 중 "라이선스 수익" 트리거의 **운영 정책 + 법적 증빙 + ToS 준수** 전담.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS: `/docs/SRS_V0_9.md#6.6` — R8 (Vercel Hobby non-commercial)
- SRS: `/docs/SRS_V0_9.md#1.5.1.2` — D-TIER (Free→Pro 전환)
- 외부: `https://vercel.com/docs/limits/fair-use-guidelines` (Hobby 정책)
- 선행: IF-VC-002 (Pro 전환 트리거 모니터링)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **수익 구분 정책 문서** — `docs/ops/vercel-hobby-compliance.md`:
  | 수입 유형 | 상업적? | Hobby 유지? | 조치 |
  |---|---|---|---|
  | 후원 (Buy Me a Coffee) | ❌ | ✅ 유지 | 없음 |
  | 교육부 공모전 지원금 | ❌ | ✅ 유지 | 없음 |
  | 라이선스 판매 (CC 별도 계약) | ✅ | ❌ 전환 | Pro 전환 |
  | 광고 수익 | ✅ | ❌ 전환 | Pro 전환 (금지) |
  | 유료 구독 | ✅ | ❌ 전환 | Pro 전환 (금지) |
- [ ] **IF-VC-002 트리거 #5 확장** — `license_revenue`:
  ```ts
  // lib/config/dtier-triggers.ts 에 추가
  {
    id: 'license_revenue',
    metric: 'has_commercial_revenue',
    limit: 0,  // 0 = 수익 없어야 Hobby 유지
    current: 0,
    check: () => {
      // 수동 입력: 라이선스 계약 체결 시 admin이 갱신
      return prisma.eventLog.findFirst({
        where: { eventName: 'revenue.license_signed' },
      }).then(e => e ? 1 : 0);
    },
    description: '라이선스 수익 실현 → Vercel Pro 전환 필수 (ToS)',
  }
  ```
- [ ] **전환 SOP** — 수익 실현 감지 → 24시간 내 Pro 업그레이드:
  1. `revenue.license_signed` EventLog 발행 (admin)
  2. D-TIER Cron 감지 → Sev1 알림
  3. 24시간 내 Vercel Dashboard → Pro 업그레이드
  4. DNS·환경 변수 변경 확인
  5. NF-COST-001 비용 대시보드 갱신
- [ ] **비영리 증빙 보관** — Hobby 유지 기간:
  - CC BY-NC-SA 라이선스 문서
  - 후원금 ≠ 상업 수익 법적 근거
  - Vercel Hobby 정책 스크린샷 아카이브
- [ ] **분기 ToS 준수 리뷰**: Vercel Fair Use 정책 변경 모니터링

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 수익 ₩0 — Hobby 유지
- **Given**: 라이선스 수익 없음 + 후원금만
- **When**: ToS 검토
- **Then**: Vercel Hobby 합법 유지

### Scenario 2: 라이선스 수익 → Pro 전환
- **Given**: 첫 라이선스 계약 체결
- **When**: admin `revenue.license_signed` 발행
- **Then**: Sev1 알림 + 24시간 내 Pro 전환

### Scenario 3: 후원금 — Hobby 유지 합법
- **Given**: Buy Me a Coffee ₩50,000/월
- **When**: 비영리 판단
- **Then**: non-commercial 유지

### Scenario 4: D-TIER 트리거 #5 연동
- **Given**: IF-VC-002 모니터링 실행
- **When**: `license_revenue` 체크
- **Then**: EventLog 기반 수익 감지

### Scenario 5: 전환 SOP 실행
- **Given**: Sev1 "Pro 전환 필요"
- **When**: SOP 실행
- **Then**: 24시간 내 Pro + DNS + 환경 변수 완료

### Scenario 6: 비영리 증빙 보관
- **Given**: Hobby 유지 중
- **When**: 증빙 확인
- **Then**: CC 라이선스 + 후원 근거 문서 존재

### Scenario 7: 분기 ToS 리뷰
- **Given**: 분기 종료
- **When**: Vercel 정책 확인
- **Then**: 변경 사항 기록 (없으면 "변경 없음")

### Scenario 8: 광고/유료 구독 도입 시 즉시 전환
- **Given**: 광고 수익 모델 도입 결정
- **When**: 결정 시점
- **Then**: 즉시 Pro 전환 (Hobby 사용 불가)

## :gear: Technical & Non-Functional Constraints
- **Vercel Hobby ToS**: non-commercial only. 위반 시 **계정 정지** 위험
- **CC BY-NC-SA**: 비상업적 사용 → Hobby 합법. 라이선스 별도 계약 = 상업적
- **Pro 비용**: $20/월 (~₩27,000) — NF-COST-001 한도(₩10만) 내
- **EventLog 기반**: 수익 감지 = admin 수동 발행 (자동화 불가)
- **금지**: 수익 실현 후 Hobby 유지 (ToS 위반), 24시간 초과 전환 지연

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 통과
- [ ] 수익 구분 정책 문서
- [ ] D-TIER 트리거 #5 `license_revenue` 코드
- [ ] 전환 SOP (5단계)
- [ ] 비영리 증빙 보관 문서
- [ ] 분기 ToS 리뷰 프레임
- [ ] PR 본문에 "R8 Vercel Hobby. IF-VC-002 재사용 + 라이선스 수익 트리거" 명시

## :construction: Dependencies & Blockers
- **Depends on**: IF-VC-002 (Pro 전환 트리거)
- **Blocks**: 없음 (위반 시 계정 정지 → 전체 서비스 중단)
- **Related**: §6.6 R8, D-TIER, NF-COST-001
