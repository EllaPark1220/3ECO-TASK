# [NF] NF-COST-003: 신규 기능 운영비 증가 ≤10% 체크리스트

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-COST-003: 신규 기능 출시 전 운영비 증가 ≤10% 체크리스트 — 비용 영향 분석 게이트"
labels: 'nf, cost-control, priority:medium, mvp-soft, closed-beta'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-COST-003] 신규 기능 운영비 증가 ≤ 10% 체크리스트
- **목적**: REQ-NF-025 (신규 기능 운영비 증가 ≤ 10%) 충족. 새 기능 출시 전 해당 기능이 Vercel Functions 호출·Supabase DB 용량·Sentry 이벤트 등 인프라 비용에 미치는 영향을 사전 분석하고, 월 운영비 증가가 10% 이하인지 확인.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.5` — REQ-NF-025
- 선행: NF-COST-001 (현재 비용 기준선)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **비용 영향 분석 체크리스트** — `docs/ops/cost-impact-checklist.md`:
  | # | 항목 | 분석 방법 |
  |---|---|---|
  | 1 | Vercel Functions 호출 증가 | 예상 API 호출수/일 × 30 |
  | 2 | DB 용량 증가 | 새 테이블/컬럼 × 레코드 수 예상 |
  | 3 | Storage 증가 | 새 파일 크기 × 수량 |
  | 4 | Sentry 이벤트 증가 | 새 에러 경로 × 샘플링률 |
  | 5 | 외부 API 호출 | 유료 API 호출 비용 |
  | 6 | 기존 대비 증가율 | (신규 비용 / 기존 비용) × 100 |
- [ ] **PR 템플릿 추가** — `.github/PULL_REQUEST_TEMPLATE.md`:
  ```md
  ## 비용 영향 (REQ-NF-025)
  - [ ] 이 PR은 인프라 비용에 영향이 없습니다
  - [ ] 또는: 월 운영비 증가 ≤10% 확인 (근거: ___)
  ```
- [ ] **10% 초과 시**: 검토 회의 + 최적화 후 재출시

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 비용 영향 없음 — 바로 머지
- **Given**: DB 변경 없는 UI PR → **Then**: 체크리스트 "영향 없음" 체크 → 머지

### Scenario 2: 비용 영향 ≤ 10% — 근거 기재 후 머지
- **Given**: 새 테이블 추가 (월 +₩5,000) → **Then**: 근거 기재 → 머지

### Scenario 3: 비용 영향 > 10% — 차단
- **Given**: 새 외부 API (월 +₩50,000 / 기존 ₩30,000 = +167%) → **Then**: 머지 차단 → 검토

### Scenario 4: PR 템플릿 포함
- **Given**: 신규 PR → **Then**: 비용 영향 섹션 표시

### Scenario 5: 분기 비용 추이
- **Given**: 3개월 → **Then**: 기능별 비용 영향 추이표

### Scenario 6: Free 한도 내 유지
- **Given**: Free 플랜 → **Then**: 신규 기능으로 Free 한도 초과 여부 사전 확인

## :gear: Technical & Non-Functional Constraints
- **기준선**: NF-COST-001 의 현재 월간 비용
- **10% 기준**: 현재 ₩0 일 경우 절대값 ₩10,000 이하
- **운영 문서 + PR 템플릿**: 자동 검증 아닌 리뷰 기반

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 통과 + 체크리스트 + PR 템플릿

## :construction: Dependencies & Blockers
- **Depends on**: NF-COST-001 (비용 기준선)
- **Related**: REQ-NF-025
