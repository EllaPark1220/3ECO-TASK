# [NF] NF-OBS-008: 가용성 모니터링 — 외부 업타임 월 99.5%

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-OBS-008: 외부 업타임 모니터 — 월 99.5% (다운타임 ≤216분) 검증"
labels: 'nf, observability, uptime, priority:high, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-OBS-008] 외부 업타임 모니터링 — 월 99.5% SLO 검증
- **목적**: REQ-NF-007 (월간 가용성 99.5%, 다운타임 ≤216분) 을 외부 모니터링 서비스로 독립 측정. Vercel 자체 지표가 아닌 **외부 관점**에서 실제 사용자 접근 가능 여부를 5분 간격으로 검증.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#4.2.1` — REQ-NF-007 (가용성 99.5%)
- 선행: NF-OBS-001 (Sentry)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **외부 모니터 선택** (무료):
  - **UptimeRobot** Free: 50 모니터, 5분 간격 (채택 권장)
  - Better Uptime, Freshping (대안)
- [ ] **모니터 설정**:
  | # | URL | 방식 | 간격 |
  |---|---|---|---|
  | 1 | `https://economy-textbook.kr` | HTTP(S) 200 | 5분 |
  | 2 | `https://economy-textbook.kr/api/health` | HTTP(S) 200 + JSON | 5분 |
  | 3 | `https://economy-textbook.kr/lessons/L001` | HTTP(S) 200 | 5분 |
- [ ] **알림 연동**: 다운 시 이메일 + Slack (NF-OBS-002 Sev1 트리거)
- [ ] **월간 리포트**: UptimeRobot 대시보드 → 월간 가용성 % 확인
- [ ] **SLO 계산**: `(총 분 - 다운 분) / 총 분 × 100 ≥ 99.5`
- [ ] **NF-OBS-005 (Error Budget) 데이터 소스**: 다운타임 분 → Error Budget 입력

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 모니터 활성 — 3개 URL
- **Given**: UptimeRobot 설정 → **Then**: 3개 모니터 active

### Scenario 2: 다운 감지 — 5분 이내
- **Given**: 서비스 다운 → **Then**: 5분 내 알림

### Scenario 3: 월간 99.5% 달성
- **Given**: 30일 운영 → **Then**: 가용성 ≥ 99.5%

### Scenario 4: 다운타임 ≤ 216분/월
- **Given**: 다운타임 집계 → **Then**: ≤ 216분

### Scenario 5: Error Budget 연동
- **Given**: 다운타임 데이터 → **Then**: NF-OBS-005 소진율 계산 가능

### Scenario 6: 복구 알림
- **Given**: 서비스 복구 → **Then**: "UP" 알림

## :gear: Technical & Non-Functional Constraints
- **외부 관점 필수**: Vercel 내부 지표 아닌 외부 서비스에서 측정
- **비용**: 무료 (UptimeRobot Free 50 모니터)
- **간격**: 5분 (Free 한도)

## :checkered_flag: Definition of Done (DoD)
- [ ] 6개 GWT 통과 + 모니터 3개 활성 + 알림 연동 + Error Budget 데이터 소스 확인

## :construction: Dependencies & Blockers
- **Depends on**: NF-OBS-001 (Sentry — 알림 채널)
- **Blocks**: NF-OBS-005 (Error Budget — 다운타임 입력)
- **Related**: REQ-NF-007
