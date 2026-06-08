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

          // Firebase에 없는 로컬 운동 키 삭제 (강사가 삭제한 기록 반영)
          // ※ freeweight_index / cardio_index 는 제외해야 함 (운동기록 아님)
          const allLocalKeys = Object.keys(localStorage).filter(k =>
            (k.startsWith('workout_') || k.startsWith('freeweight_') || k.startsWith('cardio_')) &&
            k.endsWith('_' + userId) &&
            k !== 'freeweight_index_' + userId &&
            k !== 'cardio_index_' + userId
          );
          allLocalKeys.forEach(k => {
            if (!fbLocalKeys.has(k)) localStorage.removeItem(k);
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
    updateRoutineBanner();
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
      if (isToday)   { bg = 'rgba(124,58,237,0.15)'; textColor = '#7c3aed'; fontW = '700'; }
      if (hasLesson) { bg = '#16a34a'; textColor = 'white'; fontW = '700'; }
      if (isSel)     { border = '2px solid #1a1a2e'; }
      // 점 표시: 강사기록=주황점, 개인운동=파란점
      const dotHtml = hasWork ? `<div style="position:absolute;bottom:1px;left:50%;transform:translateX(-50%);display:flex;gap:2px;align-items:center;">
        ${hasClass ? `<div style="width:4px;height:4px;border-radius:50%;background:#f59e0b;"></div>` : ''}
        ${hasPersonal ? `<div style="width:4px;height:4px;border-radius:50%;background:var(--blue);"></div>` : ''}
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
      const tA = a.record.savedAt || '';
      const tB = b.record.savedAt || '';
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
        const classEmoji = {'기구필라테스':'🌀','에어로빅':'🎶','방송댄스':'🕺','요가':'🌿','매트필라테스':'🧘‍♀️','기능성운동':'⚖️'}[item.name] || '🧘';
        const isClassRecord = record.recordedBy === 'trainer';
        const classBadge = isClassRecord
          ? `<span style="font-size:10px;font-weight:700;color:white;background:#f59e0b;padding:2px 5px;border-radius:4px;">PT</span>`
          : `<span style="font-size:10px;font-weight:700;color:white;background:#1a6fd4;padding:2px 5px;border-radius:4px;">개인</span>`;
        return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:10px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div style="width:36px;height:36px;border-radius:10px;background:#e0f7fa;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${classEmoji}</div><div style="flex:1;"><div style="display:flex;align-items:center;gap:6px;">${classBadge}<span style="font-size:11px;font-weight:700;color:white;background:#0891b2;padding:2px 6px;border-radius:5px;white-space:nowrap;">GX수업</span><span style="font-size:14px;font-weight:700;color:var(--text);">${item.name}</span></div><div style="font-size:12px;color:var(--text-sub);margin-top:2px;">${record.min}분 · 약 ${record.kcal}kcal</div></div></div>${record.memo ? `<div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;gap:8px;"><span style="font-size:14px;">📝</span><div style="font-size:13px;color:var(--text-sub);line-height:1.6;">${record.memo}</div></div>` : ''}<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;"><span style="font-size:12px;color:var(--text-hint);">${formatTime(record.savedAt)}</span>${!isClassRecord ? `<button onclick="openEditClassModal('${item.name}','${dateStr}')" style="background:#e0f7fa;color:#0891b2;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">수정</button>` : ''}</div></div>`;
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
          ? `<span style="font-size:10px;font-weight:700;color:white;background:#f59e0b;padding:2px 5px;border-radius:4px;">PT</span>`
          : `<span style="font-size:10px;font-weight:700;color:white;background:#1a6fd4;padding:2px 5px;border-radius:4px;">개인</span>`;
        return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:10px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div style="width:36px;height:36px;border-radius:10px;background:${color}18;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${eq.emoji}</div><div style="flex:1;"><div style="display:flex;align-items:center;gap:6px;">${badgeHtml}<span style="font-size:11px;font-weight:700;color:white;background:${color};padding:2px 6px;border-radius:5px;white-space:nowrap;">${eq.no}번</span><span style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.subName ? item.subName : eq.name}</span></div><div style="font-size:12px;color:var(--text-sub);margin-top:2px;">${eq.muscles}${maxW > 0 ? ' · 최고 '+maxW+'kg' : ''}</div></div></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;">${record.sets.map(s=>`<div style="background:${color}12;border-radius:8px;padding:8px;text-align:center;"><div style="font-size:11px;color:${color};margin-bottom:2px;font-weight:600;">${s.set}세트</div><div style="font-size:13px;font-weight:700;color:var(--text);">${s.weight > 0 ? s.weight+'kg' : '-'}</div><div style="font-size:11px;color:var(--text-sub);">${s.reps}회</div></div>`).join('')}</div>${record.memo ? `<div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;gap:8px;"><span style="font-size:14px;">📝</span><div style="font-size:13px;color:var(--text-sub);line-height:1.6;">${record.memo}</div></div>` : ''}<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;"><span style="font-size:12px;color:var(--text-hint);">${formatTime(record.savedAt)}</span>${!isClassRecord ? `<button onclick="openEditWorkoutModal('${editKey}','${dateStr}')" style="background:${color}18;color:${color};border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">수정</button>` : ''}</div></div>`;
      } else {
        const fwInfo = FW_EXERCISE_LIST.find(e => e.name === item.name);
        const fwCategory = fwInfo ? fwInfo.category : '프리웨이트';
        const fwMuscles = fwInfo ? fwInfo.muscles : '';
        const isFwClassRecord = record.recordedBy === 'trainer';
        const fwBadgeHtml = isFwClassRecord
          ? `<span style="font-size:10px;font-weight:700;color:white;background:#f59e0b;padding:2px 5px;border-radius:4px;">PT</span>`
          : `<span style="font-size:10px;font-weight:700;color:white;background:#1a6fd4;padding:2px 5px;border-radius:4px;">개인</span>`;
        return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:10px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div style="width:36px;height:36px;border-radius:10px;background:#f59e0b18;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🏋️</div><div style="flex:1;"><div style="display:flex;align-items:center;gap:6px;">${fwBadgeHtml}<span style="font-size:11px;font-weight:700;color:white;background:#d97706;padding:2px 6px;border-radius:5px;white-space:nowrap;">${fwCategory}</span><span style="font-size:14px;font-weight:700;color:var(--text);">${item.name}</span></div><div style="font-size:12px;color:var(--text-sub);margin-top:2px;">${fwMuscles ? fwMuscles + (maxW > 0 ? ' · 최고 '+maxW+'kg' : '') : (maxW > 0 ? '최고 '+maxW+'kg' : '맨몸 운동')}</div></div></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;">${record.sets.map(s=>`<div style="background:#f59e0b12;border-radius:8px;padding:8px;text-align:center;"><div style="font-size:11px;color:#d97706;margin-bottom:2px;font-weight:600;">${s.set}세트</div><div style="font-size:13px;font-weight:700;color:var(--text);">${s.weight > 0 ? s.weight+'kg' : '-'}</div><div style="font-size:11px;color:var(--text-sub);">${s.reps}회</div></div>`).join('')}</div>${record.memo ? `<div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;gap:8px;"><span style="font-size:14px;">📝</span><div style="font-size:13px;color:var(--text-sub);line-height:1.6;">${record.memo}</div></div>` : ''}<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;"><span style="font-size:12px;color:var(--text-hint);">${formatTime(record.savedAt)}</span>${!isFwClassRecord ? `<button onclick="openEditWorkoutModal('freeweight_${item.name.replace(/\s+/g,'_')}_${localStorage.getItem('current_user')}','${dateStr}')" style="background:#f59e0b18;color:#d97706;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">수정</button>` : ''}</div></div>`;
      }
    }).join('');
    detail.innerHTML = `<div style="background:var(--blue);border-radius:var(--radius);padding:16px 18px;margin-bottom:12px;color:white;"><div style="font-size:15px;font-weight:700;margin-bottom:10px;">📅 ${dateLabel} 운동 요약</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;text-align:center;"><div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:8px;"><div style="font-size:16px;font-weight:700;">${dayRecords.length}</div><div style="font-size:10px;opacity:0.8;margin-top:2px;">운동 종류</div></div><div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:8px;"><div style="font-size:16px;font-weight:700;">${totalSets}</div><div style="font-size:10px;opacity:0.8;margin-top:2px;">총 세트</div></div><div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:8px;"><div style="font-size:16px;font-weight:700;">${totalVol}</div><div style="font-size:10px;opacity:0.8;margin-top:2px;">볼륨(kg)</div></div><div style="background:rgba(255,255,255,0.2);border-radius:8px;padding:8px;"><div style="font-size:16px;font-weight:700;">${totalCardioKcal > 0 ? '~'+totalCardioKcal : '-'}</div><div style="font-size:10px;opacity:0.8;margin-top:2px;">GX/유산소Kcal</div></div></div></div>${cardsHtml}`;
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
    const filtered = EQUIPMENT_LIST.filter(eq => eq.name.includes(q) || matchesMuscle(eq.muscles, q) || String(eq.no) === q || (eq.brand||'').includes(q));
    if (filtered.length === 0) { resultEl.style.display = 'block'; resultEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-hint);font-size:14px;">검색 결과가 없어요</div>'; return; }
    resultEl.style.display = 'block';
    resultEl.innerHTML = filtered.map((eq, idx) => {
      const color = getMuscleColor(eq.muscles);
      const records = JSON.parse(localStorage.getItem('workout_' + eq.key + '_' + userId) || '[]');
      const frontRecords = JSON.parse(localStorage.getItem('workout_dual_front_' + eq.key + '_' + userId) || '[]');
      const backRecords = JSON.parse(localStorage.getItem('workout_dual_back_' + eq.key + '_' + userId) || '[]');
      const allRecords = [...records, ...frontRecords, ...backRecords].sort((a, b) => new Date(b.date) - new Date(a.date));
      const last = allRecords[0];
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
    const savedAt = String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
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
      if (innerSets.length === 0 && outerSets.length === 0) { showToast('최소 1세트 이상 입력해주세요!', 'error'); return; }
      _saveDualWorkout(userId, innerSets, outerSets, saveDate); return;
    }
    const sets = [];
    for (let i = 1; i <= setCount; i++) {
      const wEl = document.getElementById('weight-' + i); const rEl = document.getElementById('reps-' + i);
      if (!wEl || !rEl) continue;
      const w = parseFloat(wEl.value) || 0; const r = parseInt(rEl.value) || 0;
      if (w > 0 || r > 0) sets.push({ set: sets.length + 1, weight: w, reps: r });
    }
    if (sets.length === 0) { showToast('최소 1세트 이상 입력해주세요!', 'error'); return; }
    const memo = document.getElementById('workout-memo').value;
    const now = new Date();
    const date = saveDate || (now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate());
    const dateParts = date.split('-');
    const dateLabel = dateParts[0] + '년 ' + dateParts[1] + '월 ' + dateParts[2] + '일';
    const workoutVol = sets.reduce((s, r) => s + r.weight * r.reps, 0);
    const kcal = calcKcalByMET(5.0, sets.length * 3, workoutVol);
    const record = { date, dateLabel, sets, memo, kcal, savedAt: String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0') };
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
    // 강사/매니저는 출석화면 대신 관리탭으로 (어떤 경로로 호출되든 방어)
    const role = localStorage.getItem('role_' + userId) || 'member';
    if (role === 'trainer' || role === 'manager') {
      if (typeof switchTab === 'function') switchTab('trainer');
      return;
    }
    const today = getToday();
    const todayKey = 'attend_' + userId + '_' + today;
    const now = new Date();
    const dateEl = document.getElementById('att-today-date');
    if (dateEl) dateEl.textContent = now.getFullYear() + '. ' + (now.getMonth()+1) + '. ' + now.getDate();
    db.ref('users/' + userId + '/attendance/' + today).once('value', snap => {
      if (snap.exists()) {
        localStorage.setItem(todayKey, 'done');
        // 출석 완료 화면으로 이동
        loadAttendanceStats(userId);
        showScreen('screen-attendance');
        // 완료 영역 표시, QR/GPS 영역 숨김
        const doneWrap = document.getElementById('att-done-wrap');
        const gpsCard  = document.getElementById('att-gps-card');
        const qrCard   = document.querySelector('#screen-attendance .attend-card');
        const todayRow = document.querySelector('#screen-attendance [id="att-today-dot"]')?.closest('div[style*="justify-content:space-between"]');
        if (doneWrap) doneWrap.style.display = 'block';
        if (gpsCard)  gpsCard.style.display  = 'none';
        if (qrCard)   qrCard.style.display   = 'none';
        if (todayRow) todayRow.style.display  = 'none';
        // 완료 시각 표시
        const doneTime = document.getElementById('att-done-time');
        if (doneTime) {
          const n = new Date();
          const h = n.getHours(), m = n.getMinutes();
          const ampm = h < 12 ? '오전' : '오후';
          const hh = h % 12 || 12;
          doneTime.textContent = n.getFullYear() + '년 ' + (n.getMonth()+1) + '월 ' + n.getDate() + '일 ' + ampm + ' ' + hh + ':' + String(m).padStart(2,'0');
        }
        // 누적/이번달 출석 수 동기화
        db.ref('users/' + userId + '/attendance').once('value', aSnap => {
          const monthPrefix = new Date().getFullYear() + '-' + (new Date().getMonth()+1) + '-';
          let total = 0, month = 0;
          aSnap.forEach(c => { total++; if (c.key.startsWith(monthPrefix)) month++; });
          const elT = document.getElementById('att-done-total'); if (elT) elT.textContent = total;
          const elM = document.getElementById('att-done-month'); if (elM) elM.textContent = month;
        });
        // 포인트 설정값 가져와서 표시
        db.ref('point_settings/attend').once('value', ptSnap => {
          const pts = ptSnap.val() ?? 2;
          const elPts  = document.getElementById('att-done-pts');      if (elPts)  elPts.textContent  = '+' + pts + 'P 적립됐어요';
          const elNext = document.getElementById('att-done-next-pts'); if (elNext) elNext.textContent = '+' + pts + 'P';
        });
        return;
      }
      localStorage.removeItem(todayKey);
      loadAttendanceStats(userId);
      resetAttendance();
      showScreen('screen-attendance');
      // 위치 권한 상태 체크 → 거부/미설정이면 안내 팝업 1회 표시
      if (navigator.permissions) {
        navigator.permissions.query({ name: 'geolocation' }).then(result => {
          if (result.state === 'denied' || result.state === 'prompt') {
            const popupKey = 'location_perm_popup_' + userId;
            if (!localStorage.getItem(popupKey)) {
              localStorage.setItem(popupKey, '1');
              setTimeout(() => {
                showToast('위치 권한이 필요해요.\n팝업에서 [정확한 위치]를 선택해주세요!', 'info');
              }, 500);
            }
          }
        });
      }
    });
  }

  function loadAttendanceStats(userId) {
    const now = new Date();
    const monthPrefix = now.getFullYear() + '-' + (now.getMonth()+1) + '-';
    db.ref('users/' + userId + '/attendance').once('value', snap => {
      let total = 0, month = 0;
      snap.forEach(child => { total++; if (child.key.startsWith(monthPrefix)) month++; });
      const elTotal = document.getElementById('att-total'); if (elTotal) elTotal.textContent = total;
      const elMonth = document.getElementById('att-month'); if (elMonth) elMonth.textContent = month;
    });
    // 수업 현황 (총 횟수 / 잔여 횟수)
    db.ref('members/' + userId + '/trainerId').once('value', tSnap => {
      const trainerId = tSnap.val();
      const elPtTotal  = document.getElementById('att-pt-total');
      const elPtRemain = document.getElementById('att-pt-remain');
      if (!trainerId) {
        if (elPtTotal)  elPtTotal.textContent  = '-';
        if (elPtRemain) elPtRemain.textContent = '-';
        return;
      }
      db.ref('trainers/' + trainerId + '/trainees/' + userId).once('value', snap => {
        const d = snap.val();
        if (elPtTotal)  elPtTotal.textContent  = d && d.total  != null ? d.total  : '-';
        if (elPtRemain) elPtRemain.textContent = d && d.remain != null ? d.remain : '-';
      });
    });
    // 포인트는 updateStats()로 통일해서 전체 동기화
    if (typeof updateStats === 'function') updateStats();
    checkGpsStatus();
  }

  function checkGpsStatus() {
    const gpsText = document.getElementById('att-gps-text');
    const gpsDot  = document.getElementById('att-gps-dot');
    const gpsCard = document.getElementById('att-gps-card');
    if (!navigator.geolocation) {
      if (gpsText) gpsText.textContent = '위치 확인 불가';
      if (gpsDot)  gpsDot.style.background = '#ef4444';
      if (gpsCard) { gpsCard.style.background = '#fef2f2'; gpsCard.style.borderColor = '#fca5a5'; }
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const dist = getDistanceMeters(pos.coords.latitude, pos.coords.longitude, GYM_LAT, GYM_LNG);
        const qrBtn = document.getElementById('qr-scan-btn');
        if (dist <= GYM_RADIUS) {
          if (gpsText) gpsText.textContent = '헬스장 위치 확인됨';
          if (gpsDot)  gpsDot.style.background = '#22c55e';
          if (gpsCard) { gpsCard.style.background = '#f0fdf4'; gpsCard.style.borderColor = '#86efac'; }
          if (qrBtn) { qrBtn.disabled = false; qrBtn.style.opacity = '1'; qrBtn.style.cursor = 'pointer'; }
        } else {
          if (gpsText) gpsText.textContent = '헬스장 밖에 있어요 (약 ' + Math.round(dist) + 'm)';
          if (gpsDot)  gpsDot.style.background = '#ef4444';
          if (gpsCard) { gpsCard.style.background = '#fef2f2'; gpsCard.style.borderColor = '#fca5a5'; }
          if (qrBtn) { qrBtn.disabled = true; qrBtn.style.opacity = '0.45'; qrBtn.style.cursor = 'not-allowed'; }
        }
      },
      () => {
        if (gpsText) gpsText.textContent = '위치 권한을 허용해주세요';
        if (gpsDot)  gpsDot.style.background = '#f59e0b';
        if (gpsCard) { gpsCard.style.background = '#fffbeb'; gpsCard.style.borderColor = '#fcd34d'; }
        const qrBtn = document.getElementById('qr-scan-btn');
        if (qrBtn) { qrBtn.disabled = true; qrBtn.style.opacity = '0.45'; qrBtn.style.cursor = 'not-allowed'; }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  function resetAttendance() {
    stopQrCamera();
    document.getElementById('qr-btn-wrap').style.display = 'block';
    document.getElementById('qr-scanner-wrap').style.display = 'none';
    const statusEl = document.getElementById('qr-status-msg');
    if (statusEl) statusEl.textContent = 'QR코드를 네모 안에 맞춰주세요';
    // 완료 영역 숨기고 QR/GPS 영역 복원
    const doneWrap = document.getElementById('att-done-wrap');
    const gpsCard  = document.getElementById('att-gps-card');
    const qrCard   = document.querySelector('#screen-attendance .attend-card');
    const todayRow = document.querySelector('#screen-attendance [id="att-today-dot"]')?.closest('div[style*="justify-content:space-between"]');
    if (doneWrap) doneWrap.style.display  = 'none';
    if (gpsCard)  gpsCard.style.display   = '';
    if (qrCard)   qrCard.style.display    = '';
    if (todayRow) todayRow.style.display  = '';
  }

  function startAttendQr() {
    document.getElementById('qr-btn-wrap').style.display = 'none';
    document.getElementById('qr-scanner-wrap').style.display = 'block';
    startQrCamera();
    setTimeout(() => {
      document.getElementById('qr-scanner-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  function stopAttendQr() {
    stopQrCamera();
    document.getElementById('qr-scanner-wrap').style.display = 'none';
    document.getElementById('qr-btn-wrap').style.display = 'block';
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

  // 헬스장 GPS 좌표 및 허용 반경
  const GYM_LAT = 37.674526;
  const GYM_LNG = 126.786023;
  const GYM_RADIUS = 50; // 미터

  function getDistanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function completeAttendance() {
    if (!navigator.geolocation) {
      showToast('이 기기는 위치 확인을 지원하지 않아요.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const dist = getDistanceMeters(pos.coords.latitude, pos.coords.longitude, GYM_LAT, GYM_LNG);
        if (dist > GYM_RADIUS) {
          showToast('헬스장 근처에서만 출석 가능해요! 🏋️\n(헬스장에서 약 ' + Math.round(dist) + 'm)', 'error');
          return;
        }
        doCompleteAttendance();
      },
      err => {
        if (err.code === 1) {
          showToast('위치 권한을 허용해주세요! 출석 확인에 필요해요.', 'error');
        } else {
          showToast('위치를 확인할 수 없어요. 잠시 후 다시 시도해주세요.', 'error');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  function doCompleteAttendance() {
    const userId = localStorage.getItem('current_user');
    const today = getToday();
    db.ref('users/' + userId + '/attendance/' + today).set(true);
    const todayKey = 'attend_' + userId + '_' + today;
    localStorage.setItem(todayKey, 'done');
    const nick = localStorage.getItem('nickname_' + userId) || localStorage.getItem('name_' + userId) || '회원';
    const now = new Date();
    document.getElementById('attend-complete-msg').textContent = nick + '님, 오늘도 운동 완료! 💪';
    document.getElementById('attend-date-msg').textContent = now.getFullYear() + '년 ' + (now.getMonth()+1) + '월 ' + now.getDate() + '일 출석 완료';
    db.ref('point_settings/attend').once('value', snap => {
      const attendPts = snap.val() ?? 2;
      const pointEl = document.getElementById('attend-point-display');
      if (pointEl) pointEl.textContent = '+' + attendPts + 'P';
      document.getElementById('attend-complete-overlay').classList.add('active');
      if (typeof addPointWithHistory === 'function') addPointWithHistory(userId, attendPts, '출석');
      else db.ref('users/' + userId + '/points').transaction(cur => (cur || 0) + attendPts).then(() => updateStats());
    });
  }

  function closeAttendComplete() { document.getElementById('attend-complete-overlay').classList.remove('active'); resetAttendance(); switchTab('home'); }

  // ══════════════════════════════
  // 오운완
  // ══════════════════════════════
  function openOwunwan() {
    const userId = localStorage.getItem('current_user');
    if (!userId) { showToast('로그인이 필요해요.', 'error'); return; }
    const today = getToday();

    // 오늘 날짜 선택 여부 확인
    const now = new Date();
    const isToday = calSelectedDate === now.getDate()
      && calYear === now.getFullYear()
      && calMonth === now.getMonth();
    if (!isToday) {
      showToast('오늘 날짜를 선택 후 올리기 버튼을 눌러주세요 📅', 'info');
      return;
    }

    // 오늘 운동기록 확인
    const todayRecords = getTodayAllRecords(userId, today);
    if (todayRecords.length === 0) {
      showToast('오늘 운동기록이 없어요!\n운동을 기록한 후 올려주세요 💪', 'error');
      return;
    }

    // 오늘 이미 오운완 올렸는지 확인
    db.ref('users/' + userId + '/owunwan/' + today).once('value', snap => {
      if (snap.exists()) {
        showToast('오늘은 이미 오운완을 올렸어요! 내일 또 만나요 😊', 'info');
        return;
      }
      // 모달 초기화 후 열기
      document.getElementById('owunwan-camera-btn-wrap').style.display = 'block';
      document.getElementById('owunwan-preview-wrap').style.display = 'none';
      document.getElementById('owunwan-comment').value = '';
      document.getElementById('owunwan-photo-input').value = '';
      const canvas = document.getElementById('owunwan-canvas');
      canvas.width = 0; canvas.height = 0;
      const btn = document.getElementById('owunwan-submit-btn');
      btn.textContent = '오운완 올리기 🔥'; btn.disabled = false;

      // 운동기록 요약 표시
      const summaryWrap = document.getElementById('owunwan-record-summary');
      const listEl = document.getElementById('owunwan-record-list');
      summaryWrap.style.display = 'block';
      listEl.innerHTML = todayRecords.map(r => {
        const badge = r.type === 'cardio'
          ? '<span style="background:#fef2f2;color:#b91c1c;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;margin-right:6px;white-space:nowrap;flex-shrink:0;">유산소</span>'
          : r.type === 'class'
          ? '<span style="background:#e0f7fa;color:#0891b2;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;margin-right:6px;white-space:nowrap;flex-shrink:0;">GX수업</span>'
          : '<span style="background:#ede9fe;color:#7c3aed;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;margin-right:6px;white-space:nowrap;flex-shrink:0;">웨이트</span>';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:0.5px solid var(--border);gap:6px;">
          <div style="display:flex;align-items:center;min-width:0;flex:1;">${badge}<span style="font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.name}</span></div>
          <span style="font-size:12px;color:var(--text-hint);white-space:nowrap;flex-shrink:0;">${r.summary}</span>
        </div>`;
      }).join('');

      document.getElementById('owunwan-modal').style.display = 'block';
    });
  }

  function getTodayAllRecords(userId, today) {
    const records = [];
    // 기구 웨이트
    for (const eq of EQUIPMENT_LIST) {
      if (isDualEquipment(eq.key)) {
        const dNames = getDualNames(eq.key) || { front:'전면', back:'후면' };
        [['dual_front', dNames.front], ['dual_back', dNames.back]].forEach(([suffix, subName]) => {
          const r = JSON.parse(localStorage.getItem('workout_' + suffix + '_' + eq.key + '_' + userId) || '[]').find(r => r.date === today);
          if (r) {
            const n = r.sets?.length || 0;
            const maxW = r.sets ? Math.max(...r.sets.map(s => s.weight||0)) : 0;
            const rep = r.sets?.[0]?.reps || 0;
            records.push({ type:'equipment', name: subName, summary: n + '세트 · ' + (maxW>0?maxW+'kg':'자체중량') + ' · ' + rep + '회' });
          }
        });
      } else {
        const r = JSON.parse(localStorage.getItem('workout_' + eq.key + '_' + userId) || '[]').find(r => r.date === today);
        if (r) {
          const n = r.sets?.length || 0;
          const maxW = r.sets ? Math.max(...r.sets.map(s => s.weight||0)) : 0;
          const rep = r.sets?.[0]?.reps || 0;
          records.push({ type:'equipment', name: eq.name, summary: n + '세트 · ' + (maxW>0?maxW+'kg':'자체중량') + ' · ' + rep + '회' });
        }
      }
    }
    // 프리웨이트
    const fwIndex = JSON.parse(localStorage.getItem('freeweight_index_' + userId) || '[]');
    for (const name of fwIndex) {
      const r = JSON.parse(localStorage.getItem('freeweight_' + name.replace(/\s+/g,'_') + '_' + userId) || '[]').find(r => r.date === today);
      if (r) {
        const n = r.sets?.length || 0;
        const maxW = r.sets ? Math.max(...r.sets.map(s => s.weight||0)) : 0;
        const rep = r.sets?.[0]?.reps || 0;
        records.push({ type:'freeweight', name, summary: n + '세트 · ' + (maxW>0?maxW+'kg':'자체중량') + ' · ' + rep + '회' });
      }
    }
    // 유산소
    const cardioIndex = JSON.parse(localStorage.getItem('cardio_index_' + userId) || '[]');
    for (const ctype of cardioIndex) {
      const r = JSON.parse(localStorage.getItem('cardio_' + ctype + '_' + userId) || '[]').find(r => r.date === today);
      if (r) records.push({ type:'cardio', name: ctype, summary: (r.min||0) + '분' + (r.dist > 0 ? ' · ' + r.dist + 'km' : '') + ' · 약 ' + (r.kcal||0) + 'kcal' });
    }
    // 수업
    const classIndex = JSON.parse(localStorage.getItem('class_index_' + userId) || '[]');
    for (const ctype of classIndex) {
      const r = JSON.parse(localStorage.getItem('class_' + ctype.replace(/\s+/g,'_') + '_' + userId) || '[]').find(r => r.date === today);
      if (r) records.push({ type:'class', name: ctype, summary: (r.min||0) + '분 · 약 ' + (r.kcal||0) + 'kcal' });
    }
    return records;
  }

  function captureOwunwanPhoto() {
    document.getElementById('owunwan-photo-input').click();
  }

  function handleOwunwanPhoto(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const userId = localStorage.getItem('current_user');
        const today = getToday();
        const records = getTodayAllRecords(userId, today);
        composeOwunwanCanvas(img, records);
        document.getElementById('owunwan-camera-btn-wrap').style.display = 'none';
        document.getElementById('owunwan-preview-wrap').style.display = 'block';
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function composeOwunwanCanvas(img, records) {
    const canvas = document.getElementById('owunwan-canvas');
    // 3:4 비율
    const W = 1080, H = 1440;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 사진 그리기
    const scale = Math.max(W/img.width, H/img.height);
    const sw = img.width * scale, sh = img.height * scale;
    ctx.drawImage(img, (W-sw)/2, (H-sh)/2, sw, sh);

    // 상단 그라디언트
    const topGrad = ctx.createLinearGradient(0,0,0,260);
    topGrad.addColorStop(0,'rgba(0,0,0,0.55)');
    topGrad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = topGrad; ctx.fillRect(0,0,W,260);

    // 하단 그라디언트
    const lineH = 66, totalH = records.length * lineH + 100;
    const gradStart = H - totalH - 60;
    const botGrad = ctx.createLinearGradient(0, gradStart, 0, H);
    botGrad.addColorStop(0,'rgba(0,0,0,0)');
    botGrad.addColorStop(1,'rgba(0,0,0,0.88)');
    ctx.fillStyle = botGrad; ctx.fillRect(0, gradStart, W, H - gradStart);

    // 날짜 + 시간
    const now = new Date();
    ctx.font = '500 32px "Noto Sans KR", sans-serif';
    ctx.fillStyle = '#FFD600';
    ctx.fillText(now.getFullYear() + '. ' + (now.getMonth()+1) + '. ' + now.getDate() + '.', 52, 65);
    ctx.font = '700 72px "Noto Sans KR", sans-serif';
    const hh = String(now.getHours()).padStart(2,'0');
    const mm2 = String(now.getMinutes()).padStart(2,'0');
    ctx.fillText(hh + ':' + mm2, 52, 148);

    // 워터마크
    ctx.font = '400 30px "Noto Sans KR", sans-serif';
    ctx.fillStyle = 'rgba(200,200,200,0.9)';
    const wm = '풍산휘트니스@기구필라테스';
    const wmW = ctx.measureText(wm).width;
    const wmY = H - records.length * lineH - 58;
    ctx.fillText(wm, (W - wmW) / 2, wmY);

    // 운동기록 목록
    let y = H - records.length * lineH - 20;
    records.forEach((rec, i) => {
      if (i > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(52, y-10); ctx.lineTo(W-52, y-10); ctx.stroke();
      }
      // 배지
      const badgeColor = rec.type === 'cardio' ? '#ef4444' : rec.type === 'class' ? '#0891b2' : '#7c3aed';
      const badgeLabel = rec.type === 'cardio' ? '유산소' : rec.type === 'class' ? 'GX수업' : '웨이트';
      ctx.font = '700 26px "Noto Sans KR", sans-serif';
      const bw = ctx.measureText(badgeLabel).width + 24;
      ctx.fillStyle = badgeColor;
      roundRect(ctx, 52, y+2, bw, 36, 8);
      ctx.fillStyle = '#fff';
      ctx.fillText(badgeLabel, 64, y+27);

      // 종목명
      ctx.font = '700 42px "Noto Sans KR", sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(rec.name, 52 + bw + 12, y+36);

      // 요약 (오른쪽 정렬)
      ctx.font = '400 36px "Noto Sans KR", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      const sw2 = ctx.measureText(rec.summary).width;
      ctx.fillText(rec.summary, W - 52 - sw2, y+36);

      y += lineH;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y); ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
    ctx.lineTo(x+r, y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
    ctx.lineTo(x, y+r); ctx.arcTo(x,y,x+r,y,r);
    ctx.closePath(); ctx.fill();
  }

  function saveOwunwanToGallery() {
    const canvas = document.getElementById('owunwan-canvas');
    if (!canvas || canvas.width === 0) {
      showToast('먼저 사진을 촬영해주세요 📷', 'error'); return;
    }
    const link = document.createElement('a');
    link.download = '오운완_' + getToday() + '.jpg';
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
    showToast('갤러리에 저장됐어요! 📥\nSNS에 자유롭게 공유해보세요 💪', 'success');
  }

  function openOwunwanNoticePopup() {
    const canvas = document.getElementById('owunwan-canvas');
    if (!canvas || canvas.width === 0) { showToast('사진을 먼저 촬영해주세요!', 'error'); return; }
    const modal = document.getElementById('owunwan-notice-modal');
    modal.style.display = 'flex';
  }

  function closeOwunwanNoticePopup() {
    const modal = document.getElementById('owunwan-notice-modal');
    modal.style.display = 'none';
  }

  async function submitOwunwan() {
    const userId = localStorage.getItem('current_user');
    const today = getToday();
    const canvas = document.getElementById('owunwan-canvas');
    const btn = document.getElementById('owunwan-submit-btn');

    if (canvas.width === 0) { showToast('사진을 먼저 촬영해주세요!', 'error'); return; }

    btn.textContent = '업로드 중...'; btn.disabled = true;

    try {
      // Canvas → Blob (최대 1200px 압축)
      const compressedCanvas = document.createElement('canvas');
      const MAX_SIZE = 1200;
      let cw = canvas.width, ch = canvas.height;
      if (cw > MAX_SIZE || ch > MAX_SIZE) {
        if (cw > ch) { ch = Math.round(ch * MAX_SIZE / cw); cw = MAX_SIZE; }
        else { cw = Math.round(cw * MAX_SIZE / ch); ch = MAX_SIZE; }
      }
      compressedCanvas.width = cw;
      compressedCanvas.height = ch;
      compressedCanvas.getContext('2d').drawImage(canvas, 0, 0, cw, ch);
      const blob = await new Promise(res => compressedCanvas.toBlob(res, 'image/jpeg', 0.82));
      const ref = storage.ref('posts/owunwan_' + Date.now() + '_' + userId + '.jpg');
      const snapshot = await ref.put(blob);
      const photoURL = await snapshot.ref.getDownloadURL();

      const nickname = localStorage.getItem('nickname_' + userId) || localStorage.getItem('name_' + userId) || '회원';
      const comment = document.getElementById('owunwan-comment').value.trim();
      const now = new Date();
      const dateLabel = now.getFullYear() + '년 ' + (now.getMonth()+1) + '월 ' + now.getDate() + '일';

      const postData = {
        authorId: userId, nickname,
        category: '오운완',
        content: comment || dateLabel + ' 오운완 완료! 💪',
        photoURL,
        createdAt: Date.now(),
        commentCount: 0,
        owunwanDate: today
      };

      await db.ref('posts').push(postData);

      // 오운완 기록 저장 + 포인트 지급 (Firebase 설정값 기준)
      await db.ref('users/' + userId + '/owunwan/' + today).set(true);
      const ptSnap = await db.ref('point_settings/owunwan').once('value');
      const owunwanPts = ptSnap.val() ?? 10;
      if (typeof addPointWithHistory === 'function') addPointWithHistory(userId, owunwanPts, '오운완');
      else await db.ref('users/' + userId + '/points').transaction(cur => (cur || 0) + owunwanPts).then(() => updateStats());

      closeOwunwanModal();
      showToast('오운완 게시물이 올라갔어요! 🔥\n+' + owunwanPts + 'P 포인트가 적립됐어요!', 'success');
      switchTab('community');

    } catch(e) {
      console.error('오운완 업로드 실패:', e);
      showToast('업로드에 실패했어요.', 'error');
      btn.textContent = '오운완 올리기 🔥'; btn.disabled = false;
    }
  }

  function closeOwunwanModal() {
    document.getElementById('owunwan-modal').style.display = 'none';
    document.getElementById('owunwan-photo-input').value = '';
    const canvas = document.getElementById('owunwan-canvas');
    canvas.width = 0; canvas.height = 0;
  }
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
    // 항상 Firebase에서 읽어 모든 포인트 표시 동기화
    db.ref('users/' + userId + '/points').once('value', snap => {
      const pts = snap.val() || 0;
      const elHome = document.getElementById('stat-points'); if (elHome) elHome.textContent = pts;
      const elInfo = document.getElementById('myinfo-points'); if (elInfo) elInfo.textContent = pts;
      const elAtt  = document.getElementById('att-points');   if (elAtt)  elAtt.textContent = pts.toLocaleString();
      localStorage.setItem('points_' + userId, String(pts));
    });
  }

  function togglePw() {
    const inp = document.getElementById('login-pw'); const icon = document.getElementById('eye-icon');
    if (inp.type === 'password') { inp.type = 'text'; icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'; }
    else { inp.type = 'password'; icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'; }
  }

  const CARDIO_CONFIG = { '런닝머신': { distLabel:'📍 거리', distUnit:'km' }, '스텝밀': { distLabel:'📍 거리', distUnit:'km' }, '사이클': { distLabel:'📍 거리', distUnit:'km' }, '마이마운틴': { distLabel:'📍 거리', distUnit:'km' } };

  function calcCardioKcalValue(type, min, dist, weight, incline) {
    if (min <= 0) return 0;
    const h = min / 60;
    incline = incline || 0;
    if (type === '런닝머신') {
      // 기본 칼로리 (거리 기반 or 시간 기반)
      const base = dist > 0 ? dist * weight * 1.036 : 8.0 * weight * h;
      // 경사도 보정: 1%당 3% 칼로리 증가
      return base * (1 + incline * 0.03);
    } else if (type === '스텝밀') {
      if (dist > 0) { const speed = dist / h; const met = Math.max(5.0, Math.min(12.0, 8.8 * speed / 6.0)); return met * weight * h; }
      return 8.8 * weight * h;
    } else if (type === '사이클') {
      return dist > 0 ? dist * weight * 0.45 : 7.0 * weight * h;
    } else if (type === '마이마운틴') {
      // 런닝머신과 동일한 공식 (발판 길이만 다른 동일 기구)
      const base = dist > 0 ? dist * weight * 1.036 : 8.0 * weight * h;
      // 경사도 보정: 1%당 3% 칼로리 증가
      return base * (1 + incline * 0.03);
    }
    return 7.0 * weight * h;
  }

  function calcCardioKcal() {
    const type = document.getElementById('cardio-type').value;
    const min  = parseFloat(document.getElementById('cardio-min').value)  || 0;
    const dist = parseFloat(document.getElementById('cardio-dist').value) || 0;
    const incline = parseFloat(document.getElementById('cardio-incline')?.value) || 0;
    const { weight } = getBodyInfo();
    const kcal = calcCardioKcalValue(type, min, dist, weight, incline);
    const el = document.getElementById('cardio-kcal-display');
    if (el) el.textContent = (min === 0) ? '-' : '약 ' + Math.round(kcal) + ' kcal';
  }

  let cardioEditDate = null;

  function openEditCardioModal(type, dateStr) {
    const userId = localStorage.getItem('current_user');
    const safeKey = 'cardio_' + type + '_' + userId;
    const records = JSON.parse(localStorage.getItem(safeKey) || '[]');
    const record = records.find(r => r.date === dateStr);
    if (!record) { showToast('기록을 찾을 수 없어요.', 'error'); return; }
    cardioEditDate = dateStr;
    openCardioModal();
    setTimeout(() => {
      document.getElementById('cardio-type').value = type;
      document.getElementById('cardio-min').value = record.min || '';
      document.getElementById('cardio-dist').value = record.dist || '';
      const inclineEl = document.getElementById('cardio-incline');
      if (inclineEl) inclineEl.value = record.incline || '';
      document.getElementById('cardio-memo').value = record.memo || '';
      document.querySelectorAll('.cardio-type-btn').forEach(b => { const isSelected = b.dataset.type === type; b.style.border = isSelected ? '2px solid #ef4444' : '2px solid var(--border)'; b.style.background = isSelected ? '#fee2e2' : 'var(--card)'; b.style.color = isSelected ? '#ef4444' : 'var(--text-sub)'; });
      updateCardioLabels(type); calcCardioKcal();
      const saveBtn = document.querySelector('#cardio-modal .btn-primary'); if (saveBtn) saveBtn.textContent = '💾 유산소 기록 수정';
      const deleteBtn = document.getElementById('cardio-delete-btn'); if (deleteBtn) deleteBtn.style.display = 'block';
    }, 50);
  }

  function openCardioModal() {
    document.getElementById('cardio-type').value = '런닝머신';
    document.getElementById('cardio-min').value = ''; document.getElementById('cardio-dist').value = '';
    const inclineEl = document.getElementById('cardio-incline'); if (inclineEl) inclineEl.value = '';
    document.getElementById('cardio-memo').value = '';
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
    // 경사도: 런닝머신/마이마운틴만 표시
    const inclineWrap = document.getElementById('cardio-incline-wrap');
    if (inclineWrap) {
      const show = (type === '런닝머신' || type === '마이마운틴');
      inclineWrap.style.display = show ? 'block' : 'none';
      const inclineEl = document.getElementById('cardio-incline');
      if (inclineEl) {
        if (!show) inclineEl.value = '';
        // 런닝머신 최대 15%, 마이마운틴 최대 40%
        inclineEl.max = type === '마이마운틴' ? '40' : '15';
        const hint = inclineWrap.querySelector('div');
        if (hint) hint.textContent = type === '마이마운틴' ? '% (최대 40)' : '% (최대 15)';
      }
    }
    calcCardioKcal();
  }

  function deleteCardioRecord() {
    showConfirm('이 유산소 기록을 삭제할까요?', () => {
      const userId = localStorage.getItem('current_user');
      const type = document.getElementById('cardio-type').value;
      const key = 'cardio_' + type + '_' + userId;
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      const filtered = records.filter(r => r.date !== cardioEditDate);
      localStorage.setItem(key, JSON.stringify(filtered));
      closeCardioModal(); renderCalendar(); if (calSelectedDate) renderDayDetail(calSelectedDate);
      showToast('삭제됐어요! 🗑', 'success');
    });
  }

  function saveCardioWorkout() {
    const type = document.getElementById('cardio-type').value;
    const min  = parseInt(document.getElementById('cardio-min').value) || 0;
    const dist = parseFloat(document.getElementById('cardio-dist').value) || 0;
    const incline = parseFloat(document.getElementById('cardio-incline')?.value) || 0;
    const memo = document.getElementById('cardio-memo').value.trim();
    if (min === 0) { showToast('운동 시간을 입력해주세요!', 'error'); return; }
    const kcalEl = document.getElementById('cardio-kcal-display');
    const kcal = parseInt((kcalEl ? kcalEl.textContent : '-').replace(/[^0-9]/g, '')) || 0;
    const userId = localStorage.getItem('current_user');
    const now = new Date();
    const cfg = CARDIO_CONFIG[type];
    const isEdit = !!cardioEditDate;
    const recordDate = isEdit ? cardioEditDate : (now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate());
    const dateLabel = (() => { const parts = recordDate.split('-'); return parts[0] + '년 ' + parseInt(parts[1]) + '월 ' + parseInt(parts[2]) + '일'; })();
    const record = { date: recordDate, dateLabel, type, min, sec: 0, dist, incline, kcal, distUnit: cfg.distUnit, memo, savedAt: String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0') };
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
  // MET 기준 GX/수업 칼로리 (국제 표준값)
  const CLASS_MET = {
    '기구필라테스': 3.5, '에어로빅': 6.5, '방송댄스': 5.5,
    '요가': 2.5, '매트필라테스': 3.0, '기능성운동': 4.5
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
    calcClassKcal();
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
    const { weight } = getBodyInfo();
    const kcal = Math.round(met * weight * (min / 60));
    display.textContent = '약 ' + kcal + 'kcal';
  }

  function saveClassWorkout() {
    const type = document.getElementById('class-type').value;
    const min = parseInt(document.getElementById('class-min').value) || 0;
    if (min <= 0) { showToast('수업 시간을 입력해주세요!', 'error'); return; }
    const memo = document.getElementById('class-memo').value.trim();
    const userId = localStorage.getItem('current_user');
    const now = new Date();
    const date = classEditDate || (now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate());
    const dateLabel = date.split('-').join('년 ').replace('-', '월 ') + '일';
    const met = CLASS_MET[type] || 3.5;
    const { weight } = getBodyInfo();
    const kcal = Math.round(met * weight * (min / 60));
    const record = {
      date, dateLabel, type, min, kcal, memo,
      savedAt: String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')
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
    showConfirm('이 수업 기록을 삭제할까요?', () => {
      const type = document.getElementById('class-type').value;
      const userId = localStorage.getItem('current_user');
      const safeKey = 'class_' + type.replace(/\s+/g,'_') + '_' + userId;
    });
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
    if (!record) { showToast('기록을 찾을 수 없어요.', 'error'); return; }
    classEditDate = dateStr;
    // 초기화 없이 바로 값 세팅 후 모달 열기
    document.getElementById('class-type').value = type;
    document.getElementById('class-min').value = record.min || '';
    document.getElementById('class-memo').value = record.memo || '';
    document.getElementById('class-kcal-display').textContent = '-';
    document.getElementById('class-delete-btn').style.display = 'block';
    document.querySelectorAll('.class-type-btn').forEach(b => {
      const sel = b.dataset.type === type;
      b.style.border = sel ? '2px solid #0891b2' : '2px solid var(--border)';
      b.style.background = sel ? '#e0f7fa' : 'var(--card)';
      b.style.color = sel ? '#0891b2' : 'var(--text-sub)';
    });
    calcClassKcal();
    document.getElementById('class-modal').classList.add('active');
  }
  function formatTime(savedAt) { if (!savedAt) return ''; return savedAt; }

  function selectFwCategory(cat) {
    const active = document.getElementById('fwcat-' + cat);
    const isActive = active && active.dataset.active === 'true';
    ['하체','가슴','등','어깨','팔','코어'].forEach(c => {
      const btn = document.getElementById('fwcat-' + c);
      if (!btn) return;
      btn.style.background = 'var(--bg)';
      btn.style.color = 'var(--text-sub)';
      btn.style.borderColor = 'var(--border)';
      btn.dataset.active = 'false';
    });
    const resultEl = document.getElementById('fw-search-results');
    if (isActive) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; return; }
    if (active) {
      active.style.background = '#1a6fd4';
      active.style.color = 'white';
      active.style.borderColor = '#1a6fd4';
      active.dataset.active = 'true';
    }
    // 검색창 초기화
    const input = document.getElementById('fw-name');
    if (input) input.value = '';
    // 해당 부위 프리웨이트 목록 표시
    const fwCats = { '하체':'하체', '가슴':'가슴', '등':'등', '어깨':'어깨', '팔':'팔', '코어':'코어복부' };
    const catKey = fwCats[cat] || cat;
    const items = FW_EXERCISE_LIST.filter(e => e.category === catKey || e.muscles === cat || matchesMuscle(e.muscles, cat));
    if (items.length === 0) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = '<div style="padding:12px 14px;font-size:13px;color:var(--text-hint);">운동이 없어요</div>';
      return;
    }
    resultEl.style.display = 'block';
    resultEl.innerHTML = items.map(e =>
      `<div onclick="selectFwExercise('${e.name}')" style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);" onmouseover="this.style.background='var(--blue-light)'" onmouseout="this.style.background=''"><span style="font-size:14px;color:var(--text);">${e.name}</span><span style="font-size:11px;color:var(--text-hint);background:var(--bg);padding:2px 8px;border-radius:10px;">${e.category}</span></div>`
    ).join('');
  }

  function searchFwExercise(query) {
    const resultEl = document.getElementById('fw-search-results');
    // 검색 시 카테고리 탭 비활성화
    ['하체','가슴','등','어깨','팔','코어'].forEach(c => {
      const btn = document.getElementById('fwcat-' + c);
      if (!btn) return;
      btn.style.background = 'var(--bg)';
      btn.style.color = 'var(--text-sub)';
      btn.style.borderColor = 'var(--border)';
      btn.dataset.active = 'false';
    });
    if (!query || query.trim() === '') { resultEl.style.display = 'none'; return; }
    const q = query.trim().toLowerCase();
    const filtered = FW_EXERCISE_LIST.filter(e => e.name.toLowerCase().includes(q) || e.muscles.toLowerCase().includes(q) || e.category.toLowerCase().includes(q));
    if (filtered.length === 0) { resultEl.style.display = 'none'; return; }
    resultEl.style.display = 'block';
    resultEl.innerHTML = filtered.map(e => `<div onclick="selectFwExercise('${e.name}')" style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);" onmouseover="this.style.background='var(--blue-light)'" onmouseout="this.style.background=''"><span style="font-size:14px;color:var(--text);">${e.name}</span><span style="font-size:11px;color:var(--text-hint);background:var(--bg);padding:2px 8px;border-radius:10px;">${e.category}</span></div>`).join('');
  }

  function selectFwExercise(name) {
    document.getElementById('fw-name').value = name;
    document.getElementById('fw-search-results').style.display = 'none';
    // 카테고리 탭 초기화
    ['하체','가슴','등','어깨','팔','코어'].forEach(c => {
      const btn = document.getElementById('fwcat-' + c);
      if (!btn) return;
      btn.style.background = 'var(--bg)';
      btn.style.color = 'var(--text-sub)';
      btn.style.borderColor = 'var(--border)';
      btn.dataset.active = 'false';
    });
    loadFwPrevRecords(name);
  }

  function loadFwPrevRecords(name) {
    const userId = localStorage.getItem('current_user');
    const container = document.getElementById('fw-prev-records');
    if (!container) return;
    const safeKey = 'freeweight_' + name.replace(/\s+/g,'_') + '_' + userId;
    const records = JSON.parse(localStorage.getItem(safeKey) || '[]');
    if (records.length === 0) { container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:14px;">아직 기록이 없어요.<br/>첫 번째 기록을 남겨보세요! 💪</div>'; return; }
    container.innerHTML = records.map(r => `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:10px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><div style="font-size:14px;font-weight:700;color:var(--text);">${r.dateLabel}</div><div style="display:flex;align-items:center;gap:8px;"><div style="font-size:12px;color:var(--text-hint);">${r.savedAt||''}</div><button onclick="openEditWorkoutModal('${safeKey}','${r.date}')" style="background:#f59e0b18;color:#d97706;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">수정</button></div></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:${r.memo ? '10px' : '0'};">${r.sets.map(s => `<div style="background:#f59e0b18;border-radius:8px;padding:8px;text-align:center;"><div style="font-size:11px;color:#d97706;margin-bottom:2px;">${s.set}세트</div><div style="font-size:14px;font-weight:700;color:var(--text);">${s.weight > 0 ? s.weight+'kg' : '-'} × ${s.reps}회</div></div>`).join('')}</div>${r.memo ? `<div style="font-size:13px;color:var(--text-sub);background:var(--bg);border-radius:8px;padding:8px 10px;">📝 ${r.memo}</div>` : ''}</div>`).join('');
  }
  function openFreeweightModal() {
    fwSetCount = 0;
    document.getElementById('fw-set-list').innerHTML = '';
    document.getElementById('fw-name').value = '';
    document.getElementById('fw-memo').value = '';
    document.getElementById('fw-search-results').style.display = 'none';
    // 카테고리 탭 초기화
    ['하체','가슴','등','어깨','팔','코어'].forEach(c => {
      const btn = document.getElementById('fwcat-' + c);
      if (!btn) return;
      btn.style.background = 'var(--bg)';
      btn.style.color = 'var(--text-sub)';
      btn.style.borderColor = 'var(--border)';
      btn.dataset.active = 'false';
    });
    addFwSet(); showScreen('screen-freeweight');
  }

  function closeFreeweightModal() { skipFwRestTimer(); if (isTrainerMode) { isTrainerMode = false; showScreen('screen-trainee-detail'); switchTraineeTab('record'); } else { showScreen('screen-workout-qr'); renderCalendar(); if (calSelectedDate) renderDayDetail(calSelectedDate); } }

  function setFwName(name) { document.getElementById('fw-name').value = name; document.querySelectorAll('.fw-tag').forEach(t => { t.classList.toggle('selected', t.textContent === name); }); loadFwPrevRecords(name); }

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
    if (!name) { showToast('운동 이름을 입력해주세요!', 'error'); return; }
    const sets = [];
    for (let i = 1; i <= fwSetCount; i++) {
      const wEl = document.getElementById('fw-weight-' + i); const rEl = document.getElementById('fw-reps-' + i);
      if (!wEl || !rEl) continue;
      const w = parseFloat(wEl.value) || 0; const r = parseInt(rEl.value) || 0;
      if (w > 0 || r > 0) sets.push({ set: sets.length + 1, weight: w, reps: r });
    }
    if (sets.length === 0) { showToast('최소 1세트 이상 입력해주세요!', 'error'); return; }
    const userId = isTrainerMode ? trainerTargetId : localStorage.getItem('current_user');
    const memo = document.getElementById('fw-memo').value.trim();
    const now = new Date();
    const date = (isTrainerMode && trainerTargetDate) ? trainerTargetDate : (now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate());
    const dateParts = date.split('-');
    const dateLabel = dateParts[0] + '년 ' + dateParts[1] + '월 ' + dateParts[2] + '일';
    const totalVolFw = sets.reduce((s, r) => s + r.weight * r.reps, 0);
    const kcal = calcKcalByMET(5.0, sets.length * 3, totalVolFw);
    const record = { date, dateLabel, sets, memo, kcal, savedAt: String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0') };
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
    } else {
      // 강사 모드: 회원의 Firebase fwIndex도 업데이트
      db.ref('users/' + userId + '/fwIndex').once('value', snap => {
        const fbFwIndex = snap.val() || [];
        if (!fbFwIndex.includes(name)) {
          fbFwIndex.push(name);
          db.ref('users/' + userId + '/fwIndex').set(fbFwIndex);
        }
      });
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

  // AudioContext 싱글톤 (iOS 반복 재생을 위해 한 번만 생성)
  let _audioCtx = null;
  function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
  }

  // 타이머 완료 팝업 깜빡임 효과 (iOS 진동 대체 + 갤럭시 추가 피드백)
  function flashTimerPopup() {
    const overlay = document.getElementById('timer-done-overlay');
    if (!overlay) return;
    overlay.style.transition = 'opacity 0.1s';
    overlay.style.opacity = '0.3';
    setTimeout(() => { overlay.style.opacity = '1'; }, 150);
  }

  function startRestAlarm() {
    stopRestAlarm();
    playBeep();
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 600]);
    flashTimerPopup();
    restAlarmInterval = setInterval(() => {
      playBeep();
      if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 600]);
      flashTimerPopup();
    }, 2000);
  }

  function stopRestAlarm() {
    if (restAlarmInterval) { clearInterval(restAlarmInterval); restAlarmInterval = null; }
    if (navigator.vibrate) navigator.vibrate(0);
    const overlay = document.getElementById('timer-done-overlay');
    if (overlay) { overlay.style.opacity = '1'; overlay.style.transition = ''; }
  }

  function playBeep() {
    try {
      const ac = getAudioCtx();
      const osc = ac.createOscillator(); const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.5, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
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

  // ══════════════════════════════
  //  루틴 기능 전체
  // ══════════════════════════════

  let currentRoutineWorkout = null; // 현재 운동 중인 루틴 데이터
  let routineDraftKey = ''; // 임시저장 키

  // 루틴 배너 업데이트 (운동기록 탭 진입 시 호출)
  function updateRoutineBanner() {
    const userId = localStorage.getItem('current_user');
    if (!userId) return;
    routineDraftKey = 'routine_draft_' + userId;
    const db = firebase.database();
    db.ref('users/' + userId + '/routines').once('value', snap => {
      const data = snap.val();
      const title = document.getElementById('routine-banner-title');
      const sub = document.getElementById('routine-banner-sub');
      if (!title) return;
      title.textContent = '내 루틴 만들기';
      if (data) {
        const count = Object.keys(data).length;
        sub.textContent = '내 루틴 ' + count + '개';
        sub.style.display = 'block';
      } else {
        sub.style.display = 'none';
      }
    });
  }

  // ── 루틴 목록 화면 ──
  function openRoutineList() {
    showScreen('screen-routine-list');
    loadRoutineList();
    checkRoutineDraft();
  }

  function closeRoutineList() {
    showScreen('screen-workout-qr');
  }

  function loadRoutineList() {
    const userId = localStorage.getItem('current_user');
    if (!userId) return;
    const container = document.getElementById('routine-list-container');
    const empty = document.getElementById('routine-list-empty');
    container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-hint);font-size:13px;">불러오는 중...</div>';
    firebase.database().ref('users/' + userId + '/routines').once('value', snap => {
      const data = snap.val();
      if (!data) {
        container.innerHTML = '';
        empty.style.display = 'block';
        return;
      }
      empty.style.display = 'none';
      const routines = Object.entries(data).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
      container.innerHTML = routines.map(([id, r]) => {
        const exNames = (r.exercises || []).map(e => e.name).join(' · ');
        const count = (r.exercises || []).length;
        const isAssigned = !!r.assignedBy; // 강사지정 루틴 여부
        const assignedByName = r.assignedByName || '강사';
        return `<div style="background:var(--card);border:1.5px solid ${isAssigned ? '#c4b5fd' : 'var(--border)'};border-radius:var(--radius);padding:14px 16px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;">
              <div style="font-size:16px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.name)}</div>
              ${isAssigned ? `<span style="background:#ede9fe;color:#5b21b6;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;white-space:nowrap;">👨‍🏫 ${escapeHtml(assignedByName)}</span>` : ''}
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button onclick="copyRoutine('${id}')" style="background:#ede9fe;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:700;color:#5b21b6;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">복사</button>
              ${!isAssigned ? `<button onclick="openRoutineEdit('${id}')" style="background:#f3f4f6;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:700;color:var(--text-sub);cursor:pointer;font-family:'Noto Sans KR',sans-serif;">수정</button>` : ''}
              ${!isAssigned ? `<button onclick="deleteRoutine('${id}')" style="background:#fee2e2;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:700;color:#ef4444;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">삭제</button>` : ''}
            </div>
          </div>
          ${isAssigned ? `<div style="font-size:11px;color:#7c3aed;margin-bottom:4px;">강사가 지정한 루틴이에요 · 복사해서 수정 가능해요</div>` : ''}
          <div style="font-size:12px;color:var(--text-hint);margin-bottom:10px;">${count}가지 운동 · ${escapeHtml(exNames)}</div>
          <button onclick="startRoutineWorkout('${id}')" style="width:100%;padding:10px;background:#7c3aed;border:none;border-radius:var(--radius-sm);color:white;font-size:14px;font-weight:700;font-family:'Noto Sans KR',sans-serif;cursor:pointer;">이 루틴으로 운동 시작</button>
        </div>`;
      }).join('');
    });
  }

  // 임시저장 확인
  function checkRoutineDraft() {
    const userId = localStorage.getItem('current_user');
    if (!userId) return;
    const draftKey = 'routine_draft_' + userId;
    const draft = localStorage.getItem(draftKey);
    const banner = document.getElementById('routine-draft-banner');
    const info = document.getElementById('routine-draft-info');
    if (draft) {
      try {
        const d = JSON.parse(draft);
        banner.style.display = 'flex';
        info.textContent = (d.routineName || '루틴') + ' · ' + (d.savedAt || '') + ' 임시저장됨';
      } catch(e) { localStorage.removeItem(draftKey); banner.style.display = 'none'; }
    } else {
      banner.style.display = 'none';
    }
  }

  function deleteRoutineDraft() {
    showConfirm('임시저장을 삭제할까요?', () => {
      const userId = localStorage.getItem('current_user');
      if (!userId) return;
      localStorage.removeItem('routine_draft_' + userId);
      const banner = document.getElementById('routine-draft-banner');
      if (banner) banner.style.display = 'none';
      showToast('임시저장이 삭제됐어요.', 'success');
    });
  }

  function resumeRoutineDraft() {
    const userId = localStorage.getItem('current_user');
    if (!userId) return;
    const draft = localStorage.getItem('routine_draft_' + userId);
    if (!draft) return;
    try {
      const d = JSON.parse(draft);
      currentRoutineWorkout = d;
      showScreen('screen-routine-workout');
      document.getElementById('routine-workout-title').textContent = d.routineName || '운동 기록';
      renderRoutineWorkoutList();
    } catch(e) { showToast('임시저장 복구에 실패했어요.', 'error'); }
  }

  // ── 루틴 만들기 화면 ──
  function openRoutineCreate() {
    document.getElementById('routine-create-title').textContent = '루틴 만들기';
    document.getElementById('routine-edit-id').value = '';
    document.getElementById('routine-name-input').value = '';
    document.getElementById('routine-exercise-list').innerHTML = '';
    document.getElementById('routine-ex-search-input').value = '';
    document.getElementById('routine-ex-search-results').innerHTML = '';
    ['하체','가슴','등','어깨','팔','코어','기구'].forEach(c => {
      const btn = document.getElementById('rcat-' + c);
      if (!btn) return;
      btn.style.background = 'var(--bg)';
      btn.style.color = 'var(--text-sub)';
      btn.style.borderColor = 'var(--border)';
    });
    showScreen('screen-routine-create');
  }

  function openRoutineEdit(routineId) {
    const userId = localStorage.getItem('current_user');
    firebase.database().ref('users/' + userId + '/routines/' + routineId).once('value', snap => {
      const r = snap.val();
      if (!r) return;
      document.getElementById('routine-create-title').textContent = '루틴 수정';
      document.getElementById('routine-edit-id').value = routineId;
      document.getElementById('routine-name-input').value = r.name || '';
      document.getElementById('routine-ex-search-input').value = '';
      document.getElementById('routine-ex-search-results').innerHTML = '';
      ['하체','가슴','등','어깨','팔','코어','기구'].forEach(c => {
        const btn = document.getElementById('rcat-' + c);
        if (!btn) return;
        btn.style.background = 'var(--bg)';
        btn.style.color = 'var(--text-sub)';
        btn.style.borderColor = 'var(--border)';
      });
      renderRoutineCreateList(r.exercises || []);
      showScreen('screen-routine-create');
    });
  }

  function closeRoutineCreate() {
    showScreen('screen-routine-list');
    loadRoutineList();
  }

  // 루틴 만들기 - 운동 목록 렌더
  function renderRoutineCreateList(exercises) {
    const container = document.getElementById('routine-exercise-list');
    if (!exercises || exercises.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = exercises.map((ex, i) => `
      <div id="routine-create-item-${i}"
        ${ex.isDualFront ? 'data-is-dual-front="true"' : ''}
        ${ex.isDualBack ? 'data-is-dual-back="true"' : ''}
        ${ex.eqKey ? `data-eq-key="${ex.eqKey}"` : ''}
        style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:6px;">
          <div style="display:flex;flex-direction:column;gap:3px;flex-shrink:0;">
            <button onclick="moveRoutineItem(${i},'up')" ${i === 0 ? 'disabled' : ''} style="background:${i === 0 ? 'var(--border)' : '#ede9fe'};border:none;border-radius:5px;width:24px;height:22px;cursor:${i === 0 ? 'default' : 'pointer'};color:${i === 0 ? 'var(--text-hint)' : '#7c3aed'};font-size:12px;display:flex;align-items:center;justify-content:center;padding:0;">▲</button>
            <button onclick="moveRoutineItem(${i},'down')" ${i === exercises.length - 1 ? 'disabled' : ''} style="background:${i === exercises.length - 1 ? 'var(--border)' : '#ede9fe'};border:none;border-radius:5px;width:24px;height:22px;cursor:${i === exercises.length - 1 ? 'default' : 'pointer'};color:${i === exercises.length - 1 ? 'var(--text-hint)' : '#7c3aed'};font-size:12px;display:flex;align-items:center;justify-content:center;padding:0;">▼</button>
          </div>
          <div style="font-size:14px;font-weight:700;color:var(--text);flex:1;">${i+1}. ${escapeHtml(ex.name)}</div>
          <button onclick="removeRoutineCreateItem(${i})" style="background:#fee2e2;border:none;border-radius:6px;padding:4px 8px;font-size:11px;color:#ef4444;cursor:pointer;font-family:'Noto Sans KR',sans-serif;flex-shrink:0;">삭제</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
          <div style="text-align:center;">
            <div style="font-size:10px;color:var(--text-hint);margin-bottom:3px;">세트</div>
            <input type="number" min="1" max="20" value="${ex.sets||3}" id="rc-sets-${i}"
              style="width:100%;box-sizing:border-box;padding:7px 4px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-weight:700;text-align:center;color:var(--text);outline:none;font-family:'Noto Sans KR',sans-serif;background:var(--bg);"
              onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='var(--border)'"/>
          </div>
          <div style="text-align:center;">
            <div style="font-size:10px;color:var(--text-hint);margin-bottom:3px;">기본 무게(kg)</div>
            <input type="number" min="0" max="500" step="2.5" value="${ex.weight||0}" id="rc-weight-${i}"
              style="width:100%;box-sizing:border-box;padding:7px 4px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-weight:700;text-align:center;color:var(--text);outline:none;font-family:'Noto Sans KR',sans-serif;background:var(--bg);"
              onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='var(--border)'"/>
          </div>
          <div style="text-align:center;">
            <div style="font-size:10px;color:var(--text-hint);margin-bottom:3px;">기본 횟수</div>
            <input type="number" min="1" max="999" value="${ex.reps||10}" id="rc-reps-${i}"
              style="width:100%;box-sizing:border-box;padding:7px 4px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-weight:700;text-align:center;color:var(--text);outline:none;font-family:'Noto Sans KR',sans-serif;background:var(--bg);"
              onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='var(--border)'"/>
          </div>
        </div>
      </div>`).join('');
  }

  function moveRoutineItem(idx, dir) {
    const exercises = collectRoutineCreateItems();
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= exercises.length) return;
    [exercises[idx], exercises[target]] = [exercises[target], exercises[idx]];
    renderRoutineCreateList(exercises);
  }


  // 루틴 만들기 - 현재 입력값 수집
  function collectRoutineCreateItems() {
    const container = document.getElementById('routine-exercise-list');
    const items = container.querySelectorAll('[id^="routine-create-item-"]');
    const exercises = [];
    items.forEach((item, i) => {
      const nameEl = item.querySelector('div[style*="font-weight:700"]');
      const name = nameEl ? nameEl.textContent.replace(/^\d+\.\s*/, '').trim() : '';
      const sets = parseInt(document.getElementById('rc-sets-' + i)?.value) || 3;
      const weight = parseFloat(document.getElementById('rc-weight-' + i)?.value) || 0;
      const reps = parseInt(document.getElementById('rc-reps-' + i)?.value) || 10;
      if (!name) return;
      const ex = { name, sets, weight, reps };
      // 듀얼머신 정보 복원
      if (item.dataset.isDualFront) ex.isDualFront = true;
      if (item.dataset.isDualBack) ex.isDualBack = true;
      if (item.dataset.eqKey) ex.eqKey = item.dataset.eqKey;
      exercises.push(ex);
    });
    return exercises;
  }

  function removeRoutineCreateItem(idx) {
    const exercises = collectRoutineCreateItems().filter((_, i) => i !== idx);
    renderRoutineCreateList(exercises);
  }

  function openRoutineExSearch() {
    document.getElementById('routine-ex-search-input').focus();
  }

  // 카테고리 탭 선택
  function selectRoutineCategory(cat) {
    const active = document.getElementById('rcat-' + cat);
    const isActive = active && active.dataset.active === 'true';
    // 탭 스타일 초기화
    ['하체','가슴','등','어깨','팔','코어','기구'].forEach(c => {
      const btn = document.getElementById('rcat-' + c);
      if (!btn) return;
      btn.style.background = 'var(--bg)';
      btn.style.color = 'var(--text-sub)';
      btn.style.borderColor = 'var(--border)';
      btn.dataset.active = 'false';
    });
    // 토글: 이미 활성 탭이면 목록 닫기
    const results = document.getElementById('routine-ex-search-results');
    if (isActive) { if (results) results.innerHTML = ''; return; }
    // 선택 탭 활성화
    if (active) {
      active.style.background = '#7c3aed';
      active.style.color = 'white';
      active.style.borderColor = '#7c3aed';
      active.dataset.active = 'true';
    }
    // 검색창 초기화
    const input = document.getElementById('routine-ex-search-input');
    if (input) input.value = '';

    const existing = collectRoutineCreateItems().map(e => e.name);

    let items = [];
    if (cat === '기구') {
      items = (typeof EQUIPMENT_LIST !== 'undefined' ? EQUIPMENT_LIST : [])
        .map(e => ({ name: e.name, tag: e.muscles || '기구', type: 'eq' }));
    } else {
      const fwCats = { '하체':'하체', '가슴':'가슴', '등':'등', '어깨':'어깨', '팔':'팔', '코어':'코어복부' };
      const catKey = fwCats[cat] || cat;
      items = FW_EXERCISE_LIST
        .filter(e => e.category === catKey || e.muscles === cat || matchesMuscle(e.muscles, cat))
        .map(e => ({ name: e.name, tag: e.muscles || e.category, type: 'fw' }));
    }

    if (items.length === 0) {
      results.innerHTML = '<div style="padding:12px 14px;font-size:13px;color:var(--text-hint);">운동이 없어요</div>';
      return;
    }

    results.innerHTML = items.map(e => {
      const isAdded = existing.includes(e.name);
      const badgeStyle = e.type === 'fw' ? 'background:#ede9fe;color:#5b21b6;' : 'background:#dbeafe;color:#1e40af;';
      const badgeText = e.type === 'fw' ? '프리' : '기구';
      return `<div onclick="addRoutineExercise('${escapeHtml(e.name)}')"
        id="rcat-item-${escapeHtml(e.name).replace(/\s/g,'_')}"
        style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);${isAdded ? 'background:#f3e8ff;' : ''}"
        onmouseover="this.style.background='#f3e8ff'" onmouseout="this.style.background='${isAdded ? '#f3e8ff' : ''}'">
        <div style="display:flex;align-items:center;gap:5px;min-width:0;">
          ${isAdded ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'}
          <span style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(e.name)}</span>
          <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;flex-shrink:0;${badgeStyle}">${badgeText}</span>
        </div>
        <span style="font-size:11px;color:var(--text-hint);background:var(--bg);padding:2px 8px;border-radius:10px;flex-shrink:0;">${escapeHtml(e.tag)}</span>
      </div>`;
    }).join('');
  }

  // 부위 대분류 → 세부 부위 매핑 (기구 검색용)
  const MUSCLE_CATEGORY_MAP = {
    '하체': ['허벅지', '앞쪽 허벅지', '뒷쪽 허벅지', '종아리', '엉덩이', '햄스트링', '허벅지·엉덩이', '하체'],
    '등':   ['등', '승모근', '능형근', '광배근', '허리·등', '중·하부 승모근', '후면 삼각근'],
    '가슴': ['가슴', '윗가슴'],
    '어깨': ['어깨', '후면 삼각근', '앞쪽 어깨', '삼각근'],
    '팔':   ['이두', '삼두', '전완'],
    '복부': ['복부', '코어'],
    '코어': ['복부', '코어'],
    '허리': ['허리', '허리·등'],
  };

  // 검색어가 대분류일 때 매핑된 키워드 포함해서 muscles 매칭 여부 확인
  function matchesMuscle(muscles, query) {
    const ql = query.toLowerCase();
    const m = (muscles || '').toLowerCase();
    if (m.includes(ql)) return true;
    // 대분류 매핑 검색
    for (const [category, keywords] of Object.entries(MUSCLE_CATEGORY_MAP)) {
      if (category.toLowerCase() === ql) {
        if (keywords.some(k => m.includes(k.toLowerCase()))) return true;
      }
    }
    return false;
  }

  function searchRoutineExercise(q) {
    const results = document.getElementById('routine-ex-search-results');
    if (!q.trim()) { results.innerHTML = ''; return; }
    const ql = q.toLowerCase();
    const fwItems = FW_EXERCISE_LIST.filter(e => e.name.toLowerCase().includes(ql) || e.muscles.toLowerCase().includes(ql) || e.category.toLowerCase().includes(ql))
      .map(e => ({ name: e.name, tag: e.muscles || e.category, type: 'fw' }));
    const eqItems = (typeof EQUIPMENT_LIST !== 'undefined' ? EQUIPMENT_LIST : [])
      .filter(e => e.name.toLowerCase().includes(ql) || matchesMuscle(e.muscles, q.trim()) || String(e.no) === q.trim())
      .map(e => ({ name: e.name, tag: e.muscles || '기구', type: 'eq' }));
    const combined = [...fwItems, ...eqItems];
    if (combined.length === 0) { results.innerHTML = '<div style="padding:10px 14px;font-size:13px;color:var(--text-hint);">검색 결과 없음</div>'; return; }
    results.innerHTML = combined.map(e => {
      const badgeStyle = e.type === 'fw'
        ? 'background:#ede9fe;color:#5b21b6;'
        : 'background:#dbeafe;color:#1e40af;';
      const badgeText = e.type === 'fw' ? '프리' : '기구';
      return `<div onclick="addRoutineExercise('${escapeHtml(e.name)}')" style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);" onmouseover="this.style.background='#f3e8ff'" onmouseout="this.style.background=''">
        <div style="display:flex;align-items:center;gap:5px;min-width:0;">
          <span style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(e.name)}</span>
          <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;flex-shrink:0;${badgeStyle}">${badgeText}</span>
        </div>
        <span style="font-size:11px;color:var(--text-hint);background:var(--bg);padding:2px 8px;border-radius:10px;flex-shrink:0;">${escapeHtml(e.tag)}</span>
      </div>`;
    }).join('');
  }

  function addRoutineExercise(name) {
    const existing = collectRoutineCreateItems();
    // 듀얼머신 확인
    const eqMatch = (typeof EQUIPMENT_LIST !== 'undefined' ? EQUIPMENT_LIST : []).find(e => e.name === name);
    if (eqMatch && typeof isDualEquipment === 'function' && isDualEquipment(eqMatch.key)) {
      const info = getDualNames(eqMatch.key);
      const frontName = info.front + ' (' + eqMatch.name + ')';
      const backName = info.back + ' (' + eqMatch.name + ')';
      // 이미 추가된 경우 둘 다 제거
      if (existing.find(e => e.name === frontName)) {
        const filtered = existing.filter(e => e.name !== frontName && e.name !== backName);
        renderRoutineCreateList(filtered);
      } else {
        existing.push({ name: frontName, sets: 3, weight: 0, reps: 10, isDualFront: true, eqKey: eqMatch.key });
        existing.push({ name: backName, sets: 3, weight: 0, reps: 10, isDualBack: true, eqKey: eqMatch.key });
        renderRoutineCreateList(existing);
      }
    } else {
      if (existing.find(e => e.name === name)) {
        const filtered = existing.filter(e => e.name !== name);
        renderRoutineCreateList(filtered);
      } else {
        existing.push({ name, sets: 3, weight: 0, reps: 10 });
        renderRoutineCreateList(existing);
      }
    }
    // 현재 활성 카테고리 탭 새로고침
    const activeCat = ['하체','가슴','등','어깨','팔','코어','기구'].find(c => {
      const btn = document.getElementById('rcat-' + c);
      return btn && btn.dataset.active === 'true';
    });
    if (activeCat) selectRoutineCategory(activeCat);
    const searchVal = document.getElementById('routine-ex-search-input')?.value;
    if (searchVal && searchVal.trim()) searchRoutineExercise(searchVal);
  }

  // 루틴 저장
  function saveRoutine() {
    const userId = localStorage.getItem('current_user');
    if (!userId) return;
    const name = document.getElementById('routine-name-input').value.trim();
    if (!name) { showToast('루틴 이름을 입력해주세요!', 'error'); return; }
    const exercises = collectRoutineCreateItems();
    if (exercises.length === 0) { showToast('운동을 1개 이상 추가해주세요!', 'error'); return; }
    const editId = document.getElementById('routine-edit-id').value;
    const routineId = editId || ('routine_' + Date.now());
    const data = { name, exercises, updatedAt: Date.now() };
    firebase.database().ref('users/' + userId + '/routines/' + routineId).set(data, err => {
      if (err) { showToast('저장 실패. 다시 시도해주세요.', 'error'); return; }
      showToast(editId ? '루틴이 수정됐어요!' : '루틴이 저장됐어요!', 'success');
      closeRoutineCreate();
      updateRoutineBanner();
    });
  }

  // 루틴 복사
  function copyRoutine(routineId) {
    const userId = localStorage.getItem('current_user');
    firebase.database().ref('users/' + userId + '/routines/' + routineId).once('value', snap => {
      const r = snap.val();
      if (!r) return;
      const newId = 'routine_' + Date.now();
      const newData = {
        name: r.name + ' (복사)',
        exercises: r.exercises || [],
        updatedAt: Date.now()
      };
      firebase.database().ref('users/' + userId + '/routines/' + newId).set(newData, err => {
        if (err) { showToast('복사 실패. 다시 시도해주세요.', 'error'); return; }
        showToast('"' + r.name + '" 루틴이 복사됐어요!', 'success');
        loadRoutineList();
        updateRoutineBanner();
      });
    });
  }

  // 루틴 삭제
  function deleteRoutine(routineId) {
    showConfirm('이 루틴을 삭제할까요?', () => {
      const userId = localStorage.getItem('current_user');
      firebase.database().ref('users/' + userId + '/routines/' + routineId).remove(() => {
        showToast('루틴이 삭제됐어요.', 'success');
        loadRoutineList();
        updateRoutineBanner();
      });
    });
  }

  // ── 루틴으로 운동하기 ──
  function startRoutineWorkout(routineId) {
    const userId = localStorage.getItem('current_user');
    firebase.database().ref('users/' + userId + '/routines/' + routineId).once('value', snap => {
      const r = snap.val();
      if (!r) return;
      const exercises = [];
      (r.exercises || []).forEach(ex => {
        // 이미 분리된 듀얼(isDualFront/isDualBack) 또는 일반 운동
        if (ex.isDualFront || ex.isDualBack) {
          const storageKey = ex.isDualFront
            ? 'workout_dual_front_' + ex.eqKey + '_' + userId
            : 'workout_dual_back_' + ex.eqKey + '_' + userId;
          const recs = JSON.parse(localStorage.getItem(storageKey) || '[]');
          const last = recs[0] || null;
          const prevSets = last ? last.sets : null;
          const sets = ex.sets || 3;
          const inputSets = [];
          for (let i = 0; i < sets; i++) {
            inputSets.push({
              set: i+1,
              weight: prevSets&&prevSets[i] ? prevSets[i].weight : (ex.weight||0),
              reps: prevSets&&prevSets[i] ? prevSets[i].reps : (ex.reps||10),
              prevWeight: prevSets&&prevSets[i] ? prevSets[i].weight : null
            });
          }
          exercises.push({ name: ex.name, sets: inputSets, eqKey: ex.eqKey, isDualFront: ex.isDualFront, isDualBack: ex.isDualBack });
          return;
        }

        // 기구 여부 확인
        const eqMatch = (typeof EQUIPMENT_LIST !== 'undefined' ? EQUIPMENT_LIST : []).find(e => e.name === ex.name);
        let last = null;
        if (eqMatch) {
          const recs = JSON.parse(localStorage.getItem('workout_' + eqMatch.key + '_' + userId) || '[]');
          last = recs[0] || null;
        } else {
          const safeKey = 'freeweight_' + ex.name.replace(/\s+/g,'_') + '_' + userId;
          const recs = JSON.parse(localStorage.getItem(safeKey) || '[]');
          last = recs[recs.length-1] || null;
        }
        const prevSets = last ? last.sets : null;
        const sets = ex.sets || 3;
        const inputSets = [];
        for (let i = 0; i < sets; i++) {
          inputSets.push({
            set: i+1,
            weight: prevSets&&prevSets[i] ? prevSets[i].weight : (ex.weight||0),
            reps: prevSets&&prevSets[i] ? prevSets[i].reps : (ex.reps||10),
            prevWeight: prevSets&&prevSets[i] ? prevSets[i].weight : null
          });
        }
        exercises.push({ name: ex.name, sets: inputSets, isEquipment: !!eqMatch, eqKey: eqMatch ? eqMatch.key : null });
      });
      currentRoutineWorkout = { routineId, routineName: r.name, exercises };
      saveRoutineDraft();
      showScreen('screen-routine-workout');
      document.getElementById('routine-workout-title').textContent = r.name;
      renderRoutineWorkoutList();
    });
  }

  function closeRoutineWorkout() {
    showConfirm('운동을 그만할까요?\n입력한 내용은 임시저장 돼요.', () => {
      skipRwRestTimer();
      saveRoutineDraft();
      updateRoutineBanner();
      showScreen('screen-routine-list');
      checkRoutineDraft();
    });
  }

  // 루틴 운동 화면 렌더
  function renderRoutineWorkoutList() {
    const container = document.getElementById('routine-workout-list');
    if (!currentRoutineWorkout) return;
    const { exercises } = currentRoutineWorkout;
    container.innerHTML = exercises.map((ex, ei) => {
      const isSkipped = ex.skipped || false;
      return `
      <div style="background:var(--card);border:1px solid ${isSkipped ? 'var(--border)' : 'var(--border)'};border-radius:var(--radius);padding:14px 16px;margin-bottom:12px;opacity:${isSkipped ? '0.45' : '1'};">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${isSkipped ? '0' : '10px'};">
          <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;">
            <div style="display:flex;flex-direction:column;gap:3px;flex-shrink:0;">
              <button onclick="moveRoutineWorkoutItem(${ei},'up')" ${ei===0?'disabled':''} style="background:${ei===0?'var(--border)':'#ede9fe'};border:none;border-radius:5px;width:22px;height:20px;cursor:${ei===0?'default':'pointer'};color:${ei===0?'var(--text-hint)':'#7c3aed'};font-size:11px;display:flex;align-items:center;justify-content:center;padding:0;">▲</button>
              <button onclick="moveRoutineWorkoutItem(${ei},'down')" ${ei===exercises.length-1?'disabled':''} style="background:${ei===exercises.length-1?'var(--border)':'#ede9fe'};border:none;border-radius:5px;width:22px;height:20px;cursor:${ei===exercises.length-1?'default':'pointer'};color:${ei===exercises.length-1?'var(--text-hint)':'#7c3aed'};font-size:11px;display:flex;align-items:center;justify-content:center;padding:0;">▼</button>
            </div>
            <div style="font-size:15px;font-weight:700;color:var(--text);${isSkipped?'text-decoration:line-through;color:var(--text-hint);':''}">${ei+1}. ${escapeHtml(ex.name)}</div>
            ${isSkipped ? '<span style="font-size:11px;background:#f3f4f6;color:var(--text-hint);padding:2px 8px;border-radius:10px;flex-shrink:0;">건너뜀</span>' : ''}
          </div>
          <button onclick="toggleSkipRoutineExercise(${ei})" style="background:${isSkipped?'#ede9fe':'#f3f4f6'};border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;color:${isSkipped?'#7c3aed':'var(--text-hint)'};cursor:pointer;font-family:'Noto Sans KR',sans-serif;flex-shrink:0;margin-left:6px;">${isSkipped?'되돌리기':'건너뛰기'}</button>
        </div>
        ${isSkipped ? '' : `
        <div style="display:grid;grid-template-columns:36px 1fr 1fr 48px 36px;gap:4px;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid var(--border);">
          <div style="text-align:center;font-size:10px;color:var(--text-hint);">세트</div>
          <div style="text-align:center;font-size:10px;color:var(--text-hint);">무게(kg)</div>
          <div style="text-align:center;font-size:10px;color:var(--text-hint);">횟수</div>
          <div style="text-align:center;font-size:10px;color:var(--text-hint);">완료</div>
          <div></div>
        </div>
        ${ex.sets.map((s, si) => `
        <div style="display:grid;grid-template-columns:36px 1fr 1fr 48px 36px;gap:4px;margin-bottom:6px;align-items:center;">
          <div style="text-align:center;font-size:13px;font-weight:700;color:white;background:#7c3aed;border-radius:8px;height:38px;display:flex;align-items:center;justify-content:center;">${s.set}</div>
          <div style="position:relative;">
            <input type="number" min="0" max="500" step="2.5" value="${s.weight}"
              id="rw-weight-${ei}-${si}"
              style="width:100%;box-sizing:border-box;padding:8px 4px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-weight:700;text-align:center;color:var(--text);outline:none;font-family:'Noto Sans KR',sans-serif;background:var(--bg);"
              onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='var(--border)'"
              oninput="autoSaveRoutineDraft()"/>
            ${s.prevWeight !== null ? `<div style="position:absolute;top:-8px;right:4px;font-size:9px;background:#fef3c7;color:#92400e;border-radius:4px;padding:1px 4px;">최근 ${s.prevWeight}kg</div>` : ''}
          </div>
          <input type="number" min="0" max="9999" value="${s.reps}"
            id="rw-reps-${ei}-${si}"
            style="width:100%;box-sizing:border-box;padding:8px 4px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-weight:700;text-align:center;color:var(--text);outline:none;font-family:'Noto Sans KR',sans-serif;background:var(--bg);"
            onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='var(--border)'"
            oninput="autoSaveRoutineDraft()"/>
          <button onclick="toggleRwSetDone(${ei},${si})" style="width:48px;height:38px;border:none;background:${s.done?'#22c55e':'#f3f4f6'};color:${s.done?'white':'var(--text-hint)'};border-radius:8px;cursor:pointer;font-size:${s.done?'18px':'13px'};font-weight:700;display:flex;align-items:center;justify-content:center;font-family:'Noto Sans KR',sans-serif;">${s.done?'✓':'완료'}</button>
          <button onclick="removeRoutineWorkoutSet(${ei},${si})" style="width:36px;height:38px;border:none;background:#fee2e2;color:#ef4444;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;"${ex.sets.length<=1?' disabled style="opacity:0.3;width:36px;height:38px;border:none;background:#fee2e2;color:#ef4444;border-radius:8px;cursor:not-allowed;font-size:16px;display:flex;align-items:center;justify-content:center;"':''}>×</button>
        </div>`).join('')}
        <button onclick="addRoutineWorkoutSet(${ei})" style="width:100%;padding:7px;background:var(--bg);border:1.5px dashed var(--border);border-radius:8px;color:var(--text-hint);font-size:12px;font-family:'Noto Sans KR',sans-serif;cursor:pointer;margin-top:2px;">+ 세트 추가</button>
        `}
      </div>`;
    }).join('');
  }

  function toggleRwSetDone(exIdx, setIdx) {
    if (!currentRoutineWorkout) return;
    const s = currentRoutineWorkout.exercises[exIdx].sets[setIdx];
    s.done = !s.done;
    renderRoutineWorkoutList();
    autoSaveRoutineDraft();
    // 완료로 변경 시 타이머 시작
    if (s.done) startRestTimer('rw-rest-timer-box', 'rw-rest-timer-count', 'rw-rest-min', 'rw-rest-sec');
  }

  function skipRwRestTimer() {
    if (restTimerInterval) { clearInterval(restTimerInterval); restTimerInterval = null; }
    stopRestAlarm(); releaseWakeLock();
    const box = document.getElementById('rw-rest-timer-box');
    if (box) box.style.display = 'none';
  }

  function toggleSkipRoutineExercise(exIdx) {
    if (!currentRoutineWorkout) return;
    autoSaveRoutineDraft();
    const ex = currentRoutineWorkout.exercises[exIdx];
    ex.skipped = !ex.skipped;
    renderRoutineWorkoutList();
    autoSaveRoutineDraft();
  }

  function moveRoutineWorkoutItem(idx, dir) {
    if (!currentRoutineWorkout) return;
    autoSaveRoutineDraft();
    const exs = currentRoutineWorkout.exercises;
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= exs.length) return;
    [exs[idx], exs[target]] = [exs[target], exs[idx]];
    renderRoutineWorkoutList();
    autoSaveRoutineDraft();
  }


  function addRoutineWorkoutSet(exIdx) {
    if (!currentRoutineWorkout) return;
    const ex = currentRoutineWorkout.exercises[exIdx];
    const last = ex.sets[ex.sets.length - 1];
    ex.sets.push({ set: ex.sets.length + 1, weight: last ? last.weight : 0, reps: last ? last.reps : 10, prevWeight: null });
    renderRoutineWorkoutList();
    autoSaveRoutineDraft();
  }

  function removeRoutineWorkoutSet(exIdx, setIdx) {
    if (!currentRoutineWorkout) return;
    const ex = currentRoutineWorkout.exercises[exIdx];
    if (ex.sets.length <= 1) return;
    ex.sets.splice(setIdx, 1);
    ex.sets.forEach((s, i) => s.set = i + 1);
    renderRoutineWorkoutList();
    autoSaveRoutineDraft();
  }

  function selectRoutineWorkoutCategory(cat) {
    const active = document.getElementById('rwcat-' + cat);
    const results = document.getElementById('routine-workout-ex-search-results');
    const isActive = active && active.dataset.active === 'true';
    ['하체','가슴','등','어깨','팔','코어','기구'].forEach(c => {
      const btn = document.getElementById('rwcat-' + c);
      if (!btn) return;
      btn.style.background = 'var(--bg)';
      btn.style.color = 'var(--text-sub)';
      btn.style.borderColor = 'var(--border)';
      btn.dataset.active = 'false';
    });
    if (isActive) { results.innerHTML = ''; return; }
    if (active) { active.style.background = '#7c3aed'; active.style.color = 'white'; active.style.borderColor = '#7c3aed'; active.dataset.active = 'true'; }
    const input = document.getElementById('routine-workout-ex-search-input');
    if (input) input.value = '';
    const existing = (currentRoutineWorkout ? currentRoutineWorkout.exercises : []).map(e => e.name);
    let items = [];
    if (cat === '기구') {
      items = (typeof EQUIPMENT_LIST !== 'undefined' ? EQUIPMENT_LIST : []).map(e => ({ name: e.name, tag: e.muscles || '기구', type: 'eq' }));
    } else {
      const fwCats = { '하체':'하체', '가슴':'가슴', '등':'등', '어깨':'어깨', '팔':'팔', '코어':'코어복부' };
      items = FW_EXERCISE_LIST.filter(e => e.category === (fwCats[cat]||cat) || matchesMuscle(e.muscles, cat)).map(e => ({ name: e.name, tag: e.muscles||e.category, type: 'fw' }));
    }
    if (items.length === 0) { results.innerHTML = '<div style="padding:12px 14px;font-size:13px;color:var(--text-hint);">운동이 없어요</div>'; return; }
    results.innerHTML = items.map(e => {
      const isAdded = existing.includes(e.name);
      const badgeStyle = e.type==='fw' ? 'background:#ede9fe;color:#5b21b6;' : 'background:#dbeafe;color:#1e40af;';
      const badgeText = e.type==='fw' ? '프리' : '기구';
      return `<div onclick="addRoutineWorkoutExercise('${escapeHtml(e.name)}')" style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);${isAdded?'background:#f3e8ff;':''}" onmouseover="this.style.background='#f3e8ff'" onmouseout="this.style.background='${isAdded?'#f3e8ff':''}'" >
        <div style="display:flex;align-items:center;gap:5px;min-width:0;">
          ${isAdded ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'}
          <span style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(e.name)}</span>
          <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;flex-shrink:0;${badgeStyle}">${badgeText}</span>
        </div>
        <span style="font-size:11px;color:var(--text-hint);background:var(--bg);padding:2px 8px;border-radius:10px;flex-shrink:0;">${escapeHtml(e.tag)}</span>
      </div>`;
    }).join('');
  }

  function openRoutineExSearchInWorkout() {
    document.getElementById('routine-workout-ex-search-input').focus();
  }

  function searchRoutineWorkoutExercise(q) {
    const results = document.getElementById('routine-workout-ex-search-results');
    if (!q.trim()) { results.innerHTML = ''; return; }
    const ql = q.toLowerCase();
    const fwItems = FW_EXERCISE_LIST.filter(e => e.name.toLowerCase().includes(ql) || e.muscles.toLowerCase().includes(ql) || e.category.toLowerCase().includes(ql))
      .map(e => ({ name: e.name, tag: e.muscles || e.category, type: 'fw' }));
    const eqItems = (typeof EQUIPMENT_LIST !== 'undefined' ? EQUIPMENT_LIST : [])
      .filter(e => e.name.toLowerCase().includes(ql) || matchesMuscle(e.muscles, q.trim()) || String(e.no) === q.trim())
      .map(e => ({ name: e.name, tag: e.muscles || '기구', type: 'eq' }));
    const combined = [...fwItems, ...eqItems];
    if (combined.length === 0) { results.innerHTML = '<div style="padding:10px 14px;font-size:13px;color:var(--text-hint);">검색 결과 없음</div>'; return; }
    results.innerHTML = combined.map(e => {
      const badgeStyle = e.type === 'fw'
        ? 'background:#ede9fe;color:#5b21b6;'
        : 'background:#dbeafe;color:#1e40af;';
      const badgeText = e.type === 'fw' ? '프리' : '기구';
      return `<div onclick="addRoutineWorkoutExercise('${escapeHtml(e.name)}')" style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);" onmouseover="this.style.background='#f3e8ff'" onmouseout="this.style.background=''">
        <div style="display:flex;align-items:center;gap:5px;min-width:0;">
          <span style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(e.name)}</span>
          <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;flex-shrink:0;${badgeStyle}">${badgeText}</span>
        </div>
        <span style="font-size:11px;color:var(--text-hint);background:var(--bg);padding:2px 8px;border-radius:10px;flex-shrink:0;">${escapeHtml(e.tag)}</span>
      </div>`;
    }).join('');
  }

  function addRoutineWorkoutExercise(name) {
    if (!currentRoutineWorkout) return;
    const userId = localStorage.getItem('current_user');
    const eqMatch = (typeof EQUIPMENT_LIST !== 'undefined' ? EQUIPMENT_LIST : []).find(e => e.name === name);

    // 듀얼머신이면 front/back 두 개로 분리
    if (eqMatch && typeof isDualEquipment === 'function' && isDualEquipment(eqMatch.key)) {
      const info = getDualNames(eqMatch.key);
      const frontRecs = JSON.parse(localStorage.getItem('workout_dual_front_' + eqMatch.key + '_' + userId) || '[]');
      const backRecs = JSON.parse(localStorage.getItem('workout_dual_back_' + eqMatch.key + '_' + userId) || '[]');
      const frontLast = frontRecs[0] || null;
      const backLast = backRecs[0] || null;
      const frontName = info.front + ' (' + eqMatch.name + ')';
      const backName = info.back + ' (' + eqMatch.name + ')';
      currentRoutineWorkout.exercises.push({
        name: frontName, eqKey: eqMatch.key, isDualFront: true,
        sets: [{ set:1, weight: frontLast&&frontLast.sets[0]?frontLast.sets[0].weight:0, reps: frontLast&&frontLast.sets[0]?frontLast.sets[0].reps:10, prevWeight: frontLast&&frontLast.sets[0]?frontLast.sets[0].weight:null }]
      });
      currentRoutineWorkout.exercises.push({
        name: backName, eqKey: eqMatch.key, isDualBack: true,
        sets: [{ set:1, weight: backLast&&backLast.sets[0]?backLast.sets[0].weight:0, reps: backLast&&backLast.sets[0]?backLast.sets[0].reps:10, prevWeight: backLast&&backLast.sets[0]?backLast.sets[0].weight:null }]
      });
    } else {
      let last = null;
      if (eqMatch) {
        const recs = JSON.parse(localStorage.getItem('workout_' + eqMatch.key + '_' + userId) || '[]');
        last = recs[0] || null;
      } else {
        const safeKey = 'freeweight_' + name.replace(/\s+/g,'_') + '_' + userId;
        const recs = JSON.parse(localStorage.getItem(safeKey) || '[]');
        last = recs[recs.length - 1] || null;
      }
      const prevSets = last ? last.sets : null;
      currentRoutineWorkout.exercises.push({
        name, isEquipment: !!eqMatch, eqKey: eqMatch ? eqMatch.key : null,
        sets: [{ set:1, weight: prevSets&&prevSets[0]?prevSets[0].weight:0, reps: prevSets&&prevSets[0]?prevSets[0].reps:10, prevWeight: prevSets&&prevSets[0]?prevSets[0].weight:null }]
      });
    }
    // 카테고리 탭 새로고침
    const activeCat = ['하체','가슴','등','어깨','팔','코어','기구'].find(c => {
      const btn = document.getElementById('rwcat-' + c);
      return btn && btn.dataset.active === 'true';
    });
    if (activeCat) selectRoutineWorkoutCategory(activeCat);
    const searchVal = document.getElementById('routine-workout-ex-search-input')?.value;
    if (searchVal && searchVal.trim()) searchRoutineWorkoutExercise(searchVal);
    renderRoutineWorkoutList();
    autoSaveRoutineDraft();
  }


  // 자동 임시저장
  function autoSaveRoutineDraft() {
    if (!currentRoutineWorkout) return;
    // 현재 입력값을 currentRoutineWorkout에 반영
    const { exercises } = currentRoutineWorkout;
    exercises.forEach((ex, ei) => {
      ex.sets.forEach((s, si) => {
        const wEl = document.getElementById('rw-weight-' + ei + '-' + si);
        const rEl = document.getElementById('rw-reps-' + ei + '-' + si);
        if (wEl) s.weight = parseFloat(wEl.value) || 0;
        if (rEl) s.reps = parseInt(rEl.value) || 0;
      });
    });
    saveRoutineDraft();
  }

  function saveRoutineDraft() {
    const userId = localStorage.getItem('current_user');
    if (!userId || !currentRoutineWorkout) return;
    const now = new Date();
    const timeStr = (now.getHours() < 10 ? '0' : '') + now.getHours() + ':' + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes();
    currentRoutineWorkout.savedAt = timeStr;
    localStorage.setItem('routine_draft_' + userId, JSON.stringify(currentRoutineWorkout));
  }

  // 루틴 운동 기록 저장
  function saveRoutineWorkout() {
    skipRwRestTimer();
    if (!currentRoutineWorkout) return;
    const { exercises, routineName } = currentRoutineWorkout;
    const userId = localStorage.getItem('current_user');
    const now = new Date();
    const date = now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate();
    const dateLabel = now.getFullYear() + '년 ' + (now.getMonth()+1) + '월 ' + now.getDate() + '일';
    const savedAt = (now.getHours()<10?'0':'') + now.getHours() + ':' + (now.getMinutes()<10?'0':'') + now.getMinutes();
    let savedCount = 0;

    exercises.forEach((ex, ei) => {
      if (ex.skipped) return;
      // input값 직접 읽어서 반영
      ex.sets.forEach((s, si) => {
        const wEl = document.getElementById('rw-weight-' + ei + '-' + si);
        const rEl = document.getElementById('rw-reps-' + ei + '-' + si);
        if (wEl) s.weight = parseFloat(wEl.value) || 0;
        if (rEl) s.reps = parseInt(rEl.value) || 0;
      });

      const validSets = ex.sets.filter(s => s.weight > 0 || s.reps > 0);
      if (validSets.length === 0) return;
      const mappedSets = validSets.map((s,i) => ({ set:i+1, weight:s.weight, reps:s.reps }));
      const record = { date, dateLabel, savedAt, sets: mappedSets };

      // 기구 vs 프리웨이트 구분 저장
      const eqMatch = ex.eqKey
        ? { key: ex.eqKey }
        : (typeof EQUIPMENT_LIST !== 'undefined' ? EQUIPMENT_LIST : []).find(e => e.name === ex.name);

      if (eqMatch && ex.isDualFront) {
        const storageKey = 'workout_dual_front_' + eqMatch.key + '_' + userId;
        const records = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const idx = records.findIndex(r => r.date === date);
        if (idx >= 0) records[idx] = record; else records.unshift(record);
        localStorage.setItem(storageKey, JSON.stringify(records));
        firebase.database().ref('users/' + userId + '/workouts/dual_front_' + eqMatch.key + '/' + date).set({ ...record, name: ex.name, recordedBy: 'member' });
      } else if (eqMatch && ex.isDualBack) {
        const storageKey = 'workout_dual_back_' + eqMatch.key + '_' + userId;
        const records = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const idx = records.findIndex(r => r.date === date);
        if (idx >= 0) records[idx] = record; else records.unshift(record);
        localStorage.setItem(storageKey, JSON.stringify(records));
        firebase.database().ref('users/' + userId + '/workouts/dual_back_' + eqMatch.key + '/' + date).set({ ...record, name: ex.name, recordedBy: 'member' });
      } else if (eqMatch) {
        const storageKey = 'workout_' + eqMatch.key + '_' + userId;
        const records = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const idx = records.findIndex(r => r.date === date);
        if (idx >= 0) records[idx] = record; else records.unshift(record);
        localStorage.setItem(storageKey, JSON.stringify(records));
        firebase.database().ref('users/' + userId + '/workouts/' + eqMatch.key + '/' + date).set({ ...record, name: ex.name, recordedBy: 'member' });
      } else {
        const safeKey = 'freeweight_' + ex.name.replace(/\s+/g,'_') + '_' + userId;
        const records = JSON.parse(localStorage.getItem(safeKey) || '[]');
        const idx = records.findIndex(r => r.date === date);
        if (idx >= 0) records[idx] = record; else records.push(record);
        localStorage.setItem(safeKey, JSON.stringify(records));
        const fwFirebaseKey = ex.name.replace(/\s+/g,'_').replace(/[\.\#\$\[\]\/]/g,'_');
        firebase.database().ref('users/' + userId + '/workouts/fw_' + fwFirebaseKey + '/' + date).set({ ...record, name: ex.name, recordedBy: 'member' });
        // fwIndex 업데이트
        const fwIndex = JSON.parse(localStorage.getItem('freeweight_index_' + userId) || '[]');
        if (!fwIndex.includes(ex.name)) { fwIndex.push(ex.name); localStorage.setItem('freeweight_index_' + userId, JSON.stringify(fwIndex)); firebase.database().ref('users/' + userId + '/fwIndex').set(fwIndex); }
      }
      savedCount++;
    });

    if (savedCount === 0) { showToast('저장할 기록이 없어요. 무게나 횟수를 입력해주세요.', 'error'); return; }
    localStorage.removeItem('routine_draft_' + userId);
    currentRoutineWorkout = null;
    showToast(routineName + ' 기록이 저장됐어요! 💪', 'success');
    showScreen('screen-workout-qr');
    renderCalendar();
    if (typeof calSelectedDate !== 'undefined' && calSelectedDate) renderDayDetail(calSelectedDate);
    updateRoutineBanner();
  }


