# [NF] NF-RISK-004: R7 재정 지속성 — 후원 채널 + 자체 자본 2~3년 트랙 운영 계획

```yaml
---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[NF] NF-RISK-004: R7 재정 지속성 — 운영 비용 2~3년 자본 트랙 구축 및 후원 시스템 통합"
labels: 'nf, risk, finance, sustainability, priority:medium, mvp-defer, public-pilot'
assignees: ''
---
```

## :dart: Summary
- **기능명**: [NF-RISK-004] R7 재정 지속성 리스크 완화 정책 및 시스템 구현
- **목적**: §6.6 R7 완화. 본 서비스는 CC BY-NC-SA(비상업적) 모델을 채택하고 있어 앱 내 광고나 유료 구독으로 직접 수익을 창출할 수 없습니다. 따라서 초기 인프라 유지비용(최대 월 40만원 내외)을 커버할 수 있는 '자체 자본 트랙(2~3년 런웨이)' 설계 문서화와, 사용자 자발적인 '후원 채널(Buy Me a Coffee 등)'을 웹 서비스에 UI로 연동하여 재정 지속 가능성을 시스템 레벨에서 뒷받침합니다.

## :link: References (Spec & Context)
- SRS: `/docs/SRS_V0_9.md#6.6` — R7 (재정 지속성)
- 관련: NF-COST-001 (인프라 비용 모니터링), CON-07 (비용 한도)

## :white_check_mark: Task Breakdown (실행 계획)
- [ ] **운영 재무 모델링 문서 작성 (`docs/ops/financial-sustainability.md`)**:
  - 인프라 티어별 비용을 구체적으로 추계하여 마크다운 테이블 작성.
  | 항목 | Vercel Hobby (현재) | Vercel Pro (미래 확장) |
  |---|---|---|
  | 컴퓨팅/호스팅 | ₩0 | $20/월 (약 2.7만) |
  | Supabase DB | ₩0 | $25/월 (약 3.4만) |
  | 오류 관제(Sentry) | ₩0 | $26/월 (약 3.5만) |
  | 개발 도구 | ₩30,000 이하 | ₩300,000 이하 |
  | 콘텐츠 외주 | ₩0 ~ 200,000 | ₩0 ~ 200,000 |
  | **월 추정 한도** | **약 230,000원** | **약 596,000원** |
  - 위 계산을 바탕으로, 초기 런웨이(Runway) 24개월에 필요한 "약 552만 원"의 예산 확보안과 소진 스케줄 기재.
- [ ] **글로벌 후원 링크 배너/컴포넌트 개발**:
  - `components/layout/SupportBanner.tsx` 컴포넌트 개발.
  - "이 프로젝트는 무료 및 비영리로 운영됩니다. 서버 유지비를 후원해 주세요 ☕" 문구.
  - 플랫폼 결제가 아닌, 토스 익명 송금 링크, Buy Me a Coffee 링크, 혹은 카카오페이 QR 등으로 연결.
  - 페이지 하단(Footer) 및 스탬프 맵 달성 팝업(스탬프 10개 도달 시 넛지) 위치에 배치.
- [ ] **분기 재정 리뷰 시스템(SOP) 수립**:
  - 분기(3개월) 단위로 런웨이(남은 예산 / 월 소진율)를 계산하여 `docs/ops/quarterly-finance-YYYY-QN.md` 문서를 작성하는 프로세스 수립.
- [ ] **비상 조치 시나리오(Emergency Plan) 명문화**:
  - 런웨이가 6개월 미만으로 떨어질 경우의 조치(개발 도구 구독 해지, 신규 콘텐츠 외주 즉시 중단, Vercel/Supabase 최적화 다운그레이드) 정책.

## :test_tube: Acceptance Criteria (BDD/GWT)

### Scenario 1: 재정 모델링 문서 완전성 검증
- **Given**: 레포지토리 저장소
- **When**: `docs/ops/financial-sustainability.md` 열람
- **Then**: Free 모드와 Pro 모드 시나리오에 대한 런웨이 기간 계산표가 작성되어 있어야 함

### Scenario 2: Footer 후원 컴포넌트 노출
- **Given**: 일반 사용자 (Learner)로 로그인된 브라우저
- **When**: 메인 페이지 하단으로 스크롤
- **Then**: 명확한 후원 호소 문구와 함께 외부 후원 플랫폼(Buy Me a Coffee 등)으로 이어지는 링크 또는 버튼이 노출됨

