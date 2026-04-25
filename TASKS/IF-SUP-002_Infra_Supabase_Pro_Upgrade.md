# [Infra] IF-SUP-002: Supabase Free → Pro 전환 + event_log 90일 + 감사 로그

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Infra] IF-SUP-002: Supabase Pro 전환 (MAU 1K 도달 시) + event_log 90일 보관 + 감사 로그 활성화"
labels: 'infra, supabase, tier-upgrade, compliance, priority:low, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-SUP-002] Supabase Free → Pro 전환 + event_log 90일 보관 + 감사 로그 90일 활성화
- **목적**: MAU 1,000 도달 시 Supabase Pro 로 전환하여 Free 한도(DB 500MB, Bandwidth 5GB/월)를 해소하고, REQ-NF-022 (감사 로그 90일 보관) · REQ-NF-031 (event_log 30→90일 확장) 을 충족한다. Pro 전환은 IF-VC-002 (D-TIER 트리거) 의 T2 (MAU) 트리거와 연동되며, 전환 후 Point-in-Time Recovery, 더 큰 DB·Storage 용량, 일별 자동 백업을 활용한다.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.3` — REQ-NF-022 (감사 로그 90일), REQ-NF-031 (event_log 보관 확장)
  - `/docs/SRS_V0_9.md#1.5.1.2` — D-TIER (Supabase Free → Pro 전환 조건)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-07 (월 0~10만원 비용)
  - `/docs/SRS_V0_9.md#6.6` — R10 (Supabase pause — Pro 전환 시 해소)
- 외부 문서:
  - `https://supabase.com/pricing` — Pro 플랜 $25/월
  - `https://supabase.com/docs/guides/platform/backups` — PITR (Pro 이상)
- 선행: IF-SUP-001 (Supabase Free 셋업)
- 짝: IF-VC-002 (D-TIER 트리거 — MAU 1K 도달 알림)

## :white_check_mark: Task Breakdown (실행 계획)

### 전환 조건 정의
- [ ] **전환 트리거 (D-TIER T2)**:
  - MAU ≥ 1,000 (주 트리거)
  - DB 크기 ≥ 400MB (Free 500MB 의 80%)
  - Bandwidth ≥ 4GB/월 (Free 5GB 의 80%)
  - 셋 중 하나라도 도달 시 전환 검토 시작
- [ ] **전환 결정 SOP** — `docs/sop/supabase-pro-upgrade.md`:
  1. IF-VC-002 알림 수신 (MAU 800 Warning → 1000 Critical)
  2. Supabase Dashboard 에서 Usage 확인
  3. Pro 전환 비용 영향 분석 (월 $25 = ~₩34,000)
  4. CON-07 한도 (₩100,000/월) 확인
  5. Supabase Dashboard → Settings → Billing → Upgrade to Pro

### Pro 전환 후 설정
- [ ] **event_log 보관 정책 변경** — 30일 → 90일:
  ```sql
  -- Pro 전환 후 적용
  -- event_log 자동 삭제 cron 변경
  -- 기존: DELETE WHERE timestamp < NOW() - INTERVAL '30 days'
  -- 변경: DELETE WHERE timestamp < NOW() - INTERVAL '90 days'
  ```
  - `lib/cron/eventLogRetention.ts` 수정:
    ```ts
    const RETENTION_DAYS = process.env.SUPABASE_PLAN === 'pro' ? 90 : 30;
    ```
- [ ] **감사 로그 활성화** — Supabase Dashboard → Settings → Database → Audit Log:
  - 관리자 행위 (User role 변경, DB 스키마 변경)
  - 콘텐츠 개정 (Lesson revision 변경)
  - 라이선스 변경 이벤트
  - 보관: 90일 (REQ-NF-022)
- [ ] **Point-in-Time Recovery (PITR) 활성화**:
  - Pro 플랜에서 제공되는 PITR 활성화
  - RPO 개선: 24h (Free 수동 pg_dump) → 실시간 (WAL 기반)
  - IF-CRON-003 의 수동 pg_dump 는 보조 백업으로 유지
- [ ] **DB 크기 확장**: Free 500MB → Pro 8GB (초기). 필요 시 자동 확장
- [ ] **Storage 확장**: Free 1GB → Pro 100GB
- [ ] **Bandwidth 확장**: Free 5GB/월 → Pro 250GB/월
- [ ] **R10 Supabase pause 해소**: Pro 플랜은 자동 pause 없음. IF-CRON-002 (Supabase ping) 의 필요성 재검토

### 비용 모니터링
- [ ] **월간 비용 추적** — Supabase 청구서 확인:
  - Pro 기본: $25/월 (~₩34,000)
  - 추가 사용량: DB 8GB 초과 시 $0.125/GB, Storage 100GB 초과 시 $0.021/GB
  - 총 예상: MVP 단계 $25~30/월 (~₩34,000~₩41,000)
