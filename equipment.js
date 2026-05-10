  const EQUIPMENT_LIST = [
    { no:1,  name:'체스트 프레스',             muscles:'가슴',                          effect:'자세교정(상체), 어깨·목 부담 감소',          brand:'DRAX',        emoji:'🏋️', key:'chest_press' },
    { no:2,  name:'펙덱 & 리어 델토이드',       muscles:'가슴·어깨 후면',                 effect:'가슴 안쪽 근육 강화, 어깨 후면 강화',        brand:'DRAX',        emoji:'🤸', key:'dual_pec_rear' },
    { no:3,  name:'랫풀 다운',                 muscles:'등',                            effect:'허리통증 개선, 굽은 자세 개선',              brand:'DRAX',        emoji:'💪', key:'lat_pull' },
    { no:4,  name:'롱풀',                      muscles:'등',                            effect:'굽은 자세 펴는데 도움',                      brand:'DRAX',        emoji:'💪', key:'long_pull' },
    { no:5,  name:'크런치 밴치',               muscles:'복부',                          effect:'배 근육 강화, 몸 중심 잡아줌',               brand:'DRAX',        emoji:'🔥', key:'crunch' },
    { no:6,  name:'로만체어',                  muscles:'허리·등',                       effect:'허리와 등 강화, 허리통증 개선',              brand:'DRAX',        emoji:'🦾', key:'roman_chair' },
    { no:7,  name:'시티드 레그 프레스',        muscles:'허벅지·엉덩이·종아리',          effect:'다리 힘 골고루, 걷기·계단 쉬워짐',          brand:'DRAX',        emoji:'🦵', key:'leg_press_seated' },
    { no:8,  name:'레그 익스텐션',             muscles:'앞쪽 허벅지',                   effect:'허벅지 앞 근육강화, 무릎 안정화',            brand:'DRAX',        emoji:'🦵', key:'leg_extension' },
    { no:9,  name:'시티드 레그 컬',            muscles:'뒷쪽 허벅지',                   effect:'허벅지 뒤 근육강화, 하체 균형 안정화',       brand:'DRAX',        emoji:'🦵', key:'leg_curl' },
    { no:10, name:'숄더 프레스',               muscles:'어깨',                          effect:'어깨 힘 강화, 팔 들기 쉬워짐',              brand:'DRAX',        emoji:'💪', key:'shoulder_press' },
    { no:11, name:'암 컬',                     muscles:'이두',                          effect:'팔 힘 증가, 팔 라인 정리',                  brand:'DRAX',        emoji:'💪', key:'arm_curl' },
    { no:12, name:'핵 프레스',                 muscles:'허벅지·엉덩이·종아리',          effect:'엉덩이 강화, 기초대사량 상승',               brand:'무브먼트',    emoji:'🦵', key:'hack_press' },
    { no:13, name:'링크 아웃타이',             muscles:'엉덩이·햄스트링',               effect:'힙업, 골반 안정성 향상',                    brand:'렉스코',      emoji:'🍑', key:'link_out' },
    { no:14, name:'글루트',                    muscles:'엉덩이·햄스트링',               effect:'엉덩이 탄탄·볼륨, 허리 통증 예방',          brand:'리얼리더',    emoji:'🍑', key:'glute' },
    { no:15, name:'힙 쓰러스트',               muscles:'엉덩이·햄스트링',               effect:'힙업, 자세 개선, 허리 통증 예방',           brand:'아임핏',      emoji:'🍑', key:'hip_thrust' },
    { no:16, name:'듀얼 이너&아웃타이',        muscles:'엉덩이·허벅지 안쪽',           effect:'힙업, 엉덩이·다리 라인 개선',               brand:'DRAX',        emoji:'🦵', key:'dual_inner_out' },
    { no:17, name:'ISO 레터럴 로우로우',       muscles:'중·하부 승모근·등',             effect:'등 하부 강화, 어깨 통증·거북목 예방',       brand:'해머스트랭스',emoji:'💪', key:'iso_low_row' },
    { no:18, name:'프론트 랫풀 다운',          muscles:'등',                            effect:'등 넓고 탄탄, 어깨 말림·거북목 개선',       brand:'워런핏',      emoji:'💪', key:'front_lat_pull' },
    { no:19, name:'ISO 레터럴 하이로우',       muscles:'승모근·능형근·후면 삼각근',     effect:'굽은어깨·라운드 숄더 교정, 척추 강화',      brand:'해머스트랭스',emoji:'💪', key:'iso_high_low' },
    { no:20, name:'ISO 레터럴 로우',           muscles:'등·능형근·후삼각근',            effect:'어깨 말림 방지, 자세 개선',                 brand:'해머스트랭스',emoji:'💪', key:'iso_lateral_row' },
    { no:21, name:'스탠딩 어시스트 친업',      muscles:'중·하부 승모근·등·이두근',      effect:'팔 힘 증가, 등과 어깨 균형 발달',           brand:'무브먼트',    emoji:'🏋️', key:'chinup_assist' },
    { no:22, name:'플레이트 숄더 프레스',      muscles:'어깨',                          effect:'어깨 말림 방지, 상체 균형 발달',            brand:'플라이트',    emoji:'💪', key:'plate_shoulder' },
    { no:23, name:'ISO 레터럴 숄더 프레스',    muscles:'어깨',                          effect:'어깨 말림 방지, 상체 균형 발달',            brand:'해머스트랭스',emoji:'💪', key:'iso_shoulder' },
    { no:24, name:'티바로우',                  muscles:'등',                            effect:'바른자세, 굽은 등·어깨 교정',               brand:'이카리안',    emoji:'💪', key:'tbar_row' },
    { no:25, name:'풀 오버',                   muscles:'등·가슴·삼두·코어',             effect:'등 아래쪽 자극, 굽은 어깨 개선',            brand:'해머스트랭스',emoji:'🤸', key:'pullover' },
    { no:26, name:'ISO 와이드 체스트 프레스', muscles:'가슴',                   effect:'넓은 가슴 볼륨, 쇄골 라인',                brand:'해머스트랭스',emoji:'🏋️', key:'iso_wide_chest' },
    { no:27, name:'ISO 레터럴 인클라인 프레스',muscles:'윗가슴·앞쪽 어깨·삼두근',      effect:'상체 체형 개선, 어깨 말림 방지',            brand:'해머스트랭스',emoji:'🏋️', key:'iso_incline' },
    { no:28, name:'리니어 레그 프레스',        muscles:'허벅지·엉덩이·종아리',          effect:'하체 근육 향상, 대사량 향상',               brand:'해머스트랭스',emoji:'🦵', key:'linear_leg_press' },
    { no:29, name:'브이스쿼트',                muscles:'하체·엉덩이',                   effect:'하체 근력 강화, 힙업',                      brand:'워런핏',      emoji:'🦵', key:'v_squat' },
    { no:30, name:'시티드 카프레이즈',         muscles:'종아리',                        effect:'하체 안정성, 균형 능력, 넘어짐 예방',       brand:'이카리안',    emoji:'🦵', key:'calf_raise' },
    { no:31, name:'스미스 머신',               muscles:'운동방법에 따라 다름',          effect:'다양한 운동 가능',                          brand:'DRAX',        emoji:'🏋️', key:'smith_machine' },
    { no:32, name:'듀얼 케이블 머신',          muscles:'운동방법에 따라 다름',          effect:'다양한 운동 가능',                          brand:'DRAX',        emoji:'🏋️', key:'cable_machine' },
  ];

  // 근육 부위별 색상

  const MUSCLE_COLOR = {
    '가슴':'#ef4444','등':'#3b82f6','어깨':'#8b5cf6','허벅지':'#f59e0b',
    '엉덩이':'#ec4899','복부':'#10b981','종아리':'#06b6d4','이두':'#f97316',
    '허리':'#6366f1','하체':'#f59e0b','코어':'#10b981',
  };
  function getMuscleColor(muscles) {
    for (const [k,v] of Object.entries(MUSCLE_COLOR)) {
      if (muscles.includes(k)) return v;
    }
    return '#1a6fd4';
  }

  // ══════════════════════════════
  // 운동기록 달력 변수는 workout.js에서 선언
  // ══════════════════════════════


  const FW_EXERCISE_LIST = [
    // 바벨 운동
    { name: '바벨 벤치프레스',           category: '바벨', muscles: '가슴·어깨·삼두' },
    { name: '바벨 백스쿼트',             category: '바벨', muscles: '하체·엉덩이' },
    { name: '바벨 프론트스쿼트',         category: '바벨', muscles: '하체·엉덩이' },
    { name: '바벨 벤트오버 로우',        category: '바벨', muscles: '등·이두' },
    { name: '바벨 오버헤드프레스',       category: '바벨', muscles: '어깨·삼두' },
    { name: '바벨 런지',                 category: '바벨', muscles: '하체·엉덩이' },
    { name: '바벨 컬',                   category: '바벨', muscles: '이두' },
    { name: '루마니안 데드리프트',       category: '바벨', muscles: '햄스트링·엉덩이·허리' },
    { name: '컨벤셔널 데드리프트',       category: '바벨', muscles: '등·하체·엉덩이' },
    { name: '스모 데드리프트',           category: '바벨', muscles: '하체·엉덩이·등' },
    { name: '라잉 트라이셉스 익스텐션', category: '바벨', muscles: '삼두' },
    { name: '스플릿 스쿼트',             category: '바벨', muscles: '하체·엉덩이' },
    { name: '바벨 힙 쓰러스트',          category: '바벨', muscles: '엉덩이·햄스트링' },
    { name: '바벨 굿모닝',               category: '바벨', muscles: '햄스트링·허리·엉덩이' },
    { name: '바벨 업라이트 로우',        category: '바벨', muscles: '어깨·승모근' },
    { name: '클로즈그립 벤치프레스',     category: '바벨', muscles: '삼두·가슴' },
    { name: '바벨 쉬러그',               category: '바벨', muscles: '승모근' },
    // 덤벨 운동
    { name: '덤벨 벤치프레스',           category: '덤벨', muscles: '가슴·어깨·삼두' },
    { name: '덤벨 플라이',               category: '덤벨', muscles: '가슴' },
    { name: '덤벨 숄더프레스',           category: '덤벨', muscles: '어깨·삼두' },
    { name: '덤벨 레터럴 레이즈',        category: '덤벨', muscles: '어깨' },
    { name: '덤벨 프론트 레이즈',        category: '덤벨', muscles: '어깨 전면' },
    { name: '덤벨 벤트오버 로우',        category: '덤벨', muscles: '등·이두' },
    { name: '덤벨 컬',                   category: '덤벨', muscles: '이두' },
    { name: '해머 컬',                   category: '덤벨', muscles: '이두·전완' },
    { name: '덤벨 트라이셉스 익스텐션', category: '덤벨', muscles: '삼두' },
    { name: '덤벨 런지',                 category: '덤벨', muscles: '하체·엉덩이' },
    { name: '덤벨 스쿼트',               category: '덤벨', muscles: '하체·엉덩이' },
    { name: '덤벨 데드리프트',           category: '덤벨', muscles: '등·하체·엉덩이' },
    { name: '벤트오버 레터럴 레이즈',    category: '덤벨', muscles: '어깨 후면·등' },
    { name: '덤벨 스텝업',               category: '덤벨', muscles: '하체·엉덩이' },
    { name: '덤벨 킥백',                 category: '덤벨', muscles: '삼두' },
    { name: '덤벨 풀오버',               category: '덤벨', muscles: '등·가슴' },
    { name: '덤벨 힙 쓰러스트',          category: '덤벨', muscles: '엉덩이·햄스트링' },
    { name: '덤벨 리버스 플라이',        category: '덤벨', muscles: '어깨 후면·등' },
    { name: '덤벨 사이드런지',           category: '덤벨', muscles: '하체·엉덩이' },
    { name: '덤벨 스플릿 스쿼트',        category: '덤벨', muscles: '하체·엉덩이' },
    // 맨몸 운동
    { name: '푸시업',                    category: '맨몸', muscles: '가슴·어깨·삼두' },
    { name: '풀업',                      category: '맨몸', muscles: '등·이두' },
    { name: '친업',                      category: '맨몸', muscles: '등·이두' },
    { name: '딥스',                      category: '맨몸', muscles: '삼두·가슴·어깨' },
    { name: '스쿼트',                    category: '맨몸', muscles: '하체·엉덩이' },
    { name: '런지',                      category: '맨몸', muscles: '하체·엉덩이' },
    { name: '플랭크',                    category: '맨몸', muscles: '코어·복부' },
    { name: '버피',                      category: '맨몸', muscles: '전신' },
    { name: '크런치',                    category: '맨몸', muscles: '복부' },
    { name: '레그 레이즈',               category: '맨몸', muscles: '복부·하복부' },
    { name: '마운틴 클라이머',           category: '맨몸', muscles: '코어·복부' },
    { name: '데드버그',                  category: '맨몸', muscles: '코어·복부' },
    { name: '버드독',                    category: '맨몸', muscles: '코어·허리' },
    { name: '스플릿 스쿼트',             category: '맨몸', muscles: '하체·엉덩이' },
    { name: '힙 쓰러스트',               category: '맨몸', muscles: '엉덩이·햄스트링' },
    { name: '사이드 플랭크',             category: '맨몸', muscles: '코어·복사근' },
    { name: '불가리안 스쿼트',           category: '맨몸', muscles: '하체·엉덩이' },
    { name: '리버스 런지',               category: '맨몸', muscles: '하체·엉덩이' },
    { name: '와이드 스쿼트',             category: '맨몸', muscles: '하체·엉덩이·내전근' },
    { name: '힙 브릿지',                 category: '맨몸', muscles: '엉덩이·햄스트링' },
  ];
