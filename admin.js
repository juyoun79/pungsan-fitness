  const ADMIN_ID = 'admin';

  function checkAdminLogin(id, pw) {
    return id === ADMIN_ID; // 1차 ID 체크만, 비번은 doLogin에서 Firebase 조회
  }

  // Firebase에 관리자 계정 초기화 (최초 1회)
  function initAdminAccount() {
    // 관리자 비밀번호는 Firebase 콘솔에서 직접 설정
    // 코드에 초기 비밀번호를 노출하지 않음
    db.ref('admin_config/pw').once('value').then(snap => {
      if (!snap.exists()) {
        console.warn('관리자 비밀번호가 설정되지 않았습니다. Firebase 콘솔에서 설정해주세요.');
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
    if (tabId === 'tab-coupon') loadMemberSelectOptions();
    if (tabId === 'coupon-auto') loadAutoConditions();
    if (tabId === 'tab-equipment-admin') loadAdminEquipmentList();
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
    if (!name) { showToast('이름을 입력해주세요.', 'error'); return; }

    if (editTrainerId) {
      // 수정
      const pw = document.getElementById('trainer-modal-pw').value.trim();
      const updates = { name };
      db.ref('trainers/' + editTrainerId).update({ name });
      db.ref('users/' + editTrainerId).update(pw ? { name, pw: hashPw(pw) } : { name }).then(() => {
        showToast('수정됐어요!', 'success');
        closeTrainerModal();
        loadAdminTrainerList();
      });
    } else {
      // 추가
      const phone = document.getElementById('trainer-modal-phone').value.trim().replace(/-/g,'');
      const pw = document.getElementById('trainer-modal-pw').value.trim() || phone.slice(-4);
      if (!phone || phone.length < 10) { showToast('전화번호를 정확히 입력해주세요.', 'error'); return; }
      db.ref('users/' + phone).once('value', snap => {
        if (snap.exists()) {
          // 기존 계정이 있으면 role만 trainer로 업데이트
          showConfirm(snap.val().name + ' 님이 이미 등록된 번호예요.\n강사로 전환할까요?', () => {
            // 기존 members pw 가져오기
            db.ref('members/' + phone).once('value', mSnap => {
            const existingPw = snap.val().pw || (mSnap.exists() ? mSnap.val().pw : null) || phone.slice(-4);
            Promise.all([
              db.ref('users/' + phone).update({ name, role: 'trainer', pw: existingPw }),
              db.ref('trainers/' + phone).set({ name }),
              db.ref('members/' + phone).remove()
            ]).then(() => {
              showToast('✅ ' + name + ' 강사로 전환됐어요!', 'success');
              closeTrainerModal();
              loadAdminTrainerList();
            });
            });
          });
        } else {
          // 새 강사 등록 시 혹시 members에 있으면 삭제 (역할 혼용 방지)
          Promise.all([
            db.ref('users/' + phone).set({ name, pw: hashPw(pw), role: 'trainer' }),
            db.ref('trainers/' + phone).set({ name }),
            db.ref('members/' + phone).remove()
          ]).then(() => {
            showToast('✅ ' + name + ' 강사가 등록됐어요!', 'success');
            closeTrainerModal();
            loadAdminTrainerList();
          });
        }
      });
    }
  }

  function deleteTrainer() {
    if (!editTrainerId) return;
    showConfirm('이 강사를 삭제할까요?\n스케줄 및 담당 회원 정보도 모두 삭제돼요.', () => {
      const tid = editTrainerId;
      // nicknames에서 해당 강사 닉네임 찾아서 삭제 (저장 경로 무관하게 처리)
      db.ref('nicknames').orderByValue().equalTo(tid).once('value').then(nickSnap => {
        const deleteRefs = [
          db.ref('users/' + tid),
          db.ref('trainers/' + tid),
          db.ref('notifications/' + tid),
          db.ref('members/' + tid),
          db.ref('coupons/' + tid),
        ];
        // 닉네임 키 찾아서 삭제
        nickSnap.forEach(child => {
          deleteRefs.push(db.ref('nicknames/' + child.key));
        });
        Promise.all(deleteRefs.map(ref => ref.remove())).then(() => {
          showToast('삭제됐어요! 🗑', 'success');
          closeTrainerModal();
          loadAdminTrainerList();
        });
      });
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
        const name = info.name || localStorage.getItem('name_' + child.key) || child.key;
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
      // 열 때마다 Firebase에서 최신 이력 불러오기 (카드도 동시 업데이트)
      refreshTraineeView(currentTraineeId);
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
    if (!type) { showToast('수업 종류를 입력해주세요.', 'error'); return; }
    if (!count || count < 1) { showToast('횟수를 입력해주세요.', 'error'); return; }
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
        db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId).update({ type, total: count, remain: newRemain, regDate: dateStr })
      ]).then(() => {
        document.getElementById('trainee-card-type').textContent = type;
        refreshTraineeView(currentTraineeId);
        showToast('✅ ' + count + '회 재등록 완료!', 'success');
        closeReregisterModal();
      });
    });
  }

  // 카드 + 서명탭을 Firebase 한 번 읽어서 동시 업데이트
  function refreshTraineeView(traineeId) {
    const trainerId = localStorage.getItem('current_user');
    // Firebase 1번만 읽어서 registrations + signs 동시에 가져옴 (일관성 보장)
    db.ref('trainers/' + trainerId + '/trainees/' + traineeId).once('value').then(rootSnap => {
      const rootVal = rootSnap.val() || {};
      const rootType = rootVal.type || '';
      const rootTotal = rootVal.total || 0;
      const rootRegDate = rootVal.regDate || '';

      // 전체 등록 목록 (rootVal.registrations에서 직접 추출 - 별도 쿼리 불필요)
      const allRegs = [];
      if (rootVal.registrations && typeof rootVal.registrations === 'object') {
        Object.entries(rootVal.registrations).forEach(([key, val]) => {
          if (val && typeof val === 'object') allRegs.push({ key, ...val });
        });
        allRegs.sort((a, b) => a.key.localeCompare(b.key));
      }
      allRegs.push({ total: rootTotal, type: rootType, date: rootRegDate });

      // 총 서명 횟수 (rootVal.signs에서 직접 추출)
      let totalSigns = 0;
      const signsArr = [];
      if (rootVal.signs && typeof rootVal.signs === 'object') {
        Object.entries(rootVal.signs).forEach(([key, val]) => {
          if (val && typeof val === 'object') { signsArr.push({ key, ...val }); totalSigns++; }
        });
        signsArr.sort((a, b) => a.key < b.key ? -1 : 1);
      }

      // 현재 차수 계산
      let cumulative = 0, idx = allRegs.length - 1;
      for (let i = 0; i < allRegs.length; i++) {
        cumulative += allRegs[i].total;
        if (totalSigns < cumulative) { idx = i; break; }
      }
      const currentOrder = idx + 1;
      const currentReg = allRegs[idx];
      let prev = 0;
      for (let i = 0; i < idx; i++) prev += allRegs[i].total;
      const remain = Math.max(0, currentReg.total - (totalSigns - prev));

      // 카드 업데이트
      const progressEl = document.getElementById('trainee-card-progress');
      const remainEl = document.getElementById('trainee-card-remain');
      const totalEl = document.getElementById('trainee-card-total');
      if (progressEl) progressEl.textContent = currentOrder + '차 ' + rootType + ' 진행중';
      if (remainEl) remainEl.textContent = remain;
      if (totalEl) totalEl.textContent = currentReg.total;

      // 서명탭도 같은 데이터로 업데이트
      if (currentTraineeTab === 'sign') {
        const tabContent = document.getElementById('trainee-tab-content');
        if (tabContent && signsArr.length > 0) {
          // regList 구성
          const regList = allRegs.map((r, i) => ({ idx: i + 1, type: r.type, total: r.total, date: r.date || null }));

          // 서명 배분
          let signIdx2 = 0;
          const signGroups = regList.map((reg, ri) => {
            const groupSigns = [];
            let taken = 0;
            while (signIdx2 < signsArr.length && taken < reg.total) {
              groupSigns.push(signsArr[signIdx2++]); taken++;
            }
            const isCurrentOrder = ri === idx;
            const signedCount = groupSigns.length;
            const isFull = signedCount >= reg.total;
            const status = isCurrentOrder ? (isFull ? 'done' : 'active') : (signedCount > 0 ? 'done' : 'waiting');
            const calcRemain = Math.max(0, reg.total - signedCount);
            return { reg, signs: groupSigns, status, calcRemain };
          });
          while (signIdx2 < signsArr.length) signGroups[idx].signs.push(signsArr[signIdx2++]);

          let html = '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">✍️ 서명 기록 (총 ' + totalSigns + '회)</div>';
          signGroups.slice().reverse().forEach(function(group) {
            const reg = group.reg;
            const groupSigns = group.signs;
            const status = group.status;
            const calcRemain = group.calcRemain;
            const showCompleted = status !== 'active';
            const borderStyle = status === 'active' ? 'border:1.5px solid #378ADD;' : 'border:0.5px solid var(--border);';
            const headerBg = status === 'active' ? 'background:#E6F1FB;' : 'background:var(--bg);';
            const badge = status === 'active' ?
              '<span style="background:#378ADD;color:white;font-size:10px;padding:2px 7px;border-radius:20px;">진행중</span>' :
              status === 'done' ?
              '<span style="background:#EAF3DE;color:#3B6D11;font-size:10px;padding:2px 7px;border-radius:20px;">완료</span>' :
              '<span style="background:#F3F4F6;color:#9CA3AF;font-size:10px;padding:2px 7px;border-radius:20px;">대기</span>';

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
              // 취소 버튼: 마지막 차수 + 서명 0회 + 이전 등록 있음
              if (group.reg.idx === allRegs.length && allRegs.length > 1) {
                html += '<div style="padding:6px 14px 10px;text-align:right;">';
                html += '<button onclick="cancelLastRegistration()" style="font-size:12px;padding:4px 12px;background:#fff0f0;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;cursor:pointer;font-family:\'Noto Sans KR\',sans-serif;">등록 취소</button>';
                html += '</div>';
              }
            } else {
              html += '<div style="padding:10px 14px;">';
              groupSigns.slice().reverse().forEach(function(s, revIdx) {
                const realIdx = groupSigns.length - revIdx;
                html += '<div style="margin-bottom:' + (revIdx < groupSigns.length - 1 ? '10px' : '0') + ';padding-bottom:' + (revIdx < groupSigns.length - 1 ? '10px' : '0') + ';border-bottom:' + (revIdx < groupSigns.length - 1 ? '0.5px solid var(--border)' : 'none') + ';">';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
                html += '<span style="font-size:12px;font-weight:700;color:' + (s.noShow ? '#dc2626' : 'var(--text)') + ';">' + (s.noShow ? '🔴 당일취소' : '✅ ' + realIdx + '회차') + '</span>';
                html += '<div style="display:flex;align-items:center;gap:8px;">';
                html += '<span style="font-size:11px;color:var(--text-hint);">' + s.date + ' ' + (s.savedAt || '') + '</span>';
                html += '<div style="position:relative;"><button onclick="toggleSignMenu(\'smenu_'+s.key+'\')" style="background:none;border:none;cursor:pointer;padding:4px;display:flex;flex-direction:column;gap:3px;align-items:center;"><span style="width:3px;height:3px;border-radius:50%;background:var(--text-hint);display:block;"></span><span style="width:3px;height:3px;border-radius:50%;background:var(--text-hint);display:block;"></span><span style="width:3px;height:3px;border-radius:50%;background:var(--text-hint);display:block;"></span></button><div id="smenu_'+s.key+'" style="display:none;position:absolute;right:0;top:24px;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:4px;min-width:100px;z-index:10;"><button onclick="openEditSignModal(\''+s.key+'\')" style="width:100%;padding:8px 12px;background:none;border:none;text-align:left;font-size:13px;color:var(--text);cursor:pointer;border-radius:6px;">수정하기</button></div></div></div></div>';
                if (s.noShow) {
                  html += '<div style="background:#fff8f8;border:0.5px solid #fca5a5;border-radius:8px;padding:8px 12px;text-align:center;">';
                  html += '<div style="font-size:16px;font-weight:700;color:#dc2626;">당일취소</div>';
                  html += '<div style="font-size:11px;color:#ef4444;margin-top:2px;">' + (s.memberName || '') + ' 회원님은 수업이 진행된 걸로 처리됨에 동의합니다</div>';
                  html += '</div>';
                } else if (s.signURL) {
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
          tabContent.innerHTML = html;
        } else if (tabContent && signsArr.length === 0) {
          let noSignHtml = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:14px;">아직 서명 기록이 없어요</div>';
          if (allRegs.length > 1) {
            noSignHtml += '<div style="text-align:right;padding:0 4px 8px;">';
            noSignHtml += '<button onclick="cancelLastRegistration()" style="font-size:12px;padding:4px 12px;background:#fff0f0;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;cursor:pointer;font-family:\'Noto Sans KR\',sans-serif;">최근 등록 취소</button>';
            noSignHtml += '</div>';
          }
          tabContent.innerHTML = noSignHtml;
        }
      }

      // 등록이력 목록 업데이트 (열려있을 때만)
      const historyEl = document.getElementById('trainee-history-list');
      const histBtn = document.getElementById('trainee-history-btn');
      if (histBtn) {
        if (allRegs.length <= 0) {
          histBtn.style.display = 'none';
          if (historyEl) { historyEl.style.display = 'none'; historyEl.innerHTML = ''; }
        } else {
          histBtn.style.display = 'flex';
          if (historyEl && historyEl.style.display !== 'none') {
            historyEl.innerHTML = allRegs.map((r, i) =>
              '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:0.5px solid rgba(255,255,255,0.15);">' +
                '<div style="display:flex;align-items:center;gap:6px;">' +
                  '<span style="background:rgba(255,255,255,0.15);border-radius:20px;padding:1px 7px;font-size:10px;color:white;">' + (i + 1) + '차</span>' +
                  '<span style="font-size:11px;color:white;">' + r.type + ' ' + r.total + '회 등록</span>' +
                '</div>' +
                '<span style="font-size:10px;color:#B5D4F4;">' + (r.date || '') + '</span>' +
              '</div>'
            ).join('');
          }
        }
      }
    });
  }

  // 카드 업데이트 전담 함수 - signs 기준으로 차수/잔여/총횟수 계산
  function updateTraineeCard(traineeId) {
    const trainerId = localStorage.getItem('current_user');
    return Promise.all([
      db.ref('trainers/' + trainerId + '/trainees/' + traineeId + '/registrations').once('value'),
      db.ref('trainers/' + trainerId + '/trainees/' + traineeId).once('value'),
      db.ref('trainers/' + trainerId + '/trainees/' + traineeId + '/signs').once('value')
    ]).then(([regSnap, rootSnap, signsSnap]) => {
      const rootVal = rootSnap.val() || {};
      const rootType = rootVal.type || '';
      const rootTotal = rootVal.total || 0;

      // 전체 등록 목록 (registrations + 현재 등록)
      const allRegs = [];
      if (regSnap.exists()) {
        regSnap.forEach(child => allRegs.push({ key: child.key, ...child.val() }));
        allRegs.sort((a, b) => a.key.localeCompare(b.key));
      }
      allRegs.push({ total: rootTotal, type: rootType });

      // 총 서명 횟수
      let totalSigns = 0;
      if (signsSnap.exists()) signsSnap.forEach(() => totalSigns++);

      // 현재 차수 계산
      let cumulative = 0;
      let idx = allRegs.length - 1;
      for (let i = 0; i < allRegs.length; i++) {
        cumulative += allRegs[i].total;
        if (totalSigns < cumulative) { idx = i; break; }
      }
      const currentOrder = idx + 1;
      const currentReg = allRegs[idx];

      // 현재 차수 잔여 계산
      let prev = 0;
      for (let i = 0; i < idx; i++) prev += allRegs[i].total;
      const remain = Math.max(0, currentReg.total - (totalSigns - prev));

      // 카드 업데이트
      const progressEl = document.getElementById('trainee-card-progress');
      const remainEl = document.getElementById('trainee-card-remain');
      const totalEl = document.getElementById('trainee-card-total');
      if (progressEl) progressEl.textContent = currentOrder + '차 ' + rootType + ' 진행중';
      if (remainEl) remainEl.textContent = remain;
      if (totalEl) totalEl.textContent = currentReg.total;
    });
  }

  // 등록이력 버튼/목록 업데이트 함수
  function loadTraineeHistory(traineeId) {
    const trainerId = localStorage.getItem('current_user');

    return Promise.all([
      db.ref('trainers/' + trainerId + '/trainees/' + traineeId + '/registrations').once('value'),
      db.ref('trainers/' + trainerId + '/trainees/' + traineeId).once('value')
    ]).then(([regSnap, rootSnap]) => {
      const rootVal = rootSnap.val() || {};
      const rootType = rootVal.type || '';
      const rootTotal = rootVal.total || 0;
      const rootRegDate = rootVal.regDate || '';

      const historyEl = document.getElementById('trainee-history-list');
      const btn = document.getElementById('trainee-history-btn');
      if (!btn || !historyEl) return;

      if (!regSnap.exists() || regSnap.numChildren() === 0) {
        btn.style.display = 'none';
        return;
      }

      const allRegs = [];
      regSnap.forEach(child => allRegs.push({ key: child.key, ...child.val() }));
      allRegs.sort((a, b) => a.key.localeCompare(b.key));
      allRegs.push({ key: 'zzz_current', type: rootType, total: rootTotal, date: rootRegDate });

      btn.style.display = 'flex';
      historyEl.innerHTML = allRegs.map((r, i) =>
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:0.5px solid rgba(255,255,255,0.15);">' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="background:rgba(255,255,255,0.15);border-radius:20px;padding:1px 7px;font-size:10px;color:white;">' + (i + 1) + '차</span>' +
            '<span style="font-size:11px;color:white;">' + r.type + ' ' + r.total + '회 등록</span>' +
          '</div>' +
          '<span style="font-size:10px;color:#B5D4F4;">' + (r.date || '') + '</span>' +
        '</div>'
      ).join('');
    });
  }

  function openNoticeDetail(id) {
    // 읽음 처리
    const userId = localStorage.getItem('current_user');
    if (userId) {
      const readList = JSON.parse(localStorage.getItem('read_notices_' + userId) || '[]');
      if (!readList.includes(id)) {
        readList.push(id);
        localStorage.setItem('read_notices_' + userId, JSON.stringify(readList));
      }
      // 점 색상 즉시 업데이트
      if (typeof loadHomeNotices === 'function') loadHomeNotices();
      // 안 읽은 공지 없으면 배지 초기화
      db.ref('notices').once('value', noticeSnap => {
        let unreadCount = 0;
        noticeSnap.forEach(child => {
          if (!readList.includes(child.key)) unreadCount++;
        });
        if ('setAppBadge' in navigator) {
          if (unreadCount === 0) {
            navigator.clearAppBadge().catch(() => {});
          } else {
            navigator.setAppBadge(unreadCount).catch(() => {});
          }
        }
      });
    }
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
    if (sets.length === 0) { showToast('최소 1세트 이상 입력해주세요!', 'error'); return; }
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
    showToast('수정됐어요!', 'success');
  }

  function deleteWorkoutRecord() {
    showConfirm('이 날의 운동기록을 삭제할까요?', () => {
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
      showToast('삭제됐어요! 🗑', 'success');
    });
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
      Promise.all([
        db.ref('members').once('value'),
        db.ref('trainers').once('value')
      ]).then(([membersSnap, trainersSnap]) => {
        const members = membersSnap.val() || {};
        const trainerIds = new Set(Object.keys(trainersSnap.val() || {}));
        // 강사 계정 및 이름 없는 계정 필터링
        const filtered = {};
        Object.entries(members).forEach(([phone, info]) => {
          if (!trainerIds.has(phone) && info.name) {
            filtered[phone] = info;
          }
        });
        resolve(filtered);
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
          (info.name || '').includes(query) || phone.includes(query)
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
              <div class="member-avatar">${(info.name || phone)[0]}</div>
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
    // 닉네임 불러오기 (Firebase에서)
    const nickEl = document.getElementById('edit-member-nickname');
    if (nickEl) nickEl.value = '';
    db.ref('members/' + phone + '/nickname').once('value').then(snap => {
      if (nickEl) nickEl.value = snap.val() || localStorage.getItem('nickname_' + phone) || '';
    });
    // 생년월일 불러오기
    const birthEl = document.getElementById('edit-member-birth');
    if (birthEl) birthEl.value = '';
    db.ref('members/' + phone + '/birth').once('value').then(snap => {
      if (birthEl) birthEl.value = snap.val() || localStorage.getItem('body_birth_' + phone) || '';
    });
    document.getElementById('edit-member-modal').classList.add('active');
  }

  function closeEditMemberModal() {
    document.getElementById('edit-member-modal').classList.remove('active');
  }

  function saveEditMember() {
    const newName     = document.getElementById('edit-member-name').value.trim();
    const newPhone    = document.getElementById('edit-member-phone').value.trim().replace(/-/g, '');
    const newNickname = (document.getElementById('edit-member-nickname')?.value || '').trim();
    const newBirth    = (document.getElementById('edit-member-birth')?.value || '').trim();
    const programs    = [...document.querySelectorAll('#edit-member-programs input:checked')].map(el => el.value);
    const oldPhone    = currentMemberPhone;
    const info        = cachedMembers[oldPhone];

    if (!newName)  { showToast('이름을 입력해주세요.', 'error'); return; }
    if (!newPhone || newPhone.length < 10) { showToast('전화번호를 정확히 입력해주세요.', 'error'); return; }
    if (newBirth && (newBirth.length !== 8 || isNaN(newBirth))) {
      showToast('생년월일은 8자리 숫자로 입력해주세요. (예: 19900101)', 'error'); return;
    }

    const phoneChanged = newPhone !== oldPhone;

    const doSave = () => {
      const updateData = { name: newName, programs };
      if (newNickname) updateData.nickname = newNickname;
      if (newBirth)    updateData.birth    = newBirth;

      if (phoneChanged) {
        const newData = { ...info, ...updateData };
        db.ref('members/' + newPhone).set(newData).then(() => {
          db.ref('members/' + oldPhone).remove();
          // users에도 닉네임/생년월일 업데이트
          if (newNickname) db.ref('users/' + newPhone + '/nickname').set(newNickname);
          if (newBirth)    db.ref('users/' + newPhone + '/birth').set(newBirth);
          localStorage.setItem('name_' + newPhone, newName);
          if (newNickname) localStorage.setItem('nickname_' + newPhone, newNickname);
          if (newBirth)    localStorage.setItem('body_birth_' + newPhone, newBirth);
          closeEditMemberModal();
          closeMemberModal();
          loadMemberList();
          showToast('✅ 회원정보가 수정됐어요!', 'success');
        });
      } else {
        db.ref('members/' + oldPhone).update(updateData).then(() => {
          // users에도 닉네임/생년월일 업데이트
          if (newNickname) db.ref('users/' + oldPhone + '/nickname').set(newNickname);
          if (newBirth)    db.ref('users/' + oldPhone + '/birth').set(newBirth);
          localStorage.setItem('name_' + oldPhone, newName);
          if (newNickname) localStorage.setItem('nickname_' + oldPhone, newNickname);
          if (newBirth)    localStorage.setItem('body_birth_' + oldPhone, newBirth);
          cachedMembers[oldPhone] = { ...info, ...updateData };
          closeEditMemberModal();
          closeMemberModal();
          loadMemberList();
          showToast('✅ 회원정보가 수정됐어요!', 'success');
        });
      }
    };

    // 전화번호 변경 시 중복 확인
    if (phoneChanged) {
      db.ref('members/' + newPhone).once('value').then(snap => {
        if (snap.exists()) { showToast('이미 사용 중인 전화번호예요.', 'error'); return; }
        showConfirm('전화번호를 ' + newPhone + '으로 변경할까요?\n로그인 아이디도 바뀌어요.', () => {
          doSave();
        });
      });
    } else {
      doSave();
    }
  }

  function editMemberPw() {
    showInput('새 비밀번호를 입력하세요 (4자리):', '새 비밀번호', '', (newPw) => {
      if (!newPw || newPw.length < 4) { showToast('4자리를 입력해주세요.', 'error'); return; }
      const hashedPw = hashPw(newPw);
      db.ref('members/' + currentMemberPhone + '/pw').set(hashedPw).then(() => {
        localStorage.removeItem('pw_' + currentMemberPhone);
        showToast('비밀번호가 변경됐어요!', 'success');
        closeMemberModal();
      });
    });
  }

  function editMemberPoint() {
    // Firebase에서 최신 포인트 읽기
    db.ref('users/' + currentMemberPhone + '/points').once('value').then(snap => {
      const cur = snap.val() || 0;
      showInput('포인트를 입력하세요 (현재: ' + cur + 'P):', '포인트 입력', cur, (newPt) => {
        if (!newPt && newPt !== '0') return;
        if (isNaN(newPt)) { showToast('숫자만 입력해주세요.', 'error'); return; }
        const pt = parseInt(newPt);
        // Firebase 저장
        db.ref('users/' + currentMemberPhone + '/points').set(pt).then(() => {
          localStorage.setItem('points_' + currentMemberPhone, String(pt));
          const loggedIn = localStorage.getItem('current_user');
          if (loggedIn === currentMemberPhone && typeof updateStats === 'function') updateStats();
          showToast('포인트가 ' + pt + 'P로 변경됐어요.', 'success');
          closeMemberModal();
          loadMemberList();
        });
      });
    });
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
    showConfirm(name + ' 회원을 삭제할까요?\n\n삭제 후 복구가 어렵습니다.', () => {

      const phone = currentMemberPhone;

      // 1. Firebase 개인 데이터 삭제
      const deleteRefs = [
        db.ref('members/' + phone),           // 로그인 정보
        db.ref('users/' + phone),             // 출석/포인트/운동기록/신체정보
        db.ref('coupons/' + phone),           // 쿠폰
        db.ref('notifications/' + phone),     // 알림
        db.ref('point_tier_issued/' + phone), // 포인트 구간 쿠폰 발행 기록
      ];

      // 2. 강사 담당 연결 삭제 (모든 강사에서 해당 회원 제거)
      db.ref('trainers').once('value', snap => {
      snap.forEach(trainerSnap => {
        const tid = trainerSnap.key;
        if (trainerSnap.child('trainees/' + phone).exists()) {
          deleteRefs.push(db.ref('trainers/' + tid + '/trainees/' + phone));
        }
      });

      // nicknames에서 해당 회원 닉네임 찾아서 삭제
      db.ref('nicknames').orderByValue().equalTo(phone).once('value').then(nickSnap => {
        nickSnap.forEach(child => {
          deleteRefs.push(db.ref('nicknames/' + child.key));
        });

        Promise.all(deleteRefs.map(ref => ref.remove()))
          .then(() => {
            // 3. 로컬스토리지 초기화
            clearMemberLocalData(phone);
            // 4. coupon_issued_flags 중 해당 회원 관련 항목 삭제
            db.ref('coupon_issued_flags').once('value').then(flagSnap => {
              const removes = [];
              flagSnap.forEach(child => {
                if (child.key.includes(phone)) {
                  removes.push(db.ref('coupon_issued_flags/' + child.key).remove());
                }
              });
              if (removes.length) Promise.all(removes);
            });
            // 5. 삭제 기록 저장
            db.ref('deleted_members/' + phone).set({
              deletedAt: Date.now(),
              name: name
            });
            closeMemberModal();
            loadMemberList();
            showToast('✅ ' + name + ' 회원이 삭제됐어요.', 'success');
          })
          .catch(err => {
            showToast('삭제 중 오류가 발생했어요.', 'error');
          });
      });
      });
    });
  }

  // ── 회원 등록 (Firebase) ──
  function registerMember() {
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim().replace(/-/g, '');
    const pwInput = document.getElementById('reg-pw').value.trim();
    const pw = pwInput || phone.slice(-4);

    if (!name) { showToast('이름을 입력해주세요.', 'error'); return; }
    if (!phone || phone.length < 10) { showToast('휴대폰 번호를 정확히 입력해주세요.', 'error'); return; }

    const programs = [...document.querySelectorAll('#reg-programs input:checked')].map(el => el.value);

    // 번호 중복 + 이름 중복 확인
    db.ref('members/' + phone).once('value').then(snap => {
      if (snap.exists()) { showToast('이미 등록된 전화번호예요.', 'error'); return; }

      // 이름 중복 확인 - 전체 회원 조회
      db.ref('members').once('value').then(allSnap => {
        let duplicateName = false;
        allSnap.forEach(child => {
          if ((child.val().name || '').trim() === name) duplicateName = true;
        });
        const doRegister = () => {
          const hashedPw = hashPw(pw);
          db.ref('members/' + phone).set({ name: name + '(' + phone.slice(-4) + ')', pw: hashedPw, programs }).then(() => {
            const birth = document.getElementById('reg-birth') ? document.getElementById('reg-birth').value.trim() : '';
            if (birth) db.ref('members/' + phone + '/birth').set(birth);
            document.getElementById('reg-name').value = '';
            document.getElementById('reg-phone').value = '';
            document.getElementById('reg-pw').value = '';
            if (document.getElementById('reg-birth')) document.getElementById('reg-birth').value = '';
            document.querySelectorAll('#reg-programs input').forEach(el => el.checked = false);
            showToast('✅ ' + name + ' 회원이 등록됐어요!', 'success');
          });
        };

        if (duplicateName) {
          showToast('⚠️ 이미 같은 이름의 회원이 있어요.', 'info');
          showConfirm('동명이인으로 등록할까요?', doRegister);
        } else {
          doRegister();
        }
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
      showToast('Firebase notices: ' + total + '개', 'info');
    }, err => {
      showToast('Firebase 읽기 오류: ' + err.message, 'error');
    });
  }

  function registerNotice() {
    const title = document.getElementById('notice-title').value.trim();
    const content = document.getElementById('notice-content').value.trim();
    if (!title) { showToast('제목을 입력해주세요.', 'error'); return; }
    if (!content) { showToast('내용을 입력해주세요.', 'error'); return; }
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
      showToast('공지사항이 등록됐어요!', 'success');
      // 전체 회원 푸시알림
      if (typeof sendPushToAll === 'function') {
        sendPushToAll('📢 공지사항', title, 'notice', { type: 'notice' });
      }
    }).catch(err => { showToast('등록 실패: ' + err.message, 'error'); });
  }

  function deleteNotice(key) {
    showConfirm('이 공지를 삭제할까요?', () => {
      db.ref('notices/' + key).remove().then(() => {
      loadNoticeListAdmin();
      loadHomeNotices();
      }).catch(err => { showToast('삭제 실패: ' + err.message, 'error'); });
    });
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
    if (!title) { showToast('제목을 입력해주세요.', 'error'); return; }
    if (!content) { showToast('내용을 입력해주세요.', 'error'); return; }
    db.ref('notices/' + editNoticeKey).update({ title, content }).then(() => {
      showToast('수정됐어요!', 'success');
      closeEditNoticeModal();
      loadNoticeListAdmin();
      loadHomeNotices();
    }).catch(err => { showToast('수정 실패: ' + err.message, 'error'); });
  }

  function deleteNoticeFromEdit() {
    if (!editNoticeKey) return;
    showConfirm('이 공지를 삭제할까요?', () => {
      db.ref('notices/' + editNoticeKey).remove().then(() => {
        closeEditNoticeModal();
        loadNoticeListAdmin();
        loadHomeNotices();
      }).catch(err => { showToast('삭제 실패: ' + err.message, 'error'); });
    });
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
      const userId = localStorage.getItem('current_user');
      const readList = JSON.parse(localStorage.getItem('read_notices_' + userId) || '[]');
      container.innerHTML = notices.map((n) => {
        const isRead = readList.includes(n.firebaseKey);
        return `
        <div class="notice-card" onclick="openNoticeDetail('${n.firebaseKey}')" style="cursor:pointer;">
          <div class="notice-dot" style="${isRead ? 'background:#9aa3b2;' : ''}"></div>
          <div class="notice-text">${n.title}</div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <div class="notice-date">${n.date||''}</div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>`;
      }).join('');
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
    showConfirm('이 일정을 삭제할까요?', () => {
      const trainerId = localStorage.getItem('current_user');
      delete scheduleData[scheduleActiveKey];
      db.ref('trainers/' + trainerId + '/schedule/' + scheduleActiveKey).remove().then(() => {
      closeScheduleModal();
      renderSchedule();
      });
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

      // signs 기준으로 현재 차수 + 잔여 계산 헬퍼
      function calcTraineeStatus(info) {
        const allRegs = [];
        if (info.registrations && typeof info.registrations === 'object') {
          Object.entries(info.registrations).forEach(([key, val]) => {
            if (val && typeof val === 'object') allRegs.push({ key, ...val });
          });
          allRegs.sort((a, b) => a.key.localeCompare(b.key));
        }
        allRegs.push({ total: info.total || 0, type: info.type || '' });

        let totalSigns = 0;
        if (info.signs && typeof info.signs === 'object') {
          Object.values(info.signs).forEach(v => { if (v && typeof v === 'object') totalSigns++; });
        }

        let cumulative = 0, idx = allRegs.length - 1;
        for (let i = 0; i < allRegs.length; i++) {
          cumulative += allRegs[i].total;
          if (totalSigns < cumulative) { idx = i; break; }
        }
        let prev = 0;
        for (let i = 0; i < idx; i++) prev += allRegs[i].total;
        const remain = Math.max(0, allRegs[idx].total - (totalSigns - prev));
        return { order: idx + 1, remain, type: info.type || '' };
      }

      container.innerHTML = entries.map(([memberId, info]) => {
        const status = calcTraineeStatus(info);
        const subText = status.type
          ? `${status.type} · ${status.order}차 진행중 · 잔여 ${status.remain}회`
          : '수업 종류 미설정';
        return `
        <div onclick="openTraineeDetail('${memberId}')"
          style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);cursor:pointer;"
          ontouchstart="this.style.background='var(--blue-light)'" ontouchend="this.style.background='transparent'">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--blue);color:white;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0;">
            ${(info.name || '?')[0]}
          </div>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:700;color:var(--text);">${info.name || memberId}</div>
            <div style="font-size:12px;color:var(--text-sub);">${subText}</div>
          </div>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      `}).join('');
    });
  }

  // 담당 회원 캐시
  let _traineeMembersCache = [];

  function loadTraineeMembersCache() {
    db.ref('members').once('value', snap => {
      _traineeMembersCache = [];
      snap.forEach(child => {
        const m = child.val();
        _traineeMembersCache.push({ id: child.key, name: m.name || child.key });
      });
    });
  }

  // 담당 회원 추가 모달 열기
  function openAddTraineeMember() {
    document.getElementById('trainee-search').value = '';
    document.getElementById('trainee-search-result').innerHTML = '';
    document.getElementById('add-trainee-modal').style.display = 'flex';
    // 모달 열릴 때 미리 회원 목록 로드
    loadTraineeMembersCache();
  }

  // 담당 회원 추가 모달 닫기
  function closeAddTraineeMember() {
    document.getElementById('add-trainee-modal').style.display = 'none';
  }

  // 회원 검색 (캐시 기반 - 즉시 결과 표시)
  function searchTraineeMember(query) {
    const q = query.trim();
    const resultEl = document.getElementById('trainee-search-result');
    if (!q) { resultEl.innerHTML = ''; return; }
    // 캐시가 없으면 Firebase에서 로드 후 재검색
    if (_traineeMembersCache.length === 0) {
      db.ref('members').once('value', snap => {
        _traineeMembersCache = [];
        snap.forEach(child => {
          const m = child.val();
          _traineeMembersCache.push({ id: child.key, name: m.name || child.key });
        });
        searchTraineeMember(query);
      });
      return;
    }
    const results = _traineeMembersCache.filter(m =>
      (m.name || '').includes(q) || m.id.includes(q)
    );
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
  }

  // 담당 회원 선택 후 수업 정보 입력
  function selectTraineeMember(memberId, memberName) {
    showTraineeForm(memberName + '님 수업 정보 입력', '', '', (type, total) => {
      const trainerId = localStorage.getItem('current_user');
      db.ref('trainers/' + trainerId + '/trainees/' + memberId).set({
        name: memberName,
        type: type,
        total: total,
        remain: total,
        addedAt: Date.now()
      }).then(() => {
        showToast(memberName + '님이 담당 회원으로 추가됐어요! 💪', 'success');
        closeAddTraineeMember();
        loadTrainerTab();
      });
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
      // 잔여/총횟수/차수는 loadTraineeHistory가 signs 기준으로 계산해서 표시
      const progressEl = document.getElementById('trainee-card-progress');
      if (progressEl) progressEl.textContent = '';
      // 이전 등록 이력 숨기고 불러오기
      const histEl = document.getElementById('trainee-history-list');
      if (histEl) { histEl.style.display = 'none'; }
      const arrow = document.getElementById('trainee-history-arrow');
      if (arrow) arrow.textContent = '▾';
      refreshTraineeView(memberId);
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
      showTraineeForm('수업 정보 수정', info.type || '', info.total || '', (type, total) => {
        // 잔여 횟수 자동 계산 (총횟수 - 현재 차수 서명 횟수)
        let prevSum = 0;
        if (info.registrations && typeof info.registrations === 'object') {
          Object.values(info.registrations).forEach(r => { prevSum += (r.total || 0); });
        }
        let totalSigns = 0;
        if (info.signs && typeof info.signs === 'object') {
          Object.values(info.signs).forEach(v => { if (v && typeof v === 'object') totalSigns++; });
        }
        const signsInCurrentReg = Math.max(0, totalSigns - prevSum);
        const remain = Math.max(0, total - signsInCurrentReg);

        ref.update({ type, total, remain }).then(() => {
          document.getElementById("trainee-card-type").textContent = type;
          refreshTraineeView(currentTraineeId);
          showToast('수정됐어요!', 'success');
        });
      });
    });
  }

  // 담당 회원 삭제

  // ── 마지막 등록 취소 ──
  function cancelLastRegistration() {
    if (!currentTraineeId) return;
    showConfirm('가장 최근 등록을 취소할까요?\n이전 등록 상태로 되돌아가요.', () => {
      const trainerId = localStorage.getItem('current_user');
      const ref = db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId);
      ref.once('value', snap => {
      const info = snap.val() || {};

      // allRegs 구성
      const allRegs = [];
      if (info.registrations && typeof info.registrations === 'object') {
        Object.entries(info.registrations).forEach(([key, val]) => {
          if (val && typeof val === 'object') allRegs.push({ key, ...val });
        });
        allRegs.sort((a, b) => a.key.localeCompare(b.key));
      }
      allRegs.push({ total: info.total || 0, type: info.type || '', date: info.regDate || '' });

      if (allRegs.length < 2) { showToast('취소할 이전 등록이 없어요.', 'error'); return; }

      // 현재 총 서명 횟수
      let totalSigns = 0;
      if (info.signs && typeof info.signs === 'object') {
        Object.values(info.signs).forEach(v => { if (v && typeof v === 'object') totalSigns++; });
      }

      // 복구할 등록 (마지막에서 두 번째)
      const restoreReg = allRegs[allRegs.length - 2];

      // 복구 후 remain 계산
      let prevSum = 0;
      for (let i = 0; i < allRegs.length - 2; i++) prevSum += allRegs[i].total;
      const newRemain = Math.max(0, restoreReg.total - (totalSigns - prevSum));

      // Firebase 업데이트: 이전 등록 복구 + 해당 registrations 항목 삭제
      const updates = {
        type: restoreReg.type,
        total: restoreReg.total,
        remain: newRemain,
        regDate: restoreReg.date || ''
      };
      updates['registrations/' + restoreReg.key] = null;

      ref.update(updates).then(() => {
        showToast('등록이 취소됐어요!', 'success');
        refreshTraineeView(currentTraineeId);
      });
      });
    });
  }
  function deleteTraineeMember() {
    if (!currentTraineeId) return;
    const name = document.getElementById("trainee-detail-name").textContent;
    showConfirm(name + '님을 담당 회원에서 해제할까요?', () => {
      const trainerId = localStorage.getItem("current_user");
      const traineeId = currentTraineeId;
      Promise.all([
      db.ref("trainers/" + trainerId + "/trainees/" + traineeId).remove(),
      db.ref("users/" + traineeId + "/lessons").remove()
      ]).then(() => {
      showToast(name + '님이 담당 회원에서 해제됐어요.', 'success');
      showScreen("screen-trainer");
      loadTrainerTab();
      });
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
      if (remain <= 0) { showToast('잔여 횟수가 없어요!', 'error'); return; }
      showConfirm(info.name + '님 오늘 수업 출석 체크할까요?\n잔여 횟수: ' + remain + ' → ' + (remain - 1) + '회', () => {
        const today = new Date();
        const dateStr = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
        ref.update({ remain: remain - 1 }).then(() => {
        // 출석 기록 저장
        db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/attendLog/' + dateStr).set({
          date: dateStr,
          savedAt: String(today.getHours()).padStart(2,'0')+':'+String(today.getMinutes()).padStart(2,'0')
        });
        refreshTraineeView(currentTraineeId);
        showToast('✅ 출석 체크 완료! 잔여 ' + (remain - 1) + '회', 'success');
        });
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
      // refreshTraineeView가 카드+서명탭 동시 업데이트
      refreshTraineeView(currentTraineeId);
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
        return { idx: i + 1, type: r.type, total: r.total, date: r.date };
      });
      regList.push({ idx: regList.length + 1, type: currentType, total: currentTotal, date: null });

      // 현재 차수 계산 (updateTraineeCard와 동일한 로직)
      var cumulative = 0;
      var currentOrderIdx = regList.length - 1;
      for (var ci = 0; ci < regList.length; ci++) {
        cumulative += regList[ci].total;
        if (signs.length < cumulative) { currentOrderIdx = ci; break; }
      }

      // 서명을 회차별로 배분
      var signGroups = [];
      var signIdx = 0;
      for (var r = 0; r < regList.length; r++) {
        var reg = regList[r];
        var groupSigns = [];
        var taken = 0;
        while (signIdx < signs.length && taken < reg.total) {
          groupSigns.push(signs[signIdx]);
          signIdx++;
          taken++;
        }
        signGroups.push({ reg: reg, signs: groupSigns, isCurrentOrder: r === currentOrderIdx });
      }
      // 남은 서명은 현재 차수에 추가
      while (signIdx < signs.length) {
        signGroups[currentOrderIdx].signs.push(signs[signIdx]);
        signIdx++;
      }

      // 1차부터 순서대로 표시 (오름차순)

      // HTML 생성
      var html = '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">✍️ 서명 기록 (총 ' + signs.length + '회)</div>';

      signGroups.forEach(function(group) {
        var reg = group.reg;
        var groupSigns = group.signs;
        var isCurrentOrder = group.isCurrentOrder;
        // 서명 횟수
        var signedCount = groupSigns.length;
        // 현재 차수면 진행중, 아니면 완료/대기
        var isFull = signedCount >= reg.total;
        var status = isCurrentOrder ? (isFull ? 'done' : 'active') : (signedCount > 0 ? 'done' : 'waiting');
        var showCompleted = status !== 'active';
        // 잔여횟수 = 총횟수 - 서명횟수
        var calcRemain = Math.max(0, reg.total - signedCount);

        var borderStyle = status === 'active' ? 'border:1.5px solid #378ADD;' : 'border:0.5px solid var(--border);';
        var headerBg = status === 'active' ? 'background:#E6F1FB;' : 'background:var(--bg);';
        var badge = status === 'active' ?
          '<span style="background:#378ADD;color:white;font-size:10px;padding:2px 7px;border-radius:20px;">진행중</span>' :
          status === 'done' ?
          '<span style="background:#EAF3DE;color:#3B6D11;font-size:10px;padding:2px 7px;border-radius:20px;">완료</span>' :
          '<span style="background:#F3F4F6;color:#9CA3AF;font-size:10px;padding:2px 7px;border-radius:20px;">대기</span>';

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
      showToast('메모가 저장됐어요! 📝', 'success');
    });
  }

  // 수업일지 저장
  function saveTraineeLog() {
    if (!currentTraineeId) return;
    const trainerId = localStorage.getItem('current_user');
    const logText = document.getElementById('trainee-log-input').value.trim();
    if (!logText) { showToast('수업 내용을 입력해주세요!', 'error'); return; }
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
    const savedAt = String(today.getHours()).padStart(2,'0')+':'+String(today.getMinutes()).padStart(2,'0');
    const key = dateStr + '_' + Date.now();
    const log = { date: dateStr, content: logText, savedAt };
    db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/logs/' + key).set(log).then(() => {
      showToast('수업일지가 저장됐어요! 📋', 'success');
      renderLogTab();
    });
  }

  let editLogKey = null;

  function openEditLogModal(key) {
    const trainerId = localStorage.getItem('current_user');
    db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/logs/' + key).once('value', snap => {
      const log = snap.val();
      if (!log) { showToast('기록을 찾을 수 없어요.', 'error'); return; }
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
    if (!logText) { showToast('수업 내용을 입력해주세요!', 'error'); return; }
    db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/logs/' + editLogKey + '/content').set(logText).then(() => {
      showToast('수정됐어요! 📋', 'success');
      closeEditLogModal();
      renderLogTab();
    });
  }

  function deleteTraineeLog() {
    if (!editLogKey || !currentTraineeId) return;
    showConfirm('이 수업일지를 삭제할까요?', () => {
      const trainerId = localStorage.getItem('current_user');
      db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/logs/' + editLogKey).remove().then(() => {
      showToast('삭제됐어요! 🗑', 'success');
      closeEditLogModal();
      renderLogTab();
      });
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
        showToast('잔여 횟수가 없어요! 재등록 후 이용해주세요.', 'error');
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
    showConfirm('이 서명 기록을 삭제할까요?\n잔여 횟수가 1회 복구돼요.', () => {
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
        showToast('삭제됐어요! 🗑', 'success');
        closeEditSignModal();
        // 카드 + 서명탭 동시 업데이트
        refreshTraineeView(currentTraineeId);
      });
      });
    });
  }
  // 당일취소 저장
  function saveNoShow() {
    if (!signTargetMemberId || !signTargetMemberName) return;
    showConfirm(signTargetMemberName + ' 회원님을 당일취소 처리할까요?', () => {
      const trainerId = localStorage.getItem('current_user');
      const today = new Date();
      const dateStr = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
      const savedAt = String(today.getHours()).padStart(2,'0')+':'+String(today.getMinutes()).padStart(2,'0');
      const signData = { date: dateStr, savedAt, noShow: true, memberName: signTargetMemberName };

      db.ref('trainers/' + trainerId + '/trainees/' + signTargetMemberId + '/signs/' + dateStr + '_' + Date.now()).set(signData)
      .then(() => {
        // remain 차감 (강사 목록 카드 표시용)
        const ref2 = db.ref('trainers/' + trainerId + '/trainees/' + signTargetMemberId);
        ref2.once('value', snap => {
          const info = snap.val();
          if (info && (info.remain || 0) > 0) ref2.update({ remain: (info.remain || 0) - 1 });
        });
        closeSignModal();
        showToast('당일취소 처리됐어요!', 'success');
        // 카드 + 서명탭 동시 업데이트
        refreshTraineeView(signTargetMemberId);
      });
    });
  }
  // 사인 저장
  function saveSign() {
    if (!signHasData) { showToast('서명을 해주세요!', 'error'); return; }
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

        // 회원 달력에 수업일 저장
        db.ref('users/' + signTargetMemberId + '/lessons/' + dateStr).set({
          date: dateStr,
          trainerId,
          trainerName: localStorage.getItem('name_' + trainerId) || '강사',
          savedAt
        });

        // remain 차감 (강사 목록 카드 표시용)
        const ref2 = db.ref('trainers/' + trainerId + '/trainees/' + signTargetMemberId);
        ref2.once('value', snap => {
          const info = snap.val();
          if (info && (info.remain || 0) > 0) ref2.update({ remain: (info.remain || 0) - 1 });
        });

        closeSignModal();
        showToast('✅ 서명 완료! 출석 체크됐어요.', 'success');
        // 카드 + 서명탭 동시 업데이트 (Firebase 한 번만 읽기)
        refreshTraineeView(signTargetMemberId);
      } catch(e) {
        console.error('사인 저장 오류:', e);
        showToast('저장 중 오류가 발생했어요.', 'error');
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
      db.ref('users/' + traineeId + '/classes').once('value'),
      db.ref('users/' + traineeId + '/lessons').once('value')
    ]).then(([snap, classSnap, lessonSnap]) => {
      const personalDays = new Set();
      const trainerDays = new Set();
      const lessonDays = new Set();
      if (snap.exists()) {
        snap.forEach(eqSnap => {
          eqSnap.forEach(daySnap => {
            const r = daySnap.val();
            const d = r.date;
            if (d) {
              const parts = d.split('-');
              if (parseInt(parts[0]) === year && parseInt(parts[1]) === month) {
                const day = parseInt(parts[2]);
                if (r.recordedBy === 'trainer') trainerDays.add(day);
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
      // lessons(서명받은 날) → lessonDays
      if (lessonSnap.exists()) {
        lessonSnap.forEach(daySnap => {
          const d = daySnap.key;
          if (d) {
            const parts = d.split('-');
            if (parseInt(parts[0]) === year && parseInt(parts[1]) === month) {
              lessonDays.add(parseInt(parts[2]));
            }
          }
        });
      }

      const totalLessons = lessonDays.size;
      const firstDay = new Date(year, month - 1, 1).getDay();
      const lastDate = new Date(year, month, 0).getDate();
      const today = new Date();
      const todayStr = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();

      let calHtml = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
          <div style="position:relative;">
            <svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" id="trainer-equipment-search"
              placeholder="기구명·번호 검색"
              style="width:100%;box-sizing:border-box;padding:10px 10px 10px 34px;border:1.5px dashed #1a6fd4;border-radius:var(--radius-sm);font-size:12px;font-family:'Noto Sans KR',sans-serif;outline:none;background:var(--card);color:var(--text);"
              onfocus="this.style.borderColor='#0f4fa8';showTrainerEqSearchResult(this.value,'${trainerCalSelectedDate||''}','${traineeId}')"
              onblur="this.style.borderColor='#1a6fd4'"
              oninput="showTrainerEqSearchResult(this.value,'${trainerCalSelectedDate||''}','${traineeId}')" />
            <button id="trainer-search-clear-btn" onclick="clearTrainerEqSearch()" style="display:none;position:absolute;right:8px;top:50%;transform:translateY(-50%);background:var(--text-hint);border:none;border-radius:50%;width:18px;height:18px;cursor:pointer;color:white;font-size:12px;line-height:1;padding:0;">×</button>
          </div>
          <button onclick="openTrainerFwWorkoutMode('${trainerCalSelectedDate||''}','${traineeId}')"
            style="padding:10px 8px;background:var(--card);border:1.5px dashed #8b5cf6;border-radius:var(--radius-sm);color:#8b5cf6;font-size:12px;font-weight:700;font-family:'Noto Sans KR',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 4v16M18 4v16M6 12h12M3 8h3M18 8h3M3 16h3M18 16h3"/>
            </svg>
            프리웨이트 기록
          </button>
        </div>
        <div id="trainer-equipment-search-result" style="display:none;background:var(--card);border:1.5px solid var(--blue);border-radius:var(--radius-sm);margin-bottom:10px;overflow:hidden;box-shadow:0 4px 16px rgba(26,111,212,0.12);max-height:220px;overflow-y:auto;"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <button onclick="trainerChangeCalMonth(-1)" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text);padding:4px 8px;">‹</button>
          <div style="font-size:15px;font-weight:700;color:var(--text);">${year}년 ${month}월</div>
          <button onclick="trainerChangeCalMonth(1)" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text);padding:4px 8px;">›</button>
        </div>
        <div style="background:rgba(22,163,74,0.08);border-radius:8px;padding:6px 12px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:12px;color:var(--text-hint);">${month}월 총 수업</span>
          <span style="font-size:14px;font-weight:700;color:#16a34a;">${totalLessons}회</span>
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
            const hasLesson = lessonDays.has(day);
            const hasTrainer = trainerDays.has(day);
            const hasPersonal = personalDays.has(day);
            const hasDot = hasTrainer || hasPersonal;
            const dotHtml = hasDot
              ? `<div style="display:flex;gap:2px;justify-content:center;margin:1px auto 0;">
                  ${hasTrainer ? `<div style="width:5px;height:5px;border-radius:50%;background:${hasLesson?'rgba(255,255,255,0.9)':'#f59e0b'};"></div>` : ''}
                  ${hasPersonal ? `<div style="width:5px;height:5px;border-radius:50%;background:${hasLesson?'rgba(255,255,255,0.7)':'var(--blue)'};"></div>` : ''}
                </div>`
              : '<div style="width:5px;height:5px;margin:1px auto 0;"></div>';
            const dow = (firstDay + i) % 7;
            let bg = hasLesson ? '#16a34a' : isSelected ? 'var(--blue)' : isToday ? 'rgba(124,58,237,0.15)' : 'transparent';
            let color = hasLesson ? 'white' : isSelected ? 'white' : isToday ? '#7c3aed' : dow===0 ? '#ef4444' : dow===6 ? '#3b82f6' : 'var(--text)';
            let fontW = (hasLesson || isToday || isSelected) ? '700' : '400';
            return `<div onclick="selectTrainerCalDay('${dateStr}')" style="text-align:center;padding:6px 2px;border-radius:50%;cursor:pointer;background:${bg};position:relative;">
              <div style="font-size:13px;font-weight:${fontW};color:${color};">${day}</div>
              ${dotHtml}
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:8px;border-top:0.5px solid var(--border);flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:4px;">
            <div style="width:10px;height:10px;border-radius:50%;background:#16a34a;"></div>
            <span style="font-size:11px;color:var(--text-hint);">서명받은 날</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <div style="width:7px;height:7px;border-radius:50%;background:#f59e0b;"></div>
            <span style="font-size:11px;color:var(--text-hint);">PT 기록</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <div style="width:7px;height:7px;border-radius:50%;background:var(--blue);"></div>
            <span style="font-size:11px;color:var(--text-hint);">개인 운동</span>
          </div>
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
                  ? `<span style="font-size:10px;font-weight:700;color:white;background:#f59e0b;padding:2px 5px;border-radius:4px;flex-shrink:0;">PT</span>`
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

      // 기구 검색창 + 프리웨이트 버튼은 달력 위로 이동됨

      detailEl.innerHTML = html;
    });
  }

  // 수업기록 삭제
  function deleteTrainerWorkout(traineeId, eqKey, dateStr) {
    showConfirm('이 운동 기록을 삭제할까요?', () => {
      db.ref('users/' + traineeId + '/workouts/' + eqKey + '/' + dateStr).remove()
      .then(() => {
        renderTrainerDayDetail(dateStr);
        renderTrainerCal();
      })
      .catch(e => { console.error(e); showToast('삭제 중 오류가 발생했어요.', 'error'); });
    });
  }
  // 수업기록 수정 모달 열기 (edit-workout-modal 재활용)
  let trainerEditTraineeId = null, trainerEditEqKey = null, trainerEditDateStr = null;

  function openTrainerWorkoutEditModal(traineeId, eqKey, dateStr) {
    trainerEditTraineeId = traineeId;
    trainerEditEqKey = eqKey;
    trainerEditDateStr = dateStr;

    db.ref('users/' + traineeId + '/workouts/' + eqKey + '/' + dateStr).once('value', snap => {
      const r = snap.val();
      if (!r) { showToast('기록을 찾을 수 없어요.', 'error'); return; }

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
    if (sets.length === 0) { showToast('최소 1세트 이상 입력해주세요!', 'error'); return; }
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
          showToast('수정됐어요!', 'success');
        })
        .catch(e => { console.error(e); showToast('수정 중 오류가 발생했어요.', 'error'); });
    });
  }

  // 수업기록 삭제 (수정 모달에서)
  function deleteTrainerWorkoutFromEdit() {
    showConfirm('이 운동 기록을 삭제할까요?', () => {
      db.ref('users/' + trainerEditTraineeId + '/workouts/' + trainerEditEqKey + '/' + trainerEditDateStr).remove()
        .then(() => {
          closeTrainerEditModal();
          renderTrainerDayDetail(trainerEditDateStr);
          renderTrainerCal();
        })
        .catch(e => { console.error(e); showToast('삭제 중 오류가 발생했어요.', 'error'); });
    });
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
    trainerTargetId = traineeId || currentTraineeId;
    trainerTargetDate = dateStr || trainerCalSelectedDate || null;
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
    if (sets.length === 0) { showToast('최소 1세트 이상 입력해주세요!', 'error'); return; }
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
        showToast('운동기록 저장 완료!', 'success');
        closeTrainerWorkoutModal();
        renderTrainerCal();
      })
      .catch(e => { console.error(e); showToast('저장 중 오류가 발생했어요.', 'error'); });
  }

  // 프리웨이트 저장
  function saveTrainerFwWorkout() {
    if (!currentTraineeId || !trainerCalSelectedDate) return;
    const nameEl = document.getElementById('trainer-fw-name-display');
    const name = nameEl ? nameEl.textContent : '';
    if (!name) { showToast('운동 이름이 없어요!', 'error'); return; }
    const sets = [];
    for (let i = 1; i <= trainerFwSetCount; i++) {
      const wEl = document.getElementById('trainer-fw-weight-' + i);
      const rEl = document.getElementById('trainer-fw-reps-' + i);
      if (!wEl || !rEl) continue;
      const w = parseFloat(wEl.value) || 0;
      const r = parseInt(rEl.value) || 0;
      if (w > 0 || r > 0) sets.push({ set: sets.length+1, weight: w, reps: r });
    }
    if (sets.length === 0) { showToast('최소 1세트 이상 입력해주세요!', 'error'); return; }
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
        showToast('운동기록 저장 완료!', 'success');
        closeTrainerFwWorkoutModal();
        renderTrainerCal();
      })
      .catch(e => { console.error(e); showToast('저장 중 오류가 발생했어요.', 'error'); });
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

  // ── 쿠폰 시스템 ──

  function switchCouponTab(tabId) {
    document.querySelectorAll('.coupon-section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.coupon-sub-tab').forEach(t => {
      t.style.background = 'var(--bg)'; t.style.color = 'var(--text-sub)'; t.style.borderColor = 'var(--border)';
    });
    document.getElementById(tabId).style.display = 'block';
    event.target.style.background = '#7F77DD';
    event.target.style.color = '#fff';
    event.target.style.borderColor = '#7F77DD';
    if (tabId === 'coupon-list') loadAdminCouponList();
    if (tabId === 'coupon-auto') loadAutoConditions();
    if (tabId === 'coupon-points') loadPointSettings();
  }

  function toggleCouponValueLabel() {
    const type = document.getElementById('coupon-type').value;
    const label = document.getElementById('coupon-value-label');
    const valueInput = document.getElementById('coupon-value');
    if (type === 'free') { label.textContent = '횟수'; valueInput.style.display = ''; valueInput.placeholder = '3'; }
    else if (type === 'discount') { label.textContent = '할인율 (%)'; valueInput.style.display = ''; valueInput.placeholder = '10'; }
    else if (type === 'extend') { label.textContent = '연장 (일)'; valueInput.style.display = ''; valueInput.placeholder = '30'; }
    else if (type === 'drink') { label.textContent = '음료 쿠폰'; valueInput.style.display = 'none'; valueInput.value = '1'; }
    else if (type === 'americano') { label.textContent = '아메리카노'; valueInput.style.display = 'none'; valueInput.value = '1'; }
  }

  function toggleCouponMemberSelect() {
    const target = document.getElementById('coupon-target').value;
    const wrap = document.getElementById('coupon-member-select');
    wrap.style.display = target === 'specific' ? 'block' : 'none';
    if (target === 'specific') {
      document.getElementById('coupon-member-search').value = '';
      document.getElementById('coupon-member-id').value = '';
      document.getElementById('coupon-member-results').style.display = 'none';
      document.getElementById('coupon-member-selected').style.display = 'none';
      loadAllMembersForSearch();
    }
  }

  let allMembersCache = [];

  function loadAllMembersForSearch() {
    db.ref('members').once('value', snap => {
      allMembersCache = [];
      snap.forEach(child => {
        const m = child.val();
        allMembersCache.push({ id: child.key, name: m.name || child.key });
      });
    });
  }

  function searchCouponMember(query) {
    const resultsEl = document.getElementById('coupon-member-results');
    const selectedEl = document.getElementById('coupon-member-selected');
    document.getElementById('coupon-member-id').value = '';
    selectedEl.style.display = 'none';

    if (!query.trim()) { resultsEl.style.display = 'none'; return; }

    const filtered = allMembersCache.filter(m =>
      m.name.includes(query) || m.id.includes(query)
    );

    if (filtered.length === 0) {
      resultsEl.innerHTML = '<div style="padding:12px;font-size:13px;color:var(--text-hint);text-align:center;">검색 결과가 없어요</div>';
      resultsEl.style.display = 'block';
      return;
    }

    resultsEl.innerHTML = filtered.map(m =>
      `<div onclick="selectCouponMember('${m.id}','${m.name}')"
        style="padding:12px 14px;font-size:14px;color:var(--text);cursor:pointer;border-bottom:1px solid var(--border);background:var(--card);"
        onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='var(--card)'">
        <span style="font-weight:600;">${m.name}</span>
        <span style="color:var(--text-hint);margin-left:8px;font-size:12px;">${m.id}</span>
      </div>`
    ).join('');
    resultsEl.style.display = 'block';
  }

  function selectCouponMember(id, name) {
    document.getElementById('coupon-member-id').value = id;
    document.getElementById('coupon-member-search').value = '';
    document.getElementById('coupon-member-results').style.display = 'none';
    const selectedEl = document.getElementById('coupon-member-selected');
    selectedEl.textContent = '선택됨: ' + name + ' (' + id + ')';
    selectedEl.style.display = 'block';
  }

  function loadMemberSelectOptions() {
    loadAllMembersForSearch();
  }

  function issueCoupon() {
    const name = document.getElementById('coupon-name').value.trim();
    const type = document.getElementById('coupon-type').value;
    const value = document.getElementById('coupon-value').value.trim();
    const expire = document.getElementById('coupon-expire').value;
    const limit = document.getElementById('coupon-limit').value;
    const target = document.getElementById('coupon-target').value;
    const memo = document.getElementById('coupon-memo').value.trim();

    if (!name) { showToast('쿠폰 이름을 입력해주세요.', 'error'); return; }
    if (!value) { showToast('쿠폰 값을 입력해주세요.', 'error'); return; }
    if (!expire) { showToast('유효기간을 설정해주세요.', 'error'); return; }

    const couponData = {
      name, type, value, expire, limit, memo,
      issuedAt: new Date().toISOString(),
      used: false
    };

    if (target === 'all') {
      db.ref('members').once('value', snap => {
        const updates = {};
        snap.forEach(child => {
          const couponId = db.ref('coupons/' + child.key).push().key;
          updates['coupons/' + child.key + '/' + couponId] = couponData;
        });
        db.ref().update(updates).then(() => {
          showToast('전체 회원에게 쿠폰이 발행됐어요! 🎫', 'success');
          clearCouponForm();
          // 전체 회원 쿠폰 푸시알림
          if (typeof sendPushToAll === 'function') {
            sendPushToAll('🎟️ 쿠폰 도착!', '"' + name + '" 쿠폰이 도착했어요 🎫', 'coupon', { type: 'coupon' });
          }
        });
      });
    } else {
      const memberId = document.getElementById('coupon-member-id').value;
      if (!memberId) { showToast('회원을 선택해주세요.', 'error'); return; }
      db.ref('coupons/' + memberId).push(couponData).then(() => {
        showToast('쿠폰이 발행됐어요! 🎫', 'success');
        clearCouponForm();
        // 특정 회원 쿠폰 푸시알림
        if (typeof sendPushToUser === 'function') {
          sendPushToUser(memberId, '🎟️ 쿠폰 도착!', '"' + name + '" 쿠폰이 도착했어요 🎫', 'coupon', { type: 'coupon' });
        }
      });
    }
  }

  function clearCouponForm() {
    document.getElementById('coupon-name').value = '';
    document.getElementById('coupon-value').value = '';
    document.getElementById('coupon-expire').value = '';
    document.getElementById('coupon-memo').value = '';
    document.getElementById('coupon-target').value = 'all';
    document.getElementById('coupon-member-select').style.display = 'none';
  }

  function loadAdminCouponList() {
    const listEl = document.getElementById('admin-coupon-list');
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);">불러오는 중...</div>';
    db.ref('coupons').once('value', snap => {
      if (!snap.exists()) { listEl.innerHTML = '<div class="empty-state">발행된 쿠폰이 없어요</div>'; return; }
      let html = '';
      snap.forEach(memberSnap => {
        const memberId = memberSnap.key;
        memberSnap.forEach(couponSnap => {
          const c = couponSnap.val();
          const couponId = couponSnap.key;
          if (c.used) return;
          const typeLabel = c.type === 'free' ? `무료 ${c.value}회` : c.type === 'discount' ? `${c.value}% 할인` : c.type === 'extend' ? `${c.value}일 연장` : c.type === 'drink' ? '음료 쿠폰' : c.type === 'americano' ? '아메리카노 쿠폰' : c.value;
          const badgeColor = c.type === 'free' ? '#E1F5EE;color:#0F6E56' : c.type === 'discount' ? '#EEEDFE;color:#3C3489' : c.type === 'drink' ? '#FEF3C7;color:#92400E' : c.type === 'americano' ? '#FEF3C7;color:#92400E' : '#E6F1FB;color:#185FA5';
          html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-size:14px;font-weight:700;color:var(--text);">${c.name}</span>
              <span style="background:${badgeColor};font-size:11px;padding:3px 8px;border-radius:10px;font-weight:600;">${typeLabel}</span>
            </div>
            <div style="font-size:12px;color:var(--text-hint);margin-bottom:2px;">회원: ${memberId}</div>
            <div style="font-size:12px;color:var(--text-hint);margin-bottom:8px;">유효기간: ~${c.expire}</div>
            ${c.memo ? `<div style="font-size:12px;color:var(--text-sub);margin-bottom:8px;">메모: ${c.memo}</div>` : ''}
            <button onclick="adminUseCoupon('${memberId}','${couponId}')"
              style="width:100%;padding:9px;background:#E24B4A;border:none;border-radius:var(--radius-sm);color:white;font-size:13px;font-weight:700;font-family:'Noto Sans KR',sans-serif;cursor:pointer;">
              ✅ 사용 처리
            </button>
          </div>`;
        });
      });
      listEl.innerHTML = html || '<div class="empty-state">발행된 쿠폰이 없어요</div>';
    });
  }

  function adminUseCoupon(memberId, couponId) {
    showConfirm('쿠폰을 사용 처리할까요?', () => {
      db.ref('coupons/' + memberId + '/' + couponId).remove().then(() => {
      showToast('사용 처리 완료! ✅', 'success');
      loadAdminCouponList();
      });
    });
  }
  // 회원 내 쿠폰
  function openMyCoupons() {
    document.getElementById('my-coupon-modal').style.display = 'block';
    loadMyCoupons();
    // 쿠폰 확인 시 배지 초기화
    if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
  }

  function closeMyCoupons() {
    document.getElementById('my-coupon-modal').style.display = 'none';
  }

  function loadMyCoupons() {
    const userId = localStorage.getItem('current_user');
    const listEl = document.getElementById('my-coupon-list');
    const countEl = document.getElementById('my-coupon-count');
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);">불러오는 중...</div>';
    db.ref('coupons/' + userId).once('value', snap => {
      if (!snap.exists() || !snap.val()) {
        listEl.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-hint);font-size:14px;">보유한 쿠폰이 없어요 🎫</div>';
        if (countEl) countEl.style.display = 'none';
        return;
      }
      let count = 0;
      let html = '';
      snap.forEach(couponSnap => {
        const c = couponSnap.val();
        const couponId = couponSnap.key;
        const typeLabel = c.type === 'free' ? `무료 이용 ${c.value}회 추가` : c.type === 'discount' ? `${c.value}% 할인` : c.type === 'extend' ? `${c.value}일 연장` : c.type === 'drink' ? '☕ 음료 1잔' : c.type === 'americano' ? '☕ 아메리카노 1잔' : c.value;
        const borderColor = c.type === 'free' ? '#7F77DD' : c.type === 'discount' ? '#1D9E75' : '#D97706';
        count++;
        html += `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:12px;">
          <div style="padding:14px 16px;border-left:4px solid ${borderColor};">
            <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px;">${c.name}</div>
            <div style="font-size:13px;color:var(--text-sub);margin-bottom:4px;">${typeLabel}</div>
            ${c.memo ? `<div style="font-size:12px;color:var(--text-hint);margin-bottom:4px;">${c.memo}</div>` : ''}
            <div style="font-size:12px;color:var(--text-hint);">~ ${c.expire}까지</div>
          </div>
          <div style="padding:12px 16px;background:var(--bg);border-top:1px solid var(--border);">
            <div style="font-size:12px;color:var(--text-hint);margin-bottom:10px;text-align:center;">관리자에게 이 화면을 보여주세요</div>
            <button onclick="memberUseCoupon('${userId}','${couponId}')"
              style="width:100%;padding:11px;background:#E24B4A;border:none;border-radius:var(--radius-sm);color:white;font-size:14px;font-weight:700;font-family:'Noto Sans KR',sans-serif;cursor:pointer;">
              ✅ 사용하기 (관리자가 눌러주세요)
            </button>
          </div>
        </div>`;
      });
      listEl.innerHTML = html;
      if (countEl) { countEl.textContent = count + '장'; countEl.style.display = 'inline'; }
    });
  }

  function memberUseCoupon(userId, couponId) {
    showConfirm('쿠폰을 사용할까요?\n사용 후에는 되돌릴 수 없어요.', () => {
      db.ref('coupons/' + userId + '/' + couponId).remove().then(() => {
      showToast('쿠폰이 사용됐어요! ✅', 'success');
      loadMyCoupons();
      });
    });
  }

  // ── 자동 쿠폰 조건 ──

  function toggleAutoValueLabel(key) {
    const type = document.getElementById('auto-' + key + '-type').value;
    const label = document.getElementById('auto-' + key + '-val-label');
    const valueInput = document.getElementById('auto-' + key + '-value');
    if (!label) return;
    if (type === 'free') { label.textContent = '지급 횟수'; if (valueInput) { valueInput.style.display = ''; valueInput.placeholder = '1'; } }
    else if (type === 'discount') { label.textContent = '할인율 (%)'; if (valueInput) { valueInput.style.display = ''; valueInput.placeholder = '10'; } }
    else if (type === 'extend') { label.textContent = '연장 (일)'; if (valueInput) { valueInput.style.display = ''; valueInput.placeholder = '30'; } }
    else if (type === 'drink') { label.textContent = '음료 쿠폰'; if (valueInput) { valueInput.style.display = 'none'; valueInput.value = '1'; } }
    else if (type === 'americano') { label.textContent = '아메리카노'; if (valueInput) { valueInput.style.display = 'none'; valueInput.value = '1'; } }
  }

  function updateToggleUI(key, isOn) {
    const slider = document.getElementById('auto-' + key + '-slider');
    if (!slider) return;
    slider.style.background = isOn ? '#7F77DD' : '#ccc';
    slider.style.setProperty('--offset', isOn ? '20px' : '2px');
    slider.style.cssText += isOn
      ? ';position:absolute;cursor:pointer;inset:0;background:#7F77DD;border-radius:24px;transition:0.3s;'
      : ';position:absolute;cursor:pointer;inset:0;background:#ccc;border-radius:24px;transition:0.3s;';
    if (!slider.querySelector('span')) {
      const dot = document.createElement('span');
      dot.style.cssText = 'position:absolute;top:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:0.3s;';
      slider.appendChild(dot);
    }
    const dot = slider.querySelector('span');
    if (dot) dot.style.left = isOn ? '22px' : '2px';
  }

  function saveAutoCondition(key) {
    const isOn = document.getElementById('auto-' + key + '-on').checked;
    updateToggleUI(key, isOn);
    const data = { on: isOn };
    if (key === 'attend' || key === 'streak') {
      data.count = document.getElementById('auto-' + key + '-count').value;
    }
    data.type = document.getElementById('auto-' + key + '-type') ? document.getElementById('auto-' + key + '-type').value : 'free';
    data.value = document.getElementById('auto-' + key + '-value').value;
    data.expire = document.getElementById('auto-' + key + '-expire').value;
    db.ref('auto_coupon_conditions/' + key).set(data);
  }

  function loadAutoConditions() {
    db.ref('auto_coupon_conditions').once('value', snap => {
      if (!snap.exists()) return;
      const conditions = snap.val();
      ['attend', 'streak', 'owunwan', 'birthday'].forEach(key => {
        const c = conditions[key];
        if (!c) return;
        const onEl = document.getElementById('auto-' + key + '-on');
        if (onEl) { onEl.checked = c.on || false; updateToggleUI(key, c.on || false); }
        if (key === 'attend' || key === 'streak') {
          const countEl = document.getElementById('auto-' + key + '-count');
          if (countEl && c.count) countEl.value = c.count;
        }
        const typeEl = document.getElementById('auto-' + key + '-type');
        if (typeEl && c.type) { typeEl.value = c.type; toggleAutoValueLabel(key); }
        const valEl = document.getElementById('auto-' + key + '-value');
        if (valEl && c.value) valEl.value = c.value;
        const expEl = document.getElementById('auto-' + key + '-expire');
        if (expEl && c.expire) expEl.value = c.expire;
      });
    });
  }

  // 자동 쿠폰 발행 체크 (로그인 후 호출)
  function checkAutoCoupons(userId) {
    db.ref('auto_coupon_conditions').once('value', snap => {
      if (!snap.exists()) return;
      const conds = snap.val();

      // 출석 횟수
      if (conds.attend && conds.attend.on) {
        const targetCount = parseInt(conds.attend.count || 0);
        db.ref('users/' + userId + '/attendance').once('value', attSnap => {
          const total = attSnap.exists() ? Object.keys(attSnap.val()).length : 0;
          if (total === targetCount) {
            const doneKey = 'auto_coupon_attend_' + targetCount + '_' + userId;
            db.ref('coupon_issued_flags/' + doneKey).once('value', flagSnap => {
              if (!flagSnap.exists()) {
                issueAutoCoupon(userId, '출석 ' + targetCount + '회 달성 쿠폰', conds.attend);
                db.ref('coupon_issued_flags/' + doneKey).set(true);
              }
            });
          }
        });
      }

      // 연속 출석
      if (conds.streak && conds.streak.on) {
        const targetStreak = parseInt(conds.streak.count || 0);
        db.ref('users/' + userId + '/attendance').once('value', attSnap => {
          if (!attSnap.exists()) return;
          const dates = Object.keys(attSnap.val()).sort().reverse();
          let streak = 0;
          let prev = null;
          for (const d of dates) {
            if (!prev) { streak = 1; prev = d; continue; }
            const diff = (new Date(prev) - new Date(d)) / 86400000;
            if (diff === 1) { streak++; prev = d; } else break;
          }
          if (streak === targetStreak) {
            const doneKey = 'auto_coupon_streak_' + targetStreak + '_' + userId + '_' + getToday();
            db.ref('coupon_issued_flags/' + doneKey).once('value', flagSnap => {
              if (!flagSnap.exists()) {
                issueAutoCoupon(userId, '연속 ' + targetStreak + '일 출석 쿠폰', conds.streak);
                db.ref('coupon_issued_flags/' + doneKey).set(true);
              }
            });
          }
        });
      }

      // 생일
      if (conds.birthday && conds.birthday.on) {
        db.ref('members/' + userId).once('value', mSnap => {
          if (!mSnap.exists()) return;
          const m = mSnap.val();
          if (!m.birth) return;
          const today = getToday();
          const [, mm, dd] = today.split('-');
          const [, bm, bd] = m.birth.split('-');
          if (mm === bm && dd === bd) {
            const doneKey = 'auto_coupon_birthday_' + userId + '_' + today.slice(0,7);
            db.ref('coupon_issued_flags/' + doneKey).once('value', flagSnap => {
              if (!flagSnap.exists()) {
                issueAutoCoupon(userId, '🎂 생일 축하 쿠폰', conds.birthday);
                db.ref('coupon_issued_flags/' + doneKey).set(true);
              }
            });
          }
        });
      }
    });
  }

  function issueAutoCoupon(userId, name, cond) {
    const expireDays = parseInt(cond.expire || 30);
    const expireDate = new Date();
    expireDate.setDate(expireDate.getDate() + expireDays);
    const expire = expireDate.toISOString().slice(0, 10);
    const couponData = {
      name, type: cond.type, value: cond.value,
      expire, limit: '1', memo: '자동 발행',
      issuedAt: new Date().toISOString(), used: false, auto: true
    };
    db.ref('coupons/' + userId).push(couponData).then(ref => {
      const loggedIn = localStorage.getItem('current_user');
      if (loggedIn === userId) {
        const shownKey = 'coupon_shown_' + userId;
        const shownList = JSON.parse(localStorage.getItem(shownKey) || '[]');
        shownList.push(ref.key);
        localStorage.setItem(shownKey, JSON.stringify(shownList));
        setTimeout(() => showCouponArrive({ id: ref.key, ...couponData }), 500);
      }
    });
  }


  // ── 생년월일 수정 ──
  function openEditBirth() {
    const userId = localStorage.getItem('current_user');
    const birth = localStorage.getItem('body_birth_' + userId) || '';
    if (birth) {
      showToast('생년월일은 최초 입력 후 수정할 수 없어요 🎂', 'info');
      return;
    }
    const input = document.getElementById('edit-birth-input');
    if (input) input.value = '';
    document.getElementById('edit-birth-modal').style.display = 'flex';
  }

  function closeEditBirth() {
    document.getElementById('edit-birth-modal').style.display = 'none';
  }

  function saveEditBirth() {
    const userId = localStorage.getItem('current_user');
    const birth = document.getElementById('edit-birth-input').value.trim();
    if (birth && (birth.length !== 8 || isNaN(birth))) {
      showToast('생년월일을 8자리 숫자로 입력해주세요.\n예) 19791012', 'error'); return;
    }
    localStorage.setItem('body_birth_' + userId, birth);
    db.ref('members/' + userId + '/birth').set(birth || null);
    const el = document.getElementById('myinfo-birth');
    if (el) el.textContent = birth ? formatBirth(birth) : '';
    closeEditBirth();
    showToast('생년월일이 저장됐어요! 🎂', 'success');
  }

  function formatBirth(birth) {
    if (!birth || birth.length !== 8) return '';
    return birth.slice(0,4) + '년 ' + parseInt(birth.slice(4,6)) + '월 ' + parseInt(birth.slice(6,8)) + '일';
  }

  function loadMyInfoBirth() {
    const userId = localStorage.getItem('current_user');
    const el = document.getElementById('myinfo-birth');
    const btn = document.getElementById('myinfo-birth-edit-btn');
    if (!el) return;
    const local = localStorage.getItem('body_birth_' + userId);
    if (local) {
      el.textContent = formatBirth(local);
      if (btn) btn.style.display = 'none';
      return;
    }
    db.ref('members/' + userId + '/birth').once('value', snap => {
      if (snap.exists()) {
        const birth = snap.val();
        localStorage.setItem('body_birth_' + userId, birth);
        el.textContent = formatBirth(birth);
        if (btn) btn.style.display = 'none';
      } else {
        if (btn) btn.style.display = 'inline';
      }
    });
  }


  // ── 포인트 설정 ──

  function loadPointSettings() {
    db.ref('point_settings').once('value', snap => {
      const s = snap.val() || {};
      document.getElementById('pts-owunwan').value       = s.owunwan      ?? 10;
      document.getElementById('pts-attend').value        = s.attend       ?? 2;
      document.getElementById('pts-weight').value        = s.weightRecord ?? 1;
      document.getElementById('pts-diet-text').value     = s.dietText     ?? 5;
      document.getElementById('pts-diet-photo').value    = s.dietPhoto    ?? 10;
      document.getElementById('pts-like').value          = s.like         ?? 1;
      document.getElementById('pts-tip').value           = s.tip          ?? 0;
      document.getElementById('pts-free').value          = s.free         ?? 0;
    });
    loadPointTiers();
  }

  function savePointSettings() {
    const data = {
      owunwan:       parseInt(document.getElementById('pts-owunwan').value)    || 0,
      attend:        parseInt(document.getElementById('pts-attend').value)     || 0,
      weightRecord:  parseInt(document.getElementById('pts-weight').value)     || 0,
      dietText:      parseInt(document.getElementById('pts-diet-text').value)  || 0,
      dietPhoto:     parseInt(document.getElementById('pts-diet-photo').value) || 0,
      like:          parseInt(document.getElementById('pts-like').value)       || 0,
      tip:           parseInt(document.getElementById('pts-tip').value)        || 0,
      free:          parseInt(document.getElementById('pts-free').value)       || 0,
    };
    db.ref('point_settings').set(data);
  }

  // 포인트 달성 구간 관리
  let pointTiers = [];

  function loadPointTiers() {
    db.ref('point_tiers').once('value', snap => {
      pointTiers = [];
      if (snap.exists()) snap.forEach(child => pointTiers.push({ id: child.key, ...child.val() }));
      if (pointTiers.length === 0) {
        // 기본 구간 2개
        pointTiers = [
          { id: null, points: 200, type: 'repeat', couponType: 'drink', couponName: '음료 쿠폰', active: true },
          { id: null, points: 1000, type: 'once', couponType: 'discount', couponName: '재등록 5% 할인', active: false }
        ];
      }
      renderPointTiers();
    });
  }

  function renderPointTiers() {
    const list = document.getElementById('point-tiers-list');
    if (!list) return;
    list.innerHTML = '';
    pointTiers.forEach((tier, idx) => {
      const couponTypes = [
        {v:'drink', l:'음료 쿠폰'}, {v:'americano', l:'아메리카노 쿠폰'},
        {v:'free', l:'무료 횟수'}, {v:'discount', l:'할인 (%)'},
        {v:'extend', l:'기간 연장 (일)'}
      ];
      const opts = couponTypes.map(c => `<option value="${c.v}" ${tier.couponType===c.v?'selected':''}>${c.l}</option>`).join('');
      const needValue = ['free','discount','extend'].includes(tier.couponType);
      list.innerHTML += `
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div style="font-size:13px;font-weight:600;color:var(--text);">구간 ${idx+1}</div>
            <div style="display:flex;align-items:center;gap:8px;">
              <label style="position:relative;display:inline-block;width:44px;height:24px;">
                <input type="checkbox" ${tier.active?'checked':''} onchange="togglePointTier(${idx},this.checked)" style="opacity:0;width:0;height:0;">
                <span class="tier-slider" style="position:absolute;cursor:pointer;inset:0;background:${tier.active?'#7F77DD':'#ccc'};border-radius:24px;transition:0.3s;">
                  <span style="position:absolute;top:2px;left:${tier.active?'22':'2'}px;width:20px;height:20px;background:#fff;border-radius:50%;transition:0.3s;"></span>
                </span>
              </label>
              <button onclick="removePointTier(${idx})" style="background:none;border:none;color:#ef4444;font-size:18px;cursor:pointer;">×</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
            <div>
              <div style="font-size:11px;color:var(--text-hint);margin-bottom:3px;">달성 포인트</div>
              <div style="display:flex;align-items:center;gap:4px;">
                <input type="number" value="${tier.points}" min="1" onchange="updatePointTier(${idx},'points',this.value)"
                  style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-weight:700;text-align:center;font-family:'Noto Sans KR',sans-serif;background:var(--card);color:var(--text);">
                <span style="font-size:12px;color:var(--text-hint);white-space:nowrap;">P</span>
              </div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--text-hint);margin-bottom:3px;">발행 방식</div>
              <select onchange="updatePointTier(${idx},'type',this.value)"
                style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:'Noto Sans KR',sans-serif;background:var(--card);color:var(--text);">
                <option value="repeat" ${tier.type==='repeat'?'selected':''}>반복형</option>
                <option value="once" ${tier.type==='once'?'selected':''}>1회형</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr ${needValue?'1fr':''}; gap:8px;">
            <div>
              <div style="font-size:11px;color:var(--text-hint);margin-bottom:3px;">쿠폰 종류</div>
              <select onchange="updatePointTier(${idx},'couponType',this.value);renderPointTiers()"
                style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:'Noto Sans KR',sans-serif;background:var(--card);color:var(--text);">
                ${opts}
              </select>
            </div>
            ${needValue ? `<div>
              <div style="font-size:11px;color:var(--text-hint);margin-bottom:3px;">${tier.couponType==='discount'?'할인율(%)':tier.couponType==='extend'?'연장(일)':'횟수'}</div>
              <input type="number" value="${tier.couponValue||1}" min="1" onchange="updatePointTier(${idx},'couponValue',this.value)"
                style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-weight:700;text-align:center;font-family:'Noto Sans KR',sans-serif;background:var(--card);color:var(--text);">
            </div>` : ''}
          </div>
          <div style="margin-top:8px;">
            <div style="font-size:11px;color:var(--text-hint);margin-bottom:3px;">쿠폰 이름</div>
            <input type="text" value="${tier.couponName||''}" placeholder="쿠폰 이름 입력" onchange="updatePointTier(${idx},'couponName',this.value)"
              style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:'Noto Sans KR',sans-serif;background:var(--card);color:var(--text);">
          </div>
          <div style="margin-top:6px;font-size:11px;color:var(--text-hint);">
            ${tier.type==='repeat' ? `🔄 ${tier.points}P마다 반복 발행` : `1️⃣ ${tier.points}P 달성 시 1회만 발행`}
          </div>
        </div>`;
    });
  }

  function addPointTier() {
    pointTiers.push({ id: null, points: 500, type: 'once', couponType: 'drink', couponName: '', active: true });
    savePointTiers();
    renderPointTiers();
  }

  function removePointTier(idx) {
    showConfirm('이 구간을 삭제할까요?', () => {
      pointTiers.splice(idx, 1);
      savePointTiers();
      renderPointTiers();
    });
  }
  function togglePointTier(idx, val) {
    pointTiers[idx].active = val;
    savePointTiers();
    // renderPointTiers 대신 DOM 직접 업데이트로 부드러운 애니메이션 유지
    const sliders = document.querySelectorAll('#point-tiers-list .tier-slider');
    const slider = sliders[idx];
    if (slider) {
      slider.style.background = val ? '#7F77DD' : '#ccc';
      const dot = slider.querySelector('span');
      if (dot) dot.style.left = val ? '22px' : '2px';
    }
  }

  function updatePointTier(idx, key, val) {
    pointTiers[idx][key] = key === 'points' ? parseInt(val) : val;
    savePointTiers();
  }

  function savePointTiers() {
    const data = {};
    pointTiers.forEach((t, i) => { data['tier_' + i] = { points: t.points, type: t.type, couponType: t.couponType, couponName: t.couponName, couponValue: t.couponValue||1, active: t.active }; });
    db.ref('point_tiers').set(data);
  }

  // 포인트 달성 쿠폰 자동 발행 체크
  function checkPointTierCoupons(userId, newPoints) {
    db.ref('point_tiers').once('value', snap => {
      if (!snap.exists()) return;
      snap.forEach(child => {
        const tier = child.val();
        if (!tier.active) return;
        const expireDays = 30;
        const expireDate = new Date(); expireDate.setDate(expireDate.getDate() + expireDays);
        const expire = expireDate.toISOString().slice(0,10);

        if (tier.type === 'repeat') {
          // 반복형: 몇 번째 구간인지 계산
          const prevCount = Math.floor((newPoints - 1) / tier.points);
          const newCount  = Math.floor(newPoints / tier.points);
          if (newCount > prevCount) {
            issueCouponToUser(userId, tier, expire);
          }
        } else if (tier.type === 'once') {
          // 1회형: 이전엔 미달, 지금 달성
          db.ref('point_tier_issued/' + userId + '/' + child.key).once('value', flagSnap => {
            if (!flagSnap.exists() && newPoints >= tier.points) {
              issueCouponToUser(userId, tier, expire);
              db.ref('point_tier_issued/' + userId + '/' + child.key).set(true);
            }
          });
        }
      });
    });
  }

  function issueCouponToUser(userId, tier, expire) {
    const couponData = {
      name: tier.couponName || '포인트 달성 쿠폰',
      type: tier.couponType,
      value: tier.couponValue || 1,
      expire, limit: '1', memo: '포인트 달성 자동 발행',
      issuedAt: new Date().toISOString(), used: false, auto: true
    };
    db.ref('coupons/' + userId).push(couponData).then(ref => {
      const countEl = document.getElementById('my-coupon-count');
      if (countEl) {
        const cur = parseInt(countEl.textContent) || 0;
        countEl.textContent = (cur + 1) + '장';
        countEl.style.display = 'inline';
      }
      // 현재 로그인된 회원 본인이면 즉시 팝업
      const loggedIn = localStorage.getItem('current_user');
      if (loggedIn === userId) {
        const shownKey = 'coupon_shown_' + userId;
        const shownList = JSON.parse(localStorage.getItem(shownKey) || '[]');
        shownList.push(ref.key);
        localStorage.setItem(shownKey, JSON.stringify(shownList));
        setTimeout(() => showCouponArrive({ id: ref.key, ...couponData }), 500);
      }
      // 포인트 달성 쿠폰 푸시알림
      if (typeof sendPushToUser === 'function') {
        const couponName = tier.couponName || '포인트 달성 쿠폰';
        sendPushToUser(userId, '🎟️ 쿠폰 도착!', '"' + couponName + '"이 도착했어요 🎫', 'coupon', { type: 'coupon' });
      }
    });
  }


  // ── 쿠폰 도착 팝업 ──
  function showCouponArrive(coupon) {
    const modal = document.getElementById('coupon-arrive-modal');
    if (!modal) return;

    const typeLabel = coupon.type === 'free' ? `무료 ${coupon.value}회`
      : coupon.type === 'discount' ? `${coupon.value}% 할인`
      : coupon.type === 'extend' ? `${coupon.value}일 연장`
      : coupon.type === 'drink' ? '음료 1잔'
      : coupon.type === 'americano' ? '아메리카노 1잔' : '';

    const icon = coupon.name.includes('생일') ? '🎂'
      : coupon.type === 'drink' || coupon.type === 'americano' ? '☕'
      : coupon.type === 'discount' ? '🏷️' : '🎫';

    const iconBg = coupon.name.includes('생일') ? '#FBEAF0'
      : coupon.type === 'americano' || coupon.type === 'drink' ? '#FEF3C7'
      : '#EEEDFE';

    document.getElementById('coupon-arrive-icon').textContent = icon;
    document.getElementById('coupon-arrive-icon').style.background = iconBg;
    document.getElementById('coupon-arrive-sub').textContent = coupon.memo || '자동 발행';
    document.getElementById('coupon-arrive-name').textContent = coupon.name;
    document.getElementById('coupon-arrive-badge').textContent = typeLabel;
    document.getElementById('coupon-arrive-exp').textContent = '~ ' + coupon.expire + '까지';

    modal.style.display = 'flex';
  }

  function closeCouponArrive() {
    const modal = document.getElementById('coupon-arrive-modal');
    if (modal) modal.style.display = 'none';
  }

  function closeCouponArriveAndOpen() {
    closeCouponArrive();
    if (typeof openMyCoupons === 'function') openMyCoupons();
  }

  // 로그인 시 미확인 쿠폰 체크
  function checkNewCoupons(userId) {
    const shownKey = 'coupon_shown_' + userId;
    const shownList = JSON.parse(localStorage.getItem(shownKey) || '[]');

    db.ref('coupons/' + userId).once('value', snap => {
      if (!snap.exists()) return;
      let newCoupon = null;
      snap.forEach(child => {
        if (!shownList.includes(child.key)) {
          newCoupon = { id: child.key, ...child.val() };
          return true; // 첫 번째 미확인 쿠폰만
        }
      });
      if (newCoupon) {
        shownList.push(newCoupon.id);
        localStorage.setItem(shownKey, JSON.stringify(shownList));
        setTimeout(() => showCouponArrive(newCoupon), 1000);
      }
    });
  }


  // ══════════════════════════════
  // 기구 관리
  // ══════════════════════════════

  // 풍산휘트니스 기본 기구 목록 (최초 1회 Firebase 이전용)
  const DEFAULT_EQUIPMENT = [
    { no:1,  name:'체스트 프레스',              muscles:'가슴',                    key:'chest_press' },
    { no:2,  name:'펙덱 & 리어 델토이드',        muscles:'가슴·어깨 후면',           key:'dual_pec_rear' },
    { no:3,  name:'랫풀 다운',                  muscles:'등',                      key:'lat_pull' },
    { no:4,  name:'롱풀',                       muscles:'등',                      key:'long_pull' },
    { no:5,  name:'크런치 밴치',                muscles:'복부',                    key:'crunch' },
    { no:6,  name:'로만체어',                   muscles:'허리·등',                  key:'roman_chair' },
    { no:7,  name:'시티드 레그 프레스',          muscles:'허벅지·엉덩이·종아리',     key:'leg_press_seated' },
    { no:8,  name:'레그 익스텐션',              muscles:'앞쪽 허벅지',              key:'leg_extension' },
    { no:9,  name:'시티드 레그 컬',             muscles:'뒷쪽 허벅지',              key:'leg_curl' },
    { no:10, name:'숄더 프레스',                muscles:'어깨',                    key:'shoulder_press' },
    { no:11, name:'암 컬',                      muscles:'이두',                    key:'arm_curl' },
    { no:12, name:'핵 프레스',                  muscles:'허벅지·엉덩이·종아리',     key:'hack_press' },
    { no:13, name:'링크 아웃타이',              muscles:'엉덩이·햄스트링',          key:'link_out' },
    { no:14, name:'글루트',                     muscles:'엉덩이·햄스트링',          key:'glute' },
    { no:15, name:'힙 쓰러스트',                muscles:'엉덩이·햄스트링',          key:'hip_thrust' },
    { no:16, name:'듀얼 이너&아웃타이',         muscles:'엉덩이·허벅지 안쪽',       key:'dual_inner_out' },
    { no:17, name:'ISO 레터럴 로우로우',         muscles:'중·하부 승모근·등',         key:'iso_low_row' },
    { no:18, name:'프론트 랫풀 다운',           muscles:'등',                      key:'front_lat_pull' },
    { no:19, name:'ISO 레터럴 하이로우',         muscles:'승모근·능형근·후면 삼각근', key:'iso_high_low' },
    { no:20, name:'ISO 레터럴 로우',            muscles:'등·능형근·후삼각근',       key:'iso_lateral_row' },
    { no:21, name:'스탠딩 어시스트 친업',        muscles:'중·하부 승모근·등·이두근',  key:'chinup_assist' },
    { no:22, name:'플레이트 숄더 프레스',        muscles:'어깨',                    key:'plate_shoulder' },
    { no:23, name:'ISO 레터럴 숄더 프레스',      muscles:'어깨',                    key:'iso_shoulder' },
    { no:24, name:'티바로우',                   muscles:'등',                      key:'tbar_row' },
    { no:25, name:'풀 오버',                    muscles:'등·가슴·삼두·코어',         key:'pullover' },
    { no:26, name:'ISO 와이드 체스트 프레스',    muscles:'가슴',                    key:'iso_wide_chest' },
    { no:27, name:'ISO 레터럴 인클라인 프레스',  muscles:'윗가슴·앞쪽 어깨·삼두근',  key:'iso_incline' },
    { no:28, name:'리니어 레그 프레스',          muscles:'허벅지·엉덩이·종아리',     key:'linear_leg_press' },
    { no:29, name:'브이스쿼트',                 muscles:'하체·엉덩이',              key:'v_squat' },
    { no:30, name:'시티드 카프레이즈',           muscles:'종아리',                  key:'calf_raise' },
    { no:31, name:'스미스 머신',                muscles:'운동방법에 따라 다름',      key:'smith_machine' },
    { no:32, name:'듀얼 케이블 머신',            muscles:'운동방법에 따라 다름',      key:'cable_machine' },
  ];

  // 기구 목록 불러오기 (Firebase → 없으면 기본값 이전)
  function loadAdminEquipmentList() {
    db.ref('equipment').once('value').then(snap => {
      if (!snap.exists()) {
        // 최초 1회: 기본값 Firebase에 저장
        const batch = {};
        DEFAULT_EQUIPMENT.forEach(eq => { batch[eq.key] = eq; });
        db.ref('equipment').set(batch).then(() => {
          renderAdminEquipmentList(DEFAULT_EQUIPMENT);
          showToast('기본 기구 목록이 설정됐어요!', 'success');
        });
      } else {
        const list = [];
        snap.forEach(child => list.push(child.val()));
        list.sort((a, b) => (a.no || 0) - (b.no || 0));
        renderAdminEquipmentList(list);
      }
    });
  }

  function renderAdminEquipmentList(list) {
    const container = document.getElementById('admin-equipment-list');
    if (!container) return;
    if (!list.length) {
      container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-hint);font-size:14px;">등록된 기구가 없어요</div>';
      return;
    }
    container.innerHTML = list.map(eq => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;background:var(--card);">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="min-width:28px;height:28px;background:var(--blue-light);color:var(--blue);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">${eq.no}</span>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text);">${eq.name}</div>
            <div style="font-size:11px;color:var(--text-hint);">${eq.muscles || ''}${eq.memo ? ' · ' + eq.memo : ''}</div>
          </div>
        </div>
        <button onclick="openEditEquipmentModal('${eq.key}')" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:5px 10px;font-size:12px;font-weight:600;color:var(--text-sub);cursor:pointer;font-family:'Noto Sans KR',sans-serif;">수정</button>
      </div>
    `).join('');
  }

  let _equipmentCache = {};

  function openEditEquipmentModal(key) {
    db.ref('equipment/' + key).once('value').then(snap => {
      if (!snap.exists()) return;
      const eq = snap.val();
      _equipmentCache[key] = eq;
      document.getElementById('equipment-modal-title').textContent = '✏️ 기구 수정';
      document.getElementById('equipment-edit-no').value      = eq.no || '';
      document.getElementById('equipment-edit-name').value    = eq.name || '';
      document.getElementById('equipment-edit-muscles').value = eq.muscles || '';
      document.getElementById('equipment-edit-memo').value    = eq.memo || '';
      document.getElementById('equipment-edit-key').value     = key;
      document.getElementById('equipment-edit-mode').value    = 'edit';
      document.getElementById('equipment-delete-btn').style.display = 'block';
      document.getElementById('equipment-edit-modal').classList.add('active');
    });
  }

  function openAddEquipmentModal() {
    // 현재 최대 번호 + 1 자동 설정
    db.ref('equipment').once('value').then(snap => {
      let maxNo = 0;
      snap.forEach(child => { const n = child.val().no || 0; if (n > maxNo) maxNo = n; });
      document.getElementById('equipment-modal-title').textContent = '➕ 기구 추가';
      document.getElementById('equipment-edit-no').value      = maxNo + 1;
      document.getElementById('equipment-edit-name').value    = '';
      document.getElementById('equipment-edit-muscles').value = '';
      document.getElementById('equipment-edit-memo').value    = '';
      document.getElementById('equipment-edit-key').value     = '';
      document.getElementById('equipment-edit-mode').value    = 'add';
      document.getElementById('equipment-delete-btn').style.display = 'none';
      document.getElementById('equipment-edit-modal').classList.add('active');
    });
  }

  function closeEquipmentModal() {
    document.getElementById('equipment-edit-modal').classList.remove('active');
  }

  function saveEquipmentEdit() {
    const mode    = document.getElementById('equipment-edit-mode').value;
    const key     = document.getElementById('equipment-edit-key').value;
    const no      = parseInt(document.getElementById('equipment-edit-no').value) || 0;
    const name    = document.getElementById('equipment-edit-name').value.trim();
    const muscles = document.getElementById('equipment-edit-muscles').value.trim();
    const memo    = document.getElementById('equipment-edit-memo').value.trim();

    if (!name) { showToast('기구 이름을 입력해주세요.', 'error'); return; }
    if (!no)   { showToast('번호를 입력해주세요.', 'error'); return; }

    if (mode === 'add') {
      // 새 key 생성 (이름 기반)
      const newKey = 'eq_' + Date.now();
      db.ref('equipment/' + newKey).set({ no, name, muscles, memo: memo || '', key: newKey }).then(() => {
        showToast('✅ 기구가 추가됐어요!', 'success');
        closeEquipmentModal();
        loadAdminEquipmentList();
      });
    } else {
      db.ref('equipment/' + key).update({ no, name, muscles, memo: memo || '' }).then(() => {
        showToast('✅ 수정됐어요!', 'success');
        closeEquipmentModal();
        loadAdminEquipmentList();
      });
    }
  }

  function deleteEquipment() {
    const key  = document.getElementById('equipment-edit-key').value;
    const name = document.getElementById('equipment-edit-name').value;
    showConfirm(name + ' 기구를 삭제할까요?', () => {
      db.ref('equipment/' + key).remove().then(() => {
        showToast('삭제됐어요.', 'success');
        closeEquipmentModal();
        loadAdminEquipmentList();
      });
    });
  }
  window.loadAdminEquipmentList = loadAdminEquipmentList;
  window.openEditEquipmentModal = openEditEquipmentModal;
  window.openAddEquipmentModal  = openAddEquipmentModal;
  window.closeEquipmentModal    = closeEquipmentModal;
  window.saveEquipmentEdit      = saveEquipmentEdit;
  window.deleteEquipment        = deleteEquipment;

