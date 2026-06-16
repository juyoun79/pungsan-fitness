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
    document.querySelectorAll('.admin-side-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    // 클릭된 버튼 활성화 (모바일 탭 or 사이드탭)
    if (event && event.target) event.target.classList.add('active');
    if (tabId === 'tab-dashboard') loadAdminDashboard();
    if (tabId === 'tab-members') {
      // 회원 상세가 열려있으면 목록으로 복귀
      const detailView = document.getElementById('member-detail-view');
      const listView   = document.getElementById('member-list-view');
      if (detailView) detailView.style.display = 'none';
      if (listView)   listView.style.display   = 'block';
      currentMemberPhone = null;
      loadMemberList();
    }
    if (tabId === 'tab-notice') loadNoticeListAdmin();
    if (tabId === 'tab-community-admin') loadAdminCommunityFeed('전체');
    if (tabId === 'tab-trainer-admin') loadAdminTrainerSchedule();
    if (tabId === 'tab-coupon') loadMemberSelectOptions();
    if (tabId === 'tab-challenge-admin') loadAdminChallenges();
    if (tabId === 'coupon-auto') loadAutoConditions();
    if (tabId === 'tab-equipment-admin') loadAdminEquipmentList();
    if (tabId === 'tab-locker') loadLockerTab();
    if (tabId !== 'tab-trainer-admin') {
      if (_monthlyReportListener && _monthlyReportTrainerId) {
        db.ref('trainers/' + _monthlyReportTrainerId + '/trainees').off('value', _monthlyReportListener);
        _monthlyReportListener = null;
      }
      stopMemberRemainListeners();
    }
  }

  function toggleAdminLayout() {
    const isPc = localStorage.getItem('admin_layout') === 'pc';
    const newMode = isPc ? 'mobile' : 'pc';
    localStorage.setItem('admin_layout', newMode);
    applyAdminLayout(newMode);
  }

  function applyAdminLayout(mode) {
    const mobileHeader = document.getElementById('admin-header-mobile');
    const pcHeader = document.getElementById('admin-header-pc');
    const mobileBody = document.getElementById('admin-mobile-body');
    const pcLayout = document.getElementById('admin-pc-layout');
    const pcBody = document.getElementById('admin-pc-body');
    const appEl = document.querySelector('.app');

    if (mode === 'pc') {
      if (mobileHeader) mobileHeader.style.display = 'none';
      if (pcHeader) pcHeader.style.display = 'flex';
      if (mobileBody) mobileBody.style.display = 'none';
      if (pcLayout) pcLayout.style.display = 'block';
      if (mobileBody && pcBody) pcBody.appendChild(mobileBody);
      if (mobileBody) mobileBody.style.display = 'block';
      // PC 모드: max-width 해제
      if (appEl) { appEl.style.maxWidth = '100%'; appEl.style.width = '100%'; }
    } else {
      if (mobileHeader) mobileHeader.style.display = 'block';
      if (pcHeader) pcHeader.style.display = 'none';
      if (pcLayout) pcLayout.style.display = 'none';
      const screenAdmin = document.getElementById('screen-admin');
      if (mobileBody && screenAdmin) screenAdmin.appendChild(mobileBody);
      if (mobileBody) mobileBody.style.display = 'block';
      // 모바일 모드: max-width 복원
      if (appEl) { appEl.style.maxWidth = '430px'; appEl.style.width = ''; }
    }
  }

  window.toggleAdminLayout = toggleAdminLayout;

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
          <div style="display:flex;gap:6px;">
            <button onclick="openAdminAssignTrainee('${t.id}','${t.name}')" style="background:#EAF3DE;color:#3B6D11;border:1px solid #C0DD97;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">+ 회원배정</button>
            <button onclick="openEditTrainerModal('${t.id}','${t.name}')" style="background:var(--blue-light);color:var(--blue);border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">수정</button>
          </div>
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
    document.getElementById('trainer-modal-phone-notice').style.display = 'none';
    document.getElementById('trainer-modal-nickname-wrap').style.display = 'none';
    document.getElementById('trainer-modal-birth-wrap').style.display = 'none';
    document.getElementById('trainer-pw-hint').textContent = '(미입력 시 전화번호 뒤 4자리)';
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
    document.getElementById('trainer-modal-phone-notice').style.display = 'block';
    document.getElementById('trainer-modal-nickname-wrap').style.display = 'block';
    document.getElementById('trainer-modal-birth-wrap').style.display = 'block';
    document.getElementById('trainer-pw-hint').textContent = '(새 비밀번호 입력 · 빈칸이면 유지)';
    document.getElementById('trainer-modal-delete-btn').style.display = 'block';
    // 닉네임/생년월일 Firebase에서 불러오기
    const nickEl = document.getElementById('trainer-modal-nickname');
    const birthEl = document.getElementById('trainer-modal-birth');
    if (nickEl) nickEl.value = '';
    if (birthEl) birthEl.value = '';
    db.ref('users/' + id).once('value').then(snap => {
      const data = snap.val() || {};
      if (nickEl) nickEl.value = data.nickname || '';
      if (birthEl) birthEl.value = data.birth || '';
    });
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
      const pw       = document.getElementById('trainer-modal-pw').value.trim();
      const nickname = (document.getElementById('trainer-modal-nickname')?.value || '').trim();
      const birth    = (document.getElementById('trainer-modal-birth')?.value || '').trim();
      if (birth && (birth.length !== 8 || isNaN(birth))) {
        showToast('생년월일은 8자리 숫자로 입력해주세요.', 'error'); return;
      }
      const updateData = pw ? { name, pw: hashPw(pw) } : { name };
      if (nickname) updateData.nickname = nickname;
      if (birth)    updateData.birth    = birth;
      db.ref('trainers/' + editTrainerId).update({ name });
      db.ref('users/' + editTrainerId).update(updateData).then(() => {
        showToast('✅ 수정됐어요!', 'success');
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

  // 월별 리포트 실시간 리스너 관리
  let _monthlyReportListener = null;
  let _monthlyReportTrainerId = null;
  let _memberRemainListeners = {}; // 회원별 잔여횟수 실시간 리스너

  // 회원별 잔여횟수 실시간 리스너 등록
  function startMemberRemainListeners(trainerId, memberIds) {
    // 기존 리스너 해제
    stopMemberRemainListeners(trainerId);
    memberIds.forEach(memberId => {
      const ref = db.ref('trainers/' + trainerId + '/trainees/' + memberId + '/remain');
      const listener = ref.on('value', snap => {
        const remain = snap.val();
        if (remain === null || remain === undefined) return;
        const remainEl = document.getElementById('rpt-remain-' + memberId);
        if (remainEl) remainEl.textContent = remain;
      });
      _memberRemainListeners[memberId] = { ref, listener };
    });
  }

  function stopMemberRemainListeners() {
    Object.entries(_memberRemainListeners).forEach(([memberId, { ref, listener }]) => {
      ref.off('value', listener);
    });
    _memberRemainListeners = {};
  }

  function loadMonthlyReport() {
    const sel = document.getElementById('report-trainer-select');
    const trainerId = sel ? sel.value : '';
    const summaryEl = document.getElementById('report-summary');
    const membersEl = document.getElementById('report-members');
    if (!trainerId) {
      summaryEl.innerHTML = '';
      membersEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-hint);font-size:13px;">강사를 선택해주세요</div>';
      const statsEl0 = document.getElementById('report-trainer-stats');
      if (statsEl0) statsEl0.style.display = 'none';
      // 기존 리스너 해제
      if (_monthlyReportListener && _monthlyReportTrainerId) {
        db.ref('trainers/' + _monthlyReportTrainerId + '/trainees').off('value', _monthlyReportListener);
        _monthlyReportListener = null;
      }
      return;
    }
    summaryEl.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-hint);font-size:13px;grid-column:span 3;">불러오는 중...</div>';
    membersEl.innerHTML = '';
    const statsEl = document.getElementById('report-trainer-stats');
    if (statsEl) { statsEl.style.display = 'block'; loadReportTrainerStats(trainerId); }

    const monthStr = reportYear + '-' + String(reportMonth).padStart(2,'0');
    const monthStrShort = reportYear + '-' + reportMonth + '-';
    const monthStrLong = reportYear + '-' + String(reportMonth).padStart(2,'0') + '-';

    function isInMonth(dateStr) {
      if (!dateStr) return false;
      return dateStr.startsWith(monthStrLong) || dateStr.startsWith(monthStrShort);
    }

    // 기존 리스너 해제 후 새 리스너 등록
    if (_monthlyReportListener && _monthlyReportTrainerId) {
      db.ref('trainers/' + _monthlyReportTrainerId + '/trainees').off('value', _monthlyReportListener);
    }
    _monthlyReportTrainerId = trainerId;
    _monthlyReportListener = db.ref('trainers/' + trainerId + '/trainees').on('value', snap => {
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

        const p = Promise.all([
          db.ref('members/' + traineeId + '/name').once('value'),
          db.ref('trainers/' + trainerId + '/trainees/' + traineeId + '/signs').once('value'),
          db.ref('trainers/' + trainerId + '/trainees/' + traineeId + '/memo').once('value'),
          db.ref('trainers/' + trainerId + '/trainees/' + traineeId + '/logs').once('value')
        ]).then(([memberNameSnap, signsSnap, memoSnap, logsSnap]) => {
          const traineeName = memberNameSnap.val() || traineeInfo.name || traineeId;
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

          memberCards.push({ traineeName, signCount, noShowCount, memo, logs, traineeId, type: traineeInfo.type || '', remain: traineeInfo.remain || 0, total: traineeInfo.total || 0, traineeInfo });
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

        // 카드 렌더링 후 회원별 잔여횟수 실시간 리스너 등록
        const memberIdList = memberCards.map(m => m.traineeId);
        setTimeout(() => startMemberRemainListeners(trainerId, memberIdList), 100);

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
                <div style="font-size:11px;color:var(--text-hint);margin-top:2px;">${m.type ? m.type + ' · ' : ''}잔여 <span id="rpt-remain-${m.traineeId}" style="font-weight:700;color:var(--blue);">${m.remain}</span>회 / 총 <span id="rpt-total-${m.traineeId}">${m.total}</span>회</div>
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
              <button onclick="toggleRptDetail('${signBtnId}')" style="font-size:11px;padding:4px 8px;background:#E6F1FB;color:#0C447C;border:1px solid #B5D4F4;border-radius:6px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">✍️ 서명 ${m.signCount + m.noShowCount}회</button>
              ${m.memo ? '<button onclick="toggleRptDetail(\'' + memoBtnId + '\')" style="font-size:11px;padding:4px 8px;background:#EAF3DE;color:#3B6D11;border:1px solid #C0DD97;border-radius:6px;cursor:pointer;font-family:\'Noto Sans KR\',sans-serif;">📝 메모</button>' : ''}
              ${m.logs.length > 0 ? '<button onclick="toggleRptDetail(\'' + logBtnId + '\')" style="font-size:11px;padding:4px 8px;background:#FAEEDA;color:#854F0B;border:1px solid #FAC775;border-radius:6px;cursor:pointer;font-family:\'Noto Sans KR\',sans-serif;">📋 수업일지 ' + m.logs.length + '건</button>' : ''}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button onclick="openAdminEditTrainee('${trainerId}','${m.traineeId}')" style="font-size:11px;padding:4px 8px;background:#E6F1FB;color:#0C447C;border:1px solid #B5D4F4;border-radius:6px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">✏️ 수업수정</button>
              <button onclick="openAdminReregister('${trainerId}','${m.traineeId}','${m.type}')" style="font-size:11px;padding:4px 8px;background:#EAF3DE;color:#3B6D11;border:1px solid #C0DD97;border-radius:6px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">🔄 재등록</button>
              <button onclick="adminDeleteTrainee('${trainerId}','${m.traineeId}','${m.traineeName}')" style="font-size:11px;padding:4px 8px;background:#FCEBEB;color:#A32D2D;border:1px solid #F7C1C1;border-radius:6px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">🗑 담당해제</button>
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

  function loadReportTrainerStats(trainerId) {
    db.ref('trainers/' + trainerId + '/trainees').once('value', snap => {
      const data = snap.val() || {};
      const now = new Date();
      const thisMonthPad = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
      const thisMonthShort = now.getFullYear() + '-' + (now.getMonth()+1);
      const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
      const isThisMonth = d => d && (d.startsWith(thisMonthPad+'-') || d.startsWith(thisMonthShort+'-') || d===thisMonthPad || d===thisMonthShort);

      let totalMembers=0, newMembers=0, reMembers=0, totalRemain=0, inactiveMembers=0, monthLessons=0;
      let remain0=[], remainLow=[], remainOk=[], expiredThisMonth=[], reRegThisMonth=[];
      const memberIds = Object.keys(data);
      totalMembers = memberIds.length;

      const promises = memberIds.map(memberId => {
        const info = data[memberId];
        const remain = info.remain != null ? info.remain : 0;
        totalRemain += remain;
        if (remain === 0) remain0.push(info.name || memberId);
        else if (remain <= 3) remainLow.push(info.name || memberId);
        else remainOk.push(info.name || memberId);
        if (info.addedAt && isThisMonth(new Date(info.addedAt).toISOString().slice(0,10))) newMembers++;
        const regs = info.registrations ? Object.values(info.registrations) : [];
        const thisMonthRegs = regs.filter(r => r && r.date && isThisMonth(r.date));
        if (thisMonthRegs.length > 0) reMembers++;
        // 새 재등록률 계산: reregTarget=true인 회원 중 이번달 재등록한 회원
        const isReregTarget2 = info.reregTarget === true;
        const hasReRegThisMonth2 = thisMonthRegs.length > 0;
        if (isReregTarget2) {
          expiredThisMonth.push(info.name || memberId); // 분모 (재등록대상)
          if (hasReRegThisMonth2) {
            reRegThisMonth.push(info.name || memberId); // 분자 (실제 재등록)
          }
        }
        return db.ref('trainers/' + trainerId + '/trainees/' + memberId + '/signs').once('value', sSnap => {
          let lastSignTime = 0;
          if (sSnap.exists()) {
            sSnap.forEach(s => {
              const sd = s.val();
              if (sd && sd.date && isThisMonth(sd.date)) monthLessons++;
              const t = (sd && sd.savedAt) || 0;
              if (t > lastSignTime) lastSignTime = t;
            });
          }
          if (lastSignTime > 0 && lastSignTime < twoWeeksAgo) inactiveMembers++;
        });
      });

      Promise.all(promises).then(() => {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('rpt-total-members', totalMembers);
        set('rpt-month-lessons', monthLessons);
        set('rpt-new-members', newMembers);
        set('rpt-re-members', reMembers);
        set('rpt-total-remain', totalRemain);
        set('rpt-inactive-members', inactiveMembers);
        const reRegDone = reRegThisMonth.length;
        const reRegTotal = expiredThisMonth.length;
        const reRegNotDone = Math.max(0, reRegTotal - reRegDone);
        set('rpt-rereg-done', reRegDone);
        set('rpt-rereg-not', reRegNotDone);
        set('rpt-rereg-total', reRegTotal);
        set('rpt-remain-0', remain0.length);
        set('rpt-remain-low', remainLow.length);
        set('rpt-remain-ok', remainOk.length);

        const drawRptCharts = () => {
          const c1 = document.getElementById('rpt-chart-rereg');
          const c2 = document.getElementById('rpt-chart-remain');
          if (c1) {
            if (c1._chart) c1._chart.destroy();
            const rptReregData = reRegTotal > 0
              ? { data: [reRegDone, reRegNotDone], backgroundColor: ['#22c55e', '#888780'] }
              : { data: [1], backgroundColor: ['#D3D1C7'] };
            const rptCenterPlugin = {
              id: 'rptCenter',
              afterDraw(chart) {
                const { ctx, chartArea: { top, bottom, left, right } } = chart;
                const cx = (left + right) / 2, cy = (top + bottom) / 2;
                const data = chart.data.datasets[0].data;
                const total = data.reduce((a, b) => a + b, 0);
                if (!total) return;
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                if (data.length === 1) {
                  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-hint') || '#aaa';
                  ctx.fillStyle = textColor;
                  ctx.font = '700 11px sans-serif';
                  ctx.fillText('N/A', cx, cy - 6);
                  ctx.font = '400 9px sans-serif';
                  ctx.fillText('대상없음', cx, cy + 6);
                } else {
                  const pct = Math.round(data[0] / total * 100);
                  ctx.font = '700 12px sans-serif';
                  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary') || '#111';
                  ctx.fillText(pct + '%', cx, cy);
                }
                ctx.restore();
              }
            };
            c1._chart = new Chart(c1, { type:'doughnut', data:{ datasets:[{ ...rptReregData, borderWidth:0 }] }, options:{ cutout:'65%', plugins:{ legend:{display:false}, tooltip:{enabled:false}, rptCenter:{} } }, plugins:[rptCenterPlugin] });
          }
          if (c2) { if (c2._chart) c2._chart.destroy(); c2._chart = new Chart(c2, { type:'doughnut', data:{ datasets:[{ data:[remain0.length||0, remainLow.length||0, remainOk.length||0], backgroundColor:['#ef4444','#f59e0b','#22c55e'], borderWidth:0 }] }, options:{ cutout:'65%', plugins:{ legend:{display:false}, tooltip:{enabled:false} } } }); }
        };
        if (typeof Chart !== 'undefined') {
          drawRptCharts();
        } else {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js';
          s.onload = drawRptCharts;
          document.head.appendChild(s);
        }
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
        db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId).update({ type, total: count, remain: newRemain, regDate: dateStr }),
        db.ref('members/' + currentTraineeId + '/trainerId').set(trainerId),
        db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/reregTarget').remove()
      ]).then(() => {
        document.getElementById('trainee-card-type').textContent = type;
        refreshTraineeView(currentTraineeId);
        showToast('✅ ' + count + '회 재등록 완료!', 'success');
        closeReregisterModal();
        loadTrainerTab();
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
        signsArr.sort((a, b) => {
          const da = a.date || '', db = b.date || '';
          if (da !== db) {
            const toNum = d => { const p = d.split('-'); return parseInt(p[0])*10000 + parseInt(p[1])*100 + parseInt(p[2]); };
            return toNum(da) - toNum(db);
          }
          return (a.savedAt || '') < (b.savedAt || '') ? -1 : 1;
        });
      }

      // 현재 차수 계산
      let cumulative = 0, idx = allRegs.length - 1;
      for (let i = 0; i < allRegs.length; i++) {
        cumulative += allRegs[i].total;
        if (totalSigns < cumulative) { idx = i; break; }
      }
      const currentOrder = idx + 1;
      const currentReg = allRegs[idx];

      // 잔여 횟수: Firebase remain 값 우선 사용 (관리자 수정값 반영)
      // remain이 없을 때만 서명 기반으로 계산
      let prev = 0;
      for (let i = 0; i < idx; i++) prev += allRegs[i].total;
      const calcRemainBySign = Math.max(0, currentReg.total - (totalSigns - prev));
      const remain = (rootVal.remain !== undefined && rootVal.remain !== null)
        ? rootVal.remain
        : calcRemainBySign;

      // 카드 업데이트
      const progressEl = document.getElementById('trainee-card-progress');
      const remainEl = document.getElementById('trainee-card-remain');
      const totalEl = document.getElementById('trainee-card-total');
      if (progressEl) progressEl.textContent = currentOrder + '차 ' + rootType + ' 진행중';
      if (remainEl) remainEl.textContent = remain;
      if (totalEl) totalEl.textContent = rootTotal;

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
            // Firebase remain 우선 (현재 차수만), 이전 차수는 서명 기반 계산
            const calcRemainBySign = Math.max(0, reg.total - signedCount);
            const calcRemain = (isCurrentOrder && rootVal && rootVal.remain !== undefined && rootVal.remain !== null)
              ? rootVal.remain
              : calcRemainBySign;
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
              groupSigns.slice().reverse().forEach(function(s, idx) {
                const realIdx = groupSigns.length - idx;
                html += '<div style="margin-bottom:' + (idx < groupSigns.length - 1 ? '10px' : '0') + ';padding-bottom:' + (idx < groupSigns.length - 1 ? '10px' : '0') + ';border-bottom:' + (idx < groupSigns.length - 1 ? '0.5px solid var(--border)' : 'none') + ';">';
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

      // 현재 차수 잔여 계산 - Firebase remain 우선 사용
      let prev = 0;
      for (let i = 0; i < idx; i++) prev += allRegs[i].total;
      const calcRemainBySign = Math.max(0, currentReg.total - (totalSigns - prev));
      const remain = (rootVal.remain !== undefined && rootVal.remain !== null)
        ? rootVal.remain
        : calcRemainBySign;

      // 카드 업데이트
      const progressEl = document.getElementById('trainee-card-progress');
      const remainEl = document.getElementById('trainee-card-remain');
      const totalEl = document.getElementById('trainee-card-total');
      if (progressEl) progressEl.textContent = currentOrder + '차 ' + rootType + ' 진행중';
      if (remainEl) remainEl.textContent = remain;
      if (totalEl) totalEl.textContent = rootTotal;
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
      const dateStr = n.dateLabel || n.date || '';
      document.getElementById('notice-detail-content').innerHTML = `
        <div style="margin-bottom:16px;">
          <div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:8px;line-height:1.4;">${n.title}</div>
          <div style="font-size:12px;color:var(--text-hint);margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">${dateStr}</div>
          <div style="font-size:15px;color:var(--text-sub);line-height:1.9;white-space:pre-wrap;">${n.content || ''}</div>
        </div>`;
      if (typeof showScreen === 'function') showScreen('screen-notice-detail');
    });
  }

  function closeNoticeDetail() {
    // 읽음 처리 반영 후 홈으로 복귀
    const userId = localStorage.getItem('current_user');
    const role = localStorage.getItem('role_' + userId) || 'member';
    if (typeof loadHomeNotices === 'function') {
      if (role === 'trainer' || role === 'manager' || role === 'admin') {
        loadHomeNotices('trainer-notice-container');
      } else {
        loadHomeNotices();
      }
    }
    if (typeof switchTab === 'function') switchTab('home');
  }

  // 공지 목록 전체화면 (FCM 딥링크용)
  function openNoticeListScreen() {
    const userId = localStorage.getItem('current_user');
    const role = localStorage.getItem('role_' + userId) || 'member';
    const isTrainer = role === 'trainer' || role === 'manager' || role === 'admin';
    // 이미 홈탭에 있으면 switchTab 스킵 (깜빡임 방지)
    const homeScreen = document.getElementById('screen-home');
    const isAlreadyHome = homeScreen && homeScreen.classList.contains('active');
    if (!isAlreadyHome && typeof switchTab === 'function') switchTab('home');
    // 공지 목록 갱신 후 Firebase 응답 오면 팝업 표시
    setTimeout(() => {
      const container = isTrainer
        ? document.getElementById('trainer-notice-container')
        : document.getElementById('member-notice-container');
      // Firebase에서 공지 직접 로딩 후 팝업까지 처리
      db.ref('notices').once('value', snap => {
        if (!snap.exists()) return;
        // 공지 목록 갱신
        if (isTrainer) {
          loadHomeNotices('trainer-notice-container');
        } else {
          if (typeof loadHomeNotices === 'function') loadHomeNotices();
        }
        // 데이터 로딩 완료 후 팝업 표시 (switchTab 내부 팝업과 중복 방지)
        // switchTab을 새로 호출한 경우 이미 내부 팝업 예약됨 → 스킵
        if (!isAlreadyHome) return;
        // 이미 홈에 있었던 경우만 여기서 직접 팝업 표시
        if (typeof showNoticePopup === 'function') {
          setTimeout(() => showNoticePopup(userId), 300);
        }
      });
    }, 400);
  }
  window.openNoticeListScreen = openNoticeListScreen;

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
    // 저장된 레이아웃 복원
    const savedLayout = localStorage.getItem('admin_layout') || 'mobile';
    if (savedLayout === 'pc') applyAdminLayout('pc');
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

    const listView   = document.getElementById('member-list-view');
    const detailView = document.getElementById('member-detail-view');
    if (listView)   listView.style.display   = 'none';
    if (detailView) detailView.style.display = 'block';
    // PC모드일 때 스크롤 맨 위로
    const pcBody = document.getElementById('admin-pc-body');
    const mobileBody = document.getElementById('admin-mobile-body');
    if (pcBody && pcBody.contains(detailView)) pcBody.scrollTop = 0;
    if (mobileBody) mobileBody.scrollTop = 0;

    const now = new Date();
    const monthPrefix = now.getFullYear() + '-' + (now.getMonth()+1) + '-';
    const today = getToday();

    // 헤더 이름
    document.getElementById('modal-member-name').textContent = (info.name || phone) + ' 회원';

    // 기본정보 직접 입력 방식으로 세팅
    const rawName = (info.name || '').replace(/\(\d{4}\)$/, '').trim();
    // 프로필 이름 표시
    const mdNameEl = document.getElementById('md-name');
    if (mdNameEl) mdNameEl.textContent = rawName;

    // 닉네임
    const nickEl = document.getElementById('md-nick');
    const localNick = localStorage.getItem('name_' + phone) || '';
    if (nickEl) nickEl.textContent = localNick ? '닉네임: ' + localNick : '닉네임: 미설정';
    db.ref('users/' + phone + '/nickname').once('value').then(nickSnap => {
      const firebaseNick = nickSnap.val() || '';
      if (firebaseNick) {
        localStorage.setItem('name_' + phone, firebaseNick);
        if (nickEl) nickEl.textContent = '닉네임: ' + firebaseNick;
      } else {
        if (nickEl) nickEl.textContent = '닉네임: 미설정';
      }
    }).catch(() => {
      if (nickEl) nickEl.textContent = localNick ? '닉네임: ' + localNick : '닉네임: 미설정';
    });

    // 연락처 (읽기전용)
    const mdPhoneEl = document.getElementById('md-phone');
    if (mdPhoneEl) mdPhoneEl.textContent = phone;

    // 이름 입력창
    const mdEditName = document.getElementById('md-edit-name');
    if (mdEditName) mdEditName.value = rawName;

    // 생년월일 입력창
    const birth = info.birth || '';
    const mdEditBirth = document.getElementById('md-edit-birth');
    if (mdEditBirth) mdEditBirth.value = birth;

    // 성별 버튼
    const genderVal = (info.body && info.body.gender) ? info.body.gender : (info['body/gender'] || 'male');
    selectMdGender(genderVal);

    // 주소 입력창
    const mdEditAddress = document.getElementById('md-edit-address');
    if (mdEditAddress) mdEditAddress.value = info.address || '';

    // 프로그램 태그
    const progWrap = document.getElementById('md-programs');
    if (info.programs && info.programs.length > 0) {
      progWrap.innerHTML = info.programs.map(p =>
        `<span style="background:var(--blue-light);color:var(--blue);font-size:12px;padding:3px 8px;border-radius:8px;font-weight:600;">${p}</span>`
      ).join('');
    } else {
      progWrap.innerHTML = '<span style="font-size:12px;color:var(--text-hint);">-</span>';
    }

    // 사진
    const photoDiv = document.getElementById('md-photo');
    if (info.photoUrl) {
      photoDiv.innerHTML = `<img src="${info.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />`;
    } else {
      photoDiv.innerHTML = rawName ? rawName[0] : '👤';
      photoDiv.style.fontSize = '32px';
    }

    // 회원 메모 불러오기
    const memoEl = document.getElementById('md-memo');
    if (memoEl) {
      memoEl.value = '';
      db.ref('members/' + phone + '/memo').once('value').then(snap => {
        if (memoEl) memoEl.value = snap.val() || '';
      });
    }

    // Firebase에서 출석/포인트 불러오기
    Promise.all([
      db.ref('users/' + phone + '/attendance').once('value'),
      db.ref('users/' + phone + '/points').once('value'),
    ]).then(([attSnap, ptsSnap]) => {
      const attendData = attSnap.val() || {};
      const attendCount = Object.keys(attendData).filter(k => k.startsWith(monthPrefix)).length;
      const todayAttend = !!attendData[today];
      const pts = ptsSnap.val() ?? localStorage.getItem('points_' + phone) ?? '0';
      localStorage.setItem('points_' + phone, String(pts));
      document.getElementById('md-points').textContent = Number(pts).toLocaleString() + 'P';
      document.getElementById('md-attend').textContent = attendCount + '일' + (todayAttend ? ' ✅' : '');
      const totalAttendEl = document.getElementById('md-attend-total');
      if (totalAttendEl) totalAttendEl.textContent = Object.keys(attSnap.val() || {}).length + '일';
    }).catch(() => {
      const pts = localStorage.getItem('points_' + phone) || '0';
      document.getElementById('md-points').textContent = Number(pts).toLocaleString() + 'P';
      document.getElementById('md-attend').textContent = '-';
    });

    // 수업현황 렌더링
    _renderMdClassStatus(phone, info);

    // 계약이력 렌더링
    _renderMdContracts(phone);

    // 서명기록 렌더링
    _renderMdSigns(phone);
  }

  // 수업현황
  function _renderMdClassStatus(phone, info) {
    const el = document.getElementById('md-class-status');
    if (!el) return;
    // PT/필라테스 잔여횟수 표시
    db.ref('trainers').once('value').then(trainersSnap => {
      let trainerId = null;
      let traineeInfo = null;
      trainersSnap.forEach(t => {
        const td = t.child('trainees/' + phone);
        if (td.exists()) { trainerId = t.key; traineeInfo = td.val(); }
      });
      const remain = traineeInfo ? (traineeInfo.remain || 0) : '-';
      const total  = traineeInfo ? (traineeInfo.total  || 0) : '-';
      const type   = traineeInfo ? (traineeInfo.type   || '-') : '-';
      el.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;">
          <div style="background:var(--bg);border-radius:10px;padding:12px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:var(--blue);">${remain}</div>
            <div style="font-size:11px;color:var(--text-hint);margin-top:3px;">잔여 횟수</div>
          </div>
          <div style="background:var(--bg);border-radius:10px;padding:12px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:var(--text);">${total}</div>
            <div style="font-size:11px;color:var(--text-hint);margin-top:3px;">전체 횟수</div>
          </div>
        </div>
        ${traineeInfo ? `<div style="margin-top:8px;font-size:12px;color:var(--text-sub);text-align:center;">${type}</div>` : '<div style="margin-top:8px;font-size:12px;color:var(--text-hint);text-align:center;">배정된 강사가 없어요</div>'}`;
    }).catch(() => {
      el.innerHTML = '<div style="text-align:center;color:var(--text-hint);font-size:13px;padding:8px 0;">불러오기 실패</div>';
    });
  }

  // 계약이력
  function _renderMdContracts(phone) {
    const el = document.getElementById('md-contracts');
    if (!el) return;
    db.ref('contracts/' + phone).once('value').then(snap => {
      if (!snap.exists()) {
        el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-hint);font-size:13px;background:var(--card);border-radius:10px;">계약 이력이 없어요</div>';
        return;
      }
      const contracts = [];
      snap.forEach(child => contracts.push({ key: child.key, ...child.val() }));
      // 최신순 정렬
      contracts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      const progLabels = {
        '헬스':'🏋️ 헬스', 'GX':'🎶 GX', 'PT':'💪 PT',
        '기구필라테스개인':'🧘 기구필라테스 개인', '기구필라테스그룹':'👥 기구필라테스 그룹'
      };

      el.innerHTML = contracts.map((c, idx) => {
        const programs = c.programs || {};
        const totalAmt = Object.values(programs).reduce((s, p) => s + (p.price || 0), 0);
        const totalPaid = Object.values(programs).reduce((s, p) => s + (p.cash||0) + (p.card||0) + (p.transfer||0), 0);
        const totalUnpaid = totalAmt - totalPaid;
        const extrasAmt = Object.values(c.extras || {}).reduce((s, e) => s + (e.price || 0), 0);
        const grandTotal = totalAmt + extrasAmt;
        const grandPaid = totalPaid + Object.values(c.extras || {}).reduce((s, e) => s + (e.cash||0) + (e.card||0) + (e.transfer||0), 0);
        const grandUnpaid = grandTotal - grandPaid;

        const progNames = Object.keys(programs).map(p => progLabels[p] || p).join(', ');

        return `<div style="background:var(--card);border-radius:10px;padding:16px;border:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--text);">${c.signDate || '-'} · ${c.type === 're' ? '재등록' : '신규'}</div>
              <div style="font-size:12px;color:var(--text-sub);margin-top:2px;">${progNames || '-'}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:13px;font-weight:700;color:var(--text);">${grandTotal.toLocaleString()}원</div>
              ${grandUnpaid > 0 ? `<div style="font-size:11px;color:#ef4444;font-weight:700;">미수금 ${grandUnpaid.toLocaleString()}원</div>` : `<div style="font-size:11px;color:#22c55e;font-weight:600;">완납 ✓</div>`}
            </div>
          </div>
          ${c.memo ? `<div style="background:var(--bg);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text-sub);margin-bottom:10px;">📌 ${c.memo}</div>` : ''}
          ${grandUnpaid > 0 ? `
          <button onclick="payMemberUnpaid('${phone}','${c.key}',${grandUnpaid})"
            style="width:100%;padding:8px;background:#fff7ed;color:#ea580c;border:1.5px solid #fed7aa;border-radius:var(--radius-sm);font-size:12px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">
            💳 미수금 ${grandUnpaid.toLocaleString()}원 결제처리
          </button>` : ''}
        </div>`;
      }).join('');
    });
  }

  // 미수금 결제처리
  function payMemberUnpaid(phone, contractKey, unpaidAmt) {
    showConfirm(`미수금 ${unpaidAmt.toLocaleString()}원을 결제처리 할까요?`, () => {
      db.ref('contracts/' + phone + '/' + contractKey).once('value').then(snap => {
        if (!snap.exists()) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
        const c = snap.val();
        const programs = c.programs || {};
        // 각 프로그램의 미수금을 현금으로 처리
        const updates = {};
        Object.entries(programs).forEach(([prog, p]) => {
          const progUnpaid = (p.price || 0) - (p.cash||0) - (p.card||0) - (p.transfer||0);
          if (progUnpaid > 0) {
            updates['contracts/' + phone + '/' + contractKey + '/programs/' + prog + '/cash'] =
              (p.cash || 0) + progUnpaid;
          }
        });
        const extras = c.extras || {};
        Object.entries(extras).forEach(([ext, e]) => {
          const extUnpaid = (e.price || 0) - (e.cash||0) - (e.card||0) - (e.transfer||0);
          if (extUnpaid > 0) {
            updates['contracts/' + phone + '/' + contractKey + '/extras/' + ext + '/cash'] =
              (e.cash || 0) + extUnpaid;
          }
        });
        db.ref().update(updates).then(() => {
          showToast('✅ 미수금 결제처리 완료!', 'success');
          _renderMdContracts(phone);
        });
      });
    });
  }

  // 회원 메모 저장
  // 성별 버튼 선택
  function selectMdGender(g) {
    const male   = document.getElementById('md-gender-male');
    const female = document.getElementById('md-gender-female');
    if (!male || !female) return;
    if (g === 'male') {
      male.style.background   = 'var(--blue)';
      male.style.color        = 'white';
      male.style.borderColor  = 'var(--blue)';
      female.style.background = 'var(--bg)';
      female.style.color      = 'var(--text)';
      female.style.borderColor= 'var(--border)';
    } else {
      female.style.background = 'var(--blue)';
      female.style.color      = 'white';
      female.style.borderColor= 'var(--blue)';
      male.style.background   = 'var(--bg)';
      male.style.color        = 'var(--text)';
      male.style.borderColor  = 'var(--border)';
    }
    male.dataset.selected   = g === 'male'   ? 'true' : 'false';
    female.dataset.selected = g === 'female' ? 'true' : 'false';
  }

  // 기본정보 저장
  async function saveMemberBasicInfo() {
    const phone = currentMemberPhone;
    if (!phone) return;
    const name    = document.getElementById('md-edit-name')?.value.trim();
    const birth   = document.getElementById('md-edit-birth')?.value.trim();
    const address = document.getElementById('md-edit-address')?.value.trim();
    const maleBtn = document.getElementById('md-gender-male');
    const gender  = maleBtn?.dataset.selected === 'true' ? 'male' : 'female';

    if (!name) { showToast('이름을 입력해주세요.', 'error'); return; }
    if (birth && !/^\d{8}$/.test(birth)) { showToast('생년월일은 8자리 숫자로 입력해주세요. (예: 19900101)', 'error'); return; }

    try {
      const updates = {};
      updates['members/' + phone + '/name']    = name;
      updates['members/' + phone + '/birth']   = birth;
      updates['members/' + phone + '/address'] = address;
      updates['members/' + phone + '/body/gender'] = gender;
      await db.ref().update(updates);

      // cachedMembers 업데이트
      if (cachedMembers[phone]) {
        cachedMembers[phone].name    = name;
        cachedMembers[phone].birth   = birth;
        cachedMembers[phone].address = address;
        if (!cachedMembers[phone].body) cachedMembers[phone].body = {};
        cachedMembers[phone].body.gender = gender;
      }

      // 프로필 이름 즉시 갱신
      const rawName = name.replace(/\(\d{4}\)$/, '').trim();
      const mdNameEl = document.getElementById('md-name');
      if (mdNameEl) mdNameEl.textContent = rawName;
      const modalNameEl = document.getElementById('modal-member-name');
      if (modalNameEl) modalNameEl.textContent = rawName + ' 회원';

      showToast('✅ 기본정보 저장 완료!', 'success');
    } catch(e) {
      showToast('저장에 실패했어요. 다시 시도해주세요.', 'error');
    }
  }

  function saveMemberMemo() {
    const phone = currentMemberPhone;
    if (!phone) return;
    const memo = document.getElementById('md-memo')?.value.trim() || '';
    db.ref('members/' + phone + '/memo').set(memo).then(() => {
      showToast('✅ 메모 저장 완료!', 'success');
    });
  }

  // 서명기록 (관리자용 - trainerId 기반)
  function _renderMdSigns(phone) {
    const el = document.getElementById('md-signs');
    if (!el) return;
    // 해당 회원을 담당하는 강사 찾기
    db.ref('trainers').once('value').then(trainersSnap => {
      let trainerId = null;
      trainersSnap.forEach(t => {
        if (t.child('trainees/' + phone).exists()) trainerId = t.key;
      });
      if (!trainerId) {
        el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-hint);font-size:13px;">배정된 강사가 없거나 서명기록이 없어요</div>';
        return;
      }
      db.ref('trainers/' + trainerId + '/trainees/' + phone + '/signs').once('value').then(signsSnap => {
        if (!signsSnap.exists()) {
          el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-hint);font-size:13px;">서명 기록이 없어요</div>';
          return;
        }
        const signs = [];
        signsSnap.forEach(child => signs.push({ key: child.key, ...child.val() }));
        signs.sort((a, b) => {
          const toNum = d => { if (!d) return 0; const p = d.split('-'); return parseInt(p[0])*10000+parseInt(p[1]||0)*100+parseInt(p[2]||0); };
          return toNum(b.date) - toNum(a.date);
        });
        el.innerHTML = `
          <div style="font-size:12px;color:var(--text-sub);margin-bottom:10px;">총 ${signs.length}회</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${signs.slice(0, 10).map((s, i) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg);border-radius:6px;">
                <span style="font-size:12px;font-weight:600;color:var(--text);">${signs.length - i}회차</span>
                <span style="font-size:12px;color:var(--text-sub);">${s.date || '-'}</span>
              </div>`).join('')}
            ${signs.length > 10 ? `<div style="text-align:center;font-size:12px;color:var(--text-hint);padding:6px;">외 ${signs.length - 10}건</div>` : ''}
          </div>`;
      });
    });
  }

  function closeMemberModal() {
    const listView   = document.getElementById('member-list-view');
    const detailView = document.getElementById('member-detail-view');
    if (detailView) detailView.style.display = 'none';
    if (listView)   listView.style.display   = 'block';
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
        const cur2 = parseInt(snap.val() || 0);
        const diff = pt - cur2;
        // Firebase 저장
        db.ref('users/' + currentMemberPhone + '/points').set(pt).then(() => {
          // 포인트 변경 내역 기록
          if (diff !== 0) {
            const today = new Date().toISOString().slice(0, 10);
            const histKey = db.ref('users/' + currentMemberPhone + '/pointHistory').push().key;
            db.ref('users/' + currentMemberPhone + '/pointHistory/' + histKey).set({
              amount: diff, date: today, label: '관리자 지급'
            });
          }
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
  // ── 회원등록 웹캠/사진 관련 ──
  let regWebcamStream = null;
  let regPhotoBlob = null;

  function selectRegGender(gender) {
    document.getElementById('reg-gender').value = gender;
    const male   = document.getElementById('reg-gender-male');
    const female = document.getElementById('reg-gender-female');
    if (gender === 'male') {
      male.style.border = '2px solid var(--blue)'; male.style.background = 'var(--blue)'; male.style.color = 'white';
      female.style.border = '1.5px solid var(--border)'; female.style.background = 'var(--card)'; female.style.color = 'var(--text-sub)';
    } else {
      female.style.border = '2px solid #e07bba'; female.style.background = '#e07bba'; female.style.color = 'white';
      male.style.border = '1.5px solid var(--border)'; male.style.background = 'var(--card)'; male.style.color = 'var(--text-sub)';
    }
  }

  function openRegWebcam() {
    const modal = document.getElementById('reg-webcam-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        regWebcamStream = stream;
        const video = document.getElementById('reg-webcam-video');
        if (video) video.srcObject = stream;
      })
      .catch(() => {
        modal.style.display = 'none';
        showToast('카메라 권한이 필요해요. 파일 선택을 이용해주세요.', 'error');
      });
  }

  function closeRegWebcam() {
    if (regWebcamStream) { regWebcamStream.getTracks().forEach(t => t.stop()); regWebcamStream = null; }
    const modal = document.getElementById('reg-webcam-modal');
    if (modal) modal.style.display = 'none';
  }

  function updateRegPhotoUI(hasPhoto) {
    const preview    = document.getElementById('reg-photo-preview');
    const webcamBtn  = document.getElementById('reg-webcam-btn');
    const deleteBtn  = document.getElementById('reg-photo-delete-btn');
    if (!preview) return;
    if (hasPhoto) {
      preview.style.border = '2px solid var(--blue)';
      if (webcamBtn)  webcamBtn.innerHTML  = '📷 다시 찍기';
      if (deleteBtn)  { deleteBtn.style.display = 'flex'; }
    } else {
      preview.style.border = '1.5px solid var(--border)';
      preview.innerHTML = '👤';
      if (webcamBtn)  webcamBtn.innerHTML  = '📷 웹캠 촬영';
      if (deleteBtn)  { deleteBtn.style.display = 'none'; }
    }
  }

  function deleteRegPhoto() {
    regPhotoBlob = null;
    const fileInput = document.getElementById('reg-photo-file');
    if (fileInput) fileInput.value = '';
    updateRegPhotoUI(false);
  }

  function captureRegWebcam() {
    const video  = document.getElementById('reg-webcam-video');
    const canvas = document.getElementById('reg-webcam-canvas');
    if (!video || !canvas) return;
    canvas.width = 300; canvas.height = 300;
    const ctx = canvas.getContext('2d');
    const size = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth  - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 300, 300);
    canvas.toBlob(blob => {
      regPhotoBlob = blob;
      const preview = document.getElementById('reg-photo-preview');
      if (preview) { const url = URL.createObjectURL(blob); preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" />`; }
      updateRegPhotoUI(true);
      closeRegWebcam();
    }, 'image/jpeg', 0.7);
  }

  function onRegPhotoFile(input) {
    const file = input.files[0];
    if (!file) return;
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 300; canvas.height = 300;
        const ctx = canvas.getContext('2d');
        const size = Math.min(img.width, img.height);
        const sx = (img.width  - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 300, 300);
        canvas.toBlob(blob => {
          regPhotoBlob = blob;
          const preview = document.getElementById('reg-photo-preview');
          if (preview) { const url = URL.createObjectURL(blob); preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" />`; }
          updateRegPhotoUI(true);
        }, 'image/jpeg', 0.7);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  async function uploadRegPhoto(phone) {
    if (!regPhotoBlob) return null;
    try {
      const storageRef = firebase.storage().ref('members/' + phone + '/profile.jpg');
      await storageRef.put(regPhotoBlob, { contentType: 'image/jpeg' });
      return await storageRef.getDownloadURL();
    } catch (e) {
      console.error('사진 업로드 실패:', e);
      return null;
    }
  }

  function resetRegForm() {
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-phone').value = '';
    document.getElementById('reg-pw').value = '';
    if (document.getElementById('reg-birth'))   document.getElementById('reg-birth').value = '';
    if (document.getElementById('reg-address')) document.getElementById('reg-address').value = '';
    document.querySelectorAll('#reg-programs input').forEach(el => el.checked = false);
    selectRegGender('male');
    regPhotoBlob = null;
    const fileInput2 = document.getElementById('reg-photo-file');
    if (fileInput2) fileInput2.value = '';
    updateRegPhotoUI(false);
  }

  function registerMember() {
    const name  = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim().replace(/-/g, '');
    const pwInput = document.getElementById('reg-pw').value.trim();
    const pw    = pwInput || phone.slice(-4);
    const gender  = document.getElementById('reg-gender')?.value || 'male';
    const birth   = document.getElementById('reg-birth')?.value.trim() || '';
    const address = document.getElementById('reg-address')?.value.trim() || '';

    if (!name)  { showToast('이름을 입력해주세요.', 'error'); return; }
    if (!phone || phone.length < 10) { showToast('휴대폰 번호를 정확히 입력해주세요.', 'error'); return; }

    const programs = [...document.querySelectorAll('#reg-programs input:checked')].map(el => el.value);

    db.ref('members/' + phone).once('value').then(snap => {
      if (snap.exists()) { showToast('이미 등록된 전화번호예요.', 'error'); return; }

      db.ref('members').once('value').then(allSnap => {
        let duplicateName = false;
        allSnap.forEach(child => {
          if ((child.val().name || '').trim() === name) duplicateName = true;
        });

        const doRegister = async () => {
          const hashedPw = hashPw(pw);
          const memberData = { name: name + '(' + phone.slice(-4) + ')', pw: hashedPw, programs };
          if (birth)   memberData.birth   = birth;
          if (address) memberData.address = address;
          // 성별은 body/gender에 저장
          memberData['body/gender'] = gender;

          await db.ref('members/' + phone).set(memberData);

          // 사진 업로드
          const photoUrl = await uploadRegPhoto(phone);
          if (photoUrl) await db.ref('members/' + phone + '/photoUrl').set(photoUrl);

          resetRegForm();
          showToast('✅ ' + name + ' 회원이 등록됐어요!', 'success');
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

  // ── 락카 관리 ──
  let lockerCategories = []; // [{id, name, color, startNo, endNo}]
  let lockerData = {};       // {번호: {phone, name, startDate, endDate, lockPassword, status, categoryId}}

  async function loadLockerTab() {
    switchLockerSubtab('status');
    await loadLockerData();
    renderLockerStatus();
    renderLockerCategoryList();
  }

  async function loadLockerData() {
    const [catSnap, dataSnap] = await Promise.all([
      db.ref('locker_settings/categories').once('value'),
      db.ref('lockers').once('value')
    ]);
    lockerCategories = [];
    const catVal = catSnap.val();
    if (catVal && typeof catVal === 'object') {
      Object.entries(catVal).forEach(([key, val]) => {
        lockerCategories.push({ id: key, ...val });
      });
    }
    lockerData = dataSnap.val() || {};
    console.log('락카 종류 불러옴:', lockerCategories.length, '개', lockerCategories.map(c=>c.name));
  }

  function switchLockerSubtab(tab) {
    const statusBtn  = document.getElementById('locker-subtab-status');
    const settingsBtn= document.getElementById('locker-subtab-settings');
    const statusView = document.getElementById('locker-view-status');
    const settingsView = document.getElementById('locker-view-settings');
    if (tab === 'status') {
      statusView.style.display = 'block';
      settingsView.style.display = 'none';
      statusBtn.style.background = 'var(--blue)';
      statusBtn.style.color = 'white';
      statusBtn.style.border = 'none';
      settingsBtn.style.background = 'var(--card)';
      settingsBtn.style.color = 'var(--text)';
      settingsBtn.style.border = '1.5px solid var(--border)';
    } else {
      statusView.style.display = 'none';
      settingsView.style.display = 'block';
      settingsBtn.style.background = 'var(--blue)';
      settingsBtn.style.color = 'white';
      settingsBtn.style.border = 'none';
      statusBtn.style.background = 'var(--card)';
      statusBtn.style.color = 'var(--text)';
      statusBtn.style.border = '1.5px solid var(--border)';
    }
  }

  let selectedLockerCatId = null;

  function selectLockerCategory(catId) {
    selectedLockerCatId = catId;
    // 버튼 활성화 스타일
    document.querySelectorAll('.locker-cat-btn').forEach(btn => {
      const isActive = btn.dataset.catid === catId;
      btn.style.background = isActive ? 'var(--blue)' : 'var(--card)';
      btn.style.color = isActive ? 'white' : 'var(--text)';
      btn.style.border = isActive ? 'none' : '1.5px solid var(--border)';
    });
    renderLockerGrid();
  }

  function renderLockerStatus() {
    const wrap = document.getElementById('locker-status-wrap');
    if (!wrap) return;
    if (lockerCategories.length === 0) {
      wrap.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-hint);font-size:14px;">설정 탭에서 락카 종류를 먼저 등록해주세요.</div>';
      return;
    }
    // 첫 번째 카테고리 기본 선택
    if (!selectedLockerCatId || !lockerCategories.find(c => c.id === selectedLockerCatId)) {
      selectedLockerCatId = lockerCategories[0].id;
    }
    // 종류 버튼 탭 렌더링
    const catBtns = lockerCategories.map(cat => {
      const isActive = cat.id === selectedLockerCatId;
      return `<button class="locker-cat-btn" data-catid="${cat.id}" onclick="selectLockerCategory('${cat.id}')"
        style="padding:7px 14px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Noto Sans KR',sans-serif;
        background:${isActive ? 'var(--blue)' : 'var(--card)'};
        color:${isActive ? 'white' : 'var(--text)'};
        border:${isActive ? 'none' : '1.5px solid var(--border)'};">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cat.color||'#1a6fd4'};margin-right:5px;vertical-align:middle;"></span>
        ${cat.name}
      </button>`;
    }).join('');

    wrap.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">${catBtns}</div>
      <div id="locker-grid-wrap"></div>`;
    renderLockerGrid();
  }

  function renderLockerGrid() {
    const wrap = document.getElementById('locker-grid-wrap');
    if (!wrap) return;
    const cat = lockerCategories.find(c => c.id === selectedLockerCatId);
    if (!cat) return;

    const today = getToday();
    const soon = new Date(); soon.setDate(soon.getDate() + 7);
    const soonDate = soon.toISOString().slice(0,10);

    const nos = [];
    for (let n = cat.startNo; n <= cat.endNo; n++) nos.push(n);

    const grid = nos.map(no => {
      const key = cat.id + '_' + no;
      const d = lockerData[key];
      let bg = '#e8f5e9', border = '#81c784', emoji = '', tooltip = '빈칸';
      if (d) {
        const endD = d.endDate || '';
        if (d.status === 'disabled')      { bg='#f5f5f5'; border='#9e9e9e'; emoji='⚫'; tooltip='사용불가'; }
        else if (d.status === 'expired' || (endD && endD < today))
                                           { bg='#ffebee'; border='#e57373'; emoji='🔴'; tooltip='기간만료'; }
        else if (endD && endD <= soonDate) { bg='#fff8e1'; border='#ffb74d'; emoji='🟡'; tooltip='만료임박'; }
        else                               { bg='#e3f2fd'; border='#64b5f6'; emoji='🔵'; tooltip='사용중'; }
      }
      return `<div onclick="openLockerDetail('${cat.id}','${no}')" title="${tooltip}"
        style="width:52px;height:52px;border-radius:8px;background:${bg};border:1.5px solid ${border};
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        cursor:pointer;font-size:11px;font-weight:600;color:var(--text);gap:2px;">
        ${emoji ? `<span style="font-size:13px;">${emoji}</span>` : ''}
        <span>${no}</span>
      </div>`;
    }).join('');

    wrap.innerHTML = `
      <div style="background:var(--card);border-radius:12px;padding:16px;">
        <div style="display:flex;flex-wrap:wrap;gap:8px;">${grid}</div>
        <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap;">
          <span style="font-size:11px;color:var(--text-hint);">🟢 빈칸</span>
          <span style="font-size:11px;color:var(--text-hint);">🔵 사용중</span>
          <span style="font-size:11px;color:var(--text-hint);">🟡 만료임박</span>
          <span style="font-size:11px;color:var(--text-hint);">🔴 기간만료</span>
          <span style="font-size:11px;color:var(--text-hint);">⚫ 사용불가</span>
        </div>
      </div>`;
  }

  function openLockerDetail(catId, no) {
    const key = catId + '_' + no;
    const d = lockerData[key];
    const cat = lockerCategories.find(c => c.id === catId);
    const catName = cat ? cat.name : '';
    const isEmpty = !d || (!d.phone && d.status !== 'disabled');

    const html = isEmpty ? `
      <div style="padding:4px 0;">
        <div style="font-size:15px;font-weight:700;margin-bottom:14px;">🔑 ${catName} ${no}번 - 빈칸</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div>
            <div style="font-size:12px;color:var(--text-hint);margin-bottom:4px;">회원 연락처</div>
            <input id="ld-phone" type="text" placeholder="01000000000"
              style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div>
              <div style="font-size:12px;color:var(--text-hint);margin-bottom:4px;">시작일</div>
              <input id="ld-start" type="date"
                style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
            </div>
            <div>
              <div style="font-size:12px;color:var(--text-hint);margin-bottom:4px;">종료일</div>
              <input id="ld-end" type="date"
                style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
            </div>
          </div>
          <div>
            <div style="font-size:12px;color:var(--text-hint);margin-bottom:4px;">자물쇠 번호</div>
            <input id="ld-lock" type="text" placeholder="자물쇠 번호"
              style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button onclick="assignLocker('${catId}','${no}')"
            style="flex:1;padding:11px;background:var(--blue);color:white;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">✅ 배정</button>
          <button onclick="setLockerDisabled('${catId}','${no}')"
            style="flex:1;padding:11px;background:#f5f5f5;color:#666;border:1.5px solid var(--border);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">⚫ 사용불가</button>
        </div>
      </div>` : `
      <div style="padding:4px 0;">
        <div style="font-size:15px;font-weight:700;margin-bottom:14px;">🔑 ${catName} ${no}번 ${d.status === 'expired' ? '🔴' : d.status === 'disabled' ? '⚫' : '🔵'}</div>
        <div style="background:var(--bg);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;"><span style="font-size:12px;color:var(--text-hint);">회원명</span><span style="font-size:13px;font-weight:600;">${d.name || '-'}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="font-size:12px;color:var(--text-hint);">연락처</span><span style="font-size:13px;font-weight:600;">${d.phone || '-'}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="font-size:12px;color:var(--text-hint);">기간</span><span style="font-size:13px;font-weight:600;">${d.startDate||'-'} ~ ${d.endDate||'-'}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="font-size:12px;color:var(--text-hint);">자물쇠</span><span style="font-size:13px;font-weight:600;">${d.lockPassword || '-'}</span></div>
        </div>
        <div style="display:flex;gap:8px;">
          ${d.status === 'expired' || (d.endDate && d.endDate < getToday())
            ? `<button onclick="collectLocker('${catId}','${no}')" style="flex:1;padding:11px;background:#fff3e0;color:#e65100;border:1.5px solid #ffb74d;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">✅ 회수 완료</button>`
            : ''}
          <button onclick="releaseLocker('${catId}','${no}')"
            style="flex:1;padding:11px;background:#fff0f0;color:#c0392b;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">🗑️ 해제</button>
          ${d.status === 'disabled'
            ? `<button onclick="enableLocker('${catId}','${no}')" style="flex:1;padding:11px;background:#e8f5e9;color:#2e7d32;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">🟢 사용가능</button>`
            : ''}
        </div>
      </div>`;

    showLockerDetail(html);
  }

  async function assignLocker(catId, no) {
    const phone = document.getElementById('ld-phone')?.value.trim();
    const start = document.getElementById('ld-start')?.value;
    const end   = document.getElementById('ld-end')?.value;
    const lock  = document.getElementById('ld-lock')?.value.trim();
    if (!phone) { showToast('연락처를 입력해주세요.', 'error'); return; }

    const memberSnap = await db.ref('members/' + phone).once('value');
    const memberName = memberSnap.exists() ? (memberSnap.val().name || phone) : phone;

    const key = catId + '_' + no;
    await db.ref('lockers/' + key).set({
      phone, name: memberName, startDate: start, endDate: end,
      lockPassword: lock, status: 'active', categoryId: catId, lockerNo: no
    });
    // 회원 데이터에도 락카 번호 저장
    await db.ref('members/' + phone + '/lockerKey').set(key);
    lockerData[key] = { phone, name: memberName, startDate: start, endDate: end, lockPassword: lock, status: 'active', categoryId: catId, lockerNo: no };
    closeLockerDetail();
    renderLockerStatus();
    showToast('✅ 락카 배정 완료!', 'success');
  }

  async function collectLocker(catId, no) {
    const key = catId + '_' + no;
    await db.ref('lockers/' + key + '/status').set('collected');
    await db.ref('lockers/' + key).remove();
    if (lockerData[key]?.phone) await db.ref('members/' + lockerData[key].phone + '/lockerKey').remove();
    delete lockerData[key];
    closeLockerDetail();
    renderLockerStatus();
    showToast('✅ 회수 완료! 락카가 비워졌어요.', 'success');
  }

  async function releaseLocker(catId, no) {
    const key = catId + '_' + no;
    showConfirm('이 락카를 해제할까요?', async () => {
      if (lockerData[key]?.phone) await db.ref('members/' + lockerData[key].phone + '/lockerKey').remove();
      await db.ref('lockers/' + key).remove();
      delete lockerData[key];
      renderLockerStatus();
      showToast('락카가 해제됐어요.', 'success');
    });
  }

  async function setLockerDisabled(catId, no) {
    const key = catId + '_' + no;
    await db.ref('lockers/' + key).set({ status: 'disabled', categoryId: catId, lockerNo: no });
    lockerData[key] = { status: 'disabled', categoryId: catId, lockerNo: no };
    closeLockerDetail();
    renderLockerStatus();
    showToast('사용불가 처리됐어요.', 'success');
  }

  async function enableLocker(catId, no) {
    const key = catId + '_' + no;
    await db.ref('lockers/' + key).remove();
    delete lockerData[key];
    closeLockerDetail();
    renderLockerStatus();
    showToast('사용가능 처리됐어요.', 'success');
  }

  function showLockerDetail(html) {
    const existing = document.getElementById('locker-detail-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'locker-detail-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;';
    modal.innerHTML = `<div style="background:var(--card);border-radius:16px;padding:24px;width:100%;max-width:360px;max-height:80vh;overflow-y:auto;font-family:'Noto Sans KR',sans-serif;">
      <div style="display:flex;justify-content:flex-end;margin-bottom:4px;"><button onclick="closeLockerDetail()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-hint);">×</button></div>
      ${html}</div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeLockerDetail(); });
  }

  function closeLockerDetail() {
    const modal = document.getElementById('locker-detail-modal');
    if (modal) modal.remove();
  }

  // 락카 설정
  function updateLockerCat(id, field, value) {
    const cat = lockerCategories.find(c => c.id === id);
    if (!cat) return;
    if (field === 'startNo' || field === 'endNo') cat[field] = parseInt(value) || 1;
    else cat[field] = value;
  }

  function renderLockerCategoryList() {
    const wrap = document.getElementById('locker-category-list');
    if (!wrap) return;
    if (lockerCategories.length === 0) {
      wrap.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-hint);font-size:13px;">종류를 추가해주세요</div>';
      return;
    }
    wrap.innerHTML = lockerCategories.map((cat) => `
      <div style="background:var(--bg);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="color" value="${cat.color || '#1a6fd4'}"
            oninput="updateLockerCat('${cat.id}','color',this.value)"
            style="width:32px;height:32px;border:none;border-radius:6px;cursor:pointer;padding:2px;" />
          <input type="text" value="${cat.name}" placeholder="종류명 (예: 일반남성)"
            oninput="updateLockerCat('${cat.id}','name',this.value)"
            style="flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
          <button onclick="removeLockerCategory('${cat.id}')"
            style="padding:7px 10px;background:#fff0f0;color:#c0392b;border:none;border-radius:8px;font-size:12px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">삭제</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div>
            <div style="font-size:11px;color:var(--text-hint);margin-bottom:3px;">시작 번호</div>
            <input type="number" value="${cat.startNo || 1}" min="1"
              oninput="updateLockerCat('${cat.id}','startNo',this.value)"
              style="width:100%;box-sizing:border-box;padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-hint);margin-bottom:3px;">끝 번호</div>
            <input type="number" value="${cat.endNo || 10}" min="1"
              oninput="updateLockerCat('${cat.id}','endNo',this.value)"
              style="width:100%;box-sizing:border-box;padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
          </div>
        </div>
      </div>`).join('');
  }

  function addLockerCategory() {
    const colors = ['#1a6fd4','#e91e63','#4caf50','#ff9800','#9c27b0','#00bcd4'];
    const color  = colors[lockerCategories.length % colors.length];
    lockerCategories.push({ id: 'cat_' + Date.now(), name: '', color, startNo: 1, endNo: 10 });
    renderLockerCategoryList();
  }

  function removeLockerCategory(id) {
    lockerCategories = lockerCategories.filter(c => c.id !== id);
    renderLockerCategoryList();
  }

  async function saveLockerSettings() {
    for (const cat of lockerCategories) {
      if (!cat.name) { showToast('종류명을 모두 입력해주세요.', 'error'); return; }
      if (!cat.startNo || !cat.endNo || cat.startNo > cat.endNo) {
        showToast('번호 범위를 확인해주세요.', 'error'); return;
      }
    }
    try {
      // 기존 전체 삭제
      await db.ref('locker_settings/categories').remove();
      // 순번 기반 키로 하나씩 저장
      for (let i = 0; i < lockerCategories.length; i++) {
        const cat = lockerCategories[i];
        await db.ref('locker_settings/categories/cat' + i).set({
          name: cat.name,
          color: cat.color || '#1a6fd4',
          startNo: Number(cat.startNo),
          endNo: Number(cat.endNo)
        });
        lockerCategories[i].id = 'cat' + i;
      }
      showToast('✅ 설정 저장 완료!', 'success');
      switchLockerSubtab('status');
      renderLockerStatus();
    } catch(e) {
      showToast('저장에 실패했어요. 다시 시도해주세요.', 'error');
      console.error(e);
    }
  }

  // ── 계약서 웹캠/사진 관련 ──
  let ctWebcamStream = null;
  let ctPhotoBlob    = null;

  function openCtWebcam() {
    const modal = document.getElementById('ct-webcam-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        ctWebcamStream = stream;
        const video = document.getElementById('ct-webcam-video');
        if (video) video.srcObject = stream;
      })
      .catch(() => {
        modal.style.display = 'none';
        showToast('카메라 권한이 필요해요. 파일 선택을 이용해주세요.', 'error');
      });
  }

  function closeCtWebcam() {
    if (ctWebcamStream) { ctWebcamStream.getTracks().forEach(t => t.stop()); ctWebcamStream = null; }
    const modal = document.getElementById('ct-webcam-modal');
    if (modal) modal.style.display = 'none';
  }

  function updateCtPhotoUI(hasPhoto) {
    const preview   = document.getElementById('ct-photo-preview');
    const webcamBtn = document.getElementById('ct-webcam-btn');
    const deleteBtn = document.getElementById('ct-photo-delete-btn');
    if (!preview) return;
    if (hasPhoto) {
      preview.style.border = '2px solid var(--blue)';
      if (webcamBtn) webcamBtn.innerHTML = '📷 다시 찍기';
      if (deleteBtn) deleteBtn.style.display = 'flex';
    } else {
      preview.style.border = '1.5px solid var(--border)';
      preview.innerHTML = '👤';
      if (webcamBtn) webcamBtn.innerHTML = '📷 웹캠 촬영';
      if (deleteBtn) deleteBtn.style.display = 'none';
    }
  }

  function deleteCtPhoto() {
    ctPhotoBlob = null;
    const fileInput = document.getElementById('ct-photo-file');
    if (fileInput) fileInput.value = '';
    updateCtPhotoUI(false);
  }

  function captureCtWebcam() {
    const video  = document.getElementById('ct-webcam-video');
    const canvas = document.getElementById('ct-webcam-canvas');
    if (!video || !canvas) return;
    canvas.width = 300; canvas.height = 300;
    const ctx  = canvas.getContext('2d');
    const size = Math.min(video.videoWidth, video.videoHeight);
    const sx   = (video.videoWidth  - size) / 2;
    const sy   = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 300, 300);
    canvas.toBlob(blob => {
      ctPhotoBlob = blob;
      const preview = document.getElementById('ct-photo-preview');
      if (preview) {
        const url = URL.createObjectURL(blob);
        preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" />`;
      }
      updateCtPhotoUI(true);
      closeCtWebcam();
    }, 'image/jpeg', 0.7);
  }

  function onCtPhotoFile(input) {
    const file = input.files[0];
    if (!file) return;
    const img    = new Image();
    const reader = new FileReader();
    reader.onload = e => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 300; canvas.height = 300;
        const ctx  = canvas.getContext('2d');
        const size = Math.min(img.width, img.height);
        const sx   = (img.width  - size) / 2;
        const sy   = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 300, 300);
        canvas.toBlob(blob => {
          ctPhotoBlob = blob;
          const preview = document.getElementById('ct-photo-preview');
          if (preview) {
            const url = URL.createObjectURL(blob);
            preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" />`;
          }
          updateCtPhotoUI(true);
        }, 'image/jpeg', 0.7);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  async function uploadCtPhoto(phone) {
    if (!ctPhotoBlob) return null;
    try {
      const storageRef = firebase.storage().ref('members/' + phone + '/profile.jpg');
      await storageRef.put(ctPhotoBlob, { contentType: 'image/jpeg' });
      return await storageRef.getDownloadURL();
    } catch (e) {
      console.error('계약서 사진 업로드 실패:', e);
      return null;
    }
  }

  // ── 전자계약서 ──
  let ctCurrentStep = 1;
  let ctSignCanvas, ctSignCtx, ctSigning = false;
  let ctSelectedProgs = [];

  // 단계 이동
  function ctGoStep(step) {
    // 이전 단계 done 처리
    for (let i = 1; i <= 5; i++) {
      const item = document.querySelector('.ct-step-item[data-step="' + i + '"]');
      if (!item) continue;
      item.classList.remove('active', 'done');
      if (i < step) item.classList.add('done');
      else if (i === step) item.classList.add('active');
    }
    // 콘텐츠 전환
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById('ct-step-' + i);
      if (el) el.style.display = (i === step) ? '' : 'none';
    }
    ctCurrentStep = step;
    // 4단계 진입 시 서명 초기화 + 날짜 표시 + 계약내용 요약
    if (step === 4) {
      initCtSign();
      const now = new Date();
      document.getElementById('ct-sign-date').textContent =
        now.getFullYear() + '년 ' + (now.getMonth()+1) + '월 ' + now.getDate() + '일';
      renderCtSignSummary();
    }
  }

  function ctNext(step) {
    if (step === 1) {
      const name  = document.getElementById('ct-name').value.trim();
      const phone = document.getElementById('ct-phone').value.trim().replace(/-/g,'');
      const birth = document.getElementById('ct-birth').value.trim();
      const type  = document.getElementById('ct-type').value;
      if (!name)  { showToast('성명을 입력해주세요.', 'error'); return; }
      if (!phone || phone.length < 10) { showToast('연락처를 정확히 입력해주세요.', 'error'); return; }
      if (!birth || birth.length !== 8) { showToast('생년월일을 8자리로 입력해주세요.', 'error'); return; }
      // 연락처 중복 검사
      db.ref('members/' + phone).once('value').then(snap => {
        if (type === 'new' && snap.exists()) {
          showToast('이미 등록된 연락처예요. 재등록을 선택해주세요.', 'error');
          return;
        }
        if (type === 're' && !snap.exists()) {
          showToast('등록된 회원이 없어요. 신규를 선택해주세요.', 'error');
          return;
        }
        // 재등록이면 기존 정보 자동 불러오기
        if (type === 're' && snap.exists()) {
          const data = snap.val();
          const rawName = (data.name || '').replace(/\(\d{4}\)$/, '').trim();
          document.getElementById('ct-name').value    = rawName;
          document.getElementById('ct-birth').value   = data.birth   || birth;
          document.getElementById('ct-address').value = data.address || '';
          if (data.memo) document.getElementById('ct-memo').value = data.memo || '';
          const gender = data['body/gender'] || 'male';
          selectCtGender(gender);
          // 기존 사진이 있으면 미리보기 표시
          if (data.photoUrl) {
            const preview = document.getElementById('ct-photo-preview');
            if (preview) preview.innerHTML = `<img src="${data.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />`;
            updateCtPhotoUI(true);
          }
          showToast('기존 정보를 불러왔어요.', 'info');
        }
        ctGoStep(2);
      }).catch(() => ctGoStep(2));
      return; // Firebase 조회 비동기라 여기서 return
    }
    if (step === 2) {
      if (ctSelectedProgs.length === 0) { showToast('프로그램을 1개 이상 선택해주세요.', 'error'); return; }
    }
    ctGoStep(step + 1);
  }

  function ctPrev(step) {
    ctGoStep(step - 1);
  }

  // 신규/재등록 선택
  function selectCtType(type) {
    document.getElementById('ct-type').value = type;
    const newBtn = document.getElementById('ct-type-new');
    const reBtn = document.getElementById('ct-type-re');
    if (type === 'new') {
      newBtn.style.cssText = 'padding:11px;border:2px solid var(--blue);background:var(--blue);color:white;border-radius:var(--radius-sm);font-size:14px;font-weight:700;cursor:pointer;font-family:\'Noto Sans KR\',sans-serif;';
      reBtn.style.cssText = 'padding:11px;border:1.5px solid var(--border);background:var(--card);color:var(--text-sub);border-radius:var(--radius-sm);font-size:14px;font-weight:700;cursor:pointer;font-family:\'Noto Sans KR\',sans-serif;';
    } else {
      reBtn.style.cssText = 'padding:11px;border:2px solid var(--blue);background:var(--blue);color:white;border-radius:var(--radius-sm);font-size:14px;font-weight:700;cursor:pointer;font-family:\'Noto Sans KR\',sans-serif;';
      newBtn.style.cssText = 'padding:11px;border:1.5px solid var(--border);background:var(--card);color:var(--text-sub);border-radius:var(--radius-sm);font-size:14px;font-weight:700;cursor:pointer;font-family:\'Noto Sans KR\',sans-serif;';
    }
  }

  // 성별 선택
  function selectCtGender(g) {
    document.getElementById('ct-gender').value = g;
    const mBtn = document.getElementById('ct-gender-male');
    const fBtn = document.getElementById('ct-gender-female');
    if (g === 'male') {
      mBtn.style.cssText = 'padding:10px;border:2px solid var(--blue);background:var(--blue);color:white;border-radius:var(--radius-sm);font-size:14px;font-weight:700;cursor:pointer;font-family:\'Noto Sans KR\',sans-serif;';
      fBtn.style.cssText = 'padding:10px;border:1.5px solid var(--border);background:var(--card);color:var(--text-sub);border-radius:var(--radius-sm);font-size:14px;font-weight:700;cursor:pointer;font-family:\'Noto Sans KR\',sans-serif;';
    } else {
      fBtn.style.cssText = 'padding:10px;border:2px solid var(--blue);background:var(--blue);color:white;border-radius:var(--radius-sm);font-size:14px;font-weight:700;cursor:pointer;font-family:\'Noto Sans KR\',sans-serif;';
      mBtn.style.cssText = 'padding:10px;border:1.5px solid var(--border);background:var(--card);color:var(--text-sub);border-radius:var(--radius-sm);font-size:14px;font-weight:700;cursor:pointer;font-family:\'Noto Sans KR\',sans-serif;';
    }
  }

  // 프로그램 선택 토글
  // 프로그램 카드 토글 (체크박스 방식)
  function toggleCtCard(prog) {
    const chk  = document.getElementById('ct-chk-' + prog);
    const card = document.getElementById('ct-card-' + prog);
    const body = document.getElementById('ct-body-' + prog);
    if (!chk || !card || !body) return;

    const isChecked = !chk.checked; // 클릭 전 상태 반전
    chk.checked = isChecked;

    if (isChecked) {
      card.classList.add('selected');
      body.style.display = '';
      if (!ctSelectedProgs.includes(prog)) ctSelectedProgs.push(prog);
      renderCtCardBody(prog, body);
    } else {
      card.classList.remove('selected');
      body.style.display = 'none';
      ctSelectedProgs = ctSelectedProgs.filter(p => p !== prog);
      document.getElementById('ct-summary-' + prog).textContent = '미선택';
      document.getElementById('ct-summary-' + prog).style.background = '#f1f5f9';
      document.getElementById('ct-summary-' + prog).style.color = 'var(--text-sub)';
    }
    calcCtTotal();
  }

  // 카드 내부 입력 UI 렌더링
  function renderCtCardBody(prog, container) {
    if (container.dataset.rendered) return; // 이미 렌더링됨
    container.dataset.rendered = 'true';
    const hasCount = container.dataset.hasCount === 'true';
    const inStyle = `width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;`;
    const cols = hasCount ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr';
    container.innerHTML = `
      <!-- 📅 기간 -->
      <div style="margin-bottom:12px;">
        <div style="font-size:12px;font-weight:700;color:var(--text-sub);margin-bottom:8px;">📅 기간</div>
        <div style="display:grid;grid-template-columns:${cols};gap:8px;margin-bottom:8px;">
          <div>
            <div style="font-size:11px;color:var(--text-sub);margin-bottom:4px;">시작일</div>
            <input type="date" id="ct-${prog}-start" onchange="calcCtEndDate('${prog}');updateCtSummary('${prog}')"
              style="${inStyle}" />
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-sub);margin-bottom:4px;">개월수</div>
            <input type="number" id="ct-${prog}-months" min="1" max="36" placeholder="개월"
              style="${inStyle}" onwheel="this.blur()"
              oninput="calcCtEndDate('${prog}');updateCtSummary('${prog}')" />
          </div>
          ${hasCount ? `
          <div>
            <div style="font-size:11px;color:var(--text-sub);margin-bottom:4px;">횟수</div>
            <input type="number" id="ct-${prog}-count" min="1" placeholder="회"
              style="${inStyle}" onwheel="this.blur()" oninput="updateCtSummary('${prog}')" />
          </div>` : ''}
          <div>
            <div style="font-size:11px;color:var(--text-sub);margin-bottom:4px;">서비스 추가</div>
            <div style="display:flex;gap:4px;">
              <input type="number" id="ct-${prog}-extra-num" min="0" placeholder="0"
                style="${inStyle}flex:1;" onwheel="this.blur()" oninput="calcCtEndDate('${prog}');updateCtSummary('${prog}')" />
              <select id="ct-${prog}-extra-unit" onchange="calcCtEndDate('${prog}')"
                style="padding:8px 6px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:'Noto Sans KR',sans-serif;background:var(--card);outline:none;">
                <option value="개월">개월</option>
                <option value="일">일</option>
              </select>
            </div>
          </div>
        </div>
        <!-- 종료일 + 이용요금 나란히 -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div>
            <div style="font-size:11px;color:var(--text-sub);margin-bottom:4px;">종료일 (자동계산)</div>
            <input type="text" id="ct-${prog}-end" readonly placeholder="자동계산"
              style="${inStyle}background:#f0fdf4;color:#16a34a;font-weight:600;" />
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-sub);margin-bottom:4px;">💰 이용요금(원)</div>
            <input type="number" id="ct-${prog}-price" min="0" placeholder="이용요금 입력"
              style="${inStyle}font-weight:700;" onwheel="this.blur()" oninput="calcCtTotal();updateCtSummary('${prog}')" />
          </div>
        </div>
      </div>

      <!-- 💳 결제방법 -->
      <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;">
        <div style="font-size:12px;font-weight:700;color:var(--text-sub);margin-bottom:8px;">💳 결제방법 (혼합 가능)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
          <div>
            <div style="font-size:11px;color:var(--text-sub);margin-bottom:4px;">현금</div>
            <input type="number" id="ct-${prog}-cash" min="0" placeholder="0"
              style="${inStyle}" onwheel="this.blur()" oninput="calcCtTotal()" />
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-sub);margin-bottom:4px;">카드</div>
            <input type="number" id="ct-${prog}-card" min="0" placeholder="0"
              style="${inStyle}" onwheel="this.blur()" oninput="calcCtTotal()" />
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-sub);margin-bottom:4px;">계좌이체</div>
            <input type="number" id="ct-${prog}-transfer" min="0" placeholder="0"
              style="${inStyle}" onwheel="this.blur()" oninput="calcCtTotal()" />
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;background:white;border-radius:8px;padding:8px 12px;">
          <span style="font-size:12px;color:var(--text-sub);">💰 결제금액 (자동합산)</span>
          <span id="ct-${prog}-paid-display" style="font-size:14px;font-weight:700;color:#1a6fd4;">0원</span>
        </div>
      </div>`;

    // 시작일 기본값 오늘
    const t = new Date();
    const startEl = document.getElementById('ct-' + prog + '-start');
    if (startEl) {
      startEl.value = t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
      calcCtEndDate(prog);
    }
  }

  // 카드 상단 요약 업데이트 (X개월·XXX원)
  function updateCtSummary(prog) {
    const months  = parseInt(document.getElementById('ct-' + prog + '-months')?.value) || 0;
    const count   = parseInt(document.getElementById('ct-' + prog + '-count')?.value) || 0;
    const price   = parseInt(document.getElementById('ct-' + prog + '-price')?.value) || 0;
    const sumEl   = document.getElementById('ct-summary-' + prog);
    if (!sumEl) return;
    if (months || price) {
      let text = '';
      if (months) text += months + '개월';
      if (count)  text += (text ? '·' : '') + count + '회';
      if (price)  text += (text ? '·' : '') + price.toLocaleString() + '원';
      sumEl.textContent = text || '입력 중';
      sumEl.style.background = '#dbeafe';
      sumEl.style.color = '#1a6fd4';
    } else {
      sumEl.textContent = '선택됨';
      sumEl.style.background = '#dbeafe';
      sumEl.style.color = '#1a6fd4';
    }
  }

  // 종료일 자동계산 (기간 + 서비스추가 반영)
  function calcCtEndDate(prog) {
    const startEl     = document.getElementById('ct-' + prog + '-start');
    const monthEl     = document.getElementById('ct-' + prog + '-months');
    const extraNumEl  = document.getElementById('ct-' + prog + '-extra-num');
    const extraUnitEl = document.getElementById('ct-' + prog + '-extra-unit');
    const endEl       = document.getElementById('ct-' + prog + '-end');
    if (!startEl || !monthEl || !endEl) return;
    const start  = startEl.value;
    const months = parseInt(monthEl.value) || 0;
    if (!start || !months) { endEl.value = ''; return; }
    const d = new Date(start);
    d.setMonth(d.getMonth() + months);
    // 서비스 추가 반영
    const extraNum  = parseInt(extraNumEl?.value) || 0;
    const extraUnit = extraUnitEl?.value || '개월';
    if (extraNum > 0) {
      if (extraUnit === '개월') d.setMonth(d.getMonth() + extraNum);
      else if (extraUnit === '일') d.setDate(d.getDate() + extraNum);
    }
    d.setDate(d.getDate() - 1);
    endEl.value = d.getFullYear() + '년 ' + (d.getMonth()+1) + '월 ' + d.getDate() + '일';
  }

  // 합계 계산 (현금/카드/계좌 분리 + 미수금 + 항목별 breakdown)
  function calcCtTotal() {
    let totalContract = 0, sumCash = 0, sumCard = 0, sumTransfer = 0;
    const breakdownItems = [];

    // 프로그램별
    const progLabels = {
      '헬스':'🏋️ 헬스', 'GX':'🎶 GX', 'PT':'💪 PT',
      '기구필라테스개인':'🧘 기구필라테스 개인', '기구필라테스그룹':'👥 기구필라테스 그룹'
    };
    ctSelectedProgs.forEach(prog => {
      const price    = parseInt(document.getElementById('ct-' + prog + '-price')?.value)    || 0;
      const cash     = parseInt(document.getElementById('ct-' + prog + '-cash')?.value)     || 0;
      const card     = parseInt(document.getElementById('ct-' + prog + '-card')?.value)     || 0;
      const transfer = parseInt(document.getElementById('ct-' + prog + '-transfer')?.value) || 0;
      const months   = parseInt(document.getElementById('ct-' + prog + '-months')?.value)   || 0;
      totalContract += price;
      sumCash += cash; sumCard += card; sumTransfer += transfer;
      // 카드별 결제금액 표시
      const paidDisp = document.getElementById('ct-' + prog + '-paid-display');
      if (paidDisp) paidDisp.textContent = (cash + card + transfer).toLocaleString() + '원';
      if (price || cash || card || transfer) {
        breakdownItems.push({
          label: (progLabels[prog] || prog) + (months ? ' ' + months + '개월' : ''),
          price, cash, card, transfer
        });
      }
    });

    // 부가서비스
    const extraConfigs = [
      { key:'cloth',  label:'👕 운동복' },
      { key:'locker', label:'🔑 개인 락카' },
    ];
    extraConfigs.forEach(({ key, label }) => {
      const check = document.getElementById('ct-' + key + '-check');
      if (!check?.checked) return;
      const price    = parseInt(document.getElementById('ct-' + key + '-price')?.value)    || 0;
      const cash     = parseInt(document.getElementById('ct-' + key + '-cash')?.value)     || 0;
      const card     = parseInt(document.getElementById('ct-' + key + '-card')?.value)     || 0;
      const transfer = parseInt(document.getElementById('ct-' + key + '-transfer')?.value) || 0;
      const months   = parseInt(document.getElementById('ct-' + key + '-months')?.value)   || 0;
      totalContract += price;
      sumCash += cash; sumCard += card; sumTransfer += transfer;
      // 결제금액 표시
      const paidDisp = document.getElementById('ct-' + key + '-paid-display');
      if (paidDisp) paidDisp.textContent = (cash + card + transfer).toLocaleString() + '원';
      if (price || cash || card || transfer) {
        breakdownItems.push({
          label: label + (months ? ' ' + months + '개월' : '') + (price === 0 && check.checked ? ' (무료)' : ''),
          price, cash, card, transfer
        });
      }
      updateCtExtraSummary(key);
    });

    const totalPaid = sumCash + sumCard + sumTransfer;
    const unpaid    = totalContract - totalPaid;

    // 항목별 breakdown 렌더링
    const breakdownEl = document.getElementById('ct-breakdown-list');
    if (breakdownEl) {
      if (breakdownItems.length === 0) {
        breakdownEl.innerHTML = '';
      } else {
        breakdownEl.innerHTML = `
          <div style="background:white;border-radius:8px;overflow:hidden;margin-bottom:8px;">
            <div style="display:grid;grid-template-columns:1fr 75px 65px 65px 65px 70px;gap:0;background:#f8fafc;padding:7px 10px;font-size:11px;color:var(--text-sub);font-weight:600;">
              <div>항목</div>
              <div style="text-align:right;">이용요금</div>
              <div style="text-align:right;">현금</div>
              <div style="text-align:right;">카드</div>
              <div style="text-align:right;">계좌</div>
              <div style="text-align:right;">미수금</div>
            </div>
            ${breakdownItems.map(item => {
              const itemUnpaid = item.price - (item.cash + item.card + item.transfer);
              return `
              <div style="display:grid;grid-template-columns:1fr 75px 65px 65px 65px 70px;gap:0;padding:7px 10px;border-top:1px solid #f1f5f9;font-size:12px;">
                <div style="font-weight:600;color:var(--text);">${item.label}</div>
                <div style="text-align:right;color:var(--text);">${item.price ? item.price.toLocaleString() : '-'}</div>
                <div style="text-align:right;color:${item.cash ? '#059669' : 'var(--text-hint)'};">${item.cash ? item.cash.toLocaleString() : '-'}</div>
                <div style="text-align:right;color:${item.card ? '#1a6fd4' : 'var(--text-hint)'};">${item.card ? item.card.toLocaleString() : '-'}</div>
                <div style="text-align:right;color:${item.transfer ? '#7c3aed' : 'var(--text-hint)'};">${item.transfer ? item.transfer.toLocaleString() : '-'}</div>
                <div style="text-align:right;font-weight:700;color:${itemUnpaid > 0 ? '#ef4444' : 'var(--text-hint)'};">${itemUnpaid > 0 ? itemUnpaid.toLocaleString() : '-'}</div>
              </div>`;
            }).join('')}
          </div>`;
      }
    }

    // 합계 표시
    const sumCashEl = document.getElementById('ct-sum-cash');
    const sumCardEl = document.getElementById('ct-sum-card');
    const sumTrEl   = document.getElementById('ct-sum-transfer');
    if (sumCashEl) sumCashEl.textContent = sumCash.toLocaleString() + '원';
    if (sumCardEl) sumCardEl.textContent = sumCard.toLocaleString() + '원';
    if (sumTrEl)   sumTrEl.textContent   = sumTransfer.toLocaleString() + '원';

    const totalEl   = document.getElementById('ct-total-amt');
    const paidEl    = document.getElementById('ct-paid-amt');
    const unpaidRow = document.getElementById('ct-unpaid-row');
    const unpaidEl  = document.getElementById('ct-unpaid-amt');
    if (totalEl) totalEl.textContent = totalContract.toLocaleString() + '원';
    if (paidEl)  paidEl.textContent  = totalPaid.toLocaleString() + '원';
    if (unpaidRow && unpaidEl) {
      if (unpaid > 0) {
        unpaidEl.textContent = unpaid.toLocaleString() + '원';
        unpaidRow.style.display = 'flex';
      } else {
        unpaidRow.style.display = 'none';
      }
    }
  }

  // 부가서비스 토글
  function toggleCtExtra(type) {
    const detail  = document.getElementById('ct-' + type + '-detail');
    const check   = document.getElementById('ct-' + type + '-check');
    const summary = document.getElementById('ct-' + type + '-summary');
    if (detail) detail.style.display = check.checked ? '' : 'none';
    if (summary) {
      if (check.checked) {
        summary.textContent = '선택됨';
        summary.style.color = '#1a6fd4';
      } else {
        summary.textContent = '미선택';
        summary.style.color = 'var(--text-sub)';
      }
    }
    updateCtExtraSummary(type);
    calcCtTotal();
  }

  // 부가서비스 카드 상단 요약 업데이트
  function updateCtExtraSummary(type) {
    const check   = document.getElementById('ct-' + type + '-check');
    const summary = document.getElementById('ct-' + type + '-summary');
    if (!check || !summary) return;
    if (!check.checked) { summary.textContent = '미선택'; summary.style.color = 'var(--text-sub)'; return; }
    const months = parseInt(document.getElementById('ct-' + type + '-months')?.value) || 0;
    const price  = parseInt(document.getElementById('ct-' + type + '-price')?.value)  || 0;
    let text = '';
    if (months) text += months + '개월';
    if (price === 0) text += (text ? '·' : '') + '무료';
    else if (price)  text += (text ? '·' : '') + price.toLocaleString() + '원';
    summary.textContent = text || '선택됨';
    summary.style.color = '#1a6fd4';
  }

  // 약관 동의 체크
  function checkCtAgree() {
    const agreed = document.getElementById('ct-agree').checked;
    const nextBtn = document.getElementById('ct-agree-next');
    if (nextBtn) {
      nextBtn.style.opacity = agreed ? '1' : '0.4';
      nextBtn.style.pointerEvents = agreed ? 'auto' : 'none';
    }
  }

  // 4단계 서명 화면 우측 계약내용 요약 렌더링
  function renderCtSignSummary() {
    const el = document.getElementById('ct-sign-summary');
    if (!el) return;

    const name    = document.getElementById('ct-name')?.value.trim() || '';
    const phone   = document.getElementById('ct-phone')?.value.trim() || '';
    const type    = document.getElementById('ct-type')?.value === 're' ? '재등록' : '신규';
    const progLabels = {
      '헬스':'🏋️ 헬스', 'GX':'🎶 GX', 'PT':'💪 PT',
      '기구필라테스개인':'🧘 기구필라테스 개인', '기구필라테스그룹':'👥 기구필라테스 그룹'
    };

    let html = `
      <div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border);">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">${name} <span style="font-size:11px;color:var(--text-sub);font-weight:400;">(${type})</span></div>
        <div style="font-size:12px;color:var(--text-sub);">${phone}</div>
      </div>`;

    // 프로그램별
    let totalPrice = 0, totalPaid = 0, totalCash = 0, totalCard = 0, totalTransfer = 0;
    ctSelectedProgs.forEach(prog => {
      const months   = parseInt(document.getElementById('ct-' + prog + '-months')?.value) || 0;
      const count    = parseInt(document.getElementById('ct-' + prog + '-count')?.value)  || 0;
      const price    = parseInt(document.getElementById('ct-' + prog + '-price')?.value)  || 0;
      const cash     = parseInt(document.getElementById('ct-' + prog + '-cash')?.value)   || 0;
      const card     = parseInt(document.getElementById('ct-' + prog + '-card')?.value)   || 0;
      const transfer = parseInt(document.getElementById('ct-' + prog + '-transfer')?.value) || 0;
      const endDate  = document.getElementById('ct-' + prog + '-end')?.value || '';
      const paid     = cash + card + transfer;
      const unpaid   = price - paid;
      totalPrice += price; totalPaid += paid; totalCash += cash; totalCard += card; totalTransfer += transfer;

      html += `
        <div style="margin-bottom:8px;padding:8px;background:white;border-radius:6px;border:1px solid var(--border);">
          <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px;">${progLabels[prog] || prog}</div>
          <div style="font-size:11px;color:var(--text-sub);line-height:1.6;">
            ${months ? months + '개월' : ''}${count ? ' · ' + count + '회' : ''}
            ${endDate ? '<br>종료: ' + endDate : ''}
            ${price ? '<br>이용요금: ' + price.toLocaleString() + '원' : ''}
            ${cash ? '<br><span style="color:#059669;">현금: ' + cash.toLocaleString() + '원</span>' : ''}
            ${card ? '<br><span style="color:#1a6fd4;">카드: ' + card.toLocaleString() + '원</span>' : ''}
            ${transfer ? '<br><span style="color:#7c3aed;">계좌: ' + transfer.toLocaleString() + '원</span>' : ''}
            ${unpaid > 0 ? '<br><span style="color:#ef4444;font-weight:700;">미수금: ' + unpaid.toLocaleString() + '원</span>' : ''}
          </div>
        </div>`;
    });

    // 부가서비스
    ['cloth','locker'].forEach(key => {
      const check = document.getElementById('ct-' + key + '-check');
      if (!check?.checked) return;
      const label    = key === 'cloth' ? '👕 운동복' : '🔑 개인 락카';
      const months   = parseInt(document.getElementById('ct-' + key + '-months')?.value)   || 0;
      const price    = parseInt(document.getElementById('ct-' + key + '-price')?.value)    || 0;
      const cash     = parseInt(document.getElementById('ct-' + key + '-cash')?.value)     || 0;
      const card     = parseInt(document.getElementById('ct-' + key + '-card')?.value)     || 0;
      const transfer = parseInt(document.getElementById('ct-' + key + '-transfer')?.value) || 0;
      const paid     = cash + card + transfer;
      const unpaid   = price - paid;
      totalPrice += price; totalPaid += paid; totalCash += cash; totalCard += card; totalTransfer += transfer;

      html += `
        <div style="margin-bottom:8px;padding:8px;background:white;border-radius:6px;border:1px solid var(--border);">
          <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px;">${label}</div>
          <div style="font-size:11px;color:var(--text-sub);line-height:1.6;">
            ${months ? months + '개월' : ''}
            ${price === 0 ? ' · 무료' : (price ? '<br>이용요금: ' + price.toLocaleString() + '원' : '')}
            ${cash ? '<br><span style="color:#059669;">현금: ' + cash.toLocaleString() + '원</span>' : ''}
            ${card ? '<br><span style="color:#1a6fd4;">카드: ' + card.toLocaleString() + '원</span>' : ''}
            ${transfer ? '<br><span style="color:#7c3aed;">계좌: ' + transfer.toLocaleString() + '원</span>' : ''}
            ${unpaid > 0 ? '<br><span style="color:#ef4444;font-weight:700;">미수금: ' + unpaid.toLocaleString() + '원</span>' : ''}
          </div>
        </div>`;
    });

    // 최종 합계
    const totalUnpaid = totalPrice - totalPaid;
    html += `
      <div style="padding:10px;background:#f0f7ff;border-radius:6px;border:1.5px solid #bfdbfe;margin-top:4px;">
        <div style="font-size:11px;font-weight:700;color:var(--text-sub);margin-bottom:6px;">결제 합계</div>
        ${totalCash > 0 ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="font-size:11px;color:#059669;">현금</span>
          <span style="font-size:11px;font-weight:700;color:#059669;">${totalCash.toLocaleString()}원</span>
        </div>` : ''}
        ${totalCard > 0 ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="font-size:11px;color:#1a6fd4;">카드</span>
          <span style="font-size:11px;font-weight:700;color:#1a6fd4;">${totalCard.toLocaleString()}원</span>
        </div>` : ''}
        ${totalTransfer > 0 ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="font-size:11px;color:#7c3aed;">계좌이체</span>
          <span style="font-size:11px;font-weight:700;color:#7c3aed;">${totalTransfer.toLocaleString()}원</span>
        </div>` : ''}
        <div style="border-top:1px solid #bfdbfe;margin:6px 0;"></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="font-size:11px;color:var(--text-sub);">이용요금 합계</span>
          <span style="font-size:12px;font-weight:700;color:var(--text);">${totalPrice.toLocaleString()}원</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="font-size:11px;color:var(--text-sub);">오늘 결제</span>
          <span style="font-size:12px;font-weight:700;color:#1a6fd4;">${totalPaid.toLocaleString()}원</span>
        </div>
        ${totalUnpaid > 0 ? `
        <div style="display:flex;justify-content:space-between;">
          <span style="font-size:11px;color:#ef4444;font-weight:700;">미수금</span>
          <span style="font-size:12px;font-weight:700;color:#ef4444;">${totalUnpaid.toLocaleString()}원</span>
        </div>` : ''}
      </div>`;

    el.innerHTML = html;
  }

  // 서명 초기화
  function initCtSign() {
    ctSignCanvas = document.getElementById('ct-sign-canvas');
    if (!ctSignCanvas || ctSignCanvas._ctInited) return;
    ctSignCanvas._ctInited = true;
    ctSignCtx = ctSignCanvas.getContext('2d');
    ctSignCtx.strokeStyle = '#1a1a2e';
    ctSignCtx.lineWidth = 2.5;
    ctSignCtx.lineCap = 'round';
    ctSignCtx.lineJoin = 'round';

    function getPos(e) {
      const r = ctSignCanvas.getBoundingClientRect();
      const scaleX = ctSignCanvas.width / r.width;
      const scaleY = ctSignCanvas.height / r.height;
      const src = e.touches ? e.touches[0] : e;
      return { x: (src.clientX - r.left) * scaleX, y: (src.clientY - r.top) * scaleY };
    }
    ctSignCanvas.addEventListener('mousedown', e => {
      ctSigning = true;
      const p = getPos(e);
      ctSignCtx.beginPath(); ctSignCtx.moveTo(p.x, p.y);
      document.getElementById('ct-sign-placeholder').style.display = 'none';
    });
    ctSignCanvas.addEventListener('mousemove', e => {
      if (!ctSigning) return;
      const p = getPos(e); ctSignCtx.lineTo(p.x, p.y); ctSignCtx.stroke();
    });
    ctSignCanvas.addEventListener('mouseup', () => { ctSigning = false; });
    ctSignCanvas.addEventListener('mouseleave', () => { ctSigning = false; });
    ctSignCanvas.addEventListener('touchstart', e => {
      e.preventDefault(); ctSigning = true;
      const p = getPos(e); ctSignCtx.beginPath(); ctSignCtx.moveTo(p.x, p.y);
      document.getElementById('ct-sign-placeholder').style.display = 'none';
    }, { passive: false });
    ctSignCanvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!ctSigning) return;
      const p = getPos(e); ctSignCtx.lineTo(p.x, p.y); ctSignCtx.stroke();
    }, { passive: false });
    ctSignCanvas.addEventListener('touchend', () => { ctSigning = false; });
  }

  function clearCtSign() {
    if (ctSignCtx) ctSignCtx.clearRect(0, 0, ctSignCanvas.width, ctSignCanvas.height);
    document.getElementById('ct-sign-placeholder').style.display = '';
  }

  // 계약서 최종 저장
  async function submitContract() {
    // 서명 확인
    const blank = !ctSignCtx || isCanvasBlank(ctSignCanvas);
    if (blank) { showToast('서명을 해주세요.', 'error'); return; }

    const name   = document.getElementById('ct-name').value.trim();
    const phone  = document.getElementById('ct-phone').value.trim().replace(/-/g,'');
    const birth  = document.getElementById('ct-birth').value.trim();
    const gender = document.getElementById('ct-gender').value;
    const address= document.getElementById('ct-address').value.trim();
    const type   = document.getElementById('ct-type').value;
    const memo   = document.getElementById('ct-memo').value.trim();
    const pw     = hashPw(phone.slice(-4));

    // 프로그램별 데이터 수집
    const programs = {};
    ctSelectedProgs.forEach(prog => {
      programs[prog] = {
        startDate : document.getElementById('ct-' + prog + '-start')?.value || '',
        months    : parseInt(document.getElementById('ct-' + prog + '-months')?.value) || 0,
        count     : parseInt(document.getElementById('ct-' + prog + '-count')?.value) || 0,
        extraNum  : parseInt(document.getElementById('ct-' + prog + '-extra-num')?.value) || 0,
        extraUnit : document.getElementById('ct-' + prog + '-extra-unit')?.value || '개월',
        endDate   : document.getElementById('ct-' + prog + '-end')?.value || '',
        price     : parseInt(document.getElementById('ct-' + prog + '-price')?.value) || 0,
        cash      : parseInt(document.getElementById('ct-' + prog + '-cash')?.value) || 0,
        card      : parseInt(document.getElementById('ct-' + prog + '-card')?.value) || 0,
        transfer  : parseInt(document.getElementById('ct-' + prog + '-transfer')?.value) || 0,
      };
    });

    // 부가서비스
    const extras = {};
    if (document.getElementById('ct-cloth-check')?.checked) {
      extras.cloth = {
        months  : parseInt(document.getElementById('ct-cloth-months')?.value)   || 0,
        price   : parseInt(document.getElementById('ct-cloth-price')?.value)    || 0,
        cash    : parseInt(document.getElementById('ct-cloth-cash')?.value)     || 0,
        card    : parseInt(document.getElementById('ct-cloth-card')?.value)     || 0,
        transfer: parseInt(document.getElementById('ct-cloth-transfer')?.value) || 0,
      };
    }
    if (document.getElementById('ct-locker-check')?.checked) {
      extras.locker = {
        months  : parseInt(document.getElementById('ct-locker-months')?.value)   || 0,
        price   : parseInt(document.getElementById('ct-locker-price')?.value)    || 0,
        cash    : parseInt(document.getElementById('ct-locker-cash')?.value)     || 0,
        card    : parseInt(document.getElementById('ct-locker-card')?.value)     || 0,
        transfer: parseInt(document.getElementById('ct-locker-transfer')?.value) || 0,
      };
    }

    const now = new Date();
    const signDate = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

    showToast('저장 중...', 'info');

    try {
      // 1. 계정 생성 (신규면 새로 생성, 재등록이면 업데이트)
      const memberSnap = await db.ref('members/' + phone).once('value');
      const isNew = !memberSnap.exists();

      const memberData = {
        name   : name + '(' + phone.slice(-4) + ')',
        pw     : pw,
        programs: ctSelectedProgs,
      };
      if (birth)   memberData.birth   = birth;
      if (address) memberData.address = address;
      memberData['body/gender'] = gender;

      await db.ref('members/' + phone).update(memberData);

      // 2-a. 프로필 사진 업로드
      const photoUrl = await uploadCtPhoto(phone);
      if (photoUrl) await db.ref('members/' + phone + '/photoUrl').set(photoUrl);

      // 2. 서명 이미지 Firebase Storage 저장
      let signUrl = '';
      try {
        const signBlob = await new Promise(res => ctSignCanvas.toBlob(res, 'image/png'));
        const storageRef = firebase.storage().ref('contracts/' + phone + '/' + signDate + '.png');
        await storageRef.put(signBlob);
        signUrl = await storageRef.getDownloadURL();
      } catch(e) { console.warn('서명 이미지 저장 실패:', e); }

      // 3. 계약서 Firebase 저장
      const contractData = {
        name, phone, birth, gender, address, type, memo,
        programs, extras,
        signDate, signUrl,
        createdAt: Date.now(),
        registeredBy: localStorage.getItem('current_user') || 'admin',
      };
      const contractKey = signDate + '_' + Date.now();
      await db.ref('contracts/' + phone + '/' + contractKey).set(contractData);

      // 4. 완료 화면
      const totalPaid = Object.values(programs).reduce((s,p) => s + (p.cash||0) + (p.card||0) + (p.transfer||0), 0);
      const totalAmt  = Object.values(programs).reduce((s,p) => s + (p.price||0), 0);
      const extrasAmt = Object.values(extras).reduce((s,e) => s + (e.price||0), 0);
      const grandTotal = totalAmt + extrasAmt;
      const grandPaid  = totalPaid + Object.values(extras).reduce((s,e) => s + (e.cash||0) + (e.card||0) + (e.transfer||0), 0);
      const grandUnpaid = grandTotal - grandPaid;
      const allCash     = Object.values(programs).reduce((s,p)=>s+(p.cash||0),0) + Object.values(extras).reduce((s,e)=>s+(e.cash||0),0);
      const allCard     = Object.values(programs).reduce((s,p)=>s+(p.card||0),0) + Object.values(extras).reduce((s,e)=>s+(e.card||0),0);
      const allTransfer = Object.values(programs).reduce((s,p)=>s+(p.transfer||0),0) + Object.values(extras).reduce((s,e)=>s+(e.transfer||0),0);

      const progLabelsComplete = {
        '헬스':'🏋️ 헬스', 'GX':'🎶 GX', 'PT':'💪 PT',
        '기구필라테스개인':'🧘 기구필라테스 개인', '기구필라테스그룹':'👥 기구필라테스 그룹'
      };

      document.getElementById('ct-complete-msg').textContent =
        isNew ? name + ' 회원 계정이 생성됐어요. (아이디: ' + phone + ' / 초기비번: ' + phone.slice(-4) + ')'
              : name + ' 회원 재등록이 완료됐어요.';

      let summaryHtml = `
        <div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border);">
          <div style="display:flex;gap:16px;flex-wrap:wrap;">
            <div><span style="font-size:12px;color:var(--text-sub);">이름</span><br><strong>${name}</strong></div>
            <div><span style="font-size:12px;color:var(--text-sub);">연락처</span><br><strong>${phone}</strong></div>
            <div><span style="font-size:12px;color:var(--text-sub);">신청일</span><br><strong>${signDate}</strong></div>
            <div><span style="font-size:12px;color:var(--text-sub);">구분</span><br><strong>${type === 're' ? '재등록' : '신규'}</strong></div>
          </div>
        </div>`;

      // 프로그램별
      Object.entries(programs).forEach(([prog, p]) => {
        const progPaid   = (p.cash||0) + (p.card||0) + (p.transfer||0);
        const progUnpaid = (p.price||0) - progPaid;
        summaryHtml += `
          <div style="margin-bottom:8px;padding:8px 10px;background:var(--bg);border-radius:6px;border-left:3px solid #1a6fd4;">
            <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">${progLabelsComplete[prog] || prog}</div>
            <div style="font-size:12px;color:var(--text-sub);line-height:1.7;">
              ${p.months ? p.months + '개월' : ''}${p.count ? ' · ' + p.count + '회' : ''}
              ${p.endDate ? ' · 종료 ' + p.endDate : ''}
              ${p.price ? '<br>이용요금: ' + p.price.toLocaleString() + '원' : ''}
              ${p.cash ? '<br><span style="color:#059669;">현금: ' + p.cash.toLocaleString() + '원</span>' : ''}
              ${p.card ? '<br><span style="color:#1a6fd4;">카드: ' + p.card.toLocaleString() + '원</span>' : ''}
              ${p.transfer ? '<br><span style="color:#7c3aed;">계좌: ' + p.transfer.toLocaleString() + '원</span>' : ''}
              ${progUnpaid > 0 ? '<br><span style="color:#ef4444;font-weight:700;">미수금: ' + progUnpaid.toLocaleString() + '원</span>' : ''}
            </div>
          </div>`;
      });

      // 부가서비스
      if (extras.cloth) {
        const e = extras.cloth;
        const ePaid = (e.cash||0)+(e.card||0)+(e.transfer||0);
        summaryHtml += `
          <div style="margin-bottom:8px;padding:8px 10px;background:var(--bg);border-radius:6px;border-left:3px solid #059669;">
            <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">👕 운동복</div>
            <div style="font-size:12px;color:var(--text-sub);line-height:1.7;">
              ${e.months ? e.months + '개월' : ''}
              ${e.price === 0 ? ' · 무료' : (e.price ? '<br>이용요금: ' + e.price.toLocaleString() + '원' : '')}
              ${e.cash ? '<br><span style="color:#059669;">현금: ' + e.cash.toLocaleString() + '원</span>' : ''}
              ${e.card ? '<br><span style="color:#1a6fd4;">카드: ' + e.card.toLocaleString() + '원</span>' : ''}
              ${e.transfer ? '<br><span style="color:#7c3aed;">계좌: ' + e.transfer.toLocaleString() + '원</span>' : ''}
            </div>
          </div>`;
      }
      if (extras.locker) {
        const e = extras.locker;
        summaryHtml += `
          <div style="margin-bottom:8px;padding:8px 10px;background:var(--bg);border-radius:6px;border-left:3px solid #7c3aed;">
            <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">🔑 개인 락카</div>
            <div style="font-size:12px;color:var(--text-sub);line-height:1.7;">
              ${e.months ? e.months + '개월' : ''}
              ${e.price ? '<br>이용요금: ' + e.price.toLocaleString() + '원' : ''}
              ${e.cash ? '<br><span style="color:#059669;">현금: ' + e.cash.toLocaleString() + '원</span>' : ''}
              ${e.card ? '<br><span style="color:#1a6fd4;">카드: ' + e.card.toLocaleString() + '원</span>' : ''}
              ${e.transfer ? '<br><span style="color:#7c3aed;">계좌: ' + e.transfer.toLocaleString() + '원</span>' : ''}
            </div>
          </div>`;
      }

      // 최종 합계
      summaryHtml += `
        <div style="margin-top:8px;padding:10px;background:#f0f7ff;border:1.5px solid #bfdbfe;border-radius:6px;">
          ${allCash > 0 ? '<div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-size:12px;color:#059669;">현금 합계</span><span style="font-size:12px;font-weight:700;color:#059669;">' + allCash.toLocaleString() + '원</span></div>' : ''}
          ${allCard > 0 ? '<div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-size:12px;color:#1a6fd4;">카드 합계</span><span style="font-size:12px;font-weight:700;color:#1a6fd4;">' + allCard.toLocaleString() + '원</span></div>' : ''}
          ${allTransfer > 0 ? '<div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-size:12px;color:#7c3aed;">계좌 합계</span><span style="font-size:12px;font-weight:700;color:#7c3aed;">' + allTransfer.toLocaleString() + '원</span></div>' : ''}
          <div style="border-top:1px solid #bfdbfe;margin:6px 0;"></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-size:12px;color:var(--text-sub);">이용요금 합계</span><span style="font-size:13px;font-weight:700;color:var(--text);">${grandTotal.toLocaleString()}원</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-size:12px;color:var(--text-sub);">오늘 결제</span><span style="font-size:13px;font-weight:700;color:#1a6fd4;">${grandPaid.toLocaleString()}원</span></div>
          ${grandUnpaid > 0 ? '<div style="display:flex;justify-content:space-between;"><span style="font-size:12px;font-weight:700;color:#ef4444;">미수금</span><span style="font-size:13px;font-weight:700;color:#ef4444;">' + grandUnpaid.toLocaleString() + '원</span></div>' : ''}
        </div>`;

      document.getElementById('ct-complete-summary').innerHTML = summaryHtml;

      ctGoStep(5);
      showToast('✅ 계약서 저장 완료!', 'success');

      // 회원 목록 갱신
      if (typeof loadMembers === 'function') loadMembers();

    } catch(err) {
      showToast('저장 실패: ' + err.message, 'error');
    }
  }

  // 캔버스 비었는지 확인
  function isCanvasBlank(canvas) {
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return false;
    }
    return true;
  }

  // 계약서 초기화
  function resetContract() {
    ctSelectedProgs = [];
    ctExtraCount = {};
    // 프로그램 카드 초기화
    ['헬스','GX','PT','기구필라테스개인','기구필라테스그룹'].forEach(prog => {
      const chk  = document.getElementById('ct-chk-' + prog);
      const card = document.getElementById('ct-card-' + prog);
      const body = document.getElementById('ct-body-' + prog);
      const sum  = document.getElementById('ct-summary-' + prog);
      if (chk)  chk.checked = false;
      if (card) card.classList.remove('selected');
      if (body) { body.style.display = 'none'; body.innerHTML = ''; delete body.dataset.rendered; }
      if (sum)  { sum.textContent = '미선택'; sum.style.background = '#f1f5f9'; sum.style.color = 'var(--text-sub)'; }
    });
    ctGoStep(1);
    // 입력값 초기화
    ['ct-name','ct-phone','ct-birth','ct-address','ct-memo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    selectCtType('new');
    selectCtGender('male');
    // 사진 초기화
    ctPhotoBlob = null;
    if (ctWebcamStream) { ctWebcamStream.getTracks().forEach(t => t.stop()); ctWebcamStream = null; }
    const ctFileInput = document.getElementById('ct-photo-file');
    if (ctFileInput) ctFileInput.value = '';
    updateCtPhotoUI(false);
    document.querySelectorAll('.ct-prog-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('ct-prog-details').innerHTML = '';
    document.getElementById('ct-total-amt').textContent = '0원';
    document.getElementById('ct-paid-amt').textContent = '0원';
    ['ct-cloth-check','ct-locker-check'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = false;
    });
    ['ct-cloth-detail','ct-locker-detail'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // 부가서비스 입력값 초기화
    ['ct-cloth-months','ct-cloth-price','ct-cloth-cash','ct-cloth-card','ct-cloth-transfer',
     'ct-locker-months','ct-locker-price','ct-locker-cash','ct-locker-card','ct-locker-transfer'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['ct-cloth-summary','ct-locker-summary'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = '미선택'; el.style.color = 'var(--text-sub)'; }
    });
    ['ct-cloth-paid-display','ct-locker-paid-display'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '0원';
    });
    const breakdownEl = document.getElementById('ct-breakdown-list');
    if (breakdownEl) breakdownEl.innerHTML = '';
    const agreeEl = document.getElementById('ct-agree');
    if (agreeEl) agreeEl.checked = false;
    const agreeNext = document.getElementById('ct-agree-next');
    if (agreeNext) { agreeNext.style.opacity = '0.4'; agreeNext.style.pointerEvents = 'none'; }
    if (ctSignCanvas) { ctSignCanvas._ctInited = false; }
    clearCtSign();
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
      loadHomeNotices('trainer-notice-container');
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

  function openEditNoticeModal(key) {
    editNoticeKey = key;
    db.ref('notices/' + key).once('value').then(snap => {
      if (!snap.exists()) { showToast('공지를 찾을 수 없어요.', 'error'); return; }
      const n = snap.val();
      document.getElementById('edit-notice-title').value = n.title || '';
      document.getElementById('edit-notice-content').value = n.content || '';
      document.getElementById('edit-notice-modal').style.display = 'flex';
    }).catch(() => showToast('불러오기 실패', 'error'));
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
      loadHomeNotices('trainer-notice-container');
    }).catch(err => { showToast('수정 실패: ' + err.message, 'error'); });
  }

  function deleteNoticeFromEdit() {
    if (!editNoticeKey) return;
    showConfirm('이 공지를 삭제할까요?', () => {
      db.ref('notices/' + editNoticeKey).remove().then(() => {
        closeEditNoticeModal();
        loadNoticeListAdmin();
        loadHomeNotices();
        loadHomeNotices('trainer-notice-container');
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
            <button data-notice-key="${n.firebaseKey}" class="btn-sm notice-edit-btn" style="flex-shrink:0;background:var(--blue-light);color:var(--blue);border:none;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;">수정</button>
          </div>
        </div>`).join('');
      // 수정 버튼 이벤트 - data-key로 Firebase에서 직접 로딩
      el.querySelectorAll('.notice-edit-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          openEditNoticeModal(this.dataset.noticeKey);
        });
      });
    });
  }

  function loadHomeNotices(containerId) {
    db.ref('notices').once('value', snap => {
      const container = containerId
        ? document.getElementById(containerId)
        : document.getElementById('member-notice-container');
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
    // 검색창 초기화
    const searchEl = document.getElementById('trainee-list-search');
    if (searchEl) searchEl.value = '';
    db.ref('trainers/' + userId + '/trainees').once('value', snap => {
      const data = snap.val();
      const container = document.getElementById('trainee-list');
      if (!container) return;
      if (!data) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:14px;">담당 회원이 없어요<br/>회원 추가 버튼을 눌러주세요</div>';
        return;
      }
      const entries = Object.entries(data);

      // 모든 담당회원 이름을 members에서 실시간으로 읽기
      Promise.all(entries.map(([memberId]) =>
        db.ref('members/' + memberId + '/name').once('value').then(s => ({ memberId, name: s.val() }))
      )).then(nameResults => {
        const nameMap = {};
        nameResults.forEach(r => { if (r.name) nameMap[r.memberId] = r.name; });

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
        const calcRemain = Math.max(0, allRegs[idx].total - (totalSigns - prev));
        // Firebase remain 우선 (관리자 수정값 반영), 없으면 서명 기반 계산
        const remain = (info.remain !== undefined && info.remain !== null)
          ? info.remain
          : calcRemain;
        return { order: idx + 1, remain, type: info.type || '' };
      }

      // ended=true인 회원은 맨 뒤로, 나머지는 추가 순서 유지
      const withStatus = entries.map(([memberId, info]) => {
        const realName = nameMap[memberId] || info.name || memberId;
        const status = calcTraineeStatus(info);
        return { memberId, info, realName, status };
      });
      withStatus.sort((a, b) => {
        const aEnded = a.info.ended ? 1 : 0;
        const bEnded = b.info.ended ? 1 : 0;
        return aEnded - bEnded;
      });

      // 전체 회원 데이터 캐시 (검색용)
      window._traineeListData = withStatus;
      window._traineeListTrainerId = userId;

      function renderTraineeCards(list) {
        if (!list.length) {
          container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:14px;">검색 결과가 없어요</div>';
          return;
        }
        container.innerHTML = list.map(({ memberId, info, realName, status }) => {
          const subText = status.type
            ? `${status.type} · ${status.order}차 진행중 · 잔여 ${status.remain}회`
            : '수업 종류 미설정';
          const isEnded = info.ended === true;
          const isRereg = info.reregTarget === true;
          const avatarBg = isEnded ? 'var(--text-hint)' : 'var(--blue)';
          const endedBtnStyle = isEnded
            ? 'background:#fee2e2;color:#ef4444;border:1px solid #fca5a5;'
            : 'background:var(--bg);color:var(--text-sub);border:1px solid var(--border);';
          const reregBtnStyle = isRereg
            ? 'background:#dcfce7;color:#16a34a;border:1px solid #86efac;'
            : 'background:var(--bg);color:var(--text-sub);border:1px solid var(--border);';
          return `
          <div style="padding:12px 0;border-bottom:1px solid var(--border);">
            <div style="display:flex;align-items:center;gap:12px;cursor:pointer;"
              onclick="openTraineeDetail('${memberId}')"
              ontouchstart="this.style.background='var(--blue-light)'" ontouchend="this.style.background='transparent'">
              <div style="width:40px;height:40px;border-radius:50%;background:${avatarBg};color:white;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0;">
                ${realName[0]}
              </div>
              <div style="flex:1;">
                <div style="font-size:14px;font-weight:700;color:var(--text);">${realName}</div>
                <div style="font-size:12px;color:var(--text-sub);">${subText}</div>
              </div>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
            <div style="display:flex;gap:6px;margin-top:8px;padding-left:52px;">
              <button onclick="toggleTraineeEnded('${memberId}','${realName}',${isEnded})"
                style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;${endedBtnStyle}">
                ${isEnded ? '✓ 종료됨' : '종료'}
              </button>
              <button onclick="toggleTraineeRereg('${memberId}','${realName}',${isRereg})"
                style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;${reregBtnStyle}">
                ${isRereg ? '✓ 재등록대상' : '재등록대상'}
              </button>
            </div>
          </div>
        `}).join('');
      }

      renderTraineeCards(withStatus);

      // 검색 필터 함수
      window.filterTraineeList = function(query) {
        const q = query.trim().toLowerCase();
        if (!q) { renderTraineeCards(window._traineeListData); return; }
        const filtered = window._traineeListData.filter(({ realName, memberId }) => {
          const name = realName.toLowerCase();
          const last4 = memberId.slice(-4);
          return name.includes(q) || last4.includes(q);
        });
        renderTraineeCards(filtered);
      };

      }); // Promise.all 닫기
    });
  }

  // 종료 버튼 토글
  function toggleTraineeEnded(memberId, realName, isEnded) {
    const trainerId = window._traineeListTrainerId;
    if (!trainerId) return;
    if (isEnded) {
      showConfirm(realName + ' 회원의 종료를 취소할까요?', () => {
        db.ref('trainers/' + trainerId + '/trainees/' + memberId + '/ended').remove().then(() => {
          showToast('종료가 취소됐어요.', 'success');
          loadTrainerTab();
        });
      });
    } else {
      showConfirm(realName + ' 회원을 종료 처리할까요?\n목록 맨 아래로 이동됩니다.', () => {
        Promise.all([
          db.ref('trainers/' + trainerId + '/trainees/' + memberId + '/ended').set(true),
          db.ref('trainers/' + trainerId + '/trainees/' + memberId + '/reregTarget').remove()
        ]).then(() => {
          showToast('종료 처리됐어요.', 'success');
          loadTrainerTab();
        });
      });
    }
  }

  // 재등록대상 버튼 토글
  function toggleTraineeRereg(memberId, realName, isRereg) {
    const trainerId = window._traineeListTrainerId;
    if (!trainerId) return;
    if (isRereg) {
      showConfirm(realName + ' 회원의 재등록대상을 취소할까요?', () => {
        db.ref('trainers/' + trainerId + '/trainees/' + memberId + '/reregTarget').remove().then(() => {
          showToast('재등록대상이 취소됐어요.', 'success');
          loadTrainerTab();
        });
      });
    } else {
      showConfirm(realName + ' 회원을 재등록대상으로 지정할까요?', () => {
        db.ref('trainers/' + trainerId + '/trainees/' + memberId + '/reregTarget').set(true).then(() => {
          showToast('재등록대상으로 지정됐어요.', 'success');
          loadTrainerTab();
        });
      });
    }
  }
  window.toggleTraineeEnded = toggleTraineeEnded;
  window.toggleTraineeRereg = toggleTraineeRereg;

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
        db.ref('members/' + memberId + '/trainerId').set(trainerId);
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
      // members에서 최신 이름 실시간 읽기
      db.ref('members/' + memberId + '/name').once('value').then(nameSnap => {
        const realName = nameSnap.val() || info.name || memberId;
        document.getElementById('trainee-detail-name').textContent = realName;
        document.getElementById('trainee-card-name').textContent = realName;
      });
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
        const dateStrPad3 = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
        const updateObj3 = { remain: remain - 1 };
        if (remain - 1 === 0) updateObj3.expiredAt = dateStrPad3;
        ref.update(updateObj3).then(() => {
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
    ['record', 'sign', 'memo', 'log', 'routine'].forEach(t => {
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
      refreshTraineeView(currentTraineeId);
    } else if (tab === 'memo') {
      renderMemoInbodyTab('memo');
    } else if (tab === 'log') {
      renderLogTab();
    } else if (tab === 'routine') {
      renderTraineeRoutineTab();
    }
  }

  // ── 메모/인바디 서브탭 ──────────────────────────────────────
  function renderMemoInbodyTab(subTab) {
    const content = document.getElementById('trainee-tab-content');
    if (!content || !currentTraineeId) return;

    // 서브탭 헤더 렌더
    content.innerHTML = `
      <div style="display:flex;gap:0;border:1.5px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:12px;">
        <button id="sub-tab-memo" onclick="switchMemoInbodySub('memo')"
          style="flex:1;padding:8px;font-size:13px;font-weight:700;border:none;cursor:pointer;font-family:'Noto Sans KR',sans-serif;
          background:${subTab==='memo'?'var(--blue)':'var(--card)'};color:${subTab==='memo'?'white':'var(--text)'};">
          📝 메모
        </button>
        <button id="sub-tab-inbody" onclick="switchMemoInbodySub('inbody')"
          style="flex:1;padding:8px;font-size:13px;font-weight:700;border:none;cursor:pointer;font-family:'Noto Sans KR',sans-serif;
          background:${subTab==='inbody'?'var(--blue)':'var(--card)'};color:${subTab==='inbody'?'white':'var(--text)'};">
          📊 인바디
        </button>
      </div>
      <div id="memo-inbody-sub-content"></div>`;

    if (subTab === 'memo') {
      _renderMemoSub();
    } else {
      _renderInbodySub();
    }
  }

  function switchMemoInbodySub(subTab) {
    const memoBtn   = document.getElementById('sub-tab-memo');
    const inbodyBtn = document.getElementById('sub-tab-inbody');
    if (memoBtn && inbodyBtn) {
      memoBtn.style.background   = subTab === 'memo'   ? 'var(--blue)' : 'var(--card)';
      memoBtn.style.color        = subTab === 'memo'   ? 'white'       : 'var(--text)';
      inbodyBtn.style.background = subTab === 'inbody' ? 'var(--blue)' : 'var(--card)';
      inbodyBtn.style.color      = subTab === 'inbody' ? 'white'       : 'var(--text)';
    }
    if (subTab === 'memo') {
      _renderMemoSub();
    } else {
      _renderInbodySub();
    }
  }

  function _renderMemoSub() {
    const subContent = document.getElementById('memo-inbody-sub-content');
    if (!subContent) return;
    const trainerId = localStorage.getItem('current_user');
    db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/memo').once('value', snap => {
      const memo = snap.val() || '';
      subContent.innerHTML = `
        <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;">
          <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">📝 회원 메모</div>
          <textarea id="trainee-memo-input" placeholder="회원 특이사항, 주의사항 등을 기록해주세요"
            style="width:100%;box-sizing:border-box;padding:10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;resize:none;min-height:120px;background:var(--bg);color:var(--text);">${memo}</textarea>
          <button onclick="saveTraineeMemo()" style="width:100%;margin-top:8px;padding:12px;background:var(--blue);color:white;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">💾 메모 저장</button>
        </div>`;
    });
  }

  function _renderInbodySub() {
    const subContent = document.getElementById('memo-inbody-sub-content');
    if (!subContent) return;
    subContent.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:13px;">불러오는 중...</div>';

    db.ref('users/' + currentTraineeId + '/inbody').once('value').then(snap => {
      if (!snap.exists()) {
        subContent.innerHTML = `
          <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:28px 20px;text-align:center;">
            <div style="font-size:28px;margin-bottom:8px;">📊</div>
            <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px;">인바디 기록이 없어요</div>
            <div style="font-size:13px;color:var(--text-hint);">회원이 인바디 데이터를 입력하면 여기서 확인할 수 있어요</div>
          </div>`;
        return;
      }

      const list = Object.entries(snap.val()).sort((a, b) => b[0].localeCompare(a[0]));
      const latest = list[0][1];
      const prev   = list.length > 1 ? list[1][1] : null;

      // 회원 신체정보 불러와서 표준범위 계산
      db.ref('users/' + currentTraineeId + '/body').once('value').then(bodySnap => {
        const body    = bodySnap.val() || {};
        const gender  = body.gender || 'female';
        const age     = parseInt(body.age)      || 30;
        const height  = parseFloat(body.height) || 165;
        const bWeight = parseFloat(body.weight) || 60;
        const hM      = height / 100;

        const stdWeight  = hM * hM * (gender === 'male' ? 22 : 21);
        const weightMin  = parseFloat((stdWeight * 0.9).toFixed(1));
        const weightMax  = parseFloat((stdWeight * 1.1).toFixed(1));
        const muscleMin  = parseFloat((bWeight * (gender === 'male' ? 0.40 : 0.32)).toFixed(1));
        const muscleMax  = parseFloat((bWeight * (gender === 'male' ? 0.50 : 0.42)).toFixed(1));
        const fatMin2    = parseFloat((bWeight * (gender === 'male' ? 0.10 : 0.18)).toFixed(1));
        const fatMax2    = parseFloat((bWeight * (gender === 'male' ? 0.20 : 0.28)).toFixed(1));
        let fatRateMin, fatRateMax;
        if (gender === 'male') { fatRateMin = 10; fatRateMax = age >= 60 ? 25 : 20; }
        else { fatRateMin = 18; fatRateMax = age >= 60 ? 30 : 28; }
        const bmiMin = 18.5, bmiMax = 24.9;
        let bmrStd;
        if (gender === 'male') bmrStd = 88.4 + (13.4 * bWeight) + (4.8 * height) - (5.7 * age);
        else bmrStd = 447.6 + (9.2 * bWeight) + (3.1 * height) - (4.3 * age);
        const bmrMin = Math.round(bmrStd * 0.9);
        const bmrMax = Math.round(bmrStd * 1.1);

        function badge(val, min, max) {
          if (val === undefined || val === null) return '';
          if (val >= min && val <= max) return '<span style="font-size:10px;padding:2px 6px;background:#dcfce7;color:#15803d;border-radius:10px;font-weight:700;">✅ 표준</span>';
          return '<span style="font-size:10px;padding:2px 6px;background:#fee2e2;color:#b91c1c;border-radius:10px;font-weight:700;">⚠️ 주의</span>';
        }
        function chg(cur, prv, unit) {
          if (prv === undefined || prv === null || cur === undefined) return '';
          const d = parseFloat((cur - prv).toFixed(1));
          if (d > 0) return `<span style="font-size:10px;color:#ef4444;">▲${d}${unit}</span>`;
          if (d < 0) return `<span style="font-size:10px;color:#22c55e;">▼${Math.abs(d)}${unit}</span>`;
          return '<span style="font-size:10px;color:#94a3b8;">변화없음</span>';
        }
        function card(label, val, unit, min, max, chgVal, chgUnit, rangeLabel) {
          if (val === undefined || val === null) return '';
          const unitHtml = unit === 'kg/m²'
            ? `<span style="font-size:10px;color:var(--text-hint);font-weight:400;">kg/m<sup>2</sup></span>`
            : `<span style="font-size:10px;color:var(--text-hint);font-weight:400;">${unit}</span>`;
          return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span style="font-size:11px;color:var(--text-hint);">${label}</span>${badge(val,min,max)}
            </div>
            <div style="font-size:17px;font-weight:700;color:var(--text);">${val}${unitHtml}</div>
            ${chg(val, chgVal, chgUnit)}
            <div style="font-size:10px;color:var(--text-hint);margin-top:2px;">표준 ${rangeLabel}</div>
          </div>`;
        }

        let cards = '';
        cards += card('체중',      latest.weight,  'kg',    weightMin,  weightMax,  prev?.weight,  'kg',  `${weightMin}~${weightMax}kg`);
        cards += card('골격근량',  latest.muscle,  'kg',    muscleMin,  muscleMax,  prev?.muscle,  'kg',  `${muscleMin}~${muscleMax}kg`);
        cards += card('체지방량',  latest.fat,     'kg',    fatMin2,    fatMax2,    prev?.fat,     'kg',  `${fatMin2}~${fatMax2}kg`);
        cards += card('체지방률',  latest.fatRate, '%',     fatRateMin, fatRateMax, prev?.fatRate, '%',   `${fatRateMin}~${fatRateMax}%`);
        cards += card('BMI',       latest.bmi,     'kg/m²', bmiMin,     bmiMax,     prev?.bmi,     '',    '18.5~24.9');
        cards += card('기초대사량',latest.bmr,     'kcal',  bmrMin,     bmrMax,     prev?.bmr,     'kcal',`${bmrMin}~${bmrMax}kcal`);

        let history = '';
        list.forEach(([date, d]) => {
          const parts = [];
          if (d.weight  !== undefined) parts.push(d.weight + 'kg');
          if (d.fat     !== undefined) parts.push('체지방' + d.fat + 'kg');
          if (d.fatRate !== undefined) parts.push('지방' + d.fatRate + '%');
          if (d.muscle  !== undefined) parts.push('근육' + d.muscle + 'kg');
          if (d.bmi     !== undefined) parts.push('BMI ' + d.bmi);
          if (d.bmr     !== undefined) parts.push('기초대사' + d.bmr + 'kcal');
          history += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px;">
            <span style="font-size:12px;color:var(--text-hint);">${date}</span>
            <span style="font-size:11px;color:var(--text);">${parts.join(' · ')}</span>
          </div>`;
        });

        subContent.innerHTML = `
          <div style="font-size:12px;color:var(--text-hint);margin-bottom:8px;">최근 측정: ${list[0][0]}</div>
          ${(latest.muscle !== undefined && latest.fat !== undefined) ? (() => {
            const h2 = height / 100;
            const stdW = h2 * h2 * (gender === 'male' ? 22 : 21);
            const stdMuscle = stdW * (gender === 'male' ? 0.45 : 0.37);
            const stdFat    = stdW * (gender === 'male' ? 0.15 : 0.23);
            const sc = Math.min(100, Math.max(0, Math.round(80 + (latest.muscle - stdMuscle) * 1.0 - (latest.fat - stdFat) * 1.3)));
            const color = sc >= 90 ? '#16a34a' : sc >= 80 ? '#2563eb' : sc >= 70 ? '#ca8a04' : sc >= 60 ? '#ea580c' : '#dc2626';
            const label = sc >= 90 ? '💚 매우강함' : sc >= 80 ? '🔵 강함' : sc >= 70 ? '🟡 보통' : sc >= 60 ? '🟠 약함' : '🔴 매우약함';
            const filled = (sc / 100) * 226;
            return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:12px;display:flex;align-items:center;gap:12px;">
              <svg width="70" height="70" viewBox="0 0 90 90" style="flex-shrink:0;">
                <circle cx="45" cy="45" r="36" fill="none" stroke="#f1f5f9" stroke-width="7"/>
                <circle cx="45" cy="45" r="36" fill="none" stroke="${color}" stroke-width="7"
                  stroke-dasharray="${filled} 226" stroke-dashoffset="56" stroke-linecap="round"/>
                <text x="45" y="41" text-anchor="middle" font-size="20" font-weight="700" fill="${color}">${sc}</text>
                <text x="45" y="54" text-anchor="middle" font-size="9" fill="#94a3b8">/ 100</text>
              </svg>
              <div>
                <div style="font-size:11px;color:var(--text-hint);margin-bottom:4px;">💪 신체발달점수</div>
                <div style="font-size:16px;font-weight:700;color:${color};">${label}</div>
                <div style="font-size:11px;color:var(--text-hint);margin-top:4px;">근육 ${(latest.muscle - stdMuscle > 0 ? '+' : '')}${(latest.muscle - stdMuscle).toFixed(1)}kg / 체지방 ${(latest.fat - stdFat > 0 ? '+' : '')}${(latest.fat - stdFat).toFixed(1)}kg</div>
              </div>
            </div>`;
          })() : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">${cards || '<div style="grid-column:1/-1;text-align:center;color:var(--text-hint);font-size:13px;">수치 데이터가 없어요</div>'}</div>
          <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">측정 이력</div>
          ${history}
          <div style="font-size:11px;color:var(--text-hint);text-align:center;margin-top:8px;">회원 본인만 데이터를 입력/수정할 수 있어요</div>`;
      });
    });
  }
  // ── 메모/인바디 서브탭 끝 ──────────────────────────────────

  // ── 강사 루틴 지정 탭 ──────────────────────────────────────
  let traineeRoutineEditId = null;

  function renderTraineeRoutineTab() {
    const content = document.getElementById('trainee-tab-content');
    if (!content || !currentTraineeId) return;
    const trainerId = localStorage.getItem('current_user');
    content.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-hint);font-size:13px;">불러오는 중...</div>';

    Promise.all([
      db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/assignedRoutines').once('value'),
      db.ref('members/' + currentTraineeId + '/name').once('value')
    ]).then(([snap, nameSnap]) => {
      const data = snap.val();
      const memberName = nameSnap.val() || currentTraineeId;

      let html = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div style="font-size:13px;color:var(--text-hint);"><b style="color:var(--text);">${escapeHtml(memberName)}</b> 회원 전용 루틴</div>
          <button onclick="openTraineeRoutineCreate()" style="background:#7c3aed;border:none;border-radius:8px;padding:7px 14px;color:white;font-size:13px;font-weight:700;font-family:'Noto Sans KR',sans-serif;cursor:pointer;">+ 새 루틴 만들기</button>
        </div>`;

      if (!data) {
        html += `
          <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:28px 20px;text-align:center;">
            <div style="font-size:28px;margin-bottom:8px;">📋</div>
            <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px;">지정된 루틴이 없어요</div>
            <div style="font-size:13px;color:var(--text-hint);">새 루틴 만들기로 회원 전용 루틴을 만들어 주세요</div>
          </div>`;
        content.innerHTML = html;
        return;
      }

      const list = Object.entries(data).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
      list.forEach(([id, r]) => {
        const exNames = (r.exercises || []).map(e => e.name).join(' · ');
        const count = (r.exercises || []).length;
        html += `
          <div style="background:var(--card);border:1.5px solid #c4b5fd;border-radius:var(--radius);padding:14px 16px;margin-bottom:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
              <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;">
                <div style="font-size:15px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.name)}</div>
                <span style="background:#ede9fe;color:#5b21b6;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;white-space:nowrap;">👨‍🏫 지정됨</span>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;">
                <button onclick="openTraineeRoutineEdit('${id}')" style="background:#f3f4f6;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:700;color:var(--text-sub);cursor:pointer;font-family:'Noto Sans KR',sans-serif;">수정</button>
                <button onclick="deleteTraineeRoutine('${id}')" style="background:#fee2e2;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:700;color:#ef4444;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">삭제</button>
              </div>
            </div>
            <div style="font-size:11px;color:var(--text-hint);">${count}가지 운동 · ${escapeHtml(exNames)}</div>
          </div>`;
      });

      content.innerHTML = html;
    });
  }

  function openTraineeRoutineCreate() {
    traineeRoutineEditId = null;
    document.getElementById('tr-routine-create-title').textContent = '회원 루틴 만들기';
    document.getElementById('tr-routine-edit-id').value = '';
    document.getElementById('tr-routine-name-input').value = '';
    document.getElementById('tr-routine-exercise-list').innerHTML = '';
    document.getElementById('tr-routine-ex-search-input').value = '';
    document.getElementById('tr-routine-ex-search-results').innerHTML = '';
    ['하체','가슴','등','어깨','팔','코어','기구'].forEach(c => {
      const btn = document.getElementById('trcat-' + c);
      if (!btn) return;
      btn.style.background = 'var(--bg)';
      btn.style.color = 'var(--text-sub)';
      btn.style.borderColor = 'var(--border)';
    });
    showScreen('screen-trainee-routine-create');
  }

  function openTraineeRoutineEdit(routineId) {
    const trainerId = localStorage.getItem('current_user');
    db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/assignedRoutines/' + routineId).once('value', snap => {
      const r = snap.val();
      if (!r) return;
      traineeRoutineEditId = routineId;
      document.getElementById('tr-routine-create-title').textContent = '루틴 수정';
      document.getElementById('tr-routine-edit-id').value = routineId;
      document.getElementById('tr-routine-name-input').value = r.name || '';
      document.getElementById('tr-routine-ex-search-input').value = '';
      document.getElementById('tr-routine-ex-search-results').innerHTML = '';
      ['하체','가슴','등','어깨','팔','코어','기구'].forEach(c => {
        const btn = document.getElementById('trcat-' + c);
        if (!btn) return;
        btn.style.background = 'var(--bg)';
        btn.style.color = 'var(--text-sub)';
        btn.style.borderColor = 'var(--border)';
      });
      renderTRexList(r.exercises || []);
      showScreen('screen-trainee-routine-create');
    });
  }

  function closeTraineeRoutineCreate() {
    showScreen('screen-trainee-detail');
    switchTraineeTab('routine');
  }

  function renderTRexList(exercises) {
    const container = document.getElementById('tr-routine-exercise-list');
    if (!exercises || exercises.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = exercises.map((ex, i) => `
      <div id="tr-create-item-${i}"
        ${ex.isDualFront ? 'data-is-dual-front="true"' : ''}
        ${ex.isDualBack ? 'data-is-dual-back="true"' : ''}
        ${ex.eqKey ? 'data-eq-key="' + ex.eqKey + '"' : ''}
        style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:6px;">
          <div style="display:flex;flex-direction:column;gap:3px;flex-shrink:0;">
            <button onclick="moveTRexItem(${i},\'up\')" ${i===0?'disabled':''} style="background:${i===0?'var(--border)':'#ede9fe'};border:none;border-radius:5px;width:24px;height:22px;cursor:${i===0?'default':'pointer'};color:${i===0?'var(--text-hint)':'#7c3aed'};font-size:12px;display:flex;align-items:center;justify-content:center;padding:0;">▲</button>
            <button onclick="moveTRexItem(${i},\'down\')" ${i===exercises.length-1?'disabled':''} style="background:${i===exercises.length-1?'var(--border)':'#ede9fe'};border:none;border-radius:5px;width:24px;height:22px;cursor:${i===exercises.length-1?'default':'pointer'};color:${i===exercises.length-1?'var(--text-hint)':'#7c3aed'};font-size:12px;display:flex;align-items:center;justify-content:center;padding:0;">▼</button>
          </div>
          <div style="font-size:14px;font-weight:700;color:var(--text);flex:1;">${i+1}. ${escapeHtml(ex.name)}</div>
          <button onclick="removeTRexItem(${i})" style="background:#fee2e2;border:none;border-radius:6px;padding:4px 8px;font-size:11px;color:#ef4444;cursor:pointer;font-family:\'Noto Sans KR\',sans-serif;flex-shrink:0;">삭제</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
          <div style="text-align:center;">
            <div style="font-size:10px;color:var(--text-hint);margin-bottom:3px;">세트</div>
            <input type="number" min="1" max="20" value="${ex.sets||3}" id="trc-sets-${i}"
              style="width:100%;box-sizing:border-box;padding:7px 4px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-weight:700;text-align:center;color:var(--text);outline:none;font-family:\'Noto Sans KR\',sans-serif;background:var(--bg);"
              onfocus="this.style.borderColor=\'#7c3aed\'" onblur="this.style.borderColor=\'var(--border)\'"/>
          </div>
          <div style="text-align:center;">
            <div style="font-size:10px;color:var(--text-hint);margin-bottom:3px;">기본 무게(kg)</div>
            <input type="number" min="0" max="500" step="2.5" value="${ex.weight||0}" id="trc-weight-${i}"
              style="width:100%;box-sizing:border-box;padding:7px 4px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-weight:700;text-align:center;color:var(--text);outline:none;font-family:\'Noto Sans KR\',sans-serif;background:var(--bg);"
              onfocus="this.style.borderColor=\'#7c3aed\'" onblur="this.style.borderColor=\'var(--border)\'"/>
          </div>
          <div style="text-align:center;">
            <div style="font-size:10px;color:var(--text-hint);margin-bottom:3px;">기본 횟수</div>
            <input type="number" min="1" max="999" value="${ex.reps||10}" id="trc-reps-${i}"
              style="width:100%;box-sizing:border-box;padding:7px 4px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-weight:700;text-align:center;color:var(--text);outline:none;font-family:\'Noto Sans KR\',sans-serif;background:var(--bg);"
              onfocus="this.style.borderColor=\'#7c3aed\'" onblur="this.style.borderColor=\'var(--border)\'"/>
          </div>
        </div>
      </div>`).join('');
  }

  function collectTRexItems() {
    const container = document.getElementById('tr-routine-exercise-list');
    const items = container.querySelectorAll('[id^="tr-create-item-"]');
    const exercises = [];
    items.forEach((item, i) => {
      const nameEl = item.querySelector('div[style*="font-weight:700"]');
      const name = nameEl ? nameEl.textContent.replace(/^\d+\.\s*/, '').trim() : '';
      const sets = parseInt(document.getElementById('trc-sets-' + i)?.value) || 3;
      const weight = parseFloat(document.getElementById('trc-weight-' + i)?.value) || 0;
      const reps = parseInt(document.getElementById('trc-reps-' + i)?.value) || 10;
      if (!name) return;
      const ex = { name, sets, weight, reps };
      if (item.dataset.isDualFront) ex.isDualFront = true;
      if (item.dataset.isDualBack) ex.isDualBack = true;
      if (item.dataset.eqKey) ex.eqKey = item.dataset.eqKey;
      exercises.push(ex);
    });
    return exercises;
  }

  function moveTRexItem(idx, dir) {
    const exercises = collectTRexItems();
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= exercises.length) return;
    [exercises[idx], exercises[target]] = [exercises[target], exercises[idx]];
    renderTRexList(exercises);
  }

  function removeTRexItem(idx) {
    const exercises = collectTRexItems().filter((_, i) => i !== idx);
    renderTRexList(exercises);
  }

  function selectTRCategory(cat) {
    const active = document.getElementById('trcat-' + cat);
    const isActive = active && active.dataset.active === 'true';
    ['하체','가슴','등','어깨','팔','코어','기구'].forEach(c => {
      const btn = document.getElementById('trcat-' + c);
      if (!btn) return;
      btn.style.background = 'var(--bg)';
      btn.style.color = 'var(--text-sub)';
      btn.style.borderColor = 'var(--border)';
      btn.dataset.active = 'false';
    });
    const results = document.getElementById('tr-routine-ex-search-results');
    if (isActive) { if (results) results.innerHTML = ''; return; }
    if (active) { active.style.background = '#7c3aed'; active.style.color = 'white'; active.style.borderColor = '#7c3aed'; active.dataset.active = 'true'; }
    const input = document.getElementById('tr-routine-ex-search-input');
    if (input) input.value = '';
    const existing = collectTRexItems().map(e => e.name);
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
    if (items.length === 0) { results.innerHTML = '<div style="padding:12px 14px;font-size:13px;color:var(--text-hint);">운동이 없어요</div>'; return; }
    results.innerHTML = items.map(e => {
      const isAdded = existing.includes(e.name);
      const badgeStyle = e.type === 'fw' ? 'background:#ede9fe;color:#5b21b6;' : 'background:#dbeafe;color:#1e40af;';
      const badgeText = e.type === 'fw' ? '프리' : '기구';
      return '<div onclick="addTRexercise(\'' + e.name.replace(/'/g,"\\'") + '\')"'
        + ' id="trcat-item-' + e.name.replace(/\s/g,'_') + '"'
        + ' style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);' + (isAdded?'background:#f3e8ff;':'') + '"'
        + ' onmouseover="this.style.background=\'#f3e8ff\'"'
        + ' onmouseout="this.style.background=\'' + (isAdded?'#f3e8ff':'') + '\'">'
        + '<div style="display:flex;align-items:center;gap:5px;min-width:0;">'
        + (isAdded ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>')
        + '<span style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + e.name + '</span>'
        + '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;flex-shrink:0;' + badgeStyle + '">' + badgeText + '</span>'
        + '</div>'
        + '<span style="font-size:11px;color:var(--text-hint);background:var(--bg);padding:2px 8px;border-radius:10px;flex-shrink:0;">' + e.tag + '</span>'
        + '</div>';
    }).join('');
  }

  function searchTRexercise(q) {
    const results = document.getElementById('tr-routine-ex-search-results');
    if (!q.trim()) { results.innerHTML = ''; return; }
    const ql = q.toLowerCase();
    const fwItems = FW_EXERCISE_LIST.filter(e =>
      e.name.toLowerCase().includes(ql) || e.muscles.toLowerCase().includes(ql) || e.category.toLowerCase().includes(ql)
    ).map(e => ({ name: e.name, tag: e.muscles || e.category, type: 'fw' }));
    const eqItems = (typeof EQUIPMENT_LIST !== 'undefined' ? EQUIPMENT_LIST : [])
      .filter(e => e.name.toLowerCase().includes(ql) || matchesMuscle(e.muscles, q.trim()) || String(e.no) === q.trim())
      .map(e => ({ name: e.name, tag: e.muscles || '기구', type: 'eq' }));
    const combined = [...fwItems, ...eqItems];
    if (combined.length === 0) { results.innerHTML = '<div style="padding:10px 14px;font-size:13px;color:var(--text-hint);">검색 결과가 없어요</div>'; return; }
    const existing = collectTRexItems().map(e => e.name);
    results.innerHTML = combined.slice(0, 20).map(e => {
      const isAdded = existing.includes(e.name);
      const badgeStyle = e.type === 'fw' ? 'background:#ede9fe;color:#5b21b6;' : 'background:#dbeafe;color:#1e40af;';
      return '<div onclick="addTRexercise(\'' + e.name.replace(/'/g,"\\'") + '\')"'
        + ' style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);' + (isAdded?'background:#f3e8ff;':'') + '"'
        + ' onmouseover="this.style.background=\'#f3e8ff\'"'
        + ' onmouseout="this.style.background=\'' + (isAdded?'#f3e8ff':'') + '\'">'
        + '<div style="display:flex;align-items:center;gap:5px;">'
        + (isAdded ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>')
        + '<span style="font-size:13px;color:var(--text);">' + e.name + '</span>'
        + '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;' + badgeStyle + '">' + (e.type==='fw'?'프리':'기구') + '</span>'
        + '</div>'
        + '<span style="font-size:11px;color:var(--text-hint);">' + e.tag + '</span>'
        + '</div>';
    }).join('');
  }

  function addTRexercise(name) {
    const existing = collectTRexItems();
    const eqMatch = (typeof EQUIPMENT_LIST !== 'undefined' ? EQUIPMENT_LIST : []).find(e => e.name === name);
    // 케이블 머신 → 선택 모달 표시
    if (eqMatch && eqMatch.key === 'cable_machine') {
      if (typeof openCableSelectModal === 'function') openCableSelectModal('tr');
      return;
    }
    if (eqMatch && typeof isDualEquipment === 'function' && isDualEquipment(eqMatch.key)) {
      const info = getDualNames(eqMatch.key);
      const frontName = info.front + ' (' + eqMatch.name + ')';
      const backName = info.back + ' (' + eqMatch.name + ')';
      if (existing.find(e => e.name === frontName)) {
        renderTRexList(existing.filter(e => e.name !== frontName && e.name !== backName));
      } else {
        existing.push({ name: frontName, sets: 3, weight: 0, reps: 10, isDualFront: true, eqKey: eqMatch.key });
        existing.push({ name: backName, sets: 3, weight: 0, reps: 10, isDualBack: true, eqKey: eqMatch.key });
        renderTRexList(existing);
      }
    } else {
      if (existing.find(e => e.name === name)) {
        renderTRexList(existing.filter(e => e.name !== name));
      } else {
        existing.push({ name, sets: 3, weight: 0, reps: 10 });
        renderTRexList(existing);
      }
    }
    const activeCat = ['하체','가슴','등','어깨','팔','코어','기구'].find(c => {
      const btn = document.getElementById('trcat-' + c);
      return btn && btn.style.background === 'rgb(124, 58, 237)';
    });
    if (activeCat) selectTRCategory(activeCat);
    const searchVal = document.getElementById('tr-routine-ex-search-input')?.value;
    if (searchVal && searchVal.trim()) searchTRexercise(searchVal);
  }

  function addTRcableExercises(selected) {
    const existing = collectTRexItems();
    selected.forEach(ex => {
      if (!existing.find(e => e.name === ex.name)) {
        existing.push({ name: ex.name, sets: 3, weight: 0, reps: 10, isCableEx: true, cableKey: ex.key });
      }
    });
    renderTRexList(existing);
  }

  function saveTraineeRoutine() {
    const trainerId = localStorage.getItem('current_user');
    const name = document.getElementById('tr-routine-name-input').value.trim();
    if (!name) { showToast('루틴 이름을 입력해주세요!', 'error'); return; }
    const exercises = collectTRexItems();
    if (exercises.length === 0) { showToast('운동을 1개 이상 추가해주세요!', 'error'); return; }

    const routineId = traineeRoutineEditId || ('tr_' + Date.now());
    const data = { name, exercises, updatedAt: Date.now(), assignedBy: trainerId };

    db.ref('members/' + trainerId + '/name').once('value', nameSnap => {
      const trainerName = nameSnap.val() || '강사';
      const memberData = Object.assign({}, data, { assignedByName: trainerName, assignedAt: data.updatedAt });
      const memberRoutineId = 'trainer_' + trainerId.slice(-4) + '_' + routineId;
      Promise.all([
        db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/assignedRoutines/' + routineId).set(data),
        db.ref('users/' + currentTraineeId + '/routines/' + memberRoutineId).set(memberData)
      ]).then(() => {
        showToast(traineeRoutineEditId ? '루틴이 수정됐어요! ✅' : '루틴이 만들어졌어요! 👨‍🏫', 'success');
        closeTraineeRoutineCreate();
      }).catch(() => showToast('저장 실패. 다시 시도해주세요.', 'error'));
    });
  }

  function deleteTraineeRoutine(routineId) {
    showConfirm('이 루틴을 삭제할까요?\n회원의 루틴 목록에서도 삭제됩니다.', () => {
      const trainerId = localStorage.getItem('current_user');
      const memberRoutineId = 'trainer_' + trainerId.slice(-4) + '_' + routineId;
      Promise.all([
        db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/assignedRoutines/' + routineId).remove(),
        db.ref('users/' + currentTraineeId + '/routines/' + memberRoutineId).remove()
      ]).then(() => {
        showToast('루틴이 삭제됐어요.', 'success');
        renderTraineeRoutineTab();
      });
    });
  }
  // ── 강사 루틴 지정 탭 끝 ──────────────────────────────────

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
        // date 필드로 정렬 (날짜 오래된 순), 같은 날짜면 savedAt 순
        signs.sort(function(a, b) {
          const dateA = a.date || '';
          const dateB = b.date || '';
          if (dateA !== dateB) {
            const toNum = d => { const p = d.split('-'); return parseInt(p[0])*10000 + parseInt(p[1])*100 + parseInt(p[2]); };
            return toNum(dateA) - toNum(dateB); // 오래된 순 (1회차부터)
          }
          return (a.savedAt || '') < (b.savedAt || '') ? -1 : 1;
        });
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
          groupSigns.slice().reverse().forEach(function(s, idx) {
            var realIdx = groupSigns.length - idx;
            html += '<div style="margin-bottom:' + (idx < groupSigns.length - 1 ? '10px' : '0') + ';padding-bottom:' + (idx < groupSigns.length - 1 ? '10px' : '0') + ';border-bottom:' + (idx < groupSigns.length - 1 ? '0.5px solid var(--border)' : 'none') + ';">';
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
      const remainUpdate = { remain: newRemain };
      // 잔여 복구 시 expiredAt도 제거
      if (remain === 0) remainUpdate.expiredAt = null;

      // 삭제할 서명의 날짜 가져오기
      db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/signs/' + editSignKey).once('value', signSnap => {
        const signData = signSnap.val();
        const signDate = signData ? signData.date : null;

        // 서명기록 삭제 + 잔여횟수 복구 동시 처리
        Promise.all([
          db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/signs/' + editSignKey).remove(),
          ref.update(remainUpdate)
        ]).then(() => {
          // 같은 날짜에 다른 서명이 없으면 lessons도 삭제
          if (signDate) {
            db.ref('trainers/' + trainerId + '/trainees/' + currentTraineeId + '/signs').once('value', allSignsSnap => {
              let hasOtherSignOnDate = false;
              allSignsSnap.forEach(s => {
                // 방금 삭제한 서명은 제외하고 확인
                if (s.key === editSignKey) return;
                const sv = s.val();
                if (sv && sv.date === signDate) hasOtherSignOnDate = true;
              });
              if (!hasOtherSignOnDate) {
                db.ref('users/' + currentTraineeId + '/lessons/' + signDate).remove();
              }
            });
          }
          showToast('삭제됐어요! 🗑', 'success');
          closeEditSignModal();
          refreshTraineeView(currentTraineeId);
          if (currentTraineeTab === 'record') renderTrainerCal();
        });
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
        // 회원 달력에 수업일 저장 (당일취소도 수업 진행된 것으로 처리)
        db.ref('users/' + signTargetMemberId + '/lessons/' + dateStr).set({
          date: dateStr,
          trainerId,
          trainerName: localStorage.getItem('name_' + trainerId) || '강사',
          savedAt,
          noShow: true
        });
        // remain 차감 후 카드 즉시 업데이트
        const ref2 = db.ref('trainers/' + trainerId + '/trainees/' + signTargetMemberId);
        ref2.once('value', snap => {
          const info = snap.val();
          const newRemain = (info && (info.remain || 0) > 0) ? (info.remain || 0) - 1 : 0;
          const updateData2 = { remain: newRemain };
          if (newRemain === 0) {
            const now2 = new Date();
            updateData2.expiredAt = now2.getFullYear() + '-' + (now2.getMonth()+1) + '-' + now2.getDate();
          }
          ref2.update(updateData2).then(() => {
            refreshTraineeView(signTargetMemberId);
            if (currentTraineeTab === 'record') renderTrainerCal();
          });
        });
        closeSignModal();
        showToast('당일취소 처리됐어요!', 'success');
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

        // remain 차감 후 카드 즉시 업데이트
        const ref2 = db.ref('trainers/' + trainerId + '/trainees/' + signTargetMemberId);
        ref2.once('value', snap => {
          const info = snap.val();
          const newRemain = (info && (info.remain || 0) > 0) ? (info.remain || 0) - 1 : 0;
          const updateData = { remain: newRemain };
          if (newRemain === 0) {
            const now = new Date();
            updateData.expiredAt = now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate();
          }
          ref2.update(updateData).then(() => {
            refreshTraineeView(signTargetMemberId);
            if (currentTraineeTab === 'record') renderTrainerCal();
          });
        });

        // PT 서명 포인트 적립
        db.ref('point_settings/ptSign').once('value', ptSnap => {
          const ptSignPts = ptSnap.val() || 0;
          if (ptSignPts > 0 && typeof addUserPoints === 'function') {
            addUserPoints(signTargetMemberId, ptSignPts, 'PT 수업');
          }
        });

        closeSignModal();
        showToast('✅ 서명 완료! 출석 체크됐어요.', 'success');
        // 관리자 모드 열려있으면 월별 리포트도 갱신
        const adminRptSection = document.getElementById('tab-trainer-admin');
        if (adminRptSection && adminRptSection.classList.contains('active')) {
          setTimeout(() => loadMonthlyReport(), 500);
        }
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
      // lessons(서명받은 날) → lessonDays (달력 표시용)
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

      // 총 수업 횟수 = 해당 월 서명 횟수 기준
      const trainerId2 = localStorage.getItem('current_user');
      db.ref('trainers/' + trainerId2 + '/trainees/' + traineeId + '/signs').once('value', signSnap => {
        let totalLessons = 0;
        if (signSnap.exists()) {
          signSnap.forEach(s => {
            const sd = s.val();
            if (sd && sd.date) {
              const parts = sd.date.split('-');
              if (parseInt(parts[0]) === year && parseInt(parts[1]) === month) {
                totalLessons++;
              }
            }
          });
        }
      const firstDay = new Date(year, month - 1, 1).getDay();
      const lastDate = new Date(year, month, 0).getDate();
      const today = new Date();
      const todayStr = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();

      let calHtml = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
          <div style="position:relative;">
            <input type="text" id="trainer-equipment-search"
              placeholder="기구명·번호·부위로 검색"
              style="width:100%;box-sizing:border-box;padding:10px 20px 10px 10px;border:1.5px dashed #1a6fd4;border-radius:var(--radius-sm);font-size:12px;font-family:'Noto Sans KR',sans-serif;outline:none;background:var(--card);color:var(--text);"
              onfocus="this.style.borderColor='#0f4fa8';showTrainerEqSearchResult(this.value,'${trainerCalSelectedDate||''}','${traineeId}')"
              onblur="this.style.borderColor='#1a6fd4'"
              oninput="showTrainerEqSearchResult(this.value,'${trainerCalSelectedDate||''}','${traineeId}')" />
            <button id="trainer-search-clear-btn" onclick="clearTrainerEqSearch()" style="display:none;position:absolute;right:4px;top:50%;transform:translateY(-50%);background:var(--text-hint);border:none;border-radius:50%;width:16px;height:16px;cursor:pointer;color:white;font-size:11px;line-height:1;padding:0;">×</button>
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
        <div id="trainer-cal-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">
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
                  ${hasTrainer ? `<div style="width:5px;height:5px;border-radius:50%;background:#f59e0b;"></div>` : ''}
                  ${hasPersonal ? `<div style="width:5px;height:5px;border-radius:50%;background:var(--blue);"></div>` : ''}
                </div>`
              : '<div style="width:5px;height:5px;margin:1px auto 0;"></div>';
            const dow = (firstDay + i) % 7;
            let bg = hasLesson ? '#16a34a' : isToday ? 'rgba(124,58,237,0.15)' : 'transparent';
            let color = hasLesson ? 'white' : isToday ? '#7c3aed' : dow===0 ? '#ef4444' : dow===6 ? '#3b82f6' : 'var(--text)';
            let fontW = (hasLesson || isToday || isSelected) ? '700' : '400';
            let border = isSelected ? '2px solid #1a1a2e' : 'none';
            return `<div onclick="selectTrainerCalDay('${dateStr}')" data-date="${dateStr}" data-lesson="${hasLesson?'1':'0'}" style="text-align:center;padding:6px 2px;border-radius:50%;cursor:pointer;background:${bg};border:${border};position:relative;">
              <div style="font-size:13px;font-weight:${fontW};color:${color};">${day}</div>
              ${dotHtml}
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:8px;border-top:0.5px solid var(--border);flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:4px;">
            <div style="width:10px;height:10px;border-radius:50%;background:#16a34a;"></div>
            <span style="font-size:11px;color:var(--text-hint);">수업한날</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <div style="width:7px;height:7px;border-radius:50%;background:#f59e0b;"></div>
            <span style="font-size:11px;color:var(--text-hint);">PT 기록</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <div style="width:7px;height:7px;border-radius:50%;background:var(--blue);"></div>
            <span style="font-size:11px;color:var(--text-hint);">회원개인운동</span>
          </div>
        </div>`;

      // trainer-day-detail은 항상 생성 (날짜 클릭 시 바로 표시 가능하도록)
      calHtml += `<div id="trainer-day-detail" style="margin-top:12px;"></div>`;

      content.innerHTML = calHtml;

      if (trainerCalSelectedDate) {
        const selParts = trainerCalSelectedDate.split('-');
        if (parseInt(selParts[0])===year && parseInt(selParts[1])===month) {
          renderTrainerDayDetail(trainerCalSelectedDate);
        }
      }
      }); // signs 조회 끝
    });
  }

  function selectTrainerCalDay(dateStr) {
    trainerCalSelectedDate = dateStr;
    // 날짜 클릭 시 달력 전체 재렌더링 없이 선택 표시만 업데이트 → 속도 개선
    _updateTrainerCalSelection();
    renderTrainerDayDetail(dateStr);
  }

  function _updateTrainerCalSelection() {
    // 달력 각 날짜 div의 border만 업데이트 (Firebase 조회 없음)
    const calGrid = document.getElementById('trainer-cal-grid');
    if (!calGrid) return;
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
    calGrid.querySelectorAll('[data-date]').forEach(el => {
      const d = el.getAttribute('data-date');
      const isSelected = d === trainerCalSelectedDate;
      const hasLesson = el.getAttribute('data-lesson') === '1';
      // 선택된 날짜는 초록색 원이든 아니든 검정 테두리 표시
      el.style.border = isSelected ? '2px solid #1a1a2e' : 'none';
    });
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
          const baseKey = rawKey.replace('dual_front_','').replace('dual_back_','').replace('fw_','').replace('cable_ex_','');
          const eq = EQUIPMENT_LIST.find(e => e.key === rawKey || e.key === baseKey);
          let name, subLabel = '';
          // 케이블 운동 이름 한국어로 변환
          if (rawKey.startsWith('cable_ex_')) {
            const cableKey = rawKey.replace('cable_ex_', '');
            const cableExList = typeof CABLE_EXERCISES !== 'undefined' ? CABLE_EXERCISES : [
              { key:'pushdown', name:'케이블 푸시다운' },
              { key:'row',      name:'케이블 로우' },
              { key:'fly',      name:'케이블 플라이' },
              { key:'curl',     name:'케이블 컬' },
              { key:'facepull', name:'케이블 페이스풀' },
              { key:'pulldown', name:'케이블 암 풀다운' }
            ];
            const cableEx = cableExList.find(e => e.key === cableKey);
            name = cableEx ? cableEx.name : (r.name || rawKey);
          } else if (rawKey.startsWith('dual_front_')) {
            // 듀얼기구 전면 - r.name보다 먼저 처리
            const dNames = getDualNames(baseKey);
            name = dNames ? dNames.front : (r.name || eq ? eq.name : baseKey);
          } else if (rawKey.startsWith('dual_back_')) {
            // 듀얼기구 후면 - r.name보다 먼저 처리
            const dNames = getDualNames(baseKey);
            name = dNames ? dNames.back : (r.name || eq ? eq.name : baseKey);
          } else if (r.name) {
            name = r.name;
          } else if (eq) {
            name = eq.name;
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

          // 케이블이면 케이블머신 번호 배지, 기구면 번호 배지, fw면 배지 없음
          const _isCableRaw = rawKey.startsWith('cable_ex_');
          const _isFwRaw = rawKey.startsWith('fw_');
          const _cableEq = _isCableRaw ? EQUIPMENT_LIST.find(e => e.key === 'cable_machine') : null;
          const _noLabel = _isCableRaw
            ? `<span style="font-size:10px;font-weight:700;color:white;background:#185FA5;padding:2px 5px;border-radius:4px;flex-shrink:0;">${_cableEq ? _cableEq.no : 32}번</span>`
            : (eq && !_isFwRaw ? `<span style="font-size:10px;font-weight:700;color:white;background:${getMuscleColor(eq.muscles)};padding:2px 5px;border-radius:4px;flex-shrink:0;">${eq.no}번</span>` : '');

          html += `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <div style="display:flex;align-items:center;gap:5px;">
                ${r.recordedBy === 'trainer'
                  ? `<span style="font-size:10px;font-weight:700;color:white;background:#f59e0b;padding:2px 5px;border-radius:4px;flex-shrink:0;">PT</span>`
                  : `<span style="font-size:10px;font-weight:700;color:white;background:#1a6fd4;padding:2px 5px;border-radius:4px;flex-shrink:0;">개인</span>`}
                ${_noLabel}
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
    if (tabId === 'coupon-list') { switchAdminCouponListTab('active'); }
    if (tabId === 'coupon-auto') loadAutoConditions();
    if (tabId === 'coupon-points') loadPointSettings();
    if (tabId === 'coupon-shop') loadPointShopItems();
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
      selectedCouponMembers = [];
      renderCouponMemberTags();
      loadAllMembersForSearch();
    }
  }

  let allMembersCache = [];
  let selectedCouponMembers = []; // 여러 명 선택용 배열

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
    document.getElementById('coupon-member-id').value = '';

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
    // 이미 선택된 회원이면 무시
    if (selectedCouponMembers.find(m => m.id === id)) {
      showToast('이미 선택된 회원이에요.', 'error');
      return;
    }
    selectedCouponMembers.push({ id, name });
    document.getElementById('coupon-member-search').value = '';
    document.getElementById('coupon-member-results').style.display = 'none';
    renderCouponMemberTags();
  }

  function removeCouponMember(id) {
    selectedCouponMembers = selectedCouponMembers.filter(m => m.id !== id);
    renderCouponMemberTags();
  }

  function renderCouponMemberTags() {
    const tagsEl = document.getElementById('coupon-member-tags');
    if (!tagsEl) return;
    if (selectedCouponMembers.length === 0) {
      tagsEl.style.display = 'none';
      tagsEl.innerHTML = '';
      return;
    }
    tagsEl.style.display = 'flex';
    tagsEl.innerHTML = selectedCouponMembers.map(m =>
      `<div style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;background:#EEEDFE;border-radius:20px;font-size:13px;color:#3C3489;font-weight:600;">
        ${m.name} <span style="font-size:11px;color:#7F77DD;">(${m.id})</span>
        <span onclick="removeCouponMember('${m.id}')" style="cursor:pointer;color:#7F77DD;font-size:15px;line-height:1;">×</span>
      </div>`
    ).join('');
  }

  function toggleCouponNoExpire(checked) {
    const expireEl = document.getElementById('coupon-expire');
    if (!expireEl) return;
    expireEl.disabled = checked;
    expireEl.style.opacity = checked ? '0.4' : '1';
    if (checked) expireEl.value = '';
  }

  function loadMemberSelectOptions() {
    loadAllMembersForSearch();
  }

  function issueCoupon() {
    const name   = document.getElementById('coupon-name').value.trim();
    const type   = document.getElementById('coupon-type').value;
    const value  = document.getElementById('coupon-value').value.trim();
    const noExpire = document.getElementById('coupon-no-expire')?.checked;
    const expire = noExpire ? null : document.getElementById('coupon-expire').value;
    const limit  = document.getElementById('coupon-limit').value;
    const target = document.getElementById('coupon-target').value;
    const memo   = document.getElementById('coupon-memo').value.trim();

    if (!name)  { showToast('쿠폰 이름을 입력해주세요.', 'error'); return; }
    if (!value) { showToast('쿠폰 값을 입력해주세요.', 'error'); return; }
    if (!noExpire && !expire) { showToast('유효기간을 설정하거나 기한 없음을 체크해주세요.', 'error'); return; }

    const couponData = {
      name, type, value, limit, memo,
      issuedAt: new Date().toISOString(),
      used: false
    };
    if (expire) couponData.expire = expire;

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
          if (typeof sendPushToAll === 'function') {
            sendPushToAll('🎟️ 쿠폰 도착!', '"' + name + '" 쿠폰이 도착했어요 🎫', 'coupon', { type: 'coupon' });
          }
        });
      });
    } else {
      if (selectedCouponMembers.length === 0) { showToast('회원을 한 명 이상 선택해주세요.', 'error'); return; }
      const updates = {};
      selectedCouponMembers.forEach(m => {
        const couponId = db.ref('coupons/' + m.id).push().key;
        updates['coupons/' + m.id + '/' + couponId] = couponData;
      });
      db.ref().update(updates).then(() => {
        showToast(selectedCouponMembers.length + '명에게 쿠폰이 발행됐어요! 🎫', 'success');
        // 각 회원에게 푸시알림
        selectedCouponMembers.forEach(m => {
          if (typeof sendPushToUser === 'function') {
            sendPushToUser(m.id, '🎟️ 쿠폰 도착!', '"' + name + '" 쿠폰이 도착했어요 🎫', 'coupon', { type: 'coupon' });
          }
        });
        clearCouponForm();
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
    const noExpireEl = document.getElementById('coupon-no-expire');
    if (noExpireEl) { noExpireEl.checked = false; document.getElementById('coupon-expire').disabled = false; }
    selectedCouponMembers = [];
    renderCouponMemberTags();
  }

  function switchAdminCouponListTab(tab) {
    const activeBtn = document.getElementById('admin-coupon-tab-active');
    const usedBtn = document.getElementById('admin-coupon-tab-used');
    if (activeBtn) {
      activeBtn.style.borderBottomColor = tab === 'active' ? '#7F77DD' : 'transparent';
      activeBtn.style.color = tab === 'active' ? '#7F77DD' : 'var(--text-hint)';
    }
    if (usedBtn) {
      usedBtn.style.borderBottomColor = tab === 'used' ? '#7F77DD' : 'transparent';
      usedBtn.style.color = tab === 'used' ? '#7F77DD' : 'var(--text-hint)';
    }
    loadAdminCouponList(tab);
  }

  function loadAdminCouponList(tab = 'active') {
    const listEl = document.getElementById('admin-coupon-list');
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);">불러오는 중...</div>';
    db.ref('coupons').once('value', snap => {
      if (!snap.exists()) { listEl.innerHTML = '<div class="empty-state">발행된 쿠폰이 없어요</div>'; return; }
      let html = '';
      snap.forEach(memberSnap => {
        const memberId = memberSnap.key;
        const memberName = localStorage.getItem('name_' + memberId) || memberId;
        memberSnap.forEach(couponSnap => {
          const c = couponSnap.val();
          const couponId = couponSnap.key;
          const isUsed = c.used === true;
          // 탭 필터링
          if (tab === 'active' && isUsed) return;
          if (tab === 'used' && !isUsed) return;

          if (c.type === 'point_shop') {
            if (isUsed) {
              html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <span style="font-size:14px;font-weight:700;color:var(--text-sub);">${escapeHtml(c.name)}</span>
                  <span style="background:#fef3c7;color:#854d0e;font-size:11px;padding:3px 8px;border-radius:10px;font-weight:600;">포인트쿠폰</span>
                </div>
                <div style="font-size:12px;color:var(--text-hint);margin-bottom:2px;">회원: ${memberName}</div>
                <div style="font-size:12px;color:var(--text-hint);margin-bottom:8px;">발행일: ${c.issuedAt} · 사용일: ${c.usedAt || '-'}</div>
                <button onclick="adminDeleteCoupon('${memberId}','${couponId}')"
                  style="width:100%;padding:9px;background:#fef2f2;color:#ef4444;border:1px solid #fecaca;border-radius:var(--radius-sm);font-size:13px;font-weight:700;font-family:'Noto Sans KR',sans-serif;cursor:pointer;">
                  🗑 삭제
                </button>
              </div>`;
            } else {
              html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <span style="font-size:14px;font-weight:700;color:var(--text);">${escapeHtml(c.name)}</span>
                  <span style="background:#fef3c7;color:#854d0e;font-size:11px;padding:3px 8px;border-radius:10px;font-weight:600;">포인트쿠폰</span>
                </div>
                <div style="font-size:12px;color:var(--text-hint);margin-bottom:2px;">회원: ${memberName}</div>
                <div style="font-size:12px;color:var(--text-hint);margin-bottom:8px;">발행일: ${c.issuedAt}${c.expire ? " · ~" + c.expire + "까지" : " · 기한없음"} · ${c.point}P</div>
                <div style="display:flex;gap:8px;">
                  <button onclick="adminUsePointCoupon('${memberId}','${couponId}')"
                    style="flex:1;padding:9px;background:#d97706;border:none;border-radius:var(--radius-sm);color:white;font-size:13px;font-weight:700;font-family:'Noto Sans KR',sans-serif;cursor:pointer;">
                    ✅ 사용 처리
                  </button>
                  <button onclick="adminDeleteCoupon('${memberId}','${couponId}')"
                    style="padding:9px 14px;background:#fef2f2;color:#ef4444;border:1px solid #fecaca;border-radius:var(--radius-sm);font-size:13px;font-weight:700;font-family:'Noto Sans KR',sans-serif;cursor:pointer;">
                    🗑
                  </button>
                </div>
              </div>`;
            }
            return;
          }
          // 일반 쿠폰
          const typeLabel = c.type === 'free' ? `무료 ${c.value}회` : c.type === 'discount' ? `${c.value}% 할인` : c.type === 'extend' ? `${c.value}일 연장` : c.type === 'drink' ? '음료 쿠폰' : c.type === 'americano' ? '아메리카노 쿠폰' : c.value;
          const badgeColor = c.type === 'free' ? '#E1F5EE;color:#0F6E56' : c.type === 'discount' ? '#EEEDFE;color:#3C3489' : c.type === 'drink' ? '#FEF3C7;color:#92400E' : c.type === 'americano' ? '#FEF3C7;color:#92400E' : '#E6F1FB;color:#185FA5';
          if (isUsed) {
            html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:14px;font-weight:700;color:var(--text-sub);">${c.name}</span>
                <span style="background:${badgeColor};font-size:11px;padding:3px 8px;border-radius:10px;font-weight:600;">${typeLabel}</span>
              </div>
              <div style="font-size:12px;color:var(--text-hint);margin-bottom:2px;">회원: ${memberName}</div>
              <div style="font-size:12px;color:var(--text-hint);margin-bottom:8px;">사용일: ${c.usedAt || '-'}</div>
              <button onclick="adminDeleteCoupon('${memberId}','${couponId}')"
                style="width:100%;padding:9px;background:#fef2f2;color:#ef4444;border:1px solid #fecaca;border-radius:var(--radius-sm);font-size:13px;font-weight:700;font-family:'Noto Sans KR',sans-serif;cursor:pointer;">
                🗑 삭제
              </button>
            </div>`;
          } else {
            html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:14px;font-weight:700;color:var(--text);">${c.name}</span>
                <span style="background:${badgeColor};font-size:11px;padding:3px 8px;border-radius:10px;font-weight:600;">${typeLabel}</span>
              </div>
              <div style="font-size:12px;color:var(--text-hint);margin-bottom:2px;">회원: ${memberName}</div>
              <div style="font-size:12px;color:var(--text-hint);margin-bottom:8px;">유효기간: ~${c.expire}</div>
              ${c.memo ? `<div style="font-size:12px;color:var(--text-sub);margin-bottom:8px;">메모: ${c.memo}</div>` : ''}
              <div style="display:flex;gap:8px;">
                <button onclick="adminUseCoupon('${memberId}','${couponId}')"
                  style="flex:1;padding:9px;background:#E24B4A;border:none;border-radius:var(--radius-sm);color:white;font-size:13px;font-weight:700;font-family:'Noto Sans KR',sans-serif;cursor:pointer;">
                  ✅ 사용 처리
                </button>
                <button onclick="adminDeleteCoupon('${memberId}','${couponId}')"
                  style="padding:9px 14px;background:#fef2f2;color:#ef4444;border:1px solid #fecaca;border-radius:var(--radius-sm);font-size:13px;font-weight:700;font-family:'Noto Sans KR',sans-serif;cursor:pointer;">
                  🗑
                </button>
              </div>
            </div>`;
          }
        });
      });
      const emptyMsg = tab === 'active' ? '발행된 쿠폰이 없어요' : '사용완료 쿠폰이 없어요';
      listEl.innerHTML = html || `<div class="empty-state">${emptyMsg}</div>`;
    });
  }

  function adminUseCoupon(memberId, couponId) {
    showConfirm('쿠폰을 사용 처리할까요?', () => {
      db.ref('coupons/' + memberId + '/' + couponId).update({ used: true, usedAt: new Date().toISOString().slice(0, 10) }).then(() => {
        showToast('사용 처리 완료! ✅', 'success');
        loadAdminCouponList();
      });
    });
  }

  function adminUsePointCoupon(memberId, couponId) {
    showConfirm('포인트 쿠폰을 사용 처리할까요?', () => {
      db.ref('coupons/' + memberId + '/' + couponId).update({ used: true, usedAt: new Date().toISOString().slice(0, 10) }).then(() => {
        showToast('사용 처리 완료! ✅', 'success');
        loadAdminCouponList();
      });
    });
  }

  function adminDeleteCoupon(memberId, couponId) {
    showConfirm('쿠폰을 삭제할까요?\n삭제 후 복구할 수 없어요.', () => {
      db.ref('coupons/' + memberId + '/' + couponId).remove().then(() => {
        showToast('🗑️ 쿠폰이 삭제됐어요.', 'success');
        loadAdminCouponList();
      });
    });
  }
  // 회원 내 쿠폰
  function openMyCoupons() {
    document.getElementById('my-coupon-modal').style.display = 'block';
    switchMyCouponTab('active');
    // 쿠폰 확인 시 배지 초기화
    if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
  }

  function switchMyCouponTab(tab) {
    const activeBtn = document.getElementById('coupon-tab-active');
    const usedBtn = document.getElementById('coupon-tab-used');
    if (activeBtn) {
      activeBtn.style.borderBottomColor = tab === 'active' ? '#7F77DD' : 'transparent';
      activeBtn.style.color = tab === 'active' ? '#7F77DD' : 'var(--text-hint)';
    }
    if (usedBtn) {
      usedBtn.style.borderBottomColor = tab === 'used' ? '#7F77DD' : 'transparent';
      usedBtn.style.color = tab === 'used' ? '#7F77DD' : 'var(--text-hint)';
    }
    loadMyCoupons(tab);
  }

  function closeMyCoupons() {
    document.getElementById('my-coupon-modal').style.display = 'none';
  }

  function loadMyCoupons(tab = 'active') {
    const userId = localStorage.getItem('current_user');
    const listEl = document.getElementById('my-coupon-list');
    const countEl = document.getElementById('my-coupon-count');
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);">불러오는 중...</div>';
    db.ref('coupons/' + userId).once('value').then(snap => {
      let count = 0;
      let html = '';
      if (snap.exists() && snap.val()) {
        snap.forEach(couponSnap => {
          const c = couponSnap.val();
          const couponId = couponSnap.key;
          const isUsed = c.used === true;
          // 탭에 따라 필터링
          if (tab === 'active' && isUsed) return;
          if (tab === 'used' && !isUsed) return;

          if (c.type === 'point_shop') {
            if (!isUsed) count++;
            if (isUsed) {
              html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:12px;">
                <div style="padding:14px 16px;border-left:4px solid #9ca3af;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <div style="font-size:15px;font-weight:700;color:var(--text-sub);">${escapeHtml(c.name)}</div>
                    <span style="font-size:10px;background:#e5e7eb;color:#6b7280;padding:2px 7px;border-radius:10px;font-weight:700;">포인트쿠폰</span>
                  </div>
                  <div style="font-size:12px;color:var(--text-hint);">${c.point}P · 사용일 ${c.usedAt || c.issuedAt}</div>
                </div>
              </div>`;
            } else {
              html += `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:12px;">
                <div style="padding:14px 16px;border-left:4px solid #d97706;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <div style="font-size:15px;font-weight:700;color:var(--text);">${escapeHtml(c.name)}</div>
                    <span style="font-size:10px;background:#fef3c7;color:#854d0e;padding:2px 7px;border-radius:10px;font-weight:700;">포인트쿠폰</span>
                  </div>
                  <div style="font-size:12px;color:var(--text-hint);">발행일 ${c.issuedAt}${c.expire ? " · ~" + c.expire + "까지" : " · 기한없음"} · ${c.point}P</div>
                </div>
                <div style="padding:12px 16px;background:var(--bg);border-top:1px solid var(--border);">
                  <div style="font-size:12px;color:var(--text-hint);margin-bottom:10px;text-align:center;">직원에게 이 화면을 보여주세요</div>
                  <button onclick="usePointCoupon('${userId}','${couponId}')"
                    style="width:100%;padding:11px;background:#d97706;border:none;border-radius:var(--radius-sm);color:white;font-size:14px;font-weight:700;font-family:'Noto Sans KR',sans-serif;cursor:pointer;">
                    ✅ 사용하기 (직원이 눌러주세요)
                  </button>
                </div>
              </div>`;
            }
          } else {
            const typeLabel = c.type === 'free' ? `무료 이용 ${c.value}회 추가` : c.type === 'discount' ? `${c.value}% 할인` : c.type === 'extend' ? `${c.value}일 연장` : c.type === 'drink' ? '☕ 음료 1잔' : c.type === 'americano' ? '☕ 아메리카노 1잔' : c.value;
            const borderColor = c.type === 'free' ? '#7F77DD' : c.type === 'discount' ? '#1D9E75' : '#D97706';
            if (!isUsed) count++;
            if (isUsed) {
              html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:12px;">
                <div style="padding:14px 16px;border-left:4px solid #9ca3af;">
                  <div style="font-size:15px;font-weight:700;color:var(--text-sub);margin-bottom:4px;">${c.name}</div>
                  <div style="font-size:12px;color:var(--text-hint);">사용일 ${c.usedAt || '-'}</div>
                </div>
              </div>`;
            } else {
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
            }
          }
        });
      }
      const emptyMsg = tab === 'active' ? '보유한 쿠폰이 없어요 🎫' : '사용 내역이 없어요';
      if (!html) html = `<div style="text-align:center;padding:40px 20px;color:var(--text-hint);font-size:14px;">${emptyMsg}</div>`;
      listEl.innerHTML = html;
      if (countEl) { if (count > 0) { countEl.textContent = count + '장'; countEl.style.display = 'inline'; } else countEl.style.display = 'none'; }
    });
  }

  function memberUseCoupon(userId, couponId) {
    showConfirm('쿠폰을 사용할까요?\n사용 후에는 되돌릴 수 없어요.', () => {
      const today = new Date().toISOString().slice(0, 10);
      db.ref('coupons/' + userId + '/' + couponId).update({ used: true, usedAt: today }).then(() => {
        showToast('쿠폰이 사용됐어요! ✅', 'success');
        loadMyCoupons();
      });
    });
  }

  function usePointCoupon(userId, couponId) {
    showConfirm('포인트 쿠폰을 사용할까요?\n사용 후에는 되돌릴 수 없어요.', () => {
      const today = new Date().toISOString().slice(0, 10);
      db.ref('coupons/' + userId + '/' + couponId).update({ used: true, usedAt: today }).then(() => {
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
    data.type   = document.getElementById('auto-' + key + '-type')   ? document.getElementById('auto-' + key + '-type').value   : 'free';
    data.value  = document.getElementById('auto-' + key + '-value')  ? document.getElementById('auto-' + key + '-value').value  : '';
    data.expire = document.getElementById('auto-' + key + '-expire') ? document.getElementById('auto-' + key + '-expire').value : '';
    const memoEl = document.getElementById('auto-' + key + '-memo');
    if (memoEl) data.memo = memoEl.value.trim();
    db.ref('auto_coupon_conditions/' + key).set(data);
  }

  function loadAutoConditions() {
    db.ref('auto_coupon_conditions').once('value', snap => {
      if (!snap.exists()) return;
      const conditions = snap.val();
      ['attend', 'streak', 'owunwan', 'birthday', 'firstlogin'].forEach(key => {
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
        const memoEl = document.getElementById('auto-' + key + '-memo');
        if (memoEl && c.memo) memoEl.value = c.memo;
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
          if (!m.birth || m.birth.length < 8) return;
          const today = getToday();
          const todayParts = today.split('-');
          const mm = todayParts[1].padStart(2, '0');
          const dd = todayParts[2].padStart(2, '0');
          // 생년월일 8자리(19900615) 형식 처리
          const bm = m.birth.length === 8 ? m.birth.substring(4,6) : (m.birth.split('-')[1] || '').padStart(2,'0');
          const bd = m.birth.length === 8 ? m.birth.substring(6,8) : (m.birth.split('-')[2] || '').padStart(2,'0');
          if (mm === bm && dd === bd) {
            const doneKey = 'auto_coupon_birthday_' + userId + '_' + todayParts[0] + '-' + mm;
            db.ref('coupon_issued_flags/' + doneKey).once('value', flagSnap => {
              if (!flagSnap.exists()) {
                issueAutoCoupon(userId, '🎂 생일 축하 쿠폰', conds.birthday);
                db.ref('coupon_issued_flags/' + doneKey).set(true);
              }
            });
          }
        });
      }
      // 첫 로그인
      if (conds.firstlogin && conds.firstlogin.on) {
        const role = localStorage.getItem('role_' + userId);
        if (role !== 'trainer' && role !== 'manager') {
          const doneKey = 'auto_coupon_firstlogin_' + userId;
          db.ref('coupon_issued_flags/' + doneKey).once('value', flagSnap => {
            if (!flagSnap.exists()) {
              issueAutoCoupon(userId, '🎉 첫 로그인 축하 쿠폰', conds.firstlogin);
              db.ref('coupon_issued_flags/' + doneKey).set(true);
            }
          });
        }
      }
    });
  }

  function issueAutoCoupon(userId, name, cond) {
    const expireDays = parseInt(cond.expire || 0);
    let expire = null;
    if (expireDays > 0) {
      const expireDate = new Date();
      expireDate.setDate(expireDate.getDate() + expireDays);
      expire = expireDate.toISOString().slice(0, 10);
    }
    const memoText = cond.memo ? '자동 발행 | ' + cond.memo : '자동 발행';
    const couponData = {
      name, type: cond.type, value: cond.value,
      limit: '1', memo: memoText,
      issuedAt: new Date().toISOString(), used: false, auto: true
    };
    if (expire) couponData.expire = expire;
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

  // ── 포인트 상점 관리 ──
  function loadPointShopItems() {
    const listEl = document.getElementById('point-shop-list');
    if (!listEl) return;
    db.ref('point_shop').once('value', snap => {
      const data = snap.val();
      if (!data) { listEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-hint);font-size:13px;">등록된 상품이 없어요</div>'; return; }
      listEl.innerHTML = Object.entries(data).map(([id, item]) => {
        const expireText = item.expireDays ? `발행 후 ${item.expireDays}일 이내` : '기한 없음';
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg);border-radius:var(--radius-sm);margin-bottom:8px;border:1px solid var(--border);">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text);">${escapeHtml(item.name)}</div>
            <div style="font-size:12px;color:var(--blue);margin-top:2px;">${item.point}P 차감 · ${expireText}</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button onclick="deletePointShopItem('${id}')" style="padding:5px 10px;background:#fee2e2;color:#ef4444;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">삭제</button>
          </div>
        </div>`;
      }).join('');
    });
  }

  function addPointShopItem() {
    const name = document.getElementById('shop-item-name').value.trim();
    const point = parseInt(document.getElementById('shop-item-point').value);
    const expireDays = parseInt(document.getElementById('shop-item-expire-days').value) || 0;
    if (!name) { showToast('상품명을 입력해주세요.', 'error'); return; }
    if (!point || point <= 0) { showToast('포인트를 입력해주세요.', 'error'); return; }
    const key = db.ref('point_shop').push().key;
    const item = { name, point };
    if (expireDays > 0) item.expireDays = expireDays;
    db.ref('point_shop/' + key).set(item).then(() => {
      showToast('✅ 상품이 추가됐어요!', 'success');
      document.getElementById('shop-item-name').value = '';
      document.getElementById('shop-item-point').value = '';
      document.getElementById('shop-item-expire-days').value = '';
      loadPointShopItems();
    });
  }

  function deletePointShopItem(id) {
    showConfirm('이 상품을 삭제할까요?', () => {
      db.ref('point_shop/' + id).remove().then(() => {
        showToast('🗑️ 상품이 삭제됐어요.', 'success');
        loadPointShopItems();
      });
    });
  }

  function loadPointSettings() {
    db.ref('point_settings').once('value', snap => {
      const s = snap.val() || {};
      document.getElementById('pts-owunwan').value       = s.owunwan      ?? 10;
      document.getElementById('pts-attend').value        = s.attend       ?? 2;
      document.getElementById('pts-pt-sign').value       = s.ptSign       ?? 0;
      document.getElementById('pts-weight').value        = s.weightRecord ?? 1;
      document.getElementById('pts-inbody').value        = s.inbodyRecord ?? 5;
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
      ptSign:        parseInt(document.getElementById('pts-pt-sign').value)    || 0,
      weightRecord:  parseInt(document.getElementById('pts-weight').value)     || 0,
      inbodyRecord:  parseInt(document.getElementById('pts-inbody').value)     || 0,
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
  function checkPointTierCoupons(userId, newPoints, prevPoints) {
    function _check(prev) {
      db.ref('point_tiers').once('value', snap => {
        if (!snap.exists()) return;
        snap.forEach(child => {
          const tier = child.val();
          if (!tier.active) return;
          const expireDays = 30;
          const expireDate = new Date(); expireDate.setDate(expireDate.getDate() + expireDays);
          const expire = expireDate.toISOString().slice(0,10);

          if (tier.type === 'repeat') {
            // 반복형: 실제 이전 포인트 기준으로 구간 횟수 계산 → 건너뛴 구간도 발행
            const prevCount = Math.floor(prev / tier.points);
            const newCount  = Math.floor(newPoints / tier.points);
            const diff = newCount - prevCount;
            for (let i = 0; i < diff; i++) {
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
    if (prevPoints !== undefined) {
      _check(prevPoints);
    } else {
      db.ref('users/' + userId + '/points').once('value', ptSnap => {
        _check(ptSnap.val() || 0);
      });
    }
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
    { no:32, name:'케이블 머신',                 muscles:'운동방법에 따라 다름',      key:'cable_machine' },
  ];

  // 기구 목록 불러오기 (Firebase → 없으면 기본값 이전)
  function loadAdminEquipmentList() {
    db.ref('equipment').once('value').then(snap => {
      if (!snap.exists()) {
        // 최초 1회: 기본값 Firebase에 저장 (현재 코드 기준)
        const batch = {};
        DEFAULT_EQUIPMENT.forEach(eq => { batch[eq.key] = { no: eq.no, name: eq.name, muscles: eq.muscles, memo: '', key: eq.key }; });
        db.ref('equipment').set(batch).then(() => {
          renderAdminEquipmentList(DEFAULT_EQUIPMENT);
          showToast('기본 기구 목록이 설정됐어요!', 'success');
        });
      } else {
        // Firebase 데이터 우선, effect/brand/emoji는 코드에서 보완
        const list = [];
        snap.forEach(child => {
          const val = child.val();
          if (!val.key) val.key = child.key;
          const orig = DEFAULT_EQUIPMENT.find(e => e.key === val.key);
          list.push({
            no:      val.no      || (orig ? orig.no : 99),
            name:    val.name    || (orig ? orig.name : ''),
            muscles: val.muscles || (orig ? orig.muscles : ''),
            effect:  orig ? orig.effect : '',
            brand:   orig ? orig.brand  : '',
            emoji:   orig ? orig.emoji  : '🏋️',
            memo:    val.memo || '',
            key:     val.key,
          });
        });
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
    if (!key) { showToast('기구 키가 없어요. 기구 목록을 다시 불러와주세요.', 'error'); return; }
    db.ref('equipment/' + key).once('value').then(snap => {
      // Firebase에 없으면 코드(DEFAULT_EQUIPMENT)에서 보완
      let eq = snap.exists() ? snap.val() : null;
      if (!eq) {
        const orig = DEFAULT_EQUIPMENT.find(e => e.key === key);
        if (!orig) { showToast('기구 정보를 찾을 수 없어요.', 'error'); return; }
        eq = { no: orig.no, name: orig.name, muscles: orig.muscles, memo: '', key: orig.key };
        // Firebase에 없으면 지금 저장
        db.ref('equipment/' + key).set(eq);
      }
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
        syncEquipmentFromFirebase(() => loadAdminEquipmentList());
      });
    } else {
      db.ref('equipment/' + key).update({ no, name, muscles, memo: memo || '', key: key }).then(() => {
        showToast('✅ 수정됐어요!', 'success');
        closeEquipmentModal();
        syncEquipmentFromFirebase(() => loadAdminEquipmentList());
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
        syncEquipmentFromFirebase(() => loadAdminEquipmentList());
      });
    });
  }
  // 코드 기준으로 Firebase DB 일괄 동기화 (관리자 전용)
  function syncEquipmentToFirebase() {
    showConfirm('⚠️ 주의: 기구 목록을 코드 기준으로 초기화합니다.\n관리자가 수정한 내용이 일부 초기화될 수 있어요.\n새 헬스장 최초 세팅 시에만 사용하세요.\n\n계속 진행할까요?', () => {
      db.ref('equipment').once('value').then(snap => {
        const updates = {};
        DEFAULT_EQUIPMENT.forEach(eq => {
          const existing = snap.exists() ? snap.child(eq.key).val() : null;
          // 이미 Firebase에 있으면 name/muscles/no만 코드 기준으로 업데이트, memo는 유지
          updates[eq.key] = {
            no:      eq.no,
            name:    eq.name,
            muscles: eq.muscles,
            memo:    existing ? (existing.memo || '') : '',
            key:     eq.key,
          };
        });
        db.ref('equipment').update(updates).then(() => {
          showToast('✅ DB 동기화 완료!', 'success');
          syncEquipmentFromFirebase(() => loadAdminEquipmentList());
        });
      });
    });
  }
  window.syncEquipmentToFirebase = syncEquipmentToFirebase;
  window.loadAdminEquipmentList = loadAdminEquipmentList;
  window.openEditEquipmentModal = openEditEquipmentModal;
  window.openAddEquipmentModal  = openAddEquipmentModal;
  window.closeEquipmentModal    = closeEquipmentModal;
  window.saveEquipmentEdit      = saveEquipmentEdit;
  window.deleteEquipment        = deleteEquipment;


  // ══════════════════════════════
  // 관리자 담당회원 관리 함수들
  // ══════════════════════════════

  // 담당회원 배정 (관리자)
  // 배정 모달 회원 캐시 (Firebase 로딩 지연 방지)
  let _assignMembersCache = null;

  function openAdminAssignTrainee(trainerId, trainerName) {
    // 모달 먼저 띄우고 로딩 표시
    const modal = document.createElement('div');
    modal.id = 'admin-assign-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
    modal.innerHTML = `
      <div style="background:var(--card);border-radius:16px;padding:20px;width:100%;max-width:320px;font-family:'Noto Sans KR',sans-serif;max-height:80vh;overflow-y:auto;">
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px;">👥 담당회원 배정</div>
        <div style="font-size:12px;color:var(--text-hint);margin-bottom:14px;">${trainerName} 강사</div>

        <div style="font-size:12px;color:var(--text-hint);margin-bottom:6px;">회원 검색</div>
        <input id="assign-search" type="text" placeholder="이름 또는 전화번호 검색"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--blue);border-radius:8px;font-size:14px;font-family:'Noto Sans KR',sans-serif;background:var(--bg);color:var(--text);margin-bottom:6px;outline:none;">
        <div id="assign-search-result" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;margin-bottom:12px;display:none;"></div>
        <div id="assign-selected-member" style="display:none;padding:8px 12px;background:var(--blue-light);border-radius:8px;margin-bottom:12px;font-size:13px;color:var(--blue);font-weight:600;"></div>
        <input type="hidden" id="assign-member-id">

        <div style="font-size:12px;color:var(--text-hint);margin-bottom:6px;">수업 종류</div>
        <input id="assign-type" type="text" placeholder="예) PT / 기구필라테스 / 기타"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:'Noto Sans KR',sans-serif;background:var(--bg);color:var(--text);margin-bottom:12px;outline:none;">
        <div style="font-size:12px;color:var(--text-hint);margin-bottom:6px;">총 수업 횟수</div>
        <input id="assign-total" type="number" placeholder="예) 10, 20, 30"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:'Noto Sans KR',sans-serif;background:var(--bg);color:var(--text);margin-bottom:16px;outline:none;">
        <div style="display:flex;gap:10px;">
          <button onclick="document.getElementById('admin-assign-modal').remove()"
            style="flex:1;padding:12px;background:none;border:1px solid var(--border);border-radius:10px;font-size:14px;font-weight:700;color:var(--text-hint);cursor:pointer;font-family:'Noto Sans KR',sans-serif;">취소</button>
          <button onclick="saveAdminAssignTrainee('${trainerId}','${trainerName}')"
            style="flex:1;padding:12px;background:var(--blue);border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">배정</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // 회원 목록 로딩 (캐시 우선 → Firebase)
    const setupSearch = (members) => {
      _assignMembersCache = members;
      const searchInput = document.getElementById('assign-search');
      if (!searchInput) return;
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim();
        const resultEl = document.getElementById('assign-search-result');
        if (!q) { resultEl.style.display = 'none'; return; }
        // 로컬 필터링 (Firebase 재조회 없음)
        const filtered = members.filter(m =>
          m.name.includes(q) || m.id.includes(q)
        ).slice(0, 8);
        if (filtered.length === 0) {
          resultEl.style.display = 'block';
          resultEl.innerHTML = '<div style="padding:10px 12px;font-size:13px;color:var(--text-hint);">검색 결과가 없어요</div>';
          return;
        }
        resultEl.style.display = 'block';
        resultEl.innerHTML = filtered.map(m => `
          <div onclick="selectAssignMember('${m.id}','${m.name}')"
            style="padding:10px 12px;font-size:13px;color:var(--text);cursor:pointer;border-bottom:1px solid var(--border);"
            ontouchstart="this.style.background='var(--blue-light)'" ontouchend="this.style.background=''">
            <span style="font-weight:600;">${m.name}</span>
            <span style="color:var(--text-hint);font-size:11px;margin-left:6px;">${m.id}</span>
          </div>`).join('');
      });
      setTimeout(() => searchInput.focus(), 100);
    };

    if (_assignMembersCache) {
      // 캐시 있으면 즉시 사용
      setupSearch(_assignMembersCache);
    } else {
      // Firebase에서 한 번만 로드 후 캐시
      db.ref('members').once('value').then(snap => {
        const members = [];
        snap.forEach(child => {
          const m = child.val();
          if (m.role !== 'trainer' && m.role !== 'manager') {
            members.push({ id: child.key, name: m.name || child.key });
          }
        });
        setupSearch(members);
      });
    }
  }

  function selectAssignMember(memberId, memberName) {
    document.getElementById('assign-member-id').value = memberId;
    document.getElementById('assign-search').value = memberName;
    document.getElementById('assign-search-result').style.display = 'none';
    const selectedEl = document.getElementById('assign-selected-member');
    selectedEl.style.display = 'block';
    selectedEl.textContent = '✅ ' + memberName + ' (' + memberId + ')';
  }
  window.selectAssignMember = selectAssignMember;

  function saveAdminAssignTrainee(trainerId, trainerName) {
    const memberId = document.getElementById('assign-member-id').value;
    const memberName = document.getElementById('assign-search').value.trim();
    const type = document.getElementById('assign-type').value.trim();
    const total = parseInt(document.getElementById('assign-total').value);
    if (!memberId) { showToast('회원을 검색해서 선택해주세요.', 'error'); return; }
    if (!type) { showToast('수업 종류를 입력해주세요.', 'error'); return; }
    if (!total || isNaN(total)) { showToast('총 횟수를 입력해주세요.', 'error'); return; }

    db.ref('trainers/' + trainerId + '/trainees/' + memberId).set({
      name: memberName,
      type, total, remain: total,
      addedAt: Date.now()
    }).then(() => {
      // members/{회원}/trainerId 동기화
      db.ref('members/' + memberId + '/trainerId').set(trainerId);
      _assignMembersCache = null;
      showToast(memberName + '님이 ' + trainerName + ' 강사에게 배정됐어요! 💪', 'success');
      document.getElementById('admin-assign-modal')?.remove();
      loadMonthlyReport();
    });
  }
  window.openAdminAssignTrainee = openAdminAssignTrainee;
  window.saveAdminAssignTrainee = saveAdminAssignTrainee;

  // 수업 정보 수정 (관리자)
  function openAdminEditTrainee(trainerId, traineeId) {
    db.ref('trainers/' + trainerId + '/trainees/' + traineeId).once('value').then(snap => {
      const info = snap.val();
      if (!info) return;
      db.ref('members/' + traineeId + '/name').once('value').then(nameSnap => {
        const memberName = nameSnap.val() || info.name || traineeId;
        const modal = document.createElement('div');
        modal.id = 'admin-edit-trainee-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
        modal.innerHTML = `
          <div style="background:var(--card);border-radius:16px;padding:20px;width:100%;max-width:320px;font-family:'Noto Sans KR',sans-serif;">
            <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px;">✏️ 수업 정보 수정</div>
            <div style="font-size:12px;color:var(--text-hint);margin-bottom:14px;">${memberName}</div>
            <div style="font-size:12px;color:var(--text-hint);margin-bottom:6px;">수업 종류</div>
            <input id="admin-edit-type" type="text" value="${info.type || ''}" placeholder="예) PT / 기구필라테스"
              style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:'Noto Sans KR',sans-serif;background:var(--bg);color:var(--text);margin-bottom:12px;outline:none;">
            <div style="font-size:12px;color:var(--text-hint);margin-bottom:6px;">총 횟수</div>
            <input id="admin-edit-total" type="number" value="${info.total || ''}"
              style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:'Noto Sans KR',sans-serif;background:var(--bg);color:var(--text);margin-bottom:12px;outline:none;">
            <div style="font-size:12px;color:var(--text-hint);margin-bottom:6px;">잔여 횟수</div>
            <input id="admin-edit-remain" type="number" value="${info.remain || ''}"
              style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:'Noto Sans KR',sans-serif;background:var(--bg);color:var(--text);margin-bottom:12px;outline:none;">
            <div style="font-size:12px;color:var(--text-hint);margin-bottom:6px;">수정 사유 (선택)</div>
            <input id="admin-edit-memo" type="text" placeholder="예) 취소 수업 복구"
              style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:'Noto Sans KR',sans-serif;background:var(--bg);color:var(--text);margin-bottom:16px;outline:none;">
            <div style="display:flex;gap:10px;">
              <button onclick="document.getElementById('admin-edit-trainee-modal').remove()"
                style="flex:1;padding:12px;background:none;border:1px solid var(--border);border-radius:10px;font-size:14px;font-weight:700;color:var(--text-hint);cursor:pointer;font-family:'Noto Sans KR',sans-serif;">취소</button>
              <button onclick="saveAdminEditTrainee('${trainerId}','${traineeId}')"
                style="flex:1;padding:12px;background:var(--blue);border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">저장</button>
            </div>
          </div>`;
        document.body.appendChild(modal);
      });
    });
  }

  function saveAdminEditTrainee(trainerId, traineeId) {
    const type   = document.getElementById('admin-edit-type').value.trim();
    const total  = parseInt(document.getElementById('admin-edit-total').value);
    const remain = parseInt(document.getElementById('admin-edit-remain').value);
    if (!type) { showToast('수업 종류를 입력해주세요.', 'error'); return; }
    if (isNaN(total) || isNaN(remain)) { showToast('횟수를 입력해주세요.', 'error'); return; }
    db.ref('trainers/' + trainerId + '/trainees/' + traineeId).update({ type, total, remain }).then(() => {
      showToast('✅ 수정됐어요!', 'success');
      document.getElementById('admin-edit-trainee-modal')?.remove();
      loadMonthlyReport();
    });
  }
  window.openAdminEditTrainee = openAdminEditTrainee;
  window.saveAdminEditTrainee = saveAdminEditTrainee;

  // 재등록 (관리자)
  function openAdminReregister(trainerId, traineeId, currentType) {
    db.ref('members/' + traineeId + '/name').once('value').then(nameSnap => {
      const memberName = nameSnap.val() || traineeId;
      const modal = document.createElement('div');
      modal.id = 'admin-reregister-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
      modal.innerHTML = `
        <div style="background:var(--card);border-radius:16px;padding:20px;width:100%;max-width:320px;font-family:'Noto Sans KR',sans-serif;">
          <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px;">🔄 재등록</div>
          <div style="font-size:12px;color:var(--text-hint);margin-bottom:14px;">${memberName}</div>
          <div style="font-size:12px;color:var(--text-hint);margin-bottom:6px;">수업 종류</div>
          <input id="admin-rereg-type" type="text" value="${currentType || ''}" placeholder="예) PT / 기구필라테스"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:'Noto Sans KR',sans-serif;background:var(--bg);color:var(--text);margin-bottom:12px;outline:none;">
          <div style="font-size:12px;color:var(--text-hint);margin-bottom:6px;">추가 횟수</div>
          <input id="admin-rereg-total" type="number" placeholder="예) 10, 20, 30"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:'Noto Sans KR',sans-serif;background:var(--bg);color:var(--text);margin-bottom:16px;outline:none;">
          <div style="display:flex;gap:10px;">
            <button onclick="document.getElementById('admin-reregister-modal').remove()"
              style="flex:1;padding:12px;background:none;border:1px solid var(--border);border-radius:10px;font-size:14px;font-weight:700;color:var(--text-hint);cursor:pointer;font-family:'Noto Sans KR',sans-serif;">취소</button>
            <button onclick="saveAdminReregister('${trainerId}','${traineeId}','${memberName}')"
              style="flex:1;padding:12px;background:#22c55e;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">재등록</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    });
  }

  function saveAdminReregister(trainerId, traineeId, memberName) {
    const type  = document.getElementById('admin-rereg-type').value.trim();
    const count = parseInt(document.getElementById('admin-rereg-total').value);
    if (!type) { showToast('수업 종류를 입력해주세요.', 'error'); return; }
    if (!count || isNaN(count)) { showToast('횟수를 입력해주세요.', 'error'); return; }
    const ref = db.ref('trainers/' + trainerId + '/trainees/' + traineeId);
    ref.once('value').then(snap => {
      const info = snap.val() || {};
      const _now = new Date();
      const dateStr = _now.getFullYear() + '-' + (_now.getMonth()+1) + '-' + _now.getDate();
      const regKey = 'reg_' + Date.now();
      const prevReg = { type: info.type || type, total: info.total || 0, remain: info.remain || 0, date: dateStr };
      const newRemain = (info.remain || 0) + count;
      Promise.all([
        db.ref('trainers/' + trainerId + '/trainees/' + traineeId + '/registrations/' + regKey).set(prevReg),
        ref.update({ type, total: count, remain: newRemain, regDate: dateStr }),
        db.ref('trainers/' + trainerId + '/trainees/' + traineeId + '/reregTarget').remove()
      ]).then(() => {
        showToast('✅ ' + memberName + ' ' + count + '회 재등록 완료!', 'success');
        document.getElementById('admin-reregister-modal')?.remove();
        loadMonthlyReport();
      });
    });
  }
  window.openAdminReregister = openAdminReregister;
  window.saveAdminReregister = saveAdminReregister;

  // 담당해제 (관리자)
  function adminDeleteTrainee(trainerId, traineeId, traineeName) {
    showConfirm(traineeName + '님을 담당 해제할까요?', () => {
      Promise.all([
        db.ref('trainers/' + trainerId + '/trainees/' + traineeId).remove(),
        db.ref('members/' + traineeId + '/trainerId').remove(),
        db.ref('users/' + traineeId + '/lessons').remove(),
        db.ref('users/' + traineeId + '/routines').once('value').then(snap => {
          if (!snap.exists()) return;
          const updates = {};
          Object.keys(snap.val()).forEach(key => {
            if (snap.val()[key] && snap.val()[key].assignedBy === trainerId) {
              updates[key] = null;
            }
          });
          if (Object.keys(updates).length > 0) {
            return db.ref('users/' + traineeId + '/routines').update(updates);
          }
        })
      ]).then(() => {
        showToast(traineeName + '님이 담당 해제됐어요.', 'success');
        loadMonthlyReport();
      });
    });
  }
  // ── 강사 홈화면 데이터 로드 ──────────────────────────────
  let thAttendChart = null;
  let thRemainChart = null;
  let thChartData = { attend: [], absent: [], remain0: [], remainLow: [], remainOk: [] };

  function loadTrainerHome() {
    const trainerId = localStorage.getItem('current_user');
    if (!trainerId) return;

    // 강사/회원 섹션 분기
    const trainerSection = document.getElementById('trainer-home-section');
    const memberSection = document.getElementById('member-home-section');
    if (trainerSection) trainerSection.style.display = 'block';
    if (memberSection) memberSection.style.display = 'none';

    // 강사에게 불필요한 카드 숨김
    const weightCard = document.getElementById('home-weight-card');
    const motivateCard = document.getElementById('home-motivate-card');
    if (weightCard) weightCard.style.display = 'none';
    if (motivateCard) motivateCard.style.display = 'none';

    // 강사 이름
    const nicknameEl = document.getElementById('home-nickname');
    if (nicknameEl) {
      const name = localStorage.getItem('nickname_' + trainerId) || '강사';
      nicknameEl.textContent = name + '님';
    }

    // 오늘 스케줄 로드
    loadTrainerHomeSchedule(trainerId);

    // 담당 회원 현황 로드
    loadTrainerHomeStats(trainerId);

    // 공지사항
    loadHomeNotices('trainer-notice-container');
  }

  function loadTrainerHomeSchedule(trainerId) {
    const chips = document.getElementById('trainer-schedule-chips');
    if (!chips) return;
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    db.ref('trainers/' + trainerId + '/schedule').once('value', snap => {
      const data = snap.val() || {};
      const todayItems = [];
      Object.entries(data).forEach(([key, val]) => {
        if (key.startsWith(todayStr + '_') && val) {
          const hour = key.split('_')[1];
          todayItems.push({ hour: parseInt(hour), label: String(hour).padStart(2,'0') + ':00', content: val });
        }
      });
      todayItems.sort((a, b) => a.hour - b.hour);
      if (todayItems.length === 0) {
        chips.innerHTML = '<div style="flex-shrink:0;color:var(--text-hint);font-size:13px;padding:6px 0;">오늘 스케줄이 없어요</div>';
        return;
      }
      chips.innerHTML = todayItems.map(item => `
        <div style="flex-shrink:0;background:#E6F1FB;border-radius:20px;padding:6px 12px;display:flex;align-items:center;gap:6px;">
          <span style="font-size:11px;font-weight:700;color:#185FA5;">${item.label}</span>
          <span style="font-size:11px;color:#0C447C;">${escapeHtml(item.content)}</span>
        </div>`).join('');
    });
  }

  function loadTrainerHomeStats(trainerId) {
    db.ref('trainers/' + trainerId + '/trainees').once('value', snap => {
      const data = snap.val() || {};
      const now = new Date();
      const thisMonthPad = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
      const thisMonthShort = now.getFullYear() + '-' + (now.getMonth()+1);
      const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);

      const isThisMonth = (dateStr) => {
        if (!dateStr) return false;
        return dateStr.startsWith(thisMonthPad + '-') || dateStr.startsWith(thisMonthShort + '-')
          || dateStr === thisMonthPad || dateStr === thisMonthShort;
      };

      let totalMembers = 0, newMembers = 0, reMembers = 0, totalRemain = 0;
      let inactiveMembers = 0, monthLessons = 0;
      let attend = [], absent = [], remain0 = [], remainLow = [], remainOk = [];
      let expiredThisMonth = [], reRegThisMonth = [];

      const memberIds = Object.keys(data);
      totalMembers = memberIds.length;

      const promises = memberIds.map(memberId => {
        const info = data[memberId];

        // 잔여 횟수 현황
        const remain = info.remain != null ? info.remain : 0;
        totalRemain += remain;
        if (remain === 0) remain0.push(info.name || memberId);
        else if (remain <= 3) remainLow.push(info.name || memberId);
        else remainOk.push(info.name || memberId);

        // 신규: addedAt 이번 달 기준
        if (info.addedAt && isThisMonth(new Date(info.addedAt).toISOString().slice(0,10))) {
          newMembers++;
        }

        // 재등록: registrations 이번 달 기준
        const regs = info.registrations ? Object.values(info.registrations) : [];
        const thisMonthRegs = regs.filter(r => r && r.date && isThisMonth(r.date));
        if (thisMonthRegs.length > 0) reMembers++;

        // 새 재등록률 계산: reregTarget=true인 회원 중 이번달 재등록한 회원
        const isReregTarget = info.reregTarget === true;
        const hasReRegThisMonth = thisMonthRegs.length > 0;
        if (isReregTarget) {
          expiredThisMonth.push(info.name || memberId); // 분모 (재등록대상)
          if (hasReRegThisMonth) {
            reRegThisMonth.push(info.name || memberId); // 분자 (실제 재등록)
          }
        }

        return db.ref('trainers/' + trainerId + '/trainees/' + memberId + '/signs').once('value', sSnap => {
          let hasThisMonth = false;
          let lastSignTime = 0;
          let hasAnySigns = false;
          if (sSnap.exists()) {
            hasAnySigns = true;
            sSnap.forEach(s => {
              const sd = s.val();
              if (sd && sd.date) {
                if (isThisMonth(sd.date)) { monthLessons++; hasThisMonth = true; }
                const t = sd.savedAt || 0;
                if (t > lastSignTime) lastSignTime = t;
              }
            });
          }
          if (hasAnySigns) {
            if (hasThisMonth) attend.push(info.name || memberId);
            else absent.push(info.name || memberId);
          }
          if (lastSignTime > 0 && lastSignTime < twoWeeksAgo) inactiveMembers++;
        });
      });

      Promise.all(promises).then(() => {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('th-total-members', totalMembers);
        set('th-month-lessons', monthLessons);
        set('th-new-members', newMembers);
        set('th-re-members', reMembers);
        set('th-total-remain', totalRemain);
        set('th-inactive-members', inactiveMembers);
        set('th-attend-count', attend.length);
        set('th-absent-count', absent.length);
        set('th-remain-0', remain0.length);
        set('th-remain-low', remainLow.length);
        set('th-remain-ok', remainOk.length);

        // 새 재등록률 계산
        // 분모: reregTarget=true인 회원 (expiredThisMonth)
        // 분자: 그 중 이번달 실제 재등록한 회원 (reRegThisMonth)
        const reRegDone = reRegThisMonth.length;
        const reRegTotal = expiredThisMonth.length;
        const reRegNotDone = reRegTotal - reRegDone;
        set('th-rereg-done', reRegDone);
        set('th-rereg-not', reRegNotDone >= 0 ? reRegNotDone : 0);
        set('th-rereg-total', reRegTotal);

        thChartData = { attend, absent, remain0, remainLow, remainOk, reRegThisMonth, expiredThisMonth };
        renderTrainerHomeCharts(reRegDone, reRegNotDone >= 0 ? reRegNotDone : 0, remain0.length, remainLow.length, remainOk.length);
      });
    });
  }
  function renderTrainerHomeCharts(reRegDone, reRegNotDone, r0, rLow, rOk) {
    if (typeof Chart === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js';
      s.onload = () => _drawTrainerCharts(reRegDone, reRegNotDone, r0, rLow, rOk);
      document.head.appendChild(s);
    } else {
      _drawTrainerCharts(reRegDone, reRegNotDone, r0, rLow, rOk);
    }
  }

  function _drawTrainerCharts(reRegDone, reRegNotDone, r0, rLow, rOk) {
    const centerPlugin = {
      id: 'thCenter',
      afterDraw(chart) {
        const { ctx, chartArea: { top, bottom, left, right } } = chart;
        const cx = (left + right) / 2, cy = (top + bottom) / 2;
        const data = chart.data.datasets[0].data;
        const total = data.reduce((a, b) => a + b, 0);
        if (!total) return;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // 데이터가 1개(회색 도넛) → N/A + 대상없음 두 줄 표시
        if (data.length === 1) {
          const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-hint') || '#aaa';
          ctx.fillStyle = textColor;
          ctx.font = '700 12px sans-serif';
          ctx.fillText('N/A', cx, cy - 7);
          ctx.font = '400 10px sans-serif';
          ctx.fillText('대상없음', cx, cy + 7);
        } else {
          const pct = Math.round(data[0] / total * 100);
          ctx.font = '700 13px sans-serif';
          ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary') || '#111';
          ctx.fillText(pct + '%', cx, cy);
        }
        ctx.restore();
      }
    };
    if (!Chart.registry.plugins.get('thCenter')) Chart.register(centerPlugin);

    const c1 = document.getElementById('th-chart-attend');
    const c2 = document.getElementById('th-chart-remain');
    if (!c1 || !c2) return;

    if (thAttendChart) thAttendChart.destroy();
    if (thRemainChart) thRemainChart.destroy();

    // 재등록대상 없으면 회색 도넛
    const reRegTotal = reRegDone + reRegNotDone;
    const reRegData = reRegTotal > 0
      ? { data: [reRegDone, reRegNotDone], backgroundColor: ['#22c55e', '#888780'] }
      : { data: [1], backgroundColor: ['#D3D1C7'] };
    thAttendChart = new Chart(c1, {
      type: 'doughnut',
      data: { datasets: [{ ...reRegData, borderWidth: 0 }] },
      options: { cutout: '68%', plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { duration: 600 } }
    });
    thRemainChart = new Chart(c2, {
      type: 'doughnut',
      data: { datasets: [{ data: [rOk, rLow, r0], backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'], borderWidth: 0 }] },
      options: { cutout: '68%', plugins: { legend: { display: false }, tooltip: { enabled: false }, thCenter: false }, animation: { duration: 600 } }
    });
  }

  function showTrainerChartDetail(type) {
    let title = '', list = [];
    if (type === 'attend') {
      title = '이번 달 미출석 회원';
      list = thChartData.absent;
    } else if (type === 'rereg') {
      title = '이번 달 재등록률 현황';
      const done = (thChartData.reRegThisMonth || []).map(n => `<span style="color:#22c55e;">✓ ${escapeHtml(n)} (재등록 완료)</span>`);
      const notDone = (thChartData.expiredThisMonth || [])
        .filter(n => !(thChartData.reRegThisMonth || []).includes(n))
        .map(n => `<span style="color:#888780;">◦ ${escapeHtml(n)} (미재등록)</span>`);
      list = [...done, ...notDone];
    } else if (type === 'remain') {
      title = '잔여 횟수 현황';
      const r0 = thChartData.remain0.map(n => `<span style="color:#ef4444;">⚠ ${escapeHtml(n)} (0회)</span>`);
      const rLow = thChartData.remainLow.map(n => `<span style="color:#f59e0b;">! ${escapeHtml(n)} (1~3회)</span>`);
      const rOk = thChartData.remainOk.map(n => `<span style="color:#22c55e;">✓ ${escapeHtml(n)}</span>`);
      list = [...r0, ...rLow, ...rOk];
    }
    if (list.length === 0) { showToast('해당 회원이 없어요.', 'success'); return; }
    const html = `
      <div style="background:var(--card);border-radius:var(--radius);padding:16px;margin:8px 16px;">
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:12px;">${title}</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${list.map(item => `<div style="font-size:13px;padding:4px 0;border-bottom:1px solid var(--border);">${typeof item === 'string' && !item.includes('<span') ? escapeHtml(item) : item}</div>`).join('')}
        </div>
        <button onclick="this.closest('.th-detail-wrap').remove()" style="margin-top:12px;width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:'Noto Sans KR',sans-serif;cursor:pointer;color:var(--text);">닫기</button>
      </div>`;
    const wrap = document.createElement('div');
    wrap.className = 'th-detail-wrap';
    wrap.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:999;display:flex;align-items:center;justify-content:center;';
    wrap.innerHTML = html;
    wrap.onclick = e => { if (e.target === wrap) wrap.remove(); };
    document.body.appendChild(wrap);
  }

  window.loadTrainerHome = loadTrainerHome;
  window.showTrainerChartDetail = showTrainerChartDetail;
  // ── 강사 홈화면 끝 ──────────────────────────────────────

// ── 키오스크 출석 ──────────────────────────────────────
let _kioskInput = '';

function openKiosk() {
  _kioskInput = '';
  _kioskUpdateDots();
  document.getElementById('kiosk-input-area').style.display = 'block';
  document.getElementById('kiosk-result-area').style.display = 'none';
  document.getElementById('kiosk-result-area').innerHTML = '';
  // 관리자 탭바 숨기기
  const tabRow = document.querySelector('.admin-tab-row');
  const pcHeader = document.getElementById('admin-header-pc');
  if (tabRow) tabRow.style.display = 'none';
  if (pcHeader) pcHeader.style.display = 'none';
  // 키오스크 화면 표시
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const kiosk = document.getElementById('screen-kiosk');
  kiosk.style.display = 'flex';
  kiosk.classList.add('active');
}

function exitKiosk() {
  showConfirmKiosk('관리자 비밀번호를 입력하세요', async (pw) => {
    if (!pw) return;
    try {
      // 관리자 비밀번호는 admin_config/pw 경로에 저장
      const snap = await db.ref('admin_config/pw').once('value');
      const adminPw = snap.val() || 'admin123';
      if (pw === adminPw) {
        // 탭바 복원
        const tabRow = document.querySelector('.admin-tab-row');
        const pcHeader = document.getElementById('admin-header-pc');
        if (tabRow) tabRow.style.display = '';
        if (pcHeader) pcHeader.style.display = '';
        // 관리자 화면으로 복귀
        document.getElementById('screen-kiosk').style.display = 'none';
        document.getElementById('screen-kiosk').classList.remove('active');
        showScreen('screen-admin');
      } else {
        showToast('비밀번호가 틀렸어요.', 'error');
      }
    } catch(e) {
      showToast('확인 중 오류가 발생했어요.', 'error');
    }
  });
}

function showConfirmKiosk(msg, cb) {
  const pw = prompt(msg);
  if (pw !== null) cb(pw);
}

function _kioskUpdateDots() {
  for (let i = 0; i < 8; i++) {
    const el = document.getElementById('kd' + i);
    if (el) el.className = 'kd' + (i < _kioskInput.length ? ' filled' : '');
  }
}

async function kioskPress(k) {
  if (k === 'del') {
    _kioskInput = _kioskInput.slice(0, -1);
    _kioskUpdateDots();
  } else if (k === 'ok') {
    if (_kioskInput.length !== 8) {
      showToast('8자리를 모두 입력해주세요.', 'error');
      return;
    }
    await _kioskCheckIn('010' + _kioskInput);
  } else if (_kioskInput.length < 8) {
    _kioskInput += k;
    _kioskUpdateDots();
    // 8자리 입력 완료 시 자동 확인

  }
}

async function _kioskCheckIn(phone) {
  // getToday()와 동일한 unpadded 형식 사용 (예: 2026-6-9)
  const _d = new Date();
  const today = _d.getFullYear() + '-' + (_d.getMonth()+1) + '-' + _d.getDate();
  const todayPadded = today; // unpadded 형식으로 통일
  try {
    // 회원 존재 확인
    const memberSnap = await db.ref('members/' + phone).once('value');
    const member = memberSnap.val();
    if (!member) {
      _kioskShowResult('fail', '등록되지 않은 번호예요', '직원에게 문의해주세요');
      return;
    }
    // 오늘 출석 여부 확인
    const attSnap = await db.ref('users/' + phone + '/attendance/' + today).once('value');
    if (attSnap.exists()) {
      _kioskShowResult('already', '오늘 이미 출석했어요', member.name + '님은 이미 출석하셨어요');
      return;
    }
    // 출석 저장
    await db.ref('users/' + phone + '/attendance/' + today).set(true);
    // 포인트 적립
    const pts = member.attendPoint || 2;
    if (typeof addUserPoints === 'function') {
      addUserPoints(phone, pts, '출석');
    } else {
      const ptsSnap = await db.ref('users/' + phone + '/points').once('value');
      const cur = ptsSnap.val() || 0;
      await db.ref('users/' + phone + '/points').set(cur + pts);
      const histKey = db.ref('users/' + phone + '/pointHistory').push().key;
      await db.ref('users/' + phone + '/pointHistory/' + histKey).set({
        amount: pts, date: todayPadded, reason: '출석', balance: cur + pts, createdAt: Date.now()
      });
    }
    const nick = localStorage.getItem('nickname_' + phone) || member.name;
    // 푸시알림 발송
    if (typeof sendPushToUser === 'function') {
      sendPushToUser(phone, '✅ 출석 완료!', nick + '님 출석이 확인됐어요! +' + pts + 'P 적립', 'attend', { type: 'attend' });
    }
    _kioskShowResult('success', nick + '님', '출석 완료! 포인트 +' + pts + 'P 적립', member.name.slice(0, 1));
  } catch(e) {
    _kioskShowResult('fail', '오류가 발생했어요', '다시 시도해주세요');
  }
}

function _kioskShowResult(type, msg1, msg2, initial) {
  document.getElementById('kiosk-input-area').style.display = 'none';
  const el = document.getElementById('kiosk-result-area');
  el.style.display = 'block';
  if (type === 'success') {
    el.innerHTML = `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:14px;padding:28px 20px;text-align:center;">
      <div style="width:64px;height:64px;background:#1a6fd4;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;color:white;margin:0 auto 14px;">${escapeHtml(initial||'?')}</div>
      <div style="font-size:22px;font-weight:700;color:#15803d;margin-bottom:6px;">${escapeHtml(msg1)}</div>
      <div style="font-size:15px;color:#16a34a;margin-bottom:10px;">${escapeHtml(msg2)}</div>
    </div>`;
  } else if (type === 'already') {
    el.innerHTML = `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:14px;padding:28px 20px;text-align:center;">
      <div style="font-size:36px;margin-bottom:10px;">✅</div>
      <div style="font-size:18px;font-weight:700;color:#854d0e;margin-bottom:6px;">${escapeHtml(msg1)}</div>
      <div style="font-size:13px;color:#92400e;">${escapeHtml(msg2)}</div>
    </div>`;
  } else {
    el.innerHTML = `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:14px;padding:28px 20px;text-align:center;">
      <div style="font-size:36px;margin-bottom:10px;">❌</div>
      <div style="font-size:18px;font-weight:700;color:#A32D2D;margin-bottom:6px;">${escapeHtml(msg1)}</div>
      <div style="font-size:13px;color:#ef4444;">${escapeHtml(msg2)}</div>
    </div>`;
  }
  // 3초 후 초기화
  setTimeout(() => {
    _kioskInput = '';
    _kioskUpdateDots();
    document.getElementById('kiosk-input-area').style.display = 'block';
    el.style.display = 'none';
    el.innerHTML = '';
  }, 3000);
}
