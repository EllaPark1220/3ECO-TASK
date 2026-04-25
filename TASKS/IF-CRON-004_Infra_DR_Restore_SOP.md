# [Feature] IF-CRON-004: Disaster Recovery 절차 — RTO ≤4h pg_restore + 검증 + 훈련 SOP

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Feature] IF-CRON-004: Disaster Recovery SOP — pg_restore 절차 + RTO ≤4h + 분기별 훈련 + 별도 staging DB 검증"
labels: 'infra, dr, sop, documentation, priority:high, mvp-in, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [IF-CRON-004] Disaster Recovery (DR) 표준 운영 절차 — IF-CRON-003 의 백업 파일을 활용한 `pg_restore` 절차 문서화 + RTO 4시간 내 복원 가능 검증 + 분기별 훈련 (drill) + 별도 staging DB 에서 검증 후 production 복원
- **목적**: REQ-NF-012 (RTO ≤4h — 4시간 내 서비스 복구) 충족. 단일 제작자(CON-08) 가 DB 손상 (R11) 발생 시 명확한 절차 따라 자력 복구 가능. **운영 SOP 문서 + 분기별 drill** 으로 구성. 본 태스크는 코드 0건, 운영 문서 + 검증 절차 + 훈련 결과 보관.

## :link: References (Spec & Context)
> :bulb: AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- SRS 문서:
  - `/docs/SRS_V0_9.md#4.2.2` — REQ-NF-011 (RPO 24h), REQ-NF-012 (RTO 4h)
  - `/docs/SRS_V0_9.md#6.6` — R11 (DB 손상 위험)
  - `/docs/SRS_V0_9.md#1.5.2` — CON-08 (단일 제작자)
- 외부 문서:
  - `https://www.postgresql.org/docs/current/app-pgrestore.html`
  - Supabase 의 backup 복원 가이드
- 선행: IF-CRON-003 (pg-dump 백업 파일 진입), IF-SUP-001 (Supabase Storage `backups`)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] `docs/dr-runbook.md` 신규 문서 — DR 표준 절차
- [ ] **DR 시나리오 분류**:
  - **Sev1 — 완전 손실**: DB 전체 손상·삭제 → 전체 복원
  - **Sev2 — 부분 손실**: 일부 테이블 손상 → selective restore
  - **Sev3 — 데이터 오염**: 의도 외 UPDATE/DELETE → 시점 복원
- [ ] **표준 절차 (Sev1 기준)**:
  1. **인지** (T+0): Sentry 알림·운영자 인지 → DR 모드 선언
  2. **백업 다운로드** (T+5분):
     ```bash
     # Supabase Storage CLI 또는 Dashboard 활용
     supabase storage cp \
       backups/pg-dump-YYYY-MM-DD-<uuid>.sql.gz \
       ./restore.sql.gz
     ```
  3. **staging DB 준비** (T+15분):
     - Supabase Dashboard 에서 새 staging 프로젝트 생성 (Free 플랜)
     - 또는 로컬 Docker PostgreSQL `docker run -e POSTGRES_PASSWORD=... postgres:15`
  4. **staging 복원 + 검증** (T+1시간):
     ```bash
     pg_restore --no-owner --no-privileges \
       --dbname=postgresql://staging-url \
       restore.sql.gz

     # 검증 쿼리
     psql staging-url -c "SELECT COUNT(*) FROM \"User\";"
     psql staging-url -c "SELECT COUNT(*) FROM \"Lesson\";"
     # ... 모든 핵심 테이블 row 카운트 확인
     ```
  5. **production 복원** (T+2시간):
     - Supabase Dashboard → Database → Reset (위험)
     - 또는 새 production 프로젝트 + DNS 전환 (안전)
     - **권장**: Supabase Pro 의 Point-in-Time Recovery (PITR) 활성 후 활용
  6. **DNS 전환** (T+3시간):
     - Vercel 환경변수 갱신 (DATABASE_URL → 새 production URL)
     - 재배포 (vercel deploy --prod)
  7. **검증** (T+3.5시간):
     - 모든 E2E 테스트 (TS-E2E-001~010) 실행
     - 핵심 5플로 (로그인·시청·OX·스탬프·교안) 수동 검증
  8. **DR 모드 해제** (T+4시간):
     - 사용자 공지 (Twitter·랜딩 배너)
     - 사후 분석 보고서 (별도 SOP)
