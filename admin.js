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
    // 계약서 탭: admin-body 좌우 여백 제거 / 다른 탭: 복구
    const adminBody = document.getElementById('admin-mobile-body');
    if (adminBody) {
      adminBody.style.paddingLeft  = tabId === 'tab-register' ? '0' : '';
      adminBody.style.paddingRight = tabId === 'tab-register' ? '0' : '';
    }
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
    if (tabId === 'tab-register') { try { resetContract(); } catch(e) { console.error('resetContract 오류(무시):', e); } }
    if (tabId === 'tab-community-admin') loadAdminCommunityFeed('전체');
    if (tabId === 'tab-trainer-admin') loadAdminTrainerSchedule();
    if (tabId === 'tab-coupon') loadMemberSelectOptions();
    if (tabId === 'tab-challenge-admin') loadAdminChallenges();
    if (tabId === 'tab-pilates-group') initPilatesGroupTab();
    if (tabId === 'coupon-auto') loadAutoConditions();
    if (tabId === 'tab-settings') switchSettingsSubtab('pw');
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
    // 회원 탭이 보이는 중이면, 모드에 맞는 형태(PC=표 / 모바일=카드)로 다시 그림
    const tabMembers = document.getElementById('tab-members');
    if (tabMembers && tabMembers.style.display !== 'none') {
      const q = document.getElementById('member-search')?.value || '';
      loadMemberList(q);
    }
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
      document.body.classList.add('pc-mode');
    } else {
      if (mobileHeader) mobileHeader.style.display = 'block';
      if (pcHeader) pcHeader.style.display = 'none';
      if (pcLayout) pcLayout.style.display = 'none';
      const screenAdmin = document.getElementById('screen-admin');
      if (mobileBody && screenAdmin) screenAdmin.appendChild(mobileBody);
      if (mobileBody) mobileBody.style.display = 'block';
      // 모바일 모드: max-width 복원
      if (appEl) { appEl.style.maxWidth = '430px'; appEl.style.width = ''; }
      document.body.classList.remove('pc-mode');
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
                <div style="font-size:11px;color:var(--text-hint);margin-top:2px;">${m.type ? m.type + ' · ' : ''}잔여 <span id="rpt-remain-${m.traineeId}" style="font-weight:700;color:var(--blue);">${m.remain}</span>회 / 전체 <span id="rpt-total-${m.traineeId}">${m.total}</span>회</div>
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
        regSnap.forEach(child => { allRegs.push({ key: child.key, ...child.val() }); });
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
      regSnap.forEach(child => { allRegs.push({ key: child.key, ...child.val() }); });
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
            const nick = localStorage.getItem('nickname_' + phone) || info.name;
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

  let _lastMemberData = [];
  let _memberFilters = {
    program: 'all', status: 'all', payment: 'all', locker: 'all', sort: 'none',
    gender: 'all', dateBasis: 'none', dateStart: '', dateEnd: '',
    remainMax: 'all', attendGap: 'all', unpaidMin: '', ageBand: 'all'
  };

  function _calcAgeFromBirthAdmin(birth) {
    if (!birth) return null;
    const str = String(birth);
    let y, mo, d;
    const withSep = str.match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})/);
    if (withSep) {
      y = +withSep[1]; mo = +withSep[2]; d = +withSep[3];
    } else if (/^\d{8}$/.test(str)) {
      // 회원등록/수정 화면에서 실제로 쓰는 형식 (예: "19900101")
      y = +str.slice(0, 4); mo = +str.slice(4, 6); d = +str.slice(6, 8);
    } else {
      return null;
    }
    const birthDate = new Date(y, mo - 1, d);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const md = today.getMonth() - birthDate.getMonth();
    if (md < 0 || (md === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  }

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
      // Firebase에서 출석/포인트/계약 병렬 조회
      const now = new Date();
      const todayISO = _pgTodayISO();
      const monthPrefix = now.getFullYear() + '-' + (now.getMonth()+1) + '-';

      // 개인수업(PT/개인필라테스) 잔여횟수는 trainers/*/trainees/{phone}에 있어서, 회원별로 따로 조회하지 않고 한 번만 불러와 맵으로 만들어둠
      db.ref('trainers').once('value').then(trainersSnap => {
        const personalRemainMap = {};
        trainersSnap.forEach(t => {
          const trainees = t.child('trainees');
          trainees.forEach(tr => { personalRemainMap[tr.key] = tr.val(); });
        });

        Promise.all(entries.map(([phone, info]) =>
          Promise.all([
            db.ref('users/' + phone + '/attendance').once('value'),
            db.ref('users/' + phone + '/points').once('value'),
            db.ref('contracts/' + phone).once('value'),
            db.ref('pilates_group/' + phone).once('value')
          ]).then(([attSnap, ptsSnap, contractsSnap, pgSnap]) => {
            const attendData = attSnap.val() || {};
            const attendCount = Object.keys(attendData).filter(k => k.startsWith(monthPrefix)).length ||
              (() => { let c=0; for(let d=1;d<=31;d++) { if(localStorage.getItem('attend_'+phone+'_'+monthPrefix+d)==='done') c++; } return c; })();
            const pts = ptsSnap.val() ?? localStorage.getItem('points_' + phone) ?? '0';
            localStorage.setItem('points_' + phone, String(pts));
            const nick = localStorage.getItem('nickname_' + phone) || '-';

            // 마지막 출석일 (모든 출석기록 중 가장 최근 날짜) → 미출석 기간 계산용
            let lastAttendDate = null;
            Object.keys(attendData).forEach(k => {
              const parts = k.split('-').map(n => parseInt(n, 10));
              if (parts.length === 3 && !isNaN(parts[0])) {
                const dstr = parts[0] + '-' + String(parts[1]).padStart(2, '0') + '-' + String(parts[2]).padStart(2, '0');
                if (!lastAttendDate || dstr > lastAttendDate) lastAttendDate = dstr;
              }
            });
            const daysSinceLastAttend = lastAttendDate
              ? Math.floor((new Date(todayISO + 'T00:00:00') - new Date(lastAttendDate + 'T00:00:00')) / 86400000)
              : null; // null = 출석기록이 아예 없음

            // 계약이력에서 활성 항목 + 미수금 + 가입일(최초 계약일) 뽑기
            const activeItems = [];
            let hasUnpaid = false;
            let unpaidAmount = 0;
            const signDates = [];
            contractsSnap.forEach(cSnap => {
              const c = cSnap.val();
              if (c.signDate) signDates.push(c.signDate);
              _flattenContractItems(c).forEach(it => {
                if (!_isItemEligible(it.data)) return;
                const unpaid = (it.data.price || 0) - ((it.data.cash||0) + (it.data.card||0) + (it.data.transfer||0));
                if (unpaid > 0) { hasUnpaid = true; unpaidAmount += unpaid; }
                activeItems.push(it);
              });
            });
            const joinDate = signDates.length ? signDates.sort()[0] : '-';

            // 필터/정렬용 계산값 미리 뽑아두기 (프로그램 목록/상태/락카배정여부/최소잔여일/만료일)
            const progNames = [];
            let minRemainDays = null;
            let maxEndDate = null; // 날짜범위 필터(만료일 기준)용 - 가장 늦은 만료일 기준
            let anyOnHold = false;
            activeItems.forEach(it => {
              const label = REFUND_PROG_NAMES[it.progKey] || it.progKey;
              if (!progNames.includes(label)) progNames.push(label);
              const onHold = _isActivelyOnHold(it.data);
              if (onHold) anyOnHold = true;
              const endDate = onHold ? (it.data.activeHold && it.data.activeHold.newEndDate) : it.data.endDate;
              if (endDate) {
                const d = _daysUntil(endDate);
                if (d !== null && (minRemainDays === null || d < minRemainDays)) minRemainDays = d;
                if (!maxEndDate || endDate > maxEndDate) maxEndDate = endDate;
              }
            });
            let statusKey = 'none', statusLabel = '-', statusColor = 'var(--text-hint)';
            if (activeItems.length > 0) {
              if (anyOnHold) { statusKey = 'hold'; statusLabel = '⏸️ 휴회중'; statusColor = '#f59e0b'; }
              else if (minRemainDays !== null && minRemainDays < 0) { statusKey = 'expired'; statusLabel = '만료됨'; statusColor = '#ef4444'; }
              else if (minRemainDays !== null && minRemainDays <= 7) { statusKey = 'expiring'; statusLabel = '⚠️ 만료임박'; statusColor = '#f59e0b'; }
              else { statusKey = 'normal'; statusLabel = '정상'; statusColor = '#22c55e'; }
            }
            const lockerAssigned = !!info.lockerKey;

            // 성별
            const gender = (info.body && info.body.gender) || info['body/gender'] || null;

            // 나이
            const age = _calcAgeFromBirthAdmin(info.birth);

            // 횟수제(PT/개인필라테스/그룹필라테스) 잔여 중 최솟값 — "잔여횟수 임박" 필터용
            const personal = personalRemainMap[phone];
            const pg = pgSnap.val();
            const countRemains = [];
            if (personal && personal.remain != null) countRemains.push(personal.remain);
            if (pg && pg.remain != null) countRemains.push(pg.remain);
            const minCountRemain = countRemains.length ? Math.min(...countRemains) : null;

            return { phone, info, attendCount, pts: Number(pts) || 0, nick, activeItems, hasUnpaid, unpaidAmount, joinDate, maxEndDate, progNames, statusKey, statusLabel, statusColor, minRemainDays, lockerAssigned, gender, age, lastAttendDate, daysSinceLastAttend, minCountRemain };
          }).catch(() => {
            const pts = localStorage.getItem('points_' + phone) || '0';
            let attendCount = 0;
            for(let d=1;d<=31;d++) { if(localStorage.getItem('attend_'+phone+'_'+monthPrefix+d)==='done') attendCount++; }
            const nick = localStorage.getItem('nickname_' + phone) || '-';
            const gender = (info.body && info.body.gender) || info['body/gender'] || null;
            const age = _calcAgeFromBirthAdmin(info.birth);
            return { phone, info, attendCount, pts: Number(pts) || 0, nick, activeItems: [], hasUnpaid: false, unpaidAmount: 0, joinDate: '-', maxEndDate: null, progNames: [], statusKey: 'none', statusLabel: '-', statusColor: 'var(--text-hint)', minRemainDays: null, lockerAssigned: false, gender, age, lastAttendDate: null, daysSinceLastAttend: null, minCountRemain: null };
          })
        )).then(memberData => {
          _lastMemberData = memberData;
          _renderMemberListView();
        });
      });
    });
  }

  // 필터/정렬 드롭다운 값이 바뀔 때 호출 — Firebase 재조회 없이 이미 가져온 데이터로 다시 그림
  function applyMemberFilters() {
    _memberFilters.program   = document.getElementById('mf-program')?.value || 'all';
    _memberFilters.status    = document.getElementById('mf-status')?.value || 'all';
    _memberFilters.payment   = document.getElementById('mf-payment')?.value || 'all';
    _memberFilters.locker    = document.getElementById('mf-locker')?.value || 'all';
    _memberFilters.sort      = document.getElementById('mf-sort')?.value || 'none';
    _memberFilters.gender    = document.getElementById('mf-gender')?.value || 'all';
    _memberFilters.dateBasis = document.getElementById('mf-date-basis')?.value || 'none';
    _memberFilters.dateStart = document.getElementById('mf-date-start')?.value || '';
    _memberFilters.dateEnd   = document.getElementById('mf-date-end')?.value || '';
    _memberFilters.remainMax = document.getElementById('mf-remain')?.value || 'all';
    _memberFilters.attendGap = document.getElementById('mf-attend-gap')?.value || 'all';
    _memberFilters.unpaidMin = document.getElementById('mf-unpaid-min')?.value || '';
    _memberFilters.ageBand   = document.getElementById('mf-age')?.value || 'all';
    _renderMemberListView();
  }
  window.applyMemberFilters = applyMemberFilters;

  function _renderMemberListView() {
    const wrap = document.getElementById('member-list-wrap');
    if (!wrap) return;

    let data = _lastMemberData.slice();

    const f = _memberFilters;
    if (f.program !== 'all') data = data.filter(m => m.progNames.includes(f.program));
    if (f.status !== 'all') data = data.filter(m => m.statusKey === f.status);
    if (f.payment !== 'all') data = data.filter(m => (f.payment === 'unpaid') === m.hasUnpaid);
    if (f.locker !== 'all') data = data.filter(m => (f.locker === 'assigned') === m.lockerAssigned);
    if (f.gender !== 'all') data = data.filter(m => m.gender === f.gender);
    if (f.remainMax !== 'all') {
      const maxN = parseInt(f.remainMax, 10);
      data = data.filter(m => m.minCountRemain !== null && m.minCountRemain <= maxN);
    }
    if (f.attendGap !== 'all') {
      const minGap = parseInt(f.attendGap, 10);
      data = data.filter(m => m.daysSinceLastAttend === null || m.daysSinceLastAttend >= minGap);
    }
    if (f.unpaidMin) {
      const minAmt = parseInt(f.unpaidMin, 10) || 0;
      data = data.filter(m => m.unpaidAmount >= minAmt);
    }
    if (f.ageBand !== 'all') {
      data = data.filter(m => {
        if (m.age === null) return false;
        if (f.ageBand === '60+') return m.age >= 60;
        const band = parseInt(f.ageBand, 10);
        return m.age >= band && m.age < band + 10;
      });
    }
    // 날짜범위 필터 (만료일 또는 가입일 기준, 다른 필터들과 AND로 같이 적용됨)
    if (f.dateBasis !== 'none' && (f.dateStart || f.dateEnd)) {
      data = data.filter(m => {
        const target = f.dateBasis === 'expire' ? m.maxEndDate : (m.joinDate !== '-' ? m.joinDate : null);
        if (!target) return false;
        if (f.dateStart && target < f.dateStart) return false;
        if (f.dateEnd && target > f.dateEnd) return false;
        return true;
      });
    }

    if (f.sort === 'expiring') {
      data.sort((a, b) => (a.minRemainDays === null ? Infinity : a.minRemainDays) - (b.minRemainDays === null ? Infinity : b.minRemainDays));
    } else if (f.sort === 'join_new') {
      data.sort((a, b) => (b.joinDate || '').localeCompare(a.joinDate || ''));
    } else if (f.sort === 'join_old') {
      data.sort((a, b) => (a.joinDate || '').localeCompare(b.joinDate || ''));
    } else if (f.sort === 'points') {
      data.sort((a, b) => b.pts - a.pts);
    } else if (f.sort === 'name') {
      data.sort((a, b) => (a.info.name || '').localeCompare(b.info.name || '', 'ko'));
    }

    wrap.innerHTML = _renderMemberFilterBar() + _renderMemberTable(data);
  }

  // 필터/정렬 바 (PC/모바일 공통)
  function _renderMemberFilterBar() {
    const f = _memberFilters;
    const sel = (id, options) => `<select id="${id}" onchange="applyMemberFilters()" style="padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;background:var(--card);color:var(--text);font-family:'Noto Sans KR',sans-serif;">${options}</select>`;
    const opt = (val, label, current) => `<option value="${val}" ${val===current?'selected':''}>${label}</option>`;
    return `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px;">
      ${sel('mf-program', opt('all','전체 프로그램',f.program)+opt('헬스','헬스',f.program)+opt('GX','GX',f.program)+opt('PT','PT',f.program)+opt('기구필라테스 개인','기구필라테스 개인',f.program)+opt('기구필라테스 그룹','기구필라테스 그룹',f.program))}
      ${sel('mf-status', opt('all','전체 상태',f.status)+opt('normal','정상',f.status)+opt('hold','휴회중',f.status)+opt('expiring','만료임박',f.status)+opt('expired','만료됨',f.status))}
      ${sel('mf-payment', opt('all','전체 결제상태',f.payment)+opt('paid','완납',f.payment)+opt('unpaid','미수금',f.payment))}
      ${sel('mf-locker', opt('all','전체 락카',f.locker)+opt('assigned','배정됨',f.locker)+opt('unassigned','미배정',f.locker))}
      ${sel('mf-gender', opt('all','전체 성별',f.gender)+opt('male','남',f.gender)+opt('female','여',f.gender))}
      ${sel('mf-age', opt('all','전체 연령',f.ageBand)+opt('20','20대',f.ageBand)+opt('30','30대',f.ageBand)+opt('40','40대',f.ageBand)+opt('50','50대',f.ageBand)+opt('60+','60대 이상',f.ageBand))}
      ${sel('mf-remain', opt('all','전체 잔여횟수',f.remainMax)+opt('3','3회 이하',f.remainMax)+opt('2','2회 이하',f.remainMax)+opt('1','1회 이하',f.remainMax)+opt('0','0회(소진)',f.remainMax))}
      ${sel('mf-attend-gap', opt('all','전체(미출석기간)',f.attendGap)+opt('7','7일 이상 미출석',f.attendGap)+opt('14','14일 이상 미출석',f.attendGap)+opt('30','30일 이상 미출석',f.attendGap)+opt('60','60일 이상 미출석',f.attendGap))}
      <input id="mf-unpaid-min" type="number" min="0" placeholder="미수금 O원 이상" value="${f.unpaidMin}" onchange="applyMemberFilters()"
        style="width:130px;padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;background:var(--card);color:var(--text);font-family:'Noto Sans KR',sans-serif;">
      ${sel('mf-sort', opt('none','정렬 없음',f.sort)+opt('expiring','만료임박순',f.sort)+opt('join_new','가입일순(최근)',f.sort)+opt('join_old','가입일순(오래된)',f.sort)+opt('points','포인트순',f.sort)+opt('name','이름가나다순',f.sort))}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;">
      <span style="font-size:12px;color:var(--text-hint);">날짜범위</span>
      ${sel('mf-date-basis', opt('none','기준 선택 안함',f.dateBasis)+opt('expire','만료일 기준',f.dateBasis)+opt('join','가입일 기준',f.dateBasis))}
      <input id="mf-date-start" type="date" value="${f.dateStart}" onchange="applyMemberFilters()"
        style="padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;background:var(--card);color:var(--text);font-family:'Noto Sans KR',sans-serif;">
      <span style="font-size:12px;color:var(--text-hint);">~</span>
      <input id="mf-date-end" type="date" value="${f.dateEnd}" onchange="applyMemberFilters()"
        style="padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;background:var(--card);color:var(--text);font-family:'Noto Sans KR',sans-serif;">
    </div>`;
  }

  // PC용 표 렌더링 (이름/닉네임/연락처/프로그램/잔여/락카/결제상태/상태/이번달출석/포인트/가입일)
  function _renderMemberTable(memberData) {
    const th = (label, align) => `<th style="padding:10px 8px;text-align:${align||'left'};font-size:11.5px;color:var(--text-hint);font-weight:700;white-space:nowrap;">${label}</th>`;
    if (memberData.length === 0) {
      return '<div class="empty-state">조건에 맞는 회원이 없어요</div>';
    }
    const isPc = document.body.classList.contains('pc-mode');
    const rows = memberData.map(m => {
      const { phone, info, attendCount, pts, nick, activeItems, hasUnpaid, joinDate, progNames, statusLabel, statusColor, lockerAssigned, gender } = m;
      const genderLabel = gender === 'male' ? '남' : (gender === 'female' ? '여' : '-');

      const remainParts = [];
      activeItems.forEach(it => {
        const label = REFUND_PROG_NAMES[it.progKey] || it.progKey;
        const onHold = _isActivelyOnHold(it.data);
        const endDate = onHold ? (it.data.activeHold && it.data.activeHold.newEndDate) : it.data.endDate;
        if (endDate) {
          const d = _daysUntil(endDate);
          if (d !== null) {
            const dLabel = REFUND_PERIOD_PROGS.includes(it.progKey) ? (' D-' + d) : '';
            if (isPc) {
              // PC모드: 프로그램당 한 줄로 표시 (예: "GX D-35 (~2026-08-11)")
              remainParts.push(`<div style="white-space:nowrap;margin-bottom:4px;">${label}${dLabel} (~${endDate})</div>`);
            } else {
              // 모바일: 프로그램명+D-day 한 줄, 종료일 그 아래 한 줄로 나눠서 폭을 덜 차지하게 표시
              remainParts.push(`<div style="white-space:nowrap;margin-bottom:2px;">${label}${dLabel}</div><div style="white-space:nowrap;color:var(--text-hint);margin-bottom:6px;">(~${endDate})</div>`);
            }
          }
        }
      });

      const lockerDisplay = lockerAssigned ? info.lockerKey.split('_').pop() + '번' : '미배정';

      return `<tr onclick="openMemberModal('${phone}')" style="cursor:pointer;border-bottom:1px solid var(--border);">
        <td style="padding:10px 8px;font-weight:700;color:var(--text);white-space:nowrap;">${info.name}</td>
        <td style="padding:10px 8px;text-align:center;color:var(--text-sub);white-space:nowrap;">${genderLabel}</td>
        <td style="padding:10px 8px;color:var(--text-sub);white-space:nowrap;">${nick}</td>
        <td style="padding:10px 8px;color:var(--text-sub);white-space:nowrap;">${phone}</td>
        <td style="padding:10px 8px;color:var(--text);white-space:nowrap;">${progNames.join(', ') || '-'}</td>
        <td style="padding:10px 8px;color:var(--text);font-size:12px;line-height:1.4;">${remainParts.join('') || '-'}</td>
        <td style="padding:10px 8px;color:var(--text-sub);white-space:nowrap;">${lockerDisplay}</td>
        <td style="padding:10px 8px;font-weight:600;white-space:nowrap;color:${hasUnpaid ? '#ef4444' : '#22c55e'};">${hasUnpaid ? '미수금' : '완납'}</td>
        <td style="padding:10px 8px;font-weight:600;white-space:nowrap;color:${statusColor};">${statusLabel}</td>
        <td style="padding:10px 8px;text-align:center;color:var(--text);">${attendCount}</td>
        <td style="padding:10px 8px;text-align:center;color:var(--blue);font-weight:600;">${pts}</td>
        <td style="padding:10px 8px;color:var(--text-hint);white-space:nowrap;">${joinDate}</td>
      </tr>`;
    }).join('');

    return `<div style="overflow-x:auto;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);">
      <table style="width:100%;border-collapse:collapse;font-size:13px;font-family:'Noto Sans KR',sans-serif;">
        <thead>
          <tr style="border-bottom:2px solid var(--border);background:var(--bg);">
            ${th('이름')}${th('성별','center')}${th('닉네임')}${th('연락처')}${th('프로그램')}${th('잔여')}${th('락카')}${th('결제상태')}${th('상태')}${th('이번달출석','center')}${th('포인트','center')}${th('가입일')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function searchMembers(query) { loadMemberList(query); }

  // 검색창 + 모든 드롭다운 필터(프로그램/상태/결제/락카/성별/연령대/잔여횟수/미출석기간/미수금/날짜범위) 한번에 초기화
  function resetMemberSearch() {
    const input = document.getElementById('member-search');
    if (input) input.value = '';
    _memberFilters = {
      program: 'all', status: 'all', payment: 'all', locker: 'all', sort: 'none',
      gender: 'all', dateBasis: 'none', dateStart: '', dateEnd: '',
      remainMax: 'all', attendGap: 'all', unpaidMin: '', ageBand: 'all'
    };
    loadMemberList('');
  }
  window.resetMemberSearch = resetMemberSearch;

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
    const localNick = localStorage.getItem('nickname_' + phone) || '';
    if (nickEl) nickEl.textContent = localNick ? '닉네임: ' + localNick : '닉네임: 미설정';
    db.ref('members/' + phone + '/nickname').once('value').then(nickSnap => {
      const firebaseNick = nickSnap.val() || '';
      if (firebaseNick) {
        localStorage.setItem('nickname_' + phone, firebaseNick);
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

    // 이름 입력창 (저장 시 그대로 Firebase에 들어가므로, 초기비밀번호 힌트인 "(뒤4자리)"가 지워지지 않도록 원본 그대로 채움)
    const mdEditName = document.getElementById('md-edit-name');
    if (mdEditName) mdEditName.value = info.name || '';

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

    // 사진
    const photoDiv = document.getElementById('md-photo');
    const mdDelBtn = document.getElementById('md-photo-delete-btn');
    if (info.photoUrl) {
      photoDiv.innerHTML = `<img src="${info.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />`;
      if (mdDelBtn) mdDelBtn.style.display = 'block';
    } else {
      photoDiv.innerHTML = rawName ? rawName[0] : '👤';
      photoDiv.style.fontSize = '32px';
      if (mdDelBtn) mdDelBtn.style.display = 'none';
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

    // 락카 미니카드 렌더링 — 비밀번호만 간단히 표시 (상세 기간/결제 정보는 계약이력 또는 락카탭에서 확인)
    _renderMdLockerMini(phone, info);

    // 계약이력 렌더링
    _renderMdContracts(phone);

    // 서명기록 렌더링
    _renderMdSigns(phone);
  }

  // 락카 미니카드 — 락카탭 데이터(lockerData)에 의존하지 않고 Firebase에서 직접 조회 (회원상세는 락카탭 진입 여부와 무관하게 열릴 수 있어서)
  function _renderMdLockerMini(phone, info) {
    const el = document.getElementById('md-locker-mini');
    if (!el) return;
    el.textContent = '-';
    const lockerKey = info.lockerKey;
    if (!lockerKey) { el.textContent = '미배정'; el.style.color = 'var(--text-hint)'; return; }
    db.ref('lockers/' + lockerKey).once('value').then(snap => {
      if (!snap.exists()) { el.textContent = '미배정'; el.style.color = 'var(--text-hint)'; return; }
      const d = snap.val();
      const lockerNo = d.lockerNo || lockerKey.split('_').pop();
      el.style.color = 'var(--text)';
      el.textContent = lockerNo + '번' + (d.lockPassword ? ' · ' + d.lockPassword : '');
    }).catch(() => { el.textContent = '-'; });
  }

  // 회원권현황 (구 수업현황) — 헬스/GX처럼 기간제 상품은 계약이력에서 잔여일 계산, PT/필라테스처럼 횟수제 상품은 기존처럼 강사배정 잔여횟수 표시
  // 개인수업(PT·개인필라테스, 강사배정 방식)과 그룹수업(기구필라테스그룹, pilates_group 별도 관리)은 서로 무관한 독립 카운터
  function _renderMdClassStatus(phone, info) {
    const el = document.getElementById('md-class-status');
    if (!el) return;
    Promise.all([
      db.ref('contracts/' + phone).once('value'),
      db.ref('trainers').once('value'),
      db.ref('pilates_group/' + phone).once('value')
    ]).then(([contractsSnap, trainersSnap, pgSnap]) => {
      // 1) 유효기간이 있는 모든 상품(헬스/GX 기간제 + PT/필라테스 횟수제) — 계약이력에서 아직 환불/양도/변경으로 나가지 않은 활성 항목만 추림
      // ※ 횟수제 상품도 계약서에 시작일~종료일이 저장되므로 "얼마나 남았는지" D-day는 여기서, "몇 회 남았는지" 잔여횟수는 아래 개인수업/그룹수업 박스에서 별도 표시
      const periodCards = [];
      contractsSnap.forEach(cSnap => {
        const c = cSnap.val();
        _flattenContractItems(c).forEach(it => {
          if (!REFUND_PROG_NAMES[it.progKey]) return;
          if (!_isItemEligible(it.data)) return;
          const onHold = _isActivelyOnHold(it.data);
          const endDate = onHold ? it.data.activeHold.newEndDate : it.data.endDate;
          if (!endDate) return;
          const remainDays = _daysUntil(endDate);
          if (remainDays === null) return;
          periodCards.push({
            label: (REFUND_PROG_NAMES[it.progKey] || it.progKey) + (it.pkgName ? ' (📦 ' + it.pkgName + ')' : ''),
            endDate, remainDays, onHold
          });
        });
      });
      periodCards.sort((a, b) => a.remainDays - b.remainDays); // 종료 임박한 것부터

      // 2) 횟수제 상품 — 개인수업(PT/개인필라테스, 강사배정 기준)과 그룹수업(기구필라테스그룹, pilates_group 기준)을 각각 조회
      let traineeInfo = null;
      trainersSnap.forEach(t => {
        const td = t.child('trainees/' + phone);
        if (td.exists()) traineeInfo = td.val();
      });
      const pg = pgSnap.val(); // { total, remain, updatedAt } | null

      const periodHtml = periodCards.map(p => `
        <div style="background:var(--bg);border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div>
            <div style="font-size:12.5px;font-weight:700;color:var(--text);">${p.label}${p.onHold ? ' <span style="font-size:10px;font-weight:600;color:var(--text-hint);">(휴회중)</span>' : ''}</div>
            <div style="font-size:11px;color:var(--text-hint);margin-top:2px;">~${p.endDate}</div>
          </div>
          ${p.remainDays >= 0
            ? `<div style="font-size:15px;font-weight:700;color:var(--blue);white-space:nowrap;">D-${p.remainDays}</div>`
            : `<div style="font-size:12px;font-weight:700;color:#e24b4a;white-space:nowrap;">만료됨</div>`}
        </div>`).join('');

      // 개인수업 / 그룹수업 2칸 — 배정·등록 여부와 무관하게 항상 표시 (미등록 시 0/-- 표기)
      const countHtml = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div style="background:var(--bg);border-radius:10px;padding:12px;">
            <div style="font-size:12px;font-weight:700;color:var(--text-sub);margin-bottom:8px;text-align:center;">개인수업</div>
            <div style="display:flex;justify-content:space-around;align-items:baseline;">
              <div style="text-align:center;">
                <div style="font-size:19px;font-weight:700;color:var(--blue);">${traineeInfo ? (traineeInfo.remain || 0) : 0}</div>
                <div style="font-size:10px;color:var(--text-hint);margin-top:2px;">잔여</div>
              </div>
              <div style="width:1px;height:22px;background:var(--border);"></div>
              <div style="text-align:center;">
                <div style="font-size:19px;font-weight:700;color:var(--text);">${traineeInfo ? (traineeInfo.total || 0) : 0}</div>
                <div style="font-size:10px;color:var(--text-hint);margin-top:2px;">전체</div>
              </div>
            </div>
            <div style="margin-top:8px;font-size:11px;color:var(--text-hint);text-align:center;">${traineeInfo ? (traineeInfo.type || '-') : '-'}</div>
          </div>
          <div style="background:var(--bg);border-radius:10px;padding:12px;">
            <div style="font-size:12px;font-weight:700;color:var(--text-sub);margin-bottom:8px;text-align:center;">그룹수업</div>
            <div style="display:flex;justify-content:space-around;align-items:baseline;">
              <div style="text-align:center;">
                <div style="font-size:19px;font-weight:700;color:var(--blue);">${pg ? (pg.remain || 0) : 0}</div>
                <div style="font-size:10px;color:var(--text-hint);margin-top:2px;">잔여</div>
              </div>
              <div style="width:1px;height:22px;background:var(--border);"></div>
              <div style="text-align:center;">
                <div style="font-size:19px;font-weight:700;color:var(--text);">${pg ? (pg.total || 0) : 0}</div>
                <div style="font-size:10px;color:var(--text-hint);margin-top:2px;">전체</div>
              </div>
            </div>
            <div style="margin-top:8px;font-size:11px;color:var(--text-hint);text-align:center;">${pg ? '기구필라테스' : '-'}</div>
          </div>
        </div>`;

      el.innerHTML = periodHtml + countHtml;
    }).catch(() => {
      el.innerHTML = '<div style="text-align:center;color:var(--text-hint);font-size:13px;padding:8px 0;">불러오기 실패</div>';
    });
  }

  // ── 회원상세화면 프로필 사진 변경 (계약서탭 사진기능과 완전히 분리된 별도 코드) ──

  function openMdWebcam() {
    const modal = document.getElementById('md-webcam-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        mdWebcamStream = stream;
        const video = document.getElementById('md-webcam-video');
        if (video) video.srcObject = stream;
      })
      .catch(() => {
        modal.style.display = 'none';
        showToast('카메라 권한이 필요해요. 파일 선택을 이용해주세요.', 'error');
      });
  }

  function closeMdWebcam() {
    if (mdWebcamStream) { mdWebcamStream.getTracks().forEach(t => t.stop()); mdWebcamStream = null; }
    const modal = document.getElementById('md-webcam-modal');
    if (modal) modal.style.display = 'none';
  }

  function captureMdWebcam() {
    const video  = document.getElementById('md-webcam-video');
    const canvas = document.getElementById('md-webcam-canvas');
    if (!video || !canvas) return;
    canvas.width = 300; canvas.height = 300;
    const ctx  = canvas.getContext('2d');
    const size = Math.min(video.videoWidth, video.videoHeight);
    const sx   = (video.videoWidth  - size) / 2;
    const sy   = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 300, 300);
    canvas.toBlob(blob => {
      mdPhotoBlob = blob;
      closeMdWebcam();
      _uploadMdPhotoNow(blob);
    }, 'image/jpeg', 0.7);
  }

  function onMdPhotoFile(input) {
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
          mdPhotoBlob = blob;
          _uploadMdPhotoNow(blob);
        }, 'image/jpeg', 0.7);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    input.value = ''; // 같은 파일을 다시 선택해도 onchange가 동작하도록 초기화
  }

  // 선택/촬영한 사진을 바로 Firebase에 업로드 + 저장 + 화면에 반영
  async function _uploadMdPhotoNow(blob) {
    const phone = currentMemberPhone;
    if (!phone) { showToast('회원 정보를 찾을 수 없어요.', 'error'); return; }
    showToast('사진 업로드 중...', 'info');
    try {
      const storageRef = firebase.storage().ref('members/' + phone + '/profile.jpg');
      await storageRef.put(blob, { contentType: 'image/jpeg' });
      const url = await storageRef.getDownloadURL();
      await db.ref('members/' + phone + '/photoUrl').set(url);

      // 화면 즉시 반영
      const photoDiv = document.getElementById('md-photo');
      if (photoDiv) photoDiv.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" />`;
      const delBtn = document.getElementById('md-photo-delete-btn');
      if (delBtn) delBtn.style.display = 'block';

      // 회원목록 캐시에도 반영 (목록으로 돌아갔을 때도 최신 사진이 보이도록)
      if (cachedMembers[phone]) cachedMembers[phone].photoUrl = url;

      showToast('✅ 사진이 저장됐어요!', 'success');
    } catch (e) {
      console.error('회원상세 사진 업로드 실패:', e);
      showToast('사진 업로드에 실패했어요: ' + e.message, 'error');
    }
  }

  // 프로필 사진 삭제
  function deleteMdPhoto() {
    const phone = currentMemberPhone;
    if (!phone) return;
    showConfirm('프로필 사진을 삭제할까요?', async () => {
      try {
        await firebase.storage().ref('members/' + phone + '/profile.jpg').delete().catch(() => {});
        await db.ref('members/' + phone + '/photoUrl').remove();

        const info = cachedMembers[phone];
        const rawName = info ? (info.name || '').replace(/\(\d{4}\)$/, '').trim() : '';
        const photoDiv = document.getElementById('md-photo');
        if (photoDiv) {
          photoDiv.innerHTML = rawName ? rawName[0] : '👤';
          photoDiv.style.fontSize = '26px';
        }
        const delBtn = document.getElementById('md-photo-delete-btn');
        if (delBtn) delBtn.style.display = 'none';
        if (info) delete info.photoUrl;

        showToast('🗑️ 사진을 삭제했어요.', 'success');
      } catch (e) {
        showToast('삭제에 실패했어요: ' + e.message, 'error');
      }
    });
  }

  // 회원상세에서 "새 계약서 추가" 클릭 시 — 이미 아는 정보이므로 1단계(기본정보)는 건너뛰고 바로 2단계(프로그램선택)로 이동
  async function addNewContractForMember(phone) {
    if (!phone) { showToast('회원 정보를 찾을 수 없어요.', 'error'); return; }
    try {
      const snap = await db.ref('members/' + phone).once('value');
      if (!snap.exists()) { showToast('회원 정보를 찾을 수 없어요.', 'error'); return; }
      const data = snap.val();
      const rawName = (data.name || '').replace(/\(\d{4}\)$/, '').trim();

      try { resetContract(); } catch(e) { console.error('resetContract 오류(무시):', e); }
      try { switchAdminTab('tab-register'); } catch(e) { console.error('switchAdminTab 오류(무시):', e); }
      window._ctReturnPhone = phone; // 2단계에서 "이전" 누르면 이 회원 상세화면으로 복귀

      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
      setVal('ct-name', rawName);
      setVal('ct-phone', phone);
      setVal('ct-birth', data.birth);
      setVal('ct-address', data.address);
      if (data.memo) setVal('ct-memo', data.memo);
      try { selectCtGender(data['body/gender'] || 'male'); } catch(e) { console.error('selectCtGender 오류(무시):', e); }
      try { selectCtType('re'); } catch(e) { console.error('selectCtType 오류(무시):', e); }
      if (data.photoUrl) {
        try {
          const preview = document.getElementById('ct-photo-preview');
          if (preview) preview.innerHTML = `<img src="${data.photoUrl}" style="width:100%;height:100%;object-fit:cover;" />`;
          updateCtPhotoUI(true);
        } catch(e) { console.error('사진 미리보기 오류(무시):', e); }
      }
      // 1단계는 건너뛰고 바로 2단계(프로그램 선택)로 이동
      try { ctGoStep(2); } catch(e) { console.error('ctGoStep 오류:', e); }
      showToast('✅ ' + (rawName || '회원') + '님 정보를 불러왔어요. 프로그램을 선택해주세요.', 'success');
    } catch(e) {
      showToast('정보를 불러오지 못했어요: ' + e.message, 'error');
    }
  }
  window.addNewContractForMember = addNewContractForMember;

  // 계약이력
  function _renderMdContracts(phone) {
    const el = document.getElementById('md-contracts');
    if (!el) return;
    db.ref('contracts/' + phone).once('value').then(async snap => {
      if (!snap.exists()) {
        el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-hint);font-size:13px;background:var(--card);border-radius:10px;">계약 이력이 없어요</div>';
        return;
      }
      const contracts = [];
      snap.forEach(child => { contracts.push({ key: child.key, ...child.val() }); });

      // 화면을 열 때마다 — 예정된 휴회기간이 지났는데 아직 안 정리된 항목 자동마감 (출석여부와 무관)
      const expiredUpdates = {};
      contracts.forEach(c => {
        _flattenContractItems(c).forEach(it => {
          const basePath = it.pkgIndex === null
            ? 'contracts/' + phone + '/' + c.key + '/programs/' + it.progKey
            : 'contracts/' + phone + '/' + c.key + '/packages/' + it.pkgIndex + '/items/' + it.progKey;
          const upd = _buildExpiredHoldUpdate(basePath, it.data);
          if (upd) {
            Object.assign(expiredUpdates, upd);
            it.data.activeHold = null; // 화면에 바로 정확히 보이도록 로컬에도 즉시 반영
          }
        });
      });
      if (Object.keys(expiredUpdates).length) {
        try { await db.ref().update(expiredUpdates); } catch(e) { console.error('휴회 자동마감 실패:', e); }
      }

      // 최신순 정렬
      contracts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      const progLabels = {
        '헬스':'헬스', 'GX':'GX', 'PT':'PT',
        '기구필라테스개인':'기구필라테스 개인', '기구필라테스그룹':'기구필라테스 그룹'
      };

      el.innerHTML = contracts.filter(c => _flattenContractItems(c).length > 0 || Object.values(c.extras || {}).some(e => !e.deleted)).map(c => _renderSingleContractCard(phone, c, progLabels)).join('');
    });
  }

  // 0을 채운 정확한 날짜형식(YYYY-MM-DD)을 만들어주는 헬퍼 — getToday()(workout.js, 0안채움)와는 다른 용도로,
  // endDate 비교/계산처럼 정확한 형식이 필요한 곳에서 사용
  function _isoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function _todayISO() { return _isoDate(new Date()); }

  // 오늘부터 특정 날짜(YYYY-MM-DD, 0패딩 여부 무관)까지 남은 일수 계산 — 지났으면 음수 반환
  function _daysUntil(dateStr) {
    if (!dateStr) return null;
    const parts = String(dateStr).split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    const end = new Date(parts[0], parts[1] - 1, parts[2]);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((end - today) / 86400000);
  }

  // 날짜 표시 정규화 — "2026년 7월 31일" 같은 한글 형식을 "2026-07-31" ISO 형식으로 통일
  // 이미 저장된 한글 데이터도 화면에서 일관되게 ISO 형식으로 표시됨
  function _normDate(val) {
    if (!val || val === '-') return val || '-';
    // 이미 ISO 형식이면 그대로
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    // 한글 형식("2026년 7월 31일") → ISO 변환
    const m = val.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (m) return m[1] + '-' + String(m[2]).padStart(2,'0') + '-' + String(m[3]).padStart(2,'0');
    return val; // 그 외 형식은 그대로 반환
  }
  // 날짜문자열 두 개 사이의 일수차이 (a - b, 일 단위)
  function _dateDiffDays(a, b) {
    return Math.round((new Date(a) - new Date(b)) / 86400000);
  }

  // 계약서 하나에 들어있는 모든 "프로그램" 항목을 한 줄로 펼쳐줌 (삭제된 항목은 제외)
  // - 개별로 선택한 프로그램(c.programs)과
  // - 같은 날 묶음판매로 등록한 패키지 안의 프로그램(c.packages[].items)을 모두 합쳐서 반환
  function _flattenContractItems(c) {
    const list = [];
    Object.entries(c.programs || {}).forEach(([progKey, data]) => {
      if (data.deleted) return;
      list.push({ progKey, data, pkgName: null, pkgIndex: null });
    });
    (c.packages || []).forEach((pkg, idx) => {
      Object.entries(pkg.items || {}).forEach(([progKey, data]) => {
        if (data.deleted) return;
        list.push({ progKey, data, pkgName: pkg.name || null, pkgIndex: idx });
      });
    });
    return list;
  }

  // 이미 환불됐거나 양도되어 나간 항목은 환불/양도 대상에서 제외
  function _isItemEligible(data) {
    return !data.refund && !data.transferOut && !data.progChangeOut;
  }

  // 지금 실제로 "휴회중"인지 — 날짜로만 판단 (오늘이 예정된 새종료일을 지났으면 이미 끝난 것)
  function _isActivelyOnHold(data) {
    return !!(data.activeHold && _todayISO() <= data.activeHold.newEndDate);
  }

  // 휴회 예정일이 지났는데 아직 activeHold가 안 정리된 경우, 마감처리용 업데이트 객체를 만들어줌 (없으면 null)
  // 출석 여부와 상관없이 날짜만 보고 마감 — 계획했던 휴회일수 그대로 기록하고 깨끗하게 정리
  function _buildExpiredHoldUpdate(basePath, data) {
    if (!data.activeHold) return null;
    const todayISO = _todayISO();
    if (todayISO <= data.activeHold.newEndDate) return null; // 아직 안 끝남
    const hold = data.activeHold;
    const upd = {};
    upd[basePath + '/activeHold'] = null;
    upd[basePath + '/holdHistory/' + (hold.key || String(Date.now()))] = {
      startDate: hold.startDate, plannedDays: hold.days, actualDays: hold.days,
      prevEndDate: hold.prevEndDate, resolvedEndDate: hold.newEndDate,
      createdAt: hold.processedAt, resolvedAt: Date.now(), autoClosedByDate: true
    };
    return upd;
  }

  // 개월수/횟수를 "3개월 · 4회" 같은 형태로 표시
  function _formatPeriodLabel(data) {
    const m = data.months || 0;
    const cnt = data.count || 0;
    let label = '';
    if (m) label += m + '개월';
    if (cnt) label += (label ? ' · ' : '') + cnt + '회';
    return label || '-';
  }

  // 단독 / 패키지 구분 뱃지
  function _renderPkgBadge(pkgName) {
    return pkgName
      ? `<span style="background:var(--blue-light);color:var(--blue);font-size:10px;font-weight:700;padding:2px 6px;border-radius:5px;white-space:nowrap;">📦 ${pkgName}</span>`
      : `<span style="background:var(--bg);color:var(--text-hint);font-size:10px;font-weight:600;padding:2px 6px;border-radius:5px;white-space:nowrap;">단독</span>`;
  }

  // 미수금/완납/환불완료 상태 표시 (환불이 처리된 항목은 환불완료로 표시)
  // 처리(휴회/환불/양도-보낸쪽/프로그램변경-보낸쪽) 취소 — 사용여부와 무관하게 바로 취소, 기록 안 남기고 원래 상태로 복원
  // (만약 이미 일부 사용된 상태였다면, 취소 후 '정보 수정'에서 관리자가 잔여횟수/날짜를 직접 보정)
  async function cancelProcessedAction(type, phone, contractKey, progKey) {
    showConfirm('정말 취소하시겠어요?\n원래 상태로 복원되고, 취소 기록은 남지 않아요.', async () => {
      try {
        const snap = await db.ref('contracts/' + phone + '/' + contractKey).once('value');
        if (!snap.exists()) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
        const items = _flattenContractItems(snap.val());
        const item = items.find(it => it.progKey === progKey);
        if (!item) { showToast('해당 항목을 찾을 수 없어요.', 'error'); return; }
        const basePath = item.pkgIndex === null
          ? 'contracts/' + phone + '/' + contractKey + '/programs/' + progKey
          : 'contracts/' + phone + '/' + contractKey + '/packages/' + item.pkgIndex + '/items/' + progKey;
        const data = item.data;
        const updates = {};

        if (type === 'hold') {
          if (!data.activeHold) { showToast('휴회 정보가 없어요.', 'error'); return; }
          updates[basePath + '/endDate'] = data.activeHold.prevEndDate;
          updates[basePath + '/activeHold'] = null;
        } else if (type === 'refund') {
          if (!data.refund) { showToast('환불 정보가 없어요.', 'error'); return; }
          updates[basePath + '/refund'] = null;
        } else if (type === 'transferOut') {
          if (!data.transferOut) { showToast('양도 정보가 없어요.', 'error'); return; }
          updates[basePath + '/transferOut'] = null;
        } else if (type === 'progChangeOut') {
          if (!data.progChangeOut) { showToast('변경 정보가 없어요.', 'error'); return; }
          updates[basePath + '/progChangeOut'] = null;
        } else {
          return;
        }

        await db.ref().update(updates);
        showToast('✅ 취소됐어요. 원래 상태로 복원됐어요.', 'success');
        _renderMdContracts(phone);
      } catch (e) {
        showToast('취소 처리 실패: ' + e.message, 'error');
      }
    });
  }
  window.cancelProcessedAction = cancelProcessedAction;

  function _renderCancelBtn(type, phone, contractKey, progKey) {
    return `<button onclick="cancelProcessedAction('${type}','${phone}','${contractKey}','${progKey}')"
      style="margin-top:3px;font-size:10px;color:var(--text-sub);background:none;border:1px solid var(--border);border-radius:5px;padding:2px 7px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">↩️ 취소</button>`;
  }

  function _renderItemStatusBadge(data, phone, contractKey, progKey) {
    if (_isActivelyOnHold(data)) {
      const h = data.activeHold;
      return `<div style="font-size:10.5px;color:#8b5cf6;font-weight:700;">⏸️ 휴회중 (${h.startDate}~예정 ${h.newEndDate}, ${h.days}일)</div>${_renderCancelBtn('hold', phone, contractKey, progKey)}`;
    }
    if (data.refund) {
      const methodNames = { cash: '현금', card: '카드', transfer: '계좌' };
      const dateLabel = data.refund.date ? ' · <span style="white-space:nowrap;">' + data.refund.date + '</span>' : '';
      return `<div style="font-size:10.5px;color:#a855f7;font-weight:700;">🔻 환불완료 ${(data.refund.refundAmount||0).toLocaleString()}원 · ${methodNames[data.refund.method] || data.refund.method}${dateLabel}</div>${_renderCancelBtn('refund', phone, contractKey, progKey)}`;
    }
    if (data.transferOut) {
      return `<div style="font-size:10.5px;color:#f59e0b;font-weight:700;">🔁 양도됨 → ${data.transferOut.toName || ''} · <span style="white-space:nowrap;">${data.transferOut.date || ''}</span></div>${_renderCancelBtn('transferOut', phone, contractKey, progKey)}`;
    }
    if (data.transferIn) {
      return `<div style="font-size:10.5px;color:#3b82f6;font-weight:700;">🔁 ${data.transferIn.fromName || ''}님으로부터 양도받음</div>`;
    }
    if (data.progChangeOut) {
      const o = data.progChangeOut;
      const settleLabel = o.diff > 0 ? ' · 추가결제 ' + (o.settleAmount||0).toLocaleString() + '원'
        : o.diff < 0 ? ' · 환불 ' + (o.settleAmount||0).toLocaleString() + '원'
        : '';
      const mergedNote = (o.mergedCount && o.mergedCount > 1) ? ' (' + o.mergedLabel + ' 합산 1회 발생)' : '';
      return `<div style="font-size:10.5px;color:#f59e0b;font-weight:700;">🔄 ${REFUND_PROG_NAMES[o.toProgKey]||o.toProgKey}로 변경됨${settleLabel}${mergedNote} · <span style="white-space:nowrap;">${o.date || ''}</span></div>${_renderCancelBtn('progChangeOut', phone, contractKey, progKey)}`;
    }
    if (data.progChangeIn) {
      const i = data.progChangeIn;
      const settleLabel = i.diff > 0 ? ' · 추가결제 ' + (i.settleAmount||0).toLocaleString() + '원'
        : i.diff < 0 ? ' · 환불 ' + (i.settleAmount||0).toLocaleString() + '원'
        : '';
      const fromLabel = i.fromLabel || (REFUND_PROG_NAMES[i.fromProgKey]||i.fromProgKey);
      return `<div style="font-size:10.5px;color:#3b82f6;font-weight:700;">🔄 ${fromLabel}에서 변경됨 (잔여가치 ${(i.remainValueCarried||0).toLocaleString()}원 이전${settleLabel})</div>`;
    }

    const amt = data.price || 0;
    const paid = (data.cash||0) + (data.card||0) + (data.transfer||0);
    const unpaid = amt - paid;
    const methodLabel = _paymentMethodLabel(data);
    const methodPrefix = methodLabel ? methodLabel + ' · ' : '';
    const holdNote = (data.holdHistory && Object.keys(data.holdHistory).length)
      ? ' · 휴회누적 ' + Object.values(data.holdHistory).reduce((s,x)=>s+(x.actualDays||0),0) + '일'
      : '';
    return unpaid > 0
      ? `<div style="font-size:10.5px;color:#ef4444;font-weight:700;">${methodPrefix}미수금 ${unpaid.toLocaleString()}원${holdNote}</div>`
      : `<div style="font-size:10.5px;color:#22c55e;font-weight:600;">${methodPrefix}완납 ✓${holdNote}</div>`;
  }

  // 현금/카드/계좌 중 실제로 결제된 수단만 골라서 표시용 문자열로 만듦 (한 가지면 이름만, 여러 개면 금액과 함께 + 로 연결)
  function _paymentMethodLabel(data) {
    const methods = [];
    if (data.cash) methods.push(['현금', data.cash]);
    if (data.card) methods.push(['카드', data.card]);
    if (data.transfer) methods.push(['계좌', data.transfer]);
    if (methods.length === 0) return '';
    if (methods.length === 1) return methods[0][0];
    return methods.map(([n, a]) => n + ' ' + a.toLocaleString()).join(' + ');
  }

  // 단독 계약 카드 (다른 계약서와 패키지로 묶이지 않은 일반 계약서)
  function _renderSingleContractCard(phone, c, progLabels) {
    const items = _flattenContractItems(c);
    const totalAmt = items.reduce((s, it) => s + (it.data.price || 0), 0);
    const totalPaid = items.reduce((s, it) => s + (it.data.cash||0) + (it.data.card||0) + (it.data.transfer||0), 0);
    // 소프트삭제된 부가서비스는 금액 합산/표시에서 제외
    const extrasList = Object.entries(c.extras || {}).filter(([, e]) => !e.deleted);
    const extrasAmt = extrasList.reduce((s, [, e]) => s + (e.price || 0), 0);
    const grandTotal = totalAmt + extrasAmt;
    const grandPaid = totalPaid + extrasList.reduce((s, [, e]) => s + (e.cash||0) + (e.card||0) + (e.transfer||0), 0);
    const grandUnpaid = grandTotal - grandPaid;
    const menuId = 'cmenu-' + c.key;

    const itemRows = items.map(it => {
      const amt = it.data.price || 0;
      const startLabel = _normDate(it.data.startDate);
      const endLabel = _normDate(it.data.endDate);
      const monthsLabel = it.data.months ? it.data.months + '개월' : '-';
      const countLabel  = it.data.count  ? it.data.count  + '회'   : '-';
      return `<div class="md-item-row" style="padding:8px 0;border-top:1px solid var(--border);">
        <!-- 모바일: flex | PC: grid 7컬럼 (md-col-* 직접 배치, display:contents 미사용) -->
        <div class="md-col-prog">
          <div style="font-size:12.5px;font-weight:700;color:var(--text);white-space:nowrap;">${progLabels[it.progKey] || it.progKey} ${_renderPkgBadge(it.pkgName)}</div>
          <div class="md-col-prog-sub" style="font-size:11px;color:var(--text-hint);margin-top:2px;">${_formatPeriodLabel(it.data)}</div>
          ${(startLabel !== '-' || endLabel !== '-') ? `<div class="md-col-daterange" style="font-size:11px;color:var(--text-hint);margin-top:2px;">${startLabel} ~ ${endLabel}</div>` : ''}
        </div>
        <div class="md-col-months" style="display:none;font-size:12px;color:var(--text);">${monthsLabel}</div>
        <div class="md-col-count"  style="display:none;font-size:12px;color:var(--text);">${countLabel}</div>
        <div class="md-col-start"  style="display:none;font-size:12px;color:var(--text);">${startLabel}</div>
        <div class="md-col-end"    style="display:none;font-size:12px;color:var(--text);">${endLabel}</div>
        <div class="md-col-right" style="margin-left:auto;display:flex;align-items:center;justify-content:flex-end;gap:10px;">
          <div class="md-col-amount" style="font-size:12.5px;font-weight:700;color:var(--text);white-space:nowrap;">${amt.toLocaleString()}원</div>
          <div class="md-col-status" style="font-size:11px;white-space:nowrap;">${_renderItemStatusBadge(it.data, phone, c.key, it.progKey)}</div>
        </div>
      </div>`;
    }).join('');

    // 부가서비스(운동복/락카) 행 — 프로그램과 달리 환불/양도/휴회는 지원하지 않고 정보수정/삭제만 가능
    const extraRows = extrasList.map(([extKey, e]) => _renderExtraRow(phone, c.key, extKey, e)).join('');

    const itemHeader = (items.length || extrasList.length) ? `<div class="md-item-colhead" style="display:none;">
      <div style="text-align:left;">프로그램</div>
      <div style="text-align:center;">기간</div>
      <div style="text-align:center;">횟수</div>
      <div style="text-align:center;">시작일</div>
      <div style="text-align:center;">종료일</div>
      <div style="text-align:right;">금액 · 결제상태</div>
    </div>` : '';

    // 프로그램 없이 부가서비스만 있는 계약(락카탭 직접배정 등)은 신규/재등록 대신 "부가서비스"로 표시
    const typeLabel = items.length === 0 && extrasList.length > 0 ? '부가서비스' : (c.type === 're' ? '재등록' : '신규');

    return `<div style="background:var(--card);border-radius:10px;padding:16px;border:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="font-size:13px;font-weight:700;color:var(--text);">${c.signDate || '-'} · ${typeLabel}</div>
          <button onclick="openSignDateEdit('${phone}','${c.key}','${c.signDate||''}')"
            style="font-size:10px;color:var(--text-hint);background:none;border:1px solid var(--border);border-radius:5px;padding:1px 6px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;line-height:1.6;">✏️</button>
        </div>
        <div style="text-align:right;">
          <div style="font-size:13px;font-weight:700;color:var(--text);">${grandTotal.toLocaleString()}원</div>
          ${grandUnpaid > 0 ? `<div style="font-size:11px;color:#ef4444;font-weight:700;">미수금 ${grandUnpaid.toLocaleString()}원</div>` : `<div style="font-size:11px;color:#22c55e;font-weight:600;">완납 ✓</div>`}
        </div>
      </div>
      ${itemHeader}
      ${itemRows}
      ${extraRows}
      ${c.memo ? `<div style="background:var(--bg);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text-sub);margin-top:10px;margin-bottom:10px;">📌 ${c.memo}</div>` : ''}
      ${grandUnpaid > 0 ? `
      <button onclick="payMemberUnpaid('${phone}','${c.key}',${grandUnpaid})"
        style="width:100%;padding:8px;background:#fff7ed;color:#ea580c;border:1.5px solid #fed7aa;border-radius:var(--radius-sm);font-size:12px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-top:10px;margin-bottom:8px;">
        💳 미수금 ${grandUnpaid.toLocaleString()}원 결제처리
      </button>` : ''}
      ${(items.length > 0 || extrasList.length > 0) ? _renderContractMenuButton(menuId, phone, c.key, null, '처리') : ''}
    </div>`;
  }

  // 계약이력 결제일(signDate) 수정
  function openSignDateEdit(phone, contractKey, currentDate) {
    document.getElementById('app-signdate-edit')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-signdate-edit';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;';
    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:24px;width:100%;max-width:280px;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:15px;font-weight:700;margin-bottom:14px;color:var(--text,#1a1a1a);">📅 결제일 수정</div>
      <div style="font-size:12px;color:#888;margin-bottom:6px;">변경할 결제일</div>
      <input id="sde-date" type="date" value="${currentDate}"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:18px;font-family:'Noto Sans KR',sans-serif;">
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('app-signdate-edit').remove()"
          style="flex:1;padding:11px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">취소</button>
        <button onclick="_saveSignDate('${phone}','${contractKey}')"
          style="flex:1;padding:11px;background:var(--blue,#3b82f6);border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">저장</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }

  async function _saveSignDate(phone, contractKey) {
    const newDate = document.getElementById('sde-date')?.value;
    if (!newDate) { showToast('날짜를 선택해주세요.', 'error'); return; }
    try {
      await db.ref('contracts/' + phone + '/' + contractKey + '/signDate').set(newDate);
      document.getElementById('app-signdate-edit')?.remove();
      showToast('✅ 결제일이 수정됐어요.', 'success');
      _renderMdContracts(phone);
    } catch(e) {
      showToast('수정 실패: ' + e.message, 'error');
    }
  }
  window.openSignDateEdit = openSignDateEdit;
  window._saveSignDate = _saveSignDate;

  // 부가서비스(운동복/락카) 라벨
  function _extraLabel(key, e) {
    if (key === 'cloth') return '👕 운동복';
    if (key === 'locker') return '🔑 개인 락카' + (e.lockerNo ? ' (' + e.lockerNo + '번)' : '');
    return key;
  }

  // 부가서비스 항목 한 줄 렌더링 — 프로그램용 환불/양도/휴회 시스템과 완전히 분리된 단순 결제관리(수정/삭제)만 지원
  function _renderExtraRow(phone, contractKey, extKey, e) {
    const amt = e.price || 0;
    const paid = (e.cash||0) + (e.card||0) + (e.transfer||0);
    const unpaid = amt - paid;
    const startLabel = _normDate(e.startDate);
    const endLabel = _normDate(e.endDate);
    const methodLabel = _paymentMethodLabel(e);
    const statusHtml = unpaid > 0
      ? `<div style="font-size:10.5px;color:#ef4444;font-weight:700;">미수금 ${unpaid.toLocaleString()}원</div>`
      : `<div style="font-size:10.5px;color:#22c55e;font-weight:600;">${methodLabel ? methodLabel + ' · ' : ''}완납 ✓</div>`;
    return `<div class="md-item-row" style="padding:8px 0;border-top:1px solid var(--border);">
      <div class="md-col-prog">
        <div style="font-size:12.5px;font-weight:700;color:var(--text);white-space:nowrap;">${_extraLabel(extKey, e)}</div>
      </div>
      <div class="md-col-months" style="display:none;font-size:12px;color:var(--text-hint);">-</div>
      <div class="md-col-count"  style="display:none;font-size:12px;color:var(--text-hint);">-</div>
      <div class="md-col-start"  style="display:none;font-size:12px;color:var(--text);">${startLabel}</div>
      <div class="md-col-end"    style="display:none;font-size:12px;color:var(--text);">${endLabel}</div>
      <div class="md-col-right" style="margin-left:auto;display:flex;align-items:center;justify-content:flex-end;gap:10px;">
        <div class="md-col-amount" style="font-size:12.5px;font-weight:700;color:var(--text);white-space:nowrap;">${amt.toLocaleString()}원</div>
        <div class="md-col-status" style="font-size:11px;white-space:nowrap;text-align:right;">
          ${statusHtml}
        </div>
      </div>
    </div>`;
  }

  // 처리▾ 버튼 + 펼침 메뉴 (단독카드/패키지프로그램별 공통으로 사용)
  function _renderContractMenuButton(menuId, phone, contractKeyOrKeys, progKey, label) {
    const actions = [
      { icon: '✏️', name: '정보 수정', act: 'edit' },
      { icon: '💰', name: '환불', act: 'refund' },
      { icon: '🔁', name: '양도', act: 'transfer' },
      { icon: '🔄', name: '프로그램 변경', act: 'change' },
      { icon: '⏸️', name: '정지/휴회', act: 'pause' },
    ];
    const progArg = progKey ? `'${progKey}'` : 'null';
    const itemsHtml = actions.map(a =>
      `<button onclick="handleContractAction('${a.act}','${phone}','${contractKeyOrKeys}',${progArg})"
        style="width:100%;text-align:left;padding:9px 12px;background:none;border:none;border-top:1px solid var(--border);font-size:12.5px;color:var(--text);cursor:pointer;font-family:'Noto Sans KR',sans-serif;">${a.icon} ${a.name}</button>`
    ).join('');
    return `<div style="position:relative;" class="md-contract-menu">
        <button onclick="toggleContractMenu('${menuId}')"
          style="width:100%;padding:8px;background:var(--card);color:var(--text-sub);border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-weight:600;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">${label} ▾</button>
        <div id="${menuId}" class="contract-action-menu" style="display:none;margin-top:4px;background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden;">
          ${itemsHtml}
        </div>
      </div>`;
  }

  // 처리▾ 메뉴 펼치기/접기 (다른 곳에서 열려있던 메뉴는 자동으로 닫음)
  function toggleContractMenu(menuId) {
    document.querySelectorAll('.contract-action-menu').forEach(m => {
      if (m.id !== menuId) m.style.display = 'none';
    });
    const menu = document.getElementById(menuId);
    if (!menu) return;
    menu.style.display = (menu.style.display === 'none' || !menu.style.display) ? 'block' : 'none';
  }

  // 처리 메뉴 항목 클릭 시 실행 (환불은 실제 동작, 나머지는 다음 단계에서 차례로 채워질 예정)
  function handleContractAction(act, phone, contractKeyOrKeys, progKey) {
    if (act === 'refund' && contractKeyOrKeys.indexOf(',') === -1) {
      document.querySelectorAll('.contract-action-menu').forEach(m => m.style.display = 'none');
      startRefund(phone, contractKeyOrKeys, progKey);
      return;
    }
    const names = { edit: '정보 수정', refund: '환불', transfer: '양도', change: '프로그램 변경', pause: '정지/휴회' };
    if (act === 'edit' && contractKeyOrKeys.indexOf(',') === -1) {
      document.querySelectorAll('.contract-action-menu').forEach(m => m.style.display = 'none');
      openItemEditModal(phone, contractKeyOrKeys, progKey);
      return;
    }
    if (act === 'refund') {
      showToast('패키지 전체 환불 기능은 다음 업데이트에서 추가될 예정이에요! 프로그램별로 따로 환불해주세요.', 'info');
      return;
    }
    if (act === 'transfer' && contractKeyOrKeys.indexOf(',') === -1) {
      document.querySelectorAll('.contract-action-menu').forEach(m => m.style.display = 'none');
      startTransfer(phone, contractKeyOrKeys, progKey);
      return;
    }
    if (act === 'change' && contractKeyOrKeys.indexOf(',') === -1) {
      document.querySelectorAll('.contract-action-menu').forEach(m => m.style.display = 'none');
      startProgChange(phone, contractKeyOrKeys, progKey);
      return;
    }
    if (act === 'pause' && contractKeyOrKeys.indexOf(',') === -1) {
      document.querySelectorAll('.contract-action-menu').forEach(m => m.style.display = 'none');
      startHold(phone, contractKeyOrKeys, progKey);
      return;
    }
    showToast((names[act] || act) + ' 기능은 다음 업데이트에서 추가될 예정이에요!', 'info');
  }

  // ══════════════ 정보 수정 / 항목 삭제 ══════════════
  function openItemEditModal(phone, contractKey, progKey) {
    document.getElementById('app-edit-picker')?.remove();
    db.ref('contracts/' + phone + '/' + contractKey).once('value').then(snap => {
      if (!snap.exists()) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
      const c = snap.val();
      const items = _flattenContractItems(c);
      // 부가서비스(운동복/락카)도 "정보 수정" 대상에 함께 포함 — 삭제된 항목은 제외
      const extrasList = Object.entries(c.extras || {}).filter(([, e]) => !e.deleted);
      if (progKey) {
        const item = items.find(it => it.progKey === progKey);
        if (!item) { showToast('해당 항목을 찾을 수 없어요.', 'error'); return; }
        _renderItemEditForm(phone, contractKey, item);
        return;
      }
      const totalCount = items.length + extrasList.length;
      if (totalCount === 1) {
        if (items.length === 1) {
          _renderItemEditForm(phone, contractKey, items[0]);
        } else {
          openExtraEditModal(phone, contractKey, extrasList[0][0]);
        }
      } else if (totalCount > 1) {
        _showEditItemPicker(phone, contractKey, items, extrasList);
      } else {
        showToast('수정할 항목이 없어요.', 'error');
      }
    });
  }

  function _showEditItemPicker(phone, contractKey, items, extrasList) {
    extrasList = extrasList || [];
    const modal = document.createElement('div');
    modal.id = 'app-edit-picker';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;';
    const itemBtns = items.map(it => {
      const label = (REFUND_PROG_NAMES[it.progKey] || it.progKey) + (it.pkgName ? ' (📦 ' + it.pkgName + ')' : '');
      return `<button onclick="document.getElementById('app-edit-picker').remove();openItemEditModal('${phone}','${contractKey}','${it.progKey}')"
        style="width:100%;text-align:left;padding:12px;margin-bottom:8px;background:var(--bg,#f7f7f7);border:1px solid #e0e0e0;border-radius:10px;font-size:14px;color:var(--text,#1a1a1a);cursor:pointer;font-family:'Noto Sans KR',sans-serif;">
        ${label} · ${(it.data.price||0).toLocaleString()}원</button>`;
    }).join('');
    // 부가서비스(운동복/락카) — 클릭 시 기존 부가서비스 전용 수정화면(openExtraEditModal)으로 연결
    const extraBtns = extrasList.map(([extKey, e]) => {
      const label = _extraLabel(extKey, e);
      return `<button onclick="document.getElementById('app-edit-picker').remove();openExtraEditModal('${phone}','${contractKey}','${extKey}')"
        style="width:100%;text-align:left;padding:12px;margin-bottom:8px;background:var(--bg,#f7f7f7);border:1px solid #e0e0e0;border-radius:10px;font-size:14px;color:var(--text,#1a1a1a);cursor:pointer;font-family:'Noto Sans KR',sans-serif;">
        ${label} · ${(e.price||0).toLocaleString()}원</button>`;
    }).join('');
    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:24px;width:100%;max-width:300px;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:14px;font-weight:700;margin-bottom:14px;color:var(--text,#1a1a1a);">수정할 항목을 선택하세요</div>
      ${itemBtns}
      ${extraBtns}
      <button onclick="document.getElementById('app-edit-picker').remove()"
        style="width:100%;padding:10px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:13px;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-top:4px;">취소</button>
    </div>`;
    document.body.appendChild(modal);
  }

  function _renderItemEditForm(phone, contractKey, item) {
    window._editCtx = { phone, contractKey, progKey: item.progKey, pkgIndex: item.pkgIndex };
    const data = item.data;
    document.getElementById('app-edit-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-edit-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
    const label = (REFUND_PROG_NAMES[item.progKey] || item.progKey) + (item.pkgName ? ' (📦 ' + item.pkgName + ')' : '');

    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:24px;width:100%;max-width:320px;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:15px;font-weight:700;margin-bottom:14px;color:var(--text,#1a1a1a);">✏️ 정보 수정 — ${label}</div>

      <div style="font-size:12px;color:#888;margin-bottom:4px;">시작일</div>
      <input id="ei-start" type="date" value="${data.startDate || ''}"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">

      <div style="font-size:12px;color:#888;margin-bottom:4px;">종료일</div>
      <input id="ei-end" type="date" value="${data.endDate || ''}"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">

      <div style="font-size:12px;color:#888;margin-bottom:4px;">총 금액</div>
      <input id="ei-price" type="text" inputmode="numeric" value="${(data.price || 0).toLocaleString()}" oninput="_formatMoneyInput(this)"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">

      <div style="display:flex;gap:6px;margin-bottom:14px;">
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:11px;color:#888;">현금</span>
            <button type="button" onclick="_setFullPayment('ei','cash')" style="font-size:10px;color:#3b82f6;background:none;border:none;padding:0;cursor:pointer;font-family:'Noto Sans KR',sans-serif;text-decoration:underline;">전액</button>
          </div>
          <input id="ei-cash" type="text" inputmode="numeric" value="${(data.cash || 0).toLocaleString()}" oninput="_formatMoneyInput(this)" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;">
        </div>
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:11px;color:#888;">카드</span>
            <button type="button" onclick="_setFullPayment('ei','card')" style="font-size:10px;color:#3b82f6;background:none;border:none;padding:0;cursor:pointer;font-family:'Noto Sans KR',sans-serif;text-decoration:underline;">전액</button>
          </div>
          <input id="ei-card" type="text" inputmode="numeric" value="${(data.card || 0).toLocaleString()}" oninput="_formatMoneyInput(this)" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;">
        </div>
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:11px;color:#888;">계좌</span>
            <button type="button" onclick="_setFullPayment('ei','transfer')" style="font-size:10px;color:#3b82f6;background:none;border:none;padding:0;cursor:pointer;font-family:'Noto Sans KR',sans-serif;text-decoration:underline;">전액</button>
          </div>
          <input id="ei-transfer" type="text" inputmode="numeric" value="${(data.transfer || 0).toLocaleString()}" oninput="_formatMoneyInput(this)" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;">
        </div>
      </div>

      <button onclick="_saveItemEdit()"
        style="width:100%;padding:12px;background:#3b82f6;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-bottom:8px;">저장</button>
      <button onclick="document.getElementById('app-edit-modal').remove()"
        style="width:100%;padding:10px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:13px;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-bottom:14px;">닫기</button>

      <div style="border-top:1px solid #f0f0f0;padding-top:14px;">
        <button onclick="deleteContractItem()"
          style="width:100%;padding:10px;background:#fff1f0;border:1px solid #ffccc7;border-radius:10px;font-size:13px;font-weight:700;color:#cf1322;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">🗑️ 이 항목 삭제</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }

  // 금액 입력칸에 입력할 때마다 천단위 콤마를 자동으로 붙여줌
  function _formatMoneyInput(el) {
    const digits = el.value.replace(/[^0-9]/g, '');
    el.value = digits ? parseInt(digits).toLocaleString() : '';
  }
  window._formatMoneyInput = _formatMoneyInput;

  // "전액" 버튼 — 클릭한 결제수단 칸에 총 금액 전부를 넣고 나머지 두 칸은 0으로 정리 (ei-/ee- 두 정보수정 모달 공용, prefix로 구분)
  function _setFullPayment(prefix, method) {
    const total = parseInt((document.getElementById(prefix + '-price')?.value || '0').replace(/[^0-9]/g, '')) || 0;
    ['cash', 'card', 'transfer'].forEach(m => {
      const el = document.getElementById(prefix + '-' + m);
      if (!el) return;
      el.value = (m === method ? total : 0).toLocaleString();
    });
  }
  window._setFullPayment = _setFullPayment;

  async function _saveItemEdit() {
    const ctx = window._editCtx;
    if (!ctx) return;
    try {
      const basePath = ctx.pkgIndex === null
        ? 'contracts/' + ctx.phone + '/' + ctx.contractKey + '/programs/' + ctx.progKey
        : 'contracts/' + ctx.phone + '/' + ctx.contractKey + '/packages/' + ctx.pkgIndex + '/items/' + ctx.progKey;
      const num = id => parseInt((document.getElementById(id)?.value || '0').replace(/[^0-9]/g, '')) || 0;
      const updates = {};
      updates[basePath + '/startDate'] = document.getElementById('ei-start')?.value || '';
      updates[basePath + '/endDate'] = document.getElementById('ei-end')?.value || '';
      updates[basePath + '/price'] = num('ei-price');
      updates[basePath + '/cash'] = num('ei-cash');
      updates[basePath + '/card'] = num('ei-card');
      updates[basePath + '/transfer'] = num('ei-transfer');
      await db.ref().update(updates);
      document.getElementById('app-edit-modal')?.remove();
      showToast('✅ 정보가 수정됐어요.', 'success');
      _renderMdContracts(ctx.phone);
    } catch (e) {
      showToast('수정 실패: ' + e.message, 'error');
    }
  }

  // 항목 삭제 — 소프트삭제(deleted 표시만 남김, 화면에서 숨김 + 추후 매출통계 자동 제외), 같은 계약서의 다른 항목엔 영향 없음
  function deleteContractItem() {
    const ctx = window._editCtx;
    if (!ctx) return;
    showConfirm('이 항목을 삭제하시겠어요?\n매출통계에서도 제외되고, 되돌릴 수 없어요.\n(같은 계약서의 다른 항목은 그대로 남아요)', async () => {
      try {
        const basePath = ctx.pkgIndex === null
          ? 'contracts/' + ctx.phone + '/' + ctx.contractKey + '/programs/' + ctx.progKey
          : 'contracts/' + ctx.phone + '/' + ctx.contractKey + '/packages/' + ctx.pkgIndex + '/items/' + ctx.progKey;
        await db.ref(basePath + '/deleted').set({ at: Date.now() });
        document.getElementById('app-edit-modal')?.remove();
        showToast('🗑️ 항목이 삭제됐어요.', 'success');
        _renderMdContracts(ctx.phone);
      } catch (e) {
        showToast('삭제 실패: ' + e.message, 'error');
      }
    });
  }
  window.openItemEditModal = openItemEditModal;
  window._saveItemEdit = _saveItemEdit;
  window.deleteContractItem = deleteContractItem;

  // ══════════════ 부가서비스(운동복/락카) 정보 수정 / 삭제 ══════════════
  // 프로그램용 환불/양도/휴회 시스템(pkgIndex 기반)과는 완전히 분리된 별도 함수들 — extras/{key} 경로만 사용
  function openExtraEditModal(phone, contractKey, extraKey) {
    db.ref('contracts/' + phone + '/' + contractKey + '/extras/' + extraKey).once('value').then(snap => {
      if (!snap.exists()) { showToast('해당 항목을 찾을 수 없어요.', 'error'); return; }
      _renderExtraEditForm(phone, contractKey, extraKey, snap.val());
    });
  }

  function _renderExtraEditForm(phone, contractKey, extraKey, e) {
    window._extraEditCtx = { phone, contractKey, extraKey, lockerKey: e.lockerKey || null };
    document.getElementById('app-extra-edit-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-extra-edit-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
    const label = _extraLabel(extraKey, e);

    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:24px;width:100%;max-width:320px;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:15px;font-weight:700;margin-bottom:14px;color:var(--text,#1a1a1a);">✏️ 정보 수정 — ${label}</div>

      <div style="font-size:12px;color:#888;margin-bottom:4px;">시작일</div>
      <input id="ee-start" type="date" value="${e.startDate || ''}"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">

      <div style="font-size:12px;color:#888;margin-bottom:4px;">종료일</div>
      <input id="ee-end" type="date" value="${e.endDate || ''}"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">

      <div style="font-size:12px;color:#888;margin-bottom:4px;">총 금액</div>
      <input id="ee-price" type="text" inputmode="numeric" value="${(e.price || 0).toLocaleString()}" oninput="_formatMoneyInput(this)"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">

      <div style="display:flex;gap:6px;margin-bottom:14px;">
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:11px;color:#888;">현금</span>
            <button type="button" onclick="_setFullPayment('ee','cash')" style="font-size:10px;color:#3b82f6;background:none;border:none;padding:0;cursor:pointer;font-family:'Noto Sans KR',sans-serif;text-decoration:underline;">전액</button>
          </div>
          <input id="ee-cash" type="text" inputmode="numeric" value="${(e.cash || 0).toLocaleString()}" oninput="_formatMoneyInput(this)" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;">
        </div>
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:11px;color:#888;">카드</span>
            <button type="button" onclick="_setFullPayment('ee','card')" style="font-size:10px;color:#3b82f6;background:none;border:none;padding:0;cursor:pointer;font-family:'Noto Sans KR',sans-serif;text-decoration:underline;">전액</button>
          </div>
          <input id="ee-card" type="text" inputmode="numeric" value="${(e.card || 0).toLocaleString()}" oninput="_formatMoneyInput(this)" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;">
        </div>
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:11px;color:#888;">계좌</span>
            <button type="button" onclick="_setFullPayment('ee','transfer')" style="font-size:10px;color:#3b82f6;background:none;border:none;padding:0;cursor:pointer;font-family:'Noto Sans KR',sans-serif;text-decoration:underline;">전액</button>
          </div>
          <input id="ee-transfer" type="text" inputmode="numeric" value="${(e.transfer || 0).toLocaleString()}" oninput="_formatMoneyInput(this)" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;">
        </div>
      </div>

      <button onclick="_saveExtraEdit()"
        style="width:100%;padding:12px;background:#3b82f6;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-bottom:8px;">저장</button>
      <button onclick="document.getElementById('app-extra-edit-modal').remove()"
        style="width:100%;padding:10px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:13px;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-bottom:14px;">닫기</button>

      <div style="border-top:1px solid #f0f0f0;padding-top:14px;">
        <button onclick="deleteExtraItem()"
          style="width:100%;padding:10px;background:#fff1f0;border:1px solid #ffccc7;border-radius:10px;font-size:13px;font-weight:700;color:#cf1322;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">🗑️ 이 항목 삭제</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }

  async function _saveExtraEdit() {
    const ctx = window._extraEditCtx;
    if (!ctx) return;
    try {
      const basePath = 'contracts/' + ctx.phone + '/' + ctx.contractKey + '/extras/' + ctx.extraKey;
      const num = id => parseInt((document.getElementById(id)?.value || '0').replace(/[^0-9]/g, '')) || 0;
      const newStart = document.getElementById('ee-start')?.value || '';
      const newEnd   = document.getElementById('ee-end')?.value || '';
      const updates = {};
      updates[basePath + '/startDate'] = newStart;
      updates[basePath + '/endDate'] = newEnd;
      updates[basePath + '/price'] = num('ee-price');
      updates[basePath + '/cash'] = num('ee-cash');
      updates[basePath + '/card'] = num('ee-card');
      updates[basePath + '/transfer'] = num('ee-transfer');
      // 락카 항목이고 연결된 락카(lockers/)가 있으면 — 날짜를 거기에도 같이 반영 (양방향 동기화)
      if (ctx.lockerKey) {
        updates['lockers/' + ctx.lockerKey + '/startDate'] = newStart;
        updates['lockers/' + ctx.lockerKey + '/endDate'] = newEnd;
        if (lockerData[ctx.lockerKey]) {
          lockerData[ctx.lockerKey].startDate = newStart;
          lockerData[ctx.lockerKey].endDate = newEnd;
        }
      }
      await db.ref().update(updates);
      document.getElementById('app-extra-edit-modal')?.remove();
      showToast('✅ 정보가 수정됐어요.', 'success');
      _renderMdContracts(ctx.phone);
    } catch (e) {
      showToast('수정 실패: ' + e.message, 'error');
    }
  }

  // 부가서비스 항목 삭제 — 소프트삭제(결제기록만 숨김). 실제 배정된 락카(lockers/)는 건드리지 않음 — 락카 자체 해제는 락카탭에서 별도로
  function deleteExtraItem() {
    const ctx = window._extraEditCtx;
    if (!ctx) return;
    showConfirm('이 항목을 삭제하시겠어요?\n매출통계에서도 제외되고, 되돌릴 수 없어요.\n(실제 배정된 락카는 그대로 유지돼요 — 락카를 해제하려면 락카탭에서 해제해주세요)', async () => {
      try {
        const basePath = 'contracts/' + ctx.phone + '/' + ctx.contractKey + '/extras/' + ctx.extraKey;
        await db.ref(basePath + '/deleted').set({ at: Date.now() });
        document.getElementById('app-extra-edit-modal')?.remove();
        showToast('🗑️ 항목이 삭제됐어요.', 'success');
        _renderMdContracts(ctx.phone);
      } catch (e) {
        showToast('삭제 실패: ' + e.message, 'error');
      }
    });
  }
  window.openExtraEditModal = openExtraEditModal;
  window._saveExtraEdit = _saveExtraEdit;
  window.deleteExtraItem = deleteExtraItem;

  // ══════════════ 환불 기능 ══════════════
  const REFUND_PERIOD_PROGS = ['헬스', 'GX']; // 기간제 — 위약금10%+사용일수 자동계산 / 그 외는 횟수제(직접입력)
  const REFUND_PROG_NAMES = { '헬스':'헬스', 'GX':'GX', 'PT':'PT', '기구필라테스개인':'기구필라테스 개인', '기구필라테스그룹':'기구필라테스 그룹' };

  // 환불 시작 — progKey가 없으면(여러 프로그램이 있는 계약서) 먼저 어떤 프로그램을 환불할지 선택하게 함
  function startRefund(phone, contractKey, progKey) {
    db.ref('contracts/' + phone + '/' + contractKey).once('value').then(snap => {
      if (!snap.exists()) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
      if (progKey) {
        openRefundModal(phone, contractKey, progKey);
        return;
      }
      const items = _flattenContractItems(snap.val()).filter(it => _isItemEligible(it.data));
      if (items.length === 1) {
        openRefundModal(phone, contractKey, items[0].progKey);
      } else if (items.length > 1) {
        _showRefundItemPicker(phone, contractKey, items);
      } else {
        showToast('환불할 프로그램이 없어요.', 'error');
      }
    });
  }

  // 환불할 항목 체크박스 선택 — 휴회와 동일한 UI 패턴
  function _showRefundItemPicker(phone, contractKey, items) {
    document.getElementById('app-refund-picker')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-refund-picker';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;';
    window._refundPickerItems = items;
    const itemRows = items.map((it, idx) => {
      const label = (REFUND_PROG_NAMES[it.progKey] || it.progKey) + (it.pkgName ? ' (📦 ' + it.pkgName + ')' : '');
      return `<label style="display:flex;align-items:center;gap:8px;width:100%;padding:12px;margin-bottom:8px;background:var(--bg,#f7f7f7);border:1px solid #e0e0e0;border-radius:10px;font-size:14px;color:var(--text,#1a1a1a);cursor:pointer;font-family:'Noto Sans KR',sans-serif;">
        <input type="checkbox" class="prf-pick-item" data-idx="${idx}" style="width:18px;height:18px;flex-shrink:0;">
        <span style="flex:1;">${label} · ${(it.data.price||0).toLocaleString()}원</span>
      </label>`;
    }).join('');
    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:24px;width:100%;max-width:300px;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:14px;font-weight:700;margin-bottom:6px;color:var(--text,#1a1a1a);">💰 환불할 프로그램을 선택하세요</div>
      <div style="font-size:11.5px;color:#888;margin-bottom:14px;">2개 이상 선택하면 한번에 같이 환불처리할 수 있어요</div>
      ${itemRows}
      <button onclick="_refundPickerNext('${phone}','${contractKey}')"
        style="width:100%;padding:11px;background:#ef4444;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-top:6px;">선택한 프로그램 환불하기</button>
      <button onclick="document.getElementById('app-refund-picker').remove()"
        style="width:100%;padding:10px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:13px;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-top:8px;">취소</button>
    </div>`;
    document.body.appendChild(modal);
  }

  function _refundPickerNext(phone, contractKey) {
    const items = window._refundPickerItems || [];
    const checked = Array.from(document.querySelectorAll('.prf-pick-item:checked')).map(el => items[parseInt(el.dataset.idx)]);
    if (!checked.length) { showToast('하나 이상 선택해주세요.', 'error'); return; }
    document.getElementById('app-refund-picker')?.remove();
    if (checked.length === 1) {
      openRefundModal(phone, contractKey, checked[0].progKey);
    } else {
      // 복수 선택 — 총 환불금액 직접 입력 모달
      _renderMultiRefundForm(phone, contractKey, checked);
    }
  }
  window._refundPickerNext = _refundPickerNext;

  // 환불 입력 화면 열기
  function openRefundModal(phone, contractKey, progKey) {
    document.getElementById('app-refund-picker')?.remove();
    db.ref('contracts/' + phone + '/' + contractKey).once('value').then(snap => {
      if (!snap.exists()) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
      const items = _flattenContractItems(snap.val());
      const item = items.find(it => it.progKey === progKey);
      if (!item) { showToast('해당 프로그램을 찾을 수 없어요.', 'error'); return; }
      if (item.data.refund) { showToast('이미 환불된 프로그램이에요.', 'error'); return; }
      if (item.data.transferOut) { showToast('양도된 프로그램은 환불할 수 없어요.', 'error'); return; }
      _renderRefundForm(phone, contractKey, item);
    });
  }

  function _renderRefundForm(phone, contractKey, item) {
    const progKey = item.progKey;
    const data = item.data;
    const isPeriod = REFUND_PERIOD_PROGS.includes(progKey);
    const price = data.price || 0;
    const startDate = data.startDate || '';
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');

    document.getElementById('app-refund-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-refund-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';

    let body = `<div style="font-size:15px;font-weight:700;margin-bottom:4px;color:var(--text,#1a1a1a);">💰 환불 — ${REFUND_PROG_NAMES[progKey]||progKey}${item.pkgName ? ' (📦 '+item.pkgName+')' : ''}</div>
      <div style="font-size:12px;color:#888;margin-bottom:16px;">등록금액 ${price.toLocaleString()}원 · 등록일 ${startDate || '-'}</div>`;

    if (isPeriod) {
      body += `
        <div style="font-size:12px;color:#888;margin-bottom:4px;">환불 처리일</div>
        <input id="rf-date" type="date" value="${todayStr}" onchange="_onRefundDateChange()"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:6px;font-family:'Noto Sans KR',sans-serif;">
        <div id="rf-days-display" style="font-size:11px;color:#aaa;margin-bottom:10px;"></div>
        <div style="font-size:12px;color:#888;margin-bottom:4px;">위약금 (등록금액의 10%, 수정 가능)</div>
        <input id="rf-penalty" type="number" value="${Math.round(price*0.1)}" oninput="_recalcRefund()"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">
        <div style="font-size:12px;color:#888;margin-bottom:4px;">사용일수 공제액 (일 3,300원 기준, 수정 가능)</div>
        <input id="rf-deduct" type="number" value="0" oninput="_recalcRefund()"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:14px;font-family:'Noto Sans KR',sans-serif;">
      `;
    } else {
      body += `
        <div style="font-size:12px;color:#888;margin-bottom:4px;">위약금 (직접 입력)</div>
        <input id="rf-penalty" type="number" value="0" oninput="_recalcRefund()"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">
        <div style="font-size:12px;color:#888;margin-bottom:4px;">사용횟수</div>
        <input id="rf-usedcount" type="number" value="0" oninput="_recalcRefund()"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:6px;font-family:'Noto Sans KR',sans-serif;">
        <div id="rf-ref-display" style="font-size:11px;color:#aaa;margin-bottom:10px;"></div>
        <div style="font-size:12px;color:#888;margin-bottom:4px;">사용횟수 차감액 (직접 입력)</div>
        <input id="rf-deduct" type="number" value="0" oninput="_recalcRefund()"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:14px;font-family:'Noto Sans KR',sans-serif;">
      `;
    }

    body += `
      <div style="font-size:12px;color:#888;margin-bottom:6px;">환불 수단</div>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <button id="rf-method-cash" onclick="_selectRefundMethod('cash')" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid var(--blue,#3b82f6);background:var(--blue,#3b82f6);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">현금</button>
        <button id="rf-method-card" onclick="_selectRefundMethod('card')" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #e0e0e0;background:none;color:#888;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">카드</button>
        <button id="rf-method-transfer" onclick="_selectRefundMethod('transfer')" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #e0e0e0;background:none;color:#888;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">계좌</button>
      </div>
      <div style="background:var(--bg,#f7f7f7);border-radius:10px;padding:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;color:#888;">환불 금액</span>
        <span id="rf-total" style="font-size:18px;font-weight:700;color:#ef4444;">0원</span>
      </div>
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('app-refund-modal').remove()" style="flex:1;padding:12px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;font-weight:700;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">취소</button>
        <button onclick="_confirmRefund('${phone}','${contractKey}','${progKey}')" style="flex:1;padding:12px;background:#ef4444;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">환불 처리</button>
      </div>
    `;

    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:22px;width:100%;max-width:320px;max-height:90vh;overflow-y:auto;font-family:'Noto Sans KR',sans-serif;">${body}</div>`;
    document.body.appendChild(modal);

    window._refundCtx = { price, isPeriod, startDate, count: data.count || 0, method: 'cash' };
    if (isPeriod) _onRefundDateChange(); else _recalcRefund();
  }

  // 기간제 — 환불처리일 바뀌면 사용일수/공제액 자동 갱신
  function _onRefundDateChange() {
    const ctx = window._refundCtx;
    if (!ctx) return;
    const dateEl = document.getElementById('rf-date');
    const display = document.getElementById('rf-days-display');
    const deductEl = document.getElementById('rf-deduct');
    if (dateEl && ctx.startDate) {
      const start = new Date(ctx.startDate);
      const sel = new Date(dateEl.value);
      const days = Math.max(0, Math.round((sel - start) / 86400000));
      if (display) display.textContent = '사용일수 ' + days + '일 (3,300원 × ' + days + '일)';
      if (deductEl) deductEl.value = days * 3300;
    }
    _recalcRefund();
  }

  // 환불 금액 실시간 계산
  function _recalcRefund() {
    const ctx = window._refundCtx;
    if (!ctx) return;
    const penalty = parseInt(document.getElementById('rf-penalty')?.value) || 0;
    const deduct = parseInt(document.getElementById('rf-deduct')?.value) || 0;
    if (!ctx.isPeriod) {
      const usedCount = parseInt(document.getElementById('rf-usedcount')?.value) || 0;
      const perUnit = ctx.count ? Math.round(ctx.price / ctx.count) : 0;
      const refDisplay = document.getElementById('rf-ref-display');
      if (refDisplay) refDisplay.textContent = '참고: 1회 정가 ' + perUnit.toLocaleString() + '원 × 사용 ' + usedCount + '회 = ' + (perUnit*usedCount).toLocaleString() + '원';
    }
    const refundAmt = Math.max(0, ctx.price - penalty - deduct);
    const totalEl = document.getElementById('rf-total');
    if (totalEl) totalEl.textContent = refundAmt.toLocaleString() + '원';
  }

  function _selectRefundMethod(method) {
    if (!window._refundCtx) return;
    window._refundCtx.method = method;
    ['cash','card','transfer'].forEach(m => {
      const btn = document.getElementById('rf-method-' + m);
      if (!btn) return;
      if (m === method) {
        btn.style.background = 'var(--blue, #3b82f6)';
        btn.style.color = 'white';
        btn.style.border = '1.5px solid var(--blue, #3b82f6)';
      } else {
        btn.style.background = 'none';
        btn.style.color = '#888';
        btn.style.border = '1.5px solid #e0e0e0';
      }
    });
  }

  // 환불 확정 처리 — Firebase에 환불 기록 저장 (잔여횟수/이용기간은 자동으로 건드리지 않음 — 점장님이 수동 종료처리)
  function _confirmRefund(phone, contractKey, progKey) {
    const ctx = window._refundCtx;
    if (!ctx) return;
    const penalty = parseInt(document.getElementById('rf-penalty')?.value) || 0;
    const deduct = parseInt(document.getElementById('rf-deduct')?.value) || 0;
    const refundAmt = Math.max(0, ctx.price - penalty - deduct);
    const method = ctx.method || 'cash';
    const refundDate = ctx.isPeriod ? (document.getElementById('rf-date')?.value || '') : '';

    showConfirm('환불 ' + refundAmt.toLocaleString() + '원을 처리할까요?\n(위약금 ' + penalty.toLocaleString() + '원, 공제 ' + deduct.toLocaleString() + '원)\n\n※ 잔여횟수/이용기간 종료는 자동으로 처리되지 않으니, 필요하면 따로 처리해주세요.', () => {
      db.ref('contracts/' + phone + '/' + contractKey).once('value').then(snap => {
        if (!snap.exists()) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
        const items = _flattenContractItems(snap.val());
        const item = items.find(it => it.progKey === progKey);
        if (!item) { showToast('해당 프로그램을 찾을 수 없어요.', 'error'); return; }
        const basePath = item.pkgIndex === null
          ? 'contracts/' + phone + '/' + contractKey + '/programs/' + progKey
          : 'contracts/' + phone + '/' + contractKey + '/packages/' + item.pkgIndex + '/items/' + progKey;
        const updates = {};
        updates[basePath + '/refund'] = {
          penalty, deduct, refundAmount: refundAmt, method,
          date: refundDate || new Date().toISOString().slice(0,10),
          processedAt: Date.now()
        };
        db.ref().update(updates).then(() => {
          document.getElementById('app-refund-modal')?.remove();
          showToast('✅ 환불 처리 완료! (' + refundAmt.toLocaleString() + '원)', 'success');
          _renderMdContracts(phone);
        });
      });
    });
  }
  window.openRefundModal = openRefundModal;
  window._onRefundDateChange = _onRefundDateChange;
  window._recalcRefund = _recalcRefund;
  window._selectRefundMethod = _selectRefundMethod;
  window._confirmRefund = _confirmRefund;

  // ══ 복수 항목 환불 (체크박스로 선택된 2개 이상) ══
  function _renderMultiRefundForm(phone, contractKey, checkedItems) {
    const totalPrice = checkedItems.reduce((s, it) => s + (it.data.price || 0), 0);
    const itemListHtml = checkedItems.map(it =>
      `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid #f0f0f0;">
        <span style="color:var(--text-sub);">${REFUND_PROG_NAMES[it.progKey]||it.progKey}${it.pkgName?' ('+it.pkgName+')':''}</span>
        <span style="font-weight:600;">${(it.data.price||0).toLocaleString()}원</span>
      </div>`).join('');
    document.getElementById('app-multi-refund-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-multi-refund-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:22px;width:100%;max-width:320px;max-height:90vh;overflow-y:auto;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:15px;font-weight:700;margin-bottom:4px;color:var(--text,#1a1a1a);">💰 선택 항목 환불</div>
      <div style="font-size:12px;color:#888;margin-bottom:12px;">선택한 프로그램에 환불이 처리돼요.</div>
      <div style="background:var(--bg,#f7f7f7);border-radius:8px;padding:10px 12px;margin-bottom:14px;">
        ${itemListHtml}
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding-top:6px;margin-top:4px;">
          <span>합계</span><span>${totalPrice.toLocaleString()}원</span>
        </div>
      </div>
      <div style="font-size:12px;color:#888;margin-bottom:4px;">환불 처리일</div>
      <input id="mrf-date" type="date" value="${_todayISO()}"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:12px;color:#888;margin-bottom:4px;">환불 금액 (직접 입력)</div>
      <input id="mrf-amount" type="text" inputmode="numeric" placeholder="0" oninput="_formatMoneyInput(this)"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:12px;color:#888;margin-bottom:6px;">환불 수단</div>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <button id="mrf-cash" onclick="_selectMrfMethod('cash')" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid var(--blue,#3b82f6);background:var(--blue,#3b82f6);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">현금</button>
        <button id="mrf-card" onclick="_selectMrfMethod('card')" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #e0e0e0;background:none;color:#888;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">카드</button>
        <button id="mrf-transfer" onclick="_selectMrfMethod('transfer')" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #e0e0e0;background:none;color:#888;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">계좌</button>
      </div>
      <div style="font-size:11px;color:#aaa;margin-bottom:14px;">※ 잔여횟수/이용기간 종료는 자동으로 처리되지 않으니 필요하면 따로 처리해주세요.</div>
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('app-multi-refund-modal').remove()" style="flex:1;padding:12px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;font-weight:700;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">취소</button>
        <button onclick="_confirmMultiRefund('${phone}','${contractKey}')" style="flex:1;padding:12px;background:#ef4444;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">환불 처리</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    window._mrfMethod = 'cash';
    window._mrfCheckedItems = checkedItems;
  }

  function _selectMrfMethod(method) {
    window._mrfMethod = method;
    ['cash','card','transfer'].forEach(m => {
      const btn = document.getElementById('mrf-' + m);
      if (!btn) return;
      if (m === method) { btn.style.background = 'var(--blue,#3b82f6)'; btn.style.color = 'white'; btn.style.border = '1.5px solid var(--blue,#3b82f6)'; }
      else { btn.style.background = 'none'; btn.style.color = '#888'; btn.style.border = '1.5px solid #e0e0e0'; }
    });
  }

  async function _confirmMultiRefund(phone, contractKey) {
    const amount = parseInt((document.getElementById('mrf-amount')?.value || '0').replace(/[^0-9]/g,'')) || 0;
    const date = document.getElementById('mrf-date')?.value || _todayISO();
    const method = window._mrfMethod || 'cash';
    const checkedItems = window._mrfCheckedItems || [];
    if (!amount) { showToast('환불 금액을 입력해주세요.', 'error'); return; }
    const names = checkedItems.map(it => REFUND_PROG_NAMES[it.progKey]||it.progKey).join(', ');
    showConfirm(`[${names}] 환불 ${amount.toLocaleString()}원을 처리할까요?`, async () => {
      try {
        const refundRecord = { refundAmount: amount, method, date, processedAt: Date.now(), multiRefund: true };
        const updates = {};
        checkedItems.forEach(it => {
          const basePath = it.pkgIndex === null
            ? 'contracts/' + phone + '/' + contractKey + '/programs/' + it.progKey
            : 'contracts/' + phone + '/' + contractKey + '/packages/' + it.pkgIndex + '/items/' + it.progKey;
          updates[basePath + '/refund'] = refundRecord;
        });
        await db.ref().update(updates);
        document.getElementById('app-multi-refund-modal')?.remove();
        showToast('✅ 환불 처리 완료! (' + amount.toLocaleString() + '원)', 'success');
        _renderMdContracts(phone);
      } catch(e) { showToast('환불 처리 실패: ' + e.message, 'error'); }
    });
  }
  window._selectMrfMethod = _selectMrfMethod;
  window._confirmMultiRefund = _confirmMultiRefund;
  window._renderMultiRefundForm = _renderMultiRefundForm;

  // ══════════════ 양도 기능 (1/4단계: 양수인 정보) ══════════════
  function startTransfer(phone, contractKey, progKey) {
    db.ref('contracts/' + phone + '/' + contractKey).once('value').then(snap => {
      if (!snap.exists()) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
      if (progKey) {
        openTransferModal(phone, contractKey, progKey);
        return;
      }
      const items = _flattenContractItems(snap.val()).filter(it => _isItemEligible(it.data));
      if (items.length === 1) {
        openTransferModal(phone, contractKey, items[0].progKey);
      } else if (items.length > 1) {
        _showTransferItemPicker(phone, contractKey, items);
      } else {
        showToast('양도할 프로그램이 없어요.', 'error');
      }
    });
  }

  function _showTransferItemPicker(phone, contractKey, items) {
    document.getElementById('app-transfer-picker')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-transfer-picker';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;';
    window._transferPickerItems = items;
    const itemRows = items.map((it, idx) => {
      const label = (REFUND_PROG_NAMES[it.progKey] || it.progKey) + (it.pkgName ? ' (📦 ' + it.pkgName + ')' : '');
      return `<label style="display:flex;align-items:center;gap:8px;width:100%;padding:12px;margin-bottom:8px;background:var(--bg,#f7f7f7);border:1px solid #e0e0e0;border-radius:10px;font-size:14px;color:var(--text,#1a1a1a);cursor:pointer;font-family:'Noto Sans KR',sans-serif;">
        <input type="checkbox" class="ptf-pick-item" data-idx="${idx}" style="width:18px;height:18px;flex-shrink:0;">
        <span style="flex:1;">${label} · ${(it.data.price||0).toLocaleString()}원</span>
      </label>`;
    }).join('');
    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:24px;width:100%;max-width:300px;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:14px;font-weight:700;margin-bottom:6px;color:var(--text,#1a1a1a);">🔁 양도할 프로그램을 선택하세요</div>
      <div style="font-size:11.5px;color:#888;margin-bottom:14px;">2개 이상 선택하면 한번에 같이 양도처리할 수 있어요</div>
      ${itemRows}
      <button onclick="_transferPickerNext('${phone}','${contractKey}')"
        style="width:100%;padding:11px;background:#3b82f6;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-top:6px;">선택한 프로그램 양도하기</button>
      <button onclick="document.getElementById('app-transfer-picker').remove()"
        style="width:100%;padding:10px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:13px;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-top:8px;">취소</button>
    </div>`;
    document.body.appendChild(modal);
  }

  function _transferPickerNext(phone, contractKey) {
    const items = window._transferPickerItems || [];
    const checked = Array.from(document.querySelectorAll('.ptf-pick-item:checked')).map(el => items[parseInt(el.dataset.idx)]);
    if (!checked.length) { showToast('하나 이상 선택해주세요.', 'error'); return; }
    document.getElementById('app-transfer-picker')?.remove();
    if (checked.length === 1) {
      // 단일 선택 — 기존 단독 양도 흐름
      window._transferCtx = { fromPhone: phone, contractKey, progKey: checked[0].progKey, item: checked[0], isPkgTransfer: false };
      _renderTransferStep1();
    } else {
      // 복수 선택 — 패키지 양도 흐름 (pkgItems에 선택된 항목 저장)
      window._transferCtx = {
        fromPhone: phone, contractKey,
        progKey: checked[0].progKey, item: checked[0],
        pkgItems: checked, isPkgTransfer: true,
      };
      _renderTransferStep1();
    }
  }
  window._transferPickerNext = _transferPickerNext;

  function openTransferModal(phone, contractKey, progKey) {
    document.getElementById('app-transfer-picker')?.remove();
    db.ref('contracts/' + phone + '/' + contractKey).once('value').then(snap => {
      if (!snap.exists()) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
      const items = _flattenContractItems(snap.val());
      const item = items.find(it => it.progKey === progKey);
      if (!item) { showToast('해당 프로그램을 찾을 수 없어요.', 'error'); return; }
      if (item.data.refund) { showToast('이미 환불된 프로그램은 양도할 수 없어요.', 'error'); return; }
      if (item.data.transferOut) { showToast('이미 양도된 프로그램이에요.', 'error'); return; }
      window._transferCtx = { fromPhone: phone, contractKey, progKey, item };
      _renderTransferStep1();
    });
  }

  function _renderTransferStep1() {
    document.getElementById('app-transfer-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-transfer-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:22px;width:100%;max-width:320px;max-height:90vh;overflow-y:auto;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:15px;font-weight:700;margin-bottom:4px;color:var(--text,#1a1a1a);">🔁 양도 — 1/4 양수인 정보</div>
      <div style="font-size:12px;color:#888;margin-bottom:16px;">양도받을 분의 전화번호를 입력하고 조회해주세요.</div>
      <div style="font-size:12px;color:#888;margin-bottom:4px;">양수인 전화번호</div>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <input id="tf-phone" type="tel" placeholder="01012345678"
          style="flex:1;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;font-family:'Noto Sans KR',sans-serif;">
        <button onclick="_lookupTransferRecipient()" style="padding:10px 16px;background:var(--blue,#3b82f6);border:none;border-radius:8px;color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">조회</button>
      </div>
      <div id="tf-result"></div>
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button onclick="document.getElementById('app-transfer-modal').remove()" style="flex:1;padding:12px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;font-weight:700;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">취소</button>
        <button id="tf-next-btn" onclick="_transferStep1Next()" disabled style="flex:1;padding:12px;background:#ccc;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:not-allowed;font-family:'Noto Sans KR',sans-serif;">다음</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }

  function _lookupTransferRecipient() {
    const ctx = window._transferCtx;
    const phone = document.getElementById('tf-phone')?.value.trim();
    const resultEl = document.getElementById('tf-result');
    const nextBtn = document.getElementById('tf-next-btn');
    if (!phone || phone.length < 10) {
      resultEl.innerHTML = '<div style="font-size:12px;color:#ef4444;">전화번호를 정확히 입력해주세요.</div>';
      return;
    }
    if (ctx && phone === ctx.fromPhone) {
      resultEl.innerHTML = '<div style="font-size:12px;color:#ef4444;">양도하는 회원과 같은 번호예요.</div>';
      return;
    }
    resultEl.innerHTML = '<div style="font-size:12px;color:#888;">조회 중...</div>';
    db.ref('members/' + phone).once('value').then(snap => {
      if (snap.exists()) {
        const m = snap.val();
        ctx.toPhone = phone;
        ctx.toIsNew = false;
        ctx.toName = (m.name || '').replace(/\(\d{4}\)$/, '');
        resultEl.innerHTML = `<div style="background:var(--bg,#f7f7f7);border-radius:8px;padding:12px;font-size:13px;color:var(--text,#1a1a1a);">
          ✅ 기존 회원이에요: <b>${ctx.toName}</b>
        </div>`;
      } else {
        ctx.toPhone = phone;
        ctx.toIsNew = true;
        resultEl.innerHTML = `<div style="font-size:12px;color:#888;margin-bottom:8px;">처음 등록하는 분이에요. 정보를 입력해주세요.</div>
          <div style="font-size:11px;color:#aaa;margin-bottom:3px;">이름</div>
          <input id="tf-new-name" type="text" placeholder="이름"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:8px;font-family:'Noto Sans KR',sans-serif;">
          <div style="font-size:11px;color:#aaa;margin-bottom:3px;">성별</div>
          <select id="tf-new-gender" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:8px;font-family:'Noto Sans KR',sans-serif;">
            <option value="남">남</option><option value="여">여</option>
          </select>
          <div style="font-size:11px;color:#aaa;margin-bottom:3px;">생년월일 (선택)</div>
          <input id="tf-new-birth" type="text" inputmode="numeric" placeholder="19900101" maxlength="8"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:8px;font-family:'Noto Sans KR',sans-serif;">
          <div style="font-size:11px;color:#aaa;margin-bottom:3px;">주소 (선택)</div>
          <input id="tf-new-address" type="text" placeholder="주소"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:4px;font-family:'Noto Sans KR',sans-serif;">`;
      }
      if (nextBtn) { nextBtn.disabled = false; nextBtn.style.background = '#3b82f6'; nextBtn.style.cursor = 'pointer'; }
    });
  }

  function _transferStep1Next() {
    const ctx = window._transferCtx;
    if (!ctx || !ctx.toPhone) return;
    if (ctx.toIsNew) {
      const name = document.getElementById('tf-new-name')?.value.trim();
      if (!name) { showToast('양수인 이름을 입력해주세요.', 'error'); return; }
      ctx.toName = name;
      ctx.toGender = document.getElementById('tf-new-gender')?.value || '남';
      ctx.toBirth = document.getElementById('tf-new-birth')?.value || '';
      ctx.toAddress = document.getElementById('tf-new-address')?.value.trim() || '';
    }
    _renderTransferStep2();
  }

  // 2/4단계: 양도되는 프로그램 정보(잔여기간/횟수) + 양도비
  function _renderTransferStep2() {
    const ctx = window._transferCtx;
    const progKey = ctx.progKey;
    const data = ctx.item.data;
    const isPeriod = REFUND_PERIOD_PROGS.includes(progKey);
    const defaultFee = isPeriod ? 10000 : 30000;

    document.getElementById('app-transfer-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-transfer-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';

    let body = `<div style="font-size:15px;font-weight:700;margin-bottom:4px;color:var(--text,#1a1a1a);">🔁 양도 — 2/4 양도 프로그램 정보</div>
      <div style="font-size:12px;color:#888;margin-bottom:16px;">${REFUND_PROG_NAMES[progKey]||progKey} · ${ctx.fromPhone} → ${ctx.toName}(${ctx.toPhone})</div>
      <div style="background:var(--bg,#f7f7f7);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#888;">
        원래 등록 정보: ${data.startDate||'-'} ~ ${data.endDate||'-'} ${data.count ? '· ' + data.count + '회' : ''} (${(data.price||0).toLocaleString()}원)
      </div>
      <div style="font-size:12px;color:#888;margin-bottom:4px;">양도 시작일</div>
      <input id="tf-start-date" type="date" value="${_todayISO()}" onchange="_onTfDateChange()"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:12px;color:#888;margin-bottom:4px;">잔여일수 (원래 종료일 기준 자동계산, 수정 가능)</div>
      <input id="tf-remain-days" type="number" value="${(() => { if (!data.endDate) return 0; const d = _dateDiffDays(data.endDate, _todayISO()); return Math.max(0, d); })()}" oninput="_onTfDateChange()"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:6px;font-family:'Noto Sans KR',sans-serif;">
      <div id="tf-end-display" style="font-size:12px;color:#3b82f6;font-weight:700;margin-bottom:10px;"></div>
    `;

    if (!isPeriod) {
      body += `
      <div style="font-size:12px;color:#888;margin-bottom:4px;">양수인에게 적용할 잔여 횟수</div>
      <input id="tf-count" type="number" value="${data.count || 0}"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">
      `;
    }

    body += `
      <div style="font-size:12px;color:#888;margin-bottom:4px;">양도비 (헬스·GX 1만원 / PT·기구필라테스 3만원, 수정 가능)</div>
      <input id="tf-fee" type="number" value="${defaultFee}"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:12px;color:#888;margin-bottom:6px;">양도비 결제수단</div>
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button id="tf-method-cash" onclick="_selectTransferMethod('cash')" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid var(--blue,#3b82f6);background:var(--blue,#3b82f6);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">현금</button>
        <button id="tf-method-card" onclick="_selectTransferMethod('card')" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #e0e0e0;background:none;color:#888;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">카드</button>
        <button id="tf-method-transfer" onclick="_selectTransferMethod('transfer')" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #e0e0e0;background:none;color:#888;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">계좌</button>
      </div>
      <div style="display:flex;gap:10px;">
        <button onclick="_renderTransferStep1()" style="flex:1;padding:12px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;font-weight:700;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">이전</button>
        <button onclick="_transferStep2Next()" style="flex:1;padding:12px;background:#3b82f6;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">다음</button>
      </div>
    `;

    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:22px;width:100%;max-width:320px;max-height:90vh;overflow-y:auto;font-family:'Noto Sans KR',sans-serif;">${body}</div>`;
    document.body.appendChild(modal);
    ctx.transferMethod = 'cash';
    _onTfDateChange();
  }

  // 양도 시작일 + 잔여일수 → 종료일 자동계산
  function _onTfDateChange() {
    const startEl = document.getElementById('tf-start-date');
    const daysEl = document.getElementById('tf-remain-days');
    const display = document.getElementById('tf-end-display');
    if (!startEl || !daysEl || !display) return;
    const days = Math.max(0, parseInt(daysEl.value) || 0);
    const start = new Date(startEl.value);
    if (isNaN(start.getTime())) { display.textContent = ''; return; }
    const end = new Date(start.getTime() + days * 86400000);
    const endStr = end.getFullYear() + '-' + String(end.getMonth()+1).padStart(2,'0') + '-' + String(end.getDate()).padStart(2,'0');
    display.textContent = '→ 종료일: ' + endStr + ' (자동계산)';
    display.dataset.endDate = endStr;
  }

  function _selectTransferMethod(method) {
    const ctx = window._transferCtx;
    if (!ctx) return;
    ctx.transferMethod = method;
    ['cash','card','transfer'].forEach(m => {
      const btn = document.getElementById('tf-method-' + m);
      if (!btn) return;
      if (m === method) {
        btn.style.background = 'var(--blue, #3b82f6)'; btn.style.color = 'white'; btn.style.border = '1.5px solid var(--blue, #3b82f6)';
      } else {
        btn.style.background = 'none'; btn.style.color = '#888'; btn.style.border = '1.5px solid #e0e0e0';
      }
    });
  }

  function _transferStep2Next() {
    const ctx = window._transferCtx;
    if (!ctx) return;
    const isPeriod = REFUND_PERIOD_PROGS.includes(ctx.progKey);
    ctx.newStartDate = document.getElementById('tf-start-date')?.value || _todayISO();
    ctx.newEndDate = document.getElementById('tf-end-display')?.dataset.endDate || ctx.item.data.endDate || '';
    ctx.newCount = isPeriod ? (ctx.item.data.count || 0) : (parseInt(document.getElementById('tf-count')?.value) || 0);
    ctx.transferFee = parseInt(document.getElementById('tf-fee')?.value) || 0;
    _renderTransferStep3();
  }

  const TRANSFER_TERMS_TEXT = '▶ 회원권은 양도 가능하며 양도비(헬스·GX 1만원 / 레슨 3만원)가 발생합니다.\n▶ 양도받은 회원권은 환불 및 재양도가 불가합니다.';

  // 3/4단계: 약관동의 + 서명
  function _renderTransferStep3() {
    const ctx = window._transferCtx;
    document.getElementById('app-transfer-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-transfer-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';

    const body = `<div style="font-size:15px;font-weight:700;margin-bottom:4px;color:var(--text,#1a1a1a);">🔁 양도 — 3/4 약관동의 및 서명</div>
      <div style="font-size:12px;color:#888;margin-bottom:14px;">${REFUND_PROG_NAMES[ctx.progKey]||ctx.progKey} · ${ctx.fromPhone} → ${ctx.toName}(${ctx.toPhone}) · 양도비 ${(ctx.transferFee||0).toLocaleString()}원</div>
      <div style="background:var(--bg,#f7f7f7);border-radius:8px;padding:12px;font-size:12px;color:#555;white-space:pre-line;margin-bottom:10px;max-height:110px;overflow-y:auto;">${TRANSFER_TERMS_TEXT}</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text,#1a1a1a);margin-bottom:14px;cursor:pointer;">
        <input id="tf-agree" type="checkbox" onchange="_updateTfStep3Btn()" style="width:16px;height:16px;"> 위 내용에 동의합니다
      </label>
      <div style="font-size:12px;color:#888;margin-bottom:6px;">확인 서명</div>
      <div style="position:relative;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:8px;">
        <canvas id="tf-sign-canvas" width="400" height="160" style="width:100%;height:160px;display:block;touch-action:none;cursor:crosshair;"></canvas>
        <div id="tf-sign-placeholder" style="position:absolute;top:50%;left:0;right:0;text-align:center;transform:translateY(-50%);color:#bbb;font-size:12px;pointer-events:none;">여기에 서명해주세요</div>
      </div>
      <button onclick="_clearTfSign()" style="width:100%;padding:8px;background:none;border:1px solid #e0e0e0;border-radius:8px;font-size:12px;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-bottom:16px;">서명 지우기</button>
      <div style="display:flex;gap:10px;">
        <button onclick="_renderTransferStep2()" style="flex:1;padding:12px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;font-weight:700;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">이전</button>
        <button id="tf-step3-next" onclick="_transferStep3Next()" disabled style="flex:1;padding:12px;background:#ccc;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:not-allowed;font-family:'Noto Sans KR',sans-serif;">양도 완료</button>
      </div>`;

    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:22px;width:100%;max-width:320px;max-height:90vh;overflow-y:auto;font-family:'Noto Sans KR',sans-serif;">${body}</div>`;
    document.body.appendChild(modal);
    _initTfSign();
  }

  let tfSignCanvas, tfSignCtx, tfSigning = false, tfHasSigned = false;

  function _initTfSign() {
    tfSignCanvas = document.getElementById('tf-sign-canvas');
    if (!tfSignCanvas) return;
    tfSignCtx = tfSignCanvas.getContext('2d');
    tfSignCtx.strokeStyle = '#1a1a2e';
    tfSignCtx.lineWidth = 2.5;
    tfSignCtx.lineCap = 'round';
    tfSignCtx.lineJoin = 'round';
    tfSigning = false; tfHasSigned = false;

    function getPos(e) {
      const r = tfSignCanvas.getBoundingClientRect();
      const scaleX = tfSignCanvas.width / r.width;
      const scaleY = tfSignCanvas.height / r.height;
      const src = e.touches ? e.touches[0] : e;
      return { x: (src.clientX - r.left) * scaleX, y: (src.clientY - r.top) * scaleY };
    }
    function start(e) {
      tfSigning = true; tfHasSigned = true;
      const p = getPos(e); tfSignCtx.beginPath(); tfSignCtx.moveTo(p.x, p.y);
      const ph = document.getElementById('tf-sign-placeholder'); if (ph) ph.style.display = 'none';
      _updateTfStep3Btn();
    }
    function move(e) {
      if (!tfSigning) return;
      const p = getPos(e); tfSignCtx.lineTo(p.x, p.y); tfSignCtx.stroke();
    }
    function end() { tfSigning = false; }

    tfSignCanvas.addEventListener('mousedown', start);
    tfSignCanvas.addEventListener('mousemove', move);
    tfSignCanvas.addEventListener('mouseup', end);
    tfSignCanvas.addEventListener('mouseleave', end);
    tfSignCanvas.addEventListener('touchstart', e => { e.preventDefault(); start(e); }, { passive: false });
    tfSignCanvas.addEventListener('touchmove', e => { e.preventDefault(); move(e); }, { passive: false });
    tfSignCanvas.addEventListener('touchend', end);
  }

  function _clearTfSign() {
    if (tfSignCtx) tfSignCtx.clearRect(0, 0, tfSignCanvas.width, tfSignCanvas.height);
    tfHasSigned = false;
    const ph = document.getElementById('tf-sign-placeholder'); if (ph) ph.style.display = '';
    _updateTfStep3Btn();
  }

  function _updateTfStep3Btn() {
    const agree = document.getElementById('tf-agree')?.checked;
    const btn = document.getElementById('tf-step3-next');
    if (!btn) return;
    const ok = agree && tfHasSigned;
    btn.disabled = !ok;
    btn.style.background = ok ? '#3b82f6' : '#ccc';
    btn.style.cursor = ok ? 'pointer' : 'not-allowed';
  }

  async function _transferStep3Next() {
    const ctx = window._transferCtx;
    if (!ctx || !tfHasSigned) return;
    try { ctx.signUrl = tfSignCanvas.toDataURL('image/png'); } catch(e) { ctx.signUrl = ''; }
    const btn = document.getElementById('tf-step3-next');
    if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }
    await _confirmTransfer();
  }

  // 4/4단계: 최종 확정 — 양도인측 마킹 + 양수인측 계정/계약 생성 + 완료화면
  async function _confirmTransfer() {
    const ctx = window._transferCtx;
    if (!ctx || !ctx.signUrl) return;
    // 패키지 전체 양도 분기
    if (ctx.isPkgTransfer) { await _confirmPkgTransfer(); return; }
    try {
      const fromSnap = await db.ref('contracts/' + ctx.fromPhone + '/' + ctx.contractKey).once('value');
      if (!fromSnap.exists()) { showToast('원본 계약 정보를 찾을 수 없어요.', 'error'); return; }
      const fromContract = fromSnap.val();
      const items = _flattenContractItems(fromContract);
      const fromItem = items.find(it => it.progKey === ctx.progKey);
      if (!fromItem) { showToast('해당 프로그램을 찾을 수 없어요.', 'error'); return; }
      if (!_isItemEligible(fromItem.data)) { showToast('이미 처리된 프로그램이에요.', 'error'); return; }

      const fromBasePath = fromItem.pkgIndex === null
        ? 'contracts/' + ctx.fromPhone + '/' + ctx.contractKey + '/programs/' + ctx.progKey
        : 'contracts/' + ctx.fromPhone + '/' + ctx.contractKey + '/packages/' + fromItem.pkgIndex + '/items/' + ctx.progKey;

      const updates = {};
      const todayDate = new Date();
      const todayStr = todayDate.getFullYear() + '-' + String(todayDate.getMonth()+1).padStart(2,'0') + '-' + String(todayDate.getDate()).padStart(2,'0');

      updates[fromBasePath + '/transferOut'] = {
        toPhone: ctx.toPhone, toName: ctx.toName, fee: ctx.transferFee, method: ctx.transferMethod,
        date: todayStr, processedAt: Date.now()
      };

      // 양수인 계정 생성/업데이트
      const toSnap = await db.ref('members/' + ctx.toPhone).once('value');
      const toExisted = toSnap.exists();
      if (!toExisted) {
        const pw = hashPw(ctx.toPhone.slice(-4));
        const newMember = { name: ctx.toName + '(' + ctx.toPhone.slice(-4) + ')', pw, programs: [ctx.progKey] };
        if (ctx.toBirth) newMember.birth = ctx.toBirth;
        if (ctx.toAddress) newMember.address = ctx.toAddress;
        newMember['body/gender'] = ctx.toGender === '여' ? 'female' : 'male';
        await db.ref('members/' + ctx.toPhone).update(newMember);
      } else {
        const toMember = toSnap.val();
        const progs = toMember.programs || [];
        if (!progs.includes(ctx.progKey)) {
          progs.push(ctx.progKey);
          await db.ref('members/' + ctx.toPhone + '/programs').set(progs);
        }
      }

      // 양수인 쪽 새 계약서(0원, 양도받음 표시)
      const newProgramData = {
        months: fromItem.data.months || 0,
        count: ctx.newCount || 0,
        price: 0, cash: 0, card: 0, transfer: 0,
        startDate: ctx.newStartDate || todayStr,
        endDate: ctx.newEndDate || fromItem.data.endDate || '',
        transferIn: {
          fromPhone: ctx.fromPhone, fromName: fromContract.name || '', fee: ctx.transferFee,
          method: ctx.transferMethod, date: todayStr, processedAt: Date.now()
        }
      };
      const newContractData = {
        name: ctx.toName,
        phone: ctx.toPhone,
        birth: ctx.toBirth || (toExisted ? (toSnap.val().birth||'') : ''),
        gender: ctx.toGender === '여' ? 'female' : 'male',
        address: ctx.toAddress || (toExisted ? (toSnap.val().address||'') : ''),
        memo: (REFUND_PROG_NAMES[ctx.progKey]||ctx.progKey) + ' — ' + (fromContract.name||ctx.fromPhone) + '님으로부터 양도받음 (양도비 ' + (ctx.transferFee||0).toLocaleString() + '원)',
        type: 'new',
        signDate: todayStr,
        signUrl: ctx.signUrl,
        programs: { [ctx.progKey]: newProgramData },
        createdAt: Date.now()
      };
      const newKey = todayStr + '_' + Date.now();
      updates['contracts/' + ctx.toPhone + '/' + newKey] = newContractData;

      await db.ref().update(updates);

      window._lastContractData = newContractData;
      document.getElementById('app-transfer-modal')?.remove();
      _renderTransferDone(ctx);
      _renderMdContracts(ctx.fromPhone);
    } catch(e) {
      showToast('양도 처리 실패: ' + e.message, 'error');
      const btn = document.getElementById('tf-step3-next');
      if (btn) { btn.disabled = false; btn.textContent = '양도 완료'; }
    }
  }

  // 패키지 전체 양도 저장 — 모든 항목에 transferOut 마킹 + 양수인 계정/계약 생성
  async function _confirmPkgTransfer() {
    const ctx = window._transferCtx;
    try {
      const todayStr = _todayISO();
      const updates = {};

      // 1. 양수인 계정 생성/업데이트
      const toSnap = await db.ref('members/' + ctx.toPhone).once('value');
      const toExisted = toSnap.exists();
      if (!toExisted) {
        const pw = hashPw(ctx.toPhone.slice(-4));
        const newMember = { name: ctx.toName + '(' + ctx.toPhone.slice(-4) + ')', pw, programs: ctx.pkgItems.map(it => it.progKey) };
        if (ctx.toBirth) newMember.birth = ctx.toBirth;
        if (ctx.toAddress) newMember.address = ctx.toAddress;
        newMember['body/gender'] = ctx.toGender === '여' ? 'female' : 'male';
        await db.ref('members/' + ctx.toPhone).update(newMember);
      } else {
        const toMember = toSnap.val();
        const progs = toMember.programs || [];
        ctx.pkgItems.forEach(it => { if (!progs.includes(it.progKey)) progs.push(it.progKey); });
        await db.ref('members/' + ctx.toPhone + '/programs').set(progs);
      }

      // 2. 양도인 측 — 모든 항목에 transferOut 마킹
      const fromSnap = await db.ref('contracts/' + ctx.fromPhone + '/' + ctx.contractKey).once('value');
      const fromContract = fromSnap.val();
      const transferOutRecord = { toPhone: ctx.toPhone, toName: ctx.toName, fee: ctx.transferFee, method: ctx.transferMethod, date: todayStr, processedAt: Date.now() };
      ctx.pkgItems.forEach(it => {
        const basePath = it.pkgIndex === null
          ? 'contracts/' + ctx.fromPhone + '/' + ctx.contractKey + '/programs/' + it.progKey
          : 'contracts/' + ctx.fromPhone + '/' + ctx.contractKey + '/packages/' + it.pkgIndex + '/items/' + it.progKey;
        updates[basePath + '/transferOut'] = transferOutRecord;
      });

      // 3. 양수인 측 — 패키지 내 모든 항목을 포함한 새 계약 생성 (0원, 양도받음 표시)
      const newPrograms = {};
      ctx.pkgItems.forEach(it => {
        newPrograms[it.progKey] = {
          months: it.data.months || 0,
          count: it.data.count || 0,
          price: 0, cash: 0, card: 0, transfer: 0,
          startDate: ctx.newStartDate || todayStr,
          endDate: it.data.endDate || '',
          transferIn: { fromPhone: ctx.fromPhone, fromName: fromContract?.name || '', fee: ctx.transferFee, method: ctx.transferMethod, date: todayStr, processedAt: Date.now() }
        };
      });
      const newKey = todayStr + '_' + Date.now();
      const pkgLabel = ctx.pkgItems.map(it => REFUND_PROG_NAMES[it.progKey] || it.progKey).join('+');
      updates['contracts/' + ctx.toPhone + '/' + newKey] = {
        name: ctx.toName, phone: ctx.toPhone,
        birth: ctx.toBirth || (toExisted ? (toSnap.val().birth||'') : ''),
        gender: ctx.toGender === '여' ? 'female' : 'male',
        address: ctx.toAddress || (toExisted ? (toSnap.val().address||'') : ''),
        memo: '[패키지 양도] ' + pkgLabel + ' — ' + (fromContract?.name||ctx.fromPhone) + '님으로부터 양도받음 (양도비 ' + (ctx.transferFee||0).toLocaleString() + '원)',
        type: 'new', signDate: todayStr, signUrl: ctx.signUrl,
        programs: newPrograms, createdAt: Date.now(),
      };

      await db.ref().update(updates);

      // 완료 처리 — 완료 모달의 텍스트만 패키지 전체임을 표시
      window._lastContractData = updates['contracts/' + ctx.toPhone + '/' + newKey];
      document.getElementById('app-transfer-modal')?.remove();
      _renderPkgTransferDone(ctx);
      _renderMdContracts(ctx.fromPhone);
    } catch(e) {
      showToast('패키지 양도 처리 실패: ' + e.message, 'error');
      const btn = document.getElementById('tf-step3-next');
      if (btn) { btn.disabled = false; btn.textContent = '양도 완료'; }
    }
  }

  function _renderPkgTransferDone(ctx) {
    document.getElementById('app-transfer-done')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-transfer-done';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    const pkgLabel = ctx.pkgItems.map(it => REFUND_PROG_NAMES[it.progKey] || it.progKey).join('+');
    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:24px;width:100%;max-width:320px;text-align:center;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:36px;margin-bottom:8px;">🎉</div>
      <div style="font-size:17px;font-weight:700;color:var(--text,#1a1a1a);margin-bottom:6px;">패키지 양도 완료!</div>
      <div style="font-size:13px;color:#888;line-height:1.6;margin-bottom:16px;">${ctx.toName}님에게 [${pkgLabel}] 패키지 전체 양도가 완료됐어요.</div>
      <button onclick="document.getElementById('app-transfer-done').remove();" style="width:100%;padding:10px;background:none;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">닫기</button>
    </div>`;
    document.body.appendChild(modal);
  }

  function _renderTransferDone(ctx) {
    document.getElementById('app-transfer-done')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-transfer-done';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:24px;width:100%;max-width:320px;text-align:center;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:36px;margin-bottom:8px;">🎉</div>
      <div style="font-size:17px;font-weight:700;color:var(--text,#1a1a1a);margin-bottom:6px;">양도 완료!</div>
      <div style="font-size:13px;color:#888;line-height:1.6;margin-bottom:16px;">${ctx.toName}님에게 ${REFUND_PROG_NAMES[ctx.progKey]||ctx.progKey} 양도가 완료됐어요.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
        <button onclick="openContractPdf()" style="padding:12px;background:#185FA5;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">📄 PDF 저장</button>
        <button onclick="sendContractToMember()" style="padding:12px;background:#059669;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">📱 앱 전송</button>
      </div>
      <button onclick="document.getElementById('app-transfer-done').remove();" style="width:100%;padding:10px;background:none;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">닫기</button>
    </div>`;
    document.body.appendChild(modal);
  }
  window._renderTransferStep3 = _renderTransferStep3;
  window._clearTfSign = _clearTfSign;
  window._updateTfStep3Btn = _updateTfStep3Btn;
  window._transferStep3Next = _transferStep3Next;
  window._confirmTransfer = _confirmTransfer;

  // ══════════════ 전체 패키지 양도 ══════════════
  // 패키지 내 모든 항목을 한번에 양수인에게 이동 — 기존 4단계 양도 흐름 재활용
  // ══════════════ 프로그램 변경 (1/4단계: 잔여가치 확인) ══════════════
  // 금액 입력칸에 콤마(,) 표시해주는 헬퍼 — 입력할 때마다 자동으로 천단위 콤마 적용
  function _fmtMoneyInput(el) {
    if (!el) return;
    const digits = el.value.replace(/[^0-9]/g, '');
    el.value = digits ? parseInt(digits, 10).toLocaleString() : '';
  }
  // 콤마 들어간 입력칸에서 실제 숫자값만 꺼낼 때 사용
  function _getMoneyVal(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    return parseInt((el.value || '0').replace(/[^0-9]/g, ''), 10) || 0;
  }

  function startProgChange(phone, contractKey, progKey) {
    db.ref('contracts/' + phone + '/' + contractKey).once('value').then(snap => {
      if (!snap.exists()) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
      if (progKey) {
        openProgChangeModal(phone, contractKey, progKey);
        return;
      }
      const items = _flattenContractItems(snap.val()).filter(it => _isItemEligible(it.data));
      if (items.length === 1) {
        openProgChangeModal(phone, contractKey, items[0].progKey);
      } else if (items.length > 1) {
        _showProgChangeItemPicker(phone, contractKey, items);
      } else {
        showToast('변경할 프로그램이 없어요.', 'error');
      }
    });
  }

  function _showProgChangeItemPicker(phone, contractKey, items) {
    document.getElementById('app-change-picker')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-change-picker';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;';
    window._progChangePickerItems = items; // 체크박스 인덱스로 다시 찾기 위해 임시저장
    const itemRows = items.map((it, idx) => {
      const label = (REFUND_PROG_NAMES[it.progKey] || it.progKey) + (it.pkgName ? ' (📦 ' + it.pkgName + ')' : '');
      return `<label style="display:flex;align-items:center;gap:8px;width:100%;padding:12px;margin-bottom:8px;background:var(--bg,#f7f7f7);border:1px solid #e0e0e0;border-radius:10px;font-size:14px;color:var(--text,#1a1a1a);cursor:pointer;font-family:'Noto Sans KR',sans-serif;">
        <input type="checkbox" class="pc-pick-item" data-idx="${idx}" style="width:18px;height:18px;flex-shrink:0;">
        <span style="flex:1;">${label} · ${(it.data.price||0).toLocaleString()}원</span>
      </label>`;
    }).join('');
    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:24px;width:100%;max-width:300px;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:14px;font-weight:700;margin-bottom:6px;color:var(--text,#1a1a1a);">변경할 프로그램을 선택하세요</div>
      <div style="font-size:11.5px;color:#888;margin-bottom:14px;">2개 이상 선택하면 하나로 합쳐서 변경할 수 있어요</div>
      ${itemRows}
      <button onclick="_progChangePickerNext('${phone}','${contractKey}')"
        style="width:100%;padding:11px;background:#3b82f6;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-top:6px;">선택한 프로그램 변경하기</button>
      <button onclick="document.getElementById('app-change-picker').remove()"
        style="width:100%;padding:10px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:13px;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-top:8px;">취소</button>
    </div>`;
    document.body.appendChild(modal);
  }

  function _progChangePickerNext(phone, contractKey) {
    const items = window._progChangePickerItems || [];
    const checked = Array.from(document.querySelectorAll('.pc-pick-item:checked')).map(el => items[parseInt(el.dataset.idx)]);
    if (!checked.length) { showToast('하나 이상 선택해주세요.', 'error'); return; }
    document.getElementById('app-change-picker')?.remove();
    if (checked.length === 1) {
      openProgChangeModal(phone, contractKey, checked[0].progKey);
    } else {
      window._changeCtx = {
        phone,
        pkgItems: checked.map(it => ({ contractKey, progKey: it.progKey, pkgIndex: it.pkgIndex, data: it.data })),
        progKey: checked.map(it => REFUND_PROG_NAMES[it.progKey] || it.progKey).join(' + ')
      };
      _renderPkgProgChangeStep1();
    }
  }

  function openProgChangeModal(phone, contractKey, progKey) {
    document.getElementById('app-change-picker')?.remove();
    db.ref('contracts/' + phone + '/' + contractKey).once('value').then(snap => {
      if (!snap.exists()) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
      const items = _flattenContractItems(snap.val());
      const item = items.find(it => it.progKey === progKey);
      if (!item) { showToast('해당 프로그램을 찾을 수 없어요.', 'error'); return; }
      if (!_isItemEligible(item.data)) { showToast('이미 처리된 프로그램이에요.', 'error'); return; }
      window._changeCtx = { phone, contractKey, progKey, item };
      _renderProgChangeStep1();
    });
  }

  function _renderProgChangeStep1() {
    const ctx = window._changeCtx;
    const data = ctx.item.data;
    const progKey = ctx.progKey;
    const isPeriod = REFUND_PERIOD_PROGS.includes(progKey);
    let totalUnit, unitLabel;
    if (isPeriod) {
      const sd = data.startDate ? new Date(data.startDate) : null;
      const ed = data.endDate ? new Date(data.endDate) : null;
      totalUnit = (sd && ed) ? Math.max(1, Math.round((ed - sd) / 86400000)) : 0;
      unitLabel = '일';
    } else {
      totalUnit = data.count || 0;
      unitLabel = '회';
    }
    const perUnit = totalUnit ? (data.price || 0) / totalUnit : 0;
    ctx.totalUnit = totalUnit; ctx.unitLabel = unitLabel; ctx.perUnit = perUnit;

    document.getElementById('app-change-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-change-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';

    const body = `<div style="font-size:15px;font-weight:700;margin-bottom:4px;color:var(--text,#1a1a1a);">🔄 프로그램 변경 — 1/4 잔여가치 확인</div>
      <div style="font-size:12px;color:#888;margin-bottom:14px;">${REFUND_PROG_NAMES[progKey]||progKey} · 등록금액 ${(data.price||0).toLocaleString()}원 · 총 ${totalUnit}${unitLabel}</div>
      <div style="font-size:12px;color:#888;margin-bottom:4px;">잔여 ${unitLabel}수 (직접 입력)</div>
      <input id="pc-remain" type="number" value="0" oninput="_recalcProgChange()"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:6px;font-family:'Noto Sans KR',sans-serif;">
      <div id="pc-ref-display" style="font-size:11px;color:#aaa;margin-bottom:10px;"></div>
      <div style="font-size:12px;color:#888;margin-bottom:4px;">잔여가치 (자동계산, 수정 가능)</div>
      <input id="pc-value" type="text" inputmode="numeric" value="0" oninput="_fmtMoneyInput(this)"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:16px;font-family:'Noto Sans KR',sans-serif;">
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('app-change-modal').remove()" style="flex:1;padding:12px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;font-weight:700;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">취소</button>
        <button onclick="_progChangeStep1Next()" style="flex:1;padding:12px;background:#3b82f6;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">다음</button>
      </div>`;

    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:22px;width:100%;max-width:320px;max-height:90vh;overflow-y:auto;font-family:'Noto Sans KR',sans-serif;">${body}</div>`;
    document.body.appendChild(modal);
  }

  function _recalcProgChange() {
    const ctx = window._changeCtx;
    if (!ctx) return;
    const remain = parseFloat(document.getElementById('pc-remain')?.value) || 0;
    const value = Math.round(ctx.perUnit * remain);
    const valueEl = document.getElementById('pc-value');
    if (valueEl) valueEl.value = value.toLocaleString();
    const ref = document.getElementById('pc-ref-display');
    if (ref) ref.textContent = '참고: 1' + ctx.unitLabel + '당 ' + Math.round(ctx.perUnit).toLocaleString() + '원 × ' + remain + ctx.unitLabel + ' = ' + value.toLocaleString() + '원';
  }

  function _progChangeStep1Next() {
    const ctx = window._changeCtx;
    if (!ctx) return;
    ctx.remainUnit = parseFloat(document.getElementById('pc-remain')?.value) || 0;
    ctx.remainValue = _getMoneyVal('pc-value');
    _renderProgChangeStep2();
  }

  // ══════════════ 프로그램 변경 (2/4단계: 새 프로그램 선택) ══════════════
  function _renderProgChangeStep2() {
    const ctx = window._changeCtx;
    document.getElementById('app-change-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-change-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';

    // 새 프로그램 선택지는 공용 목록(REFUND_PROG_NAMES)에서 자동으로 가져옴
    const progOptions = Object.keys(REFUND_PROG_NAMES).map(key => {
      const sel = key === ctx.progKey ? 'selected' : '';
      return `<option value="${key}" ${sel}>${REFUND_PROG_NAMES[key]}</option>`;
    }).join('');

    const body = `<div style="font-size:15px;font-weight:700;margin-bottom:4px;color:var(--text,#1a1a1a);">🔄 프로그램 변경 — 2/4 새 프로그램 선택</div>
      <div style="font-size:12px;color:#888;margin-bottom:14px;">잔여가치 ${ctx.remainValue.toLocaleString()}원 (1단계 결과)</div>
      <div style="font-size:12px;color:#888;margin-bottom:4px;">변경할 새 프로그램</div>
      <select id="pc2-prog" onchange="_renderProgChangeStep2Fields()"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:14px;font-family:'Noto Sans KR',sans-serif;">
        ${progOptions}
      </select>
      <div id="pc2-fields"></div>
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button onclick="_renderProgChangeStep1()" style="flex:1;padding:12px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;font-weight:700;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">이전</button>
        <button onclick="_progChangeStep2Next()" style="flex:1;padding:12px;background:#3b82f6;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">다음</button>
      </div>`;

    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:22px;width:100%;max-width:320px;max-height:90vh;overflow-y:auto;font-family:'Noto Sans KR',sans-serif;">${body}</div>`;
    document.body.appendChild(modal);
    _renderProgChangeStep2Fields();
  }

  function _renderProgChangeStep2Fields() {
    const progKey = document.getElementById('pc2-prog')?.value;
    const isPeriod = REFUND_PERIOD_PROGS.includes(progKey);
    const fieldsEl = document.getElementById('pc2-fields');
    if (!fieldsEl) return;
    if (isPeriod) {
      fieldsEl.innerHTML = `
        <div style="font-size:12px;color:#888;margin-bottom:4px;">변경 후 금액</div>
        <input id="pc2-price" type="text" inputmode="numeric" value="0" oninput="_fmtMoneyInput(this)"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">
        <div style="font-size:12px;color:#888;margin-bottom:4px;">이용기간 (개월)</div>
        <input id="pc2-months" type="number" value="1"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;font-family:'Noto Sans KR',sans-serif;">`;
    } else {
      fieldsEl.innerHTML = `
        <div style="font-size:12px;color:#888;margin-bottom:4px;">변경 후 금액</div>
        <input id="pc2-price" type="text" inputmode="numeric" value="0" oninput="_fmtMoneyInput(this)"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">
        <div style="font-size:12px;color:#888;margin-bottom:4px;">횟수</div>
        <input id="pc2-count" type="number" value="1"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;font-family:'Noto Sans KR',sans-serif;">`;
    }
  }

  function _progChangeStep2Next() {
    const ctx = window._changeCtx;
    if (!ctx) return;
    const newProgKey = document.getElementById('pc2-prog')?.value;
    const price = _getMoneyVal('pc2-price');
    const isPeriod = REFUND_PERIOD_PROGS.includes(newProgKey);
    ctx.newProgKey = newProgKey;
    ctx.newPrice = price;
    if (isPeriod) {
      ctx.newMonths = parseFloat(document.getElementById('pc2-months')?.value) || 0;
    } else {
      ctx.newCount = parseInt(document.getElementById('pc2-count')?.value) || 0;
    }
    _renderProgChangeStep3();
  }

  // ══════════════ 프로그램 변경 (3/4단계: 차액 비교 + 결제/환불) ══════════════
  function _renderProgChangeStep3() {
    const ctx = window._changeCtx;
    document.getElementById('app-change-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-change-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';

    const diff = ctx.newPrice - ctx.remainValue;
    ctx.diff = diff;

    let diffSection;
    if (diff > 0) {
      diffSection = `
        <div style="background:#fef3e2;border-radius:8px;padding:12px;margin-bottom:14px;">
          <div style="font-size:13px;font-weight:700;color:#d97706;">➕ 추가결제 필요: ${diff.toLocaleString()}원</div>
        </div>
        <div style="font-size:12px;color:#888;margin-bottom:4px;">추가결제 금액 (수정 가능)</div>
        <input id="pc3-amount" type="text" inputmode="numeric" value="${diff.toLocaleString()}" oninput="_fmtMoneyInput(this)"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">
        <div style="font-size:12px;color:#888;margin-bottom:6px;">결제수단</div>
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          <button id="pc3-method-cash" onclick="_selectProgChangeMethod('cash')" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid var(--blue,#3b82f6);background:var(--blue,#3b82f6);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">현금</button>
          <button id="pc3-method-card" onclick="_selectProgChangeMethod('card')" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #e0e0e0;background:none;color:#888;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">카드</button>
          <button id="pc3-method-transfer" onclick="_selectProgChangeMethod('transfer')" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #e0e0e0;background:none;color:#888;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">계좌</button>
        </div>`;
    } else if (diff < 0) {
      const refundAmt = Math.abs(diff);
      diffSection = `
        <div style="background:#e8f4fd;border-radius:8px;padding:12px;margin-bottom:14px;">
          <div style="font-size:13px;font-weight:700;color:#1a6fd4;">➖ 환불 발생: ${refundAmt.toLocaleString()}원</div>
        </div>
        <div style="font-size:12px;color:#888;margin-bottom:4px;">환불 금액 (수정 가능)</div>
        <input id="pc3-amount" type="text" inputmode="numeric" value="${refundAmt.toLocaleString()}" oninput="_fmtMoneyInput(this)"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">
        <div style="font-size:12px;color:#888;margin-bottom:6px;">환불수단</div>
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          <button id="pc3-method-cash" onclick="_selectProgChangeMethod('cash')" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid var(--blue,#3b82f6);background:var(--blue,#3b82f6);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">현금</button>
          <button id="pc3-method-card" onclick="_selectProgChangeMethod('card')" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #e0e0e0;background:none;color:#888;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">카드</button>
          <button id="pc3-method-transfer" onclick="_selectProgChangeMethod('transfer')" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #e0e0e0;background:none;color:#888;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">계좌</button>
        </div>`;
    } else {
      diffSection = `
        <div style="background:#f3f4f6;border-radius:8px;padding:12px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:700;color:#888;">차액 없음 (잔여가치와 변경후금액이 같아요)</div>
        </div>`;
    }

    const body = `<div style="font-size:15px;font-weight:700;margin-bottom:4px;color:var(--text,#1a1a1a);">🔄 프로그램 변경 — 3/4 차액 처리</div>
      <div style="font-size:12px;color:#888;margin-bottom:14px;">잔여가치 ${ctx.remainValue.toLocaleString()}원 → 변경후금액 ${ctx.newPrice.toLocaleString()}원</div>
      ${diffSection}
      <div style="display:flex;gap:10px;">
        <button onclick="_renderProgChangeStep2()" style="flex:1;padding:12px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;font-weight:700;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">이전</button>
        <button onclick="_progChangeStep3Next()" style="flex:1;padding:12px;background:#3b82f6;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">다음</button>
      </div>`;

    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:22px;width:100%;max-width:320px;max-height:90vh;overflow-y:auto;font-family:'Noto Sans KR',sans-serif;">${body}</div>`;
    document.body.appendChild(modal);
    ctx.settleMethod = 'cash';
  }

  function _selectProgChangeMethod(method) {
    const ctx = window._changeCtx;
    if (!ctx) return;
    ctx.settleMethod = method;
    ['cash','card','transfer'].forEach(m => {
      const btn = document.getElementById('pc3-method-' + m);
      if (!btn) return;
      if (m === method) {
        btn.style.background = 'var(--blue, #3b82f6)'; btn.style.color = 'white'; btn.style.border = '1.5px solid var(--blue, #3b82f6)';
      } else {
        btn.style.background = 'none'; btn.style.color = '#888'; btn.style.border = '1.5px solid #e0e0e0';
      }
    });
  }

  function _progChangeStep3Next() {
    const ctx = window._changeCtx;
    if (!ctx) return;
    ctx.settleAmount = ctx.diff !== 0 ? _getMoneyVal('pc3-amount') : 0;
    _renderProgChangeStep4();
  }

  // ══════════════ 프로그램 변경 (4/4단계: 최종 확인 + 저장) ══════════════
  function _renderProgChangeStep4() {
    const ctx = window._changeCtx;
    document.getElementById('app-change-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-change-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';

    const methodLabel = { cash:'현금', card:'카드', transfer:'계좌' }[ctx.settleMethod] || '현금';
    const diffLine = ctx.diff > 0 ? '추가결제 ' + ctx.settleAmount.toLocaleString() + '원 (' + methodLabel + ')'
      : ctx.diff < 0 ? '환불 ' + ctx.settleAmount.toLocaleString() + '원 (' + methodLabel + ')'
      : '차액 없음';

    const body = `<div style="font-size:15px;font-weight:700;margin-bottom:14px;color:var(--text,#1a1a1a);">🔄 프로그램 변경 — 4/4 최종 확인</div>
      <div style="background:var(--bg,#f7f7f7);border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;line-height:1.8;color:var(--text,#1a1a1a);">
        <div>기존 프로그램: <b>${REFUND_PROG_NAMES[ctx.progKey]||ctx.progKey}</b></div>
        <div>변경할 프로그램: <b>${REFUND_PROG_NAMES[ctx.newProgKey]||ctx.newProgKey}</b></div>
        <div>잔여가치: ${ctx.remainValue.toLocaleString()}원</div>
        <div>변경후금액: ${ctx.newPrice.toLocaleString()}원</div>
        <div style="margin-top:6px;font-weight:700;color:#3b82f6;">${diffLine}</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button onclick="_renderProgChangeStep3()" style="flex:1;padding:12px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;font-weight:700;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">이전</button>
        <button id="pc4-confirm-btn" onclick="_confirmProgChange()" style="flex:1;padding:12px;background:#3b82f6;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">변경 확정</button>
      </div>`;

    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:22px;width:100%;max-width:320px;max-height:90vh;overflow-y:auto;font-family:'Noto Sans KR',sans-serif;">${body}</div>`;
    document.body.appendChild(modal);
  }

  async function _confirmProgChange() {
    const ctx = window._changeCtx;
    if (!ctx) return;
    const btn = document.getElementById('pc4-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }
    try {
      const todayStr = _todayISO();
      const updates = {};
      let contractInfo = null; // 새 계약서에 넣을 이름/생일/성별/주소 참고용

      if (ctx.pkgItems) {
        // 패키지 전체 모드 — 여러 항목(여러 계약서에 걸쳐있을 수 있음)에 각각 progChangeOut 표시
        for (const it of ctx.pkgItems) {
          const snap = await db.ref('contracts/' + ctx.phone + '/' + it.contractKey).once('value');
          if (!snap.exists()) continue;
          const contract = snap.val();
          if (!contractInfo) contractInfo = contract;
          const freshItems = _flattenContractItems(contract);
          const fresh = freshItems.find(x => x.progKey === it.progKey && x.pkgIndex === it.pkgIndex);
          if (!fresh || !_isItemEligible(fresh.data)) continue; // 이미 처리된 항목은 건너뜀
          const basePath = it.pkgIndex === null
            ? 'contracts/' + ctx.phone + '/' + it.contractKey + '/programs/' + it.progKey
            : 'contracts/' + ctx.phone + '/' + it.contractKey + '/packages/' + it.pkgIndex + '/items/' + it.progKey;
          updates[basePath + '/progChangeOut'] = {
            toProgKey: ctx.newProgKey, newPrice: ctx.newPrice, remainValue: ctx.remainValue,
            diff: ctx.diff, settleAmount: ctx.settleAmount || 0, method: ctx.settleMethod,
            date: todayStr, processedAt: Date.now(),
            mergedLabel: ctx.progKey, mergedCount: ctx.pkgItems.length
          };
        }
        if (!contractInfo) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
      } else {
        // 단일 항목 모드
        const snap = await db.ref('contracts/' + ctx.phone + '/' + ctx.contractKey).once('value');
        if (!snap.exists()) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
        const contract = snap.val();
        contractInfo = contract;
        const items = _flattenContractItems(contract);
        const fromItem = items.find(it => it.progKey === ctx.progKey);
        if (!fromItem) { showToast('해당 프로그램을 찾을 수 없어요.', 'error'); return; }
        if (!_isItemEligible(fromItem.data)) { showToast('이미 처리된 프로그램이에요.', 'error'); return; }

        const fromBasePath = fromItem.pkgIndex === null
          ? 'contracts/' + ctx.phone + '/' + ctx.contractKey + '/programs/' + ctx.progKey
          : 'contracts/' + ctx.phone + '/' + ctx.contractKey + '/packages/' + fromItem.pkgIndex + '/items/' + ctx.progKey;
        updates[fromBasePath + '/progChangeOut'] = {
          toProgKey: ctx.newProgKey, newPrice: ctx.newPrice, remainValue: ctx.remainValue,
          diff: ctx.diff, settleAmount: ctx.settleAmount || 0, method: ctx.settleMethod,
          date: todayStr, processedAt: Date.now()
        };
      }

      // 새 프로그램 종료일 계산 (기간제만 — 개월수 기준, 기존 계약서 작성과 동일한 방식)
      const isNewPeriod = REFUND_PERIOD_PROGS.includes(ctx.newProgKey);
      let endDate = '';
      if (isNewPeriod) {
        const d = new Date(todayStr);
        d.setMonth(d.getMonth() + (ctx.newMonths || 0));
        d.setDate(d.getDate() - 1);
        endDate = _isoDate(d);
      }

      // 실제로 "오늘 새로 받은 돈"만 새 프로그램 금액으로 기록 (잔여가치 이전분은 0원 처리 — 매출 중복방지)
      const newCharged = ctx.diff > 0 ? (ctx.settleAmount || 0) : 0;
      const progChangeInObj = {
        remainValueCarried: ctx.remainValue,
        diff: ctx.diff, settleAmount: ctx.settleAmount || 0, method: ctx.settleMethod,
        date: todayStr, processedAt: Date.now()
      };
      if (ctx.pkgItems) {
        progChangeInObj.fromLabel = ctx.progKey; // "기구필라테스 개인 + 기구필라테스 그룹" 처럼 합쳐진 표시용 텍스트
        progChangeInObj.fromItems = ctx.pkgItems.map(it => ({ contractKey: it.contractKey, progKey: it.progKey }));
      } else {
        progChangeInObj.fromProgKey = ctx.progKey;
        progChangeInObj.fromContractKey = ctx.contractKey;
      }
      const newProgramData = {
        months: isNewPeriod ? (ctx.newMonths || 0) : 0,
        count: isNewPeriod ? 0 : (ctx.newCount || 0),
        price: newCharged,
        cash: ctx.settleMethod === 'cash' ? newCharged : 0,
        card: ctx.settleMethod === 'card' ? newCharged : 0,
        transfer: ctx.settleMethod === 'transfer' ? newCharged : 0,
        startDate: todayStr,
        endDate: endDate,
        progChangeIn: progChangeInObj
      };

      const newContractData = {
        name: contractInfo.name || '', phone: ctx.phone,
        birth: contractInfo.birth || '', gender: contractInfo.gender || '', address: contractInfo.address || '',
        memo: ctx.progKey + ' → ' + (REFUND_PROG_NAMES[ctx.newProgKey]||ctx.newProgKey) + ' 프로그램 변경 (잔여가치 ' + ctx.remainValue.toLocaleString() + '원 이전)',
        type: 'progChange', signDate: todayStr, createdAt: Date.now(),
        programs: { [ctx.newProgKey]: newProgramData }
      };
      const newKey = todayStr + '_' + Date.now();
      updates['contracts/' + ctx.phone + '/' + newKey] = newContractData;

      await db.ref().update(updates);

      document.getElementById('app-change-modal')?.remove();
      showToast('✅ 프로그램 변경 완료!', 'success');
      _renderMdContracts(ctx.phone);
    } catch(e) {
      showToast('프로그램 변경 처리 실패: ' + e.message, 'error');
      const btn2 = document.getElementById('pc4-confirm-btn');
      if (btn2) { btn2.disabled = false; btn2.textContent = '변경 확정'; }
    }
  }

  window.startProgChange = startProgChange;
  window.openProgChangeModal = openProgChangeModal;
  window._progChangePickerNext = _progChangePickerNext;
  window._recalcProgChange = _recalcProgChange;
  window._progChangeStep1Next = _progChangeStep1Next;

  function _renderPkgProgChangeStep1() {
    const ctx = window._changeCtx;
    document.getElementById('app-change-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-change-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';

    const itemRows = ctx.pkgItems.map(it => {
      const d = it.data;
      return `<div style="font-size:12px;color:#888;padding:4px 0;border-bottom:1px solid #e5e5e5;">
        ${REFUND_PROG_NAMES[it.progKey]||it.progKey} · ${(d.price||0).toLocaleString()}원 ${d.count ? '· '+d.count+'회':''} (${d.startDate||'-'}~${d.endDate||'-'})
      </div>`;
    }).join('');

    const body = `<div style="font-size:15px;font-weight:700;margin-bottom:4px;color:var(--text,#1a1a1a);">🔄 프로그램 변경 — 1/4 패키지 잔여가치 확인</div>
      <div style="font-size:12px;color:#888;margin-bottom:10px;">패키지 안의 프로그램 ${ctx.pkgItems.length}개를 하나로 합쳐서 변경해요</div>
      <div style="background:var(--bg,#f7f7f7);border-radius:8px;padding:10px 12px;margin-bottom:14px;">${itemRows}</div>
      <div style="font-size:12px;color:#888;margin-bottom:4px;">전체 잔여가치 (각 프로그램의 남은 가치를 합산해서 직접 입력)</div>
      <input id="pc-value" type="text" inputmode="numeric" value="0" oninput="_fmtMoneyInput(this)"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:16px;font-family:'Noto Sans KR',sans-serif;">
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('app-change-modal').remove()" style="flex:1;padding:12px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;font-weight:700;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">취소</button>
        <button onclick="_pkgProgChangeStep1Next()" style="flex:1;padding:12px;background:#3b82f6;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">다음</button>
      </div>`;

    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:22px;width:100%;max-width:320px;max-height:90vh;overflow-y:auto;font-family:'Noto Sans KR',sans-serif;">${body}</div>`;
    document.body.appendChild(modal);
  }

  function _pkgProgChangeStep1Next() {
    const ctx = window._changeCtx;
    if (!ctx) return;
    ctx.remainValue = _getMoneyVal('pc-value');
    _renderProgChangeStep2();
  }

  window._renderProgChangeStep1 = _renderProgChangeStep1;
  window._renderProgChangeStep2 = _renderProgChangeStep2;
  window._renderProgChangeStep2Fields = _renderProgChangeStep2Fields;
  window._progChangeStep2Next = _progChangeStep2Next;
  window._fmtMoneyInput = _fmtMoneyInput;
  window._renderProgChangeStep3 = _renderProgChangeStep3;
  window._selectProgChangeMethod = _selectProgChangeMethod;
  window._progChangeStep3Next = _progChangeStep3Next;
  window._renderProgChangeStep4 = _renderProgChangeStep4;
  window._confirmProgChange = _confirmProgChange;
  window._renderPkgProgChangeStep1 = _renderPkgProgChangeStep1;
  window._pkgProgChangeStep1Next = _pkgProgChangeStep1Next;

  // ══════════════ 정지/휴회 ══════════════
  // 모든 프로그램(기간제/횟수제 전체) 허용 — 추가결제 없이 종료일만 미뤄주는 기능
  function startHold(phone, contractKey, progKey) {
    db.ref('contracts/' + phone + '/' + contractKey).once('value').then(snap => {
      if (!snap.exists()) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
      if (progKey) {
        openHoldModal(phone, contractKey, progKey);
        return;
      }
      const items = _flattenContractItems(snap.val()).filter(it => _isItemEligible(it.data));
      if (items.length === 1) {
        openHoldModal(phone, contractKey, items[0].progKey);
      } else if (items.length > 1) {
        _showHoldItemPicker(phone, contractKey, items);
      } else {
        showToast('정지/휴회할 수 있는 프로그램이 없어요.', 'error');
      }
    });
  }

  function _showHoldItemPicker(phone, contractKey, items) {
    document.getElementById('app-hold-picker')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-hold-picker';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;';
    window._holdPickerItems = items; // 체크박스 인덱스로 다시 찾기 위해 임시저장
    const itemRows = items.map((it, idx) => {
      const label = (REFUND_PROG_NAMES[it.progKey] || it.progKey) + (it.pkgName ? ' (📦 ' + it.pkgName + ')' : '');
      return `<label style="display:flex;align-items:center;gap:8px;width:100%;padding:12px;margin-bottom:8px;background:var(--bg,#f7f7f7);border:1px solid #e0e0e0;border-radius:10px;font-size:14px;color:var(--text,#1a1a1a);cursor:pointer;font-family:'Noto Sans KR',sans-serif;">
        <input type="checkbox" class="ph-pick-item" data-idx="${idx}" style="width:18px;height:18px;flex-shrink:0;">
        <span style="flex:1;">${label} · 종료일 ${it.data.endDate||'-'}</span>
      </label>`;
    }).join('');
    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:24px;width:100%;max-width:300px;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:14px;font-weight:700;margin-bottom:6px;color:var(--text,#1a1a1a);">정지/휴회할 프로그램을 선택하세요</div>
      <div style="font-size:11.5px;color:#888;margin-bottom:14px;">2개 이상 선택하면 한번에 같이 휴회처리할 수 있어요</div>
      ${itemRows}
      <button onclick="_holdPickerNext('${phone}','${contractKey}')"
        style="width:100%;padding:11px;background:#3b82f6;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-top:6px;">선택한 프로그램 휴회하기</button>
      <button onclick="document.getElementById('app-hold-picker').remove()"
        style="width:100%;padding:10px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:13px;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-top:8px;">취소</button>
    </div>`;
    document.body.appendChild(modal);
  }

  function _holdPickerNext(phone, contractKey) {
    const items = window._holdPickerItems || [];
    const checked = Array.from(document.querySelectorAll('.ph-pick-item:checked')).map(el => items[parseInt(el.dataset.idx)]);
    if (!checked.length) { showToast('하나 이상 선택해주세요.', 'error'); return; }
    document.getElementById('app-hold-picker')?.remove();
    if (checked.length === 1) {
      openHoldModal(phone, contractKey, checked[0].progKey);
    } else {
      window._multiHoldCtx = { phone, contractKey, items: checked };
      _renderMultiHoldForm();
    }
  }

  function openHoldModal(phone, contractKey, progKey) {
    document.getElementById('app-hold-picker')?.remove();
    db.ref('contracts/' + phone + '/' + contractKey).once('value').then(async snap => {
      if (!snap.exists()) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
      const items = _flattenContractItems(snap.val());
      const item = items.find(it => it.progKey === progKey);
      if (!item) { showToast('해당 프로그램을 찾을 수 없어요.', 'error'); return; }
      if (!_isItemEligible(item.data)) { showToast('이미 처리된 프로그램이에요.', 'error'); return; }
      const basePath = item.pkgIndex === null
        ? 'contracts/' + phone + '/' + contractKey + '/programs/' + progKey
        : 'contracts/' + phone + '/' + contractKey + '/packages/' + item.pkgIndex + '/items/' + progKey;
      const expiredUpd = _buildExpiredHoldUpdate(basePath, item.data);
      if (expiredUpd) { await db.ref().update(expiredUpd); item.data.activeHold = null; }
      if (_isActivelyOnHold(item.data)) { showToast('이미 휴회중인 프로그램이에요.', 'error'); return; }
      window._holdCtx = { phone, contractKey, progKey, item };
      _renderHoldForm();
    });
  }

  function _renderHoldForm() {
    const ctx = window._holdCtx;
    const data = ctx.item.data;
    document.getElementById('app-hold-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-hold-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';

    const body = `<div style="font-size:15px;font-weight:700;margin-bottom:4px;color:var(--text,#1a1a1a);">⏸️ 정지/휴회</div>
      <div style="font-size:12px;color:#888;margin-bottom:14px;">${REFUND_PROG_NAMES[ctx.progKey]||ctx.progKey} · 현재 종료일 ${data.endDate||'-'}</div>
      <div style="font-size:12px;color:#888;margin-bottom:4px;">휴회 시작일</div>
      <input id="ph-start-date" type="date" value="${_todayISO()}" onchange="_onHoldDateChange()"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:12px;color:#888;margin-bottom:4px;">휴회일수</div>
      <input id="ph-days" type="number" value="7" oninput="_onHoldDateChange()"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:6px;font-family:'Noto Sans KR',sans-serif;">
      <div id="ph-end-display" style="font-size:12px;color:#3b82f6;font-weight:700;margin-bottom:16px;"></div>
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('app-hold-modal').remove()" style="flex:1;padding:12px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;font-weight:700;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">취소</button>
        <button id="ph-confirm-btn" onclick="_confirmHold()" style="flex:1;padding:12px;background:#3b82f6;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">휴회 확정</button>
      </div>`;

    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:22px;width:100%;max-width:320px;max-height:90vh;overflow-y:auto;font-family:'Noto Sans KR',sans-serif;">${body}</div>`;
    document.body.appendChild(modal);
    _onHoldDateChange();
  }

  // 휴회 시작일+휴회일수 → 새 종료일 자동계산 (기존 종료일 + 휴회일수)
  function _onHoldDateChange() {
    const ctx = window._holdCtx;
    const startEl = document.getElementById('ph-start-date');
    const daysEl = document.getElementById('ph-days');
    const display = document.getElementById('ph-end-display');
    if (!ctx || !startEl || !daysEl || !display) return;
    const days = Math.max(0, parseInt(daysEl.value) || 0);
    const prevEndDate = ctx.item.data.endDate;
    if (!prevEndDate) { display.textContent = ''; return; }
    const d = new Date(prevEndDate);
    d.setDate(d.getDate() + days);
    const endStr = _isoDate(d);
    display.textContent = '→ 새 종료일: ' + endStr + ' (' + days + '일 연장)';
    display.dataset.newEndDate = endStr;
  }

  async function _confirmHold() {
    const ctx = window._holdCtx;
    if (!ctx) return;
    const btn = document.getElementById('ph-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }
    try {
      const startDate = document.getElementById('ph-start-date')?.value || _todayISO();
      const days = Math.max(0, parseInt(document.getElementById('ph-days')?.value) || 0);
      const snap = await db.ref('contracts/' + ctx.phone + '/' + ctx.contractKey).once('value');
      if (!snap.exists()) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
      const contract = snap.val();
      const items = _flattenContractItems(contract);
      const item = items.find(it => it.progKey === ctx.progKey);
      if (!item) { showToast('해당 프로그램을 찾을 수 없어요.', 'error'); return; }
      if (!_isItemEligible(item.data)) { showToast('이미 처리된 프로그램이에요.', 'error'); return; }
      const basePath = item.pkgIndex === null
        ? 'contracts/' + ctx.phone + '/' + ctx.contractKey + '/programs/' + ctx.progKey
        : 'contracts/' + ctx.phone + '/' + ctx.contractKey + '/packages/' + item.pkgIndex + '/items/' + ctx.progKey;
      const expiredUpd = _buildExpiredHoldUpdate(basePath, item.data);
      if (expiredUpd) { await db.ref().update(expiredUpd); item.data.activeHold = null; }
      if (_isActivelyOnHold(item.data)) { showToast('이미 휴회중인 프로그램이에요.', 'error'); return; }

      const prevEndDate = item.data.endDate || _todayISO();
      const d = new Date(prevEndDate);
      d.setDate(d.getDate() + days);
      const newEndDate = _isoDate(d);

      const holdKey = String(Date.now());
      const updates = {};
      updates[basePath + '/endDate'] = newEndDate;
      updates[basePath + '/activeHold'] = {
        key: holdKey, startDate, days, prevEndDate, newEndDate, processedAt: Date.now()
      };

      await db.ref().update(updates);
      document.getElementById('app-hold-modal')?.remove();
      showToast('✅ 휴회 처리 완료! (새 종료일: ' + newEndDate + ')', 'success');
      _renderMdContracts(ctx.phone);
    } catch(e) {
      showToast('휴회 처리 실패: ' + e.message, 'error');
      const btn2 = document.getElementById('ph-confirm-btn');
      if (btn2) { btn2.disabled = false; btn2.textContent = '휴회 확정'; }
    }
  }

  window.startHold = startHold;
  window.openHoldModal = openHoldModal;
  window._onHoldDateChange = _onHoldDateChange;
  window._confirmHold = _confirmHold;
  window._holdPickerNext = _holdPickerNext;

  // ══════════════ 정지/휴회 (여러 프로그램 한번에 처리) ══════════════
  function _renderMultiHoldForm() {
    const ctx = window._multiHoldCtx;
    document.getElementById('app-hold-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-hold-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';

    const itemRows = ctx.items.map((it, idx) => {
      const label = (REFUND_PROG_NAMES[it.progKey] || it.progKey) + (it.pkgName ? ' (📦 ' + it.pkgName + ')' : '');
      return `<div style="font-size:12px;color:#888;padding:6px 0;border-bottom:1px solid #e5e5e5;">
        ${label} · 현재 종료일 ${it.data.endDate||'-'}
        <div id="mh-end-${idx}" style="color:#3b82f6;font-weight:700;margin-top:2px;"></div>
      </div>`;
    }).join('');

    const body = `<div style="font-size:15px;font-weight:700;margin-bottom:4px;color:var(--text,#1a1a1a);">⏸️ 정지/휴회 (${ctx.items.length}개 한번에)</div>
      <div style="background:var(--bg,#f7f7f7);border-radius:8px;padding:10px 12px;margin-bottom:14px;">${itemRows}</div>
      <div style="font-size:12px;color:#888;margin-bottom:4px;">휴회 시작일</div>
      <input id="mh-start-date" type="date" value="${_todayISO()}" onchange="_onMultiHoldDateChange()"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:12px;color:#888;margin-bottom:4px;">휴회일수 (선택한 프로그램 전체에 동일하게 적용)</div>
      <input id="mh-days" type="number" value="7" oninput="_onMultiHoldDateChange()"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:16px;font-family:'Noto Sans KR',sans-serif;">
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('app-hold-modal').remove()" style="flex:1;padding:12px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;font-weight:700;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">취소</button>
        <button id="mh-confirm-btn" onclick="_confirmMultiHold()" style="flex:1;padding:12px;background:#3b82f6;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">휴회 확정 (${ctx.items.length}개)</button>
      </div>`;

    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:22px;width:100%;max-width:320px;max-height:90vh;overflow-y:auto;font-family:'Noto Sans KR',sans-serif;">${body}</div>`;
    document.body.appendChild(modal);
    _onMultiHoldDateChange();
  }

  // 공통 시작일+휴회일수 → 항목별로 각자의 현재 종료일 기준 새 종료일 미리보기
  function _onMultiHoldDateChange() {
    const ctx = window._multiHoldCtx;
    const daysEl = document.getElementById('mh-days');
    if (!ctx || !daysEl) return;
    const days = Math.max(0, parseInt(daysEl.value) || 0);
    ctx.items.forEach((it, idx) => {
      const display = document.getElementById('mh-end-' + idx);
      if (!display) return;
      const prevEndDate = it.data.endDate;
      if (!prevEndDate) { display.textContent = ''; return; }
      const d = new Date(prevEndDate);
      d.setDate(d.getDate() + days);
      const endStr = _isoDate(d);
      display.textContent = '→ 새 종료일: ' + endStr;
      display.dataset.newEndDate = endStr;
    });
  }

  async function _confirmMultiHold() {
    const ctx = window._multiHoldCtx;
    if (!ctx) return;
    const btn = document.getElementById('mh-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }
    try {
      const startDate = document.getElementById('mh-start-date')?.value || _todayISO();
      const days = Math.max(0, parseInt(document.getElementById('mh-days')?.value) || 0);
      const snap = await db.ref('contracts/' + ctx.phone + '/' + ctx.contractKey).once('value');
      if (!snap.exists()) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
      const contract = snap.val();
      const freshItems = _flattenContractItems(contract);

      // 1차: 만료된(날짜 지난) 휴회가 아직 안 정리된 항목들 먼저 자동마감
      const expiredUpdates = {};
      freshItems.forEach(fi => {
        const basePath = fi.pkgIndex === null
          ? 'contracts/' + ctx.phone + '/' + ctx.contractKey + '/programs/' + fi.progKey
          : 'contracts/' + ctx.phone + '/' + ctx.contractKey + '/packages/' + fi.pkgIndex + '/items/' + fi.progKey;
        const upd = _buildExpiredHoldUpdate(basePath, fi.data);
        if (upd) { Object.assign(expiredUpdates, upd); fi.data.activeHold = null; }
      });
      if (Object.keys(expiredUpdates).length) { await db.ref().update(expiredUpdates); }

      const updates = {};
      let appliedCount = 0;

      ctx.items.forEach(it => {
        const fresh = freshItems.find(x => x.progKey === it.progKey && x.pkgIndex === it.pkgIndex);
        if (!fresh || !_isItemEligible(fresh.data) || _isActivelyOnHold(fresh.data)) return; // 이미 처리됐거나 진짜로 아직 휴회중이면 건너뜀
        const basePath = it.pkgIndex === null
          ? 'contracts/' + ctx.phone + '/' + ctx.contractKey + '/programs/' + it.progKey
          : 'contracts/' + ctx.phone + '/' + ctx.contractKey + '/packages/' + it.pkgIndex + '/items/' + it.progKey;
        const prevEndDate = fresh.data.endDate || _todayISO();
        const d = new Date(prevEndDate);
        d.setDate(d.getDate() + days);
        const newEndDate = _isoDate(d);
        updates[basePath + '/endDate'] = newEndDate;
        updates[basePath + '/activeHold'] = {
          key: String(Date.now()) + '_' + it.progKey, startDate, days, prevEndDate, newEndDate, processedAt: Date.now()
        };
        appliedCount++;
      });

      if (!appliedCount) { showToast('휴회 처리할 수 있는 항목이 없어요 (이미 처리됨/휴회중).', 'error'); return; }

      await db.ref().update(updates);
      document.getElementById('app-hold-modal')?.remove();
      showToast('✅ ' + appliedCount + '개 프로그램 휴회 처리 완료!', 'success');
      _renderMdContracts(ctx.phone);
    } catch(e) {
      showToast('휴회 처리 실패: ' + e.message, 'error');
      const btn2 = document.getElementById('mh-confirm-btn');
      if (btn2) { btn2.disabled = false; btn2.textContent = '휴회 확정'; }
    }
  }

  window._renderMultiHoldForm = _renderMultiHoldForm;
  window._onMultiHoldDateChange = _onMultiHoldDateChange;
  window._confirmMultiHold = _confirmMultiHold;


  window.startTransfer = startTransfer;
  window.openTransferModal = openTransferModal;
  window._lookupTransferRecipient = _lookupTransferRecipient;
  window._transferStep1Next = _transferStep1Next;
  window._renderTransferStep2 = _renderTransferStep2;
  window._selectTransferMethod = _selectTransferMethod;
  window._transferStep2Next = _transferStep2Next;
  window._onTfDateChange = _onTfDateChange;


  function payMemberUnpaid(phone, contractKey, unpaidAmt) {
    showConfirm(`미수금 ${unpaidAmt.toLocaleString()}원을 결제처리 할까요?`, () => {
      db.ref('contracts/' + phone + '/' + contractKey).once('value').then(snap => {
        if (!snap.exists()) { showToast('계약 정보를 찾을 수 없어요.', 'error'); return; }
        const c = snap.val();
        const updates = {};
        // 개별 프로그램 + 패키지 안의 프로그램 모두 미수금을 현금으로 처리
        _flattenContractItems(c).forEach(it => {
          const p = it.data;
          const progUnpaid = (p.price || 0) - (p.cash||0) - (p.card||0) - (p.transfer||0);
          if (progUnpaid > 0) {
            const path = it.pkgIndex === null
              ? 'contracts/' + phone + '/' + contractKey + '/programs/' + it.progKey + '/cash'
              : 'contracts/' + phone + '/' + contractKey + '/packages/' + it.pkgIndex + '/items/' + it.progKey + '/cash';
            updates[path] = (p.cash || 0) + progUnpaid;
          }
        });
        const extras = c.extras || {};
        Object.entries(extras).forEach(([ext, e]) => {
          if (e.deleted) return;
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

      // localStorage 동기화 (변경 모달 등 다른 화면에서도 최신 값 보이도록)
      localStorage.setItem('name_' + phone, name);
      if (birth) localStorage.setItem('body_birth_' + phone, birth);

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
        signsSnap.forEach(child => { signs.push({ key: child.key, ...child.val() }); });
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
    document.getElementById('edit-member-phone').value = phone;
    // 닉네임 불러오기 (Firebase에서)
    const nickEl = document.getElementById('edit-member-nickname');
    if (nickEl) nickEl.value = '';
    db.ref('members/' + phone + '/nickname').once('value').then(snap => {
      if (nickEl) nickEl.value = snap.val() || localStorage.getItem('nickname_' + phone) || '';
    });
    document.getElementById('edit-member-modal').classList.add('active');
  }

  function closeEditMemberModal() {
    document.getElementById('edit-member-modal').classList.remove('active');
  }

  function saveEditMember() {
    const newPhone    = document.getElementById('edit-member-phone').value.trim().replace(/-/g, '');
    const newNickname = (document.getElementById('edit-member-nickname')?.value || '').trim();
    const oldPhone    = currentMemberPhone;
    const info        = cachedMembers[oldPhone];
    const oldNickname = info.nickname || '';

    if (!newPhone || newPhone.length < 10) { showToast('전화번호를 정확히 입력해주세요.', 'error'); return; }

    // 닉네임 검증 (입력했을 때만 — 비워두면 기존 닉네임 그대로 유지, 관리자는 1회 제한 없이 계속 변경 가능)
    if (newNickname) {
      if (newNickname.length < 2 || newNickname.length > 6) {
        showToast('닉네임은 2~6자로 입력해주세요.', 'error'); return;
      }
      if (!/^[가-힣a-zA-Z0-9]+$/.test(newNickname)) {
        showToast('닉네임은 한글, 영문, 숫자만 사용 가능해요.', 'error'); return;
      }
    }

    const phoneChanged = newPhone !== oldPhone;

    // 닉네임 전역 색인(nicknames/) 동기화 — 기존 것 빼고 새 것 등록
    const applyNicknameIndex = (finalPhone) => {
      if (!newNickname || newNickname === oldNickname) return;
      if (oldNickname) db.ref('nicknames/' + oldNickname).remove();
      db.ref('nicknames/' + newNickname).set(finalPhone);
    };

    const doSave = () => {
      const updateData = {};
      if (newNickname) updateData.nickname = newNickname;

      if (phoneChanged) {
        const newData = { ...info, ...updateData };
        db.ref('members/' + newPhone).set(newData).then(() => {
          db.ref('members/' + oldPhone).remove();
          // users에도 닉네임 업데이트
          if (newNickname) db.ref('users/' + newPhone + '/nickname').set(newNickname);
          if (newNickname) localStorage.setItem('nickname_' + newPhone, newNickname);
          applyNicknameIndex(newPhone);
          closeEditMemberModal();
          closeMemberModal();
          loadMemberList();
          showToast('✅ 회원정보가 수정됐어요!', 'success');
        });
      } else {
        db.ref('members/' + oldPhone).update(updateData).then(() => {
          // users에도 닉네임 업데이트
          if (newNickname) db.ref('users/' + oldPhone + '/nickname').set(newNickname);
          if (newNickname) localStorage.setItem('nickname_' + oldPhone, newNickname);
          applyNicknameIndex(oldPhone);
          cachedMembers[oldPhone] = { ...info, ...updateData };
          closeEditMemberModal();
          closeMemberModal();
          loadMemberList();
          showToast('✅ 회원정보가 수정됐어요!', 'success');
        });
      }
    };

    // 닉네임 중복 확인 (안 바꿨으면 건너뜀) → 그 다음 전화번호 변경 흐름 진행
    const proceedWithNicknameCheck = (next) => {
      if (!newNickname || newNickname === oldNickname) { next(); return; }
      db.ref('nicknames/' + newNickname).once('value').then(snap => {
        const owner = snap.val();
        if (snap.exists() && owner !== oldPhone && owner !== newPhone) {
          showToast('이미 사용 중인 닉네임이에요.', 'error');
          return;
        }
        next();
      });
    };

    // 전화번호 변경 시 중복 확인
    if (phoneChanged) {
      db.ref('members/' + newPhone).once('value').then(snap => {
        if (snap.exists()) { showToast('이미 사용 중인 전화번호예요.', 'error'); return; }
        proceedWithNicknameCheck(() => {
          showConfirm('전화번호를 ' + newPhone + '으로 변경할까요?\n로그인 아이디도 바뀌어요.', () => {
            doSave();
          });
        });
      });
    } else {
      proceedWithNicknameCheck(doSave);
    }
  }

  function editMemberPw() {
    showInput('새 비밀번호를 입력하세요 (4자리):', '새 비밀번호', '', (newPw) => {
      if (!newPw || newPw.length < 4) { showToast('4자리를 입력해주세요.', 'error'); return; }
      const hashedPw = hashPw(newPw);
      db.ref('members/' + currentMemberPhone + '/pw').set(hashedPw).then(() => {
        localStorage.removeItem('pw_' + currentMemberPhone);
        showToast('비밀번호가 변경됐어요!', 'success');
        closeEditMemberModal();
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
          closeEditMemberModal();
          loadMemberList();
          openMemberModal(currentMemberPhone);
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
        db.ref('contracts/' + phone),         // 계약서 이력
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
            closeEditMemberModal();
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

    const today = _todayISO();
    const soon = new Date(); soon.setDate(soon.getDate() + 7);
    const soonDate = soon.toISOString().slice(0,10);

    const nos = [];
    for (let n = cat.startNo; n <= cat.endNo; n++) nos.push(n);

    const grid = nos.map(no => {
      const key = cat.id + '_' + no;
      const d = lockerData[key];
      let bg = '#e8f5e9', border = '#81c784', statusEmoji = '', tooltip = '빈칸';
      let nameText = '', ddayText = '', ddayColor = 'var(--text-hint)';
      if (d) {
        const endD = d.endDate || '';
        if (d.status === 'disabled')      { bg='#f5f5f5'; border='#9e9e9e'; statusEmoji='⚫'; tooltip='사용불가'; }
        else if (d.status === 'expired' || (endD && endD < today)) {
          bg='#ffebee'; border='#e57373'; statusEmoji='🔴'; tooltip='기간만료';
        } else if (endD && endD <= soonDate) {
          bg='#fff8e1'; border='#ffb74d'; statusEmoji='🟡'; tooltip='만료임박';
        } else {
          bg='#e3f2fd'; border='#64b5f6'; statusEmoji='🔵'; tooltip='사용중';
        }
        // 이름 (최대 4글자)
        const rawName = (d.name || '').replace(/\(\d{4}\)$/, '').trim();
        nameText = rawName.length > 4 ? rawName.slice(0,4) : rawName;
        // D-day 계산
        if (endD) {
          const diff = Math.ceil((new Date(endD) - new Date(today)) / (1000*60*60*24));
          if (diff < 0) { ddayText = '만료'; ddayColor = '#e57373'; }
          else if (diff === 0) { ddayText = 'D-day'; ddayColor = '#ff9800'; }
          else if (diff <= 7) { ddayText = 'D-' + diff; ddayColor = '#ff9800'; }
          else { ddayText = endD.slice(5); ddayColor = 'var(--text-hint)'; }
        }
      }
      return `<div onclick="openLockerDetail('${cat.id}','${no}')" title="${tooltip}"
        style="width:68px;height:76px;border-radius:10px;background:${bg};border:1.5px solid ${border};
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        cursor:pointer;color:var(--text);gap:1px;padding:4px;box-sizing:border-box;">
        <span style="font-size:11px;font-weight:700;color:var(--text-sub);">${no}번</span>
        ${nameText
          ? `<span style="font-size:12px;font-weight:700;color:var(--text);line-height:1.2;">${nameText}</span>
             <span style="font-size:10px;color:${ddayColor};font-weight:600;">${ddayText}</span>`
          : `<span style="font-size:10px;color:var(--text-hint);">${statusEmoji || '빈칸'}</span>`
        }
      </div>`;
    }).join('');

    wrap.innerHTML = `
      <div style="background:var(--card);border-radius:12px;padding:12px 8px;">
        <!-- 색깔 안내 - 상단 -->
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;padding:6px 8px;background:var(--bg);border-radius:8px;">
          <span style="font-size:11px;color:var(--text-hint);">🟢 빈칸</span>
          <span style="font-size:11px;color:var(--text-hint);">🔵 사용중</span>
          <span style="font-size:11px;color:var(--text-hint);">🟡 만료임박</span>
          <span style="font-size:11px;color:var(--text-hint);">🔴 기간만료</span>
          <span style="font-size:11px;color:var(--text-hint);">⚫ 사용불가</span>
        </div>
        <!-- 락카 그리드 - gap 줄여서 5개씩 -->
        <div style="display:flex;flex-wrap:wrap;gap:5px;">${grid}</div>
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
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div>
              <div style="font-size:12px;color:var(--text-hint);margin-bottom:4px;">회원 연락처</div>
              <input id="ld-phone" type="text" placeholder="01000000000"
                oninput="autoFillLockerName(this.value)"
                style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
            </div>
            <div>
              <div style="font-size:12px;color:var(--text-hint);margin-bottom:4px;">이름</div>
              <input id="ld-name" type="text" placeholder="이름"
                style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
            </div>
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
          <div style="border-top:1px solid var(--border);margin-top:4px;padding-top:10px;">
            <div style="font-size:12px;color:var(--text-hint);margin-bottom:4px;">총 금액 (선택, 입력 시 계약이력에 결제내역으로 기록돼요)</div>
            <input id="ld-price" type="text" inputmode="numeric" placeholder="0" oninput="_formatMoneyInput(this)"
              style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;margin-bottom:8px;" />
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                  <span style="font-size:11px;color:var(--text-hint);">현금</span>
                  <button type="button" onclick="_fillLockerFullAmount('cash')"
                    style="font-size:9.5px;color:var(--blue);background:none;border:none;cursor:pointer;font-family:'Noto Sans KR',sans-serif;padding:0;">전액</button>
                </div>
                <input id="ld-cash" type="text" inputmode="numeric" placeholder="0" oninput="_formatMoneyInput(this)"
                  style="width:100%;box-sizing:border-box;padding:7px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
              </div>
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                  <span style="font-size:11px;color:var(--text-hint);">카드</span>
                  <button type="button" onclick="_fillLockerFullAmount('card')"
                    style="font-size:9.5px;color:var(--blue);background:none;border:none;cursor:pointer;font-family:'Noto Sans KR',sans-serif;padding:0;">전액</button>
                </div>
                <input id="ld-card" type="text" inputmode="numeric" placeholder="0" oninput="_formatMoneyInput(this)"
                  style="width:100%;box-sizing:border-box;padding:7px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
              </div>
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                  <span style="font-size:11px;color:var(--text-hint);">계좌</span>
                  <button type="button" onclick="_fillLockerFullAmount('transfer')"
                    style="font-size:9.5px;color:var(--blue);background:none;border:none;cursor:pointer;font-family:'Noto Sans KR',sans-serif;padding:0;">전액</button>
                </div>
                <input id="ld-transfer" type="text" inputmode="numeric" placeholder="0" oninput="_formatMoneyInput(this)"
                  style="width:100%;box-sizing:border-box;padding:7px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
              </div>
            </div>
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
        <button onclick="editLockerSlot('${catId}','${no}')"
          style="width:100%;padding:11px;background:var(--card);color:var(--text);border:1.5px solid var(--border);border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-bottom:8px;">✏️ 정보 수정</button>
        <div style="display:flex;gap:8px;">
          ${d.status === 'expired' || (d.endDate && d.endDate < _todayISO())
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

  // 배정된 락카 정보 수정 화면 — 운영정보(이름/연락처/기간/자물쇠번호)만 수정. 금액/결제수단은 회원상세 계약이력에서 별도 관리
  function editLockerSlot(catId, no) {
    const key = catId + '_' + no;
    const d = lockerData[key];
    if (!d) { showToast('락카 정보를 찾을 수 없어요.', 'error'); return; }
    const cat = lockerCategories.find(c => c.id === catId);
    const catName = cat ? cat.name : '';

    const html = `
      <div style="padding:4px 0;">
        <div style="font-size:15px;font-weight:700;margin-bottom:14px;">✏️ ${catName} ${no}번 정보 수정</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div>
              <div style="font-size:12px;color:var(--text-hint);margin-bottom:4px;">회원 연락처</div>
              <input id="le-phone" type="text" value="${d.phone || ''}"
                style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
            </div>
            <div>
              <div style="font-size:12px;color:var(--text-hint);margin-bottom:4px;">이름</div>
              <input id="le-name" type="text" value="${d.name || ''}"
                style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div>
              <div style="font-size:12px;color:var(--text-hint);margin-bottom:4px;">시작일</div>
              <input id="le-start" type="date" value="${d.startDate || ''}"
                style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
            </div>
            <div>
              <div style="font-size:12px;color:var(--text-hint);margin-bottom:4px;">종료일</div>
              <input id="le-end" type="date" value="${d.endDate || ''}"
                style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
            </div>
          </div>
          <div>
            <div style="font-size:12px;color:var(--text-hint);margin-bottom:4px;">자물쇠 번호</div>
            <input id="le-lock" type="text" value="${d.lockPassword || ''}"
              style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;outline:none;" />
          </div>
          ${d.linkedContract ? `<div style="font-size:11px;color:var(--text-hint);">📌 시작일/종료일을 바꾸면 연결된 계약이력에도 자동으로 함께 반영돼요.</div>` : ''}
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button onclick="saveLockerEdit('${catId}','${no}')"
            style="flex:1;padding:11px;background:var(--blue);color:white;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">💾 저장</button>
          <button onclick="openLockerDetail('${catId}','${no}')"
            style="flex:1;padding:11px;background:#f5f5f5;color:#666;border:1.5px solid var(--border);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">취소</button>
        </div>
      </div>`;

    showLockerDetail(html);
  }

  // 락카 정보수정 저장 — 시작일/종료일이 바뀌면 연결된 계약이력(extras.locker)에도 같이 반영 (양방향 동기화)
  async function saveLockerEdit(catId, no) {
    const key = catId + '_' + no;
    const d = lockerData[key];
    if (!d) { showToast('락카 정보를 찾을 수 없어요.', 'error'); return; }

    const newPhone = document.getElementById('le-phone')?.value.trim();
    const newName  = document.getElementById('le-name')?.value.trim();
    const newStart = document.getElementById('le-start')?.value || '';
    const newEnd   = document.getElementById('le-end')?.value || '';
    const newLock  = document.getElementById('le-lock')?.value.trim();
    if (!newPhone) { showToast('연락처를 입력해주세요.', 'error'); return; }

    try {
      const updates = {};
      updates['lockers/' + key + '/phone'] = newPhone;
      updates['lockers/' + key + '/name'] = newName;
      updates['lockers/' + key + '/startDate'] = newStart;
      updates['lockers/' + key + '/endDate'] = newEnd;
      updates['lockers/' + key + '/lockPassword'] = newLock;

      // 연락처가 바뀌었으면 — 회원 데이터의 lockerKey도 옮겨줌
      if (newPhone !== d.phone) {
        if (d.phone) updates['members/' + d.phone + '/lockerKey'] = null;
        updates['members/' + newPhone + '/lockerKey'] = key;
      }

      // 시작일/종료일이 바뀌었고, 연결된 계약이력이 있으면 — 그쪽 날짜도 같이 업데이트
      const dateChanged = newStart !== (d.startDate || '') || newEnd !== (d.endDate || '');
      if (dateChanged && d.linkedContract?.phone && d.linkedContract?.contractKey) {
        const lc = d.linkedContract;
        updates['contracts/' + lc.phone + '/' + lc.contractKey + '/extras/locker/startDate'] = newStart;
        updates['contracts/' + lc.phone + '/' + lc.contractKey + '/extras/locker/endDate'] = newEnd;
      }

      await db.ref().update(updates);

      lockerData[key] = { ...d, phone: newPhone, name: newName, startDate: newStart, endDate: newEnd, lockPassword: newLock };
      closeLockerDetail();
      renderLockerStatus();
      showToast('✅ 락카 정보가 수정됐어요.', 'success');
    } catch (e) {
      showToast('수정 실패: ' + e.message, 'error');
    }
  }
  window.editLockerSlot = editLockerSlot;
  window.saveLockerEdit = saveLockerEdit;

  // 연락처 입력 시 이름 자동 불러오기
  let _autoFillTimer = null;
  function autoFillLockerName(phone) {
    clearTimeout(_autoFillTimer);
    if (phone.length < 10) return;
    _autoFillTimer = setTimeout(async () => {
      const snap = await db.ref('members/' + phone).once('value');
      if (snap.exists()) {
        const name = snap.val().name || '';
        const nameEl = document.getElementById('ld-name');
        if (nameEl && name) nameEl.value = name.replace(/\(\d{4}\)$/, '').trim();
      }
    }, 500);
  }

  // 락카 배정 결제입력: "전액" 버튼 — 총금액을 클릭한 칸에 채우고 나머지 두 칸은 0으로 정리
  function _fillLockerFullAmount(field) {
    const price = parseInt((document.getElementById('ld-price')?.value || '0').replace(/[^0-9]/g, '')) || 0;
    ['cash', 'card', 'transfer'].forEach(f => {
      const el = document.getElementById('ld-' + f);
      if (!el) return;
      el.value = (f === field ? price : 0).toLocaleString();
    });
  }
  window._fillLockerFullAmount = _fillLockerFullAmount;

  async function assignLocker(catId, no) {
    const phone = document.getElementById('ld-phone')?.value.trim();
    const inputName = document.getElementById('ld-name')?.value.trim();
    const start = document.getElementById('ld-start')?.value;
    const end   = document.getElementById('ld-end')?.value;
    const lock  = document.getElementById('ld-lock')?.value.trim();
    if (!phone) { showToast('연락처를 입력해주세요.', 'error'); return; }

    const numField = id => parseInt((document.getElementById(id)?.value || '0').replace(/[^0-9]/g, '')) || 0;
    const price    = numField('ld-price');
    const cash     = numField('ld-cash');
    const card     = numField('ld-card');
    const transfer = numField('ld-transfer');

    // 입력된 이름 우선, 없으면 Firebase에서 불러오기
    let memberName = inputName;
    if (!memberName) {
      const memberSnap = await db.ref('members/' + phone).once('value');
      memberName = memberSnap.exists() ? (memberSnap.val().name || phone) : phone;
    }

    const key = catId + '_' + no;
    // 결제내역이 하나라도 입력됐으면 — 회원상세 계약이력에도 보이도록 별도 계약 레코드를 같이 만들고, 락카-계약 서로 연결고리(linkedContract/lockerKey)를 남겨 시작일/종료일 양방향 동기화가 되게 함
    const hasPayment = price > 0 || cash > 0 || card > 0 || transfer > 0;
    const signDate = _todayISO();
    const contractKey = hasPayment ? (signDate + '_' + Date.now()) : null;

    const lockerEntry = {
      phone, name: memberName, startDate: start, endDate: end,
      lockPassword: lock, status: 'active', categoryId: catId, lockerNo: no
    };
    if (contractKey) lockerEntry.linkedContract = { phone, contractKey };
    await db.ref('lockers/' + key).set(lockerEntry);
    // 회원 데이터에도 락카 번호 저장
    await db.ref('members/' + phone + '/lockerKey').set(key);
    lockerData[key] = lockerEntry;

    if (contractKey) {
      try {
        await db.ref('contracts/' + phone + '/' + contractKey).set({
          name: memberName, phone,
          programs: {}, packages: [],
          extras: {
            locker: {
              lockerNo: no, lockerCatId: catId, lockerKey: key,
              startDate: start || '', endDate: end || '',
              price, cash, card, transfer,
            }
          },
          signDate,
          createdAt: Date.now(),
          registeredBy: localStorage.getItem('current_user') || 'admin',
          source: 'locker_tab',
        });
      } catch (e) {
        console.error('락카 결제내역 계약이력 저장 실패:', e);
      }
    }

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

  // 회원상세화면 프로필 사진 변경용 (계약서탭의 ctWebcamStream/ctPhotoBlob과 완전히 별도, 절대 혼용하지 말 것)
  let mdWebcamStream = null;
  let mdPhotoBlob    = null;

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
  let ctPackages = []; // [{id, items:{prog:{months,count,price,...}}, name, totalPrice, ...}]

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
      clearCtSign();
      window._ctSubmitting = false;
      const now = new Date();
      document.getElementById('ct-sign-date').textContent =
        now.getFullYear() + '년 ' + (now.getMonth()+1) + '월 ' + now.getDate() + '일';
      renderCtSignSummary();
    }
  }

  function ctNext(step) {
    if (step === 1) {
      window._ctReturnPhone = null; // 1단계를 정상적으로 거쳐가는 일반 흐름이므로 복귀플래그 해제
      const name  = document.getElementById('ct-name').value.trim();
      const phone = document.getElementById('ct-phone').value.trim().replace(/-/g,'');
      const birth = document.getElementById('ct-birth').value.trim();
      if (!name)  { showToast('성명을 입력해주세요.', 'error'); return; }
      if (!phone || phone.length < 10) { showToast('연락처를 정확히 입력해주세요.', 'error'); return; }
      if (!birth || birth.length !== 8) { showToast('생년월일을 8자리로 입력해주세요.', 'error'); return; }
      // 연락처 중복 검사 (이 화면은 신규 등록 전용 — 재등록은 회원상세 > 새 계약서 추가로)
      db.ref('members/' + phone).once('value').then(snap => {
        if (snap.exists()) {
          showToast('이미 등록된 연락처예요. 회원 탭에서 회원상세 > 새 계약서 추가로 진행해주세요.', 'error');
          return;
        }
        ctGoStep(2);
      }).catch(() => ctGoStep(2));
      return; // Firebase 조회 비동기라 여기서 return
    }
    if (step === 2) {
      const hasExtra = document.getElementById('ct-cloth-check')?.checked || document.getElementById('ct-locker-check')?.checked;
      if (ctSelectedProgs.length === 0 && ctPackages.length === 0 && !hasExtra) {
        showToast('프로그램, 패키지, 또는 부가서비스를 1개 이상 선택해주세요.', 'error'); return;
      }
    }
    ctGoStep(step + 1);
    if (step === 2) loadCtTerms();
  }

  // 완료화면에서 "회원상세로 돌아가기" 클릭 시
  function _returnToMemberDetailFromContract() {
    const returnPhone = window._ctReturnPhone;
    window._ctReturnPhone = null;
    if (!returnPhone) { resetContract(); return; }
    try { switchAdminTab('tab-members'); } catch(e) { console.error('switchAdminTab 오류(무시):', e); }
    try { openMemberModal(returnPhone); } catch(e) { console.error('openMemberModal 오류(무시):', e); }
  }
  window._returnToMemberDetailFromContract = _returnToMemberDetailFromContract;

  function ctPrev(step) {
    if (step === 2 && window._ctReturnPhone) {
      const returnPhone = window._ctReturnPhone;
      window._ctReturnPhone = null;
      try { switchAdminTab('tab-members'); } catch(e) { console.error('switchAdminTab 오류(무시):', e); }
      try { openMemberModal(returnPhone); } catch(e) { console.error('openMemberModal 오류(무시):', e); }
      return;
    }
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
  // ── 패키지 관련 함수 ──
  const CT_PROG_LABELS = {
    '헬스':'🏋️ 헬스', 'GX':'🎶 GX', 'PT':'💪 PT',
    '기구필라테스개인':'🧘 기구필라테스 개인', '기구필라테스그룹':'👥 기구필라테스 그룹'
  };
  const CT_PROG_LIST = ['헬스','GX','PT','기구필라테스개인','기구필라테스그룹'];

  let ctPkgIdCounter = 0;

  function addCtPackage() {
    const id = ++ctPkgIdCounter;
    ctPackages.push({ id, items: {}, name: '' });
    renderCtPackages();
    calcCtTotal();
  }
  window.addCtPackage = addCtPackage;

  function removeCtPackage(id) {
    ctPackages = ctPackages.filter(p => p.id !== id);
    renderCtPackages();
    calcCtTotal();
  }
  window.removeCtPackage = removeCtPackage;

  function toggleCtPackageProg(pkgId, prog) {
    const pkg = ctPackages.find(p => p.id === pkgId);
    if (!pkg) return;
    if (pkg.items[prog]) {
      delete pkg.items[prog];
    } else {
      const today = new Date().toISOString().slice(0,10);
      pkg.items[prog] = { months:0, count:0, price:0, cash:0, card:0, transfer:0, startDate:today, endDate:'' };
    }
    updateCtPackageName(pkg);
    renderCtPackages();
    calcCtTotal();
  }
  window.toggleCtPackageProg = toggleCtPackageProg;

  function updateCtPackageName(pkg) {
    const names = Object.keys(pkg.items).map(p => {
      const short = { '헬스':'헬스','GX':'GX','PT':'PT','기구필라테스개인':'기구P개인','기구필라테스그룹':'기구P그룹' };
      return short[p] || p;
    });
    pkg.name = names.length > 0 ? names.join('+') + ' 패키지' : '';
  }

  function updateCtPkgField(pkgId, prog, field, value) {
    const pkg = ctPackages.find(p => p.id === pkgId);
    if (!pkg || !pkg.items[prog]) return;
    // type=text+콤마포맷으로 변경됐으므로 콤마 제거 후 숫자 변환
    pkg.items[prog][field] = field === 'startDate' || field === 'endDate' ? value : (parseInt(String(value).replace(/[^0-9]/g,''))||0);

    // 종료일 자동계산
    if (field === 'months' || field === 'startDate') {
      const start  = pkg.items[prog].startDate;
      const months = pkg.items[prog].months;
      if (start && months) {
        const d = new Date(start);
        d.setMonth(d.getMonth() + months);
        d.setDate(d.getDate()-1);
        pkg.items[prog].endDate = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
        const endEl = document.getElementById('ct-pkg-'+pkgId+'-'+prog+'-end-display');
        if (endEl) {
          endEl.textContent = pkg.items[prog].endDate;
          endEl.style.color = '#059669';
        }
      }
    }

    // 패키지 내 프로그램 상단 배지 업데이트
    updateCtPkgProgBadge(pkgId, prog);

    // 패키지 합계 표시 업데이트
    const pkgTotal = Object.values(pkg.items).reduce((s,it)=>s+(it.price||0),0);
    const pkgPaid  = Object.values(pkg.items).reduce((s,it)=>s+(it.cash||0)+(it.card||0)+(it.transfer||0),0);
    const pkgSumEl = document.getElementById('ct-pkg-'+pkgId+'-total');
    if (pkgSumEl && pkgTotal > 0) {
      pkgSumEl.textContent = pkgTotal.toLocaleString()+'원 (결제 '+pkgPaid.toLocaleString()+'원)';
    }

    calcCtTotal();
  }
  window.updateCtPkgField = updateCtPkgField;

  // 패키지 내 프로그램 상단 배지 업데이트
  function updateCtPkgProgBadge(pkgId, prog) {
    const pkg = ctPackages.find(p => p.id === pkgId);
    if (!pkg || !pkg.items[prog]) return;
    const it      = pkg.items[prog];
    const badgeEl = document.getElementById('ct-pkg-'+pkgId+'-'+prog+'-badge');
    if (!badgeEl) return;
    const parts = [];
    if (it.months) parts.push(it.months+'개월');
    if (it.count)  parts.push(it.count+'회');
    if (it.price)  parts.push(it.price.toLocaleString()+'원');
    badgeEl.textContent = parts.join(' · ') || '';
    badgeEl.style.display = parts.length ? '' : 'none';
  }
  window.updateCtPkgProgBadge = updateCtPkgProgBadge;

  function renderCtPackages() {
    const list  = document.getElementById('ct-package-list');
    const empty = document.getElementById('ct-package-empty');
    if (!list) return;
    if (empty) empty.style.display = ctPackages.length === 0 ? '' : 'none';

    // 렌더링 전 현재 DOM 입력값을 pkg.items에 저장 (값 보존)
    ctPackages.forEach(pkg => {
      Object.keys(pkg.items).forEach(prog => {
        const fields = ['months','count','price','cash','card','transfer'];
        fields.forEach(f => {
          const el = document.getElementById('ct-pkg-'+pkg.id+'-'+prog+'-'+f);
          if (el) pkg.items[prog][f] = parseInt((el.value || '0').replace(/[^0-9]/g,''))||0;
        });
        const startEl = document.getElementById('ct-pkg-'+pkg.id+'-'+prog+'-start');
        if (startEl && startEl.value) pkg.items[prog].startDate = startEl.value;
      });
    });

    list.innerHTML = ctPackages.map(pkg => {
      const today = new Date().toISOString().slice(0,10);
      const progButtons = CT_PROG_LIST.map(prog => {
        const sel = !!pkg.items[prog];
        const it  = pkg.items[prog];
        const badgeParts = sel ? [
          it.months ? it.months+'개월' : '',
          it.count  ? it.count+'회'   : '',
          it.price  ? it.price.toLocaleString()+'원' : '',
        ].filter(Boolean) : [];
        return `<button type="button" onclick="toggleCtPackageProg(${pkg.id},'${prog}')"
          style="padding:6px 10px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;font-family:'Noto Sans KR',sans-serif;
          background:${sel?'#185FA5':'var(--card)'};color:${sel?'white':'var(--text-sub)'};border:${sel?'none':'1px solid var(--border)'};display:inline-flex;align-items:center;gap:4px;">
          ${CT_PROG_LABELS[prog]}
          ${badgeParts.length ? `<span id="ct-pkg-${pkg.id}-${prog}-badge" style="font-size:10px;opacity:0.85;">${badgeParts.join(' · ')}</span>` : `<span id="ct-pkg-${pkg.id}-${prog}-badge" style="font-size:10px;opacity:0.85;display:none;"></span>`}
        </button>`;
      }).join('');

      const progInputs = Object.keys(pkg.items).map(prog => {
        const it = pkg.items[prog];
        const hasCount = prog === 'PT' || prog === '기구필라테스개인' || prog === '기구필라테스그룹';
        const startVal = it.startDate || today;
        return `
          <div style="background:var(--card);border:0.5px solid var(--border);border-radius:var(--radius-sm);padding:10px;margin-top:8px;">
            <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px;">${CT_PROG_LABELS[prog]}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
              <div>
                <div style="font-size:10px;color:var(--text-sub);margin-bottom:3px;">시작일</div>
                <input type="date" id="ct-pkg-${pkg.id}-${prog}-start" value="${startVal}"
                  style="width:100%;box-sizing:border-box;padding:6px 7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:'Noto Sans KR',sans-serif;"
                  oninput="updateCtPkgField(${pkg.id},'${prog}','startDate',this.value)"
                  onchange="updateCtPkgField(${pkg.id},'${prog}','startDate',this.value)" />
              </div>
              <div>
                <div style="font-size:10px;color:var(--text-sub);margin-bottom:3px;">종료일 (자동)</div>
                <div id="ct-pkg-${pkg.id}-${prog}-end-display" style="padding:6px 7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;color:${it.endDate?'#059669':'var(--text-hint)'};background:var(--bg);">${it.endDate||'자동계산'}</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:${hasCount?'1fr 1fr 1fr':'1fr 1fr'};gap:6px;margin-bottom:6px;">
              <div>
                <div style="font-size:10px;color:var(--text-sub);margin-bottom:3px;">기간(개월)</div>
                <input type="number" id="ct-pkg-${pkg.id}-${prog}-months" min="1" max="36" placeholder="개월" value="${it.months||''}"
                  style="width:100%;box-sizing:border-box;padding:6px 7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:'Noto Sans KR',sans-serif;"
                  onwheel="this.blur()" oninput="updateCtPkgField(${pkg.id},'${prog}','months',this.value)" />
              </div>
              ${hasCount ? `<div>
                <div style="font-size:10px;color:var(--text-sub);margin-bottom:3px;">횟수</div>
                <input type="number" id="ct-pkg-${pkg.id}-${prog}-count" min="1" placeholder="회" value="${it.count||''}"
                  style="width:100%;box-sizing:border-box;padding:6px 7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:'Noto Sans KR',sans-serif;"
                  onwheel="this.blur()" oninput="updateCtPkgField(${pkg.id},'${prog}','count',this.value)" />
              </div>` : ''}
              <div>
                <div style="font-size:10px;color:var(--text-sub);margin-bottom:3px;">이용요금</div>
                <input type="text" inputmode="numeric" id="ct-pkg-${pkg.id}-${prog}-price" placeholder="0" value="${it.price ? it.price.toLocaleString() : ''}"
                  style="width:100%;box-sizing:border-box;padding:6px 7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:'Noto Sans KR',sans-serif;"
                  oninput="_formatMoneyInput(this);updateCtPkgField(${pkg.id},'${prog}','price',this.value)" />
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
              <div>
                <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">
                  <div style="font-size:10px;color:var(--text-sub);">현금</div>
                  <button type="button" onclick="ctSetFullPayPkg(${pkg.id},'${prog}','cash')"
                    style="padding:1px 6px;background:#e3f0fb;color:#185FA5;border:0.5px solid #185FA5;border-radius:10px;font-size:9px;font-weight:500;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">전액</button>
                </div>
                <input type="text" inputmode="numeric" id="ct-pkg-${pkg.id}-${prog}-cash" placeholder="0" value="${it.cash ? it.cash.toLocaleString() : ''}"
                  style="width:100%;box-sizing:border-box;padding:6px 7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:'Noto Sans KR',sans-serif;"
                  oninput="_formatMoneyInput(this);updateCtPkgField(${pkg.id},'${prog}','cash',this.value)" />
              </div>
              <div>
                <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">
                  <div style="font-size:10px;color:var(--text-sub);">카드</div>
                  <button type="button" onclick="ctSetFullPayPkg(${pkg.id},'${prog}','card')"
                    style="padding:1px 6px;background:#e3f0fb;color:#185FA5;border:0.5px solid #185FA5;border-radius:10px;font-size:9px;font-weight:500;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">전액</button>
                </div>
                <input type="text" inputmode="numeric" id="ct-pkg-${pkg.id}-${prog}-card" placeholder="0" value="${it.card ? it.card.toLocaleString() : ''}"
                  style="width:100%;box-sizing:border-box;padding:6px 7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:'Noto Sans KR',sans-serif;"
                  oninput="_formatMoneyInput(this);updateCtPkgField(${pkg.id},'${prog}','card',this.value)" />
              </div>
              <div>
                <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">
                  <div style="font-size:10px;color:var(--text-sub);">계좌이체</div>
                  <button type="button" onclick="ctSetFullPayPkg(${pkg.id},'${prog}','transfer')"
                    style="padding:1px 6px;background:#e3f0fb;color:#185FA5;border:0.5px solid #185FA5;border-radius:10px;font-size:9px;font-weight:500;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">전액</button>
                </div>
                <input type="text" inputmode="numeric" id="ct-pkg-${pkg.id}-${prog}-transfer" placeholder="0" value="${it.transfer ? it.transfer.toLocaleString() : ''}"
                  style="width:100%;box-sizing:border-box;padding:6px 7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;font-family:'Noto Sans KR',sans-serif;"
                  oninput="_formatMoneyInput(this);updateCtPkgField(${pkg.id},'${prog}','transfer',this.value)" />
              </div>
            </div>
          </div>`;
      }).join('');

      const pkgTotal = Object.values(pkg.items).reduce((s,it) => s+(it.price||0), 0);
      const pkgPaid  = Object.values(pkg.items).reduce((s,it) => s+(it.cash||0)+(it.card||0)+(it.transfer||0), 0);

      return `
        <div style="border-top:0.5px solid var(--border);padding:12px 14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:13px;font-weight:700;color:#185FA5;">📦 ${pkg.name || '패키지 구성 중...'}</span>
            <button onclick="removeCtPackage(${pkg.id})" style="font-size:11px;color:#ef4444;border:1px solid #fca5a5;background:#fef2f2;border-radius:20px;padding:3px 10px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">삭제</button>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">${progButtons}</div>
          ${progInputs}
          <div style="margin-top:8px;padding:8px 10px;background:#f0f7ff;border-radius:var(--radius-sm);display:flex;justify-content:space-between;font-size:12px;${pkgTotal > 0 ? '' : 'display:none;'}">
            <span style="color:var(--text-sub);">패키지 합계</span>
            <span id="ct-pkg-${pkg.id}-total" style="color:#185FA5;font-weight:700;">${pkgTotal > 0 ? pkgTotal.toLocaleString()+'원 (결제 '+pkgPaid.toLocaleString()+'원)' : ''}</span>
          </div>
        </div>`;
    }).join('');
  }
  window.renderCtPackages = renderCtPackages;

  function calcCtPackageTotals() {
    let total=0, cash=0, card=0, transfer=0;
    ctPackages.forEach(pkg => {
      Object.values(pkg.items).forEach(it => {
        total    += (it.price||0);
        cash     += (it.cash||0);
        card     += (it.card||0);
        transfer += (it.transfer||0);
      });
    });
    return { total, cash, card, transfer };
  }

  // ── 전액 버튼 — 부가서비스 (운동복/락카) ──
  function ctSetFullPayExtra(type, method) {
    const priceEl = document.getElementById('ct-' + type + '-price');
    if (!priceEl) return;
    const price = parseInt(priceEl.value.replace(/[^0-9]/g,'')) || 0;
    ['cash','card','transfer'].forEach(f => {
      const el = document.getElementById('ct-' + type + '-' + f);
      if (el) el.value = (f === method ? price : 0).toLocaleString();
    });
    calcCtTotal();
  }
  window.ctSetFullPayExtra = ctSetFullPayExtra;

  // ── 전액 버튼 — 단독 프로그램 ──
  function ctSetFullPay(prog, method) {
    const priceEl = document.getElementById('ct-' + prog + '-price');
    const targetEl = document.getElementById('ct-' + prog + '-' + method);
    if (!priceEl || !targetEl) return;
    const price = parseInt(priceEl.value.replace(/[^0-9]/g,'')) || 0;
    ['cash','card','transfer'].forEach(f => {
      const el = document.getElementById('ct-' + prog + '-' + f);
      if (el) el.value = (f === method ? price : 0).toLocaleString();
    });
    calcCtTotal();
  }
  window.ctSetFullPay = ctSetFullPay;

  // ── 전액 버튼 — 패키지 프로그램 ──
  function ctSetFullPayPkg(pkgId, prog, method) {
    const priceEl = document.getElementById('ct-pkg-' + pkgId + '-' + prog + '-price');
    if (!priceEl) return;
    const price = parseInt(priceEl.value.replace(/[^0-9]/g,'')) || 0;
    ['cash','card','transfer'].forEach(f => {
      const el = document.getElementById('ct-pkg-' + pkgId + '-' + prog + '-' + f);
      if (el) el.value = (f === method ? price : 0).toLocaleString();
      updateCtPkgField(pkgId, prog, f, f === method ? price : 0);
    });
  }
  window.ctSetFullPayPkg = ctSetFullPayPkg;

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
    const cols = hasCount ? '2fr 0.8fr 0.8fr 1.4fr' : '2fr 0.8fr 1.4fr';
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
            <input type="text" inputmode="numeric" id="ct-${prog}-price" placeholder="이용요금 입력"
              style="${inStyle}font-weight:700;" oninput="_formatMoneyInput(this);calcCtTotal();updateCtSummary('${prog}')" />
          </div>
        </div>
      </div>

      <!-- 💳 결제방법 -->
      <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;">
        <div style="font-size:12px;font-weight:700;color:var(--text-sub);margin-bottom:8px;">💳 결제방법 (혼합 가능)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
          <div>
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">
              <div style="font-size:11px;color:var(--text-sub);">현금</div>
              <button type="button" onclick="ctSetFullPay('${prog}','cash')"
                style="padding:1px 7px;background:#e3f0fb;color:#185FA5;border:0.5px solid #185FA5;border-radius:10px;font-size:10px;font-weight:500;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">전액</button>
            </div>
            <input type="text" inputmode="numeric" id="ct-${prog}-cash" placeholder="0"
              style="${inStyle}" oninput="_formatMoneyInput(this);calcCtTotal()" />
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">
              <div style="font-size:11px;color:var(--text-sub);">카드</div>
              <button type="button" onclick="ctSetFullPay('${prog}','card')"
                style="padding:1px 7px;background:#e3f0fb;color:#185FA5;border:0.5px solid #185FA5;border-radius:10px;font-size:10px;font-weight:500;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">전액</button>
            </div>
            <input type="text" inputmode="numeric" id="ct-${prog}-card" placeholder="0"
              style="${inStyle}" oninput="_formatMoneyInput(this);calcCtTotal()" />
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">
              <div style="font-size:11px;color:var(--text-sub);">계좌이체</div>
              <button type="button" onclick="ctSetFullPay('${prog}','transfer')"
                style="padding:1px 7px;background:#e3f0fb;color:#185FA5;border:0.5px solid #185FA5;border-radius:10px;font-size:10px;font-weight:500;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">전액</button>
            </div>
            <input type="text" inputmode="numeric" id="ct-${prog}-transfer" placeholder="0"
              style="${inStyle}" oninput="_formatMoneyInput(this);calcCtTotal()" />
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
    const price   = parseInt((document.getElementById('ct-' + prog + '-price')?.value || '0').replace(/[^0-9]/g,'')) || 0;
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
    endEl.value = _isoDate(d); // ISO 형식(YYYY-MM-DD)으로 저장 — 한글 형식으로 저장하면 날짜 비교 오류 발생
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
      const num = id => parseInt((document.getElementById('ct-' + prog + '-' + id)?.value || '0').replace(/[^0-9]/g,'')) || 0;
      const price    = num('price');
      const cash     = num('cash');
      const card     = num('card');
      const transfer = num('transfer');
      const months   = parseInt(document.getElementById('ct-' + prog + '-months')?.value) || 0;
      totalContract += price;
      sumCash += cash; sumCard += card; sumTransfer += transfer;
      // 카드별 결제금액 표시
      const paidDisp = document.getElementById('ct-' + prog + '-paid-display');
      if (paidDisp) paidDisp.textContent = (cash + card + transfer).toLocaleString() + '원';
      const count = parseInt(document.getElementById('ct-' + prog + '-count')?.value) || 0;
      // 기간/횟수/금액 중 하나라도 있으면 breakdown에 표시 (0원짜리도 선택됐으면 보여줘야 함)
      if (months || count || price || cash || card || transfer) {
        breakdownItems.push({
          label: (progLabels[prog] || prog) + (months ? ' ' + months + '개월' : '') + (count ? ' · ' + count + '회' : '') + (price === 0 && months ? ' (무료)' : ''),
          price, cash, card, transfer
        });
      }
    });

    // 패키지
    const pkgTotals = calcCtPackageTotals();
    totalContract += pkgTotals.total;
    sumCash       += pkgTotals.cash;
    sumCard       += pkgTotals.card;
    sumTransfer   += pkgTotals.transfer;
    ctPackages.forEach(pkg => {
      const pkgTotal = Object.values(pkg.items).reduce((s,it)=>s+(it.price||0),0);
      const pkgCash  = Object.values(pkg.items).reduce((s,it)=>s+(it.cash||0),0);
      const pkgCard  = Object.values(pkg.items).reduce((s,it)=>s+(it.card||0),0);
      const pkgTr    = Object.values(pkg.items).reduce((s,it)=>s+(it.transfer||0),0);
      // 패키지 내 항목이 하나라도 기간 설정되어 있으면 0원이어도 breakdown에 표시
      const pkgHasItems = Object.values(pkg.items).some(it => it.months || it.count || it.price);
      if (pkgTotal > 0 || pkgCash > 0 || pkgCard > 0 || pkgTr > 0 || pkgHasItems) {
        const pkgProgLabels = {'pilatesP':'기구P개인','pilatesG':'기구P그룹','pt':'PT','gx':'GX','health':'헬스','기구필라테스개인':'기구P개인','기구필라테스그룹':'기구P그룹'};
        const pkgPeriodParts = Object.entries(pkg.items||{}).map(([p,it])=>{
          const lbl = pkgProgLabels[p]||p;
          return lbl + (it.months?' '+it.months+'개월':'') + (it.count?' '+it.count+'회':'');
        }).filter(Boolean);
        const pkgDetailStr = pkgPeriodParts.length ? ' (' + pkgPeriodParts.join(' / ') + ')' : '';
        // 프로그램별 소계 — 패키지 합계 아래 들여쓰기 행으로 표시
        const subItems = Object.entries(pkg.items||{})
          .filter(([,it]) => it.months || it.count || it.price || it.cash || it.card || it.transfer)
          .map(([p, it]) => {
            const lbl = pkgProgLabels[p] || p;
            return {
              label: lbl + (it.months ? ' ' + it.months + '개월' : '') + (it.count ? ' · ' + it.count + '회' : '') + (it.price === 0 && it.months ? ' (무료)' : ''),
              price: it.price || 0, cash: it.cash || 0, card: it.card || 0, transfer: it.transfer || 0,
            };
          });
        breakdownItems.push({
          label: '📦 ' + (pkg.name || '패키지') + pkgDetailStr,
          price: pkgTotal, cash: pkgCash, card: pkgCard, transfer: pkgTr,
          subItems,
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
      const numE = id => parseInt((document.getElementById('ct-' + key + '-' + id)?.value || '0').replace(/[^0-9]/g,'')) || 0;
      const price    = numE('price');
      const cash     = numE('cash');
      const card     = numE('card');
      const transfer = numE('transfer');
      const months   = parseInt(document.getElementById('ct-' + key + '-months')?.value) || 0;
      totalContract += price;
      sumCash += cash; sumCard += card; sumTransfer += transfer;
      // 결제금액 표시
      const paidDisp = document.getElementById('ct-' + key + '-paid-display');
      if (paidDisp) paidDisp.textContent = (cash + card + transfer).toLocaleString() + '원';
      // 체크됐으면 0원이어도 breakdown에 표시 (무료 표기)
      if (check.checked) {
        breakdownItems.push({
          label: label + (months ? ' ' + months + '개월' : '') + (price === 0 ? ' (무료)' : ''),
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
            <div style="display:grid;grid-template-columns:75px 65px 65px 65px 70px;gap:0;background:#f8fafc;padding:7px 10px;font-size:11px;color:var(--text-sub);font-weight:600;">
              <div style="text-align:right;">이용요금</div>
              <div style="text-align:right;">현금</div>
              <div style="text-align:right;">카드</div>
              <div style="text-align:right;">계좌</div>
              <div style="text-align:right;">미수금</div>
            </div>
            ${breakdownItems.map(item => {
              const itemUnpaid = item.price - (item.cash + item.card + item.transfer);
              const subRows = (item.subItems && item.subItems.length > 1) ? item.subItems.map(sub => `
              <div style="background:#f8fafc;">
                <div style="padding:3px 10px 2px 20px;font-size:11px;color:var(--text-sub);">ㄴ ${sub.label}</div>
                <div style="display:grid;grid-template-columns:75px 65px 65px 65px 70px;gap:0;padding:1px 10px 5px 20px;font-size:11px;">
                  <div style="text-align:right;color:var(--text-sub);">${sub.price ? sub.price.toLocaleString() : '-'}</div>
                  <div style="text-align:right;color:${sub.cash ? '#059669' : 'var(--text-hint)'};">${sub.cash ? sub.cash.toLocaleString() : '-'}</div>
                  <div style="text-align:right;color:${sub.card ? '#1a6fd4' : 'var(--text-hint)'};">${sub.card ? sub.card.toLocaleString() : '-'}</div>
                  <div style="text-align:right;color:${sub.transfer ? '#7c3aed' : 'var(--text-hint)'};">${sub.transfer ? sub.transfer.toLocaleString() : '-'}</div>
                  <div style="text-align:right;color:var(--text-hint);">-</div>
                </div>
              </div>`).join('') : '';
              return `
              <div style="border-top:1px solid #f1f5f9;">
                <div style="padding:6px 10px 2px;font-size:12px;font-weight:700;color:var(--text);">${item.label}</div>
                <div style="display:grid;grid-template-columns:75px 65px 65px 65px 70px;gap:0;padding:3px 10px 7px;font-size:12px;">
                  <div style="text-align:right;color:var(--text);">${item.price ? item.price.toLocaleString() : '-'}</div>
                  <div style="text-align:right;color:${item.cash ? '#059669' : 'var(--text-hint)'};">${item.cash ? item.cash.toLocaleString() : '-'}</div>
                  <div style="text-align:right;color:${item.card ? '#1a6fd4' : 'var(--text-hint)'};">${item.card ? item.card.toLocaleString() : '-'}</div>
                  <div style="text-align:right;color:${item.transfer ? '#7c3aed' : 'var(--text-hint)'};">${item.transfer ? item.transfer.toLocaleString() : '-'}</div>
                  <div style="text-align:right;font-weight:700;color:${itemUnpaid > 0 ? '#ef4444' : 'var(--text-hint)'};">${itemUnpaid > 0 ? itemUnpaid.toLocaleString() : '-'}</div>
                </div>
                ${subRows}
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
    // 체크 시 시작일 오늘 날짜 자동 세팅
    if (check.checked) {
      const startEl = document.getElementById('ct-' + type + '-start');
      if (startEl && !startEl.value) {
        const today = new Date();
        startEl.value = today.getFullYear() + '-' +
          String(today.getMonth()+1).padStart(2,'0') + '-' +
          String(today.getDate()).padStart(2,'0');
      }
    }
    // 락카 체크 시 카테고리 로드
    if (type === 'locker' && check.checked) loadCtLockerCategories();
    updateCtExtraSummary(type);
    calcCtTotal();
  }

  // 계약서용 락카 카테고리 로드
  async function loadCtLockerCategories() {
    const select = document.getElementById('ct-locker-cat');
    if (!select) return;
    try {
      const snap = await db.ref('locker_settings/categories').once('value');
      select.innerHTML = '<option value="">-- 카테고리 선택 --</option>';
      if (snap.exists()) {
        snap.forEach(child => {
          const cat = child.val();
          const opt = document.createElement('option');
          opt.value = child.key;
          opt.textContent = cat.name || child.key;
          opt.dataset.startNo = cat.startNo || 1;
          opt.dataset.endNo   = cat.endNo   || 10;
          opt.dataset.color   = cat.color   || '#1a6fd4';
          select.appendChild(opt);
        });
      }
    } catch(e) { console.warn('락카 카테고리 로드 실패:', e); }
  }

  // 계약서용 락카 그리드 렌더링
  async function loadCtLockerGrid() {
    const select  = document.getElementById('ct-locker-cat');
    const gridWrap= document.getElementById('ct-locker-grid');
    const gridEl  = document.getElementById('ct-locker-grid-items');
    if (!select || !gridWrap || !gridEl) return;

    const catId = select.value;
    if (!catId) { gridWrap.style.display = 'none'; return; }

    const opt     = select.options[select.selectedIndex];
    const startNo = parseInt(opt.dataset.startNo) || 1;
    const endNo   = parseInt(opt.dataset.endNo)   || 10;

    gridWrap.style.display = '';
    gridEl.innerHTML = '<span style="font-size:12px;color:var(--text-hint);">불러오는 중...</span>';

    try {
      const snap = await db.ref('lockers').once('value');
      const lockerSnap = snap.val() || {};

      const today = new Date().toISOString().slice(0,10);
      const items = [];
      for (let no = startNo; no <= endNo; no++) {
        const key = catId + '_' + no;
        const d   = lockerSnap[key];
        let bg = '#e8f5e9', border = '#81c784', label = '빈칸', disabled = false, emoji = '🟢';
        if (d) {
          if (d.status === 'disabled') {
            bg='#f5f5f5'; border='#9e9e9e'; label='불가'; disabled=true; emoji='⚫';
          } else if (d.endDate && d.endDate < today) {
            bg='#ffebee'; border='#e57373'; label='만료'; disabled=false; emoji='🔴';
          } else {
            bg='#e3f2fd'; border='#64b5f6';
            const rawName = (d.name||'').replace(/\(\d{4}\)$/,'').trim();
            label = rawName.length > 3 ? rawName.slice(0,3) : rawName;
            disabled=true; emoji='🔵';
          }
        }
        items.push({ no, key, bg, border, label, disabled, emoji });
      }

      gridEl.innerHTML = items.map(item => `
        <div onclick="${item.disabled ? '' : `selectCtLockerNo('${catId}','${item.no}')`}"
          id="ct-locker-cell-${item.no}"
          style="width:40px;height:40px;border-radius:6px;background:${item.bg};border:1.5px solid ${item.border};
          display:flex;align-items:center;justify-content:center;
          cursor:${item.disabled ? 'not-allowed' : 'pointer'};box-sizing:border-box;opacity:${item.disabled ? '0.5' : '1'};">
          <span style="font-size:12px;font-weight:700;color:var(--text);">${item.no}</span>
        </div>`).join('');
    } catch(e) {
      gridEl.innerHTML = '<span style="font-size:12px;color:#ef4444;">로드 실패</span>';
      console.warn('락카 그리드 로드 실패:', e);
    }
  }

  // 계약서에서 락카 번호 선택
  // ── 부가서비스 종료일 자동계산 ──
  function calcCtExtraEndDate(type) {
    const startEl   = document.getElementById('ct-' + type + '-start');
    const monthsEl  = document.getElementById('ct-' + type + '-months');
    const displayEl = document.getElementById('ct-' + type + '-end-display');
    if (!startEl || !monthsEl || !displayEl) return;
    const startVal  = startEl.value;
    const months    = parseInt(monthsEl.value) || 0;
    if (!startVal || !months) { displayEl.textContent = '자동계산'; displayEl.style.color = 'var(--text-hint)'; return; }
    const d = new Date(startVal);
    d.setMonth(d.getMonth() + months);
    d.setDate(d.getDate() - 1);
    const endStr = d.getFullYear() + '년 ' + (d.getMonth()+1) + '월 ' + d.getDate() + '일';
    displayEl.textContent = endStr;
    displayEl.style.color = '#059669';
  }
  window.calcCtExtraEndDate = calcCtExtraEndDate;

  function selectCtLockerNo(catId, no) {
    const noInput   = document.getElementById('ct-locker-no');
    const catInput  = document.getElementById('ct-locker-cat-id');
    const display   = document.getElementById('ct-locker-no-display');
    const displayWrap = document.getElementById('ct-locker-no-display-wrap');
    const gridWrap  = document.getElementById('ct-locker-grid');
    const catSel    = document.getElementById('ct-locker-cat');
    const catName   = catSel?.options[catSel?.selectedIndex]?.textContent || '';

    if (noInput)  noInput.value  = no;
    if (catInput) catInput.value = catId;

    // 선택 표시 (그리드 밖에 표시)
    if (display) {
      display.innerHTML = `
        ✅ ${catName} ${no}번 선택됨
        <button type="button" onclick="showCtLockerGrid()"
          style="margin-left:8px;padding:3px 10px;font-size:11px;border:1px solid var(--border);background:var(--card);border-radius:20px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;color:var(--text);">
          목록 다시보기
        </button>`;
    }
    if (displayWrap) displayWrap.style.display = '';
    // 그리드 숨기기
    if (gridWrap) gridWrap.style.display = 'none';
  }

  // 락카 그리드 다시 표시 (목록 다시보기 버튼 클릭 시) - 선택 유지
  function showCtLockerGrid() {
    const gridWrap = document.getElementById('ct-locker-grid');
    if (gridWrap) gridWrap.style.display = '';
  }
  window.showCtLockerGrid = showCtLockerGrid;

  // 부가서비스 카드 상단 요약 업데이트
  function updateCtExtraSummary(type) {
    const check   = document.getElementById('ct-' + type + '-check');
    const summary = document.getElementById('ct-' + type + '-summary');
    if (!check || !summary) return;
    if (!check.checked) { summary.textContent = '미선택'; summary.style.color = 'var(--text-sub)'; return; }
    const months = parseInt(document.getElementById('ct-' + type + '-months')?.value) || 0;
    const price  = parseInt((document.getElementById('ct-' + type + '-price')?.value || '0').replace(/[^0-9]/g,'')) || 0;
    let text = '';
    if (months) text += months + '개월';
    if (price === 0) text += (text ? '·' : '') + '무료';
    else if (price)  text += (text ? '·' : '') + price.toLocaleString() + '원';
    summary.textContent = text || '선택됨';
    summary.style.color = '#1a6fd4';
  }

  // ── 설정탭 서브탭 전환 ──
  function switchSettingsSubtab(tab) {
    const tabs = ['pw', 'equipment', 'terms', 'bulk'];
    tabs.forEach(t => {
      const btn  = document.getElementById('settings-subtab-' + t);
      const view = document.getElementById('settings-view-' + t);
      const isActive = t === tab;
      if (btn) {
        btn.style.background = isActive ? 'var(--blue)' : 'var(--card)';
        btn.style.color      = isActive ? 'white'       : 'var(--text)';
        btn.style.border     = isActive ? 'none'        : '1.5px solid var(--border)';
      }
      if (view) view.style.display = isActive ? '' : 'none';
    });
    if (tab === 'equipment') loadAdminEquipmentList();
    if (tab === 'terms')     loadTerms();
  }
  window.switchSettingsSubtab = switchSettingsSubtab;

  // ── 전체 회원 기간 일괄연장 ──
  // 날짜문자열(0패딩 여부 무관)에 일수를 더해서 ISO(YYYY-MM-DD)로 반환
  function _addDaysToDate(dateStr, days) {
    const parts = String(dateStr).split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() + days);
    return _isoDate(d);
  }

  // 전체 계약을 훑어서 연장 대상 항목들의 업데이트 객체 + 개수를 계산 (includeLocker=true면 락카도 같이 포함)
  function _computeBulkExtend(days, includeLocker) {
    return Promise.all([
      db.ref('contracts').once('value'),
      db.ref('members').once('value')
    ]).then(([snap, membersSnap]) => {
      const updates = {};
      const details = [];
      let itemCount = 0;
      let lockerCount = 0;
      const affectedMembers = new Set();
      const today = _todayISO();
      const allMembers = membersSnap.val() || {};
      snap.forEach(phoneSnap => {
        const phone = phoneSnap.key;
        const memberName = (allMembers[phone] && allMembers[phone].name) || phone;
        phoneSnap.forEach(contractSnap => {
          const contractKey = contractSnap.key;
          const c = contractSnap.val();
          _flattenContractItems(c).forEach(it => {
            if (!_isItemEligible(it.data)) return; // 환불/양도/변경으로 이미 나간 항목 제외
            if (!it.data.endDate) return;
            const onHold = _isActivelyOnHold(it.data);
            if (!onHold && it.data.endDate < today) return; // 이미 만료된 회원권 제외 (휴회중은 예외적으로 포함)
            const basePath = it.pkgIndex === null
              ? 'contracts/' + phone + '/' + contractKey + '/programs/' + it.progKey
              : 'contracts/' + phone + '/' + contractKey + '/packages/' + it.pkgIndex + '/items/' + it.progKey;
            const newEnd = _addDaysToDate(it.data.endDate, days);
            if (!newEnd) return;
            updates[basePath + '/endDate'] = newEnd;
            const detailEntry = { phone, name: memberName, type: 'program', label: REFUND_PROG_NAMES[it.progKey] || it.progKey, path: basePath, oldEnd: it.data.endDate, newEnd };
            if (onHold) {
              const newHoldEnd = _addDaysToDate(it.data.activeHold.newEndDate, days);
              if (newHoldEnd) {
                updates[basePath + '/activeHold/newEndDate'] = newHoldEnd;
                detailEntry.holdPath = basePath + '/activeHold/newEndDate';
                detailEntry.oldHoldEnd = it.data.activeHold.newEndDate;
              }
            }
            details.push(detailEntry);
            itemCount++;
            affectedMembers.add(phone);
          });
          // 락카(부가서비스) — 체크했을 때만, 유효기간 안 지난 것만 포함. lockers/ 쪽도 같이 업데이트해서 서로 안 어긋나게 동기화
          if (includeLocker) {
            Object.entries(c.extras || {}).forEach(([extKey, e]) => {
              if (e.deleted) return;
              if (!e.endDate || e.endDate < today) return;
              const basePath = 'contracts/' + phone + '/' + contractKey + '/extras/' + extKey;
              const newEnd = _addDaysToDate(e.endDate, days);
              if (!newEnd) return;
              updates[basePath + '/endDate'] = newEnd;
              const detailEntry = { phone, name: memberName, type: 'locker', label: '락카', path: basePath, oldEnd: e.endDate, newEnd };
              if (e.lockerKey) {
                updates['lockers/' + e.lockerKey + '/endDate'] = newEnd;
                detailEntry.lockerPath = 'lockers/' + e.lockerKey + '/endDate';
              }
              details.push(detailEntry);
              lockerCount++;
              affectedMembers.add(phone);
            });
          }
        });
      });
      return { updates, memberCount: affectedMembers.size, itemCount, lockerCount, details };
    });
  }

  function openBulkExtendFlow() {
    document.getElementById('app-bulk-extend-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-bulk-extend-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;';
    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:24px;width:100%;max-width:300px;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:14px;color:var(--text,#1a1a1a);margin-bottom:14px;line-height:1.6;">전체 회원의 회원권 종료일을<br>며칠 연장할까요?<br><span style="font-size:11.5px;color:#888;">(이용중·휴회중인 것만 대상, 환불·양도·변경된 항목은 제외)</span></div>
      <input id="bulk-extend-days" type="number" placeholder="예: 3"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;font-family:'Noto Sans KR',sans-serif;margin-bottom:14px;outline:none;">
      <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--text,#1a1a1a);margin-bottom:20px;cursor:pointer;">
        <input type="checkbox" id="bulk-extend-locker" checked style="width:16px;height:16px;">
        락카 대여기간도 함께 연장
      </label>
      <div style="display:flex;gap:10px;">
        <button id="bulk-extend-cancel" style="flex:1;padding:12px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;font-weight:700;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">취소</button>
        <button id="bulk-extend-ok" style="flex:1;padding:12px;background:#7F77DD;border:none;border-radius:10px;font-size:14px;font-weight:700;color:white;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">확인</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    document.getElementById('bulk-extend-cancel').onclick = () => modal.remove();
    document.getElementById('bulk-extend-ok').onclick = () => {
      const days = parseInt(document.getElementById('bulk-extend-days').value);
      const includeLocker = document.getElementById('bulk-extend-locker').checked;
      modal.remove();
      if (!days || days <= 0) { showToast('1 이상의 숫자를 입력해주세요.', 'error'); return; }
      showToast('대상 확인 중...', 'info');
      _computeBulkExtend(days, includeLocker).then(({ updates, memberCount, itemCount, lockerCount, details }) => {
        if (itemCount === 0 && lockerCount === 0) { showToast('연장 대상이 없어요.', 'error'); return; }
        let msg = '총 ' + memberCount + '명 회원의\n회원권 ' + itemCount + '건';
        if (includeLocker) msg += ' + 락카 ' + lockerCount + '건';
        msg += '을 ' + days + '일씩 연장할까요?\n\n이 작업은 되돌리기 어려우니 신중하게 확인해주세요.';
        showConfirm(msg, () => {
          const logKey = _todayISO() + '_' + Date.now();
          // undefined 값이 섞여 있으면 Firebase가 저장을 거부하므로 JSON 왕복 변환으로 안전하게 정리
          const safeLog = JSON.parse(JSON.stringify({
            executedAt: Date.now(),
            date: _todayISO(),
            days, includeLocker, memberCount, itemCount, lockerCount, details
          }));
          // 회원권/락카 연장 + 이력 저장을 하나의 업데이트로 묶어서 실행 — 이렇게 하면 "연장은 됐는데 이력만 빠짐" 같은 상황이
          // 구조적으로 생길 수 없음 (전부 성공하거나, 전부 실패하거나 둘 중 하나만 가능)
          const combinedUpdates = Object.assign({}, updates);
          combinedUpdates['bulk_extend_logs/' + logKey] = safeLog;
          db.ref().update(combinedUpdates).then(() => {
            showToast('✅ 연장 완료! (이력에도 정상 저장됐어요)', 'success');
          }).catch(e => {
            showToast('연장 실패: ' + e.message, 'error');
          });
        });
      }).catch(e => {
        showToast('확인 실패: ' + e.message, 'error');
      });
    };
  }
  window.openBulkExtendFlow = openBulkExtendFlow;

  // ── 일괄연장 이력 보기 ──
  function openBulkExtendHistory() {
    document.getElementById('app-bulk-history-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'app-bulk-history-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;';
    modal.innerHTML = `<div style="background:var(--bg,#fff);border-radius:16px;padding:24px;width:100%;max-width:420px;max-height:80vh;overflow-y:auto;font-family:'Noto Sans KR',sans-serif;">
      <div style="font-size:15px;font-weight:700;margin-bottom:14px;color:var(--text,#1a1a1a);">🗓️ 일괄연장 이력</div>
      <div id="bulk-history-list" style="font-size:13px;color:#888;">불러오는 중...</div>
      <button id="bulk-history-close" style="width:100%;margin-top:16px;padding:11px;background:none;border:1px solid #e0e0e0;border-radius:10px;font-size:13px;font-weight:700;color:#888;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">닫기</button>
    </div>`;
    document.body.appendChild(modal);
    document.getElementById('bulk-history-close').onclick = () => modal.remove();

    db.ref('bulk_extend_logs').once('value').then(snap => {
      const logs = [];
      snap.forEach(s => { logs.push({ key: s.key, ...s.val() }); });
      logs.sort((a, b) => (b.executedAt || 0) - (a.executedAt || 0));
      _renderBulkHistoryList(logs);
    }).catch(() => {
      const listEl = document.getElementById('bulk-history-list');
      if (listEl) listEl.innerHTML = '<div style="text-align:center;color:#ef4444;">불러오기 실패</div>';
    });
  }
  window.openBulkExtendHistory = openBulkExtendHistory;

  function _renderBulkHistoryList(logs) {
    const listEl = document.getElementById('bulk-history-list');
    if (!listEl) return;
    if (logs.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;color:#aaa;padding:12px 0;">아직 실행한 이력이 없어요</div>';
      return;
    }
    listEl.innerHTML = logs.map((log, idx) => {
      const dt = log.executedAt ? new Date(log.executedAt) : null;
      const timeLabel = dt ? (log.date + ' ' + String(dt.getHours()).padStart(2,'0') + ':' + String(dt.getMinutes()).padStart(2,'0')) : log.date;
      let summary = '회원권 ' + (log.itemCount||0) + '건';
      if (log.includeLocker) summary += ' + 락카 ' + (log.lockerCount||0) + '건';
      const detailId = 'bulk-history-detail-' + idx;
      const detailRows = (log.details || []).map(d =>
        `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f0f0f0;">
          <span>${d.name} (${d.phone}) · ${d.type === 'locker' ? '락카' : d.label}</span>
          <span style="color:#888;">${d.oldEnd} → ${d.newEnd}</span>
        </div>`
      ).join('');
      // 되돌리기 버튼은 "가장 최근 이력"이고 "아직 되돌리지 않은 경우"에만 표시
      const canUndo = idx === 0 && !log.reverted;
      const undoBtn = log.reverted
        ? `<div style="margin-top:8px;font-size:11.5px;color:#22c55e;font-weight:700;">✅ 되돌림 완료</div>`
        : (canUndo ? `<button onclick="event.stopPropagation();undoBulkExtend('${log.key}')" style="margin-top:8px;width:100%;padding:8px;background:none;border:1px solid #ef4444;color:#ef4444;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">↩️ 이 연장 되돌리기</button>` : '');
      return `<div style="background:var(--bg,#f7f7f7);border-radius:10px;padding:12px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="const d=document.getElementById('${detailId}');d.style.display=d.style.display==='none'?'block':'none';">
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text,#1a1a1a);">${timeLabel} · ${log.days}일 연장</div>
            <div style="font-size:12px;color:#888;margin-top:2px;">총 ${log.memberCount||0}명 · ${summary}</div>
          </div>
          <span style="font-size:11px;color:#888;">상세보기 ▾</span>
        </div>
        <div id="${detailId}" style="display:none;margin-top:10px;font-size:12px;color:var(--text,#1a1a1a);max-height:200px;overflow-y:auto;">${detailRows || '상세내역 없음'}</div>
        ${undoBtn}
      </div>`;
    }).join('');
  }

  // 가장 최근 일괄연장 이력을 되돌리기 — 저장해둔 이전 종료일(oldEnd/oldHoldEnd)로 복원
  function undoBulkExtend(logKey) {
    db.ref('bulk_extend_logs/' + logKey).once('value').then(snap => {
      const log = snap.val();
      if (!log) { showToast('이력을 찾을 수 없어요.', 'error'); return; }
      if (log.reverted) { showToast('이미 되돌린 이력이에요.', 'error'); return; }
      const details = log.details || [];
      if (details.length === 0) { showToast('되돌릴 상세내역이 없어요.', 'error'); return; }

      showConfirm(
        '이 일괄연장(총 ' + (log.memberCount||0) + '명, ' + (log.days||0) + '일)을 되돌릴까요?\n\n' +
        '⚠️ 그 사이에 개별 회원 정보를 따로 수정(환불/재계약 등)했다면, 그 부분은 되돌리기에 반영되지 않을 수 있어요.',
        () => {
          const reverseUpdates = {};
          details.forEach(d => {
            if (d.path) reverseUpdates[d.path + '/endDate'] = d.oldEnd;
            if (d.holdPath) reverseUpdates[d.holdPath] = d.oldHoldEnd;
            if (d.lockerPath) reverseUpdates[d.lockerPath] = d.oldEnd;
          });
          db.ref().update(reverseUpdates).then(() => {
            return db.ref('bulk_extend_logs/' + logKey + '/reverted').set(true);
          }).then(() => {
            showToast('✅ 되돌리기 완료!', 'success');
            db.ref('bulk_extend_logs').once('value').then(snap2 => {
              const logs = [];
              snap2.forEach(s => { logs.push({ key: s.key, ...s.val() }); });
              logs.sort((a, b) => (b.executedAt || 0) - (a.executedAt || 0));
              _renderBulkHistoryList(logs);
            });
          }).catch(e => {
            showToast('되돌리기 실패: ' + e.message, 'error');
          });
        }
      );
    });
  }
  window.undoBulkExtend = undoBulkExtend;

  // ── 약관 기본값 (하드코딩 폴백) ──
  const DEFAULT_TERMS = `풍산휘트니스 이용약관

제 1조 개요 및 동의
본 센터의 명칭은 풍산휘트니스라 합니다. 본 계약은 '센터'와 '회원'의 레슨계약을 위해 필요한 제반 사항을 제공함에 있어 계약 당사자인 '센터'와 '회원'의 역할과 의무에 관한 법률관계를 규정하여 상호 원활한 이용을 함에 목적이 있습니다. 신청인 본인은 당사가 제공하는 서비스를 제공받고자 본 신청서에 기재된 개인정보 수집 및 활용에 동의합니다.

제 2조 레슨규정
1. '센터'와 '회원'과 협의하여 정한 레슨시간을 준수해야 하며 부득이하게 취소, 시간변경을 원할 경우 최소 수강시간으로부터 1일전까지 센터(강사포함)에게 통보해 주어야 합니다.
2. 예약된 레슨시간에 연락을 주지 않고 불참하거나 당일 취소 시에는 레슨횟수가 자동으로 차감됩니다.
3. '회원'은 레슨수강 시 '강사'의 수업내용을 녹취 혹은 녹화를 할 수 없으며 이를 어겼을 경우 남은 수업 수의 환불처리 없이 자동 계약 해지될 수 있습니다.
4. 그룹 수업은 2인 이상 참여시 가능하고 당일 시간 변경은 강사와 합의 후 가능합니다.

제 3조 계약사항 및 계약기간
1. 계약기간, 계약횟수, 계약금액은 위 표에 기재하며, 위 표에 기재한 내용을 준수합니다.
2. 그룹레슨 계약기간 - 레슨 개시일로부터 10회당 레슨은 1개월 안에 모두 소진해야 하며, 그룹레슨의 경우 별도의 기간연장은 불가능합니다.
3. 개인레슨 계약기간 - 레슨 개시일로부터 10회당 레슨은 2개월 안에 모두 소진해야 하며 계약기간 내에 소진하지 못한 잔여 수업은 자동 소멸됩니다.
4. 담당강사가 레슨을 계속 진행할 수 없는 경우(퇴사, 지점이동 등) 동일한 자격을 갖춘 강사의 변경이 있을 수 있습니다.
5. 당사의 기타 불가피한 사유로 인해 수업시간 및 예약 방식이 변경이 있을 수 있습니다.
6. 이벤트 기간에 적용된 서비스는 기간 안에 모두 소진하지 못할 시 다음 달로 이월할 수 없습니다.

제 4조 환불 및 양도규정
1. 공정거래 위원회 고시에 따라 서비스업으로 분류되며 회원님의 개인사정으로 인한 귀책 사유로 환불 요청 시 센터가 인정하는 환불 사유의 경우(수업을 진행할 수 없는 사유가 공식적인 서류로 입증이 가능한 경우)에 한해서만 고시 규정에 따라 환불이 가능합니다.
▶ 계약 시 교부한 계약서를 지참 후 지점 방문하여 환불을 신청하여야 합니다.
▶ 환불시 등록(결제) 금액의 10%의 계약해지 위약금과 월 정상금액 기준(10만원), 일 이용료(3,300원)으로 일할 계산한 공제금액 발생합니다.
▶ 진행된 날짜 및 횟수는 프로모션 등 기타 할인을 적용하지 않은 금액으로 산정하여 금액 차감 후 환불 처리됩니다.
▶ 카드로 결제한 경우 관련법령에 따라 부가세 및 카드 수수료를 사업자가 수취할 수 없어 공제대상 금액을 선 지불 후 카드 전액 결제 취소가 가능합니다.
▶ 서비스로 제공된 수업은 환불금액에 포함되지 않으며, 계약시 제공받은 사은품 시중금액 공제 후 환불처리 됩니다.
2. 1회 정규 레슨비 - 개인PT 1회: 7.7만원 / 그룹PT 1회: 2.2만원 / 5:1그룹필: 3.3만원 / 1:1필: 7.7만원
3. 양도규정
▶ 회원권은 양도 가능하며 양도비(헬스·GX 1만원 / 레슨 3만원)가 발생합니다.
▶ 양도받은 회원권은 환불 및 재양도가 불가합니다.

제 5조 이용안내 및 기타사항
1. 이용시간(GX시간포함)은 센터의 운영사정에 따라 사전고지(1달)후 변경될 수 있습니다.
평일 06시~24시 / 토요일 07시~21시 / 일요일·공휴일 10시~18시 / 휴관일 2·4째주 일요일, 명절연휴
2. 탈의실 공용락카는 무료대여로 개인물건 분실 시 책임을 지지 않습니다.
3. 공용락카 키 분실 시 교체비용 2만원을 보상지불 해야 합니다.
4. 개인락카 사용기간 종료 1주일 후 통보 없이 폐기처분합니다.
5. 휴회는 3개월(1회/10일) 6개월(2회/15일) 12개월(3회/20일) 신청가능하며 지난 날짜에는 소급적용 되지 않습니다.
6. 헬스장 내에서는 실내전용 운동화를 착용해야 하며 소음, 음식물 반입(음료류 가능) 및 타인에게 불쾌감을 주는 행동을 할 시 즉각 환불 없이 퇴관 조치에 동의합니다.
7. 센터 내 모든 시설에서 본인 부주의로 인한 사고의(인적, 물적) 책임은 본인에게 있음을 명시합니다.`;

  // ── 약관 불러오기 (설정탭 편집창) ──
  async function loadTerms() {
    const editor = document.getElementById('admin-terms-editor');
    if (!editor) return;
    editor.value = '불러오는 중...';
    try {
      const snap = await db.ref('settings/terms').once('value');
      editor.value = snap.exists() ? snap.val() : DEFAULT_TERMS;
    } catch(e) {
      editor.value = DEFAULT_TERMS;
    }
  }
  window.loadTerms = loadTerms;

  // ── 약관 기본값 불러오기 ──
  function loadDefaultTerms() {
    const editor = document.getElementById('admin-terms-editor');
    if (editor) editor.value = DEFAULT_TERMS;
  }
  window.loadDefaultTerms = loadDefaultTerms;

  // ── 약관 저장 ──
  async function saveTerms() {
    const editor = document.getElementById('admin-terms-editor');
    if (!editor) return;
    const content = editor.value.trim();
    if (!content) { showToast('약관 내용을 입력해주세요.', 'error'); return; }
    try {
      await db.ref('settings/terms').set(content);
      showToast('약관이 저장됐어요.', 'success');
    } catch(e) {
      showToast('저장 실패: ' + e.message, 'error');
    }
  }
  window.saveTerms = saveTerms;

  // ── 계약서 3단계 약관 표시 (Firebase 우선, 폴백: 하드코딩) ──
  async function loadCtTerms() {
    const wrap = document.getElementById('ct-terms-content');
    if (!wrap) return;
    wrap.textContent = '불러오는 중...';
    try {
      const snap = await db.ref('settings/terms').once('value');
      const text = snap.exists() ? snap.val() : DEFAULT_TERMS;
      wrap.style.whiteSpace = 'pre-wrap';
      wrap.textContent = text;
    } catch(e) {
      wrap.style.whiteSpace = 'pre-wrap';
      wrap.textContent = DEFAULT_TERMS;
    }
  }
  window.loadCtTerms = loadCtTerms;
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

    // 패키지 (회원 화면 - 패키지명 + 합산금액만)
    ctPackages.forEach(pkg => {
      const pkgTotal   = Object.values(pkg.items).reduce((s,it)=>s+(it.price||0),0);
      const pkgPaid    = Object.values(pkg.items).reduce((s,it)=>s+(it.cash||0)+(it.card||0)+(it.transfer||0),0);
      const pkgUnpaid  = pkgTotal - pkgPaid;
      const pkgCash    = Object.values(pkg.items).reduce((s,it)=>s+(it.cash||0),0);
      const pkgCard    = Object.values(pkg.items).reduce((s,it)=>s+(it.card||0),0);
      const pkgTransfer= Object.values(pkg.items).reduce((s,it)=>s+(it.transfer||0),0);
      const maxMonths  = Object.values(pkg.items).reduce((m,it)=>Math.max(m,it.months||0),0);
      const countParts = Object.entries(pkg.items).filter(([,it])=>it.count).map(([prog,it])=>{
        const label = {'pilatesP':'개인','pilatesG':'그룹','pt':'PT','gx':'GX','health':'헬스'}[prog]||prog;
        return label+' '+it.count+'회';
      });
      const periodStr  = [maxMonths?maxMonths+'개월':'', countParts.length?countParts.join(' · '):''].filter(Boolean).join(' · ') || '';
      // 기간 범위 (가장 이른 시작일 ~ 가장 늦은 종료일)
      const starts = Object.values(pkg.items).map(it=>it.startDate).filter(Boolean).sort();
      const ends   = Object.values(pkg.items).map(it=>it.endDate).filter(Boolean).sort();
      const dateRange = starts.length ? starts[0] + ' ~ ' + (ends[ends.length-1]||'') : '';
      totalPrice += pkgTotal; totalPaid += pkgPaid;
      totalCash += pkgCash; totalCard += pkgCard; totalTransfer += pkgTransfer;
      html += `
        <div style="margin-bottom:8px;padding:8px;background:white;border-radius:6px;border:1px solid var(--border);">
          <div style="font-size:12px;font-weight:700;color:#185FA5;margin-bottom:4px;">📦 ${pkg.name || '패키지'}</div>
          <div style="font-size:11px;color:var(--text-sub);line-height:1.6;">
            ${periodStr ? periodStr + '<br>' : ''}
            ${dateRange ? dateRange + '<br>' : ''}
            ${pkgTotal ? '이용요금: ' + pkgTotal.toLocaleString() + '원' : ''}
            ${pkgCash ? '<br><span style="color:#059669;">현금: ' + pkgCash.toLocaleString() + '원</span>' : ''}
            ${pkgCard ? '<br><span style="color:#1a6fd4;">카드: ' + pkgCard.toLocaleString() + '원</span>' : ''}
            ${pkgTransfer ? '<br><span style="color:#7c3aed;">계좌: ' + pkgTransfer.toLocaleString() + '원</span>' : ''}
            ${pkgUnpaid > 0 ? '<br><span style="color:#ef4444;font-weight:700;">미수금: ' + pkgUnpaid.toLocaleString() + '원</span>' : ''}
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
    // 중복 저장 방지
    if (window._ctSubmitting) return;
    window._ctSubmitting = true;

    // 서명 확인
    const blank = !ctSignCtx || isCanvasBlank(ctSignCanvas);
    if (blank) { window._ctSubmitting = false; showToast('서명을 해주세요.', 'error'); return; }

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
      const numVal = id => parseInt((document.getElementById('ct-' + prog + '-' + id)?.value || '0').replace(/[^0-9]/g,'')) || 0;
      programs[prog] = {
        startDate : document.getElementById('ct-' + prog + '-start')?.value || '',
        months    : parseInt(document.getElementById('ct-' + prog + '-months')?.value) || 0,
        count     : parseInt(document.getElementById('ct-' + prog + '-count')?.value) || 0,
        extraNum  : parseInt(document.getElementById('ct-' + prog + '-extra-num')?.value) || 0,
        extraUnit : document.getElementById('ct-' + prog + '-extra-unit')?.value || '개월',
        endDate   : document.getElementById('ct-' + prog + '-end')?.value || '',
        price     : numVal('price'),
        cash      : numVal('cash'),
        card      : numVal('card'),
        transfer  : numVal('transfer'),
      };
    });

    // 날짜 계산 함수
    const calcEndDate = (startDateStr, months) => {
      if (!startDateStr || !months) return '';
      const d = new Date(startDateStr);
      d.setMonth(d.getMonth() + months);
      d.setDate(d.getDate() - 1);
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    };

    const now = new Date();
    const signDate = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

    // 부가서비스
    const extras = {};
    const numExtra = id => parseInt((document.getElementById(id)?.value || '0').replace(/[^0-9]/g,'')) || 0;
    if (document.getElementById('ct-cloth-check')?.checked) {
      const clothStart  = document.getElementById('ct-cloth-start')?.value || signDate;
      const clothMonths = parseInt(document.getElementById('ct-cloth-months')?.value) || 0;
      extras.cloth = {
        startDate : clothStart,
        endDate   : calcEndDate(clothStart, clothMonths),
        months    : clothMonths,
        price     : numExtra('ct-cloth-price'),
        cash      : numExtra('ct-cloth-cash'),
        card      : numExtra('ct-cloth-card'),
        transfer  : numExtra('ct-cloth-transfer'),
      };
    }
    if (document.getElementById('ct-locker-check')?.checked) {
      const lockerStart  = document.getElementById('ct-locker-start')?.value || signDate;
      const lockerMonths = parseInt(document.getElementById('ct-locker-months')?.value) || 0;
      const ctLockerNo    = document.getElementById('ct-locker-no')?.value.trim()     || '';
      const ctLockerCatId = document.getElementById('ct-locker-cat-id')?.value.trim() || '';
      extras.locker = {
        lockerNo    : ctLockerNo,
        lockerCatId : ctLockerCatId,
        lockerKey   : (ctLockerNo && ctLockerCatId) ? (ctLockerCatId + '_' + ctLockerNo) : '', // 락카탭 lockers/ 데이터와 양방향 동기화용 연결고리
        startDate   : lockerStart,
        endDate     : calcEndDate(lockerStart, lockerMonths),
        months      : lockerMonths,
        price       : numExtra('ct-locker-price'),
        cash        : numExtra('ct-locker-cash'),
        card        : numExtra('ct-locker-card'),
        transfer    : numExtra('ct-locker-transfer'),
      };
    }

    // 패키지 데이터 수집
    const packages = ctPackages.map(pkg => ({
      name      : pkg.name,
      items     : pkg.items,
      totalPrice: Object.values(pkg.items).reduce((s,it)=>s+(it.price||0),0),
      totalCash : Object.values(pkg.items).reduce((s,it)=>s+(it.cash||0),0),
      totalCard : Object.values(pkg.items).reduce((s,it)=>s+(it.card||0),0),
      totalTransfer: Object.values(pkg.items).reduce((s,it)=>s+(it.transfer||0),0),
    }));

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

      // 2. 서명 이미지 Base64로 저장 (PDF에서 CORS 없이 표시 가능)
      let signUrl = '';
      try {
        signUrl = ctSignCanvas.toDataURL('image/png');
      } catch(e) { console.warn('서명 이미지 변환 실패:', e); }

      // 3. 계약서 Firebase 저장
      // 약관 내용 (저장 시점 기준으로 함께 저장)
      let termsText = DEFAULT_TERMS;
      try {
        const termsSnap = await db.ref('settings/terms').once('value');
        if (termsSnap.exists()) termsText = termsSnap.val();
      } catch(e) {}

      const contractData = {
        name, phone, birth, gender, address, type, memo,
        programs, packages, extras,
        signDate, signUrl,
        terms: termsText,
        createdAt: Date.now(),
        registeredBy: localStorage.getItem('current_user') || 'admin',
      };
      const contractKey = signDate + '_' + Date.now();
      await db.ref('contracts/' + phone + '/' + contractKey).set(contractData);
      window._lastContractData = contractData;

      // 3-0. 그룹필라테스 자동연동 — 계약서에 '기구필라테스그룹' 항목(단독/패키지 무관)이 있으면
      // pilates_group/{phone} 잔여횟수에 자동으로 누적 반영 (기존 계약이력 환불/양도/변경 로직은 건드리지 않음)
      try {
        const pgItems = _flattenContractItems(contractData).filter(it => it.progKey === '기구필라테스그룹');
        const pgAddCount = pgItems.reduce((s, it) => s + (parseInt(it.data.count) || 0), 0);
        if (pgAddCount > 0) {
          const pgSnap = await db.ref('pilates_group/' + phone).once('value');
          const pgPrev = pgSnap.val() || { total: 0, remain: 0 };
          await db.ref('pilates_group/' + phone).set({
            total : (pgPrev.total  || 0) + pgAddCount,
            remain: (pgPrev.remain || 0) + pgAddCount,
            updatedAt: Date.now()
          });
        }
      } catch (e) { console.warn('그룹필라테스 자동연동 실패:', e); }

      // 3-1. 락카번호 입력 시 lockers/ Firebase 동기화 (key: catId_번호)
      if (extras.locker?.lockerNo && extras.locker?.lockerCatId) {
        const lockerNo    = extras.locker.lockerNo;
        const lockerCatId = extras.locker.lockerCatId;
        const lockerKey   = lockerCatId + '_' + lockerNo;
        await db.ref('lockers/' + lockerKey).set({
          lockerNo, phone, name,
          startDate : extras.locker.startDate,
          endDate   : extras.locker.endDate,
          categoryId: lockerCatId,
          status    : 'active',
          linkedContract: { phone, contractKey }, // 계약이력 ↔ 락카탭 시작일/종료일 양방향 동기화용 연결고리
        });
        await db.ref('members/' + phone + '/lockerKey').set(lockerKey);
      }

      // 4. 완료 화면
      const totalPaid  = Object.values(programs).reduce((s,p) => s + (p.cash||0) + (p.card||0) + (p.transfer||0), 0);
      const totalAmt   = Object.values(programs).reduce((s,p) => s + (p.price||0), 0);
      const extrasAmt  = Object.values(extras).reduce((s,e) => s + (e.price||0), 0);
      const pkgsAmt    = packages.reduce((s,pkg) => s + (pkg.totalPrice||0), 0);
      const pkgsPaid   = packages.reduce((s,pkg) => s + (pkg.totalCash||0) + (pkg.totalCard||0) + (pkg.totalTransfer||0), 0);
      const grandTotal  = totalAmt + extrasAmt + pkgsAmt;
      const grandPaid   = totalPaid + Object.values(extras).reduce((s,e) => s + (e.cash||0) + (e.card||0) + (e.transfer||0), 0) + pkgsPaid;
      const grandUnpaid = grandTotal - grandPaid;
      const allCash     = Object.values(programs).reduce((s,p)=>s+(p.cash||0),0) + Object.values(extras).reduce((s,e)=>s+(e.cash||0),0) + packages.reduce((s,pkg)=>s+(pkg.totalCash||0),0);
      const allCard     = Object.values(programs).reduce((s,p)=>s+(p.card||0),0) + Object.values(extras).reduce((s,e)=>s+(e.card||0),0) + packages.reduce((s,pkg)=>s+(pkg.totalCard||0),0);
      const allTransfer = Object.values(programs).reduce((s,p)=>s+(p.transfer||0),0) + Object.values(extras).reduce((s,e)=>s+(e.transfer||0),0) + packages.reduce((s,pkg)=>s+(pkg.totalTransfer||0),0);

      const progLabelsComplete = {
        '헬스':'🏋️ 헬스', 'GX':'🎶 GX', 'PT':'💪 PT',
        '기구필라테스개인':'🧘 기구필라테스 개인', '기구필라테스그룹':'👥 기구필라테스 그룹'
      };

      document.getElementById('ct-complete-msg').textContent =
        isNew ? name + ' 회원 계정이 생성됐어요. (아이디: ' + phone + ' / 초기비번: ' + phone.slice(-4) + ')'
              : name + ' 회원 재등록이 완료됐어요.';

      // 완료 후 항상 "↩ 회원상세로 돌아가기" — 어디서 들어왔든 방금 등록한 회원 상세화면으로 바로 이동
      const step5Btn = document.getElementById('ct-step5-secondary-btn');
      if (step5Btn) {
        step5Btn.textContent = '↩ 회원상세로 돌아가기';
        step5Btn.onclick = () => {
          window._ctReturnPhone = null;
          // 회원탭으로 전환하되, 회원목록 로딩 완료 후 바로 해당 회원 상세화면으로 이동
          document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
          document.querySelectorAll('.admin-tab, .admin-side-tab').forEach(t => t.classList.remove('active'));
          const memberSection = document.getElementById('tab-members');
          if (memberSection) memberSection.classList.add('active');
          const adminBody = document.getElementById('admin-mobile-body');
          if (adminBody) { adminBody.style.paddingLeft = ''; adminBody.style.paddingRight = ''; }
          getMemberDB().then(members => {
            cachedMembers = members;
            openMemberModal(phone);
          }).catch(() => {
            try { openMemberModal(phone); } catch(e) { console.error(e); }
          });
        };
      }

      // 5단계 등록 정보 요약 (간략)
      let summaryHtml = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border);">
          <div><span style="font-size:11px;color:var(--text-sub);">이름</span><br><strong style="font-size:13px;">${name}</strong></div>
          <div><span style="font-size:11px;color:var(--text-sub);">연락처</span><br><strong style="font-size:13px;">${phone}</strong></div>
          <div><span style="font-size:11px;color:var(--text-sub);">신청일</span><br><strong style="font-size:13px;">${signDate}</strong></div>
          <div><span style="font-size:11px;color:var(--text-sub);">구분</span><br><strong style="font-size:13px;">${type === 're' ? '재등록' : '신규'}</strong></div>
        </div>`;

      // 프로그램 목록
      Object.entries(programs).forEach(([prog, p]) => {
        const progPaid   = (p.cash||0)+(p.card||0)+(p.transfer||0);
        const progUnpaid = (p.price||0) - progPaid;
        const progPayStr = [
          p.cash   ? '<span style="color:#059669;">현금 '+p.cash.toLocaleString()+'원</span>'   : '',
          p.card   ? '<span style="color:#1a6fd4;">카드 '+p.card.toLocaleString()+'원</span>'   : '',
          p.transfer ? '<span style="color:#7c3aed;">계좌 '+p.transfer.toLocaleString()+'원</span>' : ''
        ].filter(Boolean).join(' · ');
        summaryHtml += `
          <div style="padding:6px 0;border-bottom:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <span style="font-size:13px;font-weight:600;">${progLabelsComplete[prog]||prog}</span>
              ${progUnpaid>0 ? `<span style="font-size:12px;font-weight:700;color:#ef4444;">미수금 ${progUnpaid.toLocaleString()}원</span>` : `<span style="font-size:12px;color:#059669;">✓ 완납</span>`}
            </div>
            <div style="font-size:12px;color:var(--text-sub);margin-top:2px;">
              ${p.months?p.months+'개월':''}${p.count?' · '+p.count+'회':''}${p.price?' · '+p.price.toLocaleString()+'원':''}
              ${progPayStr ? '<br>'+progPayStr : ''}
            </div>
          </div>`; });

      // 패키지 (개월+횟수+금액 통일 표기)
      const pkgProgLabelsComplete = {'pilatesP':'기구P개인','pilatesG':'기구P그룹','pt':'PT','gx':'GX','health':'헬스','기구필라테스개인':'기구P개인','기구필라테스그룹':'기구P그룹'};
      packages.forEach(pkg => {
        const pkgUnpaid = pkg.totalPrice - (pkg.totalCash + pkg.totalCard + pkg.totalTransfer);
        const pkgPeriodParts = Object.entries(pkg.items||{}).map(([p,it])=>{
          const lbl = pkgProgLabelsComplete[p]||p;
          return lbl+(it.months?' '+it.months+'개월':'')+(it.count?' '+it.count+'회':'');
        }).filter(Boolean);
        const pkgPayStr = [
          pkg.totalCash     ? '<span style="color:#059669;">현금 '+pkg.totalCash.toLocaleString()+'원</span>'     : '',
          pkg.totalCard     ? '<span style="color:#1a6fd4;">카드 '+pkg.totalCard.toLocaleString()+'원</span>'     : '',
          pkg.totalTransfer ? '<span style="color:#7c3aed;">계좌 '+pkg.totalTransfer.toLocaleString()+'원</span>' : ''
        ].filter(Boolean).join(' · ');
        summaryHtml += `
          <div style="padding:6px 0;border-bottom:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <span style="font-size:13px;font-weight:600;">📦 ${pkg.name||'패키지'}</span>
              ${pkgUnpaid>0 ? `<span style="font-size:12px;font-weight:700;color:#ef4444;">미수금 ${pkgUnpaid.toLocaleString()}원</span>` : `<span style="font-size:12px;color:#059669;">✓ 완납</span>`}
            </div>
            <div style="font-size:12px;color:var(--text-sub);margin-top:2px;">
              ${pkgPeriodParts.join(' / ')}${pkg.totalPrice?' · '+pkg.totalPrice.toLocaleString()+'원':''}
              ${pkgPayStr ? '<br>'+pkgPayStr : ''}
            </div>
          </div>`; });

      // 부가서비스
      if (extras.cloth) {
        const clothPaid = (extras.cloth.cash||0)+(extras.cloth.card||0)+(extras.cloth.transfer||0);
        const clothUnpaid = (extras.cloth.price||0) - clothPaid;
        const clothPayStr = [
          extras.cloth.cash     ? '<span style="color:#059669;">현금 '+extras.cloth.cash.toLocaleString()+'원</span>'     : '',
          extras.cloth.card     ? '<span style="color:#1a6fd4;">카드 '+extras.cloth.card.toLocaleString()+'원</span>'     : '',
          extras.cloth.transfer ? '<span style="color:#7c3aed;">계좌 '+extras.cloth.transfer.toLocaleString()+'원</span>' : ''
        ].filter(Boolean).join(' · ');
        summaryHtml += `
          <div style="padding:6px 0;border-bottom:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <span style="font-size:13px;font-weight:600;">👕 운동복</span>
              ${clothUnpaid>0 ? `<span style="font-size:12px;font-weight:700;color:#ef4444;">미수금 ${clothUnpaid.toLocaleString()}원</span>` : `<span style="font-size:12px;color:#059669;">${extras.cloth.price===0?'무료':'✓ 완납'}</span>`}
            </div>
            <div style="font-size:12px;color:var(--text-sub);margin-top:2px;">
              ${extras.cloth.months||0}개월${extras.cloth.price?' · '+extras.cloth.price.toLocaleString()+'원':''}
              ${clothPayStr ? '<br>'+clothPayStr : ''}
            </div>
          </div>`; }
      if (extras.locker) {
        const lPaid   = (extras.locker.cash||0)+(extras.locker.card||0)+(extras.locker.transfer||0);
        const lUnpaid = (extras.locker.price||0)-lPaid;
        const lockerPayStr = [
          extras.locker.cash     ? '<span style="color:#059669;">현금 '+extras.locker.cash.toLocaleString()+'원</span>'     : '',
          extras.locker.card     ? '<span style="color:#1a6fd4;">카드 '+extras.locker.card.toLocaleString()+'원</span>'     : '',
          extras.locker.transfer ? '<span style="color:#7c3aed;">계좌 '+extras.locker.transfer.toLocaleString()+'원</span>' : ''
        ].filter(Boolean).join(' · ');
        summaryHtml += `
          <div style="padding:6px 0;border-bottom:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <span style="font-size:13px;font-weight:600;">🔑 개인 락카${extras.locker.lockerNo?' ('+extras.locker.lockerNo+'번)':''}</span>
              ${lUnpaid>0 ? `<span style="font-size:12px;font-weight:700;color:#ef4444;">미수금 ${lUnpaid.toLocaleString()}원</span>` : `<span style="font-size:12px;color:#059669;">✓ 완납</span>`}
            </div>
            <div style="font-size:12px;color:var(--text-sub);margin-top:2px;">
              ${extras.locker.months||0}개월${extras.locker.price?' · '+extras.locker.price.toLocaleString()+'원':''}
              ${lockerPayStr ? '<br>'+lockerPayStr : ''}
            </div>
          </div>`; }

      // 합계
      summaryHtml += `
        <div style="margin-top:10px;padding:10px;background:white;border-radius:6px;border:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:12px;color:var(--text-sub);">총 계약금액</span>
            <span style="font-size:13px;font-weight:700;">${grandTotal.toLocaleString()}원</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:12px;color:var(--text-sub);">오늘 결제</span>
            <span style="font-size:13px;font-weight:700;color:#1a6fd4;">${grandPaid.toLocaleString()}원</span>
          </div>
          ${grandUnpaid>0 ? `<div style="display:flex;justify-content:space-between;padding-top:6px;border-top:1px solid var(--border);"><span style="font-size:12px;font-weight:700;color:#ef4444;">미수금</span><span style="font-size:13px;font-weight:700;color:#ef4444;">${grandUnpaid.toLocaleString()}원</span></div>` : `<div style="text-align:center;font-size:12px;color:#059669;font-weight:700;padding-top:6px;border-top:1px solid var(--border);">✅ 전액 완납</div>`}
        </div>`;

      document.getElementById('ct-complete-summary').innerHTML = summaryHtml;

      ctGoStep(5);
      showToast('✅ 계약서 저장 완료!', 'success');
      window._ctSubmitting = false;

      // 회원 목록 갱신
      if (typeof loadMembers === 'function') loadMembers();

    } catch(err) {
      window._ctSubmitting = false;
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
  // ── 계약서 HTML 생성 (5단계 완료 + 회원 앱 조회 공통 사용) ──
  function buildContractHtml(d) {
    const progLabels = {
      '헬스':'🏋️ 헬스', 'GX':'🎶 GX', 'PT':'💪 PT',
      '기구필라테스개인':'🧘 기구필라테스 개인', '기구필라테스그룹':'👥 기구필라테스 그룹'
    };

    // 생년월일 → 나이 계산
    let ageStr = '';
    if (d.birth && d.birth.length >= 4) {
      const birthYear = parseInt(d.birth.slice(0,4));
      const age = new Date().getFullYear() - birthYear;
      ageStr = ` (${age}세)`;
    }

    // 프로그램 행 생성
    let progRows = '';
    let totalPrice=0, totalCash=0, totalCard=0, totalTransfer=0;
    const progNameMap = {
      '헬스':'헬스', 'GX':'GX', 'PT':'PT',
      '기구필라테스개인':'기구P개인', '기구필라테스그룹':'기구P그룹',
      'pilatesP':'기구P개인', 'pilatesG':'기구P그룹', 'pt':'PT', 'gx':'GX', 'health':'헬스'
    };
    if (d.programs) {
      Object.entries(d.programs).forEach(([prog, p]) => {
        const label  = progNameMap[prog] || prog;
        const paid   = (p.cash||0)+(p.card||0)+(p.transfer||0);
        const unpaid = (p.price||0)-paid;
        totalPrice    += (p.price||0);
        totalCash     += (p.cash||0);
        totalCard     += (p.card||0);
        totalTransfer += (p.transfer||0);
        progRows += `
          <tr>
            <td style="font-size:10pt;">${label}</td>
            <td style="white-space:nowrap;font-size:10pt;">${p.startDate||'-'} ~ ${p.endDate||'-'}</td>
            <td style="text-align:center;font-size:10pt;">${p.months?p.months+'개월':'-'}${p.count?'<br>'+p.count+'회':''}</td>
            <td style="text-align:right;font-size:10pt;">${p.price?p.price.toLocaleString()+'원':'-'}</td>
            <td style="text-align:right;color:#059669;font-size:10pt;">${p.cash?p.cash.toLocaleString():'-'}</td>
            <td style="text-align:right;color:#185FA5;font-size:10pt;">${p.card?p.card.toLocaleString():'-'}</td>
            <td style="text-align:right;color:#7c3aed;font-size:10pt;">${p.transfer?p.transfer.toLocaleString():'-'}</td>
            <td style="text-align:right;color:#ef4444;font-weight:700;font-size:10pt;">${unpaid>0?unpaid.toLocaleString():'-'}</td>
          </tr>`; }); }

    // 합계 계산 (부가서비스 + 패키지 포함)
    const grandPaid   = totalCash + totalCard + totalTransfer;
    let   grandTotal  = totalPrice;
    let   grandUnpaid = totalPrice - grandPaid;
    let   grandCash   = totalCash;
    let   grandCard   = totalCard;
    let   grandTransfer = totalTransfer;

    // 패키지 행 (프로그램별 행 분리, 마지막 행에 합산금액)
    let pkgRows = '';
    const pdfProgNameMap = {'pilatesP':'기구P개인','pilatesG':'기구P그룹','pt':'PT','gx':'GX','health':'헬스','기구필라테스개인':'기구P개인','기구필라테스그룹':'기구P그룹'};
    if (d.packages && d.packages.length > 0) {
      d.packages.forEach(pkg => {
        const pkgUnpaid = pkg.totalPrice - (pkg.totalCash + pkg.totalCard + pkg.totalTransfer);
        grandTotal    += pkg.totalPrice;
        grandUnpaid   += pkgUnpaid;
        grandCash     += pkg.totalCash;
        grandCard     += pkg.totalCard;
        grandTransfer += pkg.totalTransfer;
        const pkgEntries = Object.entries(pkg.items||{});
        pkgEntries.forEach(([prog, it], idx) => {
          const isLast   = idx === pkgEntries.length - 1;
          const progLabel = pdfProgNameMap[prog]||prog;
          const pkgLabel  = idx===0 ? '📦 '+progLabel : '　 '+progLabel;
          const dateStr   = (it.startDate||'-') + ' ~ ' + (it.endDate||'-');
          const periodStr = (it.months?it.months+'개월':'') + (it.count?(it.months?' · ':'')+it.count+'회':'') || '-';
          // idx===0(첫 행)은 아래쪽 선 제거, 그 다음 행들은 위쪽 선 제거 → 패키지 내부 선 완전히 사라짐
          const topBorder    = idx===0 ? '' : 'border-top:none;';
          const bottomBorder = isLast ? '' : 'border-bottom:none;';
          const innerBorder  = topBorder + bottomBorder;
          pkgRows += `
          <tr>
            <td style="font-size:10pt;color:#185FA5;font-weight:${idx===0?'600':'400'};${innerBorder}">${pkgLabel}</td>
            <td style="white-space:nowrap;font-size:10pt;${innerBorder}">${dateStr}</td>
            <td style="text-align:center;font-size:10pt;${innerBorder}">${periodStr}</td>
            <td style="text-align:right;font-size:10pt;${innerBorder}">${isLast?(pkg.totalPrice?pkg.totalPrice.toLocaleString()+'원':'-'):''}</td>
            <td style="text-align:right;color:#059669;font-size:10pt;${innerBorder}">${isLast?(pkg.totalCash?pkg.totalCash.toLocaleString():'-'):''}</td>
            <td style="text-align:right;color:#185FA5;font-size:10pt;${innerBorder}">${isLast?(pkg.totalCard?pkg.totalCard.toLocaleString():'-'):''}</td>
            <td style="text-align:right;color:#7c3aed;font-size:10pt;${innerBorder}">${isLast?(pkg.totalTransfer?pkg.totalTransfer.toLocaleString():'-'):''}</td>
            <td style="text-align:right;color:#ef4444;font-weight:700;font-size:10pt;${innerBorder}">${isLast?(pkgUnpaid>0?pkgUnpaid.toLocaleString():'-'):''}</td>
          </tr>`;
        });
      });
    }

    // 부가서비스 행
    let extrasRows = '';
    if (d.extras) {
      if (d.extras.locker) {
        const e = d.extras.locker;
        // 종료일: 저장된 endDate 우선, 없으면 startDate+months 계산
        let lockerEnd = e.endDate || '-';
        if (!e.endDate && e.startDate && e.months) {
          const sd = new Date(e.startDate);
          sd.setMonth(sd.getMonth() + e.months);
          sd.setDate(sd.getDate() - 1);
          lockerEnd = sd.getFullYear()+'-'+String(sd.getMonth()+1).padStart(2,'0')+'-'+String(sd.getDate()).padStart(2,'0');
        }
        const lockerStart = e.startDate || d.signDate || '-';
        const lockerLabel = e.lockerNo ? e.lockerNo+'번' : '미배정';
        const ePaid   = (e.cash||0)+(e.card||0)+(e.transfer||0);
        const eUnpaid = (e.price||0)-ePaid;
        grandTotal    += (e.price||0);
        grandUnpaid   += eUnpaid;
        grandCash     += (e.cash||0);
        grandCard     += (e.card||0);
        grandTransfer += (e.transfer||0);
        extrasRows += `
          <tr>
            <td style="font-size:10pt;">개인 락카 (${lockerLabel})</td>
            <td style="white-space:nowrap;font-size:10pt;">${lockerStart} ~ ${lockerEnd}</td>
            <td style="text-align:center;font-size:10pt;">${e.months||'-'}개월</td>
            <td style="text-align:right;font-size:10pt;">${e.price?e.price.toLocaleString()+'원':'무료'}</td>
            <td style="text-align:right;color:#059669;font-size:10pt;">${e.cash?e.cash.toLocaleString():'-'}</td>
            <td style="text-align:right;color:#185FA5;font-size:10pt;">${e.card?e.card.toLocaleString():'-'}</td>
            <td style="text-align:right;color:#7c3aed;font-size:10pt;">${e.transfer?e.transfer.toLocaleString():'-'}</td>
            <td style="text-align:right;color:#ef4444;font-weight:700;font-size:10pt;">${eUnpaid>0?eUnpaid.toLocaleString():'-'}</td>
          </tr>`;
      }
      if (d.extras.cloth) {
        const e = d.extras.cloth;
        const ePaid   = (e.cash||0)+(e.card||0)+(e.transfer||0);
        const eUnpaid = (e.price||0)-ePaid;
        grandTotal    += (e.price||0);
        grandUnpaid   += eUnpaid;
        grandCash     += (e.cash||0);
        grandCard     += (e.card||0);
        grandTransfer += (e.transfer||0);
        extrasRows += `
          <tr>
            <td style="font-size:10pt;">운동복</td>
            <td style="white-space:nowrap;font-size:10pt;">${e.startDate||'-'} ~ ${e.endDate||'-'}</td>
            <td style="text-align:center;font-size:10pt;">${e.months||'-'}개월</td>
            <td style="text-align:right;font-size:10pt;">${e.price?e.price.toLocaleString()+'원':'무료'}</td>
            <td style="text-align:right;color:#059669;font-size:10pt;">${e.cash?e.cash.toLocaleString():'-'}</td>
            <td style="text-align:right;color:#185FA5;font-size:10pt;">${e.card?e.card.toLocaleString():'-'}</td>
            <td style="text-align:right;color:#7c3aed;font-size:10pt;">${e.transfer?e.transfer.toLocaleString():'-'}</td>
            <td style="text-align:right;color:#ef4444;font-weight:700;font-size:10pt;">${eUnpaid>0?eUnpaid.toLocaleString():'-'}</td>
          </tr>`;
      }
    }

    // 약관 텍스트 처리 - HTML 이스케이프 후 줄바꿈 + 조항 제목 강조
    const rawTerms = (d.terms || DEFAULT_TERMS)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const termsText = rawTerms
      .replace(/\n/g, '<br>')
      .replace(/(제\d+조[^<]*)/g, '<strong style="color:#185FA5;display:block;margin-top:6px;">$1</strong>');
    const genderStr  = d.gender === 'female' ? '여' : '남';
    const typeStr    = d.type   === 're'     ? '재등록' : '신규 등록';
    const birthFmt   = d.birth ? d.birth.replace(/(\d{4})(\d{2})(\d{2})/,'$1년 $2월 $3일') : '-';
    // 주소 특수문자 안전하게 처리
    const safeAddr   = (d.address||'-').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>풍산휘트니스 가입 계약서</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { background:#f0f0f0; font-family:'Noto Sans KR','Malgun Gothic','맑은 고딕',sans-serif; }
.a4 { width:210mm; min-height:297mm; background:white; margin:10mm auto; padding:7mm 10mm; font-size:9.5pt; color:#111; }
@media print { body{background:white;} .a4{margin:0; padding:7mm 10mm;} .btn-wrap{display:none;} }
.title-row { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #185FA5; padding-bottom:4px; margin-bottom:7px; }
.title-main { font-size:15pt; font-weight:700; color:#185FA5; }
.title-sub { font-size:8.5pt; color:#555; text-align:right; line-height:1.5; }
.section { margin-bottom:5px; }
.sec-head { background:#185FA5; color:white; font-size:9pt; font-weight:700; padding:3px 7px; margin-bottom:3px; }
table { width:100%; border-collapse:collapse; font-size:8.5pt; }
td { border:0.5px solid #aaa; padding:3px 5px; vertical-align:middle; line-height:1.4; }
.lbl { background:#eef2f7; color:#333; font-weight:700; white-space:nowrap; width:52px; }
.prog-head { background:#d6e4f0; font-weight:700; font-size:8.5pt; color:#185FA5; text-align:center; padding:3px 2px; white-space:nowrap; }
.total-row { background:#e4eef8; font-weight:700; }
.terms-box { border:0.5px solid #aaa; padding:5px 7px; font-size:7pt; line-height:1.5; color:#222; column-count:2; column-gap:9px; }
.sign-row { display:flex; gap:6px; margin-top:4px; align-items:center; }
.sign-box { flex:1; border:0.5px solid #aaa; padding:4px 8px; min-height:36px; }
.stamp { width:44px; height:44px; border:1.5px solid #ef4444; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:7.5pt; color:#ef4444; font-weight:700; text-align:center; line-height:1.4; flex-shrink:0; }
.unpaid-box { background:#fef2f2; border:0.5px solid #fca5a5; border-radius:4px; padding:4px 8px; margin-top:5px; font-size:8.5pt; color:#991b1b; }
.btn-wrap { text-align:center; margin:10px 0; }
.btn-pdf { background:#185FA5; color:white; border:none; padding:9px 24px; font-size:12pt; border-radius:6px; cursor:pointer; font-family:inherit; }
@media print { .section { page-break-inside:avoid; } }
</style>
</head>
<body>
<div class="btn-wrap">
  <button class="btn-pdf" onclick="window.print()">📄 PDF로 저장</button>
</div>
<div class="a4">
  <div class="title-row">
    <div class="title-main">풍산휘트니스 가입 계약서</div>
    <div class="title-sub">계약일: ${d.signDate||'-'}<br>${typeStr}</div>
  </div>
  <div class="section">
    <div class="sec-head">회원 정보</div>
    <table>
      <tr>
        <td class="lbl">성명</td><td>${d.name||'-'}</td>
        <td class="lbl">성별</td><td>${genderStr}</td>
        <td class="lbl">생년월일</td><td>${birthFmt}${ageStr}</td>
      </tr>
      <tr>
        <td class="lbl">연락처</td><td>${d.phone||'-'}</td>
        <td class="lbl">주소</td><td colspan="3">${safeAddr}</td>
      </tr>
      <tr>
        <td class="lbl">비고</td><td colspan="5">${d.memo||'-'}</td>
      </tr>
    </table>
  </div>
  <div class="section">
    <div class="sec-head">계약 내용</div>
    <table>
      <colgroup>
        <col style="width:14%"><col style="width:22%"><col style="width:13%">
        <col style="width:13%"><col style="width:10%"><col style="width:10%">
        <col style="width:10%"><col style="width:10%">
      </colgroup>
      <tr>
        <td class="prog-head">구분</td><td class="prog-head">이용기간</td>
        <td class="prog-head">기간/횟수</td><td class="prog-head">이용요금</td>
        <td class="prog-head">현금</td><td class="prog-head">카드</td>
        <td class="prog-head">계좌이체</td><td class="prog-head">미수금</td>
      </tr>
      ${progRows}
      ${pkgRows}
      ${extrasRows}
      <tr class="total-row">
        <td colspan="3" style="text-align:right;padding-right:12px;font-size:11pt;">합계</td>
        <td style="text-align:right;font-size:11pt;">${grandTotal.toLocaleString()}원</td>
        <td style="text-align:right;color:#059669;font-size:11pt;">${grandCash?grandCash.toLocaleString():'-'}</td>
        <td style="text-align:right;color:#185FA5;font-size:11pt;">${grandCard?grandCard.toLocaleString():'-'}</td>
        <td style="text-align:right;color:#7c3aed;font-size:11pt;">${grandTransfer?grandTransfer.toLocaleString():'-'}</td>
        <td style="text-align:right;color:#ef4444;font-weight:700;font-size:11pt;">${grandUnpaid>0?grandUnpaid.toLocaleString():'-'}</td>
      </tr>
    </table>
    ${grandUnpaid > 0 ? `<div class="unpaid-box">⚠️ 미수금 ${grandUnpaid.toLocaleString()}원이 남아있어요. 센터 방문 또는 계좌이체로 납부해주세요.</div>` : ''}
  </div>
  <div class="section">
    <div class="sec-head">이용약관</div>
    <div class="terms-box">${termsText}</div>
  </div>
  <div class="section">
    <div class="sec-head">동의 및 서명</div>
    <div style="font-size:10.5pt;padding:6px 0;line-height:1.6;">본인은 위의 이용약관을 준수할 것에 동의하며 상기와 같이 회원가입을 신청합니다.</div>
    <div class="sign-row">
      <div class="sign-box" style="width:130px;flex:none;">
        <div style="font-size:9.5pt;color:#666;margin-bottom:8px;">신청일</div>
        <div style="font-size:12pt;font-weight:700;">${d.signDate||'-'}</div>
      </div>
      <div class="sign-box" style="width:140px;flex:none;">
        <div style="font-size:9.5pt;color:#666;margin-bottom:6px;">회원 서명</div>
        ${d.signUrl ? `<img src="${d.signUrl}" style="height:32px;max-width:100%;object-fit:contain;">` : '<div style="height:32px;display:flex;align-items:center;color:#aaa;font-size:9pt;">서명 없음</div>'}
      </div>
      <div class="stamp">서명<br>완료</div>
    </div>
  </div>
</div>
<div class="btn-wrap">
  <button class="btn-pdf" onclick="window.print()">📄 PDF로 저장</button>
</div>
</body></html>`;
  }
  window.buildContractHtml = buildContractHtml;

  // ── 회원 앱: 내 계약서 조회 ──
  async function openMyContract() {
    const phone = localStorage.getItem('current_user');
    if (!phone) return;

    showToast('계약서 불러오는 중...', 'info');
    try {
      const snap = await db.ref('contracts/' + phone).once('value');
      if (!snap.exists()) {
        showToast('등록된 계약서가 없어요.', 'error');
        return;
      }
      // 가장 최근 계약서 선택
      const contracts = snap.val();
      const keys      = Object.keys(contracts).sort();
      const latest    = contracts[keys[keys.length - 1]];
      const html      = buildContractHtml(latest);
      const blob      = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url       = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch(e) {
      showToast('계약서 조회 실패: ' + e.message, 'error');
    }
  }
  window.openMyContract = openMyContract;

  // ── 5단계 완료 후 PDF 새탭 열기 ──
  // ── 계약서 회원앱으로 전송 (FCM) ──
  async function sendContractToMember() {
    if (!window._lastContractData) { showToast('계약서 데이터가 없어요.', 'error'); return; }
    const d = window._lastContractData;
    try {
      if (typeof sendPushToUser === 'function') {
        await sendPushToUser(
          d.phone,
          '📄 계약서가 등록됐어요!',
          d.name + '님의 계약서가 등록됐어요. 앱 > 내 정보 > 내 계약서에서 확인하세요.',
          'contract',
          { type: 'contract' }
        );
        showToast('✅ 회원 앱으로 전송됐어요!', 'success');
      } else {
        showToast('푸시 알림 기능을 사용할 수 없어요.', 'error');
      }
    } catch(e) {
      showToast('전송 실패: ' + e.message, 'error');
    }
  }
  window.sendContractToMember = sendContractToMember;

  function openContractPdf() {
    if (!window._lastContractData) { showToast('계약서 데이터가 없어요.', 'error'); return; }
    const html = buildContractHtml(window._lastContractData);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }
  window.openContractPdf = openContractPdf;

  function resetContract() {
    ctSelectedProgs = [];
    ctPackages = [];
    ctPkgIdCounter = 0;
    renderCtPackages();
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
    const ctProgDetails = document.getElementById('ct-prog-details');
    if (ctProgDetails) ctProgDetails.innerHTML = '';
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
     'ct-cloth-start',
     'ct-locker-no','ct-locker-cat-id','ct-locker-months','ct-locker-price','ct-locker-cash','ct-locker-card','ct-locker-transfer',
     'ct-locker-start'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    // 종료일 표시 초기화
    ['ct-cloth-end-display','ct-locker-end-display'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = '자동계산'; el.style.color = 'var(--text-hint)'; }
    });
    // 락카 카테고리 드롭다운 초기화
    const lockerCatSel = document.getElementById('ct-locker-cat');
    if (lockerCatSel) lockerCatSel.selectedIndex = 0;
    // 락카 그리드 숨김
    const lockerGrid = document.getElementById('ct-locker-grid');
    if (lockerGrid) lockerGrid.style.display = 'none';
    // 락카 번호 표시 초기화
    const lockerDisplay = document.getElementById('ct-locker-no-display');
    if (lockerDisplay) lockerDisplay.innerHTML = '';
    const lockerDisplayWrap = document.getElementById('ct-locker-no-display-wrap');
    if (lockerDisplayWrap) lockerDisplayWrap.style.display = 'none';
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
    // 메모는 주(週)와 상관없이 하나만 유지되므로 화면 진입 시 한 번만 불러옴
    const trainerId = localStorage.getItem('current_user');
    db.ref('trainers/' + trainerId + '/scheduleMemo').once('value', snap => {
      const memoEl = document.getElementById('schedule-memo-input');
      if (memoEl) memoEl.value = snap.val() || '';
    });
  }

  function saveScheduleMemo() {
    const trainerId = localStorage.getItem('current_user');
    const memo = document.getElementById('schedule-memo-input')?.value.trim() || '';
    db.ref('trainers/' + trainerId + '/scheduleMemo').set(memo).then(() => {
      showToast('✅ 메모 저장 완료!', 'success');
    });
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
      if (snap.exists()) snap.forEach(child => { pointTiers.push({ id: child.key, ...child.val() }); });
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

  // ── 🧘 기구필라테스 그룹수업 관리 탭 ──
  // pilates_group/{phone} = { total, remain, updatedAt } — 강사배정(trainers/trainees) 시스템과 완전히 분리된 독립 카운터
  // pilates_settings/weeklySchedule/{요일} = [{time, capacity}, ...] — 한 번 설정하면 바꾸기 전까지 계속 적용되는 정기 시간표
  // pilates_exceptions/{date} = { fullClosed:true } 또는 { closedTimes:{ 'HH:MM':true } } — 공휴일/개별 휴무 예외
  let _pgMembersCache = null;
  const PG_DAY_KEYS   = ['mon','tue','wed','thu','fri','sat','sun'];
  const PG_DAY_LABELS = { mon:'월', tue:'화', wed:'수', thu:'목', fri:'금', sat:'토', sun:'일' };
  const PG_DEFAULT_SCHEDULE = {
    mon: [{time:'10:00',capacity:5},{time:'11:00',capacity:5},{time:'18:00',capacity:5},{time:'19:00',capacity:5},{time:'20:00',capacity:5}],
    tue: [{time:'10:00',capacity:5},{time:'11:00',capacity:5},{time:'19:00',capacity:5},{time:'20:00',capacity:5},{time:'21:00',capacity:5}],
    wed: [{time:'10:00',capacity:5},{time:'11:00',capacity:5},{time:'18:00',capacity:5},{time:'19:00',capacity:5},{time:'20:00',capacity:5}],
    thu: [{time:'10:00',capacity:5},{time:'11:00',capacity:5},{time:'19:00',capacity:5},{time:'20:00',capacity:5},{time:'21:00',capacity:5}],
    fri: [{time:'10:00',capacity:5},{time:'11:00',capacity:5},{time:'18:00',capacity:5},{time:'19:00',capacity:5},{time:'20:00',capacity:5}],
    sat: [], sun: []
  };
  let _pgSchedule   = null; // 편집 중인 요일별 시간표 (메모리)
  let _pgOriginalSchedule = null; // 마지막으로 저장된(서버) 시간표 스냅샷 — 삭제된 시간대 감지용
  let _pgActiveDay  = 'mon';

  function initPilatesGroupTab() {
    const searchInput = document.getElementById('pg-search');
    if (searchInput) searchInput.value = '';
    const resultEl = document.getElementById('pg-search-result');
    if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
    const selWrap = document.getElementById('pg-selected-wrap');
    if (selWrap) selWrap.innerHTML = '';
    db.ref('members').once('value').then(snap => {
      const members = [];
      snap.forEach(child => {
        const m = child.val();
        if (m.role !== 'trainer' && m.role !== 'manager') {
          members.push({ id: child.key, name: m.name || child.key });
        }
      });
      _pgMembersCache = members;
    });
    switchPilatesSubtab('reservations');
  }
  window.initPilatesGroupTab = initPilatesGroupTab;

  // 서브탭 전환 (시간표 / 휴무관리 / 잔여횟수 / 설정)
  function switchPilatesSubtab(tab) {
    const tabs = ['schedule', 'exceptions', 'reservations', 'counts', 'settings'];
    tabs.forEach(t => {
      const btn  = document.getElementById('pg-subtab-' + t);
      const view = document.getElementById('pg-view-' + t);
      const isActive = t === tab;
      if (btn) {
        btn.style.background = isActive ? 'var(--blue)' : 'var(--card)';
        btn.style.color      = isActive ? 'white'       : 'var(--text)';
        btn.style.border     = isActive ? 'none'        : '1.5px solid var(--border)';
      }
      if (view) view.style.display = isActive ? '' : 'none';
    });
    if (tab === 'schedule')      loadPilatesSchedule();
    if (tab === 'exceptions') {
      if (!_pgeSelectedDate) { _pgeSelectedDate = _pgTodayISO(); const t = new Date(); _pgeCalMonth = { year: t.getFullYear(), month: t.getMonth() }; }
      renderPgeCalendar();
      updatePgeSelectedDateLabel();
      loadPilatesExceptionList();
    }
    if (tab === 'reservations') {
      if (!_pgrSelectedDate) { _pgrSelectedDate = _pgTodayISO(); const t = new Date(); _pgrCalMonth = { year: t.getFullYear(), month: t.getMonth() }; }
      renderPgrCalendar();
      updatePgrSelectedDateLabel();
      _pgActiveRefreshFn = loadPilatesReservations;
      loadPilatesReservations();
    }
    if (tab === 'settings')      loadPilatesSettings();
    if (tab === 'counts')        loadPilatesTodayBookings();
  }
  window.switchPilatesSubtab = switchPilatesSubtab;

  // ── 관리자용 공용 미니 달력 (예약현황 pgr / 휴무관리 pge) — 브라우저 기본 date input 대신 사용 ──
  let _pgrCalMonth = null, _pgrSelectedDate = null;
  let _pgeCalMonth = null, _pgeSelectedDate = null;

  function _pgRenderAdminCalendar(prefix, calMonth, selectedDate, onSelectFnName, datesWithBookings) {
    const grid = document.getElementById(prefix + '-cal-grid');
    const label = document.getElementById(prefix + '-cal-month-label');
    if (!grid || !label || !calMonth) return;
    datesWithBookings = datesWithBookings || new Set();
    const { year, month } = calMonth;
    label.textContent = year + '년 ' + (month + 1) + '월';
    const startOffset = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = _pgTodayISO();
    let cells = '';
    for (let i = 0; i < startOffset; i++) cells += '<div></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const isSelected = dateStr === selectedDate;
      const isToday = dateStr === todayStr;
      const hasBooking = datesWithBookings.has(dateStr);
      cells += `<div onclick="${onSelectFnName}('${dateStr}')"
        style="text-align:center;padding:6px 0;border-radius:8px;cursor:pointer;
        background:${isSelected ? 'var(--blue)' : 'transparent'};
        border:${isToday && !isSelected ? '1px solid var(--blue)' : '1px solid transparent'};">
        <div style="font-size:13px;font-weight:${isSelected || isToday ? '700' : '400'};color:${isSelected ? 'white' : 'var(--text)'};">${day}</div>
        <div style="height:4px;width:4px;border-radius:50%;margin:2px auto 0;background:${isSelected ? 'white' : 'var(--blue)'};visibility:${hasBooking ? 'visible' : 'hidden'};"></div>
      </div>`;
    }
    grid.innerHTML = cells;
  }

  function _pgFormatDateLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const dayKey = PG_WEEKDAY_BY_INDEX[d.getDay()];
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + PG_DAY_LABELS[dayKey] + ')';
  }

  function renderPgrCalendar() {
    if (!_pgrCalMonth) return;
    const { year, month } = _pgrCalMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthStartKey = '' + year + String(month + 1).padStart(2, '0') + '01';
    const monthEndKey = '' + year + String(month + 1).padStart(2, '0') + String(daysInMonth).padStart(2, '0');
    db.ref('pilates_classes').orderByKey().startAt(monthStartKey + '_').endAt(monthEndKey + '_\uf8ff').once('value').then(snap => {
      const datesWithBookings = new Set();
      snap.forEach(child => {
        const cls = child.val();
        if (cls && cls.bookings && Object.keys(cls.bookings).length) datesWithBookings.add(cls.date);
      });
      _pgRenderAdminCalendar('pgr', _pgrCalMonth, _pgrSelectedDate, 'selectPgrDate', datesWithBookings);
    });
  }
  function updatePgrSelectedDateLabel() {
    const el = document.getElementById('pgr-selected-date-label');
    if (el && _pgrSelectedDate) el.textContent = _pgFormatDateLabel(_pgrSelectedDate);
  }
  function pgrCalChangeMonth(delta) {
    let { year, month } = _pgrCalMonth;
    month += delta;
    if (month < 0) { month = 11; year--; } else if (month > 11) { month = 0; year++; }
    _pgrCalMonth = { year, month };
    renderPgrCalendar();
  }
  window.pgrCalChangeMonth = pgrCalChangeMonth;
  function selectPgrDate(dateStr) {
    _pgrSelectedDate = dateStr;
    renderPgrCalendar();
    updatePgrSelectedDateLabel();
    loadPilatesReservations();
  }
  window.selectPgrDate = selectPgrDate;

  function renderPgeCalendar() { _pgRenderAdminCalendar('pge', _pgeCalMonth, _pgeSelectedDate, 'selectPgeDate'); }
  function updatePgeSelectedDateLabel() {
    const el = document.getElementById('pge-selected-date-label');
    if (el && _pgeSelectedDate) el.textContent = _pgFormatDateLabel(_pgeSelectedDate);
  }
  function pgeCalChangeMonth(delta) {
    let { year, month } = _pgeCalMonth;
    month += delta;
    if (month < 0) { month = 11; year--; } else if (month > 11) { month = 0; year++; }
    _pgeCalMonth = { year, month };
    renderPgeCalendar();
  }
  window.pgeCalChangeMonth = pgeCalChangeMonth;
  function selectPgeDate(dateStr) {
    _pgeSelectedDate = dateStr;
    renderPgeCalendar();
    updatePgeSelectedDateLabel();
  }
  window.selectPgeDate = selectPgeDate;

  function _pgTodayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const PG_WEEKDAY_BY_INDEX = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // Date.getDay() 인덱스용
  function _pgClassId(dateStr, time) {
    return dateStr.replace(/-/g, '') + '_' + time.replace(':', '');
  }

  // ── 📋 예약현황: 날짜별 예약자 명단 조회, 관리자 대신예약/취소/출석처리 ──
  let _pgActiveRefreshFn = null; // 현재 활성화된 화면의 새로고침 함수 (관리자 예약현황 vs 강사 그룹수업 화면)
  function _pgRefreshActiveView() {
    if (typeof _pgActiveRefreshFn === 'function') _pgActiveRefreshFn();
  }

  // 시간대별 예약카드 HTML — 관리자 예약현황/강사 그룹수업 화면 공용
  function _pgBuildSlotCardHtml(prefix, time, classId, capacity, bookings, timeClosed, isOrphan, deductMode) {
    const memberRows = Object.keys(bookings).map(uid => {
      const b = bookings[uid];
      const attended = !!b.attended;
      const trialTag = b.isTrial ? ' <span style="font-size:10px;color:#185FA5;font-weight:700;">(체험)</span>' : '';
      // 출석처리 버튼 노출 여부는 "지금 전역 설정"이 아니라 "이 예약건이 예약될 당시 이미 차감됐는지"로 판단
      // → 관리자가 나중에 자동/수동 설정을 바꿔도 이미 잡힌 예약은 예약 당시 방식 그대로 유지됨
      let extraBtn = '';
      if (!b.isTrial) {
        if (attended) {
          extraBtn = `<span style="font-size:11px;color:var(--text-hint);margin-right:6px;">처리완료</span>`;
        } else if (!b.deducted) {
          extraBtn = `<button onclick="adminMarkPilatesAttended('${classId}','${uid}')" style="padding:5px 10px;border-radius:8px;border:none;background:var(--blue);color:white;font-size:11px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-right:6px;">출석 처리</button>`;
        }
      }
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
        <span style="font-size:12.5px;color:var(--text);">${b.name || uid}${trialTag}</span>
        <div>${extraBtn}<button onclick="adminCancelPilatesBooking('${classId}','${uid}')" style="padding:5px 10px;border-radius:8px;border:1px solid #e24b4a;background:none;color:#e24b4a;font-size:11px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">취소</button></div>
      </div>`;
    }).join('') || '<div style="font-size:12px;color:var(--text-hint);padding:6px 0;">예약자 없음</div>';

    return `
      <div class="admin-card" style="margin-top:0;${isOrphan ? 'border:1.5px solid #e24b4a;' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div class="admin-card-title" style="margin:0;">${time}${timeClosed ? ' (닫힘)' : ''}${isOrphan ? ' <span style="font-size:11px;color:#e24b4a;font-weight:700;">· 시간표에서 삭제된 시간이에요</span>' : ''}</div>
          <span style="font-size:12px;color:var(--text-hint);">${Object.keys(bookings).length} / ${capacity}명</span>
        </div>
        ${memberRows}
        <input id="${prefix}-add-${classId}" type="text" placeholder="회원 이름 검색해서 대신 예약 추가" oninput="onSlotAddSearchInput('${prefix}','${classId}')"
          style="width:100%;box-sizing:border-box;margin-top:10px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:'Noto Sans KR',sans-serif;">
        <div id="${prefix}-add-result-${classId}" style="display:none;border:1px solid var(--border);border-radius:8px;margin-top:6px;max-height:160px;overflow-y:auto;"></div>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <input id="${prefix}-trial-name-${classId}" type="text" placeholder="체험수업자 이름"
            style="flex:1;box-sizing:border-box;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:'Noto Sans KR',sans-serif;">
          <input id="${prefix}-trial-phone-${classId}" type="text" placeholder="연락처(선택)"
            style="flex:1;box-sizing:border-box;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:'Noto Sans KR',sans-serif;">
          <button onclick="addTrialPilatesBooking('${prefix}','${classId}',${capacity})"
            style="padding:7px 12px;border-radius:8px;border:none;background:var(--blue);color:white;font-size:12px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;white-space:nowrap;">체험추가</button>
        </div>
      </div>`;
  }

  function loadPilatesReservations() {
    const dateStr = _pgrSelectedDate;
    const el = document.getElementById('pgr-list');
    if (!el) return;
    if (!dateStr) { el.innerHTML = ''; return; }
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:13px;">불러오는 중...</div>';
    const d = new Date(dateStr + 'T00:00:00');
    const dayKey = PG_WEEKDAY_BY_INDEX[d.getDay()];
    const dateKey = dateStr.replace(/-/g, '');
    Promise.all([
      db.ref('pilates_settings').once('value'),
      db.ref('pilates_exceptions/' + dateStr).once('value'),
      db.ref('pilates_classes').orderByKey().startAt(dateKey + '_').endAt(dateKey + '_\uf8ff').once('value')
    ]).then(([setSnap, excSnap, classesSnap]) => {
      const s = setSnap.val() || {};
      const deductMode = s.deductMode || 'auto';
      const sched = s.weeklySchedule || {};
      const templateSlots = Array.isArray(sched[dayKey]) ? sched[dayKey] : (sched[dayKey] ? Object.values(sched[dayKey]) : []);
      const exc = excSnap.val() || {};

      // 실제로 존재하는 수업 문서 (예약이 있거나 관리자가 만들었던 시간) — 시간표에서 이미 삭제됐어도 예약기록이 있으면 여기 남아있음
      const actualByTime = {};
      classesSnap.forEach(child => { actualByTime[child.val().time] = { classId: child.key, data: child.val() }; });

      // 시간표에 있는 시간 + 실제 존재하지만 지금 시간표엔 없는 시간(orphan, 삭제된 시간대) 합치기
      const timeSet = new Set(templateSlots.map(sl => sl.time));
      Object.keys(actualByTime).forEach(t => timeSet.add(t));
      const allTimes = Array.from(timeSet).sort();

      if (!allTimes.length) {
        el.innerHTML = exc.fullClosed
          ? '<div class="admin-card" style="margin-top:0;"><div style="text-align:center;padding:20px;color:#e24b4a;font-size:13px;">이 날은 휴무예요</div></div>'
          : '<div class="admin-card" style="margin-top:0;"><div style="text-align:center;padding:20px;color:var(--text-hint);font-size:13px;">열리는 수업이 없어요</div></div>';
        return;
      }

      el.innerHTML = allTimes.map(time => {
        const templateSlot = templateSlots.find(sl => sl.time === time);
        const actual = actualByTime[time];
        const classId = actual ? actual.classId : _pgClassId(dateStr, time);
        const capacity = (actual && actual.data.capacity) || (templateSlot ? templateSlot.capacity : 5);
        const bookings = (actual && actual.data.bookings) || {};
        const isOrphan = !templateSlot; // 시간표에서 이미 삭제됐는데 예약기록은 남아있는 시간
        const timeClosed = exc.fullClosed || (exc.closedTimes && exc.closedTimes[time]);
        return _pgBuildSlotCardHtml('pgr', time, classId, capacity, bookings, timeClosed, isOrphan, deductMode);
      }).join('');
    });
  }
  window.loadPilatesReservations = loadPilatesReservations;

  function onSlotAddSearchInput(prefix, classId) {
    const input = document.getElementById(prefix + '-add-' + classId);
    const resultEl = document.getElementById(prefix + '-add-result-' + classId);
    const q = input.value.trim();
    if (!q || !_pgMembersCache) { resultEl.style.display = 'none'; return; }
    const filtered = _pgMembersCache.filter(m => m.name.includes(q) || m.id.includes(q)).slice(0, 6);
    if (!filtered.length) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = '<div style="padding:8px 10px;font-size:12px;color:var(--text-hint);">검색 결과가 없어요</div>';
      return;
    }
    resultEl.style.display = 'block';
    resultEl.innerHTML = filtered.map(m => `
      <div onclick="adminAddPilatesBooking('${classId}','${m.id}','${m.name}')" style="padding:8px 10px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--border);">
        ${m.name} <span style="color:var(--text-hint);font-size:10px;">${m.id}</span>
      </div>`).join('');
  }
  window.onSlotAddSearchInput = onSlotAddSearchInput;

  function adminAddPilatesBooking(classId, memberId, memberName) {
    const dateStr = classId.slice(0, 4) + '-' + classId.slice(4, 6) + '-' + classId.slice(6, 8);
    const time = classId.slice(9, 11) + ':' + classId.slice(11, 13);
    db.ref('pilates_settings').once('value').then(setSnap => {
      const s = setSnap.val() || {};
      const deductMode = s.deductMode || 'auto';
      const d = new Date(dateStr + 'T00:00:00');
      const dayKey = PG_WEEKDAY_BY_INDEX[d.getDay()];
      const sched = s.weeklySchedule || {};
      const slots = Array.isArray(sched[dayKey]) ? sched[dayKey] : (sched[dayKey] ? Object.values(sched[dayKey]) : []);
      const slot = slots.find(sl => sl.time === time);
      const capacity = slot ? slot.capacity : 5;

      if (deductMode === 'auto') {
        // 잔여횟수 확인+차감을 하나의 트랜잭션으로 묶어서, 같은 순간 회원이 직접 예약해도 이중 차감되지 않게 함
        db.ref('pilates_group/' + memberId).transaction(p => {
          if (!p || (p.remain || 0) <= 0) return; // undefined 반환 → 트랜잭션 중단
          p.remain = p.remain - 1;
          return p;
        }).then(deductResult => {
          if (!deductResult.committed) { showToast('이 회원은 잔여횟수가 없어요.', 'error'); return; }
          _adminTryAddPilatesBooking(classId, dateStr, time, capacity, memberId, memberName, true);
        });
      } else {
        _adminTryAddPilatesBooking(classId, dateStr, time, capacity, memberId, memberName, false);
      }
    });
  }
  window.adminAddPilatesBooking = adminAddPilatesBooking;

  function _adminTryAddPilatesBooking(classId, dateStr, time, capacity, memberId, memberName, wasDeducted) {
    db.ref('pilates_classes/' + classId).transaction(curr => {
      if (curr === null) curr = { date: dateStr, time: time, capacity: capacity, bookings: {} };
      const bookings = curr.bookings || {};
      if (bookings[memberId]) return curr;
      if (Object.keys(bookings).length >= (curr.capacity || capacity)) return curr;
      bookings[memberId] = { name: memberName, bookedAt: Date.now(), addedByAdmin: true };
      if (wasDeducted) bookings[memberId].deducted = true;
      curr.bookings = bookings;
      return curr;
    }).then(result => {
      const data = result.snapshot.val();
      const ok = data && data.bookings && data.bookings[memberId];
      if (!ok) {
        showToast('추가하지 못했어요. 정원이 다 찼을 수 있어요.', 'error');
        if (wasDeducted) {
          // 이미 차감된 잔여횟수를 되돌려놓음 (예약 자체는 실패했으므로)
          db.ref('pilates_group/' + memberId).transaction(p => {
            if (!p) return p;
            p.remain = (p.remain || 0) + 1;
            return p;
          }).then(() => _pgRefreshActiveView());
        } else {
          _pgRefreshActiveView();
        }
        return;
      }
      showToast('✅ 예약이 추가됐어요!', 'success');
      _pgRefreshActiveView();
    });
  }

  // 체험수업자 추가 — 회원(pilates_group)이 아니라 이름(+연락처)만으로 명단에 추가, 잔여횟수 개념 없음
  function addTrialPilatesBooking(prefix, classId, capacity) {
    const nameInput = document.getElementById(prefix + '-trial-name-' + classId);
    const phoneInput = document.getElementById(prefix + '-trial-phone-' + classId);
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    if (!name) { showToast('체험수업자 이름을 입력해주세요.', 'error'); return; }
    const dateStr = classId.slice(0, 4) + '-' + classId.slice(4, 6) + '-' + classId.slice(6, 8);
    const time = classId.slice(9, 11) + ':' + classId.slice(11, 13);
    const trialId = 'trial_' + Date.now();
    db.ref('pilates_classes/' + classId).transaction(curr => {
      if (curr === null) curr = { date: dateStr, time: time, capacity: capacity, bookings: {} };
      const bookings = curr.bookings || {};
      if (Object.keys(bookings).length >= (curr.capacity || capacity)) return curr;
      bookings[trialId] = { name: name, phone: phone || null, isTrial: true, bookedAt: Date.now() };
      curr.bookings = bookings;
      return curr;
    }).then(result => {
      const data = result.snapshot.val();
      const ok = data && data.bookings && data.bookings[trialId];
      if (!ok) { showToast('추가하지 못했어요. 정원이 다 찼을 수 있어요.', 'error'); return; }
      showToast('✅ 체험수업자가 추가됐어요!', 'success');
      _pgRefreshActiveView();
    });
  }
  window.addTrialPilatesBooking = addTrialPilatesBooking;

  function adminCancelPilatesBooking(classId, memberId) {
    showConfirm('이 예약을 취소할까요?', () => {
      db.ref('pilates_classes/' + classId + '/bookings/' + memberId).once('value').then(bSnap => {
        const b = bSnap.val();
        const shouldRestore = !(b && b.isTrial) && !!(b && (b.deducted || b.attended));
        db.ref('pilates_classes/' + classId + '/bookings/' + memberId).remove().then(() => {
          const restore = shouldRestore
            ? db.ref('pilates_group/' + memberId).transaction(p => { if (!p) return p; p.remain = (p.remain || 0) + 1; return p; })
            : Promise.resolve();
          restore.then(() => {
            showToast('취소됐어요.', 'success');
            _pgRefreshActiveView();
          });
        });
      });
    });
  }
  window.adminCancelPilatesBooking = adminCancelPilatesBooking;

  function adminMarkPilatesAttended(classId, memberId) {
    db.ref('pilates_classes/' + classId + '/bookings/' + memberId).once('value').then(bSnap => {
      const b = bSnap.val();
      if (!b || b.isTrial || b.attended) return; // 체험수업자는 잔여횟수 개념이 없어 출석처리 대상에서 제외
      db.ref('pilates_group/' + memberId).transaction(p => {
        if (!p) return p;
        p.remain = Math.max(0, (p.remain || 0) - 1);
        return p;
      }).then(() => {
        db.ref('pilates_classes/' + classId + '/bookings/' + memberId + '/attended').set(true).then(() => {
          showToast('✅ 출석 처리됐어요! 잔여횟수 차감됐어요.', 'success');
          _pgRefreshActiveView();
        });
      });
    });
  }
  window.adminMarkPilatesAttended = adminMarkPilatesAttended;

  // ── 🧘 강사용 그룹수업 화면 (달력 + 대신예약 + 취소, 관리자 예약현황과 로직 공유) ──
  let _thPgCalMonth = null, _thPgSelectedDate = null;

  function openTrainerPilatesView() {
    showScreen('screen-trainer-pilates');
    const t = new Date();
    _thPgCalMonth = { year: t.getFullYear(), month: t.getMonth() };
    _thPgSelectedDate = _pgTodayISO();
    db.ref('members').once('value').then(snap => {
      const members = [];
      snap.forEach(child => {
        const m = child.val();
        if (m.role !== 'trainer' && m.role !== 'manager') members.push({ id: child.key, name: m.name || child.key });
      });
      _pgMembersCache = members;
    });
    _pgActiveRefreshFn = loadTrainerPilatesDateView;
    renderTrainerPilatesCalendar();
    loadTrainerPilatesDateView();
  }
  window.openTrainerPilatesView = openTrainerPilatesView;

  function thPgChangeMonth(delta) {
    let { year, month } = _thPgCalMonth;
    month += delta;
    if (month < 0) { month = 11; year--; }
    else if (month > 11) { month = 0; year++; }
    _thPgCalMonth = { year, month };
    renderTrainerPilatesCalendar();
  }
  window.thPgChangeMonth = thPgChangeMonth;

  function selectThPgDate(dateStr) {
    _thPgSelectedDate = dateStr;
    renderTrainerPilatesCalendar();
    loadTrainerPilatesDateView();
  }
  window.selectThPgDate = selectThPgDate;

  function renderTrainerPilatesCalendar() {
    const grid = document.getElementById('th-pg-calendar-grid');
    const label = document.getElementById('th-pg-cal-month-label');
    if (!grid || !label || !_thPgCalMonth) return;
    const { year, month } = _thPgCalMonth;
    label.textContent = year + '년 ' + (month + 1) + '월';
    const startOffset = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = _pgTodayISO();
    const monthStartKey = '' + year + String(month + 1).padStart(2, '0') + '01';
    const monthEndKey = '' + year + String(month + 1).padStart(2, '0') + String(daysInMonth).padStart(2, '0');

    db.ref('pilates_classes').orderByKey().startAt(monthStartKey + '_').endAt(monthEndKey + '_\uf8ff').once('value').then(snap => {
      const datesWithBookings = new Set();
      snap.forEach(child => {
        const cls = child.val();
        if (cls && cls.bookings && Object.keys(cls.bookings).length) datesWithBookings.add(cls.date);
      });

      let cells = '';
      for (let i = 0; i < startOffset; i++) cells += '<div></div>';
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        const isSelected = dateStr === _thPgSelectedDate;
        const isToday = dateStr === todayStr;
        const hasBooking = datesWithBookings.has(dateStr);
        cells += `<div onclick="selectThPgDate('${dateStr}')"
          style="text-align:center;padding:6px 0;border-radius:8px;cursor:pointer;
          background:${isSelected ? 'var(--blue)' : 'transparent'};
          border:${isToday && !isSelected ? '1px solid var(--blue)' : '1px solid transparent'};">
          <div style="font-size:13px;font-weight:${isSelected || isToday ? '700' : '400'};color:${isSelected ? 'white' : 'var(--text)'};">${day}</div>
          <div style="height:4px;width:4px;border-radius:50%;margin:2px auto 0;background:${isSelected ? 'white' : 'var(--blue)'};visibility:${hasBooking ? 'visible' : 'hidden'};"></div>
        </div>`;
      }
      grid.innerHTML = cells;
    });
  }

  function loadTrainerPilatesDateView() {
    const dateStr = _thPgSelectedDate;
    const el = document.getElementById('th-pg-slot-list');
    const labelEl = document.getElementById('th-pg-selected-date-label');
    if (!el || !dateStr) return;
    const d = new Date(dateStr + 'T00:00:00');
    const dayKey = PG_WEEKDAY_BY_INDEX[d.getDay()];
    if (labelEl) labelEl.textContent = (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + PG_DAY_LABELS[dayKey] + ')';
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:13px;">불러오는 중...</div>';
    const dateKey = dateStr.replace(/-/g, '');
    Promise.all([
      db.ref('pilates_settings').once('value'),
      db.ref('pilates_exceptions/' + dateStr).once('value'),
      db.ref('pilates_classes').orderByKey().startAt(dateKey + '_').endAt(dateKey + '_\uf8ff').once('value')
    ]).then(([setSnap, excSnap, classesSnap]) => {
      const s = setSnap.val() || {};
      const deductMode = s.deductMode || 'auto';
      const sched = s.weeklySchedule || {};
      const templateSlots = Array.isArray(sched[dayKey]) ? sched[dayKey] : (sched[dayKey] ? Object.values(sched[dayKey]) : []);
      const exc = excSnap.val() || {};
      const actualByTime = {};
      classesSnap.forEach(child => { actualByTime[child.val().time] = { classId: child.key, data: child.val() }; });
      const timeSet = new Set(templateSlots.map(sl => sl.time));
      Object.keys(actualByTime).forEach(t => timeSet.add(t));
      const allTimes = Array.from(timeSet).sort();
      if (!allTimes.length) {
        el.innerHTML = exc.fullClosed
          ? '<div style="text-align:center;padding:20px;color:#e24b4a;font-size:13px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);">이 날은 휴무예요</div>'
          : '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:13px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);">열리는 수업이 없어요</div>';
        return;
      }
      el.innerHTML = allTimes.map(time => {
        const templateSlot = templateSlots.find(sl => sl.time === time);
        const actual = actualByTime[time];
        const classId = actual ? actual.classId : _pgClassId(dateStr, time);
        const capacity = (actual && actual.data.capacity) || (templateSlot ? templateSlot.capacity : 5);
        const bookings = (actual && actual.data.bookings) || {};
        const isOrphan = !templateSlot;
        const timeClosed = exc.fullClosed || (exc.closedTimes && exc.closedTimes[time]);
        return _pgBuildSlotCardHtml('th-pg', time, classId, capacity, bookings, timeClosed, isOrphan, deductMode);
      }).join('');
    });
  }
  window.loadTrainerPilatesDateView = loadTrainerPilatesDateView;

  // ── 📆 시간표 ──
  function loadPilatesSchedule() {
    db.ref('pilates_settings/weeklySchedule').once('value').then(snap => {
      const val = snap.val();
      _pgSchedule = val ? {} : JSON.parse(JSON.stringify(PG_DEFAULT_SCHEDULE));
      if (val) {
        PG_DAY_KEYS.forEach(d => {
          _pgSchedule[d] = Array.isArray(val[d]) ? val[d] : (val[d] ? Object.values(val[d]) : []);
        });
      }
      _pgOriginalSchedule = JSON.parse(JSON.stringify(_pgSchedule)); // 삭제된 시간 감지용 원본 스냅샷
      renderPilatesDayTabs();
      renderPilatesScheduleRows();
      loadPilatesSchedulePreview();
    });
  }
  window.loadPilatesSchedule = loadPilatesSchedule;

  function renderPilatesDayTabs() {
    const el = document.getElementById('pg-day-tabs');
    if (!el) return;
    el.innerHTML = PG_DAY_KEYS.map(d => `
      <button onclick="switchPilatesDay('${d}')"
        style="padding:7px 14px;border-radius:20px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;
        background:${d === _pgActiveDay ? 'var(--blue)' : 'var(--bg)'};color:${d === _pgActiveDay ? 'white' : 'var(--text)'};border:${d === _pgActiveDay ? 'none' : '1px solid var(--border)'};">
        ${PG_DAY_LABELS[d]}${_pgSchedule[d] && _pgSchedule[d].length ? ' · ' + _pgSchedule[d].length : ''}
      </button>`).join('');
  }

  function switchPilatesDay(day) {
    _pgActiveDay = day;
    renderPilatesDayTabs();
    renderPilatesScheduleRows();
  }
  window.switchPilatesDay = switchPilatesDay;

  function renderPilatesScheduleRows() {
    const el = document.getElementById('pg-schedule-rows');
    if (!el) return;
    const rows = _pgSchedule[_pgActiveDay] || [];
    if (!rows.length) {
      el.innerHTML = '<div style="text-align:center;padding:16px 0;color:var(--text-hint);font-size:13px;">이 요일엔 등록된 시간이 없어요</div>';
      return;
    }
    el.innerHTML = rows.map((r, i) => `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <input type="time" value="${r.time || ''}" oninput="updatePilatesScheduleField(${i},'time',this.value)"
          style="flex:1.2;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;">
        <input type="number" min="1" value="${r.capacity != null ? r.capacity : 5}" oninput="updatePilatesScheduleField(${i},'capacity',this.value)"
          style="width:70px;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:'Noto Sans KR',sans-serif;">
        <span style="font-size:12px;color:var(--text-hint);">명</span>
        <button onclick="removePilatesScheduleRow(${i})" style="padding:6px 10px;border-radius:8px;border:1px solid #e24b4a;background:none;color:#e24b4a;font-size:12px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">삭제</button>
      </div>`).join('');
  }

  function updatePilatesScheduleField(idx, field, value) {
    if (!_pgSchedule[_pgActiveDay][idx]) return;
    _pgSchedule[_pgActiveDay][idx][field] = field === 'capacity' ? (parseInt(value) || 0) : value;
  }
  window.updatePilatesScheduleField = updatePilatesScheduleField;

  function addPilatesScheduleRow() {
    if (!_pgSchedule[_pgActiveDay]) _pgSchedule[_pgActiveDay] = [];
    _pgSchedule[_pgActiveDay].push({ time: '', capacity: 5 });
    renderPilatesDayTabs();
    renderPilatesScheduleRows();
  }
  window.addPilatesScheduleRow = addPilatesScheduleRow;

  function removePilatesScheduleRow(idx) {
    _pgSchedule[_pgActiveDay].splice(idx, 1);
    renderPilatesDayTabs();
    renderPilatesScheduleRows();
  }
  window.removePilatesScheduleRow = removePilatesScheduleRow;

  function savePilatesScheduleDay() {
    const rows = (_pgSchedule[_pgActiveDay] || []).filter(r => r.time);
    if (rows.some(r => !r.capacity || r.capacity < 1)) {
      showToast('정원은 1명 이상으로 입력해주세요.', 'error'); return;
    }
    rows.sort((a, b) => a.time.localeCompare(b.time));

    const newTimes = new Set(rows.map(r => r.time));
    const originalTimes = ((_pgOriginalSchedule && _pgOriginalSchedule[_pgActiveDay]) || []).map(r => r.time);
    const removedTimes = originalTimes.filter(t => !newTimes.has(t));

    if (removedTimes.length) {
      _checkPilatesRemovedTimesHaveBookings(_pgActiveDay, removedTimes).then(hasBookings => {
        if (hasBookings) {
          showConfirm('삭제하려는 시간에 이미 예약된 회원이 있어요. 그래도 저장할까요?\n(기존 예약 기록은 "예약현황"에서 계속 확인·취소할 수 있어요)', () => _doSavePilatesScheduleDay(rows));
        } else {
          _doSavePilatesScheduleDay(rows);
        }
      });
    } else {
      _doSavePilatesScheduleDay(rows);
    }
  }
  window.savePilatesScheduleDay = savePilatesScheduleDay;

  function _doSavePilatesScheduleDay(rows) {
    _pgSchedule[_pgActiveDay] = rows;
    db.ref('pilates_settings/weeklySchedule/' + _pgActiveDay).set(rows).then(() => {
      showToast('✅ ' + PG_DAY_LABELS[_pgActiveDay] + '요일 시간표가 저장됐어요!', 'success');
      if (!_pgOriginalSchedule) _pgOriginalSchedule = {};
      _pgOriginalSchedule[_pgActiveDay] = JSON.parse(JSON.stringify(rows));
      renderPilatesDayTabs();
      renderPilatesScheduleRows();
      loadPilatesSchedulePreview();
    });
  }

  // 삭제하려는 시간대에 오늘 이후 실제 예약(인원 1명 이상)이 있는지 확인
  function _checkPilatesRemovedTimesHaveBookings(dayKey, removedTimes) {
    const todayStr = _pgTodayISO();
    return db.ref('pilates_classes').once('value').then(snap => {
      let found = false;
      snap.forEach(child => {
        const cls = child.val();
        if (!cls || !cls.date || !cls.time || cls.date < todayStr) return;
        const ck = PG_WEEKDAY_BY_INDEX[new Date(cls.date + 'T00:00:00').getDay()];
        if (ck === dayKey && removedTimes.includes(cls.time) && cls.bookings && Object.keys(cls.bookings).length) {
          found = true;
        }
      });
      return found;
    });
  }

  // 다가오는 수업 미리보기 (시간표 + 휴무예외를 조합해서 실제 회원 화면처럼 계산)
  function loadPilatesSchedulePreview() {
    const el = document.getElementById('pg-preview-list');
    if (!el) return;
    Promise.all([
      db.ref('pilates_settings/bookingWindowMonths').once('value'),
      db.ref('pilates_exceptions').once('value')
    ]).then(([winSnap, excSnap]) => {
      const windowMonths = winSnap.val() != null ? winSnap.val() : 1;
      const todayD = new Date();
      // 이번달은 항상 오픈 + windowMonths개월 뒤까지 → 그 달의 마지막 날짜가 예약 가능 마지막 날
      const windowEndD = new Date(todayD.getFullYear(), todayD.getMonth() + windowMonths + 1, 0);
      const todayOnly = new Date(todayD.getFullYear(), todayD.getMonth(), todayD.getDate());
      const totalDays = Math.round((windowEndD - todayOnly) / 86400000) + 1;
      const exceptions = excSnap.val() || {};
      const dayKeyByIndex = ['sun','mon','tue','wed','thu','fri','sat'];
      const items = [];
      for (let i = 0; i < totalDays; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const dateStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
        const dayKey = dayKeyByIndex[d.getDay()];
        const slots = _pgSchedule[dayKey] || [];
        const exc = exceptions[dateStr] || {};
        if (exc.fullClosed) {
          if (slots.length) items.push({ dateStr, dayKey, closed: true, label: '전체 휴무' });
          continue;
        }
        slots.forEach(s => {
          const timeClosed = exc.closedTimes && exc.closedTimes[s.time];
          items.push({ dateStr, dayKey, time: s.time, capacity: s.capacity, closed: !!timeClosed });
        });
      }
      if (!items.length) {
        el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:13px;">예약 가능 기간 내에 열리는 수업이 없어요</div>';
        return;
      }
      // 날짜별로 묶기
      const groups = [];
      let lastDate = null;
      items.forEach(it => {
        if (it.dateStr !== lastDate) {
          groups.push({ dateStr: it.dateStr, dayKey: it.dayKey, rows: [] });
          lastDate = it.dateStr;
        }
        groups[groups.length - 1].rows.push(it);
      });
      el.innerHTML = groups.map(g => `
        <div style="margin-bottom:12px;">
          <div style="font-size:12.5px;font-weight:700;color:var(--text-sub);background:var(--bg);border-radius:8px;padding:6px 10px;margin-bottom:4px;">
            ${g.dateStr} (${PG_DAY_LABELS[g.dayKey]})
          </div>
          ${g.rows.map(it => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-bottom:1px solid var(--border);${it.closed ? 'opacity:0.5;' : ''}">
              <div style="font-size:12.5px;color:var(--text);">${it.time || ''}</div>
              <div style="font-size:12px;color:${it.closed ? '#e24b4a' : 'var(--text-hint)'};">${it.closed ? (it.label || '휴무') : '정원 ' + it.capacity + '명'}</div>
            </div>`).join('')}
        </div>`).join('');
    });
  }

  // ── 🚫 휴무관리 ──
  function loadPilatesExceptionList() {
    const el = document.getElementById('pge-list');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:13px;">불러오는 중...</div>';
    db.ref('pilates_exceptions').once('value').then(snap => {
      const list = [];
      snap.forEach(child => list.push({ date: child.key, val: child.val() }));
      list.sort((a, b) => a.date.localeCompare(b.date));
      if (!list.length) {
        el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:13px;">등록된 휴무가 없어요</div>';
        return;
      }
      el.innerHTML = list.map(item => {
        const rows = [];
        if (item.val.fullClosed) {
          rows.push(`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
              <span style="font-size:13px;color:var(--text);">${item.date} · <span style="color:#e24b4a;font-weight:700;">전체 휴무</span></span>
              <button onclick="removePilatesFullClosed('${item.date}')" style="padding:5px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:11px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">복구</button>
            </div>`);
        }
        if (item.val.closedTimes) {
          Object.keys(item.val.closedTimes).forEach(t => {
            rows.push(`
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
                <span style="font-size:13px;color:var(--text);">${item.date} ${t} · <span style="color:#e24b4a;font-weight:700;">닫힘</span></span>
                <button onclick="removePilatesTimeClosed('${item.date}','${t}')" style="padding:5px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:11px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">복구</button>
              </div>`);
          });
        }
        return rows.join('<div style="border-bottom:1px solid var(--border);"></div>');
      }).join('');
    });
  }
  window.loadPilatesExceptionList = loadPilatesExceptionList;

  function setPilatesFullClosed() {
    const date = _pgeSelectedDate;
    if (!date) { showToast('날짜를 선택해주세요.', 'error'); return; }
    showConfirm(date + ' 전체를 휴무로 설정할까요?', () => {
      db.ref('pilates_exceptions/' + date + '/fullClosed').set(true).then(() => {
        showToast('✅ 휴무로 설정됐어요.', 'success');
        loadPilatesExceptionList();
      });
    });
  }
  window.setPilatesFullClosed = setPilatesFullClosed;

  function setPilatesTimeClosed() {
    const date = _pgeSelectedDate;
    const time = document.getElementById('pge-time').value;
    if (!date) { showToast('날짜를 선택해주세요.', 'error'); return; }
    if (!time) { showToast('시간을 선택해주세요.', 'error'); return; }
    db.ref('pilates_exceptions/' + date + '/closedTimes/' + time).set(true).then(() => {
      showToast('✅ 해당 시간대가 닫혔어요.', 'success');
      loadPilatesExceptionList();
    });
  }
  window.setPilatesTimeClosed = setPilatesTimeClosed;

  function removePilatesFullClosed(date) {
    db.ref('pilates_exceptions/' + date + '/fullClosed').remove().then(() => {
      showToast('복구됐어요.', 'success');
      loadPilatesExceptionList();
    });
  }
  window.removePilatesFullClosed = removePilatesFullClosed;

  function removePilatesTimeClosed(date, time) {
    db.ref('pilates_exceptions/' + date + '/closedTimes/' + time).remove().then(() => {
      showToast('복구됐어요.', 'success');
      loadPilatesExceptionList();
    });
  }
  window.removePilatesTimeClosed = removePilatesTimeClosed;

  // ── ⚙️ 설정: 예약 가능 기간 + 예약/취소 마감 시간 + 잔여횟수 차감 방식 ──
  // pilates_settings/{bookingWindowMonths, bookingCutoffHours, cancelCutoffHours, deductMode} 값은
  // 3단계(회원 예약 기능) 구현 시 참조 예정
  function loadPilatesSettings() {
    db.ref('pilates_settings').once('value').then(snap => {
      const s = snap.val() || {};
      const winEl    = document.getElementById('pgs-window-months');
      const bookEl   = document.getElementById('pgs-booking-cutoff');
      const cancelEl = document.getElementById('pgs-cancel-cutoff');
      if (winEl)    winEl.value    = s.bookingWindowMonths != null ? s.bookingWindowMonths : 1;
      if (bookEl)   bookEl.value   = s.bookingCutoffHours != null ? s.bookingCutoffHours : 4;
      if (cancelEl) cancelEl.value = s.cancelCutoffHours  != null ? s.cancelCutoffHours  : 24;
      renderPilatesDeductButtons(s.deductMode || 'auto');
    });
  }
  window.loadPilatesSettings = loadPilatesSettings;

  function savePilatesTimingSettings() {
    const windowMonths  = parseInt(document.getElementById('pgs-window-months').value);
    const bookingCutoff = parseInt(document.getElementById('pgs-booking-cutoff').value);
    const cancelCutoff  = parseInt(document.getElementById('pgs-cancel-cutoff').value);
    if (isNaN(windowMonths) || windowMonths < 0) { showToast('예약 가능 개월수는 0 이상으로 입력해주세요.', 'error'); return; }
    if (isNaN(bookingCutoff) || bookingCutoff < 0) { showToast('예약 마감 시간을 정확히 입력해주세요.', 'error'); return; }
    if (isNaN(cancelCutoff) || cancelCutoff < 0)  { showToast('취소 마감 시간을 정확히 입력해주세요.', 'error'); return; }
    db.ref('pilates_settings').update({
      bookingWindowMonths: windowMonths,
      bookingCutoffHours: bookingCutoff,
      cancelCutoffHours: cancelCutoff
    }).then(() => {
      showToast('✅ 저장됐어요!', 'success');
    });
  }
  window.savePilatesTimingSettings = savePilatesTimingSettings;

  function renderPilatesDeductButtons(mode) {
    const autoBtn   = document.getElementById('pgs-deduct-auto');
    const manualBtn = document.getElementById('pgs-deduct-manual');
    [[autoBtn, 'auto'], [manualBtn, 'manual']].forEach(([btn, key]) => {
      if (!btn) return;
      const isActive = mode === key;
      btn.style.background = isActive ? 'var(--blue)' : 'var(--card)';
      btn.style.color      = isActive ? 'white'       : 'var(--text)';
      btn.style.border     = isActive ? 'none'        : '1.5px solid var(--border)';
    });
  }

  function setPilatesDeductMode(mode) {
    db.ref('pilates_settings/deductMode').set(mode).then(() => {
      renderPilatesDeductButtons(mode);
      showToast('✅ 저장됐어요!', 'success');
    });
  }
  window.setPilatesDeductMode = setPilatesDeductMode;


  function onPilatesGroupSearchInput() {
    const q = document.getElementById('pg-search').value.trim();
    const resultEl = document.getElementById('pg-search-result');
    if (!q || !_pgMembersCache) { resultEl.style.display = 'none'; return; }
    const filtered = _pgMembersCache.filter(m => m.name.includes(q) || m.id.includes(q)).slice(0, 8);
    if (filtered.length === 0) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = '<div style="padding:10px 12px;font-size:13px;color:var(--text-hint);">검색 결과가 없어요</div>';
      return;
    }
    resultEl.style.display = 'block';
    resultEl.innerHTML = filtered.map(m => `
      <div onclick="selectPilatesGroupMember('${m.id}','${m.name}')"
        style="padding:10px 12px;font-size:13px;color:var(--text);cursor:pointer;border-bottom:1px solid var(--border);">
        <span style="font-weight:600;">${m.name}</span>
        <span style="color:var(--text-hint);font-size:11px;margin-left:6px;">${m.id}</span>
      </div>`).join('');
  }
  window.onPilatesGroupSearchInput = onPilatesGroupSearchInput;

  // 오늘 예약한 회원 목록 — 시간/이름/잔여·전체횟수 표시, 누르면 바로 수정폼(selectPilatesGroupMember 재사용)
  function loadPilatesTodayBookings() {
    const el = document.getElementById('pg-today-bookings');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-hint);font-size:13px;">불러오는 중...</div>';
    const dateKey = _pgTodayISO().replace(/-/g, '');
    db.ref('pilates_classes').orderByKey().startAt(dateKey + '_').endAt(dateKey + '_\uf8ff').once('value').then(snap => {
      const rows = [];
      snap.forEach(child => {
        const cls = child.val();
        if (cls && cls.bookings) {
          Object.keys(cls.bookings).forEach(uid => {
            rows.push({ uid, name: cls.bookings[uid].name || uid, time: cls.time });
          });
        }
      });
      rows.sort((a, b) => a.time.localeCompare(b.time));
      if (!rows.length) {
        el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-hint);font-size:13px;">오늘 예약한 회원이 없어요</div>';
        return;
      }
      Promise.all(rows.map(r => db.ref('pilates_group/' + r.uid).once('value'))).then(snaps => {
        el.innerHTML = rows.map((r, i) => {
          const pg = snaps[i].val() || { total: 0, remain: 0 };
          return `
            <div onclick="selectPilatesGroupMember('${r.uid}','${r.name}')"
              style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;">
              <div>
                <span style="font-size:12.5px;font-weight:700;color:var(--text);">${r.time}</span>
                <span style="font-size:12.5px;color:var(--text);margin-left:8px;">${r.name}</span>
              </div>
              <span style="font-size:12px;color:var(--text-hint);">잔여 ${pg.remain || 0} · 전체 ${pg.total || 0}회</span>
            </div>`;
        }).join('');
      });
    });
  }
  window.loadPilatesTodayBookings = loadPilatesTodayBookings;

  function selectPilatesGroupMember(phone, name) {
    document.getElementById('pg-search-result').style.display = 'none';
    document.getElementById('pg-search').value = name;
    db.ref('pilates_group/' + phone).once('value').then(snap => {
      const pg = snap.val() || { total: 0, remain: 0 };
      const wrap = document.getElementById('pg-selected-wrap');
      wrap.innerHTML = `
        <div style="background:var(--bg);border-radius:10px;padding:14px;">
          <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:10px;">✅ ${name} (${phone})</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
            <div>
              <div style="font-size:11px;color:var(--text-hint);margin-bottom:4px;">잔여 횟수</div>
              <input id="pg-edit-remain" type="number" value="${pg.remain || 0}"
                style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:'Noto Sans KR',sans-serif;">
            </div>
            <div>
              <div style="font-size:11px;color:var(--text-hint);margin-bottom:4px;">전체 횟수</div>
              <input id="pg-edit-total" type="number" value="${pg.total || 0}"
                style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:'Noto Sans KR',sans-serif;">
            </div>
          </div>
          <button onclick="savePilatesGroupCount('${phone}','${name}')"
            style="width:100%;padding:11px;background:var(--blue);color:white;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">저장</button>
        </div>`;
    });
  }
  window.selectPilatesGroupMember = selectPilatesGroupMember;

  function savePilatesGroupCount(phone, name) {
    const total  = parseInt(document.getElementById('pg-edit-total').value);
    const remain = parseInt(document.getElementById('pg-edit-remain').value);
    if (isNaN(total) || isNaN(remain)) { showToast('숫자를 정확히 입력해주세요.', 'error'); return; }
    db.ref('pilates_group/' + phone).set({ total, remain, updatedAt: Date.now() }).then(() => {
      showToast('✅ ' + name + '님 그룹필라테스 잔여횟수가 저장됐어요!', 'success');
      loadPilatesTodayBookings();
    });
  }
  window.savePilatesGroupCount = savePilatesGroupCount;

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
            <div style="font-size:12px;color:var(--text-hint);margin-bottom:6px;">잔여 횟수</div>
            <input id="admin-edit-remain" type="number" value="${info.remain || ''}"
              style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:'Noto Sans KR',sans-serif;background:var(--bg);color:var(--text);margin-bottom:12px;outline:none;">
            <div style="font-size:12px;color:var(--text-hint);margin-bottom:6px;">전체 횟수</div>
            <input id="admin-edit-total" type="number" value="${info.total || ''}"
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

    // 오늘 그룹수업 로드 (기구필라테스, 강사 무관하게 전체 표시)
    loadTrainerPilatesToday();

    // 담당 회원 현황 로드
    loadTrainerHomeStats(trainerId);

    // 공지사항
    loadHomeNotices('trainer-notice-container');
  }

  // 오늘 그룹수업 (강사홈) — 시간표+휴무 반영, 시간대별 예약인원 표시, 눌러서 명단 펼치기
  let _thPgtNames = {}; // classId -> 예약자 명단 텍스트 (칩 클릭 시 하단에 표시)

  function loadTrainerPilatesToday() {
    const chipsEl = document.getElementById('th-pilates-today-chips');
    const namesEl = document.getElementById('th-pilates-today-names');
    if (!chipsEl) return;
    namesEl.style.display = 'none';
    chipsEl.innerHTML = '<div style="flex-shrink:0;color:var(--text-hint);font-size:13px;padding:6px 0;">불러오는 중...</div>';
    const dateStr = _pgTodayISO();
    const d = new Date(dateStr + 'T00:00:00');
    const dayKey = PG_WEEKDAY_BY_INDEX[d.getDay()];
    Promise.all([
      db.ref('pilates_settings').once('value'),
      db.ref('pilates_exceptions/' + dateStr).once('value')
    ]).then(([setSnap, excSnap]) => {
      const s = setSnap.val() || {};
      const sched = s.weeklySchedule || {};
      const slots = Array.isArray(sched[dayKey]) ? sched[dayKey] : (sched[dayKey] ? Object.values(sched[dayKey]) : []);
      const exc = excSnap.val() || {};
      if (exc.fullClosed) {
        chipsEl.innerHTML = '<div style="flex-shrink:0;color:#e24b4a;font-size:13px;padding:6px 0;">오늘은 휴무예요</div>';
        return;
      }
      if (!slots.length) {
        chipsEl.innerHTML = '<div style="flex-shrink:0;color:var(--text-hint);font-size:13px;padding:6px 0;">오늘 열리는 그룹수업이 없어요</div>';
        return;
      }
      Promise.all(slots.map(sl => db.ref('pilates_classes/' + _pgClassId(dateStr, sl.time)).once('value'))).then(snaps => {
        _thPgtNames = {};
        chipsEl.innerHTML = slots.map((sl, i) => {
          const classId = _pgClassId(dateStr, sl.time);
          const cls = snaps[i].val();
          const bookings = cls && cls.bookings ? cls.bookings : {};
          const names = Object.values(bookings).map(b => b.name).join(', ');
          const timeClosed = exc.closedTimes && exc.closedTimes[sl.time];
          _thPgtNames[classId] = (timeClosed ? '휴무' : '') + (names || '예약자 없음');
          return `
            <div onclick="toggleTrainerPilatesSlot('${classId}')" id="th-pgt-chip-${classId}"
              style="flex-shrink:0;background:#E6F1FB;border-radius:20px;padding:6px 12px;display:flex;align-items:center;gap:6px;cursor:pointer;">
              <span style="font-size:11px;font-weight:700;color:#185FA5;">${sl.time}${timeClosed ? ' (닫힘)' : ''}</span>
              <span style="font-size:11px;color:#0C447C;">${Object.keys(bookings).length}/${sl.capacity}명</span>
            </div>`;
        }).join('');
      });
    });
  }
  window.loadTrainerPilatesToday = loadTrainerPilatesToday;

  function toggleTrainerPilatesSlot(classId) {
    const namesEl = document.getElementById('th-pilates-today-names');
    if (!namesEl) return;
    const isOpen = namesEl.dataset.openId === classId && namesEl.style.display !== 'none';
    if (isOpen) {
      namesEl.style.display = 'none';
      namesEl.dataset.openId = '';
    } else {
      namesEl.textContent = _thPgtNames[classId] || '';
      namesEl.style.display = 'block';
      namesEl.dataset.openId = classId;
    }
  }
  window.toggleTrainerPilatesSlot = toggleTrainerPilatesSlot;

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

// 휴회 자동해제 + 회원의 유효한 프로그램이 하나라도 있는지 확인 (만료회원 출석 차단용)
async function _resolveHoldsAndCheckEligibility(phone) {
  const todayISO = _isoDate(new Date());
  const snap = await db.ref('contracts/' + phone).once('value');
  const contracts = snap.val() || {};
  const updates = {};
  let resolvedMsg = '';
  let hasEligible = false;

  Object.entries(contracts).forEach(([contractKey, c]) => {
    const items = _flattenContractItems(c);
    items.forEach(it => {
      const basePath = it.pkgIndex === null
        ? 'contracts/' + phone + '/' + contractKey + '/programs/' + it.progKey
        : 'contracts/' + phone + '/' + contractKey + '/packages/' + it.pkgIndex + '/items/' + it.progKey;
      let data = it.data;

      // 휴회중인데 출석함 → "실제로 쉰 날수"만큼만 휴회 인정하고 자동해제 (단, 계획된 휴회일수를 넘지는 않음 — 늦게 와도 그 이상 늘어나지 않음)
      if (data.activeHold) {
        const hold = data.activeHold;
        const rawDays = Math.max(0, _dateDiffDays(todayISO, hold.startDate));
        const actualDays = Math.min(hold.days, rawDays);
        let newEnd;
        if (actualDays <= 0) {
          newEnd = hold.prevEndDate; // 휴회 시작일 당일/이전 출석 → 휴회 전 원래 종료일로 완전복구
        } else if (actualDays >= hold.days) {
          newEnd = hold.newEndDate; // 예정된 휴회기간을 다 썼거나 그 이후에 옴 → 원래 계획했던 종료일 그대로
        } else {
          const d = new Date(hold.prevEndDate);
          d.setDate(d.getDate() + actualDays);
          newEnd = _isoDate(d);
        }
        updates[basePath + '/endDate'] = newEnd;
        updates[basePath + '/activeHold'] = null;
        updates[basePath + '/holdHistory/' + (hold.key || String(Date.now()))] = {
          startDate: hold.startDate, plannedDays: hold.days, actualDays,
          prevEndDate: hold.prevEndDate, resolvedEndDate: newEnd,
          createdAt: hold.processedAt, resolvedAt: Date.now()
        };
        data = Object.assign({}, data, { endDate: newEnd, activeHold: null });
        resolvedMsg = '⏸️ 휴회가 해제됐어요 (실제 ' + actualDays + '일 휴회)';
      }

      if (!_isItemEligible(data)) return; // 환불/양도/변경 등으로 이미 끝난 항목은 제외
      if (!data.endDate || data.endDate >= todayISO) hasEligible = true; // 사용기한 안 지났으면 유효
    });
  });

  if (Object.keys(updates).length) {
    await db.ref().update(updates);
  }
  return { hasEligible, resolvedMsg };
}

async function _kioskCheckIn(phone) {
  // getToday()와 동일한 unpadded 형식 사용 (예: 2026-6-9) — 출석기록 키 형식은 그대로 유지
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
    // 휴회 자동해제 + 이용가능한 프로그램이 하나라도 있는지 확인 (만료회원 출석 차단)
    const { hasEligible, resolvedMsg } = await _resolveHoldsAndCheckEligibility(phone);
    if (!hasEligible) {
      _kioskShowResult('fail', '이용기간이 끝났어요', '등록 후 다시 이용해주세요');
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
    const msg2 = resolvedMsg ? (resolvedMsg + ' · 출석 완료! +' + pts + 'P 적립') : ('출석 완료! +' + pts + 'P 적립');
    _kioskShowResult('success', nick + '님', msg2, member.name.slice(0, 1));
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
