# [Feature] NF-FINAL-002: 운영 SOP 통합 + 단일 제작자 위임 가이드 — runbook 카탈로그 + 비상 연락 + 인계 절차

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] NF-FINAL-002: 운영 SOP 통합 카탈로그 — 모든 runbook 단일 진입점 + 비상 연락 + 임시 위임 절차 + 영구 인계 절차 + 분기 갱신"
labels: 'nf, final, sop, runbook, delegation, priority:high, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-FINAL-002] 단일 제작자(CON-08) 환경의 모든 운영 SOP 통합 카탈로그 — (1) 단일 진입점 docs/runbook/index.md + (2) 카테고리별 분류 (Cron·DR·Rollback·Burnout·Security·Stage Gates) + (3) 비상 연락처 + (4) 임시 위임 (휴가) 절차 + (5) 영구 인계 (제작자 변경) 절차 + (6) 분기별 갱신 의무
- **목적**: 단일 제작자의 사고·휴가·번아웃·인계 시 사이트가 멈추지 않게 하는 마지막 안전망. 모든 SOP 가 흩어져 있으면 비상시 즉시 활용 불가 → 통합 카탈로그 + 외주자·후임자가 30분 내 인지 가능한 가이드. 본 사이트의 운영 영속성 보장.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#1.5.2` — CON-08 (단일 제작자)
  - `/docs/SRS_V0_9.md#6.6` — Risk Register
- 선행: 모든 SOP 발행 태스크 (NF-RISK-003·004·005, NF-SEC-003, IF-CRON-003·004, NF-A11Y-001, NF-STAGE-001, NF-FINAL-001 등)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Runbook 통합 카탈로그 — `docs/runbook/index.md`**:
  ```markdown
  # 경제 판단력 교과서 운영 Runbook

  > 본 카탈로그는 모든 운영 SOP 의 단일 진입점입니다.
  > 비상시 본 페이지 → 해당 SOP 로 즉시 이동.

  ## 1. 비상 대응 (urgency: critical)

  | 상황 | SOP 위치 | RTO |
  |---|---|---|
  | 배포 후 장애 | docs/rollback-runbook.md | 5분 |
  | DB 데이터 손실 | docs/dr-restore-sop.md | 1시간 |
  | 시크릿 노출 | docs/secret-rotation-sop.md | 5분 |
  | 외부 SaaS 장애 | docs/dependency-incident-sop.md | 30분 |
  | Burnout critical | docs/burnout-content-pause-sop.md | 즉시 |

  ## 2. 정기 운영 (urgency: high)

  | 작업 | 빈도 | SOP |
  |---|---|---|
  | DR drill | 분기 1회 | docs/dr-drill-sop.md |
  | NVDA a11y 검증 | 분기 1회 | docs/nvda-manual-test-sop.md |
  | 시크릿 회전 | 분기 1회 | docs/secret-rotation-sop.md |
  | Branch Protection 검증 | 분기 1회 | docs/branch-protection-sop.md |
  | Stage 1→2 검토 | 분기 1회 | docs/stage1to2-decision-sop.md |
  | Burnout 자가 진단 | 매주 | /admin/burnout |
  | 의존성 모니터링 검토 | 매주 | /admin/dependencies |

  ## 3. 콘텐츠 운영 (urgency: medium)

  | 작업 | SOP |
  |---|---|
  | 신규 lesson 발행 | docs/content-publish-sop.md |
  | lesson 자동 unpublish 검토 | docs/content-moderation-sop.md |
  | 사용자 피드백 응답 | docs/user-support-sop.md |

  ## 4. 비상 연락처

  | 역할 | 연락처 | 활용 시점 |
  |---|---|---|
  | 제작자 (Ella) | <이메일> | 정상 운영 |
  | 백업 운영자 (지정) | <이메일> | 임시 위임 |
  | 외주 콘텐츠 검토자 | <이메일> | 콘텐츠만 |
  | Vercel Support | https://vercel.com/help | Vercel 장애 |
  | Supabase Support | https://supabase.com/support | DB 장애 |

  ## 5. 위임 절차

  - 임시 (휴가·병가·burnout) → docs/temporary-delegation-sop.md
  - 영구 (제작자 변경) → docs/permanent-handover-sop.md
  ```