- [ ] **분기별 drill (훈련) 일정**:
  - **Q1 (3월), Q2 (6월), Q3 (9월), Q4 (12월)** 각 첫 주 토요일 새벽
  - **drill 절차**:
    1. 최신 백업 파일 다운로드
    2. 별도 staging DB 에 복원
    3. 핵심 데이터 row 카운트 검증
    4. 복원 시간 측정 + 기록
    5. 4시간 초과 시 절차 개선 방향 도출
- [ ] **drill 결과 기록 — `docs/dr-drill-history.md`**:
  ```markdown
  ## 2026 Q2 DR Drill (2026-04-04)
  - 백업 파일: pg-dump-2026-04-03-abc12345.sql.gz (12 MB)
  - 다운로드 시간: 8분
  - staging 복원 시간: 35분
  - 검증 시간: 20분
  - 총 RTO 시뮬레이션: 1시간 3분 (목표 ≤4시간 충족)
  - 발견 이슈: pg_restore 의 --no-owner 옵션 미적용 시 권한 오류
  - 개선 사항: 절차 #4 의 명령어에 옵션 명시 + dr-runbook.md 갱신
  ```
- [ ] **Supabase Pro 전환 시 PITR 통합**:
  - Pro 플랜 (월 $25) 활성 시 Point-in-Time Recovery (7일) 자동
  - Free 플랜 — 본 태스크의 pg_dump 만이 유일한 복원 수단
  - D-TIER 트리거 도달 시 Pro 전환 검토 (IF-VC-002)
- [ ] **PII 보호 정책 (drill)**:
  - drill 시 staging DB 는 격리된 환경 (외부 접근 차단)
  - drill 종료 후 staging DB 즉시 폐기 (데이터 leak 방지)
  - drill 검증 결과만 기록. PII 가 포함된 SQL 결과는 저장 금지
- [ ] **자동화 스크립트 — `scripts/dr-staging-restore.sh`**:
  ```bash
  #!/bin/bash
  set -euo pipefail
  BACKUP_FILE=$1
  STAGING_URL=$2

  echo "[$(date)] DR Staging Restore 시작"
  pg_restore --no-owner --no-privileges \
    --dbname="$STAGING_URL" \
    "$BACKUP_FILE"
  echo "[$(date)] 복원 완료"

  # 검증
  for table in User Lesson Module OxQuestion LessonProgress Stamp TeacherFeedback EventLog; do
    count=$(psql "$STAGING_URL" -t -c "SELECT COUNT(*) FROM \"$table\";")
    echo "  $table: $count rows"
  done
  ```
- [ ] **Vercel 측 DR 정책 (별도)**:
  - Vercel Functions 코드는 GitHub repo 가 SSOT — `git pull` + `vercel deploy --prod` 로 즉시 복원 가능
  - DB 만이 본 태스크의 범위
- [ ] **모니터링 통합**:
  - Sentry 의 critical 알림이 DR 모드 진입 트리거
  - Slack/SMS 운영자 채널

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: dr-runbook.md 작성 + 검토
- **Given**: 본 태스크 PR
- **When**: docs/dr-runbook.md 검토
- **Then**: 8단계 절차 + 명령어 + 검증 쿼리 모두 포함

### Scenario 2: 첫 drill 실행 — Q2 2026
- **Given**: 2026-04-04 (Q2 drill)
- **When**: 절차 실행
- **Then**: 총 시간 ≤ 4시간. 결과 dr-drill-history.md 에 기록

### Scenario 3: drill 시간 4시간 초과 시 절차 개선
- **Given**: 의도적 시뮬레이션 (대용량 데이터)
- **When**: 4시간 초과
- **Then**: 절차 개선 방향 도출 + dr-runbook.md 갱신 + 다음 분기 재훈련

