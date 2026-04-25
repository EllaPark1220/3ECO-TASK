# [NF] NF-RISK-002: R5 교사 모드 실사용 모니터링 — 인디스쿨 파일럿 교사 모집 및 will_reuse 지표 추적

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-RISK-002: 운영 리스크 — R5 교사 모드 채택 거부 완화를 위한 파일럿 프로그램 및 will_reuse 모니터링"
labels: 'nf, risk, user-research, pilot, priority:high, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-RISK-002] 교사 파일럿 프로그램 운영 및 실사용 만족도 추적
- **목적**: §6.6 R5 (공교육 교사의 채택 거부 리스크) 완화. 학생(Learner) 사용자는 교사(Teacher)를 통해 유입되므로, 교사의 만족도가 서비스 생존의 핵심. 초등교사 커뮤니티(인디스쿨 등)에서 5명 내외의 초기 파일럿 교사를 모집하여, 교사 모니터링 대시보드의 사용성과 학생 피드백 기능의 유용성을 검증하고 `will_reuse`(재사용 의향) KPI를 정밀 추적합니다.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#6.6` — R5 (교사 모드 채택 거부)
- 선행: FR-TF-001 (교사 피드백 대시보드), FR-KPI-009 (교사 전환율 및 재사용률)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **파일럿 모집 안내문 및 설문 폼 제작**:
  - 인디스쿨 등 교사 커뮤니티에 게시할 안내문 작성 (`docs/ops/pilot-recruitment-post.md`).
  - Google Forms 또는 Typeform을 이용한 신청서 제작 (담당 학년, 경제 교육 경험, 디지털 도구 활용도 파악).
- [ ] **파일럿 운영 가이드라인 구축**:
  - 선정된 5명의 교사에게 제공할 '서비스 활용 가이드(Onboarding PDF/Video)' 제작.
  - 학급 내 적용 기간 설정 (예: 2주간 3개 레슨 수행).
- [ ] **`will_reuse` 심층 추적 체계**:
  - 파일럿 종료 시점 전용 설문조사 발송. 핵심 질문: "다음 학기나 다른 단원에서도 이 서비스를 재사용할 의향이 있습니까? (1~5점)" 및 "어떤 기능이 재사용을 주저하게 만듭니까?".
  - KPI 추적을 위해 `SurveyResponse` 모델을 확장하여 파일럿 교사의 응답을 특별 태그(`isPilot: true`)로 분리하여 분석.
- [ ] **정성적 인터뷰 (Qualitative Interview) 진행 SOP**:
  - 정량적 데이터(설문, 대시보드 체류시간) 외에, Zoom 등을 통한 15분 심층 인터뷰 진행 프로세스.
  - 인터뷰 스크립트 작성 (학급 내 예상치 못한 문제, 학생 반응, UI 불편 사항 포커스).

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 파일럿 교사 계정 구별 (Analytics)
- **Given**: 파일럿에 참여하는 교사 계정 5개
- **When**: 이들이 플랫폼에 로그인하여 교사 대시보드를 사용할 때
- **Then**: DB 내부적으로 그룹(예: `metadata: { isPilot: true }`)이 지정되어, 일반 사용자와 분리된 형태의 정밀한 행동 로그(EventLog) 필터링이 가능함

### Scenario 2: 모집 공고문 완성도
- **Given**: 교사 커뮤니티 업로드 전 상태
- **When**: 모집 공고 문서 검토
- **Then**: 공교육 환경에 맞는 어조, 프로젝트의 무료/비영리 취지(CC BY-NC-SA), 그리고 파일럿 참여자에게 요구되는 사항과 기대 효과가 명확히 적시되어 있음

### Scenario 3: 온보딩 가이드 접근성
- **Given**: 신규 유입된 파일럿 교사
- **When**: 플랫폼 교사 모드 진입
- **Then**: 교사 전용 온보딩 가이드라인 문서나 튜토리얼 링크가 직관적으로 제공되어, 학생 초대 방법과 대시보드 확인 방법을 즉시 알 수 있음