- [ ] **임시 위임 SOP — `docs/temporary-delegation-sop.md`**:
  ```markdown
  # 임시 위임 SOP (휴가·병가·burnout)

  ## 트리거
  - 1주 이상 부재 예정
  - Burnout critical (NF-RISK-003)
  - 갑작스런 사고

  ## 사전 준비 (휴가 1주 전)
  1. 백업 운영자 지정 + 본 SOP 의 위치 공유
  2. Vercel + Supabase + GitHub 의 임시 권한 부여 (Read-only 권장)
  3. 비상 연락 대상 사용자 공지 (랜딩 배너)
  4. 콘텐츠 발행 일시중단 (NF-RISK-003)

  ## 위임 범위 (백업 운영자가 할 수 있는 것)
  - **할 수 있음**:
    - 사용자 문의 응답 (24시간 내, 긴급만)
    - 의존성 모니터링 + Sentry 알림 인지
    - Rollback 결정 (docs/rollback-runbook.md 따라)
    - 사용자 신규 콘텐츠 자동 unpublish 시 임시 비공개 유지
  - **할 수 없음** (제작자 복귀 시까지 대기):
    - 신규 lesson 발행
    - 시크릿 회전 (긴급 노출 시 제외)
    - Stage 게이트 결정
    - 비용 정책 변경

  ## 권한 회수 (복귀 시)
  1. 임시 권한 revoke
  2. 위임 기간 동안 발생 이벤트 검토 (EventLog)
  3. 사용자 공지 (정상 운영 재개)
  ```
- [ ] **영구 인계 SOP — `docs/permanent-handover-sop.md`**:
  ```markdown
  # 영구 인계 SOP (제작자 변경)

  ## 트리거
  - 제작자가 운영 영구 중단 결정
  - 본 사이트의 새 운영자 또는 후원 단체 인수

  ## 절차 (4주 권장)

  ### 1주차 — 인계 준비
  1. 후임자에게 본 카탈로그 (docs/runbook/index.md) 공유
  2. 모든 시크릿 + 환경변수 catalog 공유 (.env.example)
  3. Vercel + Supabase + GitHub Owner 이전
  4. 도메인 (economic-judgment.app) 이전

  ### 2주차 — 동행 운영
  1. 후임자가 정기 작업 직접 실행 (제작자 보조)
  2. DR drill + 시크릿 회전 함께 수행
  3. 사용자 문의 동행 응답

  ### 3주차 — 후임 단독 운영 + 모니터링
  1. 후임자 단독 + 제작자는 주 1회 review 만
  2. 미해결 이슈 식별 + 추가 SOP 작성

  ### 4주차 — 완전 인계
  1. 제작자 권한 모두 revoke
  2. 사용자 공지 (제작자 변경 + 새 운영자 소개)
  3. 본 SOP 의 갱신 (후임자 정보)

  ## 인계 거부 옵션 (후임자 부재 시)
  1. 콘텐츠 archive 모드 (CC BY-NC-SA 4.0 따라 영구 무료 공개)
  2. 신규 가입 차단 + 기존 학습자 학습 가능
  3. 인프라 비용 후원 모집 (Toss 후원 등)
  4. 1년 archive 모드 후 영구 종료 시 — 사용자 공지 + 데이터 export 옵션 제공
  ```
- [ ] **분기별 갱신 의무**:
  - 모든 SOP 의 마지막 검토 일자 기록 (docs 의 frontmatter)
  - 분기 1회 운영자가 모든 SOP 검토 + 갱신
  - 90일 미갱신 SOP — admin 대시보드의 경고
- [ ] **/admin/runbook 페이지** — 운영자 대시보드:
  - 모든 SOP 카탈로그 (위 index.md 의 표 시각화)
  - 각 SOP 의 마지막 갱신 일자 + 90일 임계 알림
  - 분기 회의 일정 (NF-FINAL-001 정합)
- [ ] **본 카탈로그의 자동 검증 — CI step (선택)**:
  - 모든 SOP 파일이 frontmatter 의 last_reviewed 보유
  - 90일 초과 SOP 검출
  - main 차단 0 (경고만 — SOP 갱신은 운영 작업이라 PR 강제 부적절)
- [ ] **백업 운영자 지정 — Stage 1 후반**:
  - Stage 1 6개월 시점 — 후보자 1명 지정
  - 임시 위임 권한 부여 (Read-only)
  - 본 SOP 공유 + 시뮬레이션 (1회)