### Scenario 4: 자동화 스크립트 동작
- **Given**: scripts/dr-staging-restore.sh + 백업 파일
- **When**: `./dr-staging-restore.sh restore.sql.gz $STAGING_URL`
- **Then**: 정상 복원 + 모든 테이블 row 카운트 출력

### Scenario 5: PII 보호 — staging 즉시 폐기
- **Given**: drill 종료
- **When**: 1시간 내
- **Then**: staging DB 폐기 + 검증 결과만 기록 (PII 미저장)

### Scenario 6: Supabase Pro 전환 시 PITR 활용
- **Given**: D-TIER 트리거 도달 + Pro 전환
- **When**: dr-runbook.md 갱신
- **Then**: PITR 우선 사용 + pg_dump 는 백업 정책으로 강등

### Scenario 7: 분기별 drill 알림
- **Given**: 매 분기 첫 주 토요일 새벽
- **When**: 운영자 캘린더 알림
- **Then**: drill 자동 알림 + Sentry·Slack 통합

### Scenario 8: 백업 파일 무결성 검증
- **Given**: 다운로드한 .sql.gz 파일
- **When**: `gzip -t restore.sql.gz` 실행
- **Then**: 무결성 OK. 손상 0건

### Scenario 9: 핵심 5플로 검증 — drill 종료 시
- **Given**: staging 복원 후
- **When**: E2E 일부 (로그인·시청·OX) 실행
- **Then**: 정상 동작. drill 종료

### Scenario 10: 사후 분석 보고서
- **Given**: 실제 DR 발동 후
- **When**: 1주일 내
- **Then**: docs/dr-incident-YYYY-MM-DD.md 작성 + 원인·교훈·개선 사항 기록

## :gear: Technical & Non-Functional Constraints
- **RTO ≤ 4시간 (REQ-NF-012)**: 8단계 절차 시간 합산 검증
- **분기별 drill 의무**: 단일 제작자 부담 고려 — 분기 1회 (총 4회/년)
- **staging 격리 + 즉시 폐기**: PII leak 방지
- **Supabase Pro 전환 시점 PITR 우선**: pg_dump 는 추가 보호로 유지
- **Vercel 측 DR 분리**: 코드는 git, DB 만 본 태스크
- **자동화 스크립트 의무**: 절차 의존성 (수동 실수) 최소화
- **drill 결과 기록**: dr-drill-history.md — 매 분기 누적
- **사후 분석 보고서**: 실제 DR 발동 시 의무 작성
- **PII 보호 강제**: drill 결과에 SQL 결과 PII 미저장
- **운영자 알림 통합**: 매 분기 캘린더 + Sentry critical
- **금지**:
  - production 직접 복원 (검증 없이)
  - drill 결과에 PII 포함
  - 자동화 스크립트 없이 수동 절차만 (실수 위험)
  - drill 결과 미기록 (개선 사항 손실)

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 전부 통과
- [ ] `docs/dr-runbook.md` 8단계 절차 + 명령어
- [ ] `docs/dr-drill-history.md` 작성 (Q2 첫 drill 결과 포함)
- [ ] `scripts/dr-staging-restore.sh` 자동화 스크립트
- [ ] 분기별 drill 캘린더 알림 등록
- [ ] PII 보호 정책 명시
- [ ] Supabase Pro 전환 시점 PITR 통합 안내
- [ ] 첫 drill (Q2 2026) 실행 + 4시간 내 검증
- [ ] PR 본문에 "REQ-NF-012 RTO 4h 충족 SOP. 분기별 drill 의무" 명시

## :construction: Dependencies & Blockers
- **Depends on**:
  - IF-CRON-003 (pg-dump 백업 파일 진입)
  - IF-SUP-001 (Supabase Storage `backups`)
- **Blocks**:
  - REQ-NF-012 (RTO 4h) 충족
  - R11 (DB 손상) 대응 가능
  - Public Pilot 진입 시점의 운영 안정성
- **Related**:
  - IF-VC-002 (Pro 전환 — PITR 활성)
  - 운영자 SOP — 매 분기 drill