- [ ] **NF-COST-001 과 정합**: 월 인프라 총비용 (Vercel + Supabase + Resend) ≤ ₩100,000 검증
- [ ] **비용 알림** — Supabase Dashboard 의 Billing Alerts 설정 ($50 도달 시 알림)

### 환경변수 갱신
- [ ] **Vercel 환경변수 갱신** (필요 시):
  - Pro 전환 시 Connection String 변경 가능성 확인
  - 일반적으로 URL 유지 (동일 프로젝트 업그레이드)
  - `SUPABASE_PLAN=pro` 환경변수 추가 (retention 정책 분기용)

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: Pro 전환 후 DB 크기 확장
- **Given**: Free → Pro 전환 완료
- **When**: DB 크기 확인
- **Then**: 한도 8GB (Free 500MB 대비 16배). 기존 데이터 유실 0건

### Scenario 2: event_log 90일 보관
- **Given**: Pro 전환 + retention 정책 변경
- **When**: 91일 전 event_log 확인
- **Then**: 91일 전 데이터 삭제됨. 90일 이내 데이터 보존

### Scenario 3: 감사 로그 활성화
- **Given**: Audit Log 활성화
- **When**: 관리자가 User role 변경
- **Then**: Audit Log 에 변경 이력 기록. 90일 보관

### Scenario 4: PITR 활성화
- **Given**: Pro 전환 + PITR ON
- **When**: 특정 시점 복구 테스트
- **Then**: WAL 기반 실시간 복구 가능. RPO ~0 (실시간)

### Scenario 5: R10 pause 해소
- **Given**: Pro 플랜
- **When**: 7일 무활동
- **Then**: 자동 pause 발생하지 않음 (Pro 정책)

### Scenario 6: 비용 ≤ ₩100,000/월
- **Given**: Pro $25/월 + Vercel Hobby $0 + Resend Free $0
- **When**: 월간 청구서 확인
- **Then**: 총 ≤ ₩100,000 (CON-07)

### Scenario 7: 기존 데이터 무손실
- **Given**: Free → Pro 전환
- **When**: 전환 직후 데이터 검증
- **Then**: Lesson·User·EventLog·Stamp 모든 테이블 row count 동일. 데이터 유실 0건

### Scenario 8: Connection String 유지
- **Given**: Pro 전환
- **When**: Vercel 환경변수 확인
- **Then**: DATABASE_URL 변경 불필요 (동일 프로젝트 업그레이드). 앱 재배포 불필요

## :gear: Technical & Non-Functional Constraints
- **전환 시점**: IF-VC-002 의 T2 (MAU 1K) 트리거 도달 시. 사전 검토 (MAU 800 Warning)
- **비용 예산 (CON-07)**: Supabase Pro $25/월 + Vercel Hobby $0 = $25/월 (~₩34,000). 한도 ₩100,000 내
- **데이터 무손실**: In-place 업그레이드 (동일 프로젝트). 마이그레이션·데이터 이동 불필요
- **retention 정책 분기**: `SUPABASE_PLAN` 환경변수로 30일/90일 자동 전환
- **PITR 정책**: Pro 기본 제공. 별도 설정 불필요 (Supabase Dashboard 에서 ON)
- **감사 로그 범위**: 관리자 행위 + 콘텐츠 개정 + 라이선스 변경. 학습자 일반 활동은 EventLog 가 담당
- **금지**:
  - Free 한도 초과 후 Pro 전환 지연 (데이터 손실 위험)
  - Pro 전환 없이 event_log 90일 보관 시도 (Free DB 500MB 한도 위험)
  - Supabase Pro 를 DB 외 용도 (Edge Functions 등) 로 남용 (비용 증가)

## :checkered_flag: Definition of Done (DoD)
- [ ] 8개 GWT 시나리오 전부 통과
- [ ] `docs/sop/supabase-pro-upgrade.md` SOP 작성
- [ ] event_log retention 정책 — `SUPABASE_PLAN` 분기 구현
- [ ] 감사 로그 90일 활성화 절차 문서화
- [ ] PITR 활성화 절차 문서화
- [ ] 비용 예측 + CON-07 한도 검증
- [ ] IF-VC-002 T2 (MAU 1K) 트리거와 연동 검증
- [ ] PR 본문에 "REQ-NF-022·031 충족. D-TIER T2 트리거 → Pro 전환" 명시
- [ ] Linter 경고 0건

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-SUP-001 (Supabase Free 셋업 — 전환 대상)
  - IF-VC-002 (D-TIER 트리거 — MAU 1K 알림)
  - CT-DB-009 (EventLog 테이블 — retention 정책 대상)
- **Blocks**:
  - NF-OBS-007 (event_log 보관 정책 — Pro 전환 후 90일 자동 연장)
  - NF-SEC-004 (감사 로그 90일 — Pro 전환 의존)
- **Related**:
  - REQ-NF-022 (감사 로그 90일)
  - REQ-NF-031 (event_log 보관 확장)
  - CON-07 (월 비용 0~10만원)
  - R10 (Supabase pause — Pro 전환 시 해소)