- [ ] **공개 데이터 archive 정책 (인계 거부 시)**:
  - 모든 lesson 콘텐츠 — CC BY-NC-SA 4.0 라 외부 미러링 가능
  - 본 사이트 종료 시 GitHub 또는 별도 호스팅으로 archive
  - 본 정책은 영구 인계 SOP 의 옵션으로 명시

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 통합 카탈로그 작성
- **Given**: docs/runbook/index.md
- **When**: 검토
- **Then**: 5 카테고리 + 모든 SOP 링크 + 비상 연락처

### Scenario 2: 임시 위임 SOP
- **Given**: docs/temporary-delegation-sop.md
- **When**: 검토
- **Then**: 사전 준비 + 위임 범위 + 회수 절차 명시

### Scenario 3: 영구 인계 SOP
- **Given**: docs/permanent-handover-sop.md
- **When**: 검토
- **Then**: 4주 절차 + 인계 거부 옵션 명시

### Scenario 4: SOP frontmatter — last_reviewed
- **Given**: 모든 SOP md
- **When**: 검사
- **Then**: 모든 파일에 last_reviewed 일자

### Scenario 5: 90일 미갱신 SOP — 경고
- **Given**: SOP 의 last_reviewed 100일 전
- **When**: admin 대시보드
- **Then**: 경고 알림

### Scenario 6: 분기 1회 갱신
- **Given**: 분기 첫째 날
- **When**: 운영자 SOP 검토
- **Then**: 모든 SOP 의 last_reviewed 갱신

### Scenario 7: 백업 운영자 지정 (Stage 1 6개월 시점)
- **Given**: Stage 1 6개월
- **When**: 운영자
- **Then**: 후보자 + Read-only 권한 + SOP 시뮬레이션

### Scenario 8: 인계 거부 옵션 — archive 모드
- **Given**: 영구 인계 SOP
- **When**: 후임자 부재
- **Then**: archive 모드 + 데이터 export 옵션 명시

### Scenario 9: 비상 연락처
- **Given**: index.md
- **When**: 검토
- **Then**: 5종 (제작자·백업·외주·Vercel·Supabase)

### Scenario 10: /admin/runbook 페이지
- **Given**: ADMIN
- **When**: 접속
- **Then**: 모든 SOP 카탈로그 + 갱신 알림

## :gear: Technical & Non-Functional Constraints
- **단일 진입점 — index.md**: 비상시 즉시 인지
- **5 카테고리 분류**: 비상·정기·콘텐츠·연락·위임
- **임시 vs 영구 위임 분리**: 명확한 절차
- **위임 범위 — 할 수 있음·없음 명시**: 백업 운영자 부담 최소
- **분기 갱신 의무 — last_reviewed**: 90일 초과 경고
- **CC BY-NC-SA 4.0 + archive 옵션**: 영속성 보장
- **백업 운영자 지정 (Stage 1 후반)**: 임시 위임 안전망
- **자동 검증 CI step (선택)**: 갱신 누락 알림
- **금지**:
  - SOP 흩어진 채 운영 (비상시 인지 지연)
  - 임시 위임 시 영구 권한 부여 (보안 위험)
  - 인계 거부 옵션 누락 (영속성 위협)
  - last_reviewed 누락

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] docs/runbook/index.md 통합 카탈로그
- [ ] docs/temporary-delegation-sop.md
- [ ] docs/permanent-handover-sop.md
- [ ] 모든 SOP 의 last_reviewed frontmatter
- [ ] /admin/runbook 페이지
- [ ] 분기 갱신 캘린더 등록
- [ ] 백업 운영자 지정 시점 (Stage 1 6개월) 정의
- [ ] PR 본문에 "단일 제작자 운영 영속성 + 인계 절차" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - 모든 SOP 발행 태스크 (NF-RISK-003·004·005, NF-SEC-003, IF-CRON-003·004, NF-A11Y-001, NF-STAGE-001, NF-FINAL-001)
- **Blocks**:
  - 단일 제작자 운영 영속성
  - CON-08 위험 mitigation 완료
- **Related**:
  - 모든 NF·IF SOP
  - PRD 12개월 종료 시점
  - CC BY-NC-SA 4.0