### Scenario 4: will_reuse KPI 추출 가능성
- **Given**: 파일럿 프로그램 종료 후 수집된 설문 응답 데이터
- **When**: KPI 대시보드 (FR-KPI-009) 조회
- **Then**: 파일럿 그룹의 `will_reuse`(재사용 의향 4점 이상 비율)이 즉시 계산되어 수치화됨

### Scenario 5: 부정적 피드백 대응 에스컬레이션
- **Given**: `will_reuse` 점수가 2점 이하인 교사의 피드백 수집
- **When**: 서술형 피드백 원인 분석
- **Then**: "교사 대시보드 로딩이 느리다" 또는 "학생 가입 절차가 복잡하다" 등 핵심 블로커가 파악되고, 이를 해결하기 위한 즉각적인 핫픽스 Issue가 생성됨

### Scenario 6: 대시보드 체류시간 모니터링
- **Given**: 파일럿 교사의 이벤트 로그
- **When**: `teacher.dashboard_viewed` 이벤트의 duration 필드 분석
- **Then**: 교사가 학생들의 진행률을 확인하기 위해 머무는 평균 시간을 도출하여, 대시보드가 실제로 유용한 정보(Insight)를 주는지 정량 파악함

### Scenario 7: 정성적 인터뷰 스크립트 확보
- **Given**: 파일럿 종료 시점 줌 인터뷰
- **When**: 인터뷰 스크립트(`docs/ops/teacher-interview-script.md`) 열람
- **Then**: 유도 심문이 아닌 개방형 질문("학생들이 이 서비스를 사용할 때 가장 어려워했던 점은 무엇인가요?") 중심으로 10문항 이상이 잘 구성되어 있음

### Scenario 8: 학생-교사 매핑(초대) 오류 감지
- **Given**: 파일럿 학급의 학생들 가입 기간
- **When**: 교사 대시보드 통계 모니터링
- **Then**: 학생들이 가입 후 교사의 클래스룸(혹은 초대 코드)에 정상 편입되지 못하는 낙오 비율(Drop-off)을 집중 추적하여 회원가입 UX를 개선함

### Scenario 9: 피드백 루프 완료
- **Given**: 파일럿 1기 종료 및 인터뷰 완료
- **When**: 시스템 개선 작업 후
- **Then**: 참여했던 파일럿 교사들에게 "선생님의 의견이 이렇게 반영되었습니다"라는 요약 리포트를 이메일로 발송하여 팬덤(옹호자)을 형성함

### Scenario 10: 익명성 및 데이터 보호 보장
- **Given**: 교사 대상 인터뷰 내용 및 설문 결과 저장
- **When**: 분석 자료화
- **Then**: 특정 교사의 신상 정보나 학교명은 가명처리(NF-SEC-002 적용)되어 팀 내부 공유 시 PII(개인식별정보) 노출을 차단함

## :gear: Technical & Non-Functional Constraints
- **프라이버시**: 인터뷰 녹화나 기록 시 반드시 교사의 사전 동의를 구해야 하며, 내부 개발 참고용으로만 사용함을 확약.
- **개발 오버헤드 최소화**: 파일럿 관리를 위한 별도의 복잡한 어드민 기능을 당장 개발하지 않고, Prisma Studio나 Redash 등 기존 DB 툴을 활용해 로우 데이터(Raw Data)를 직접 쿼리하여 분석.

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오를 바탕으로 한 파일럿 운영 SOP 문서화
- [ ] 교사 커뮤니티용 모집 공고문 및 설문 폼 초안 작성
- [ ] 파일럿 교사 그룹 식별을 위한 DB 모델(User 메타데이터 필드) 셋업
- [ ] 인터뷰 스크립트 마크다운 커밋 완료
- [ ] PR 본문에 "R5 교사 모드 수용 리스크 완화 파일럿" 명시

## :construction: Dependencies & Blockers
- **Depends on**: FR-TF-001 (교사 피드백 대시보드 기본 기능 완성 필수)
- **Blocks**: Public Pilot (대규모 마케팅 전, 이 파일럿 검증이 필수 Exit Gate임)
