# [Feature] FW-TF-003: 교안 PDF 묶음 우편 발송 신청 (Could Have, MVP-DEFER) — Stage 2 검토

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] FW-TF-003: TEACHER 의 PDF 묶음 우편 발송 신청 — Could Have, MVP-DEFER (Stage 2 본격 검토) + 명세만 정의"
labels: 'feature, backend, teacher, mail, priority:low, mvp-defer, stage-2'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [FW-TF-003] TEACHER 가 본 사이트의 모든 lesson PDF (교안) 를 인쇄하여 우편으로 받을 수 있도록 신청 — 운영자가 수동으로 인쇄·발송 또는 외주 인쇄 서비스 통합. **MVP-DEFER** 분류로 Stage 1 에서는 명세만 작성 + 데이터 모델 정의 + Stage 2 본격 구현 검토
- **목적**: PRD 의 "디지털 환경 접근 어려운 교사·학생 지원" — 일부 교사가 PDF 다운로드 후 인쇄하기 부담스러운 경우 (특히 시골 학교) 직접 우편 발송으로 접근성 보장. **CON-08 (단일 제작자) 의 운영 부담 + CON-07 (비용)** 고려하여 Stage 1 에는 미구현. 본 태스크는 명세 + 데이터 준비만.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.1.3` — REQ-FUNC-018 (Could Have — 우편 발송)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-07 (비용), CON-08 (단일 제작자)
  - `/docs/SRS_V0_9.md#1.2.5` — Stage 2 검토 항목
- 외부: 한국 우체국 EMS 또는 일반 등기 (수기 처리)
- 선행: CT-DB-007 (TeacherFeedback 모델 — 본인 동의), FR-AUTH-002 (RBAC TEACHER)
- 짝: Stage 2 의 별도 PrintRequest 모델·운영 SOP

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **Stage 분류 명확화 — MVP-DEFER**:
  - 본 태스크 PR 은 **명세 문서만** 추가
  - 코드 0건. 데이터 모델 정의도 Stage 2 시점
  - GitHub Issue 라벨 — `mvp-defer, stage-2, could-have`
- [ ] **데이터 모델 사전 정의 (Stage 2 구현 가이드)** — 본 태스크는 schema 추가 없이 **schema 제안만**:
  ```prisma
  // Stage 2 시점에 추가 (본 태스크 PR 미포함)
  model PrintRequest {
    id              String   @id @default(uuid())
    teacherId       String
    teacher         User     @relation(fields: [teacherId], references: [id])

    // 발송 정보 — PII (CON-01 위반 위험 → Stage 2 재검토)
    recipientName   String   @db.VarChar(50)
    addressLine1    String   @db.VarChar(200)
    addressLine2    String?  @db.VarChar(200)
    postalCode      String   @db.VarChar(10)
    phoneNumber     String?  @db.VarChar(20)

    // 신청 내용
    selectedLessons String[]  // 교안 lesson_id 배열
    notes           String?  @db.Text

    // 운영자 처리
    status          String   @default("pending")  // pending | approved | shipped | delivered | cancelled
    trackingNumber  String?  @db.VarChar(50)
    shippedAt       DateTime?

    createdAt       DateTime @default(now())
    updatedAt       DateTime @updatedAt
  }
  ```
- [ ] **CON-01 (PII 최소) 정책 충돌 인지**:
  - 본 기능은 발송을 위해 **이름·주소·연락처** 수집 필요 → CON-01 의 PII 최소 정책과 충돌
  - **Stage 2 시점에 별도 정책 결정 필요**:
    - 옵션 A: 본 기능 영구 제외 (CON-01 우선)
    - 옵션 B: 본 기능 한정 PII 수집 + 별도 동의 + 별도 retention 정책 (예: 발송 후 30일 자동 삭제)
    - 옵션 C: 외주 인쇄 서비스 활용 (PII 외부 위탁) + 본 사이트는 lesson 선택만 처리
  - **본 태스크는 옵션 명시만**. Stage 2 결정
- [ ] **운영 부담 평가**:
  - 단일 제작자 가정 — 인쇄·포장·발송이 시간 부담 (평균 30분/건)
  - 월 10건 신청 시 5시간/월 → 콘텐츠 제작 시간 잠식
  - **외주 인쇄 서비스 권장** (Stage 2 시점) — 비용 ~5,000원/건
  - 비용 분담 정책 — 무료 제공 vs 우편 비용만 사용자 부담 (Stage 2 결정)
- [ ] **사용자 신청 흐름 (Stage 2 가이드)**:
  1. TEACHER 페이지에서 "교안 묶음 우편 신청" 버튼 (조건 — will_reuse=true 표시한 lesson 1개 이상)
  2. 발송 정보 입력 (이름·주소·연락처·선택 lesson)
  3. 동의 체크박스 (PII 수집 + 발송 후 30일 자동 삭제)
  4. 신청 → 운영자 알림 → 운영자 검토·승인 → 인쇄·발송
  5. 운송장 번호 발송 후 사용자에게 메일 알림
- [ ] **신청 자격 정책 (Stage 2)**:
  - TEACHER 역할 + will_reuse=true 표시 1개 이상 (FW-TF-001 의 데이터 활용)
  - 분기당 1회 신청 (악용 방지)
