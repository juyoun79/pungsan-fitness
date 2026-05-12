  // ── 운동기록 달력 변수 ──
  let calYear = new Date().getFullYear();
  let calMonth = new Date().getMonth();
  let calSelectedDate = null;

  // ── 강사 모드 변수 ──
  let isTrainerMode = false;
  let trainerTargetId = null;
  let trainerTargetDate = null;

  function toFirebaseKey(name) {
    return Array.from(name).map(c => {
      if (/[a-zA-Z0-9]/.test(c)) return c;
      if (c === ' ' || c === '_') return '_';
      return 'u' + c.codePointAt(0).toString(16).padStart(4, '0');
    }).join('');
  }

  function fromFirebaseKey(key) {
    return key.replace(/u([0-9a-f]{4})/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    ).replace(/_/g, ' ');
  }

  function syncWorkoutsFromFirebase(callback) {
    const userId = localStorage.getItem('current_user');
    if (!userId || typeof db === 'undefined') { if (callback) callback(); return; }

    // fwIndex 먼저 Firebase에서 불러오기 + 이상한 데이터 자동 정리
    db.ref('users/' + userId + '/fwIndex').once('value', fwSnap => {
      const fbFwIndex = fwSnap.val();
      if (fbFwIndex && Array.isArray(fbFwIndex)) {
        const localFwIndex = JSON.parse(localStorage.getItem('freeweight_index_' + userId) || '[]');
        let needsUpdate = false;
        fbFwIndex.forEach(entry => {
          const isEncoded = /u[0-9a-f]{4}/i.test(entry);
          const name = isEncoded ? fromFirebaseKey(entry) : entry;
          if (isEncoded) needsUpdate = true;
          if (!localFwIndex.includes(name)) localFwIndex.push(name);
        });
        localStorage.setItem('freeweight_index_' + userId, JSON.stringify(localFwIndex));
        if (needsUpdate) db.ref('users/' + userId + '/fwIndex').set(localFwIndex);
      }

      // cardioIndex도 Firebase에서 불러오기
      db.ref('users/' + userId + '/cardioIndex').once('value', cardioSnap => {
        const fbCardioIndex = cardioSnap.val();
        if (fbCardioIndex && Array.isArray(fbCardioIndex)) {
          const localCardioIndex = JSON.parse(localStorage.getItem('cardio_index_' + userId) || '[]');
          fbCardioIndex.forEach(type => {
            if (!localCardioIndex.includes(type)) localCardioIndex.push(type);
          });
          localStorage.setItem('cardio_index_' + userId, JSON.stringify(localCardioIndex));
        }

        // 운동기록 동기화
        db.ref('users/' + userId + '/workouts').once('value', snap => {
          const data = snap.val();
          if (!data) { if (callback) callback(); return; }

          // Firebase에 있는 모든 localKey 수집
          const fbLocalKeys = new Set();

          Object.entries(data).forEach(([fbKey, dateMap]) => {
            if (!dateMap) return;
            let localKey = '';
            if (fbKey.startsWith('dual_front_')) {
              const eqKey = fbKey.replace('dual_front_', '');
              localKey = 'workout_dual_front_' + eqKey + '_' + userId;
            } else if (fbKey.startsWith('dual_back_')) {
              const eqKey = fbKey.replace('dual_back_', '');
              localKey = 'workout_dual_back_' + eqKey + '_' + userId;
            } else if (fbKey.startsWith('cardio_')) {
              const type = fbKey.replace('cardio_', '');
              localKey = 'cardio_' + type + '_' + userId;
              const cardioIndex = JSON.parse(localStorage.getItem('cardio_index_' + userId) || '[]');
              if (!cardioIndex.includes(type)) { cardioIndex.push(type); localStorage.setItem('cardio_index_' + userId, JSON.stringify(cardioIndex)); }
            } else if (fbKey.startsWith('fw_')) {
              const rawName = fbKey.replace('fw_', '');
              const name = rawName.replace(/_/g, ' ');
              localKey = 'freeweight_' + name.replace(/\s+/g, '_') + '_' + userId;
              const fwIndex = JSON.parse(localStorage.getItem('freeweight_index_' + userId) || '[]');
              if (!fwIndex.includes(name)) { fwIndex.push(name); localStorage.setItem('freeweight_index_' + userId, JSON.stringify(fwIndex)); }
            } else {
              localKey = 'workout_' + fbKey + '_' + userId;
            }

            // Firebase에 있는 날짜 목록
            const fbDates = new Set(Object.keys(dateMap));
            fbLocalKeys.add(localKey);

            const records = Object.values(dateMap).sort((a, b) => b.date > a.date ? 1 : -1);
            let existing = JSON.parse(localStorage.getItem(localKey) || '[]');

            // Firebase에 없는 날짜는 로컬에서 삭제
            existing = existing.filter(r => fbDates.has(r.date));

            records.forEach(fbRecord => {
              const idx = existing.findIndex(r => r.date === fbRecord.date);
              if (idx !== -1) existing[idx] = fbRecord; else existing.unshift(fbRecord);
            });
            existing.sort((a, b) => b.date > a.date ? 1 : -1);
            localStorage.setItem(localKey, JSON.stringify(existing));
          });

          if (callback) callback();
        });

        // 수업 기록 동기화
        db.ref('users/' + userId + '/classes').once('value', classSnap => {
          if (!classSnap.exists()) return;
          classSnap.forEach(typeSnap => {
            const typeKey = typeSnap.key;
            const typeName = typeKey.replace(/_/g, ' ');
            const localKey = 'class_' + typeKey + '_' + userId;
            const classIndex = JSON.parse(localStorage.getItem('class_index_' + userId) || '[]');
            if (!classIndex.includes(typeName)) { classIndex.push(typeName); localStorage.setItem('class_index_' + userId, JSON.stringify(classIndex)); }
            const fbDates = new Set(Object.keys(typeSnap.val() || {}));
            let existing = JSON.parse(localStorage.getItem(localKey) || '[]');
            existing = existing.filter(r => fbDates.has(r.date));
            Object.values(typeSnap.val() || {}).forEach(fbRecord => {
              const idx = existing.findIndex(r => r.date === fbRecord.date);
              if (idx !== -1) existing[idx] = fbRecord; else existing.unshift(fbRecord);
            });
            existing.sort((a, b) => b.date > a.date ? 1 : -1);
            localStorage.setItem(localKey, JSON.stringify(existing));
          });
        });
      });
    });
  }

  function openWorkoutQr() {
    calYear = new Date().getFullYear();
    calMonth = new Date().getMonth();
    calSelectedDate = null;
    showScreen('screen-workout-qr');
    clearEquipmentSearch();
    renderCalendar();
    document.getElementById('cal-day-detail').innerHTML = '';
    syncWorkoutsFromFirebase(() => {
      loadLessonDaysInMonth(calYear, calMonth, () => {
        renderCalendar();
      });
    });
  }

  function closeWorkoutQr() { stopWorkoutQrCamera(); switchTab('home'); }

  function changeCalMonth(dir) {
    calMonth += dir;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    if (calMonth < 0)  { calMonth = 11; calYear--; }
    calSelectedDate = null;
    loadLessonDaysInMonth(calYear, calMonth, () => {
      renderCalendar();
    });
    document.getElementById('cal-day-detail').innerHTML = '';
  }

  function getWorkoutDaysInMonth(year, month) {
    const userId = localStorage.getItem('current_user');
    const personalDays = new Set(); // 개인 기록
    const classDays = new Set();    // 수업 기록 (recordedBy: 'trainer')
    const prefix = year + '-' + (month + 1) + '-';

    function classify(records) {
      for (const r of records) {
        if (!r.date || !r.date.startsWith(prefix)) continue;
        const d = parseInt(r.date.split('-')[2]);
        if (isNaN(d)) continue;
        if (r.recordedBy === 'trainer') classDays.add(d);
        else personalDays.add(d);
      }
    }

    for (const eq of EQUIPMENT_LIST) {
      classify(JSON.parse(localStorage.getItem('workout_' + eq.key + '_' + userId) || '[]'));
      classify(JSON.parse(localStorage.getItem('workout_dual_front_' + eq.key + '_' + userId) || '[]'));
      classify(JSON.parse(localStorage.getItem('workout_dual_back_' + eq.key + '_' + userId) || '[]'));
    }
    const fwIndex = JSON.parse(localStorage.getItem('freeweight_index_' + userId) || '[]');
    for (const name of fwIndex) {
      classify(JSON.parse(localStorage.getItem('freeweight_' + name.replace(/\s+/g,'_') + '_' + userId) || '[]'));
    }
    const cardioIndex = JSON.parse(localStorage.getItem('cardio_index_' + userId) || '[]');
    for (const type of cardioIndex) {
      classify(JSON.parse(localStorage.getItem('cardio_' + type + '_' + userId) || '[]'));
    }
    const classIndex = JSON.parse(localStorage.getItem('class_index_' + userId) || '[]');
    for (const name of classIndex) {
      classify(JSON.parse(localStorage.getItem('class_' + name.replace(/\s+/g,'_') + '_' + userId) || '[]'));
    }
    return { personalDays, classDays };
  }

  // 수업일 Set 반환 (Firebase에서)
  let lessonDaysCache = new Set();
  function loadLessonDaysInMonth(year, month, callback) {
    const userId = localStorage.getItem('current_user');
    const prefix = year + '-' + (month + 1) + '-';
    db.ref('users/' + userId + '/lessons').once('value', snap => {
      lessonDaysCache = new Set();
      snap.forEach(child => {
        const date = child.key;
        if (date.startsWith(prefix)) {
          const d = parseInt(date.split('-')[2]);
          if (!isNaN(d)) lessonDaysCache.add(d);
        }
      });
      if (callback) callback();
    });
  }

  function renderCalendar() {
    const now = new Date();
    const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    document.getElementById('cal-title').textContent = calYear + '년 ' + monthNames[calMonth];
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const lastDate = new Date(calYear, calMonth + 1, 0).getDate();
    const { personalDays, classDays } = getWorkoutDaysInMonth(calYear, calMonth);
    const todayY = now.getFullYear(), todayM = now.getMonth(), todayD = now.getDate();
    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<div></div>';
    for (let d = 1; d <= lastDate; d++) {
      const isToday = (calYear===todayY && calMonth===todayM && d===todayD);
      const hasPersonal = personalDays.has(d);
      const hasClass = classDays.has(d);
      const hasWork = hasPersonal || hasClass;
      const isSel   = (calSelectedDate === d);
      const isSun   = (new Date(calYear, calMonth, d).getDay() === 0);
      const isSat   = (new Date(calYear, calMonth, d).getDay() === 6);
      let bg = 'transparent', textColor = isSun ? '#ef4444' : isSat ? '#1a6fd4' : 'var(--text)';
      let border = 'none', fontW = '500';
      const hasLesson = lessonDaysCache.has(d);
      if (isToday)  { bg = '#22c55e'; textColor = 'white'; fontW = '700'; }
      if (hasWork && !isToday) { bg = 'var(--blue)'; textColor = 'white'; fontW = '700'; }
      if (hasLesson) { bg = '#f59e0b'; textColor = 'white'; fontW = '700'; }
      if (isSel)    { border = '2px solid #1a1a2e'; }
      // 점 표시: 파란점(개인), 주황점(수업)
      const dotHtml = (hasWork && !isToday) ? `<div style="position:absolute;bottom:1px;left:50%;transform:translateX(-50%);display:flex;gap:2px;align-items:center;">
        ${hasPersonal ? '<div style="width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,0.9);"></div>' : ''}
        ${hasClass ? '<div style="width:4px;height:4px;border-radius:50%;background:#f59e0b;"></div>' : ''}
      </div>` : '';
      html += `<div onclick="selectCalDay(${d})" style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${bg};color:${textColor};font-size:13px;font-weight:${fontW};cursor:pointer;border:${border};transition:opacity 0.1s;position:relative;" ontouchstart="this.style.opacity='0.7'" ontouchend="this.style.opacity='1'">${d}${dotHtml}</div>`;
    }
    document.getElementById('cal-grid').innerHTML = html;
  }

  function selectCalDay(d) { calSelectedDate = d; renderCalendar(); renderDayDetail(d); }

  function renderDayDetail(d) {
    const userId = localStorage.getItem('current_user');
    const dateStr = calYear + '-' + (calMonth + 1) + '-' + d;
    const dateLabel = calYear + '년 ' + (calMonth + 1) + '월 ' + d + '일';
    const detail = document.getElementById('cal-day-detail');
    const dayRecords = [];
    for (const eq of EQUIPMENT_LIST) {
      if (isDualEquipment(eq.key)) {
        const dNames2 = getDualNames(eq.key) || { front: '전면', back: '후면' };
        const innerRecords = JSON.parse(localStorage.getItem('workout_dual_front_' + eq.key + '_' + userId) || '[]');
        const outerRecords = JSON.parse(localStorage.getItem('workout_dual_back_' + eq.key + '_' + userId) || '[]');
        const innerFound = innerRecords.find(r => r.date === dateStr);
        const outerFound = outerRecords.find(r => r.date === dateStr);
        if (innerFound) dayRecords.push({ type:'equipment', eq, record: innerFound, subName: dNames2.front });
        if (outerFound) dayRecords.push({ type:'equipment', eq, record: outerFound, subName: dNames2.back });
      } else {
        const key = 'workout_' + eq.key + '_' + userId;
        const records = JSON.parse(localStorage.getItem(key) || '[]');
        const found = records.find(r => r.date === dateStr);
        if (found) dayRecords.push({ type:'equipment', eq, record: found });
      }
    }
    const fwIndex = JSON.parse(localStorage.getItem('freeweight_index_' + userId) || '[]');
    for (const name of fwIndex) {
      const safeKey = 'freeweight_' + name.replace(/\s+/g,'_') + '_' + userId;
      const records = JSON.parse(localStorage.getItem(safeKey) || '[]');
      const found = records.find(r => r.date === dateStr);
      if (found) dayRecords.push({ type:'freeweight', name, record: found });
    }
    const cardioIndex = JSON.parse(localStorage.getItem('cardio_index_' + userId) || '[]');
    for (const ctype of cardioIndex) {
      const safeKey = 'cardio_' + ctype + '_' + userId;
      const records = JSON.parse(localStorage.getItem(safeKey) || '[]');
      const found = records.find(r => r.date === dateStr);
      if (found) dayRecords.push({ type:'cardio', name: ctype, record: found });
    }
    // 수업 기록 추가
    const classIndex = JSON.parse(localStorage.getItem('class_index_' + userId) || '[]');
    for (const ctype of classIndex) {
      const safeKey = 'class_' + ctype.replace(/\s+/g,'_') + '_' + userId;
      const records = JSON.parse(localStorage.getItem(safeKey) || '[]');
      const found = records.find(r => r.date === dateStr);
      if (found) dayRecords.push({ type:'class', name: ctype, record: found });
    }
    // savedAt 기준 오름차순 정렬 (일찍 한 운동이 위로)
    dayRecords.sort((a, b) => {
      const tA = (a.record.savedAt || '').replace('오전 ', '').replace('오후 ', '').trim();
      const tB = (b.record.savedAt || '').replace('오전 ', '').replace('오후 ', '').trim();
      return tA > tB ? 1 : tA < tB ? -1 : 0;
    });
    if (dayRecords.length === 0) {
      detail.innerHTML = `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:24px;text-align:center;"><div style="font-size:32px;margin-bottom:10px;">🏖️</div><div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px;">${dateLabel}</div><div style="font-size:13px;color:var(--text-hint);">이 날은 운동 기록이 없어요</div></div>`;
      return;
    }
    let totalVol = 0, totalSets = 0, totalCardioKcal = 0;
    for (const item of dayRecords) {
      if (item.type === 'cardio' || item.type === 'class') { totalCardioKcal += item.record.kcal || 0; continue; }
      if (item.record.sets) { totalSets += item.record.sets.length; totalVol += item.record.sets.reduce((s, r) => s + (r.weight * r.reps), 0); }
    }
    const cardsHtml = dayRecords.map(item => {
      const record = item.record;
      if (item.type === 'class') {
        const classEmoji = {'기구필라테스':'🏋️','에어로빅':'💃','방송댄스':'🕺','요가':'🧘','매트필라테스':'🤸','기능성운동':'💪'}[item.name] || '🧘';
        const isClassRecord = record.recordedBy === 'trainer';
        const classBadge = isClassRecord
          ? `<span style="font-size:10px;font-weight:700;color:white;background:#f59e0b;padding:2px 5px;border-radius:4px;">수업</span>`
          : `<span style="font-size:10px;font-weight:700;color:white;background:#1a6fd4;padding:2px 5px;border-radius:4px;">개인</span>`;
        return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:10px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div style="width:36px;height:36px;border-radius:10px;background:#e0f7fa;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${classEmoji}</div><div style="flex:1;"><div style="display:flex;align-items:center;gap:6px;">${classBadge}<span style="font-size:11px;font-weight:700;color:white;background:#0891b2;padding:2px 6px;border-radius:5px;white-space:nowrap;">GX수업</span><span style="font-size:14px;font-weight:700;color:var(--text);">${item.name}</span></div><div style="font-size:12px;color:var(--text-sub);margin-top:2px;">${record.min}분 · 약 ${record.kcal}kcal</div></div></div>${record.memo ? `<div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;gap:8px;"><span style="font-size:14px;">📝</span><div style="font-size:13px;color:var(--text-sub);line-height:1.6;">${record.memo}</div></div>` : ''}<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;"><span style="font-size:12px;color:var(--text-hint);">${formatTime(record.savedAt)}</span><button onclick="openEditClassModal('${item.name}','${dateStr}')" style="background:#e0f7fa;color:#0891b2;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">수정</button></div></div>`;
      }
      if (item.type === 'cardio') {
        const timeStr = (record.min||0) + '분';
        const cardioEmoji = {'런닝머신':'🏃','스텝밀':'🪜','사이클':'🚴','마이마운틴':'⛰️'}[item.name] || '🔥';
        const isStepmill = item.name === '스텝밀';
        const cardioIcon = isStepmill ? `<svg width="20" height="20" viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg"><rect x="20" y="195" width="160" height="25" rx="2" fill="#ef4444"/><rect x="60" y="160" width="120" height="25" rx="2" fill="#ef4444"/><rect x="100" y="125" width="80" height="25" rx="2" fill="#ef4444"/><rect x="140" y="90" width="40" height="25" rx="2" fill="#ef4444"/><rect x="20" y="170" width="40" height="22" fill="#ef4444" opacity="0.6"/><rect x="60" y="135" width="40" height="22" fill="#ef4444" opacity="0.6"/><rect x="100" y="100" width="40" height="22" fill="#ef4444" opacity="0.6"/><line x1="30" y1="190" x2="170" y2="88" stroke="#ef4444" stroke-width="6" stroke-linecap="round"/><line x1="30" y1="190" x2="30" y2="220" stroke="#ef4444" stroke-width="5" stroke-linecap="round"/><line x1="170" y1="88" x2="170" y2="115" stroke="#ef4444" stroke-width="5" stroke-linecap="round"/></svg>` : `<span style="font-size:18px;">${cardioEmoji}</span>`;
        return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:10px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div style="width:36px;height:36px;border-radius:10px;background:#ef444418;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${cardioIcon}</div><div style="flex:1;"><div style="display:flex;align-items:center;gap:6px;"><span style="font-size:11px;font-weight:700;color:white;background:#ef4444;padding:2px 6px;border-radius:5px;">유산소</span><span style="font-size:14px;font-weight:700;color:var(--text);">${item.name}</span></div><div style="font-size:12px;color:var(--text-sub);margin-top:2px;">${timeStr}</div></div></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;"><div style="background:#ef444412;border-radius:8px;padding:8px;text-align:center;"><div style="font-size:11px;color:#ef4444;margin-bottom:2px;font-weight:600;">시간</div><div style="font-size:13px;font-weight:700;color:var(--text);">${timeStr}</div></div><div style="background:#ef444412;border-radius:8px;padding:8px;text-align:center;"><div style="font-size:11px;color:#ef4444;margin-bottom:2px;font-weight:600;">거리</div><div style="font-size:13px;font-weight:700;color:var(--text);">${record.dist > 0 ? record.dist + (record.distUnit||'km') : '-'}</div></div><div style="background:#ef444412;border-radius:8px;padding:8px;text-align:center;"><div style="font-size:11px;color:#ef4444;margin-bottom:2px;font-weight:600;">칼로리</div><div style="font-size:13px;font-weight:700;color:var(--text);">${record.kcal > 0 ? '약 ' + record.kcal + 'kcal' : '-'}</div></div></div>${record.memo ? `<div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;gap:8px;"><span style="font-size:14px;">📝</span><div style="font-size:13px;color:var(--text-sub);line-height:1.6;">${record.memo}</div></div>` : ''}<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;"><span style="font-size:12px;color:var(--text-hint);">${formatTime(record.savedAt)}</span><button onclick="openEditCardioModal('${item.name}','${dateStr}')" style="background:#ef444418;color:#ef4444;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">수정</button></div></div>`;
      }
      const maxW = record.sets ? Math.max(...record.sets.map(s => s.weight), 0) : 0;
      if (item.type === 'equipment') {
        const { eq } = item;
        const color = getMuscleColor(eq.muscles);
        // ✅ 수정된 부분: eq.key 포함
        const editKey = isDualEquipment(eq.key)
          ? (item.subName === getDualNames(eq.key)?.front
              ? 'workout_dual_front_' + eq.key + '_'
              : 'workout_dual_back_' + eq.key + '_') + localStorage.getItem('current_user')
          : 'workout_' + eq.key + '_' + localStorage.getItem('current_user');
        const isClassRecord = record.recordedBy === 'trainer';
        const badgeHtml = isClassRecord
          ? `<span style="font-size:10px;font-weight:700;color:white;background:#f59e0b;padding:2px 5px;border-radius:4px;">수업</span>`
          : `<span style="font-size:10px;font-weight:700;color:white;background:#1a6fd4;padding:2px 5px;border-radius:4px;">개인</span>`;
        return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:10px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div style="width:36px;height:36px;border-radius:10px;background:${color}18;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${eq.emoji}</div><div style="flex:1;"><div style="display:flex;align-items:center;gap:6px;">${badgeHtml}<span style="font-size:11px;font-weight:700;color:white;background:${color};padding:2px 6px;border-radius:5px;white-space:nowrap;">${eq.no}번</span><span style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.subName ? item.subName : eq.name}</span></div><div style="font-size:12px;color:var(--text-sub);margin-top:2px;">${eq.muscles}${maxW > 0 ? ' · 최고 '+maxW+'kg' : ''}</div></div></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;">${record.sets.map(s=>`<div style="background:${color}12;border-radius:8px;padding:8px;text-align:center;"><div style="font-size:11px;color:${color};margin-bottom:2px;font-weight:600;">${s.set}세트</div><div style="font-size:13px;font-weight:700;color:var(--text);">${s.weight > 0 ? s.weight+'kg' : '-'}</div><div style="font-size:11px;color:var(--text-sub);">${s.reps}회</div></div>`).join('')}</div>${record.memo ? `<div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;gap:8px;"><span style="font-size:14px;">📝</span><div style="font-size:13px;color:var(--text-sub);line-height:1.6;">${record.memo}</div></div>` : ''}<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;"><span style="font-size:12px;color:var(--text-hint);">${formatTime(record.savedAt)}</span><button onclick="openEditWorkoutModal('${editKey}','${dateStr}')" style="background:${color}18;color:${color};border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">수정</button></div></div>`;
      } else {
        const fwInfo = FW_EXERCISE_LIST.find(e => e.name === item.name);
        const fwCategory = fwInfo ? fwInfo.category : '프리웨이트';
        const fwMuscles = fwInfo ? fwInfo.muscles : '';
        const isFwClassRecord = record.recordedBy === 'trainer';
        const fwBadgeHtml = isFwClassRecord
          ? `<span style="font-size:10px;font-weight:700;color:white;background:#f59e0b;padding:2px 5px;border-radius:4px;">수업</span>`
          : `<span style="font-size:10px;font-weight:700;color:white;background:#1a6fd4;padding:2px 5px;border-radius:4px;">개인</span>`;
        return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:10px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div style="width:36px;height:36px;border-radius:10px;background:#f59e0b18;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🏋️</div><div style="flex:1;"><div style="display:flex;align-items:center;gap:6px;">${fwBadgeHtml}<span style="font-size:11px;font-weight:700;color:white;background:#d97706;padding:2px 6px;border-radius:5px;white-space:nowrap;">${fwCategory}</span><span style="font-size:14px;font-weight:700;color:var(--text);">${item.name}</span></div><div style="font-size:12px;color:var(--text-sub);margin-top:2px;">${fwMuscles ? fwMuscles + (maxW > 0 ? ' · 최고 '+maxW+'kg' : '') : (maxW > 0 ? '최고 '+maxW+'kg' : '맨몸 운동')}</div></div></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;">${record.sets.map(s=>`<div style="background:#f59e0b12;border-radius:8px;padding:8px;text-align:center;"><div style="font-size:11px;color:#d97706;margin-bottom:2px;font-weight:600;">${s.set}세트</div><div style="font-size:13px;font-weight:700;color:var(--text);">${s.weight > 0 ? s.weight+'kg' : '-'}</div><div style="font-size:11px;color:var(--text-sub);">${s.reps}회</div></div>`).join('')}</div>${record.memo ? `<div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;gap:8px;"><span style="font-size:14px;">📝</span><div style="font-size:13px;color:var(--text-sub);line-height:1.6;">${record.memo}</div></div>` : ''}<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;"><span style="font-size:12px;color:var(--text-hint);">${formatTime(record.savedAt)}</span><button onclick="openEditWorkoutModal('freeweight_${item.name.replace(/\s+/g,'_')}_${localStorage.getItem('current_user')}','${dateStr}')" style="background:#f59e0b18;color:#d97706;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">수정</button></div></div>`;
      }
    }).join('');
    detail.innerHTML = `<div style="background:var(--blue);border-radius:var(--radius);padding:16px 18px;margin-bottom:12px;color:white;"><div style="font-size:15px;font-weight:700;margin-bottom:10px;">📅 ${dateLabel} 운동 요약</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;text-align:center;"><div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:8px;"><div style="font-size:16px;font-weight:700;">${dayRecords.length}</div><div style="font-size:10px;opacity:0.8;margin-top:2px;">운동 종류</div></div><div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:8px;"><div style="font-size:16px;font-weight:700;">${totalSets}</div><div style="font-size:10px;opacity:0.8;margin-top:2px;">총 세트</div></div><div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:8px;"><div style="font-size:16px;font-weight:700;">${totalVol}</div><div style="font-size:10px;opacity:0.8;margin-top:2px;">볼륨(kg)</div></div><div style="background:rgba(255,255,255,0.2);border-radius:8px;padding:8px;"><div style="font-size:16px;font-weight:700;">${totalCardioKcal > 0 ? '~'+totalCardioKcal : '-'}</div><div style="font-size:10px;opacity:0.8;margin-top:2px;">유산소Kcal</div></div></div></div>${cardsHtml}`;
  }

  function renderEquipmentList(list) {
    const userId = localStorage.getItem('current_user');
    const container = document.getElementById('equipment-list');
    if (!container) return;
    if (list.length === 0) { container.innerHTML = '<div class="empty-state">검색 결과가 없어요</div>'; return; }
    container.innerHTML = list.map(eq => {
      const records = JSON.parse(localStorage.getItem('workout_' + eq.key + '_' + userId) || '[]');
      const last = records[0];
      const color = getMuscleColor(eq.muscles);
      return `<div onclick="openEquipmentByKey('${eq.key}')" style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer;transition:background 0.15s;" onmousedown="this.style.background='var(--blue-light)'" ontouchstart="this.style.background='var(--blue-light)'" onmouseup="this.style.background='var(--card)'" ontouchend="this.style.background='var(--card)'"><div style="width:44px;height:44px;border-radius:12px;background:${color}18;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">${eq.emoji}</div><div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><span style="font-size:12px;font-weight:700;color:white;background:${color};padding:2px 7px;border-radius:6px;flex-shrink:0;">${eq.no}번</span><span style="font-size:14px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${eq.name}</span></div><div style="font-size:12px;color:var(--text-sub);margin-top:3px;">${eq.muscles}</div><div style="font-size:11px;color:${last ? color : 'var(--text-hint)'};margin-top:2px;">${last ? '마지막 기록: ' + last.dateLabel + ' · ' + last.sets.length + '세트' : '아직 기록이 없어요'}</div></div><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg></div>`;
    }).join('');
  }

  function showEquipmentSearchResult(query) {
    const resultEl = document.getElementById('equipment-search-result');
    const clearBtn = document.getElementById('search-clear-btn');
    const q = query.trim();
    if (!q) { resultEl.style.display = 'none'; clearBtn.style.display = 'none'; return; }
    clearBtn.style.display = 'block';
    const userId = localStorage.getItem('current_user');
    const filtered = EQUIPMENT_LIST.filter(eq => eq.name.includes(q) || eq.muscles.includes(q) || String(eq.no) === q || eq.brand.includes(q));
    if (filtered.length === 0) { resultEl.style.display = 'block'; resultEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-hint);font-size:14px;">검색 결과가 없어요</div>'; return; }
    resultEl.style.display = 'block';
    resultEl.innerHTML = filtered.map((eq, idx) => {
      const color = getMuscleColor(eq.muscles);
      const records = JSON.parse(localStorage.getItem('workout_' + eq.key + '_' + userId) || '[]');
      const last = records[0];
      const border = idx < filtered.length - 1 ? 'border-bottom:1px solid var(--border);' : '';
      return `<div onclick="selectEquipmentFromSearch('${eq.key}')" style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;${border}" ontouchstart="this.style.background='var(--blue-light)'" ontouchend="this.style.background='transparent'" onmouseenter="this.style.background='var(--blue-light)'" onmouseleave="this.style.background='transparent'"><div style="width:36px;height:36px;border-radius:10px;background:${color}18;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${eq.emoji}</div><div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:6px;"><span style="font-size:11px;font-weight:700;color:white;background:${color};padding:2px 6px;border-radius:5px;flex-shrink:0;">${eq.no}번</span><span style="font-size:14px;font-weight:700;color:var(--text);">${eq.name}</span></div><div style="font-size:12px;color:var(--text-sub);margin-top:2px;">${eq.muscles} · ${last ? '최근 ' + last.dateLabel : '기록 없음'}</div></div><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg></div>`;
    }).join('');
  }

  function selectEquipmentFromSearch(key) { clearEquipmentSearch(); const eq = EQUIPMENT_LIST.find(e => e.key === key); if (eq) openGenericWorkout(eq); }

  function clearEquipmentSearch() {
    const input = document.getElementById('equipment-search');
    const resultEl = document.getElementById('equipment-search-result');
    const clearBtn = document.getElementById('search-clear-btn');
    if (input) input.value = '';
    if (resultEl) resultEl.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
  }

  function openEquipmentByKey(key) { const eq = EQUIPMENT_LIST.find(e => e.key === key); if (!eq) return; openGenericWorkout(eq); }
  function openEquipmentScreen(equipment) { const eq = EQUIPMENT_LIST.find(e => e.key === equipment.id); if (eq) openGenericWorkout(eq); }

  function openQrScanner() {
    workoutScanCount = 0;
    document.getElementById('qr-scanner-overlay').style.display = 'flex';
    document.getElementById('workout-qr-status').textContent = 'QR코드를 네모 안에 맞춰주세요';
    startWorkoutQrCamera();
  }

  function closeQrScanner() { stopWorkoutQrCamera(); document.getElementById('qr-scanner-overlay').style.display = 'none'; }

  function loadWorkoutMainList() {
    const userId = localStorage.getItem('current_user');
    const container = document.getElementById('workout-main-list');
    if (!container) return;
    const equipments = [{ key: 'workout_chest_press_' + userId, name: '체스트프레스', emoji: '🏋️', muscles: '가슴 · 어깨 · 삼두근' }];
    let html = '';
    for (const eq of equipments) {
      const records = JSON.parse(localStorage.getItem(eq.key) || '[]');
      const last = records[0];
      html += `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px 18px;margin-bottom:10px;display:flex;align-items:center;gap:14px;"><div style="width:48px;height:48px;background:var(--blue-light);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">${eq.emoji}</div><div style="flex:1;min-width:0;"><div style="font-size:15px;font-weight:700;color:var(--text);">${eq.name}</div><div style="font-size:12px;color:var(--text-sub);margin-top:2px;">${eq.muscles}</div>${last ? `<div style="font-size:12px;color:var(--blue);margin-top:4px;font-weight:500;">마지막 기록: ${last.dateLabel} · ${last.sets.length}세트</div>` : `<div style="font-size:12px;color:var(--text-hint);margin-top:4px;">아직 기록이 없어요</div>`}</div><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>`;
    }
    if (!html) html = `<div style="text-align:center;padding:32px 20px;color:var(--text-hint);font-size:14px;">기구 QR을 스캔하면<br/>여기에 기록이 쌓여요! 💪</div>`;
    container.innerHTML = html;
  }

  async function startWorkoutQrCamera() {
    const video = document.getElementById('workout-qr-video');
    const statusEl = document.getElementById('workout-qr-status');
    try {
      if (!window.jsQR) { statusEl.textContent = 'QR 스캐너 로딩 중... 잠깐만요'; await waitForJsQR(); }
      workoutQrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
      video.srcObject = workoutQrStream;
      await video.play();
      workoutQrScanning = true;
      statusEl.textContent = 'QR코드를 네모 안에 맞춰주세요';
      scanWorkoutQrFrame(video);
    } catch(e) { console.error('카메라 오류:', e); statusEl.textContent = '카메라 권한이 필요해요. 설정에서 허용해주세요.'; }
  }

  function waitForJsQR() {
    return new Promise(resolve => {
      let tries = 0;
      const check = setInterval(() => { tries++; if (window.jsQR) { clearInterval(check); resolve(); } if (tries > 50) { clearInterval(check); resolve(); } }, 100);
    });
  }

  function stopWorkoutQrCamera() { workoutQrScanning = false; if (workoutQrStream) { workoutQrStream.getTracks().forEach(t => t.stop()); workoutQrStream = null; } }

  let workoutScanCount = 0;
  function scanWorkoutQrFrame(video) {
    if (!workoutQrScanning) return;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) { requestAnimationFrame(() => scanWorkoutQrFrame(video)); return; }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (!window.jsQR) { setTimeout(() => scanWorkoutQrFrame(video), 300); return; }
    const code = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    workoutScanCount++;
    if (workoutScanCount % 30 === 0) { const statusEl = document.getElementById('workout-qr-status'); if (code) { statusEl.textContent = '코드 감지됨: ' + code.data.substring(0, 20) + '...'; } else { statusEl.textContent = 'QR코드를 찾는 중... (' + workoutScanCount + '프레임)'; } }
    if (code) {
      console.log('QR 감지:', code.data);
      const equipment = EQUIPMENT_QR_MAP[code.data.trim()];
      if (equipment) { workoutQrScanning = false; stopWorkoutQrCamera(); closeQrScanner(); openEquipmentScreen(equipment); }
      else { document.getElementById('workout-qr-status').textContent = '인식됨: "' + code.data.substring(0, 15) + '" — 풍산 기구 QR이 아니에요'; setTimeout(() => { if (workoutQrScanning) document.getElementById('workout-qr-status').textContent = 'QR코드를 네모 안에 맞춰주세요'; requestAnimationFrame(() => scanWorkoutQrFrame(video)); }, 2000); }
    } else { requestAnimationFrame(() => scanWorkoutQrFrame(video)); }
  }

  let setCount = 0;
  let currentEquipment = null;
  function isDualEquipment(key) { return ['dual_inner_out', 'dual_pec_rear'].includes(key); }
  function getDualNames(key) {
    if (key === 'dual_inner_out') return { front: '이너타이', back: '아웃타이', frontColor: '#4a7fd4', backColor: '#d4537e', frontBg: '#E6F1FB', backBg: '#FBEAF0', frontText: '#185FA5', backText: '#993556' };
    if (key === 'dual_pec_rear') return { front: '펙덱 플라이', back: '리어 델토이드', frontColor: '#4a7fd4', backColor: '#d4537e', frontBg: '#E6F1FB', backBg: '#FBEAF0', frontText: '#185FA5', backText: '#993556' };
    return null;
  }

  let innerSetCount = 0;
  let outerSetCount = 0;

  function addInnerSet() {
    innerSetCount++;
    const n = innerSetCount;
    const list = document.getElementById('inner-set-list');
    const row = document.createElement('div');
    row.id = 'inner-set-row-' + n;
    row.style.cssText = 'display:grid;grid-template-columns:40px 1fr 1fr 36px 36px;gap:6px;margin-bottom:8px;align-items:center;padding-right:2px;';
    row.innerHTML = `<div style="background:#4a7fd4;color:white;border-radius:8px;height:40px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;">${n}</div><input type="number" id="inner-weight-${n}" placeholder="0" min="0" step="0.5" style="width:100%;box-sizing:border-box;height:40px;border:1.5px solid var(--border);border-radius:8px;text-align:center;font-size:15px;font-weight:700;font-family:'Noto Sans KR',sans-serif;background:var(--card);color:var(--text);outline:none;" onfocus="this.style.borderColor='#4a7fd4'" onblur="this.style.borderColor='var(--border)'"><input type="number" id="inner-reps-${n}" placeholder="0" min="0" style="width:100%;box-sizing:border-box;height:40px;border:1.5px solid var(--border);border-radius:8px;text-align:center;font-size:15px;font-weight:700;font-family:'Noto Sans KR',sans-serif;background:var(--card);color:var(--text);outline:none;" onfocus="this.style.borderColor='#4a7fd4'" onblur="this.style.borderColor='var(--border)'"><button onclick="addInnerSet()" style="background:#E6F1FB;border:none;border-radius:8px;height:40px;width:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#185FA5;">+</button><button onclick="removeInnerSet(${n})" style="background:#fee2e2;border:none;border-radius:8px;height:40px;width:36px;cursor:pointer;display:${innerSetCount === 1 ? 'none' : 'flex'};align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    list.appendChild(row);
    if (innerSetCount > 1) startRestTimer('inner-rest-timer-box', 'inner-rest-timer-count', 'inner-rest-min', 'inner-rest-sec');
  }

  function removeInnerSet(n) { const row = document.getElementById('inner-set-row-' + n); if (row) row.remove(); }

  function addOuterSet() {
    outerSetCount++;
    const n = outerSetCount;
    const list = document.getElementById('outer-set-list');
    const row = document.createElement('div');
    row.id = 'outer-set-row-' + n;
    row.style.cssText = 'display:grid;grid-template-columns:40px 1fr 1fr 36px 36px;gap:6px;margin-bottom:8px;align-items:center;padding-right:2px;';
    row.innerHTML = `<div style="background:#d4537e;color:white;border-radius:8px;height:40px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;">${n}</div><input type="number" id="outer-weight-${n}" placeholder="0" min="0" step="0.5" style="width:100%;box-sizing:border-box;height:40px;border:1.5px solid var(--border);border-radius:8px;text-align:center;font-size:15px;font-weight:700;font-family:'Noto Sans KR',sans-serif;background:var(--card);color:var(--text);outline:none;" onfocus="this.style.borderColor='#d4537e'" onblur="this.style.borderColor='var(--border)'"><input type="number" id="outer-reps-${n}" placeholder="0" min="0" style="width:100%;box-sizing:border-box;height:40px;border:1.5px solid var(--border);border-radius:8px;text-align:center;font-size:15px;font-weight:700;font-family:'Noto Sans KR',sans-serif;background:var(--card);color:var(--text);outline:none;" onfocus="this.style.borderColor='#d4537e'" onblur="this.style.borderColor='var(--border)'"><button onclick="addOuterSet()" style="background:#FBEAF0;border:none;border-radius:8px;height:40px;width:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#993556;">+</button><button onclick="removeOuterSet(${n})" style="background:#fee2e2;border:none;border-radius:8px;height:40px;width:36px;cursor:pointer;display:${outerSetCount === 1 ? 'none' : 'flex'};align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    list.appendChild(row);
    if (outerSetCount > 1) startRestTimer('outer-rest-timer-box', 'outer-rest-timer-count', 'outer-rest-min', 'outer-rest-sec');
  }

  function removeOuterSet(n) { const row = document.getElementById('outer-set-row-' + n); if (row) row.remove(); }

  function openGenericWorkout(eq) {
    currentEquipment = eq; setCount = 0; innerSetCount = 0; outerSetCount = 0;
    document.getElementById('set-list').innerHTML = '';
    document.getElementById('workout-memo').value = '';
    const dualWrap = document.getElementById('dual-section-wrap');
    const normalWrap = document.getElementById('normal-set-wrap');
    if (isDualEquipment(eq.key)) {
      dualWrap.style.display = 'block'; normalWrap.style.display = 'none';
      document.getElementById('inner-set-list').innerHTML = '';
      document.getElementById('outer-set-list').innerHTML = '';
      const dMemo = document.getElementById('dual-workout-memo'); if (dMemo) dMemo.value = '';
      const dn = getDualNames(eq.key);
      if (dn) {
        const innerTitle = document.getElementById('dual-inner-title');
        const outerTitle = document.getElementById('dual-outer-title');
        if (innerTitle) { innerTitle.textContent = dn.front + ' 세트 기록'; innerTitle.style.color = dn.frontColor; }
        if (outerTitle) { outerTitle.textContent = dn.back + ' 세트 기록'; outerTitle.style.color = dn.backColor; }
      }
      document.getElementById('inner-rest-min').value = 0; document.getElementById('inner-rest-sec').value = 0;
      document.getElementById('outer-rest-min').value = 0; document.getElementById('outer-rest-sec').value = 0;
      addInnerSet(); addOuterSet();
      const now = new Date();
      const dLabel = now.getFullYear() + '년 ' + (now.getMonth()+1) + '월 ' + now.getDate() + '일';
      const dlEl = document.getElementById('dual-workout-date-label');
      if (dlEl) dlEl.textContent = dLabel + ' 기록';
    } else { dualWrap.style.display = 'none'; normalWrap.style.display = 'block'; }
    const color = getMuscleColor(eq.muscles);
    document.getElementById('workout-detail-title').textContent = eq.name + ' 기록';
    document.getElementById('workout-equipment-card').style.background = color;
    document.getElementById('workout-equipment-emoji').textContent = eq.emoji;
    document.getElementById('workout-equipment-name').textContent = eq.no + '번 · ' + eq.name;
    document.getElementById('workout-equipment-muscles').textContent = eq.muscles;
    document.getElementById('workout-equipment-effect').textContent = eq.effect;
    const now = new Date();
    document.getElementById('workout-date-label').textContent = now.getFullYear() + '년 ' + (now.getMonth()+1) + '월 ' + now.getDate() + '일 기록';
    loadPrevRecords();
    addSet();
    showScreen('screen-workout-detail');
  }

  function closeWorkoutDetail() { skipRestTimer(); if (isTrainerMode) { isTrainerMode = false; showScreen('screen-trainee-detail'); switchTraineeTab('record'); } else { showScreen('screen-workout-qr'); renderCalendar(); if (calSelectedDate) renderDayDetail(calSelectedDate); } }
  function openChestPress() { const eq = EQUIPMENT_LIST.find(e => e.key === 'chest_press'); if (eq) openGenericWorkout(eq); }
  function closeChestPress() { closeWorkoutDetail(); }

  function addSet() {
    setCount++;
    const color = currentEquipment ? getMuscleColor(currentEquipment.muscles) : '#1a6fd4';
    const list = document.getElementById('set-list');
    const row = document.createElement('div');
    row.id = 'set-row-' + setCount;
    row.style.cssText = 'display:grid;grid-template-columns:40px 1fr 1fr 36px 36px;gap:6px;margin-bottom:8px;align-items:center;padding-right:2px;';
    row.innerHTML = `<div style="text-align:center;font-size:14px;font-weight:700;color:white;background:${color};border-radius:8px;height:44px;display:flex;align-items:center;justify-content:center;">${setCount}</div><input type="number" placeholder="0" min="0" max="500" step="2.5" style="width:100%;box-sizing:border-box;padding:10px;border:1.5px solid var(--border);border-radius:8px;font-size:15px;font-weight:700;text-align:center;color:var(--text);outline:none;font-family:'Noto Sans KR',sans-serif;" id="weight-${setCount}" onfocus="this.style.borderColor='${color}'" onblur="this.style.borderColor='var(--border)'" /><input type="number" placeholder="0" min="0" max="100" style="width:100%;box-sizing:border-box;padding:10px;border:1.5px solid var(--border);border-radius:8px;font-size:15px;font-weight:700;text-align:center;color:var(--text);outline:none;font-family:'Noto Sans KR',sans-serif;" id="reps-${setCount}" onfocus="this.style.borderColor='${color}'" onblur="this.style.borderColor='var(--border)'" /><button onclick="addSet()" style="width:36px;height:36px;border:none;background:var(--blue-light);color:var(--blue);border-radius:8px;cursor:pointer;font-size:20px;font-weight:700;display:flex;align-items:center;justify-content:center;">+</button><button onclick="removeSet(${setCount})" style="width:36px;height:36px;border:none;background:#fee2e2;color:#ef4444;border-radius:8px;cursor:pointer;font-size:18px;display:${setCount === 1 ? 'none' : 'flex'};align-items:center;justify-content:center;">×</button>`;
    list.appendChild(row);
    if (setCount > 1) startRestTimer('rest-timer-box', 'rest-timer-count', 'rest-min', 'rest-sec');
  }

  function removeSet(n) { const row = document.getElementById('set-row-' + n); if (row) row.remove(); }

  function _saveDualWorkout(userId, innerSets, outerSets, saveDate) {
    const now = new Date();
    const date = saveDate || (now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate());
    const dateParts = date.split('-');
    const dateLabel = dateParts[0] + '년 ' + dateParts[1] + '월 ' + dateParts[2] + '일';
    const savedAt = now.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
    const memo = document.getElementById('dual-workout-memo')?.value || '';
    const eqKey = currentEquipment.key;
    const dNames = getDualNames(eqKey);
    if (innerSets.length > 0) {
      const sets = innerSets.map((s, i) => ({ set: i+1, weight: parseFloat(s.weight)||0, reps: parseInt(s.reps)||0 }));
      const vol = sets.reduce((a, s) => a + s.weight * s.reps, 0);
      const kcal = calcKcalByMET(5.0, sets.length * 3, vol);
      const record = { date, dateLabel, sets, memo, kcal, savedAt, name: dNames ? dNames.front : eqKey };
      if (isTrainerMode) record.recordedBy = 'trainer';
      if (!isTrainerMode) {
        const key = 'workout_dual_front_' + eqKey + '_' + userId;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        const idx = existing.findIndex(r => r.date === date);
        if (idx !== -1) existing[idx] = record; else existing.unshift(record);
        if (existing.length > 30) existing.pop();
        localStorage.setItem(key, JSON.stringify(existing));
      }
      db.ref('users/' + userId + '/workouts/dual_front_' + eqKey + '/' + date).set(record);
    }
    if (outerSets.length > 0) {
      const sets = outerSets.map((s, i) => ({ set: i+1, weight: parseFloat(s.weight)||0, reps: parseInt(s.reps)||0 }));
      const vol = sets.reduce((a, s) => a + s.weight * s.reps, 0);
      const kcal = calcKcalByMET(5.0, sets.length * 3, vol);
      const record = { date, dateLabel, sets, memo, kcal, savedAt, name: dNames ? dNames.back : eqKey };
      if (isTrainerMode) record.recordedBy = 'trainer';
      if (!isTrainerMode) {
        const key = 'workout_dual_back_' + eqKey + '_' + userId;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        const idx = existing.findIndex(r => r.date === date);
        if (idx !== -1) existing[idx] = record; else existing.unshift(record);
        if (existing.length > 30) existing.pop();
        localStorage.setItem(key, JSON.stringify(existing));
      }
      db.ref('users/' + userId + '/workouts/dual_back_' + eqKey + '/' + date).set(record);
    }
    const color = getMuscleColor(currentEquipment.muscles);
    const totalSets = innerSets.length + outerSets.length;
    const allSets = [...innerSets, ...outerSets];
    const maxWeight = allSets.length > 0 ? Math.max(...allSets.map(s => parseFloat(s.weight)||0)) : 0;
    const totalVol = allSets.reduce((sum, s) => sum + (parseFloat(s.weight)||0) * (parseInt(s.reps)||0), 0);
    const completeNames = getDualNames(currentEquipment.key);
    const completeName = completeNames ? `${completeNames.front} & ${completeNames.back}` : currentEquipment.name;
    document.getElementById('workout-complete-msg').textContent = completeName + ' 기록 완료!';
    document.getElementById('workout-summary').innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;"><div><div style="font-size:11px;color:#5a6478;margin-bottom:4px;">총 세트</div><div style="font-size:18px;font-weight:700;color:${color};">${totalSets}</div></div><div><div style="font-size:11px;color:#5a6478;margin-bottom:4px;">최고 무게</div><div style="font-size:18px;font-weight:700;color:${color};">${maxWeight}kg</div></div><div><div style="font-size:11px;color:#5a6478;margin-bottom:4px;">총 볼륨</div><div style="font-size:18px;font-weight:700;color:${color};">${totalVol}kg</div></div></div>`;
    document.getElementById('workout-complete-overlay').classList.add('active');
  }

  function saveWorkout() {
    if (!currentEquipment) return;
    const userId = isTrainerMode ? trainerTargetId : localStorage.getItem('current_user');
    const saveDate = isTrainerMode && trainerTargetDate ? trainerTargetDate : null;
    if (isDualEquipment(currentEquipment.key)) {
      const innerSets = [], outerSets = [];
      document.querySelectorAll('[id^="inner-set-row-"]').forEach(row => { const n = row.id.replace('inner-set-row-', ''); const w = parseFloat(document.getElementById('inner-weight-' + n)?.value) || 0; const r = parseInt(document.getElementById('inner-reps-' + n)?.value) || 0; if (w > 0 || r > 0) innerSets.push({ set: innerSets.length + 1, weight: w, reps: r }); });
      document.querySelectorAll('[id^="outer-set-row-"]').forEach(row => { const n = row.id.replace('outer-set-row-', ''); const w = parseFloat(document.getElementById('outer-weight-' + n)?.value) || 0; const r = parseInt(document.getElementById('outer-reps-' + n)?.value) || 0; if (w > 0 || r > 0) outerSets.push({ set: outerSets.length + 1, weight: w, reps: r }); });
      if (innerSets.length === 0 && outerSets.length === 0) { alert('최소 1세트 이상 입력해주세요!'); return; }
      _saveDualWorkout(userId, innerSets, outerSets, saveDate); return;
    }
    const sets = [];
    for (let i = 1; i <= setCount; i++) {
      const wEl = document.getElementById('weight-' + i); const rEl = document.getElementById('reps-' + i);
      if (!wEl || !rEl) continue;
      const w = parseFloat(wEl.value) || 0; const r = parseInt(rEl.value) || 0;
      if (w > 0 || r > 0) sets.push({ set: sets.length + 1, weight: w, reps: r });
    }
    if (sets.length === 0) { alert('최소 1세트 이상 입력해주세요!'); return; }
    const memo = document.getElementById('workout-memo').value;
    const now = new Date();
    const date = saveDate || (now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate());
    const dateParts = date.split('-');
    const dateLabel = dateParts[0] + '년 ' + dateParts[1] + '월 ' + dateParts[2] + '일';
    const workoutVol = sets.reduce((s, r) => s + r.weight * r.reps, 0);
    const kcal = calcKcalByMET(5.0, sets.length * 3, workoutVol);
    const record = { date, dateLabel, sets, memo, kcal, savedAt: now.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' }) };
    if (isTrainerMode) record.recordedBy = 'trainer';
    if (!isTrainerMode) {
      const key = 'workout_' + currentEquipment.key + '_' + userId;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const todayIdx = existing.findIndex(r => r.date === record.date);
      if (todayIdx !== -1) existing[todayIdx] = record; else existing.unshift(record);
      if (existing.length > 30) existing.pop();
      localStorage.setItem(key, JSON.stringify(existing));
    }
    db.ref('users/' + userId + '/workouts/' + currentEquipment.key + '/' + date).set(record);
    const maxWeight = Math.max(...sets.map(s => s.weight));
    const totalVol = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    const color = getMuscleColor(currentEquipment.muscles);
    document.getElementById('workout-complete-msg').textContent = currentEquipment.name + ' ' + sets.length + '세트 완료!';
    document.getElementById('workout-summary').innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;"><div><div style="font-size:11px;color:#5a6478;margin-bottom:4px;">총 세트</div><div style="font-size:18px;font-weight:700;color:${color};">${sets.length}</div></div><div><div style="font-size:11px;color:#5a6478;margin-bottom:4px;">최고 무게</div><div style="font-size:18px;font-weight:700;color:${color};">${maxWeight}kg</div></div><div><div style="font-size:11px;color:#5a6478;margin-bottom:4px;">총 볼륨</div><div style="font-size:18px;font-weight:700;color:${color};">${totalVol}kg</div></div></div>`;
    document.getElementById('workout-complete-overlay').classList.add('active');
  }

  function closeWorkoutComplete() { document.getElementById('workout-complete-overlay').classList.remove('active'); if (isTrainerMode) { isTrainerMode = false; showScreen('screen-trainee-detail'); switchTraineeTab('record'); } else { closeWorkoutDetail(); renderCalendar(); if (calSelectedDate) renderDayDetail(calSelectedDate); } }

  function loadPrevRecords() {
    if (!currentEquipment) return;
    const userId = localStorage.getItem('current_user');
    const container = document.getElementById('prev-records');
    const color = getMuscleColor(currentEquipment.muscles);
    if (isDualEquipment(currentEquipment.key)) {
      const eqKey = currentEquipment.key;
      const innerKey = 'workout_dual_front_' + eqKey + '_' + userId;
      const outerKey = 'workout_dual_back_' + eqKey + '_' + userId;
      const innerRecords = JSON.parse(localStorage.getItem(innerKey) || '[]');
      const outerRecords = JSON.parse(localStorage.getItem(outerKey) || '[]');
      if (innerRecords.length === 0 && outerRecords.length === 0) { container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:14px;">아직 기록이 없어요.<br/>첫 번째 기록을 남겨보세요! 💪</div>'; return; }
      const makeCard = (r, key, label, cardColor) => `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:10px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><div style="font-size:13px;font-weight:700;color:${cardColor};">${label}</div><div style="display:flex;align-items:center;gap:6px;"><div style="font-size:12px;color:var(--text-hint);">${r.dateLabel} ${r.savedAt}</div><button onclick="openEditWorkoutModal('${key}','${r.date}')" style="background:${cardColor}18;color:${cardColor};border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">수정</button></div></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:${r.memo ? '10px' : '0'};">${r.sets.map(s => `<div style="background:${cardColor}18;border-radius:8px;padding:8px;text-align:center;"><div style="font-size:11px;color:${cardColor};margin-bottom:2px;">${s.set}세트</div><div style="font-size:14px;font-weight:700;color:var(--text);">${s.weight}kg × ${s.reps}회</div></div>`).join('')}</div>${r.memo ? `<div style="font-size:13px;color:var(--text-sub);background:var(--bg);border-radius:8px;padding:8px 10px;">📝 ${r.memo}</div>` : ''}</div>`;
      const dNames = getDualNames(currentEquipment.key) || { front: '전면', back: '후면' };
      container.innerHTML = innerRecords.slice(0,5).map(r => makeCard(r, innerKey, dNames.front, '#4a7fd4')).join('') + outerRecords.slice(0,5).map(r => makeCard(r, outerKey, dNames.back, '#d4537e')).join('');
      return;
    }
    const key = 'workout_' + currentEquipment.key + '_' + userId;
    const records = JSON.parse(localStorage.getItem(key) || '[]');
    if (records.length === 0) { container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:14px;">아직 기록이 없어요.<br/>첫 번째 기록을 남겨보세요! 💪</div>'; return; }
    container.innerHTML = records.map(r => `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:10px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><div style="font-size:14px;font-weight:700;color:var(--text);">${r.dateLabel}</div><div style="display:flex;align-items:center;gap:8px;"><div style="font-size:12px;color:var(--text-hint);">${r.savedAt}</div><button onclick="openEditWorkoutModal('${key}','${r.date}')" style="background:${color}18;color:${color};border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">수정</button></div></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:${r.memo ? '10px' : '0'};">${r.sets.map(s => `<div style="background:${color}18;border-radius:8px;padding:8px;text-align:center;"><div style="font-size:11px;color:${color};margin-bottom:2px;">${s.set}세트</div><div style="font-size:14px;font-weight:700;color:var(--text);">${s.weight}kg × ${s.reps}회</div></div>`).join('')}</div>${r.memo ? `<div style="font-size:13px;color:var(--text-sub);background:var(--bg);border-radius:8px;padding:8px 10px;">📝 ${r.memo}</div>` : ''}</div>`).join('');
  }

  const VALID_QR_CODE = 'PUNGSAN_FITNESS_2025';
  let qrStream = null;
  let qrScanning = false;

  function openAttendance() {
    const userId = localStorage.getItem('current_user');
    const todayKey = 'attend_' + userId + '_' + getToday();
    if (localStorage.getItem(todayKey) === 'done') { alert('오늘은 이미 출석체크를 완료했어요! 내일 또 만나요 😊'); return; }
    resetAttendance(); showScreen('screen-attendance');
  }

  function resetAttendance() {
    document.getElementById('attend-step1').style.display = 'block';
    document.getElementById('attend-step2').style.display = 'none';
    document.getElementById('photo-preview-wrap').style.display = 'none';
    document.getElementById('photo-btn-wrap').style.display = 'flex';
    document.getElementById('step1-circle').className = 'step-circle active';
    document.getElementById('step2-circle').className = 'step-circle';
    document.getElementById('step-line').className = 'step-line';
    stopQrCamera();
  }

  function takePhoto(type) { document.getElementById('photo-input-camera').click(); }

  function handlePhoto(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('photo-preview').src = e.target.result;
      document.getElementById('photo-preview-wrap').style.display = 'block';
      document.getElementById('photo-btn-wrap').style.display = 'none';
      const userId = localStorage.getItem('current_user');
      localStorage.setItem('owunwan_' + userId + '_' + getToday(), e.target.result);
    };
    reader.readAsDataURL(file);
  }

  function retakePhoto() { document.getElementById('photo-preview-wrap').style.display = 'none'; document.getElementById('photo-btn-wrap').style.display = 'flex'; }

  function goToStep2() {
    document.getElementById('attend-step1').style.display = 'none';
    document.getElementById('attend-step2').style.display = 'block';
    document.getElementById('step1-circle').className = 'step-circle done';
    document.getElementById('step1-circle').textContent = '✓';
    document.getElementById('step2-circle').className = 'step-circle active';
    document.getElementById('step-line').className = 'step-line done';
    startQrCamera();
  }

  function goBackToStep1() {
    stopQrCamera();
    document.getElementById('attend-step2').style.display = 'none';
    document.getElementById('attend-step1').style.display = 'block';
    document.getElementById('step1-circle').className = 'step-circle active';
    document.getElementById('step1-circle').textContent = '1';
    document.getElementById('step2-circle').className = 'step-circle';
    document.getElementById('step-line').className = 'step-line';
  }

  async function startQrCamera() {
    const video = document.getElementById('qr-video');
    const statusEl = document.getElementById('qr-status-msg');
    try {
      if (!window.jsQR) { statusEl.textContent = 'QR 스캐너 로딩 중...'; await waitForJsQR(); }
      qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
      video.srcObject = qrStream; await video.play(); qrScanning = true;
      statusEl.textContent = 'QR코드를 네모 안에 맞춰주세요';
      scanQrFrame(video);
    } catch(e) { statusEl.textContent = '카메라 권한이 필요해요. 설정에서 허용해주세요.'; }
  }

  function stopQrCamera() { qrScanning = false; if (qrStream) { qrStream.getTracks().forEach(t => t.stop()); qrStream = null; } }

  function scanQrFrame(video) {
    if (!qrScanning) return;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) { requestAnimationFrame(() => scanQrFrame(video)); return; }
    if (!window.jsQR) { setTimeout(() => scanQrFrame(video), 300); return; }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code) {
      const scanned = code.data.trim();
      if (scanned.startsWith('PUNGSAN_')) { qrScanning = false; stopQrCamera(); completeAttendance(); }
      else { document.getElementById('qr-status-msg').textContent = '"' + scanned.substring(0, 15) + '" — 풍산 QR이 아니에요'; setTimeout(() => { document.getElementById('qr-status-msg').textContent = 'QR코드를 네모 안에 맞춰주세요'; requestAnimationFrame(() => scanQrFrame(video)); }, 1500); }
    } else { requestAnimationFrame(() => scanQrFrame(video)); }
  }

  function completeAttendance() {
    const userId = localStorage.getItem('current_user');
    const today = getToday();
    db.ref('users/' + userId + '/attendance/' + today).set(true);
    db.ref('users/' + userId + '/points').transaction(cur => (cur || 0) + 10);
    const todayKey = 'attend_' + userId + '_' + today;
    localStorage.setItem(todayKey, 'done');
    const pointKey = 'points_' + userId;
    const cur = parseInt(localStorage.getItem(pointKey) || '0');
    localStorage.setItem(pointKey, cur + 10);
    updateStats();
    const photoSrc = document.getElementById('photo-preview').src;
    if (photoSrc && photoSrc.startsWith('data:image')) uploadOwunwanToCommunity(photoSrc, userId);
    const nick = localStorage.getItem('name_' + userId) || '회원';
    const now = new Date();
    document.getElementById('attend-complete-msg').textContent = nick + '님, 오운완 인증까지 완벽해요! 💪';
    document.getElementById('attend-date-msg').textContent = now.getFullYear() + '년 ' + (now.getMonth()+1) + '월 ' + now.getDate() + '일 출석 완료';
    document.getElementById('attend-complete-overlay').classList.add('active');
  }

  async function uploadOwunwanToCommunity(dataUrl, userId) {
    try {
      const nickname = localStorage.getItem('name_' + userId) || '회원';
      const res = await fetch(dataUrl); const blob = await res.blob();
      const file = new File([blob], 'owunwan.jpg', { type: blob.type });
      const compressed = await compressImage(file);
      const ref = storage.ref('posts/owunwan_' + Date.now() + '_' + userId + '.jpg');
      await ref.put(compressed);
      const photoURL = await ref.getDownloadURL();
      const now = new Date();
      const postData = { authorId: userId, nickname, category: '오운완', content: '오늘도 출석 완료! 💪\n' + now.getFullYear() + '년 ' + (now.getMonth()+1) + '월 ' + now.getDate() + '일 운동 인증', photoURL, createdAt: Date.now(), commentCount: 0 };
      await db.ref('posts').push(postData);
    } catch(e) { console.error('오운완 업로드 실패:', e); }
  }

  function closeAttendComplete() { document.getElementById('attend-complete-overlay').classList.remove('active'); resetAttendance(); switchTab('home'); }
  function getToday() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate(); }

  function updateStats() {
    const userId = localStorage.getItem('current_user');
    if (!userId) return;
    const now = new Date();
    const monthPrefix = now.getFullYear() + '-' + (now.getMonth()+1) + '-';
    db.ref('users/' + userId + '/attendance').once('value', snap => {
      let count = 0; snap.forEach(child => { if (child.key.startsWith(monthPrefix)) count++; });
      const el = document.getElementById('stat-days'); if (el) el.textContent = count;
    });
    db.ref('users/' + userId + '/points').once('value', snap => {
      const pts = snap.val() || 0; const el = document.getElementById('stat-points'); if (el) el.textContent = pts;
    });
  }

  function togglePw() {
    const inp = document.getElementById('login-pw'); const icon = document.getElementById('eye-icon');
    if (inp.type === 'password') { inp.type = 'text'; icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'; }
    else { inp.type = 'password'; icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'; }
  }

  const CARDIO_CONFIG = { '런닝머신': { distLabel:'📍 거리', distUnit:'km' }, '스텝밀': { distLabel:'📍 거리', distUnit:'km' }, '사이클': { distLabel:'📍 거리', distUnit:'km' }, '마이마운틴': { distLabel:'📍 거리', distUnit:'km' } };

  function calcCardioKcal() {
    const type = document.getElementById('cardio-type').value;
    const min  = parseFloat(document.getElementById('cardio-min').value)  || 0;
    const dist = parseFloat(document.getElementById('cardio-dist').value) || 0;
    const { gender, age, height, weight } = getBodyInfo();
    let bmr;
    if (gender === 'female') bmr = 447.6 + (9.2 * weight) + (3.1 * height) - (4.3 * age);
    else bmr = 88.4 + (13.4 * weight) + (4.8 * height) - (5.7 * age);
    const bmrFactor = bmr / (gender === 'female' ? 1500 : 1800);
    let kcal = 0;
    if (type === '런닝머신') { const effectiveDist = dist > 0 ? dist : (min / 60) * 8; kcal = effectiveDist * weight * 1.036 * bmrFactor; }
    else if (type === '스텝밀') { const timeKcal = min * weight * 0.12 * bmrFactor; const distKcal = dist > 0 ? dist * weight * 0.5 * bmrFactor : 0; kcal = dist > 0 ? (timeKcal + distKcal) / 2 : timeKcal; }
    else if (type === '사이클') { const effectiveDist = dist > 0 ? dist : (min / 60) * 20; kcal = effectiveDist * weight * 0.6 * bmrFactor; }
    else if (type === '마이마운틴') { const timeKcal = min * weight * 0.11 * bmrFactor; const distKcal = dist > 0 ? dist * weight * 0.4 * bmrFactor : 0; kcal = dist > 0 ? (timeKcal + distKcal) / 2 : timeKcal; }
    const el = document.getElementById('cardio-kcal-display');
    if (el) el.textContent = (min === 0 && dist === 0) ? '-' : '약 ' + Math.round(kcal) + ' kcal';
  }

  let cardioEditDate = null;

  function openEditCardioModal(type, dateStr) {
    const userId = localStorage.getItem('current_user');
    const safeKey = 'cardio_' + type + '_' + userId;
    const records = JSON.parse(localStorage.getItem(safeKey) || '[]');
    const record = records.find(r => r.date === dateStr);
    if (!record) { alert('기록을 찾을 수 없어요.'); return; }
    cardioEditDate = dateStr;
    openCardioModal();
    setTimeout(() => {
      document.getElementById('cardio-type').value = type;
      document.getElementById('cardio-min').value = record.min || '';
      document.getElementById('cardio-dist').value = record.dist || '';
      document.getElementById('cardio-memo').value = record.memo || '';
      document.querySelectorAll('.cardio-type-btn').forEach(b => { const isSelected = b.dataset.type === type; b.style.border = isSelected ? '2px solid #ef4444' : '2px solid var(--border)'; b.style.background = isSelected ? '#fee2e2' : 'var(--card)'; b.style.color = isSelected ? '#ef4444' : 'var(--text-sub)'; });
      updateCardioLabels(type); calcCardioKcal();
      const saveBtn = document.querySelector('#cardio-modal .btn-primary'); if (saveBtn) saveBtn.textContent = '💾 유산소 기록 수정';
      const deleteBtn = document.getElementById('cardio-delete-btn'); if (deleteBtn) deleteBtn.style.display = 'block';
    }, 50);
  }

  function openCardioModal() {
    document.getElementById('cardio-type').value = '런닝머신';
    document.getElementById('cardio-min').value = ''; document.getElementById('cardio-dist').value = ''; document.getElementById('cardio-memo').value = '';
    const kcalEl = document.getElementById('cardio-kcal-display'); if (kcalEl) kcalEl.textContent = '-';
    document.querySelectorAll('.cardio-type-btn').forEach(b => { b.style.border = '2px solid var(--border)'; b.style.background = 'var(--card)'; b.style.color = 'var(--text-sub)'; });
    const first = document.querySelector('.cardio-type-btn'); if (first) { first.style.border = '2px solid #ef4444'; first.style.background = '#fee2e2'; first.style.color = '#ef4444'; }
    updateCardioLabels('런닝머신');
    const deleteBtn = document.getElementById('cardio-delete-btn'); if (deleteBtn) deleteBtn.style.display = 'none';
    document.getElementById('cardio-modal').classList.add('active');
  }

  function closeCardioModal() { document.getElementById('cardio-modal').classList.remove('active'); }

  function selectCardioType(btn, type) {
    document.querySelectorAll('.cardio-type-btn').forEach(b => { b.style.border = '2px solid var(--border)'; b.style.background = 'var(--card)'; b.style.color = 'var(--text-sub)'; });
    btn.style.border = '2px solid #ef4444'; btn.style.background = '#fee2e2'; btn.style.color = '#ef4444';
    document.getElementById('cardio-type').value = type; updateCardioLabels(type);
  }

  function updateCardioLabels(type) {
    const cfg = CARDIO_CONFIG[type] || CARDIO_CONFIG['런닝머신'];
    document.getElementById('cardio-dist-label').textContent = cfg.distLabel;
    document.getElementById('cardio-dist-unit').textContent = cfg.distUnit;
    calcCardioKcal();
  }

  function deleteCardioRecord() {
    if (!confirm('이 유산소 기록을 삭제할까요?')) return;
    const userId = localStorage.getItem('current_user');
    const type = document.getElementById('cardio-type').value;
    const key = 'cardio_' + type + '_' + userId;
    const records = JSON.parse(localStorage.getItem(key) || '[]');
    const filtered = records.filter(r => r.date !== cardioEditDate);
    localStorage.setItem(key, JSON.stringify(filtered));
    closeCardioModal(); renderCalendar(); if (calSelectedDate) renderDayDetail(calSelectedDate);
    alert('삭제됐어요! 🗑');
  }

  function saveCardioWorkout() {
    const type = document.getElementById('cardio-type').value;
    const min  = parseInt(document.getElementById('cardio-min').value) || 0;
    const dist = parseFloat(document.getElementById('cardio-dist').value) || 0;
    const memo = document.getElementById('cardio-memo').value.trim();
    if (min === 0) { alert('운동 시간을 입력해주세요!'); return; }
    const kcalEl = document.getElementById('cardio-kcal-display');
    const kcal = parseInt((kcalEl ? kcalEl.textContent : '-').replace(/[^0-9]/g, '')) || 0;
    const userId = localStorage.getItem('current_user');
    const now = new Date();
    const cfg = CARDIO_CONFIG[type];
    const isEdit = !!cardioEditDate;
    const recordDate = isEdit ? cardioEditDate : (now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate());
    const dateLabel = (() => { const parts = recordDate.split('-'); return parts[0] + '년 ' + parseInt(parts[1]) + '월 ' + parseInt(parts[2]) + '일'; })();
    const record = { date: recordDate, dateLabel, type, min, sec: 0, dist, kcal, distUnit: cfg.distUnit, memo, savedAt: now.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' }) };
    const safeKey = 'cardio_' + type + '_' + userId;
    const existing = JSON.parse(localStorage.getItem(safeKey) || '[]');
    const todayIdx = existing.findIndex(r => r.date === record.date);
    if (todayIdx !== -1) existing[todayIdx] = record; else existing.unshift(record);
    if (existing.length > 30) existing.pop();
    localStorage.setItem(safeKey, JSON.stringify(existing));
    db.ref('users/' + userId + '/workouts/cardio_' + type + '/' + record.date).set(record);
    const cardioIndex = JSON.parse(localStorage.getItem('cardio_index_' + userId) || '[]');
    if (!cardioIndex.includes(type)) { cardioIndex.push(type); localStorage.setItem('cardio_index_' + userId, JSON.stringify(cardioIndex)); db.ref('users/' + userId + '/cardioIndex').set(cardioIndex); }
    closeCardioModal(); cardioEditDate = null;
    const saveBtn = document.querySelector('#cardio-modal .btn-primary'); if (saveBtn) saveBtn.textContent = '💾 유산소 기록 저장';
    const timeStr = min + '분';
    document.getElementById('workout-complete-msg').textContent = type + ' ' + timeStr + ' 완료!';
    document.getElementById('workout-summary').innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;"><div><div style="font-size:11px;color:#5a6478;margin-bottom:4px;">운동시간</div><div style="font-size:18px;font-weight:700;color:#ef4444;">${timeStr}</div></div><div><div style="font-size:11px;color:#5a6478;margin-bottom:4px;">거리</div><div style="font-size:18px;font-weight:700;color:#ef4444;">${dist > 0 ? dist + cfg.distUnit : '-'}</div></div><div><div style="font-size:11px;color:#5a6478;margin-bottom:4px;">칼로리</div><div style="font-size:18px;font-weight:700;color:#ef4444;">약 ${kcal} kcal</div></div></div>`;
    document.getElementById('workout-complete-overlay').classList.add('active');
    renderCalendar(); if (calSelectedDate) renderDayDetail(calSelectedDate);
  }

  let fwSetCount = 0;
  let classEditDate = null;

  // 수업 칼로리 계산 (MET 기반)
  const CLASS_MET = {
    '기구필라테스': 3.5, '에어로빅': 6.5, '방송댄스': 5.5,
    '요가': 2.5, '매트필라테스': 3.0, '기능성운동': 4.0
  };

  function openClassModal() {
    classEditDate = null;
    document.getElementById('class-min').value = '';
    document.getElementById('class-memo').value = '';
    document.getElementById('class-kcal-display').textContent = '-';
    document.getElementById('class-delete-btn').style.display = 'none';
    document.querySelectorAll('.class-type-btn').forEach((b, i) => {
      const isFirst = i === 0;
      b.style.border = isFirst ? '2px solid #0891b2' : '2px solid var(--border)';
      b.style.background = isFirst ? '#e0f7fa' : 'var(--card)';
      b.style.color = isFirst ? '#0891b2' : 'var(--text-sub)';
    });
    document.getElementById('class-type').value = '기구필라테스';
    document.getElementById('class-modal').classList.add('active');
  }

  function closeClassModal() {
    document.getElementById('class-modal').classList.remove('active');
    classEditDate = null;
  }

  function selectClassType(btn, type) {
    document.querySelectorAll('.class-type-btn').forEach(b => {
      b.style.border = '2px solid var(--border)';
      b.style.background = 'var(--card)';
      b.style.color = 'var(--text-sub)';
    });
    btn.style.border = '2px solid #0891b2';
    btn.style.background = '#e0f7fa';
    btn.style.color = '#0891b2';
    document.getElementById('class-type').value = type;
    calcClassKcal();
  }

  function calcClassKcal() {
    const type = document.getElementById('class-type').value;
    const min = parseInt(document.getElementById('class-min').value) || 0;
    const display = document.getElementById('class-kcal-display');
    if (min <= 0) { display.textContent = '-'; return; }
    const met = CLASS_MET[type] || 3.5;
    const weight = 60; // 기본 체중
    const kcal = Math.round(met * weight * (min / 60));
    display.textContent = '약 ' + kcal + 'kcal';
  }

  function saveClassWorkout() {
    const type = document.getElementById('class-type').value;
    const min = parseInt(document.getElementById('class-min').value) || 0;
    if (min <= 0) { alert('수업 시간을 입력해주세요!'); return; }
    const memo = document.getElementById('class-memo').value.trim();
    const userId = localStorage.getItem('current_user');
    const now = new Date();
    const date = classEditDate || (now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate());
    const dateLabel = date.split('-').join('년 ').replace('-', '월 ') + '일';
    const met = CLASS_MET[type] || 3.5;
    const weight = 60;
    const kcal = Math.round(met * weight * (min / 60));
    const record = {
      date, dateLabel, type, min, kcal, memo,
      savedAt: now.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })
    };
    const safeKey = 'class_' + type.replace(/\s+/g,'_') + '_' + userId;
    const existing = JSON.parse(localStorage.getItem(safeKey) || '[]');
    const idx = existing.findIndex(r => r.date === date);
    if (idx !== -1) existing[idx] = record; else existing.unshift(record);
    if (existing.length > 30) existing.pop();
    localStorage.setItem(safeKey, JSON.stringify(existing));

    // classIndex 관리
    const classIndex = JSON.parse(localStorage.getItem('class_index_' + userId) || '[]');
    if (!classIndex.includes(type)) { classIndex.push(type); localStorage.setItem('class_index_' + userId, JSON.stringify(classIndex)); }

    // Firebase 저장
    db.ref('users/' + userId + '/classes/' + type.replace(/\s+/g,'_') + '/' + date).set(record);

    closeClassModal();
    document.getElementById('workout-complete-msg').textContent = type + ' 수업 완료!';
    document.getElementById('workout-summary').innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:center;"><div><div style="font-size:11px;color:#5a6478;margin-bottom:4px;">수업 시간</div><div style="font-size:18px;font-weight:700;color:#0891b2;">${min}분</div></div><div><div style="font-size:11px;color:#5a6478;margin-bottom:4px;">칼로리</div><div style="font-size:18px;font-weight:700;color:#0891b2;">약 ${kcal} kcal</div></div></div>`;
    document.getElementById('workout-complete-overlay').classList.add('active');
    renderCalendar(); if (calSelectedDate) renderDayDetail(calSelectedDate);
  }

  function deleteClassRecord() {
    if (!classEditDate) return;
    const type = document.getElementById('class-type').value;
    const userId = localStorage.getItem('current_user');
    const safeKey = 'class_' + type.replace(/\s+/g,'_') + '_' + userId;
    const existing = JSON.parse(localStorage.getItem(safeKey) || '[]');
    const filtered = existing.filter(r => r.date !== classEditDate);
    localStorage.setItem(safeKey, JSON.stringify(filtered));
    db.ref('users/' + userId + '/classes/' + type.replace(/\s+/g,'_') + '/' + classEditDate).remove();
    closeClassModal();
    renderCalendar(); if (calSelectedDate) renderDayDetail(calSelectedDate);
  }

  function openEditClassModal(type, dateStr) {
    const userId = localStorage.getItem('current_user');
    const safeKey = 'class_' + type.replace(/\s+/g,'_') + '_' + userId;
    const records = JSON.parse(localStorage.getItem(safeKey) || '[]');
    const record = records.find(r => r.date === dateStr);
    if (!record) { alert('기록을 찾을 수 없어요.'); return; }
    classEditDate = dateStr;
    openClassModal();
    setTimeout(() => {
      document.getElementById('class-type').value = type;
      document.getElementById('class-min').value = record.min || '';
      document.getElementById('class-memo').value = record.memo || '';
      calcClassKcal();
      document.querySelectorAll('.class-type-btn').forEach(b => {
        const sel = b.dataset.type === type;
        b.style.border = sel ? '2px solid #0891b2' : '2px solid var(--border)';
        b.style.background = sel ? '#e0f7fa' : 'var(--card)';
        b.style.color = sel ? '#0891b2' : 'var(--text-sub)';
      });
      document.getElementById('class-delete-btn').style.display = 'block';
    }, 100);
  }
  function formatTime(savedAt) { if (!savedAt) return ''; return savedAt.replace('오전 ', '').replace('오후 ', '').trim(); }

  function searchFwExercise(query) {
    const resultEl = document.getElementById('fw-search-results');
    if (!query || query.trim() === '') { resultEl.style.display = 'none'; return; }
    const q = query.trim().toLowerCase();
    const filtered = FW_EXERCISE_LIST.filter(e => e.name.toLowerCase().includes(q));
    if (filtered.length === 0) { resultEl.style.display = 'none'; return; }
    resultEl.style.display = 'block';
    resultEl.innerHTML = filtered.map(e => `<div onclick="selectFwExercise('${e.name}')" style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);" onmouseover="this.style.background='var(--blue-light)'" onmouseout="this.style.background=''"><span style="font-size:14px;color:var(--text);">${e.name}</span><span style="font-size:11px;color:var(--text-hint);background:var(--bg);padding:2px 8px;border-radius:10px;">${e.category}</span></div>`).join('');
  }

  function selectFwExercise(name) { document.getElementById('fw-name').value = name; document.getElementById('fw-search-results').style.display = 'none'; }

  function openFreeweightModal() {
    fwSetCount = 0; document.getElementById('fw-set-list').innerHTML = ''; document.getElementById('fw-name').value = ''; document.getElementById('fw-memo').value = ''; document.getElementById('fw-search-results').style.display = 'none';
    addFwSet(); showScreen('screen-freeweight');
  }

  function closeFreeweightModal() { skipFwRestTimer(); if (isTrainerMode) { isTrainerMode = false; showScreen('screen-trainee-detail'); switchTraineeTab('record'); } else { showScreen('screen-workout-qr'); renderCalendar(); if (calSelectedDate) renderDayDetail(calSelectedDate); } }

  function setFwName(name) { document.getElementById('fw-name').value = name; document.querySelectorAll('.fw-tag').forEach(t => { t.classList.toggle('selected', t.textContent === name); }); }

  function addFwSet() {
    fwSetCount++;
    const list = document.getElementById('fw-set-list');
    const row = document.createElement('div');
    row.id = 'fw-row-' + fwSetCount;
    row.style.cssText = 'display:grid;grid-template-columns:36px 1fr 1fr 36px 36px;gap:4px;margin-bottom:8px;align-items:center;padding-right:2px;';
    row.innerHTML = `<div style="text-align:center;font-size:13px;font-weight:700;color:white;background:#f59e0b;border-radius:8px;height:40px;display:flex;align-items:center;justify-content:center;">${fwSetCount}</div><input type="number" placeholder="0" min="0" max="500" step="2.5" style="width:100%;box-sizing:border-box;padding:9px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-weight:700;text-align:center;color:var(--text);outline:none;font-family:'Noto Sans KR',sans-serif;" id="fw-weight-${fwSetCount}" onfocus="this.style.borderColor='#f59e0b'" onblur="this.style.borderColor='var(--border)'" /><input type="number" placeholder="0" min="0" max="9999" style="width:100%;box-sizing:border-box;padding:9px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-weight:700;text-align:center;color:var(--text);outline:none;font-family:'Noto Sans KR',sans-serif;" id="fw-reps-${fwSetCount}" onfocus="this.style.borderColor='#f59e0b'" onblur="this.style.borderColor='var(--border)'" /><button onclick="addFwSet()" style="width:36px;height:36px;border:none;background:var(--blue-light);color:var(--blue);border-radius:8px;cursor:pointer;font-size:20px;font-weight:700;display:flex;align-items:center;justify-content:center;">+</button><button onclick="removeFwSet(${fwSetCount})" style="width:36px;height:36px;border:none;background:#fee2e2;color:#ef4444;border-radius:8px;cursor:pointer;font-size:16px;display:${fwSetCount === 1 ? 'none' : 'flex'};align-items:center;justify-content:center;">×</button>`;
    list.appendChild(row);
    if (fwSetCount > 1) startRestTimer('fw-rest-timer-box', 'fw-rest-timer-count', 'fw-rest-min', 'fw-rest-sec');
  }

  function removeFwSet(n) { const row = document.getElementById('fw-row-' + n); if (row) row.remove(); }

  function saveFreeweightWorkout() {
    const name = document.getElementById('fw-name').value.trim();
    if (!name) { alert('운동 이름을 입력해주세요!'); return; }
    const sets = [];
    for (let i = 1; i <= fwSetCount; i++) {
      const wEl = document.getElementById('fw-weight-' + i); const rEl = document.getElementById('fw-reps-' + i);
      if (!wEl || !rEl) continue;
      const w = parseFloat(wEl.value) || 0; const r = parseInt(rEl.value) || 0;
      if (w > 0 || r > 0) sets.push({ set: sets.length + 1, weight: w, reps: r });
    }
    if (sets.length === 0) { alert('최소 1세트 이상 입력해주세요!'); return; }
    const userId = isTrainerMode ? trainerTargetId : localStorage.getItem('current_user');
    const memo = document.getElementById('fw-memo').value.trim();
    const now = new Date();
    const date = (isTrainerMode && trainerTargetDate) ? trainerTargetDate : (now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate());
    const dateParts = date.split('-');
    const dateLabel = dateParts[0] + '년 ' + dateParts[1] + '월 ' + dateParts[2] + '일';
    const totalVolFw = sets.reduce((s, r) => s + r.weight * r.reps, 0);
    const kcal = calcKcalByMET(5.0, sets.length * 3, totalVolFw);
    const record = { date, dateLabel, sets, memo, kcal, savedAt: now.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' }) };
    if (isTrainerMode) record.recordedBy = 'trainer';
    const fwFirebaseKey = name.replace(/\s+/g, '_');
    if (!isTrainerMode) {
      const safeKey = 'freeweight_' + name.replace(/\s+/g,'_') + '_' + userId;
      const existing = JSON.parse(localStorage.getItem(safeKey) || '[]');
      const todayIdx = existing.findIndex(r => r.date === record.date);
      if (todayIdx !== -1) existing[todayIdx] = record; else existing.unshift(record);
      if (existing.length > 30) existing.pop();
      localStorage.setItem(safeKey, JSON.stringify(existing));
      const fwIndex = JSON.parse(localStorage.getItem('freeweight_index_' + userId) || '[]');
      if (!fwIndex.includes(name)) { fwIndex.push(name); localStorage.setItem('freeweight_index_' + userId, JSON.stringify(fwIndex)); }
      db.ref('users/' + userId + '/fwIndex').set(JSON.parse(localStorage.getItem('freeweight_index_' + userId) || '[]'));
    }
    db.ref('users/' + userId + '/workouts/fw_' + fwFirebaseKey + '/' + date).set(record);
    const wasTrainerMode = isTrainerMode;
    const savedTraineeId = trainerTargetId;
    const savedDate = trainerTargetDate;
    closeFreeweightModal();
    const maxWeight = Math.max(...sets.map(s => s.weight));
    const totalVol = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    document.getElementById('workout-complete-msg').textContent = name + ' ' + sets.length + '세트 완료!';
    document.getElementById('workout-summary').innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;"><div><div style="font-size:11px;color:#5a6478;margin-bottom:4px;">총 세트</div><div style="font-size:18px;font-weight:700;color:var(--blue);">${sets.length}</div></div><div><div style="font-size:11px;color:#5a6478;margin-bottom:4px;">최고 무게</div><div style="font-size:18px;font-weight:700;color:var(--blue);">${maxWeight > 0 ? maxWeight+'kg' : '-'}</div></div><div><div style="font-size:11px;color:#5a6478;margin-bottom:4px;">총 볼륨</div><div style="font-size:18px;font-weight:700;color:var(--blue);">${totalVol > 0 ? totalVol+'kg' : '-'}</div></div></div>`;
    if (wasTrainerMode) {
      isTrainerMode = true;
      trainerTargetId = savedTraineeId;
      trainerTargetDate = savedDate;
    }
    document.getElementById('workout-complete-overlay').classList.add('active');
    if (!wasTrainerMode) { renderCalendar(); if (calSelectedDate) renderDayDetail(calSelectedDate); }
  }

  let restTimerInterval = null;
  let wakeLock = null;
  let restTimerRemain = 0;
  let restAlarmInterval = null;

  async function requestWakeLock() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
  function releaseWakeLock() { if (wakeLock) { wakeLock.release().then(() => { wakeLock = null; }).catch(() => { wakeLock = null; }); } }

  function startRestTimer(timerBoxId, timerCountId, minInputId, secInputId) {
    const min = parseInt(document.getElementById(minInputId)?.value) || 0;
    const sec = parseInt(document.getElementById(secInputId)?.value) || 0;
    const total = min * 60 + sec;
    if (total <= 0) return;
    if (restTimerInterval) clearInterval(restTimerInterval);
    stopRestAlarm();
    restTimerRemain = total;
    const box = document.getElementById(timerBoxId);
    const countEl = document.getElementById(timerCountId);
    if (!box || !countEl) return;
    box.style.display = 'block';
    updateTimerDisplay(countEl, restTimerRemain);
    requestWakeLock();
    restTimerInterval = setInterval(() => {
      restTimerRemain--;
      updateTimerDisplay(countEl, restTimerRemain);
      if (restTimerRemain <= 0) {
        clearInterval(restTimerInterval); restTimerInterval = null; box.style.display = 'none';
        document.getElementById('timer-done-msg').textContent = '다음 세트 시작하세요!';
        document.getElementById('timer-done-overlay').classList.add('active');
        startRestAlarm();
      }
    }, 1000);
  }

  function startRestAlarm() { stopRestAlarm(); playBeep(); if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 600]); restAlarmInterval = setInterval(() => { playBeep(); if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 600]); }, 2000); }
  function stopRestAlarm() { if (restAlarmInterval) { clearInterval(restAlarmInterval); restAlarmInterval = null; } if (navigator.vibrate) navigator.vibrate(0); }

  function playBeep() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ac.createOscillator(); const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.frequency.value = 880; gain.gain.setValueAtTime(0.5, ac.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
      osc.start(); osc.stop(ac.currentTime + 0.4);
    } catch(e) {}
  }

  function closeTimerDonePopup() { stopRestAlarm(); document.getElementById('timer-done-overlay').classList.remove('active'); }
  function updateTimerDisplay(el, remain) { const m = Math.floor(remain / 60); const s = remain % 60; el.textContent = m + ':' + String(s).padStart(2, '0'); }

  function skipRestTimer() {
    if (restTimerInterval) { clearInterval(restTimerInterval); restTimerInterval = null; }
    stopRestAlarm(); releaseWakeLock();
    ['rest-timer-box', 'inner-rest-timer-box', 'outer-rest-timer-box'].forEach(id => { const box = document.getElementById(id); if (box) box.style.display = 'none'; });
  }

  function skipFwRestTimer() {
    if (restTimerInterval) { clearInterval(restTimerInterval); restTimerInterval = null; }
    stopRestAlarm(); releaseWakeLock();
    const box = document.getElementById('fw-rest-timer-box'); if (box) box.style.display = 'none';
  }
