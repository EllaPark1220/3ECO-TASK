# [NF] NF-COST-002: 외부 도구 구독 ≤30만원 회계 리뷰 정책

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-COST-002: 외부 도구 구독 월 ≤30만원 — 회계 리뷰 정책 + 도구 레지스트리"
labels: 'nf, cost-control, priority:low, mvp-in, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-COST-002] 외부 도구 구독 월 ≤ 30만원 회계 리뷰 정책
- **목적**: REQ-NF-024 (외부 도구 구독 ≤ 30만원/월) 충족. 인프라 외 SaaS 도구(디자인·편집·분석 등)의 월간 합산 비용을 30만원 이하로 관리. 신규 구독 시 사전 승인 프로세스.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.5` — REQ-NF-024
- 선행: 없음

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **도구 레지스트리** — `docs/ops/tool-registry.md`:
  | 도구 | 용도 | 월 비용 | 구독 상태 |
  |---|---|---|---|
  | Figma | UI 디자인 | ₩0 (Free) | Active |
  | Canva | 콘텐츠 이미지 | ₩0 (Free) | Active |
  | GitHub | 코드 저장소 | ₩0 (Free) | Active |
  | Claude/GPT | AI 코딩 | ~₩30,000 | Active |
  | **합계** | | **~₩30,000** | |
- [ ] **신규 구독 승인 프로세스**:
  1. 도구 필요 사유 기록
  2. 무료 대안 확인
  3. 월 비용 + 누적 합계 계산
  4. 30만원 이하 확인 → 승인
- [ ] **분기 리뷰**: 미사용 구독 해지

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 합계 ≤ 30만원
- **Given**: 전체 도구 비용 집계 → **Then**: ≤ ₩300,000

### Scenario 2: 신규 구독 — 사전 승인
- **Given**: 신규 도구 구독 시도 → **Then**: 레지스트리 등록 + 합계 확인

### Scenario 3: 30만원 초과 → 차단
- **Given**: 합계 32만원 → **Then**: 구독 차단 + 대안 탐색

### Scenario 4: 분기 리뷰
- **Given**: 분기 종료 → **Then**: 미사용 도구 해지

### Scenario 5: 레지스트리 문서 최신
- **Given**: 구독 변경 시 → **Then**: 레지스트리 갱신

### Scenario 6: Free 대안 우선
- **Given**: 유료 도구 검토 → **Then**: Free 대안 먼저 평가

## :gear: Technical & Non-Functional Constraints
- **운영 문서 기반**: 코드 아닌 정책 문서. 자동화 불필요
- **금지**: 레지스트리 미등록 구독, 30만원 초과 방치

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 통과 + 도구 레지스트리 + 승인 프로세스 문서

## :construction: Dependencies & Blockers
- **Depends on**: 없음
- **Related**: REQ-NF-024