- [ ] **취소 정책**:
  - 신청 후 운영자 승인 전 — 사용자 취소 가능
  - 승인 후 — 취소 불가 (인쇄 시작)
- [ ] **PII retention 정책 (Stage 2)**:
  - 발송 완료 후 30일 자동 삭제 (CON-01 정신 보강)
  - 운송장 번호만 보존 (분실·반송 대응)
  - 본 retention 은 별도 cron 으로 실행 (Stage 2 후속)
- [ ] **본 태스크 PR 의 산출물**:
  - `docs/print-request-stage2-spec.md` — 본 명세 문서
  - GitHub Issue 의 mvp-defer 라벨
  - PR 본문에 "Stage 2 검토 항목. Stage 1 에는 코드 0건" 명시
- [ ] **본 태스크 의 향후 의존성 정리** (Stage 2 진입 시):
  - PrintRequest 모델 마이그레이션
  - Server Action `requestPrintShipment()`
  - 운영자 검토 페이지 (`/admin/print-requests`)
  - PII retention cron

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 명세 문서 작성
- **Given**: 본 태스크 PR
- **When**: docs/print-request-stage2-spec.md 검토
- **Then**: 데이터 모델 + 운영 흐름 + PII 정책 + 비용 분석 모두 포함

### Scenario 2: Stage 2 의존성 정리
- **Given**: 명세
- **When**: 후속 태스크 정의
- **Then**: PrintRequest 모델·Server Action·운영자 페이지·PII cron 4건 후속 명시

### Scenario 3: CON-01 충돌 명시
- **Given**: PII 수집 필요
- **When**: 명세 검토
- **Then**: CON-01 충돌 명시 + 3개 옵션 (영구 제외 / 한정 수집 / 외주) 모두 검토

### Scenario 4: 운영 부담 평가
- **Given**: 명세
- **When**: 검토
- **Then**: 평균 30분/건 + 월 10건 시 5시간/월 부담 평가 포함

### Scenario 5: 외주 인쇄 옵션
- **Given**: 명세
- **When**: 비용 분석
- **Then**: 외주 인쇄 ~5,000원/건 + 비용 분담 정책 (무료 vs 사용자 부담) 양 옵션 명시

### Scenario 6: 신청 자격 정책
- **Given**: 명세
- **When**: 검토
- **Then**: TEACHER + will_reuse=true 1개 이상 + 분기당 1회 명시

### Scenario 7: PII retention 정책
- **Given**: 명세
- **When**: 검토
- **Then**: 발송 후 30일 자동 삭제 + 운송장 번호만 보존 명시

### Scenario 8: 취소 정책
- **Given**: 명세
- **When**: 검토
- **Then**: 승인 전 취소 가능 / 승인 후 취소 불가 명시

### Scenario 9: GitHub Issue 라벨
- **Given**: 본 태스크 Issue
- **When**: 라벨 검사
- **Then**: `mvp-defer, stage-2, could-have` 모두 부착

### Scenario 10: Stage 2 진입 트리거
- **Given**: REQ-NF-046 충족 + Stage 1 → Stage 2 전환 시점
- **When**: 본 태스크 재검토
- **Then**: 명세 기반 본격 구현 시작

## :gear: Technical & Non-Functional Constraints
- **MVP-DEFER 강제**: Stage 1 에는 코드 0건. 명세만
- **CON-01 PII 충돌 인지**: 3개 옵션 모두 검토 + Stage 2 결정
- **운영 부담 평가 의무**: 단일 제작자 시간 vs 사용자 가치 균형
- **외주 인쇄 권장**: 운영 부담 최소화 + PII 외부 위탁 (양면 검토)
- **PII retention 30일**: CON-01 정신 보강
- **신청 자격 — TEACHER + will_reuse=true 1개 이상**: 본인 검증된 사용자만
- **분기당 1회 신청**: 악용 방지
- **취소 정책 분리**: 승인 전 / 후
- **Stage 2 의존성 4건 명시**: 모델·Server Action·운영자 페이지·PII cron
- **금지**:
  - Stage 1 에 코드 작성 (MVP-DEFER 위반)
  - PII 정책 결정 없이 무분별 수집
  - 신청 자격 없는 (LEARNER) 의 신청 허용
  - PII retention 정책 누락

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `docs/print-request-stage2-spec.md` 명세 문서
- [ ] PrintRequest 모델 schema 제안 (Stage 2 가이드)
- [ ] CON-01 충돌 + 3개 옵션 검토
- [ ] 운영 부담 + 비용 분석
- [ ] PII retention 정책
- [ ] Stage 2 의존성 4건 명시
- [ ] GitHub Issue 라벨 부착 (`mvp-defer, stage-2, could-have`)
- [ ] PR 본문에 "Stage 2 검토 항목. Stage 1 코드 0건" 명시

## :construction: Dependencies & Blockers
- **Depends on**:
  - CT-DB-007 (TeacherFeedback — will_reuse 데이터)
  - FR-AUTH-002 (RBAC TEACHER)
- **Blocks** (Stage 2 진입 시):
  - PrintRequest 모델 마이그레이션
  - requestPrintShipment() Server Action
  - 운영자 검토 페이지
  - PII retention cron
- **Related**:
  - REQ-FUNC-018 (Could Have)
  - CON-01 (PII 최소) 충돌
  - CON-07 (비용), CON-08 (운영 부담)