### Scenario 3: 긍정적 넛지(스탬프 도달 시점) 노출
- **Given**: 사용자 스탬프 개수가 10개에 도달함
- **When**: 10개 달성 축하 팝업/모달이 렌더링될 때
- **Then**: 만족도가 가장 높은 순간에 맞추어, 후원 링크 컴포넌트가 과도하지 않은 텍스트 형태로 함께 렌더링됨

### Scenario 4: 외부 후원 링크 전환 정상
- **Given**: 후원 링크 클릭
- **When**: 사용자가 버튼 상호작용
- **Then**: 새 창(`target="_blank"`, `rel="noopener noreferrer"`)으로 안전하게 서드파티 후원 사이트가 열림

### Scenario 5: 비상업적 성격(CC BY-NC-SA) 위반 방지 체크
- **Given**: 후원 페이지 기획
- **When**: 후원자에 대한 리워드 설계 검토
- **Then**: 후원금은 "콘텐츠 열람 권한 판매(Paywall)"나 "유료 기능 언락" 방식이 아님을 문서로 증명하여 라이선스 법적 충돌을 차단함

### Scenario 6: 분기 리뷰 가이드 문서화
- **Given**: 인수인계 또는 운영 가이드 문서
- **When**: 분기 재정 리뷰 프로세스 확인
- **Then**: Vercel/Supabase 청구서 확인 -> 지출 계산 -> 런웨이 계산 -> 후원금 수입 차감 의 단계별 SOP가 명시됨

### Scenario 7: 비상 조치 발동 조건 명시
- **Given**: 분기 리뷰 결과 잔여 예산이 6개월치 미만임
- **When**: 비상 조치(Emergency Plan) 프로토콜 참조
- **Then**: 유료 SaaS 해지 순서(1순위: 코딩 도구 등 내부망, 2순위: 외주비)가 구체적으로 적시되어 있음

### Scenario 8: 광고 스크립트 배제 보장
- **Given**: 재무 압박이 발생한 상황 가정
- **When**: Google AdSense 등 광고 삽입 요청이 발생
- **Then**: 문서화된 운영 정책에 의해, 광고 노출은 교육 콘텐츠의 집중도를 해치므로 원천 금지(`NF-SEC-003`의 CDN 차단 정책과 연계)함을 명시함

### Scenario 9: 컴포넌트 반응형 대응
- **Given**: 후원 배너 컴포넌트
- **When**: 모바일 기기(너비 360px)에서 렌더링
- **Then**: 가로 스크롤이나 레이아웃 깨짐 없이 텍스트 크기와 버튼이 모바일 뷰에 맞게 축소 및 정렬됨

### Scenario 10: 후원 링크 접근성 (a11y)
- **Given**: 시각 장애인용 스크린 리더
- **When**: 후원 링크 포커싱
- **Then**: "외부 사이트로 이동하여 프로젝트를 후원합니다" 와 같은 구체적인 `aria-label`이 읽힘

## :gear: Technical & Non-Functional Constraints
- **UI/UX 균형**: 후원 배너는 학습 경험을 절대 방해(팝업 형태의 인터럽트)하지 않고, 사용자가 원할 때만 클릭할 수 있는 수동적 형태(Footer) 또는 긍정적 모멘텀(축하 팝업 하단)에만 배치.
- **법적 제약**: 개인 후원은 기부금 영수증 발급 대상이 아니므로, "기부"라는 단어 대신 "후원" 또는 "서버 유지비 지원" 워딩 사용 필수.

## :checkered_flag: Definition of Done (DoD)
- [ ] 10개 GWT 시나리오 통과 및 기획 리뷰 완료
- [ ] 재정 정책 및 런웨이 계산 MD 문서 커밋 완료
- [ ] `<SupportBanner />` React 컴포넌트 구현 및 Footer 통합
- [ ] 스크린 리더용 aria 텍스트 작성 완료
- [ ] PR 본문에 "R7 재정 지속성 확보 및 후원 UI 추가" 명시

## :construction: Dependencies & Blockers
- **Depends on**: NF-COST-001 (기본 인프라 비용 한도 정책)
- **Blocks**: Public Pilot (Stage 2) 오픈 전 장기 운영 안정성 확보
