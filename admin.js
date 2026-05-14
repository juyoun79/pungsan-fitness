  const ADMIN_ID = 'admin';

  function checkAdminLogin(id, pw) {
    return id === ADMIN_ID; // 1차 ID 체크만, 비번은 doLogin에서 Firebase 조회
  }

  // Firebase에 관리자 계정 초기화 (최초 1회)
  function initAdminAccount() {
    db.ref('admin_config/pw').once('value').then(snap => {
      if (!snap.exists()) {
        db.ref('admin_config/pw').set('admin123');
      }
    });
  }

  // ── 관리자 탭 전환 ──
  function switchAdminTab(tabId) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.target.classList.add('active');
    if (tabId === 'tab-dashboard') loadAdminDashboard();
    if (tabId === 'tab-members') loadMemberList();
    if (tabId === 'tab-notice') loadNoticeListAdmin();
    if (tabId === 'tab-community-admin') loadAdminCommunityFeed('전체');
    if (tabId === 'tab-trainer-admin') loadAdminTrainerSchedule();
  }

  // ── 관리자 강사 목록 관리 ──
  let editTrainerId = null;

  function loadAdminTrainerList() {
    const listEl = document.getElementById('admin-trainer-list');
    if (!listEl) return;
    adminTrainerList = [];

    // users에서 role:trainer + trainers 경로 둘 다 합쳐서 불러오기
    Promise.all([
      db.ref('users').once('value'),
      db.ref('trainers').once('value')
    ]).then(([usersSnap, trainersSnap]) => {
      const trainerIds = new Set();

      // trainers 경로에 있는 강사
      if (trainersSnap.exists()) {
        trainersSnap.forEach(child => {
          const info = child.val();
          const name = info.name || child.key;
          if (!trainerIds.has(child.key)) {
            trainerIds.add(child.key);
            adminTrainerList.push({ id: child.key, name });
          }
        });
      }

      // users 경로에서 role:trainer인 계정 추가
      if (usersSnap.exists()) {
        usersSnap.forEach(child => {
          const info = child.val();
          if ((info.role === 'trainer' || info.role === 'manager') && !trainerIds.has(child.key)) {
            trainerIds.add(child.key);
            const name = info.name || child.key;
            adminTrainerList.push({ id: child.key, name });
            // trainers 경로에도 없으면 동기화
            db.ref('trainers/' + child.key).set({ name });
          }
        });
      }

      if (adminTrainerList.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:14px;">등록된 강사가 없어요</div>';
        return;
      }

      listEl.innerHTML = adminTrainerList.map(t => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--blue);color:white;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0;">${t.name[0]}</div>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:700;color:var(--text);">${t.name}</div>
            <div style="font-size:12px;color:var(--text-hint);">아이디: ${t.id}</div>
          </div>
          <button onclick="openEditTrainerModal('${t.id}','${t.name}')" style="background:var(--blue-light);color:var(--blue);border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">수정</button>
        </div>`).join('');

      // 강사별 스케줄 버튼도 업데이트
      var btnsHtml = adminTrainerList.map((t, i) =>
        '<button onclick="selectAdminTrainer(\'' + t.id + '\',\'' + t.name + '\',this)" style="padding:7px 14px;background:' + (i===0?'var(--blue)':'var(--card)') + ';color:' + (i===0?'white':'var(--text)') + ';border:' + (i===0?'none':'1px solid var(--border)') + ';border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'Noto Sans KR\',sans-serif;">' + t.name + '</button>'
      ).join('');
      const btnEl = document.getElementById('admin-trainer-btns');
      if (btnEl) btnEl.innerHTML = btnsHtml;
      if (adminTrainerList.length > 0 && !adminSelectedTrainer) {
        adminSelectedTrainer = adminTrainerList[0];
      }
      updateReportTrainerSelect();
    });
  }

  function openAddTrainerModal() {
    editTrainerId = null;
    document.getElementById('trainer-modal-title').textContent = '👨‍🏫 강사 추가';
    document.getElementById('trainer-modal-name').value = '';
    document.getElementById('trainer-modal-phone').value = '';
    document.getElementById('trainer-modal-pw').value = '';
    document.getElementById('trainer-modal-phone-wrap').style.display = 'block';
    document.getElementById('trainer-modal-delete-btn').style.display = 'none';
    document.getElementById('trainer-modal').style.display = 'flex';
  }

  function openEditTrainerModal(id, name) {
    editTrainerId = id;
    document.getElementById('trainer-modal-title').textContent = '👨‍🏫 강사 수정';
    document.getElementById('trainer-modal-name').value = name;
    document.getElementById('trainer-modal-phone').value = id;
    document.getElementById('trainer-modal-pw').value = '';
    document.getElementById('trainer-modal-phone-wrap').style.display = 'none';
    document.getElementById('trainer-modal-delete-btn').style.display = 'block';
    document.getElementById('trainer-modal').style.display = 'flex';
  }

  function closeTrainerModal() {
    document.getElementById('trainer-modal').style.display = 'none';
    editTrainerId = null;
  }

  function saveTrainer() {
    const name = document.getElementById('trainer-modal-name').value.trim();
    if (!name) { alert('이름을 입력해주세요.'); return; }

    if (editTrainerId) {
      // 수정
      const pw = document.getElementById('trainer-modal-pw').value.trim();
      const updates = { name };
      db.ref('trainers/' + editTrainerId).update({ name });
      db.ref('users/' + editTrainerId).update(pw ? { name, pw } : { name }).then(() => {
        alert('✅ 수정됐어요!');
        closeTrainerModal();
        loadAdminTrainerList();
      });
    } else {
      // 추가
      const phone = document.getElementById('trainer-modal-phone').value.trim().replace(/-/g,'');
      const pw = document.getElementById('trainer-modal-pw').value.trim() || phone.slice(-4);
      if (!phone || phone.length < 10) { alert('전화번호를 정확히 입력해주세요.'); return; }
      db.ref('users/' + phone).once('value', snap => {
        if (snap.exists()) {
          // 기존 계정이 있으면 role만 trainer로 업데이트
          if (!confirm(snap.val().name + ' 님이 이미 등록된 번호예요.\n강사로 전환할까요?')) return;
          // 기존 members pw 가져오기
          db.ref('members/' + phone).once('value', mSnap => {
            const existingPw = snap.val().pw || (mSnap.exists() ? mSnap.val().pw : null) || phone.slice(-4);
            Promise.all([
              db.ref('users/' + phone).update({ name, role: 'trainer', pw: existingPw }),
              db.ref('trainers/' + phone).set({ name }),
              db.ref('members/' + phone).remove()
            ]).then(() => {
              alert('✅ ' + name + ' 강사로 전환됐어요!\n비밀번호: ' + existingPw);
              closeTrainerModal();
              loadAdminTrainerList();
            });
          });
        } else {
          Promise.all([
            db.ref('users/' + phone).set({ name, pw, role: 'trainer' }),
            db.ref('trainers/' + phone).set({ name })
          ]).then(() => {
            alert('✅ ' + name + ' 강사가 등록됐어요!\n아이디: ' + phone + '\n비밀번호: ' + pw);
            closeTrainerModal();
            loadAdminTrainerList();
          });
        }
      });
    }
  }

  function deleteTrainer() {
    if (!editTrainerId) return;
    if (!confirm('이 강사를 삭제할까요?\n스케줄 및 담당 회원 정보도 모두 삭제돼요.')) return;
    Promise.all([
      db.ref('users/' + editTrainerId).remove(),
      db.ref('trainers/' + editTrainerId).remove()
    ]).then(() => {
      alert('삭제됐어요! 🗑');
      closeTrainerModal();
      loadAdminTrainerList();
    });
  }

  // ── 관리자 강사관리 탭 ──
  const ADMIN_SCH_HOURS = Array.from({length: 18}, (_, i) => i + 6);
  const ADMIN_SCH_DAYS = ['일','월','화','수','목','금','토'];
  let adminTrainerList = [];
  let adminSelectedTrainer = null;
  let adminTrainerBaseDate = new Date();

  function loadAdminTrainerSchedule() {
    loadAdminTrainerList();
    initReportMonth();
    switchAdminScheduleTab('today');
  }

  function switchAdminScheduleTab(tab) {
    const todayEl = document.getElementById('admin-sch-today');
    const trainerEl = document.getElementById('admin-sch-trainer');
    const btnToday = document.getElementById('admin-sch-btn-today');
    const btnTrainer = document.getElementById('admin-sch-btn-trainer');
    if (tab === 'today') {
      todayEl.style.display = 'block';
      trainerEl.style.display = 'none';
      btnToday.style.background = 'var(--blue)'; btnToday.style.color = 'white'; btnToday.style.border = 'none';
      btnTrainer.style.background = 'var(--card)'; btnTrainer.style.color = 'var(--text)'; btnTrainer.style.border = '1px solid var(--border)';
      renderAdminTodaySchedule();
    } else {
      todayEl.style.display = 'none';
      trainerEl.style.display = 'block';
      btnTrainer.style.background = 'var(--blue)'; btnTrainer.style.color = 'white'; btnTrainer.style.border = 'none';
      btnToday.style.background = 'var(--card)'; btnToday.style.color = 'var(--text)'; btnToday.style.border = '1px solid var(--border)';
      loadAdminTrainerList();
    }
  }

  function renderAdminTodaySchedule() {
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    const days = ['일','월','화','수','목','금','토'];
    document.getElementById('admin-today-label').textContent =
      today.getFullYear() + '년 ' + (today.getMonth()+1) + '월 ' + today.getDate() + '일 (' + days[today.getDay()] + ') 전체 스케줄';

    db.ref('trainers').once('value', snap => {
      if (!snap.exists()) {
        document.getElementById('admin-today-head').innerHTML = '';
        document.getElementById('admin-today-body').innerHTML = '<tr><td style="text-align:center;padding:20px;color:var(--text-hint);font-size:13px;">등록된 강사가 없어요</td></tr>';
        return;
      }
      const trainers = [];
      const schedules = {};
      snap.forEach(child => {
        const info = child.val();
        const name = localStorage.getItem('name_' + child.key) || child.key;
        trainers.push({ id: child.key, name });
        schedules[child.key] = info.schedule || {};
      });

      // 헤더
      var headHtml = '<tr><th style="background:var(--bg);border:0.5px solid var(--border);font-size:10px;color:var(--text-hint);padding:4px 1px;width:24px;">시</th>';
      trainers.forEach(t => {
        headHtml += '<th style="background:var(--bg);border:0.5px solid var(--border);font-size:11px;font-weight:700;color:var(--text);padding:5px 3px;text-align:center;">' + t.name + '</th>';
      });
      headHtml += '</tr>';
      document.getElementById('admin-today-head').innerHTML = headHtml;

      // 바디
      var bodyHtml = '';
      ADMIN_SCH_HOURS.forEach(h => {
        var hasData = trainers.some(t => schedules[t.id][todayStr + '_' + h]);
        bodyHtml += '<tr>';
        bodyHtml += '<td style="background:var(--bg);border:0.5px solid var(--border);font-size:10px;color:var(--text-hint);text-align:center;padding:3px 1px;">' + String(h).padStart(2,'0') + '</td>';
        trainers.forEach(t => {
          var name = schedules[t.id][todayStr + '_' + h] || '';
          var cell = name ? '<span style="font-size:10px;color:#0C447C;background:#E6F1FB;border-radius:3px;padding:1px 3px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + name + '</span>' : '';
          bodyHtml += '<td style="border:0.5px solid var(--border);padding:2px 2px;height:30px;vertical-align:middle;">' + cell + '</td>';
        });
        bodyHtml += '</tr>';
      });
      document.getElementById('admin-today-body').innerHTML = bodyHtml;
    });
  }



  function selectAdminTrainer(id, name, btn) {
    adminSelectedTrainer = { id, name };
    document.querySelectorAll('#admin-trainer-btns button').forEach(b => {
      b.style.background = 'var(--card)'; b.style.color = 'var(--text)'; b.style.border = '1px solid var(--border)';
    });
    btn.style.background = 'var(--blue)'; btn.style.color = 'white'; btn.style.border = 'none';
    adminTrainerBaseDate = new Date();
    renderAdminTrainerSchedule();
  }

  function changeAdminTrainerWeek(dir) {
    adminTrainerBaseDate.setDate(adminTrainerBaseDate.getDate() + dir * 7);
    renderAdminTrainerSchedule();
  }

  function renderAdminTrainerSchedule() {
    if (!adminSelectedTrainer) return;
    db.ref('trainers/' + adminSelectedTrainer.id + '/schedule').once('value', snap => {
      const data = snap.val() || {};
      const d = adminTrainerBaseDate;
      const day = d.getDay();
      const sunday = new Date(d); sunday.setDate(d.getDate() - day);
      const dates = Array.from({length:7}, (_,i) => { const dd = new Date(sunday); dd.setDate(sunday.getDate()+i); return dd; });
      const first = dates[0], last = dates[6];
      const today = new Date();

      document.getElementById('admin-trainer-week-label').textContent =
        adminSelectedTrainer.name + ' 강사 · ' + (first.getMonth()+1) + '/' + first.getDate() + ' ~ ' + (last.getMonth()+1) + '/' + last.getDate();

      var headHtml = '<tr><th style="background:var(--bg);border:0.5px solid var(--border);font-size:10px;color:var(--text-hint);padding:4px 1px;width:24px;">시</th>';
      dates.forEach(dd => {
        var isToday = dd.getFullYear()===today.getFullYear() && dd.getMonth()===today.getMonth() && dd.getDate()===today.getDate();
        var bg = isToday ? 'background:#E6F1FB;color:#0C447C;' : 'background:var(--bg);color:var(--text-sub);';
        headHtml += '<th style="' + bg + 'border:0.5px solid var(--border);font-size:11px;font-weight:700;padding:5px 1px;text-align:center;">' +
          ADMIN_SCH_DAYS[dd.getDay()] + '<br><span style="font-size:10px;font-weight:400;">' + dd.getDate() + '</span></th>';
      });
      headHtml += '</tr>';
      document.getElementById('admin-trainer-head').innerHTML = headHtml;

      var bodyHtml = '';
      ADMIN_SCH_HOURS.forEach(h => {
        bodyHtml += '<tr>';
        bodyHtml += '<td style="background:var(--bg);border:0.5px solid var(--border);font-size:10px;color:var(--text-hint);text-align:center;padding:3px 1px;">' + String(h).padStart(2,'0') + '</td>';
        dates.forEach(dd => {
          var isToday = dd.getFullYear()===today.getFullYear() && dd.getMonth()===today.getMonth() && dd.getDate()===today.getDate();
          var dateStr = dd.getFullYear() + '-' + String(dd.getMonth()+1).padStart(2,'0') + '-' + String(dd.getDate()).padStart(2,'0');
          var name = data[dateStr + '_' + h] || '';
          var todayBg = isToday ? 'background:#f0f8ff;' : '';
          var cell = name ? '<span style="font-size:10px;color:#0C447C;background:#E6F1FB;border-radius:3px;padding:1px 3px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + name + '</span>' : '';
          bodyHtml += '<td style="' + todayBg + 'border:0.5px solid var(--border);padding:2px 2px;height:30px;vertical-align:middle;">' + cell + '</td>';
        });
        bodyHtml += '</tr>';
      });
      document.getElementById('admin-trainer-body').innerHTML = bodyHtml;
    });
  }

  // ── 월별 리포트 ──
  let reportYear = new Date().getFullYear();
  let reportMonth = new Date().getMonth() + 1;

  function initReportMonth() {
    document.getElementById('report-month-label').textContent = reportYear + '년 ' + reportMonth + '월';
  }

  function changeReportMonth(dir) {
    reportMonth += dir;
    if (reportMonth > 12) { reportMonth = 1; reportYear++; }
    if (reportMonth < 1) { reportMonth = 12; reportYear--; }
    document.getElementById('report-month-label').textContent = reportYear + '년 ' + reportMonth + '월';
    loadMonthlyReport();
  }

  function updateReportTrainerSelect() {
    const sel = document.getElementById('report-trainer-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">강사 선택</option>' +
      adminTrainerList.map(t => '<option value="' + t.id + '">' + t.name + '</option>').join('');
  }

  function loadMonthlyReport() {
    const sel = document.getElementById('report-trainer-select');
    const trainerId = sel ? sel.value : '';
    const summaryEl = document.getElementById('report-summary');
    const membersEl = document.getElementById('report-members');
    if (!trainerId) {
      summaryEl.innerHTML = '';
      membersEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-hint);font-size:13px;">강사를 선택해주세요</div>';
      return;
    }
    summaryEl.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-hint);font-size:13px;grid-column:span 3;">불러오는 중...</div>';
    membersEl.innerHTML = '';

    const monthStr = reportYear + '-' + String(reportMonth).padStart(2,'0');
    const monthStrShort = reportYear + '-' + reportMonth + '-';
    const monthStrLong = reportYear + '-' + String(reportMonth).padStart(2,'0') + '-';

    function isInMonth(dateStr) {
      if (!dateStr) return false;
      return dateStr.startsWith(monthStrLong) || dateStr.startsWith(monthStrShort);
    }

    db.ref('trainers/' + trainerId + '/trainees').once('value', snap => {
      if (!snap.exists()) {
        summaryEl.innerHTML = '';
        membersEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-hint);font-size:13px;">담당 회원이 없어요</div>';
        return;
      }

      let totalSigns = 0, totalNoShow = 0, totalMemos = 0, totalLogs = 0;
      const memberCards = [];
      const promises = [];

      snap.forEach(traineeSnap => {
        const traineeId = traineeSnap.key;
        const traineeInfo = traineeSnap.val();
        const traineeName = traineeInfo.name || traineeId;

        const p = Promise.all([
          db.ref('trainers/' + trainerId + '/trainees/' + traineeId + '/signs').once('value'),
          db.ref('trainers/' + trainerId + '/trainees/' + traineeId + '/memo').once('value'),
          db.ref('trainers/' + trainerId + '/trainees/' + traineeId + '/logs').once('value')
        ]).then(([signsSnap, memoSnap, logsSnap]) => {
          // 이번달 서명 필터
          const signs = [];
          if (signsSnap.exists()) {
            signsSnap.forEach(s => {
              const v = s.val();
              if (isInMonth(v.date)) signs.push({ key: s.key, ...v });
            });
          }
          const signCount = signs.filter(s => !s.noShow).length;
          const noShowCount = signs.filter(s => s.noShow).length;

          // 이번달 수업일지 필터
          const logs = [];
          if (logsSnap.exists()) {
            logsSnap.forEach(l => {
              const v = l.val();
              if (isInMonth(v.date)) logs.push({ key: l.key, ...v });
            });
          }

          // 메모
          const memo = memoSnap.exists() ? memoSnap.val() : '';

          totalSigns += signCount;
          totalNoShow += noShowCount;
          if (memo) totalMemos++;
          totalLogs += logs.length;

          memberCards.push({ traineeName, signCount, noShowCount, memo, logs, traineeId, type: traineeInfo.type || '', remain: traineeInfo.remain || 0, total: traineeInfo.total || 0 });
        });
        promises.push(p);
      });

      Promise.all(promises).then(() => {
        // 요약
        summaryEl.innerHTML = [
          { label: '서명', value: totalSigns + '회', sub: '당일취소 ' + totalNoShow + '회' },
          { label: '메모', value: totalMemos + '건', sub: '' },
          { label: '수업일지', value: totalLogs + '건', sub: '' }
        ].map(s => `
          <div style="background:var(--bg);border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:11px;color:var(--text-hint);margin-bottom:4px;">${s.label}</div>
            <div style="font-size:20px;font-weight:700;color:var(--text);">${s.value}</div>
            ${s.sub ? '<div style="font-size:10px;color:var(--text-hint);">' + s.sub + '</div>' : ''}
          </div>`).join('');

        // 회원별 카드
        if (memberCards.length === 0) {
          membersEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-hint);font-size:13px;">이번 달 기록이 없어요</div>';
          return;
        }

        membersEl.innerHTML = memberCards.map((m, idx) => {
          const signBtnId = 'rpt-sign-' + idx;
          const memoBtnId = 'rpt-memo-' + idx;
          const logBtnId = 'rpt-log-' + idx;

          const signDetail = m.signCount + m.noShowCount > 0 ?
            m.signs ? '' : '' : '';

          return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              <div style="width:34px;height:34px;border-radius:50%;background:#E6F1FB;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#0C447C;flex-shrink:0;">${m.traineeName[0]}</div>
              <div>
                <div style="font-size:14px;font-weight:700;color:var(--text);">${m.traineeName}</div>
                <div style="font-size:11px;color:var(--text-hint);margin-top:2px;">${m.type ? m.type + ' · ' : ''}잔여 ${m.remain}회 / 총 ${m.total}회</div>
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button onclick="toggleRptDetail('${signBtnId}')" style="font-size:11px;padding:4px 8px;background:#E6F1FB;color:#0C447C;border:1px solid #B5D4F4;border-radius:6px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">✍️ 서명 ${m.signCount + m.noShowCount}회</button>
              ${m.memo ? '<button onclick="toggleRptDetail(\'' + memoBtnId + '\')" style="font-size:11px;padding:4px 8px;background:#EAF3DE;color:#3B6D11;border:1px solid #C0DD97;border-radius:6px;cursor:pointer;font-family:\'Noto Sans KR\',sans-serif;">📝 메모</button>' : ''}
              ${m.logs.length > 0 ? '<button onclick="toggleRptDetail(\'' + logBtnId + '\')" style="font-size:11px;padding:4px 8px;background:#FAEEDA;color:#854F0B;border:1px solid #FAC775;border-radius:6px;cursor:pointer;font-family:\'Noto Sans KR\',sans-serif;">📋 수업일지 ' + m.logs.length + '건</button>' : ''}
            </div>
            <div id="${signBtnId}" style="display:none;margin-top:8px;background:var(--bg);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);line-height:1.8;">
              <div style="font-size:11px;color:var(--text-hint);margin-bottom:4px;font-weight:700;">서명 기록</div>
              ${m.signCount + m.noShowCount === 0 ? '이번 달 서명 없음' :
                m.traineeSigns ? m.traineeSigns.map(s => s.date + ' ' + (s.noShow ? '🔴 당일취소' : '✅ 서명완료')).join('<br>') : '서명 ' + m.signCount + '회 / 당일취소 ' + m.noShowCount + '회'}
            </div>
            ${m.memo ? '<div id="' + memoBtnId + '" style="display:none;margin-top:8px;background:var(--bg);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);line-height:1.8;"><div style="font-size:11px;color:var(--text-hint);margin-bottom:4px;font-weight:700;">메모</div>' + m.memo + '</div>' : ''}
            ${m.logs.length > 0 ? '<div id="' + logBtnId + '" style="display:none;margin-top:8px;background:var(--bg);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);line-height:1.8;"><div style="font-size:11px;color:var(--text-hint);margin-bottom:4px;font-weight:700;">수업일지</div>' + m.logs.map(l => '<div style="margin-bottom:4px;">' + l.date + ' ' + (l.savedAt||'') + '<br>' + l.content + '</div>').join('') + '</div>' : ''}
          </div>`;
        }).join('');
      });
    });
  }

  function toggleRptDetail(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }

  // ── 이전 등록 이력 토글 ──
  function toggleTraineeHistory() {
    const list = document.getElementById('trainee-history-list');
    const arrow = document.getElementById('trainee-history-arrow');
    if (!list) return;
    if (list.style.display === 'none') {
      list.style.display = 'block';
      arrow.textContent = '▴';
      // 열 때마다 Firebase에서 최신 이력 불러오기
      loadTraineeHistory(currentTraineeId);
    } else {
      list.style.display = 'none';
      arrow.textContent = '▾';
    }
  }

  // ── 재등록 ──
  function openReregisterModal() {
    if (!currentTraineeId) return;
    const trainerId = localStorage.getItem('current_user');
    db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId).once('value', snap => {
      const info = snap.val() || {};
      const name = info.name || currentTraineeId;
      const type = info.type || 'PT';
      const total = info.total || 0;
      document.getElementById('reregister-info').textContent = name + ' · ' + type + ' · 기존 ' + total + '회 완료';
      document.getElementById('reregister-type').value = type;
      document.getElementById('reregister-count').value = '';
      document.getElementById('reregister-modal').style.display = 'flex';
    });
  }

  function closeReregisterModal() {
    document.getElementById('reregister-modal').style.display = 'none';
  }

  function saveReregister() {
    if (!currentTraineeId) return;
    const trainerId = localStorage.getItem('current_user');
    const type = document.getElementById('reregister-type').value.trim();
    const count = parseInt(document.getElementById('reregister-count').value) || 0;
    if (!type) { alert('수업 종류를 입력해주세요.'); return; }
    if (!count || count < 1) { alert('횟수를 입력해주세요.'); return; }
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');

    db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId).once('value', snap => {
      const info = snap.val() || {};
      const prevTotal = info.total || 0;
      const prevType = info.type || '';
      const prevRemain = info.remain || 0;

      // 잔여횟수 합산
      const newRemain = prevRemain + count;

      const regKey = 'reg_' + Date.now();
      const prevReg = { type: prevType, total: prevTotal, remain: prevRemain, date: dateStr, completed: prevRemain === 0 };

      Promise.all([
        db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/registrations/' + regKey).set(prevReg),
        db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId).update({ type, total: count, remain: newRemain })
      ]).then(() => {
        document.getElementById('trainee-card-type').textContent = type;
        document.getElementById('trainee-card-remain').textContent = newRemain;
        document.getElementById('trainee-card-total').textContent = count;
        loadTraineeHistory(currentTraineeId);
        alert('✅ ' + count + '회 재등록 완료!\n총 잔여 횟수: ' + newRemain + '회');
        closeReregisterModal();
      });
    });
  }

  function loadTraineeHistory(traineeId) {
    const trainerId = localStorage.getItem('current_user');
    db.ref('trainers/' + trainerId + '/trainees/' + traineeId + '/registrations').once('value', snap => {
      const historyEl = document.getElementById('trainee-history-list');
      const btn = document.getElementById('trainee-history-btn');
      if (!historyEl) return;
      if (!snap.exists()) {
        btn.style.display = 'none';
        return;
      }
      btn.style.display = 'flex';
      const regs = [];
      snap.forEach(child => regs.push({ key: child.key, ...child.val() }));
      regs.sort((a, b) => b.key > a.key ? 1 : -1);
      historyEl.innerHTML = regs.map((r, i) =>
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:0.5px solid rgba(255,255,255,0.15);">' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="background:rgba(255,255,255,0.15);border-radius:20px;padding:1px 7px;font-size:10px;color:white;">' + (regs.length - i) + '차</span>' +
            '<span style="font-size:11px;color:white;">' + r.type + ' ' + r.total + '회 ' + (r.completed ? '완료' : '잔여 ' + r.remain + '회') + '</span>' +
          '</div>' +
          '<span style="font-size:10px;color:#B5D4F4;">' + r.date + '</span>' +
        '</div>'
      ).join('');
    });
  }

  function openNoticeDetail(id) {
    db.ref('notices/' + id).once('value').then(snap => {
      if (!snap.exists()) return;
      const n = snap.val();
      document.getElementById('notice-detail-content').innerHTML = `
        <div style="margin-bottom:16px;">
          <div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:8px;line-height:1.4;">${n.title}</div>
          <div style="font-size:12px;color:var(--text-hint);margin-bottom:14px;">${n.dateLabel}</div>
          <div style="font-size:15px;color:var(--text-sub);line-height:1.8;white-space:pre-wrap;">${n.content}</div>
        </div>`;
      document.getElementById('notice-detail-modal').classList.add('active');
    });
  }
  function closeNoticeDetail() {
    document.getElementById('notice-detail-modal').classList.remove('active');
  }

  // ── 운동기록 수정 ──
  let editWorkoutKey = null, editWorkoutDate = null, editSetCount = 0;

  function openEditWorkoutModal(storageKey, date) {
    editWorkoutKey = storageKey; editWorkoutDate = date; editSetCount = 0;
    const records = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const record = records.find(r => r.date === date);
    if (!record) return;
    document.getElementById('edit-set-list').innerHTML = '';
    for (const s of record.sets) addEditSetWithValue(s.weight, s.reps);
    document.getElementById('edit-workout-memo').value = record.memo || '';
    document.getElementById('edit-workout-modal').classList.add('active');
  }

  function addEditSetWithValue(weight, reps) {
    editSetCount++;
    const list = document.getElementById('edit-set-list');
    const row = document.createElement('div');
    row.id = 'edit-row-' + editSetCount;
    row.style.cssText = 'display:grid;grid-template-columns:36px 1fr 1fr 36px;gap:4px;margin-bottom:8px;align-items:center;padding-right:2px;';
    row.innerHTML = `
      <div style="text-align:center;font-size:13px;font-weight:700;color:white;background:var(--blue);border-radius:8px;height:40px;display:flex;align-items:center;justify-content:center;">${editSetCount}</div>
      <input type="number" value="${weight||''}" placeholder="0" min="0" max="500" step="2.5"
        style="padding:9px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-weight:700;text-align:center;width:100%;box-sizing:border-box;font-family:'Noto Sans KR',sans-serif;outline:none;"
        id="edit-weight-${editSetCount}" onfocus="this.style.borderColor='#1a6fd4'" onblur="this.style.borderColor='var(--border)'" />
      <input type="number" value="${reps||''}" placeholder="0" min="0" max="9999"
        style="padding:9px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-weight:700;text-align:center;width:100%;box-sizing:border-box;font-family:'Noto Sans KR',sans-serif;outline:none;"
        id="edit-reps-${editSetCount}" onfocus="this.style.borderColor='#1a6fd4'" onblur="this.style.borderColor='var(--border)'" />
      <button onclick="removeEditSet(${editSetCount})" style="width:36px;height:36px;border:none;background:#fee2e2;color:#ef4444;border-radius:8px;cursor:pointer;font-size:16px;">×</button>`;
    list.appendChild(row);
  }
  function addEditSet() { addEditSetWithValue(0, 0); }
  function removeEditSet(n) { const r = document.getElementById('edit-row-' + n); if (r) r.remove(); }

  // localStorage 키 → Firebase 경로 변환
  function getFirebaseWorkoutPath(storageKey, userId) {
    // workout_기구key_userId → workouts/기구key
    // freeweight_운동명_userId → workouts/fw_운동명
    // workout_dual_front_기구key_userId → workouts/dual_front_기구key
    // workout_dual_back_기구key_userId → workouts/dual_back_기구key
    // cardio_종류_userId → workouts/cardio_종류
    const base = storageKey.replace('_' + userId, '');
    if (base.startsWith('workout_dual_front_')) return 'workouts/dual_front_' + base.replace('workout_dual_front_', '');
    if (base.startsWith('workout_dual_back_'))  return 'workouts/dual_back_'  + base.replace('workout_dual_back_', '');
    if (base.startsWith('workout_'))            return 'workouts/' + base.replace('workout_', '');
    if (base.startsWith('freeweight_'))         return 'workouts/fw_' + base.replace('freeweight_', '');
    if (base.startsWith('cardio_'))             return 'workouts/' + base;
    return null;
  }

  function saveEditedWorkout() {
    const sets = [];
    for (let i = 1; i <= editSetCount; i++) {
      const wEl = document.getElementById('edit-weight-' + i);
      const rEl = document.getElementById('edit-reps-' + i);
      if (!wEl || !rEl) continue;
      const w = parseFloat(wEl.value) || 0;
      const r = parseInt(rEl.value) || 0;
      if (w > 0 || r > 0) sets.push({ set: sets.length + 1, weight: w, reps: r });
    }
    if (sets.length === 0) { alert('최소 1세트 이상 입력해주세요!'); return; }
    const memo = document.getElementById('edit-workout-memo').value.trim();
    const records = JSON.parse(localStorage.getItem(editWorkoutKey) || '[]');
    const idx = records.findIndex(r => r.date === editWorkoutDate);
    if (idx !== -1) {
      records[idx].sets = sets;
      records[idx].memo = memo;
      localStorage.setItem(editWorkoutKey, JSON.stringify(records));
      // Firebase 반영
      const userId = localStorage.getItem('current_user');
      const fbPath = getFirebaseWorkoutPath(editWorkoutKey, userId);
      if (fbPath) db.ref('users/' + userId + '/' + fbPath + '/' + editWorkoutDate).set(records[idx]);
    }
    closeEditWorkoutModal();
    if (calSelectedDate) renderDayDetail(calSelectedDate);
    if (currentEquipment) loadPrevRecords();
    alert('수정됐어요! ✅');
  }

  function deleteWorkoutRecord() {
    if (!confirm('이 날의 운동기록을 삭제할까요?')) return;
    const userId = localStorage.getItem('current_user');
    const records = JSON.parse(localStorage.getItem(editWorkoutKey) || '[]');
    const filtered = records.filter(r => r.date !== editWorkoutDate);
    localStorage.setItem(editWorkoutKey, JSON.stringify(filtered));
    // Firebase 반영
    const fbPath = getFirebaseWorkoutPath(editWorkoutKey, userId);
    if (fbPath) db.ref('users/' + userId + '/' + fbPath + '/' + editWorkoutDate).remove();
    closeEditWorkoutModal();
    if (calSelectedDate) renderDayDetail(calSelectedDate);
    if (currentEquipment) loadPrevRecords();
    alert('삭제됐어요! 🗑');
  }

  function closeEditWorkoutModal() {
    document.getElementById('edit-workout-modal').classList.remove('active');
    editWorkoutKey = null; editWorkoutDate = null;
  }

  // ══════════════════════════════
  // Firebase 회원 DB

  // 회원 정보 읽기 (Firebase)
  function getMemberDB() {
    return new Promise(resolve => {
      db.ref('members').once('value').then(snap => {
        resolve(snap.val() || {});
      }).catch(() => resolve({}));
    });
  }

  // ── 관리자 대시보드 ──
  function loadAdminDashboard() {
    getMemberDB().then(members => {
      const memberList = Object.entries(members);
      document.getElementById('admin-total-members').textContent = memberList.length;

      const today = getToday();
      let todayCount = 0, monthCount = 0;
      const now = new Date();
      const monthPrefix = now.getFullYear() + '-' + (now.getMonth()+1) + '-';
      const todayRows = [];

      // Firebase에서 전체 회원 출석 확인
      const attendPromises = memberList.map(([phone, info]) =>
        db.ref('users/' + phone + '/attendance').once('value').then(snap => {
          const attendData = snap.val() || {};
          // localStorage 동기화
          Object.keys(attendData).forEach(dateKey => {
            localStorage.setItem('attend_' + phone + '_' + dateKey, 'done');
          });
          const todayAttend = !!attendData[today];
          const monthAtt = Object.keys(attendData).filter(k => k.startsWith(monthPrefix)).length;
          return { phone, info, todayAttend, monthAtt };
        }).catch(() => {
          // Firebase 실패 시 localStorage fallback
          const todayAttend = localStorage.getItem('attend_' + phone + '_' + today) === 'done';
          let monthAtt = 0;
          for (let d = 1; d <= 31; d++) {
            if (localStorage.getItem('attend_' + phone + '_' + monthPrefix + d) === 'done') monthAtt++;
          }
          return { phone, info, todayAttend, monthAtt };
        })
      );

      Promise.all(attendPromises).then(results => {
        results.forEach(({ phone, info, todayAttend, monthAtt }) => {
          if (todayAttend) {
            todayCount++;
            const nick = localStorage.getItem('name_' + phone) || info.name;
            todayRows.push({ phone, name: info.name, nick });
          }
          monthCount += monthAtt;
        });

        document.getElementById('admin-today-attend').textContent = todayCount;
        document.getElementById('admin-month-attend').textContent = monthCount;

        const listEl = document.getElementById('admin-today-list');
        if (todayRows.length === 0) {
          listEl.innerHTML = '<div class="empty-state">오늘 출석한 회원이 없어요</div>';
        } else {
          listEl.innerHTML = todayRows.map(m => `
            <div class="member-row">
              <div class="member-avatar">${m.name[0]}</div>
              <div class="member-info">
                <div class="member-name">${m.name}</div>
                <div class="member-phone">${m.nick !== m.name ? '닉네임: ' + m.nick + ' · ' : ''}${m.phone}</div>
              </div>
              <span class="member-badge badge-active">출석완료</span>
            </div>
          `).join('');
        }
      });
    });
  }

  // ── 회원 목록 ──
  let currentMemberPhone = null;
  let cachedMembers = {};

  function loadMemberList(query = '') {
    getMemberDB().then(members => {
      cachedMembers = members;
      const wrap = document.getElementById('member-list-wrap');
      let entries = Object.entries(members);
      if (query) {
        entries = entries.filter(([phone, info]) =>
          info.name.includes(query) || phone.includes(query)
        );
      }
      if (entries.length === 0) {
        wrap.innerHTML = '<div class="empty-state">등록된 회원이 없어요<br/>회원등록 탭에서 추가해주세요</div>';
        return;
      }
      // Firebase에서 출석/포인트 병렬 조회
      const now = new Date();
      const monthPrefix = now.getFullYear() + '-' + (now.getMonth()+1) + '-';
      Promise.all(entries.map(([phone, info]) =>
        Promise.all([
          db.ref('users/' + phone + '/attendance').once('value'),
          db.ref('users/' + phone + '/points').once('value')
        ]).then(([attSnap, ptsSnap]) => {
          const attendData = attSnap.val() || {};
          const attendCount = Object.keys(attendData).filter(k => k.startsWith(monthPrefix)).length ||
            (() => { let c=0; for(let d=1;d<=31;d++) { if(localStorage.getItem('attend_'+phone+'_'+monthPrefix+d)==='done') c++; } return c; })();
          const pts = ptsSnap.val() ?? localStorage.getItem('points_' + phone) ?? '0';
          localStorage.setItem('points_' + phone, String(pts));
          const nick = localStorage.getItem('name_' + phone) || '-';
          return [phone, info, attendCount, pts, nick];
        }).catch(() => {
          const pts = localStorage.getItem('points_' + phone) || '0';
          let attendCount = 0;
          for(let d=1;d<=31;d++) { if(localStorage.getItem('attend_'+phone+'_'+monthPrefix+d)==='done') attendCount++; }
          const nick = localStorage.getItem('name_' + phone) || '-';
          return [phone, info, attendCount, pts, nick];
        })
      )).then(memberData => {
      wrap.innerHTML = memberData.map(([phone, info, attendCount, pts, nick]) => {
        return `
          <div class="admin-card" style="cursor:pointer;" onclick="openMemberModal('${phone}')">
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="member-avatar">${info.name[0]}</div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:6px;">
                  <div class="member-name">${info.name}</div>
                  ${info.programs && info.programs.length > 0 ? `<span style="font-size:11px;color:var(--blue);background:var(--blue-light);padding:2px 6px;border-radius:6px;">${info.programs[0]}</span>` : ''}
                </div>
                <div class="member-phone">${phone}</div>
                ${nick !== '-' ? `<div style="font-size:12px;color:var(--text-hint);margin-top:1px;">닉네임: ${nick}</div>` : ''}
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
            <div class="stat-mini" style="margin-top:10px;">
              <div class="stat-mini-item"><div class="stat-mini-val">${attendCount}</div><div class="stat-mini-label">이번달 출석</div></div>
              <div class="stat-mini-item"><div class="stat-mini-val">${pts}</div><div class="stat-mini-label">포인트</div></div>
              <div class="stat-mini-item"><div class="stat-mini-val">${info.programs ? info.programs.length : 0}</div><div class="stat-mini-label">프로그램</div></div>
            </div>
          </div>
        `;
      }).join('');
      }); // Promise.all 닫기
    });
  }

  function searchMembers(query) { loadMemberList(query); }

  // ── 회원 상세 모달 ──
  function openMemberModal(phone) {
    currentMemberPhone = phone;
    const info = cachedMembers[phone];
    if (!info) return;

    const nick = localStorage.getItem('name_' + phone) || '미설정';
    const now = new Date();
    const monthPrefix = now.getFullYear() + '-' + (now.getMonth()+1) + '-';
    const today = getToday();

    // Firebase에서 출석/포인트 불러오기
    Promise.all([
      db.ref('users/' + phone + '/attendance').once('value'),
      db.ref('users/' + phone + '/points').once('value')
    ]).then(([attSnap, ptsSnap]) => {
      const attendData = attSnap.val() || {};
      const attendCount = Object.keys(attendData).filter(k => k.startsWith(monthPrefix)).length;
      const todayAttend = !!attendData[today];
      const pts = ptsSnap.val() ?? localStorage.getItem('points_' + phone) ?? '0';
      localStorage.setItem('points_' + phone, String(pts));
      _renderMemberModal(info, phone, nick, pts, attendCount, todayAttend);
    }).catch(() => {
      const pts = localStorage.getItem('points_' + phone) || '0';
      let attendCount = 0;
      for (let d = 1; d <= 31; d++) {
        if (localStorage.getItem('attend_' + phone + '_' + monthPrefix + d) === 'done') attendCount++;
      }
      const todayAttend = localStorage.getItem('attend_' + phone + '_' + today) === 'done';
      _renderMemberModal(info, phone, nick, pts, attendCount, todayAttend);
    });
  }

  function _renderMemberModal(info, phone, nick, pts, attendCount, todayAttend) {

    document.getElementById('modal-member-name').textContent = info.name + ' 회원';
    document.getElementById('modal-member-info').innerHTML = `
      <div style="background:var(--bg);border-radius:var(--radius-sm);padding:14px;margin-bottom:14px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div><div style="font-size:11px;color:var(--text-hint);margin-bottom:3px;">이름</div><div style="font-size:14px;font-weight:700;">${info.name}</div></div>
          <div><div style="font-size:11px;color:var(--text-hint);margin-bottom:3px;">닉네임</div><div style="font-size:14px;font-weight:700;">${nick}</div></div>
          <div><div style="font-size:11px;color:var(--text-hint);margin-bottom:3px;">전화번호</div><div style="font-size:14px;font-weight:700;">${phone}</div></div>
          <div><div style="font-size:11px;color:var(--text-hint);margin-bottom:3px;">오늘 출석</div><div style="font-size:14px;font-weight:700;">${todayAttend ? '✅ 완료' : '❌ 미완료'}</div></div>
          <div><div style="font-size:11px;color:var(--text-hint);margin-bottom:3px;">이번달 출석</div><div style="font-size:14px;font-weight:700;">${attendCount}일</div></div>
          <div><div style="font-size:11px;color:var(--text-hint);margin-bottom:3px;">보유 포인트</div><div style="font-size:14px;font-weight:700;">${pts}P</div></div>
        </div>
        ${info.programs && info.programs.length > 0 ? `
          <div style="margin-top:10px;">
            <div style="font-size:11px;color:var(--text-hint);margin-bottom:6px;">등록 프로그램</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">${info.programs.map(p => `<span style="background:var(--blue-light);color:var(--blue);font-size:12px;padding:4px 10px;border-radius:8px;font-weight:600;">${p}</span>`).join('')}</div>
          </div>` : ''}
      </div>
    `;
    document.getElementById('member-detail-modal').classList.add('active');
  }

  function closeMemberModal() {
    document.getElementById('member-detail-modal').classList.remove('active');
    currentMemberPhone = null;
  }

  function openEditMemberModal() {
    const phone = currentMemberPhone;
    const info = cachedMembers[phone];
    if (!info) return;
    document.getElementById('edit-member-name').value = info.name || '';
    document.getElementById('edit-member-phone').value = phone;
    // 프로그램 체크박스 초기화
    document.querySelectorAll('#edit-member-programs input').forEach(cb => {
      cb.checked = info.programs && info.programs.includes(cb.value);
    });
    document.getElementById('edit-member-modal').classList.add('active');
  }

  function closeEditMemberModal() {
    document.getElementById('edit-member-modal').classList.remove('active');
  }

  function saveEditMember() {
    const newName  = document.getElementById('edit-member-name').value.trim();
    const newPhone = document.getElementById('edit-member-phone').value.trim().replace(/-/g, '');
    const programs = [...document.querySelectorAll('#edit-member-programs input:checked')].map(el => el.value);
    const oldPhone = currentMemberPhone;
    const info = cachedMembers[oldPhone];

    if (!newName)  { alert('이름을 입력해주세요.'); return; }
    if (!newPhone || newPhone.length < 10) { alert('전화번호를 정확히 입력해주세요.'); return; }

    const phoneChanged = newPhone !== oldPhone;

    const doSave = () => {
      if (phoneChanged) {
        // 전화번호 변경: 기존 데이터 복사 후 삭제
        const newData = { ...info, name: newName, programs };
        db.ref('members/' + newPhone).set(newData).then(() => {
          db.ref('members/' + oldPhone).remove();
          closeEditMemberModal();
          closeMemberModal();
          loadMemberList();
          alert('✅ 회원정보가 수정됐어요!\n새 아이디: ' + newPhone);
        });
      } else {
        db.ref('members/' + oldPhone).update({ name: newName, programs }).then(() => {
          // 이름도 localStorage 업데이트
          localStorage.setItem('name_' + oldPhone, newName);
          cachedMembers[oldPhone] = { ...info, name: newName, programs };
          closeEditMemberModal();
          closeMemberModal();
          loadMemberList();
          alert('✅ 회원정보가 수정됐어요!');
        });
      }
    };

    // 전화번호 변경 시 중복 확인
    if (phoneChanged) {
      db.ref('members/' + newPhone).once('value').then(snap => {
        if (snap.exists()) { alert('이미 사용 중인 전화번호예요.'); return; }
        if (!confirm('전화번호를 ' + newPhone + '으로 변경할까요?\n로그인 아이디도 바뀌어요.')) return;
        doSave();
      });
    } else {
      doSave();
    }
  }

  function editMemberPw() {
    const newPw = prompt('새 비밀번호를 입력하세요 (4자리):');
    if (!newPw || newPw.length < 4) { alert('4자리를 입력해주세요.'); return; }
    db.ref('members/' + currentMemberPhone + '/pw').set(newPw).then(() => {
      alert('비밀번호가 변경됐어요: ' + newPw);
      closeMemberModal();
    });
  }

  function editMemberPoint() {
    const cur = localStorage.getItem('points_' + currentMemberPhone) || '0';
    const newPt = prompt('포인트를 입력하세요 (현재: ' + cur + 'P):');
    if (newPt === null) return;
    if (isNaN(newPt)) { alert('숫자만 입력해주세요.'); return; }
    const pt = parseInt(newPt);
    // 로컬스토리지 업데이트
    localStorage.setItem('points_' + currentMemberPhone, pt);
    // Firebase 반영
    db.ref('users/' + currentMemberPhone + '/points').set(pt);
    alert('포인트가 ' + pt + 'P로 변경됐어요.');
    closeMemberModal();
    loadMemberList();
  }

  // ── 회원 localStorage 데이터 초기화 ──
  function clearMemberLocalData(userId) {
    const keysToDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // 해당 userId 관련 키 모두 수집
      if (key && (
        key.endsWith('_' + userId) ||
        key.includes('_' + userId + '_') ||
        key.startsWith('attend_' + userId) ||
        key.startsWith('points_' + userId) ||
        key.startsWith('workout_') && key.endsWith('_' + userId) ||
        key.startsWith('freeweight_') && key.endsWith('_' + userId) ||
        key.startsWith('cardio_') && key.endsWith('_' + userId) ||
        key === 'freeweight_index_' + userId ||
        key === 'cardio_index_' + userId ||
        key === 'name_' + userId ||
        key === 'auto_login_user' && localStorage.getItem(key) === userId
      )) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => localStorage.removeItem(key));
    console.log('회원 데이터 초기화 완료:', userId, '삭제된 키:', keysToDelete.length);
  }

  // ── 회원 삭제 ──
  function deleteMember() {
    const info = cachedMembers[currentMemberPhone];
    const name = info ? info.name : '';
    if (!confirm(name + ' 회원을 삭제할까요?\n삭제 후 복구가 어렵습니다.')) return;

    const phone = currentMemberPhone;

    // Firebase 회원 삭제
    db.ref('members/' + phone).remove().then(() => {
      // 삭제 기록 Firebase에 저장 (재등록 시 localStorage 초기화 용도)
      db.ref('deleted_members/' + phone).set({
        deletedAt: Date.now(),
        name: name
      }).then(() => {
        closeMemberModal();
        loadMemberList();
        alert('✅ ' + name + ' 회원이 삭제됐어요.\n재등록 시 기존 데이터가 초기화됩니다.');
      });
    });
  }

  // ── 회원 등록 (Firebase) ──
  function registerMember() {
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim().replace(/-/g, '');
    const pwInput = document.getElementById('reg-pw').value.trim();
    const pw = pwInput || phone.slice(-4);

    if (!name) { alert('이름을 입력해주세요.'); return; }
    if (!phone || phone.length < 10) { alert('휴대폰 번호를 정확히 입력해주세요.'); return; }

    const programs = [...document.querySelectorAll('#reg-programs input:checked')].map(el => el.value);

    // 번호 중복 + 이름 중복 확인
    db.ref('members/' + phone).once('value').then(snap => {
      if (snap.exists()) { alert('이미 등록된 전화번호예요.'); return; }

      // 이름 중복 확인 - 전체 회원 조회
      db.ref('members').once('value').then(allSnap => {
        let duplicateName = false;
        allSnap.forEach(child => {
          if ((child.val().name || '').trim() === name) duplicateName = true;
        });
        if (duplicateName) {
          alert('⚠️ 이미 같은 이름의 회원이 있어요.\n동명이인이면 등록을 계속 진행하세요.');
          // 확인 팝업으로 계속 진행 여부 선택
          if (!confirm('동명이인으로 등록할까요?')) return;
        }

        db.ref('members/' + phone).set({ name, pw, programs }).then(() => {
          document.getElementById('reg-name').value = '';
          document.getElementById('reg-phone').value = '';
          document.getElementById('reg-pw').value = '';
          document.querySelectorAll('#reg-programs input').forEach(el => el.checked = false);
          alert('✅ ' + name + ' 회원이 등록됐어요!\n아이디: ' + phone + '\n비밀번호: ' + pw);
        });
      });
    });
  }

  // ── 공지사항 (Firebase) ──
  function debugNotices() {
    db.ref('notices').once('value', snap => {
      const total = snap.numChildren();
      const items = [];
      snap.forEach(child => {
        const v = child.val();
        items.push(`키: ${child.key} | 제목: ${v.title||'없음'} | createdAt: ${v.createdAt||'없음'} | id필드: ${v.id||'없음'}`);
      });
      alert(`Firebase notices 총 ${total}개\n\n${items.join('\n\n') || '데이터 없음'}`);
    }, err => {
      alert('Firebase 읽기 오류: ' + err.message + '\n\n→ Firebase 콘솔에서 DB 규칙을 확인해주세요.\n읽기 규칙이 true인지 확인하세요.');
    });
  }

  function registerNotice() {
    const title = document.getElementById('notice-title').value.trim();
    const content = document.getElementById('notice-content').value.trim();
    if (!title) { alert('제목을 입력해주세요.'); return; }
    if (!content) { alert('내용을 입력해주세요.'); return; }
    const now = new Date();
    const notice = {
      title, content,
      createdAt: Date.now(),
      date: (now.getMonth()+1) + '.' + now.getDate(),
      dateLabel: now.getFullYear() + '.' + (now.getMonth()+1) + '.' + now.getDate()
    };
    db.ref('notices').push(notice).then(() => {
      document.getElementById('notice-title').value = '';
      document.getElementById('notice-content').value = '';
      loadNoticeListAdmin();
      loadHomeNotices();
      alert('✅ 공지사항이 등록됐어요!');
    }).catch(err => { alert('등록 실패: ' + err.message); });
  }

  function deleteNotice(key) {
    if (!confirm('이 공지를 삭제할까요?')) return;
    db.ref('notices/' + key).remove().then(() => {
      loadNoticeListAdmin();
      loadHomeNotices();
    }).catch(err => { alert('삭제 실패: ' + err.message); });
  }

  let editNoticeKey = null;

  function openEditNoticeModal(key, title, content) {
    editNoticeKey = key;
    document.getElementById('edit-notice-title').value = title;
    document.getElementById('edit-notice-content').value = content.replace(/\\n/g, '\n');
    document.getElementById('edit-notice-modal').style.display = 'flex';
  }

  function closeEditNoticeModal() {
    document.getElementById('edit-notice-modal').style.display = 'none';
    editNoticeKey = null;
  }

  function saveEditNotice() {
    if (!editNoticeKey) return;
    const title = document.getElementById('edit-notice-title').value.trim();
    const content = document.getElementById('edit-notice-content').value.trim();
    if (!title) { alert('제목을 입력해주세요.'); return; }
    if (!content) { alert('내용을 입력해주세요.'); return; }
    db.ref('notices/' + editNoticeKey).update({ title, content }).then(() => {
      alert('✅ 수정됐어요!');
      closeEditNoticeModal();
      loadNoticeListAdmin();
      loadHomeNotices();
    }).catch(err => { alert('수정 실패: ' + err.message); });
  }

  function deleteNoticeFromEdit() {
    if (!editNoticeKey) return;
    if (!confirm('이 공지를 삭제할까요?')) return;
    db.ref('notices/' + editNoticeKey).remove().then(() => {
      closeEditNoticeModal();
      loadNoticeListAdmin();
      loadHomeNotices();
    }).catch(err => { alert('삭제 실패: ' + err.message); });
  }

  function loadNoticeListAdmin() {
    db.ref('notices').once('value', snap => {
      const el = document.getElementById('notice-list-admin');
      if (!el) return;
      const notices = [];
      snap.forEach(child => {
        const v = child.val();
        const sortKey = v.createdAt || v.id || 0;
        notices.push({ firebaseKey: child.key, ...v, createdAt: sortKey });
      });
      notices.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (notices.length === 0) {
        el.innerHTML = '<div class="empty-state">등록된 공지사항이 없어요</div>'; return;
      }
      el.innerHTML = notices.map(n => `
        <div style="padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:700;margin-bottom:4px;">${n.title}</div>
              <div style="font-size:13px;color:var(--text-sub);line-height:1.5;">${n.content}</div>
              <div style="font-size:12px;color:var(--text-hint);margin-top:4px;">${n.dateLabel||n.date||''}</div>
            </div>
            <button onclick="openEditNoticeModal('${n.firebaseKey}','${n.title.replace(/'/g,"\\'")}','${n.content.replace(/'/g,"\\'").replace(/\n/g,'\\n')}')" class="btn-sm" style="flex-shrink:0;background:var(--blue-light);color:var(--blue);border:none;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;">수정</button>
          </div>
        </div>`).join('');
    });
  }

  function loadHomeNotices() {
    db.ref('notices').once('value', snap => {
      const container = document.querySelector('#screen-home .notice-container');
      if (!container) return;
      const notices = [];
      snap.forEach(child => {
        const v = child.val();
        const sortKey = v.createdAt || v.id || 0;
        notices.push({ firebaseKey: child.key, ...v, createdAt: sortKey });
      });
      notices.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (notices.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-hint);font-size:13px;">등록된 공지사항이 없어요</div>';
        return;
      }
      container.innerHTML = notices.map((n, i) => `
        <div class="notice-card" onclick="openNoticeDetail('${n.firebaseKey}')" style="cursor:pointer;">
          <div class="notice-dot" style="${i > 0 ? 'background:#9aa3b2;' : ''}"></div>
          <div class="notice-text">${n.title}</div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <div class="notice-date">${n.date||''}</div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>`).join('');
    });
  }


  // ══════════════════════════════
  // 강사 관리 탭 기능
  // ══════════════════════════════

  let currentTraineeId = null; // 현재 선택된 담당 회원 ID
  let currentTraineeTab = 'record'; // 현재 선택된 탭

  // 강사 운동기록 관련 변수
  let trainerCalYear = new Date().getFullYear();
  let trainerCalMonth = new Date().getMonth() + 1;
  let trainerCalSelectedDate = null;
  let trainerCurrentEquipment = null;
  let trainerSetCount = 0;
  let trainerFwSetCount = 0;
  let trainerRestTimer = null;
  let trainerRestRemain = 0;
  let trainerFwRestTimer = null;
  let trainerFwRestRemain = 0;

  // 강사 관리 탭 로드
  // ── 수업 스케줄 ──
  const SCHEDULE_HOURS = Array.from({length: 18}, (_, i) => i + 6);
  const SCHEDULE_DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  let scheduleBaseDate = new Date();
  let scheduleData = {};
  let scheduleActiveKey = null;

  function fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  function getScheduleWeekDates(base) {
    const d = new Date(base);
    const day = d.getDay();
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - day);
    return Array.from({length: 7}, (_, i) => {
      const dd = new Date(sunday);
      dd.setDate(sunday.getDate() + i);
      return dd;
    });
  }

  function isScheduleToday(d) {
    const t = new Date();
    return d.getFullYear()===t.getFullYear() && d.getMonth()===t.getMonth() && d.getDate()===t.getDate();
  }

  function showSchedule() {
    scheduleBaseDate = new Date();
    showScreen('screen-schedule');
    loadScheduleData();
  }

  function loadScheduleData() {
    const trainerId = localStorage.getItem('current_user');
    const dates = getScheduleWeekDates(scheduleBaseDate);
    const startDate = fmtDate(dates[0]);
    const endDate = fmtDate(dates[6]);
    db.ref('trainers/' + trainerId + '/schedule').once('value', snap => {
      scheduleData = snap.val() || {};
      renderSchedule();
    });
  }

  function renderSchedule() {
    const dates = getScheduleWeekDates(scheduleBaseDate);
    const first = dates[0], last = dates[6];
    document.getElementById('schedule-week-label').textContent =
      (first.getMonth()+1) + '/' + first.getDate() + ' ~ ' + (last.getMonth()+1) + '/' + last.getDate();

    var headHtml = '<tr>';
    headHtml += '<th style="background:var(--bg);color:var(--text-hint);font-size:10px;padding:4px 1px;border:0.5px solid var(--border);width:24px;">시</th>';
    dates.forEach(d => {
      var todayCls = isScheduleToday(d) ? 'background:#E6F1FB;color:#0C447C;' : 'background:var(--bg);color:var(--text-sub);';
      headHtml += '<th style="' + todayCls + 'font-size:11px;font-weight:700;padding:5px 1px;border:0.5px solid var(--border);text-align:center;">' +
        SCHEDULE_DAYS[d.getDay()] + '<br><span style="font-size:10px;font-weight:400;">' + d.getDate() + '</span></th>';
    });
    headHtml += '</tr>';
    document.getElementById('schedule-head').innerHTML = headHtml;

    var bodyHtml = '';
    SCHEDULE_HOURS.forEach(h => {
      bodyHtml += '<tr>';
      bodyHtml += '<td style="background:var(--bg);color:var(--text-hint);font-size:10px;padding:3px 1px;border:0.5px solid var(--border);text-align:center;width:24px;">' + String(h).padStart(2,'0') + '</td>';
      dates.forEach(d => {
        var key = fmtDate(d) + '_' + h;
        var name = scheduleData[key] || '';
        var todayBg = isScheduleToday(d) ? 'background:#f0f8ff;' : '';
        var cellContent = name ? '<span style="font-size:10px;color:#0C447C;background:#E6F1FB;border-radius:3px;padding:1px 3px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + name + '</span>' : '';
        bodyHtml += '<td onclick="openScheduleModal(\'' + key + '\',\'' + name.replace(/'/g, "\\'") + '\')" style="' + todayBg + 'height:32px;cursor:pointer;border:0.5px solid var(--border);padding:2px 2px;vertical-align:middle;">' + cellContent + '</td>';
      });
      bodyHtml += '</tr>';
    });
    document.getElementById('schedule-body').innerHTML = bodyHtml;
  }


  function openScheduleModal(key, name) {
    scheduleActiveKey = key;
    var parts = key.split('_');
    document.getElementById('schedule-modal-title').textContent = parts[0] + ' ' + parts[1] + ':00';
    document.getElementById('schedule-modal-input').value = name;
    document.getElementById('schedule-delete-btn').style.display = name ? 'block' : 'none';
    document.getElementById('schedule-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('schedule-modal-input').focus(), 100);
  }

  function closeScheduleModal() {
    document.getElementById('schedule-modal').style.display = 'none';
    scheduleActiveKey = null;
  }

  function saveScheduleCell() {
    if (!scheduleActiveKey) return;
    const name = document.getElementById('schedule-modal-input').value.trim();
    const trainerId = localStorage.getItem('current_user');
    if (name) {
      scheduleData[scheduleActiveKey] = name;
      db.ref('trainers/' + trainerId + '/schedule/' + scheduleActiveKey).set(name).then(() => {
        closeScheduleModal();
        renderSchedule();
      });
    } else {
      deleteScheduleCell();
    }
  }

  function deleteScheduleCell() {
    if (!scheduleActiveKey) return;
    if (!confirm('이 일정을 삭제할까요?')) return;
    const trainerId = localStorage.getItem('current_user');
    delete scheduleData[scheduleActiveKey];
    db.ref('trainers/' + trainerId + '/schedule/' + scheduleActiveKey).remove().then(() => {
      closeScheduleModal();
      renderSchedule();
    });
  }

  function changeScheduleWeek(dir) {
    scheduleBaseDate.setDate(scheduleBaseDate.getDate() + dir * 7);
    loadScheduleData();
  }

  function loadTrainerTab() {
    const userId = localStorage.getItem('current_user');
    db.ref('trainers/' + userId + '/trainees').once('value', snap => {
      const data = snap.val();
      const container = document.getElementById('trainee-list');
      if (!container) return;
      if (!data) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:14px;">담당 회원이 없어요<br/>회원 추가 버튼을 눌러주세요</div>';
        return;
      }
      const entries = Object.entries(data);
      container.innerHTML = entries.map(([memberId, info]) => `
        <div onclick="openTraineeDetail('${memberId}')"
          style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);cursor:pointer;"
          ontouchstart="this.style.background='var(--blue-light)'" ontouchend="this.style.background='transparent'">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--blue);color:white;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0;">
            ${(info.name || '?')[0]}
          </div>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:700;color:var(--text);">${info.name || memberId}</div>
            <div style="font-size:12px;color:var(--text-sub);">${info.type || '수업 종류 미설정'} · 잔여 ${info.remain || 0}회</div>
          </div>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      `).join('');
    });
  }

  // 담당 회원 추가 모달 열기
  function openAddTraineeMember() {
    document.getElementById('trainee-search').value = '';
    document.getElementById('trainee-search-result').innerHTML = '';
    document.getElementById('add-trainee-modal').style.display = 'flex';
  }

  // 담당 회원 추가 모달 닫기
  function closeAddTraineeMember() {
    document.getElementById('add-trainee-modal').style.display = 'none';
  }

  // 회원 검색
  function searchTraineeMember(query) {
    const q = query.trim();
    const resultEl = document.getElementById('trainee-search-result');
    if (!q) { resultEl.innerHTML = ''; return; }
    db.ref('members').once('value', snap => {
      const results = [];
      snap.forEach(child => {
        const member = child.val();
        if ((member.name || '').includes(q) || child.key.includes(q)) {
          results.push({ id: child.key, name: member.name || child.key });
        }
      });
      if (results.length === 0) {
        resultEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-hint);">검색 결과가 없어요</div>';
        return;
      }
      resultEl.innerHTML = results.map(m => `
        <div onclick="selectTraineeMember('${m.id}', '${m.name}')"
          style="padding:12px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;align-items:center;gap:10px;"
          ontouchstart="this.style.background='var(--blue-light)'" ontouchend="this.style.background='transparent'">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--blue);color:white;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;">${m.name[0]}</div>
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text);">${m.name}</div>
            <div style="font-size:12px;color:var(--text-hint);">${m.id}</div>
          </div>
        </div>
      `).join('');
    });
  }

  // 담당 회원 선택 후 수업 정보 입력
  function selectTraineeMember(memberId, memberName) {
    const type = prompt(memberName + '님의 수업 종류를 입력해주세요\n(예: PT / 기구필라테스 / 기타)');
    if (!type) return;
    const total = parseInt(prompt('총 수업 횟수를 입력해주세요\n(예: 10, 20, 30)'));
    if (!total || isNaN(total)) return;

    const trainerId = localStorage.getItem('current_user');
    db.ref('trainers/' + trainerId + '/trainees/' + memberId).set({
      name: memberName,
      type: type,
      total: total,
      remain: total,
      addedAt: Date.now()
    }).then(() => {
      alert(memberName + '님이 담당 회원으로 추가됐어요! 💪');
      closeAddTraineeMember();
      loadTrainerTab();
    });
  }

  // 담당 회원 상세 화면 열기
  function openTraineeDetail(memberId) {
    currentTraineeId = memberId;
    const trainerId = localStorage.getItem('current_user');
    db.ref('trainers/' + trainerId + '/trainees/' + memberId).once('value', snap => {
      const info = snap.val();
      if (!info) return;
      document.getElementById('trainee-detail-name').textContent = info.name;
      document.getElementById('trainee-card-name').textContent = info.name;
      document.getElementById('trainee-card-type').textContent = info.type || '수업 종류 미설정';
      document.getElementById('trainee-card-remain').textContent = info.remain || 0;
      document.getElementById('trainee-card-total').textContent = info.total || 0;
      // 이전 등록 이력 숨기고 불러오기
      const histEl = document.getElementById('trainee-history-list');
      if (histEl) { histEl.style.display = 'none'; }
      const arrow = document.getElementById('trainee-history-arrow');
      if (arrow) arrow.textContent = '▾';
      loadTraineeHistory(memberId);
      showScreen('screen-trainee-detail');
      switchTraineeTab('record');
    });
  }

  // 담당 회원 수정
  function editTraineeInfo() {
    if (!currentTraineeId) return;
    const trainerId = localStorage.getItem("current_user");
    const ref = db.ref("trainers/" + trainerId + "/trainees/" + currentTraineeId);
    ref.once("value", snap => {
      const info = snap.val();
      if (!info) return;
      const type = prompt("수업 종류를 입력해주세요", info.type || "");
      if (type === null) return;
      const total = parseInt(prompt("총 수업 횟수를 입력해주세요", info.total || 0));
      if (isNaN(total)) return;
      const remain = parseInt(prompt("잔여 횟수를 입력해주세요", info.remain || 0));
      if (isNaN(remain)) return;
      ref.update({ type, total, remain }).then(() => {
        document.getElementById("trainee-card-type").textContent = type;
        document.getElementById("trainee-card-remain").textContent = remain;
        document.getElementById("trainee-card-total").textContent = total;
        alert("수정됐어요! ✅");
      });
    });
  }

  // 담당 회원 삭제
  function deleteTraineeMember() {
    if (!currentTraineeId) return;
    const name = document.getElementById("trainee-detail-name").textContent;
    if (!confirm(name + "님을 담당 회원에서 해제할까요?")) return;
    const trainerId = localStorage.getItem("current_user");
    db.ref("trainers/" + trainerId + "/trainees/" + currentTraineeId).remove().then(() => {
      alert(name + "님이 담당 회원에서 해제됐어요.");
      showScreen("screen-trainer");
      loadTrainerTab();
    });
  }

  // 수업 출석 체크 (잔여 횟수 차감)
  function checkTraineeAttend() {
    if (!currentTraineeId) return;
    const trainerId = localStorage.getItem('current_user');
    const ref = db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId);
    ref.once('value', snap => {
      const info = snap.val();
      if (!info) return;
      const remain = info.remain || 0;
      if (remain <= 0) { alert('잔여 횟수가 없어요!'); return; }
      if (!confirm(info.name + '님 오늘 수업 출석 체크할까요?\n잔여 횟수: ' + remain + ' → ' + (remain - 1) + '회')) return;
      const today = new Date();
      const dateStr = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
      ref.update({ remain: remain - 1 }).then(() => {
        // 출석 기록 저장
        db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/attendLog/' + dateStr).set({
          date: dateStr,
          savedAt: String(today.getHours()).padStart(2,'0')+':'+String(today.getMinutes()).padStart(2,'0')
        });
        document.getElementById('trainee-card-remain').textContent = remain - 1;
        alert('✅ 출석 체크 완료! 잔여 ' + (remain - 1) + '회');
      });
    });
  }

  // 담당 회원 탭 전환
  function switchTraineeTab(tab) {
    currentTraineeTab = tab;
    ['record', 'sign', 'memo', 'log'].forEach(t => {
      const btn = document.getElementById('trainee-tab-' + t);
      if (btn) {
        btn.style.background = t === tab ? 'var(--blue)' : 'var(--card)';
        btn.style.color = t === tab ? 'white' : 'var(--text)';
        btn.style.border = t === tab ? 'none' : '1px solid var(--border)';
      }
    });
    const content = document.getElementById('trainee-tab-content');
    if (!content || !currentTraineeId) return;

    if (tab === 'record') {
      renderTrainerCal();
    } else if (tab === 'sign') {
      renderSignTab(content);
    } else if (tab === 'memo') {
      // 메모 표시
      const trainerId = localStorage.getItem('current_user');
      db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/memo').once('value', snap => {
        const memo = snap.val() || '';
        content.innerHTML = `
          <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;">
            <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">📝 회원 메모</div>
            <textarea id="trainee-memo-input" placeholder="회원 특이사항, 주의사항 등을 기록해주세요" style="width:100%;box-sizing:border-box;padding:10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;resize:none;min-height:120px;background:var(--bg);color:var(--text);">${memo}</textarea>
            <button onclick="saveTraineeMemo()" style="width:100%;margin-top:8px;padding:12px;background:var(--blue);color:white;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">💾 메모 저장</button>
          </div>`;
      });
    } else if (tab === 'log') {
      renderLogTab();
    }
  }

  function renderSignTab(content) {
    if (!content || !currentTraineeId) return;
    const trainerId = localStorage.getItem('current_user');

    Promise.all([
      db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/signs').once('value'),
      db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/registrations').once('value'),
      db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId).once('value')
    ]).then(([signsSnap, regsSnap, infoSnap]) => {
      // 서명 목록 (날짜순 정렬)
      var signs = [];
      if (signsSnap.exists()) {
        signsSnap.forEach(function(child) { signs.push({ key: child.key, ...child.val() }); });
        signs.sort(function(a, b) { return a.key < b.key ? -1 : 1; });
      }

      if (signs.length === 0) {
        content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:14px;">아직 서명 기록이 없어요</div>';
        return;
      }

      // 등록 이력 (날짜순 정렬 - 오래된 것부터)
      var regs = [];
      if (regsSnap.exists()) {
        regsSnap.forEach(function(child) { regs.push({ key: child.key, ...child.val() }); });
        regs.sort(function(a, b) { return a.key < b.key ? -1 : 1; });
      }

      // 현재 등록 정보
      var info = infoSnap.val() || {};
      var currentType = info.type || 'PT';
      var currentTotal = info.total || 0;
      var currentRemain = info.remain || 0;

      // 등록 회차 구성 (이전 이력 + 현재 등록)
      var regList = regs.map(function(r, i) {
        return { idx: i + 1, type: r.type, total: r.total, date: r.date, completed: r.completed, key: r.key };
      });
      // 현재 등록을 마지막 회차로 추가
      regList.push({ idx: regList.length + 1, type: currentType, total: currentTotal, remain: currentRemain, date: null, completed: false, isCurrent: true });

      // 서명을 회차별로 배분
      // 각 회차의 총횟수만큼 서명을 순서대로 배분
      var signGroups = [];
      var signIdx = 0;
      for (var r = 0; r < regList.length; r++) {
        var reg = regList[r];
        var groupSigns = [];
        var groupTotal = reg.total;
        var taken = 0;
        while (signIdx < signs.length && taken < groupTotal) {
          groupSigns.push(signs[signIdx]);
          signIdx++;
          taken++;
        }
        signGroups.push({ reg: reg, signs: groupSigns });
      }
      // 남은 서명은 현재 회차에 추가
      while (signIdx < signs.length) {
        signGroups[signGroups.length - 1].signs.push(signs[signIdx]);
        signIdx++;
      }

      // 최근순으로 뒤집기
      signGroups.reverse();

      // HTML 생성
      var html = '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">✍️ 서명 기록 (총 ' + signs.length + '회)</div>';

      signGroups.forEach(function(group) {
        var reg = group.reg;
        var groupSigns = group.signs;
        var isCurrent = reg.isCurrent;
        // 서명 완료 횟수 (당일취소도 횟수 차감)
        var signedCount = groupSigns.length;
        // 서명이 총횟수 이상이면 완료
        var isFull = signedCount >= reg.total;
        // 진행중이어도 다 차면 완료로 표시
        var showCompleted = !isCurrent || isFull;
        // 잔여횟수 = 총횟수 - 서명횟수
        var calcRemain = Math.max(0, reg.total - signedCount);

        var borderStyle = (!showCompleted) ? 'border:1.5px solid #378ADD;' : 'border:0.5px solid var(--border);';
        var headerBg = (!showCompleted) ? 'background:#E6F1FB;' : 'background:var(--bg);';
        var badge = (!showCompleted) ?
          '<span style="background:#378ADD;color:white;font-size:10px;padding:2px 7px;border-radius:20px;">진행중</span>' :
          '<span style="background:#EAF3DE;color:#3B6D11;font-size:10px;padding:2px 7px;border-radius:20px;">완료</span>';

        html += '<div style="' + borderStyle + 'border-radius:var(--radius);overflow:hidden;margin-bottom:8px;">';
        html += '<div style="' + headerBg + 'padding:10px 14px;border-bottom:0.5px solid var(--border);display:flex;justify-content:space-between;align-items:center;">';
        html += '<div style="display:flex;align-items:center;gap:8px;">';
        html += '<span style="font-size:12px;font-weight:700;color:var(--text);">' + reg.idx + '차 등록</span>';
        html += badge;
        html += '<span style="font-size:11px;color:var(--text-hint);">' + reg.type + ' · ' + reg.total + '회</span>';
        html += '</div>';
        if (reg.date) html += '<span style="font-size:11px;color:var(--text-hint);">~' + reg.date + '</span>';
        html += '</div>';

        if (groupSigns.length === 0) {
          html += '<div style="padding:12px 14px;text-align:center;color:var(--text-hint);font-size:12px;">아직 서명 기록이 없어요</div>';
        } else {
          html += '<div style="padding:10px 14px;">';
          groupSigns.slice().reverse().forEach(function(s, revIdx) {
            var realIdx = groupSigns.length - revIdx;
            html += '<div style="margin-bottom:' + (revIdx < groupSigns.length - 1 ? '10px' : '0') + ';padding-bottom:' + (revIdx < groupSigns.length - 1 ? '10px' : '0') + ';border-bottom:' + (revIdx < groupSigns.length - 1 ? '0.5px solid var(--border)' : 'none') + ';">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
            html += '<span style="font-size:12px;font-weight:700;color:' + (s.noShow ? '#dc2626' : 'var(--text)') + ';">' + (s.noShow ? '🔴 당일취소' : '✅ ' + realIdx + '회차') + '</span>';
            html += '<div style="display:flex;align-items:center;gap:8px;">';
            html += '<span style="font-size:11px;color:var(--text-hint);">' + s.date + ' ' + (s.savedAt || '') + '</span>';
            html += '<div style="position:relative;">';
            html += '<button onclick="toggleSignMenu(\'smenu_' + s.key + '\')" style="background:none;border:none;cursor:pointer;padding:4px;display:flex;flex-direction:column;gap:3px;align-items:center;">';
            html += '<span style="width:3px;height:3px;border-radius:50%;background:var(--text-hint);display:block;"></span>';
            html += '<span style="width:3px;height:3px;border-radius:50%;background:var(--text-hint);display:block;"></span>';
            html += '<span style="width:3px;height:3px;border-radius:50%;background:var(--text-hint);display:block;"></span>';
            html += '</button>';
            html += '<div id="smenu_' + s.key + '" style="display:none;position:absolute;right:0;top:24px;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:4px;min-width:100px;z-index:10;">';
            html += '<button onclick="openEditSignModal(\'' + s.key + '\')" style="width:100%;padding:8px 12px;background:none;border:none;text-align:left;font-size:13px;color:var(--text);cursor:pointer;border-radius:6px;font-family:\'Noto Sans KR\',sans-serif;">수정하기</button>';
            html += '</div></div></div></div>';
            if (s.noShow) {
              html += '<div style="background:#fff8f8;border:0.5px solid #fca5a5;border-radius:8px;padding:8px 12px;text-align:center;">';
              html += '<div style="font-size:16px;font-weight:700;color:#dc2626;">당일취소</div>';
              html += '<div style="font-size:11px;color:#ef4444;margin-top:2px;">' + (s.memberName || '') + ' 회원님은 수업이 진행된 걸로 처리됨에 동의합니다</div>';
              html += '</div>';
            } else {
              html += '<img src="' + s.signURL + '" style="width:100%;border-radius:8px;border:1px solid var(--border);background:#f8f9fa;" />';
            }
            html += '</div>';
          });
          html += '</div>';
        }
        if (!showCompleted && calcRemain > 0) {
          html += '<div style="padding:6px 14px;text-align:center;border-top:0.5px solid var(--border);">';
          html += '<span style="font-size:11px;color:#185FA5;">잔여 ' + calcRemain + '회</span>';
          html += '</div>';
        }
        html += '</div>';
      });

      content.innerHTML = html;
    });
  }

  function renderLogTab() {
    var tabContent = document.getElementById('trainee-tab-content');
    if (!tabContent || !currentTraineeId) return;
    var trainerId = localStorage.getItem('current_user');
    db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/logs').once('value', function(snap) {
      var logs = [];
      snap.forEach(function(child) {
        var v = child.val();
        logs.push({ key: child.key, date: v.date || '', savedAt: v.savedAt || '', content: v.content || '' });
      });
      logs.sort(function(a, b) { return b.key > a.key ? 1 : -1; });
      var listHtml = '';
      if (logs.length === 0) {
        listHtml = '<div style="text-align:center;padding:16px;color:var(--text-hint);">아직 수업일지가 없어요</div>';
      } else {
        for (var i = 0; i < logs.length; i++) {
          var log = logs[i];
          listHtml += '<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:8px;">';
          listHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
          listHtml += '<div style="font-size:12px;color:var(--text-hint);">' + log.date + ' ' + log.savedAt + '</div>';
          listHtml += '<button onclick="openEditLogModal(this.dataset.key)" data-key="' + log.key + '" style="background:var(--blue-light);color:var(--blue);border:none;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;">수정</button>';
          listHtml += '</div>';
          listHtml += '<div style="font-size:13px;color:var(--text);line-height:1.6;">' + log.content + '</div>';
          listHtml += '</div>';
        }
      }
      var formHtml = '<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px;">';
      formHtml += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">📋 수업일지 작성</div>';
      formHtml += '<textarea id="trainee-log-input" placeholder="오늘 수업 내용을 기록해주세요" style="width:100%;box-sizing:border-box;padding:10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;outline:none;resize:none;min-height:100px;background:var(--bg);color:var(--text);"></textarea>';
      formHtml += '<button onclick="saveTraineeLog()" style="width:100%;margin-top:8px;padding:12px;background:var(--blue);color:white;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">💾 수업일지 저장</button>';
      formHtml += '</div>';
      formHtml += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">📚 수업일지 목록</div>';
      tabContent.innerHTML = formHtml + listHtml;
    });
  }

  // 메모 저장
  function saveTraineeMemo() {
    if (!currentTraineeId) return;
    const trainerId = localStorage.getItem('current_user');
    const memo = document.getElementById('trainee-memo-input').value.trim();
    db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/memo').set(memo).then(() => {
      alert('메모가 저장됐어요! 📝');
    });
  }

  // 수업일지 저장
  function saveTraineeLog() {
    if (!currentTraineeId) return;
    const trainerId = localStorage.getItem('current_user');
    const logText = document.getElementById('trainee-log-input').value.trim();
    if (!logText) { alert('수업 내용을 입력해주세요!'); return; }
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
    const savedAt = String(today.getHours()).padStart(2,'0')+':'+String(today.getMinutes()).padStart(2,'0');
    const key = dateStr + '_' + Date.now();
    const log = { date: dateStr, content: logText, savedAt };
    db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/logs/' + key).set(log).then(() => {
      alert('수업일지가 저장됐어요! 📋');
      renderLogTab();
    });
  }

  let editLogKey = null;

  function openEditLogModal(key) {
    const trainerId = localStorage.getItem('current_user');
    db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/logs/' + key).once('value', snap => {
      const log = snap.val();
      if (!log) { alert('기록을 찾을 수 없어요.'); return; }
      editLogKey = key;
      const modal = document.getElementById('edit-log-modal');
      document.getElementById('edit-log-content').value = log.content;
      document.getElementById('edit-log-date').textContent = log.date + ' ' + (log.savedAt || '');
      modal.style.display = 'flex';
    });
  }

  function closeEditLogModal() {
    document.getElementById('edit-log-modal').style.display = 'none';
    editLogKey = null;
  }

  function saveEditLog() {
    if (!editLogKey || !currentTraineeId) return;
    const trainerId = localStorage.getItem('current_user');
    const logText = document.getElementById('edit-log-content').value.trim();
    if (!logText) { alert('수업 내용을 입력해주세요!'); return; }
    db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/logs/' + editLogKey + '/content').set(logText).then(() => {
      alert('수정됐어요! 📋');
      closeEditLogModal();
      renderLogTab();
    });
  }

  function deleteTraineeLog() {
    if (!editLogKey || !currentTraineeId) return;
    if (!confirm('이 수업일지를 삭제할까요?')) return;
    const trainerId = localStorage.getItem('current_user');
    db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/logs/' + editLogKey).remove().then(() => {
      alert('삭제됐어요! 🗑');
      closeEditLogModal();
      renderLogTab();
    });
  }

  // ══════════════════════════════
  // 사인 기능
  // ══════════════════════════════

  let signCanvas = null;
  let signCtx = null;
  let signDrawing = false;
  let signHasData = false;
  let signTargetMemberId = null;
  let signTargetMemberName = null;

  // 상세 화면에서 사인 모달 열기
  function openSignModalFromDetail() {
    if (!currentTraineeId) return;
    const trainerId = localStorage.getItem('current_user');
    db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId).once('value', snap => {
      const info = snap.val();
      if (!info) return;
      const remain = info.remain || 0;
      if (remain <= 0) {
        alert('잔여 횟수가 없어요! 재등록 후 이용해주세요.');
        return;
      }
      const name = document.getElementById('trainee-detail-name').textContent;
      openSignModal(currentTraineeId, name);
    });
  }

  // 사인 모달 열기
  function openSignModal(memberId, memberName) {
    signTargetMemberId = memberId;
    signTargetMemberName = memberName;
    const modal = document.getElementById('sign-modal');
    modal.style.display = 'flex';

    const infoEl = document.getElementById('sign-modal-info');
    const today = new Date();
    const dateStr = today.getFullYear() + '년 ' + (today.getMonth()+1) + '월 ' + today.getDate() + '일';
    infoEl.textContent = memberName + '님 · ' + dateStr + ' 수업 확인 서명';

    // 캔버스 초기화
    signCanvas = document.getElementById('sign-canvas');
    const dpr = window.devicePixelRatio || 1;
    const rect = signCanvas.getBoundingClientRect();
    signCanvas.width = rect.width * dpr;
    signCanvas.height = 200 * dpr;
    signCtx = signCanvas.getContext('2d');
    signCtx.scale(dpr, dpr);
    signCtx.strokeStyle = '#1a1a2e';
    signCtx.lineWidth = 2.5;
    signCtx.lineCap = 'round';
    signCtx.lineJoin = 'round';
    signHasData = false;

    // 터치 이벤트
    signCanvas.addEventListener('touchstart', onSignTouchStart, { passive: false });
    signCanvas.addEventListener('touchmove', onSignTouchMove, { passive: false });
    signCanvas.addEventListener('touchend', onSignTouchEnd);
    // 마우스 이벤트
    signCanvas.addEventListener('mousedown', onSignMouseDown);
    signCanvas.addEventListener('mousemove', onSignMouseMove);
    signCanvas.addEventListener('mouseup', onSignMouseUp);
  }

  function getSignPos(e) {
    const rect = signCanvas.getBoundingClientRect();
    if (e.touches) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onSignTouchStart(e) { e.preventDefault(); signDrawing = true; const p = getSignPos(e); signCtx.beginPath(); signCtx.moveTo(p.x, p.y); document.getElementById('sign-placeholder').style.display = 'none'; }
  function onSignTouchMove(e) { e.preventDefault(); if (!signDrawing) return; const p = getSignPos(e); signCtx.lineTo(p.x, p.y); signCtx.stroke(); signHasData = true; }
  function onSignTouchEnd(e) { signDrawing = false; }
  function onSignMouseDown(e) { signDrawing = true; const p = getSignPos(e); signCtx.beginPath(); signCtx.moveTo(p.x, p.y); document.getElementById('sign-placeholder').style.display = 'none'; }
  function onSignMouseMove(e) { if (!signDrawing) return; const p = getSignPos(e); signCtx.lineTo(p.x, p.y); signCtx.stroke(); signHasData = true; }
  function onSignMouseUp(e) { signDrawing = false; }

  // 사인 지우기
  function clearSign() {
    if (!signCtx || !signCanvas) return;
    signCtx.clearRect(0, 0, signCanvas.width, signCanvas.height);
    signHasData = false;
    document.getElementById('sign-placeholder').style.display = 'block';
  }

  // 사인 모달 닫기
  function closeSignModal() {
    document.getElementById('sign-modal').style.display = 'none';
    if (signCanvas) {
      signCanvas.removeEventListener('touchstart', onSignTouchStart);
      signCanvas.removeEventListener('touchmove', onSignTouchMove);
      signCanvas.removeEventListener('touchend', onSignTouchEnd);
      signCanvas.removeEventListener('mousedown', onSignMouseDown);
      signCanvas.removeEventListener('mousemove', onSignMouseMove);
      signCanvas.removeEventListener('mouseup', onSignMouseUp);
    }
  }

  // 서명 메뉴 토글
  function toggleSignMenu(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const isOpen = el.style.display === 'block';
    document.querySelectorAll('[id^="smenu_"]').forEach(m => m.style.display = 'none');
    el.style.display = isOpen ? 'none' : 'block';
  }

  let editSignKey = null;

  function openEditSignModal(key) {
    editSignKey = key;
    document.getElementById('edit-sign-modal').style.display = 'flex';
  }

  function closeEditSignModal() {
    document.getElementById('edit-sign-modal').style.display = 'none';
    editSignKey = null;
  }

  function deleteSign() {
    if (!editSignKey || !currentTraineeId) return;
    if (!confirm('이 서명 기록을 삭제할까요?\n잔여 횟수가 1회 복구돼요.')) return;
    const trainerId = localStorage.getItem('current_user');
    const ref = db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId);
    ref.once('value', snap => {
      const info = snap.val();
      if (!info) return;
      const remain = info.remain || 0;
      const total = info.total || 0;
      const newRemain = Math.min(remain + 1, total);
      // 서명기록 삭제 + 잔여횟수 복구 동시 처리
      Promise.all([
        db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/signs/' + editSignKey).remove(),
        ref.update({ remain: newRemain })
      ]).then(() => {
        // 화면 잔여횟수 업데이트
        const remainEl = document.getElementById('trainee-card-remain');
        if (remainEl) remainEl.textContent = newRemain;
        alert('삭제됐어요! 잔여 횟수가 ' + newRemain + '회로 복구됐어요. 🗑');
        closeEditSignModal();
        switchTraineeTab('sign');
      });
    });
  }

  // 당일취소 저장
  function saveNoShow() {
    if (!signTargetMemberId || !signTargetMemberName) return;
    if (!confirm(signTargetMemberName + ' 회원님을 당일취소 처리할까요?')) return;
    const trainerId = localStorage.getItem('current_user');
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
    const savedAt = String(today.getHours()).padStart(2,'0')+':'+String(today.getMinutes()).padStart(2,'0');
    const signData = {
      date: dateStr,
      savedAt,
      noShow: true,
      memberName: signTargetMemberName
    };
    db.ref('trainers/' + trainerId + '/trainees/' + signTargetMemberId + '/signs/' + dateStr + '_' + Date.now()).set(signData).then(() => {
      // 출석 횟수 차감
      const ref2 = db.ref('trainers/' + trainerId + '/trainees/' + signTargetMemberId);
      ref2.once('value', snap => {
        const info = snap.val();
        if (!info) return;
        const remain = info.remain || 0;
        if (remain > 0) {
          ref2.update({ remain: remain - 1 });
          const remainEl = document.getElementById('trainee-card-remain');
          if (remainEl) remainEl.textContent = remain - 1;
        }
      });
      alert('당일취소 처리됐어요!');
      closeSignModal();
      if (currentTraineeTab === 'sign') switchTraineeTab('sign');
    });
  }

  // 사인 저장
  function saveSign() {
    if (!signHasData) { alert('서명을 해주세요!'); return; }
    if (!signCanvas || !signTargetMemberId) return;

    const trainerId = localStorage.getItem('current_user');
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
    const savedAt = String(today.getHours()).padStart(2,'0')+':'+String(today.getMinutes()).padStart(2,'0');

    // 캔버스를 이미지로 변환
    signCanvas.toBlob(async blob => {
      try {
        const fileName = 'signs/' + trainerId + '/' + signTargetMemberId + '/' + dateStr + '_' + Date.now() + '.png';
        const ref = storage.ref(fileName);
        await ref.put(blob);
        const signURL = await ref.getDownloadURL();

        // Firebase에 사인 기록 저장
        const signData = {
          date: dateStr,
          savedAt,
          signURL,
          memberName: signTargetMemberName
        };
        await db.ref('trainers/' + trainerId + '/trainees/' + signTargetMemberId + '/signs/' + dateStr + '_' + Date.now()).set(signData);

        // 출석 횟수 차감
        const ref2 = db.ref('trainers/' + trainerId + '/trainees/' + signTargetMemberId);
        ref2.once('value', snap => {
          const info = snap.val();
          if (!info) return;
          const remain = info.remain || 0;
          if (remain > 0) {
            ref2.update({ remain: remain - 1 });
            document.getElementById('trainee-card-remain').textContent = remain - 1;
          }
          // 회원 달력에 수업일 저장
          db.ref('users/' + signTargetMemberId + '/lessons/' + dateStr).set({
            date: dateStr,
            trainerId,
            trainerName: localStorage.getItem('name_' + trainerId) || '강사',
            savedAt
          });
        });

        closeSignModal();
        alert('✅ 서명 완료! 출석 체크됐어요.');
        if (currentTraineeTab === 'sign') switchTraineeTab('sign');
      } catch(e) {
        console.error('사인 저장 오류:', e);
        alert('저장 중 오류가 발생했어요. 다시 시도해주세요.');
      }
    }, 'image/png');
  }

  // ══════════════════════════════
  // 강사 운동기록 탭 기능
  // ══════════════════════════════

  function trainerChangeCalMonth(dir) {
    trainerCalMonth += dir;
    if (trainerCalMonth > 12) { trainerCalMonth = 1; trainerCalYear++; }
    if (trainerCalMonth < 1) { trainerCalMonth = 12; trainerCalYear--; }
    renderTrainerCal();
  }

  function renderTrainerCal() {
    const content = document.getElementById('trainee-tab-content');
    if (!content || !currentTraineeId) return;
    const traineeId = currentTraineeId;
    const year = trainerCalYear, month = trainerCalMonth;

    // Firebase에서 해당 월 운동기록 날짜 가져오기
    Promise.all([
      db.ref('users/' + traineeId + '/workouts').once('value'),
      db.ref('users/' + traineeId + '/classes').once('value')
    ]).then(([snap, classSnap]) => {
      const personalDays = new Set();
      const classDays = new Set();
      if (snap.exists()) {
        snap.forEach(eqSnap => {
          eqSnap.forEach(daySnap => {
            const r = daySnap.val();
            const d = r.date;
            if (d) {
              const parts = d.split('-');
              if (parseInt(parts[0]) === year && parseInt(parts[1]) === month) {
                const day = parseInt(parts[2]);
                if (r.recordedBy === 'trainer') classDays.add(day);
                else personalDays.add(day);
              }
            }
          });
        });
      }
      // GX수업/기구필라테스 날짜도 personalDays에 추가
      if (classSnap.exists()) {
        classSnap.forEach(typeSnap => {
          typeSnap.forEach(daySnap => {
            const r = daySnap.val();
            const d = r.date;
            if (d) {
              const parts = d.split('-');
              if (parseInt(parts[0]) === year && parseInt(parts[1]) === month) {
                personalDays.add(parseInt(parts[2]));
              }
            }
          });
        });
      }

      const firstDay = new Date(year, month - 1, 1).getDay();
      const lastDate = new Date(year, month, 0).getDate();
      const today = new Date();
      const todayStr = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();

      let calHtml = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <button onclick="trainerChangeCalMonth(-1)" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text);padding:4px 8px;">‹</button>
          <div style="font-size:15px;font-weight:700;color:var(--text);">${year}년 ${month}월</div>
          <button onclick="trainerChangeCalMonth(1)" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text);padding:4px 8px;">›</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;">
          ${['일','월','화','수','목','금','토'].map((d,i) => `<div style="text-align:center;font-size:11px;font-weight:700;color:${i===0?'#ef4444':i===6?'#3b82f6':'var(--text-hint)'};padding:4px 0;">${d}</div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">
          ${Array(firstDay).fill('<div></div>').join('')}
          ${Array.from({length:lastDate},(_,i)=>{
            const day = i+1;
            const dateStr = year+'-'+month+'-'+day;
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === trainerCalSelectedDate;
            const hasPersonal = personalDays.has(day);
            const hasClass = classDays.has(day);
            const hasWorkout = hasPersonal || hasClass;
            const dotHtml = hasWorkout
              ? `<div style="display:flex;gap:2px;justify-content:center;margin:1px auto 0;">
                  ${hasClass ? `<div style="width:5px;height:5px;border-radius:50%;background:${isSelected?'white':'#f59e0b'};"></div>` : ''}
                  ${hasPersonal ? `<div style="width:5px;height:5px;border-radius:50%;background:${isSelected?'rgba(255,255,255,0.7)':'var(--blue)'};"></div>` : ''}
                </div>`
              : '<div style="width:5px;height:5px;margin:1px auto 0;"></div>';
            const dow = (firstDay + i) % 7;
            let bg = isSelected ? 'var(--blue)' : isToday ? '#e8f0fe' : 'transparent';
            let color = isSelected ? 'white' : dow===0 ? '#ef4444' : dow===6 ? '#3b82f6' : 'var(--text)';
            return `<div onclick="selectTrainerCalDay('${dateStr}')" style="text-align:center;padding:6px 2px;border-radius:8px;cursor:pointer;background:${bg};position:relative;">
              <div style="font-size:13px;font-weight:${isToday||isSelected?'700':'400'};color:${color};">${day}</div>
              ${dotHtml}
            </div>`;
          }).join('')}
        </div>`;

      // 날짜 선택된 경우 하단에 운동기록 + 기구추가 버튼
      if (trainerCalSelectedDate) {
        const selParts = trainerCalSelectedDate.split('-');
        if (parseInt(selParts[0])===year && parseInt(selParts[1])===month) {
          calHtml += `<div id="trainer-day-detail" style="margin-top:12px;"></div>`;
        }
      }

      content.innerHTML = calHtml;

      if (trainerCalSelectedDate) {
        const selParts = trainerCalSelectedDate.split('-');
        if (parseInt(selParts[0])===year && parseInt(selParts[1])===month) {
          renderTrainerDayDetail(trainerCalSelectedDate);
        }
      }
    });
  }

  function selectTrainerCalDay(dateStr) {
    trainerCalSelectedDate = dateStr;
    renderTrainerCal();
  }

  function renderTrainerDayDetail(dateStr) {
    const detailEl = document.getElementById('trainer-day-detail');
    if (!detailEl || !currentTraineeId) return;
    const traineeId = currentTraineeId;

    // workouts + classes 동시에 읽기
    Promise.all([
      db.ref('users/' + traineeId + '/workouts').once('value'),
      db.ref('users/' + traineeId + '/classes').once('value')
    ]).then(([workoutSnap, classSnap]) => {
      let records = [];

      // 기구운동/유산소 기록
      if (workoutSnap.exists()) {
        workoutSnap.forEach(eqSnap => {
          const eqKey = eqSnap.key;
          eqSnap.forEach(daySnap => {
            const r = daySnap.val();
            if (r.date === dateStr) records.push({ eqKey, recordType: eqKey.startsWith('cardio_') ? 'cardio' : 'workout', ...r });
          });
        });
      }

      // GX수업/기구필라테스 기록
      if (classSnap.exists()) {
        classSnap.forEach(typeSnap => {
          typeSnap.forEach(daySnap => {
            const r = daySnap.val();
            if (r.date === dateStr) records.push({ eqKey: 'class_' + typeSnap.key, recordType: 'class', ...r });
          });
        });
      }

      // 시간순 정렬
      records.sort((a, b) => {
        const ta = a.savedAt || '';
        const tb = b.savedAt || '';
        if (ta !== tb) return ta.localeCompare(tb);
        const aFront = (a.eqKey || '').startsWith('dual_front_') ? 0 : 1;
        const bFront = (b.eqKey || '').startsWith('dual_front_') ? 0 : 1;
        return aFront - bFront;
      });

      const parts = dateStr.split('-');
      const dateLabel = parts[0]+'년 '+parts[1]+'월 '+parts[2]+'일';

      let html = `<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">📋 ${dateLabel} 수업기록</div>`;

      if (records.length === 0) {
        html += `<div style="text-align:center;padding:12px;color:var(--text-hint);font-size:13px;">운동 기록이 없어요</div>`;
      } else {
        records.forEach(r => {

          // GX수업/기구필라테스 카드
          if (r.recordType === 'class') {
            const classEmojis = { '기구필라테스':'🌀', '에어로빅':'🎶', '방송댄스':'🕺', '요가':'🧘‍♀️', '매트필라테스':'🌿', '기능성운동':'⚖️' };
            const emoji = classEmojis[r.type] || '🌀';
            html += `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;margin-bottom:6px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div style="display:flex;align-items:center;gap:5px;">
                  <span style="font-size:10px;font-weight:700;color:white;background:#0891b2;padding:2px 5px;border-radius:4px;flex-shrink:0;">GX수업</span>
                  <span style="font-size:14px;">${emoji}</span>
                  <div style="font-size:13px;font-weight:700;color:var(--text);">${r.type}</div>
                </div>
                ${r.savedAt ? `<span style="font-size:11px;color:var(--text-hint);">${r.savedAt}</span>` : ''}
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:${r.memo ? '6px' : '0'};">
                <div style="background:#e0f7fa;border-radius:6px;padding:6px 8px;text-align:center;">
                  <div style="font-size:10px;color:#0891b2;margin-bottom:1px;font-weight:600;">시간</div>
                  <div style="font-size:12px;font-weight:700;color:var(--text);">${r.min}분</div>
                </div>
                <div style="background:#e0f7fa;border-radius:6px;padding:6px 8px;text-align:center;">
                  <div style="font-size:10px;color:#0891b2;margin-bottom:1px;font-weight:600;">칼로리</div>
                  <div style="font-size:12px;font-weight:700;color:var(--text);">약 ${r.kcal}kcal</div>
                </div>
              </div>
              ${r.memo ? `<div style="background:var(--bg);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--text-sub);">📝 ${r.memo}</div>` : ''}
            </div>`;
            return;
          }

          // 유산소 카드
          if (r.recordType === 'cardio') {
            const cardioIcons = { '런닝머신':'🏃', '스텝밀':'🧗', '사이클':'🚴', '마이마운틴':'⛰️' };
            const icon = cardioIcons[r.type] || '🏃';
            const timeStr = r.min > 0 ? (r.min >= 60 ? Math.floor(r.min/60)+'시간 '+(r.min%60 ? r.min%60+'분' : '') : r.min+'분') : '-';
            html += `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;margin-bottom:6px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div style="display:flex;align-items:center;gap:5px;">
                  <span style="font-size:10px;font-weight:700;color:white;background:#ef4444;padding:2px 5px;border-radius:4px;flex-shrink:0;">유산소</span>
                  <span style="font-size:14px;">${icon}</span>
                  <div style="font-size:13px;font-weight:700;color:var(--text);">${r.type}</div>
                </div>
                ${r.savedAt ? `<span style="font-size:11px;color:var(--text-hint);">${r.savedAt}</span>` : ''}
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:${r.memo ? '6px' : '0'};">
                <div style="background:#fee2e2;border-radius:6px;padding:6px 8px;text-align:center;">
                  <div style="font-size:10px;color:#ef4444;margin-bottom:1px;font-weight:600;">시간</div>
                  <div style="font-size:12px;font-weight:700;color:var(--text);">${timeStr}</div>
                </div>
                <div style="background:#fee2e2;border-radius:6px;padding:6px 8px;text-align:center;">
                  <div style="font-size:10px;color:#ef4444;margin-bottom:1px;font-weight:600;">거리</div>
                  <div style="font-size:12px;font-weight:700;color:var(--text);">${r.dist > 0 ? r.dist+(r.distUnit||'km') : '-'}</div>
                </div>
                <div style="background:#fee2e2;border-radius:6px;padding:6px 8px;text-align:center;">
                  <div style="font-size:10px;color:#ef4444;margin-bottom:1px;font-weight:600;">칼로리</div>
                  <div style="font-size:12px;font-weight:700;color:var(--text);">${r.kcal > 0 ? '약 '+r.kcal+'kcal' : '-'}</div>
                </div>
              </div>
              ${r.memo ? `<div style="background:var(--bg);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--text-sub);">📝 ${r.memo}</div>` : ''}
            </div>`;
            return;
          }

          // 기구운동/프리웨이트 카드 (기존 코드)
          const rawKey = r.eqKey || '';
          const baseKey = rawKey.replace('dual_front_','').replace('dual_back_','').replace('fw_','');
          const eq = EQUIPMENT_LIST.find(e => e.key === rawKey || e.key === baseKey);
          let name, subLabel = '';
          if (r.name) {
            name = r.name;
          } else if (eq) {
            name = eq.name;
            if (rawKey.startsWith('dual_front_')) {
              const dNames = getDualNames(baseKey);
              name = dNames ? dNames.front : eq.name;
            } else if (rawKey.startsWith('dual_back_')) {
              const dNames = getDualNames(baseKey);
              name = dNames ? dNames.back : eq.name;
            }
          } else {
            name = baseKey.replace(/_/g,' ') || rawKey;
          }

          const setsHtml = r.sets ? r.sets.map(s =>
            `<div style="background:var(--blue-light);border-radius:6px;padding:6px 8px;text-align:center;">
              <div style="font-size:10px;color:var(--blue);margin-bottom:1px;font-weight:600;">${s.set}세트</div>
              <div style="font-size:12px;font-weight:700;color:var(--text);">${s.weight > 0 ? s.weight+'kg' : '-'}</div>
              <div style="font-size:11px;color:var(--text-sub);">${s.reps}회</div>
            </div>`
          ).join('') : '';

          html += `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <div style="display:flex;align-items:center;gap:5px;">
                ${r.recordedBy === 'trainer'
                  ? `<span style="font-size:10px;font-weight:700;color:white;background:#f59e0b;padding:2px 5px;border-radius:4px;flex-shrink:0;">수업</span>`
                  : `<span style="font-size:10px;font-weight:700;color:white;background:#1a6fd4;padding:2px 5px;border-radius:4px;flex-shrink:0;">개인</span>`}
                <div style="font-size:13px;font-weight:700;color:var(--text);">${name}</div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                ${r.savedAt ? `<span style="font-size:11px;color:var(--text-hint);">${r.savedAt}</span>` : ''}
                <button onclick="openTrainerWorkoutEditModal('${traineeId}','${rawKey}','${dateStr}')"
                  style="background:var(--blue-light);color:var(--blue);border:none;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">수정</button>
              </div>
            </div>
            ${setsHtml ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:${r.memo ? '6px' : '0'};">${setsHtml}</div>` : ''}
            ${r.memo ? `<div style="background:var(--bg);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--text-sub);">📝 ${r.memo}</div>` : ''}
          </div>`;
        });
      }

      // 기구 검색창 + 프리웨이트 버튼
      html += `
        <div style="position:relative;margin-top:10px;margin-bottom:10px;">
          <svg style="position:absolute;left:12px;top:50%;transform:translateY(-50%);pointer-events:none;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" id="trainer-equipment-search"
            placeholder="기구이름 또는 번호로 검색하세요"
            style="width:100%;box-sizing:border-box;padding:12px 12px 12px 40px;border:1.5px dashed #1a6fd4;border-radius:var(--radius-sm);font-size:14px;font-family:'Noto Sans KR',sans-serif;outline:none;background:var(--card);color:var(--text);"
            onfocus="this.style.borderColor='#0f4fa8';showTrainerEqSearchResult(this.value,'${dateStr}','${traineeId}')"
            onblur="this.style.borderColor='#1a6fd4'"
            oninput="showTrainerEqSearchResult(this.value,'${dateStr}','${traineeId}')" />
          <button id="trainer-search-clear-btn" onclick="clearTrainerEqSearch()" style="display:none;position:absolute;right:10px;top:50%;transform:translateY(-50%);background:var(--text-hint);border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;color:white;font-size:13px;line-height:1;padding:0;">×</button>
        </div>
        <div id="trainer-equipment-search-result" style="display:none;background:var(--card);border:1.5px solid var(--blue);border-radius:var(--radius-sm);margin-bottom:10px;overflow:hidden;box-shadow:0 4px 16px rgba(26,111,212,0.12);max-height:220px;overflow-y:auto;"></div>
        <button onclick="openTrainerFwWorkoutMode('${dateStr}','${traineeId}')"
          style="width:100%;padding:12px 8px;background:var(--card);border:1.5px dashed #8b5cf6;border-radius:var(--radius-sm);color:#8b5cf6;font-size:13px;font-weight:700;font-family:'Noto Sans KR',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 4v16M18 4v16M6 12h12M3 8h3M18 8h3M3 16h3M18 16h3"/>
          </svg>
          프리웨이트 기록
        </button>`;

      detailEl.innerHTML = html;
    });
  }

  // 수업기록 삭제
  function deleteTrainerWorkout(traineeId, eqKey, dateStr) {
    if (!confirm('이 운동 기록을 삭제할까요?')) return;
    db.ref('users/' + traineeId + '/workouts/' + eqKey + '/' + dateStr).remove()
      .then(() => {
        renderTrainerDayDetail(dateStr);
        renderTrainerCal();
      })
      .catch(e => { console.error(e); alert('삭제 중 오류가 발생했어요.'); });
  }

  // 수업기록 수정 모달 열기 (edit-workout-modal 재활용)
  let trainerEditTraineeId = null, trainerEditEqKey = null, trainerEditDateStr = null;

  function openTrainerWorkoutEditModal(traineeId, eqKey, dateStr) {
    trainerEditTraineeId = traineeId;
    trainerEditEqKey = eqKey;
    trainerEditDateStr = dateStr;

    db.ref('users/' + traineeId + '/workouts/' + eqKey + '/' + dateStr).once('value', snap => {
      const r = snap.val();
      if (!r) { alert('기록을 찾을 수 없어요.'); return; }

      const rawKey = eqKey || '';
      const baseKey = rawKey.replace('dual_front_','').replace('dual_back_','').replace('fw_','');
      const eq = EQUIPMENT_LIST.find(e => e.key === rawKey || e.key === baseKey);
      let name;
      if (r.name) {
        name = r.name;
      } else if (eq) {
        name = eq.name;
        if (rawKey.startsWith('dual_front_')) { const d = getDualNames(baseKey); if (d) name = d.front; }
        if (rawKey.startsWith('dual_back_'))  { const d = getDualNames(baseKey); if (d) name = d.back; }
      } else {
        name = baseKey.replace(/_/g,' ') || rawKey;
      }

      document.getElementById('edit-workout-title').textContent = name + ' 수정';
      document.getElementById('edit-set-list').innerHTML = '';
      editSetCount = 0;
      if (r.sets && r.sets.length > 0) {
        r.sets.forEach(s => addEditSetWithValue(s.weight, s.reps));
      }
      document.getElementById('edit-workout-memo').value = r.memo || '';

      // 삭제 버튼을 강사 삭제 함수로 교체
      const deleteBtn = document.querySelector('#edit-workout-modal button[onclick="deleteWorkoutRecord()"]');
      if (deleteBtn) deleteBtn.setAttribute('onclick', 'deleteTrainerWorkoutFromEdit()');
      const saveBtn = document.querySelector('#edit-workout-modal button[onclick="saveEditedWorkout()"]');
      if (saveBtn) saveBtn.setAttribute('onclick', 'saveTrainerEditedWorkout()');

      document.getElementById('edit-workout-modal').classList.add('active');
    });
  }

  // 수업기록 수정 저장
  function saveTrainerEditedWorkout() {
    const sets = [];
    for (let i = 1; i <= editSetCount; i++) {
      const wEl = document.getElementById('edit-weight-' + i);
      const rEl = document.getElementById('edit-reps-' + i);
      if (!wEl || !rEl) continue;
      const w = parseFloat(wEl.value) || 0;
      const r = parseInt(rEl.value) || 0;
      if (w > 0 || r > 0) sets.push({ set: sets.length + 1, weight: w, reps: r });
    }
    if (sets.length === 0) { alert('최소 1세트 이상 입력해주세요!'); return; }
    const memo = document.getElementById('edit-workout-memo').value.trim();

    // 닫기 전에 날짜 미리 저장
    const savedDateStr = trainerEditDateStr;

    db.ref('users/' + trainerEditTraineeId + '/workouts/' + trainerEditEqKey + '/' + trainerEditDateStr).once('value', snap => {
      const existing = snap.val() || {};
      const updated = { ...existing, sets, memo };
      db.ref('users/' + trainerEditTraineeId + '/workouts/' + trainerEditEqKey + '/' + trainerEditDateStr).set(updated)
        .then(() => {
          closeTrainerEditModal();
          renderTrainerDayDetail(savedDateStr);
          alert('수정됐어요! ✅');
        })
        .catch(e => { console.error(e); alert('수정 중 오류가 발생했어요.'); });
    });
  }

  // 수업기록 삭제 (수정 모달에서)
  function deleteTrainerWorkoutFromEdit() {
    if (!confirm('이 운동 기록을 삭제할까요?')) return;
    db.ref('users/' + trainerEditTraineeId + '/workouts/' + trainerEditEqKey + '/' + trainerEditDateStr).remove()
      .then(() => {
        closeTrainerEditModal();
        renderTrainerDayDetail(trainerEditDateStr);
        renderTrainerCal();
      })
      .catch(e => { console.error(e); alert('삭제 중 오류가 발생했어요.'); });
  }

  // 수업기록 수정 모달 닫기
  function closeTrainerEditModal() {
    // 버튼 원래대로 복원
    const deleteBtn = document.querySelector('#edit-workout-modal button[onclick="deleteTrainerWorkoutFromEdit()"]');
    if (deleteBtn) deleteBtn.setAttribute('onclick', 'deleteWorkoutRecord()');
    const saveBtn = document.querySelector('#edit-workout-modal button[onclick="saveTrainerEditedWorkout()"]');
    if (saveBtn) saveBtn.setAttribute('onclick', 'saveEditedWorkout()');
    document.getElementById('edit-workout-modal').classList.remove('active');
    trainerEditTraineeId = null; trainerEditEqKey = null; trainerEditDateStr = null;
  }

  // 강사용 기구 검색
  function showTrainerEqSearchResult(query, dateStr, traineeId) {
    const resultEl = document.getElementById('trainer-equipment-search-result');
    const clearBtn = document.getElementById('trainer-search-clear-btn');
    if (!resultEl) return;
    const q = (query || '').trim();
    if (!q) { resultEl.style.display = 'none'; if (clearBtn) clearBtn.style.display = 'none'; return; }
    if (clearBtn) clearBtn.style.display = 'block';
    const filtered = EQUIPMENT_LIST.filter(eq => eq.name.includes(q) || eq.muscles.includes(q) || String(eq.no) === q || eq.brand.includes(q));
    if (filtered.length === 0) { resultEl.style.display = 'block'; resultEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-hint);font-size:14px;">검색 결과가 없어요</div>'; return; }
    resultEl.style.display = 'block';
    resultEl.innerHTML = filtered.map((eq, idx) => {
      const color = getMuscleColor(eq.muscles);
      const border = idx < filtered.length - 1 ? 'border-bottom:1px solid var(--border);' : '';
      return `<div onclick="openTrainerEqWorkoutMode('${eq.key}','${dateStr}','${traineeId}')" style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;${border}" ontouchstart="this.style.background='var(--blue-light)'" ontouchend="this.style.background='transparent'" onmouseenter="this.style.background='var(--blue-light)'" onmouseleave="this.style.background='transparent'">
        <div style="width:36px;height:36px;border-radius:10px;background:${color}18;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${eq.emoji}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:11px;font-weight:700;color:white;background:${color};padding:2px 6px;border-radius:5px;flex-shrink:0;">${eq.no}번</span>
            <span style="font-size:14px;font-weight:700;color:var(--text);">${eq.name}</span>
          </div>
          <div style="font-size:12px;color:var(--text-sub);margin-top:2px;">${eq.muscles}</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`;
    }).join('');
  }

  function clearTrainerEqSearch() {
    const input = document.getElementById('trainer-equipment-search');
    const resultEl = document.getElementById('trainer-equipment-search-result');
    const clearBtn = document.getElementById('trainer-search-clear-btn');
    if (input) input.value = '';
    if (resultEl) resultEl.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
  }

  // 강사 모드로 기구운동 진입
  function openTrainerEqWorkoutMode(eqKey, dateStr, traineeId) {
    clearTrainerEqSearch();
    isTrainerMode = true;
    trainerTargetId = traineeId;
    trainerTargetDate = dateStr;
    const eq = EQUIPMENT_LIST.find(e => e.key === eqKey);
    if (eq) openGenericWorkout(eq);
  }

  // 강사 모드로 프리웨이트 진입
  function openTrainerFwWorkoutMode(dateStr, traineeId) {
    isTrainerMode = true;
    trainerTargetId = traineeId;
    trainerTargetDate = dateStr;
    openFreeweightModal();
  }

  // 기구운동 선택 모달 열기
  function openTrainerEqSelect() {
    const modal = document.getElementById('trainer-eq-modal');
    if (!modal) return;
    const list = document.getElementById('trainer-eq-list');
    list.innerHTML = EQUIPMENT_LIST.map(eq => `
      <div onclick="openTrainerWorkout('${eq.key}')" style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--border);cursor:pointer;">
        <div style="width:36px;height:36px;border-radius:50%;background:${getMuscleColor(eq.muscles)};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${eq.emoji}</div>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text);">${eq.no}. ${eq.name}</div>
          <div style="font-size:11px;color:var(--text-hint);">${eq.muscles}</div>
        </div>
      </div>`).join('');
    modal.classList.add('active');
  }

  function closeTrainerEqModal() {
    document.getElementById('trainer-eq-modal').classList.remove('active');
  }

  // 프리웨이트 선택 모달 열기
  function openTrainerFwSelect() {
    const modal = document.getElementById('trainer-fw-modal');
    if (!modal) return;
    renderTrainerFwList('전체');
    modal.classList.add('active');
  }

  function closeTrainerFwModal() {
    document.getElementById('trainer-fw-modal').classList.remove('active');
  }

  function renderTrainerFwList(category) {
    const list = document.getElementById('trainer-fw-list');
    const filtered = category === '전체' ? FW_EXERCISE_LIST : FW_EXERCISE_LIST.filter(f => f.category === category);
    document.querySelectorAll('.trainer-fw-cat-btn').forEach(btn => {
      btn.style.background = btn.dataset.cat === category ? 'var(--blue)' : 'var(--card)';
      btn.style.color = btn.dataset.cat === category ? 'white' : 'var(--text)';
    });
    list.innerHTML = filtered.map(f => `
      <div onclick="openTrainerFwWorkout('${f.name}','${f.muscles}')" style="display:flex;align-items:center;justify-content:space-between;padding:12px;border-bottom:1px solid var(--border);cursor:pointer;">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text);">${f.name}</div>
          <div style="font-size:11px;color:var(--text-hint);">${f.category} · ${f.muscles}</div>
        </div>
        <div style="font-size:18px;">›</div>
      </div>`).join('');
  }

  // 기구운동 세트 입력 모달 열기
  function openTrainerWorkout(eqKey) {
    closeTrainerEqModal();
    trainerCurrentEquipment = EQUIPMENT_LIST.find(e => e.key === eqKey);
    if (!trainerCurrentEquipment) return;
    trainerSetCount = 0;
    const modal = document.getElementById('trainer-workout-modal');
    if (!modal) return;
    document.getElementById('trainer-workout-title').textContent = trainerCurrentEquipment.name + ' 기록';
    document.getElementById('trainer-workout-date').textContent = (() => {
      const p = (trainerCalSelectedDate||'').split('-');
      return p.length===3 ? p[0]+'년 '+p[1]+'월 '+p[2]+'일 기록' : '';
    })();
    document.getElementById('trainer-set-list').innerHTML = '';
    document.getElementById('trainer-workout-memo').value = '';
    skipTrainerRestTimer();
    addTrainerSet();
    modal.classList.add('active');
  }

  function closeTrainerWorkoutModal() {
    skipTrainerRestTimer();
    document.getElementById('trainer-workout-modal').classList.remove('active');
  }

  // 프리웨이트 세트 입력 모달 열기
  function openTrainerFwWorkout(name, muscles) {
    closeTrainerFwModal();
    trainerFwSetCount = 0;
    const modal = document.getElementById('trainer-fw-workout-modal');
    if (!modal) return;
    document.getElementById('trainer-fw-workout-title').textContent = name + ' 기록';
    document.getElementById('trainer-fw-workout-date').textContent = (() => {
      const p = (trainerCalSelectedDate||'').split('-');
      return p.length===3 ? p[0]+'년 '+p[1]+'월 '+p[2]+'일 기록' : '';
    })();
    document.getElementById('trainer-fw-name-display').textContent = name;
    document.getElementById('trainer-fw-muscles-display').textContent = muscles;
    document.getElementById('trainer-fw-set-list').innerHTML = '';
    document.getElementById('trainer-fw-memo').value = '';
    skipTrainerFwRestTimer();
    addTrainerFwSet();
    modal.classList.add('active');
  }

  function closeTrainerFwWorkoutModal() {
    skipTrainerFwRestTimer();
    document.getElementById('trainer-fw-workout-modal').classList.remove('active');
  }

  // 세트 추가/삭제
  function addTrainerSet() {
    trainerSetCount++;
    const n = trainerSetCount;
    const row = document.createElement('div');
    row.id = 'trainer-set-row-' + n;
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
    row.innerHTML = `
      <div style="width:28px;height:28px;border-radius:50%;background:var(--blue);color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${n}</div>
      <input id="trainer-weight-${n}" type="number" placeholder="무게(kg)" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);font-family:'Noto Sans KR',sans-serif;" inputmode="decimal">
      <input id="trainer-reps-${n}" type="number" placeholder="횟수" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);font-family:'Noto Sans KR',sans-serif;" inputmode="numeric">
      <button onclick="removeTrainerSet(${n})" style="background:none;border:none;color:var(--text-hint);font-size:18px;cursor:pointer;flex-shrink:0;">×</button>`;
    document.getElementById('trainer-set-list').appendChild(row);
  }

  function removeTrainerSet(n) {
    const row = document.getElementById('trainer-set-row-' + n);
    if (row) row.remove();
  }

  function addTrainerFwSet() {
    trainerFwSetCount++;
    const n = trainerFwSetCount;
    const row = document.createElement('div');
    row.id = 'trainer-fw-set-row-' + n;
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
    row.innerHTML = `
      <div style="width:28px;height:28px;border-radius:50%;background:#8b5cf6;color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${n}</div>
      <input id="trainer-fw-weight-${n}" type="number" placeholder="무게(kg)" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);font-family:'Noto Sans KR',sans-serif;" inputmode="decimal">
      <input id="trainer-fw-reps-${n}" type="number" placeholder="횟수" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);font-family:'Noto Sans KR',sans-serif;" inputmode="numeric">
      <button onclick="removeTrainerFwSet(${n})" style="background:none;border:none;color:var(--text-hint);font-size:18px;cursor:pointer;flex-shrink:0;">×</button>`;
    document.getElementById('trainer-fw-set-list').appendChild(row);
  }

  function removeTrainerFwSet(n) {
    const row = document.getElementById('trainer-fw-set-row-' + n);
    if (row) row.remove();
  }

  // 기구운동 저장
  function saveTrainerWorkout() {
    if (!trainerCurrentEquipment || !currentTraineeId || !trainerCalSelectedDate) return;
    const sets = [];
    for (let i = 1; i <= trainerSetCount; i++) {
      const wEl = document.getElementById('trainer-weight-' + i);
      const rEl = document.getElementById('trainer-reps-' + i);
      if (!wEl || !rEl) continue;
      const w = parseFloat(wEl.value) || 0;
      const r = parseInt(rEl.value) || 0;
      if (w > 0 || r > 0) sets.push({ set: sets.length+1, weight: w, reps: r });
    }
    if (sets.length === 0) { alert('최소 1세트 이상 입력해주세요!'); return; }
    const memo = document.getElementById('trainer-workout-memo').value;
    const dateStr = trainerCalSelectedDate;
    const parts = dateStr.split('-');
    const dateLabel = parts[0]+'년 '+parts[1]+'월 '+parts[2]+'일';
    const now = new Date();
    const record = {
      date: dateStr, dateLabel,
      sets, memo,
      savedAt: String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'),
      recordedBy: 'trainer'
    };
    db.ref('users/' + currentTraineeId + '/workouts/' + trainerCurrentEquipment.key + '/' + dateStr).set(record)
      .then(() => {
        alert('✅ 운동기록 저장 완료!');
        closeTrainerWorkoutModal();
        renderTrainerCal();
      })
      .catch(e => { console.error(e); alert('저장 중 오류가 발생했어요.'); });
  }

  // 프리웨이트 저장
  function saveTrainerFwWorkout() {
    if (!currentTraineeId || !trainerCalSelectedDate) return;
    const nameEl = document.getElementById('trainer-fw-name-display');
    const name = nameEl ? nameEl.textContent : '';
    if (!name) { alert('운동 이름이 없어요!'); return; }
    const sets = [];
    for (let i = 1; i <= trainerFwSetCount; i++) {
      const wEl = document.getElementById('trainer-fw-weight-' + i);
      const rEl = document.getElementById('trainer-fw-reps-' + i);
      if (!wEl || !rEl) continue;
      const w = parseFloat(wEl.value) || 0;
      const r = parseInt(rEl.value) || 0;
      if (w > 0 || r > 0) sets.push({ set: sets.length+1, weight: w, reps: r });
    }
    if (sets.length === 0) { alert('최소 1세트 이상 입력해주세요!'); return; }
    const memo = document.getElementById('trainer-fw-memo').value;
    const dateStr = trainerCalSelectedDate;
    const parts = dateStr.split('-');
    const dateLabel = parts[0]+'년 '+parts[1]+'월 '+parts[2]+'일';
    const now = new Date();
    const fwKey = 'fw_' + name.replace(/\s/g,'_');
    const record = {
      date: dateStr, dateLabel, name,
      sets, memo,
      savedAt: String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'),
      recordedBy: 'trainer'
    };
    db.ref('users/' + currentTraineeId + '/workouts/' + fwKey + '/' + dateStr).set(record)
      .then(() => {
        alert('✅ 운동기록 저장 완료!');
        closeTrainerFwWorkoutModal();
        renderTrainerCal();
      })
      .catch(e => { console.error(e); alert('저장 중 오류가 발생했어요.'); });
  }

  // 타이머 (기구운동)
  function startTrainerRestTimer() {
    skipTrainerRestTimer();
    const minEl = document.getElementById('trainer-rest-min');
    const secEl = document.getElementById('trainer-rest-sec');
    const min = parseInt(minEl?.value) || 0;
    const sec = parseInt(secEl?.value) || 0;
    trainerRestRemain = min * 60 + sec;
    if (trainerRestRemain <= 0) return;
    const boxEl = document.getElementById('trainer-rest-timer-box');
    const countEl = document.getElementById('trainer-rest-timer-count');
    if (boxEl) boxEl.style.display = 'block';
    function tick() {
      if (trainerRestRemain <= 0) {
        if (boxEl) boxEl.style.display = 'none';
        if (navigator.vibrate) navigator.vibrate([400,200,400,200,600]);
        return;
      }
      const m = Math.floor(trainerRestRemain/60);
      const s = trainerRestRemain % 60;
      if (countEl) countEl.textContent = m + ':' + String(s).padStart(2,'0');
      trainerRestRemain--;
      trainerRestTimer = setTimeout(tick, 1000);
    }
    tick();
  }

  function skipTrainerRestTimer() {
    if (trainerRestTimer) { clearTimeout(trainerRestTimer); trainerRestTimer = null; }
    const boxEl = document.getElementById('trainer-rest-timer-box');
    if (boxEl) boxEl.style.display = 'none';
    trainerRestRemain = 0;
  }

  // 타이머 (프리웨이트)
  function startTrainerFwRestTimer() {
    skipTrainerFwRestTimer();
    const minEl = document.getElementById('trainer-fw-rest-min');
    const secEl = document.getElementById('trainer-fw-rest-sec');
    const min = parseInt(minEl?.value) || 0;
    const sec = parseInt(secEl?.value) || 0;
    trainerFwRestRemain = min * 60 + sec;
    if (trainerFwRestRemain <= 0) return;
    const boxEl = document.getElementById('trainer-fw-rest-timer-box');
    const countEl = document.getElementById('trainer-fw-rest-timer-count');
    if (boxEl) boxEl.style.display = 'block';
    function tick() {
      if (trainerFwRestRemain <= 0) {
        if (boxEl) boxEl.style.display = 'none';
        if (navigator.vibrate) navigator.vibrate([400,200,400,200,600]);
        return;
      }
      const m = Math.floor(trainerFwRestRemain/60);
      const s = trainerFwRestRemain % 60;
      if (countEl) countEl.textContent = m + ':' + String(s).padStart(2,'0');
      trainerFwRestRemain--;
      trainerFwRestTimer = setTimeout(tick, 1000);
    }
    tick();
  }

  function skipTrainerFwRestTimer() {
    if (trainerFwRestTimer) { clearTimeout(trainerFwRestTimer); trainerFwRestTimer = null; }
    const boxEl = document.getElementById('trainer-fw-rest-timer-box');
    if (boxEl) boxEl.style.display = 'none';
    trainerFwRestRemain = 0;
  }
