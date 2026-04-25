# [NF] NF-RISK-001: R3 단일 제작자 페이스 완화를 위한 외주 편집 SOP 및 콘텐츠 템플릿 표준화

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-RISK-001: 운영 리스크 — R3 단일 제작자 병목 완화를 위한 외주 편집자 SOP 및 콘텐츠 제작 템플릿 표준화"
labels: 'nf, risk, sop, content-operations, priority:high, mvp-defer, alpha'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-RISK-001] 단일 제작자 페이스 완화 정책 (외주 편집 파트너 SOP + 콘텐츠 템플릿)
- **목적**: §6.6 R3 (단일 제작자 병목) 리스크 완화. 시스템 개발과 콘텐츠 제작을 1인이 모두 수행하는 CON-08 환경에서, 콘텐츠(비디오, 자막, 대본, 썸네일) 제작 속도 저하를 막기 위해 일관된 템플릿을 정의하고, 단순 반복 작업(영상 편집, 자막 싱크 등)을 외부 프리랜서나 파트너에게 손쉽게 위임할 수 있는 표준 작업 절차(SOP)를 수립합니다.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#6.6` — R3 (단일 제작자 페이스)
- 관련: CON-08 (1인 개발/운영 팀 제약), FR-LES-002 (레슨 뷰어)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **에셋 표준 템플릿 제작 및 배포**:
  - **비디오**: 1080p 해상도, 16:9 비율, 프레임 레이트 30fps. 인트로/아웃트로 템플릿(Premiere Pro/After Effects) 사전 제작.
  - **자막**: VTT(Web Video Text Tracks) 포맷. 줄바꿈 기준(최대 20자 내외), 폰트 가독성.
  - **썸네일**: Figma 썸네일 컴포넌트 템플릿. (핵심 키워드 중앙 배치, 고대비 색상 적용).
  - **마크다운 대본**: `docs/content/lessons/LXXX_Script.md` 양식 (설명 텍스트, OX 퀴즈용 질문/정답 분리).
- [ ] **외주 편집자(Freelancer) 온보딩 SOP 문서화 (`docs/ops/freelancer-sop.md`)**:
  - 원본 리소스 전달 방식 (Google Drive 공유 폴더 체계).
  - 결과물 납품 규격 및 파일명 컨벤션 (예: `L001_Economics_1080p.mp4`).
  - 자막 작업 룰: 청각 장애인을 고려한 화면 해설(소리 묘사) 삽입 여부.
- [ ] **콘텐츠 검수(QA) 체크리스트 작성**:
  - 오디오 싱크 확인, BGM 저작권(CC0 등 무료 음원 여부) 점검.
  - VTT 자막의 화면 가림 여부 및 오탈자 확인.
  - 모바일 기기에서의 썸네일 가독성 시뮬레이션.
- [ ] **협업 및 정산 프로세스**:
  - Trello 또는 Notion Kanban 보드를 활용한 작업 상태(To Do -> In Progress -> Review -> Done) 트래킹.
  - CC BY-NC-SA 적용 서비스임을 고지하고, 외주 작업물의 저작권 귀속(Work for Hire) 조항 계약 명시.

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 표준 파일명 컨벤션 준수 검증
- **Given**: 외주 편집자가 납품한 영상 파일
- **When**: 파일 수령 후 품질 검사
- **Then**: 파일명이 약속된 `L[ID]_[Topic]_[Resolution].mp4` 양식을 따르지 않으면 반려됨

### Scenario 2: 자막 파일(VTT) 포맷 정합성
- **Given**: 납품된 자막 파일
- **When**: 비디오 플레이어에 삽입하여 재생 테스트
- **Then**: 모든 타임스탬프가 정상 파싱되고, 한 화면에 자막이 2줄을 초과하지 않아 시야를 가리지 않음

### Scenario 3: Figma 썸네일 템플릿 활용
- **Given**: 새로운 레슨 콘텐츠 제작 시작
- **When**: 썸네일 제작
- **Then**: Figma 템플릿의 Text Layer만 교체하여 5분 이내에 일관성 있는 썸네일 추출이 가능함

### Scenario 4: 칸반 보드 작업 트래킹
- **Given**: 3개의 레슨(L002, L003, L004) 편집 외주 발주
- **When**: 외주 편집자가 L002 편집 완료
- **Then**: Notion 보드에서 L002가 'Review' 상태로 변경되고 검수자에게 알림이 전송됨

### Scenario 5: 저작권 프리 BGM 검증
- **Given**: 편집된 영상 본
- **When**: 최종 검수 진행
- **Then**: 영상에 사용된 모든 BGM 및 효과음이 출처가 명확한 저작권 프리(혹은 구매 완료) 에셋인지 체크리스트에서 확인됨

### Scenario 6: 마크다운 대본-OX퀴즈 일치성
- **Given**: 작성된 `L005_Script.md` 마크다운 대본
- **When**: 대본 내 [OX Quiz] 블록 파싱
- **Then**: DB에 저장될 OX 문제 데이터 구조(문제, 정답, 해설)와 정확히 1:1 맵핑되도록 마크다운 구조가 짜여짐

### Scenario 7: 모바일 썸네일 가독성
- **Given**: 제작된 썸네일 이미지
- **When**: 360px 너비의 모바일 화면 비율로 축소 시뮬레이션
- **Then**: 썸네일 내부의 핵심 텍스트가 깨지지 않고 명확하게 식별 가능함

### Scenario 8: 화면 해설(폐쇄 자막) 품질
- **Given**: 영상 내 중요한 시각적 정보나 소음 발생 시점
- **When**: 자막(CC) 검수
- **Then**: "*(박수 소리)*" 또는 "*(그래프가 상승함)*"과 같은 비문자적 정보가 자막에 올바르게 삽입되어 접근성(A11Y)을 높임

### Scenario 9: 1인 제작자 시간 절약 지표 확인
- **Given**: SOP 도입 전과 후의 레슨 1개당 투입 시간
- **When**: 개발자 본인의 시간 트래킹
- **Then**: 단순 편집 및 자막 작업이 외주화되어 1개 레슨당 본인 투입 시간이 4시간 미만으로 줄어듦

### Scenario 10: 보안 유지 및 에셋 접근 제어
- **Given**: 외부 편집자 구글 드라이브 접근
- **When**: 프로젝트 에셋 공유
- **Then**: 오직 '에셋 소스' 폴더와 '납품' 폴더만 접근 가능하며, 소스 코드나 사용자 데이터 등 민감한 영역은 권한이 분리됨

## :gear: Technical & Non-Functional Constraints
- **비용**: 외부 편집 비용은 `NF-RISK-004`(재정 지속성)에서 정의한 월별 여유 자금(버퍼) 한도 내에서만 집행.
- **저작권 라이선스**: 외주 결과물은 시스템의 CC BY-NC-SA 라이선스하에 배포되므로, 외주 계약 시 이 부분에 대한 저작물 이용 허락이 명시되어야 함.

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오를 충족하는 SOP 문서 작성 (`docs/ops/freelancer-sop.md`)
- [ ] Figma 썸네일 템플릿 완성 및 링크 첨부
- [ ] 비디오/자막 마크다운 템플릿 생성 완료
- [ ] Notion/Trello 외주 관리 보드 셋업
- [ ] PR 본문에 "R3 단일 제작자 병목 완화 SOP" 명시

## :construction: Dependencies & Blockers
- **Depends on**: 없음
- **Blocks**: 대량의 레슨(L002~L010) 양산 작업
