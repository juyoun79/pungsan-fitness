  // ── XSS 방어: HTML 특수문자 이스케이프 ──
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  // ── 커뮤니티 전역 변수 ──
  let adminAllPosts = [];
  let adminCommunityCategory = '전체';
  let adminCommunityQuery = '';

  function getTimeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1)  return '방금 전';
    if (m < 60) return m + '분 전';
    if (h < 24) return h + '시간 전';
    if (d < 7)  return d + '일 전';
    return new Date(ts).toLocaleDateString('ko-KR');
  }

  // ══════════════════════════════════════════
  // 알림 시스템 (완전 재작성)
  // ══════════════════════════════════════════

  let _notifRef = null;
  let _notifListener = null;

  // 1. 댓글/답글 작성 시 알림 저장
  function saveCommentNotification(postId, comment) {
    const writerId = comment.authorId;
    console.log('🔔 saveCommentNotification 실행:', postId, writerId);
    if (!writerId || !postId) { console.log('❌ writerId 또는 postId 없음'); return; }

    // 이름 마스킹 (인라인)
    const rawName = comment.nickname || '회원';
    let displayName = rawName;
    const m = rawName.match(/^(.+?)(\(\d+\))?$/);
    if (m) {
      const np = m[1]; const num = m[2] || '';
      if (np.length === 2) displayName = np[0] + '*' + num;
      else if (np.length > 2) displayName = np[0] + '*'.repeat(np.length-2) + np[np.length-1] + num;
    }

    // 게시글 작성자 알림
    db.ref('posts/' + postId).once('value').then(snap => {
      if (!snap.exists()) { console.log('❌ 게시글 없음'); return; }
      const post = snap.val();
      const postOwnerId = post.authorId || post.userId;
      console.log('📌 게시글 작성자:', postOwnerId, '댓글 작성자:', writerId);

      if (postOwnerId && postOwnerId !== writerId) {
        console.log('✅ 알림 저장 시도 →', postOwnerId);
        db.ref('notifications/' + postOwnerId).push({
          type: 'comment',
          postId: postId,
          postTitle: (post.content || '').substring(0, 30),
          writerName: displayName,
          createdAt: Date.now(),
          read: false
        }).then(() => console.log('✅ 알림 저장 완료'))
          .catch(e => console.log('❌ 알림 저장 실패:', e));
        // 댓글 푸시알림
        if (typeof sendPushToUser === 'function') {
          sendPushToUser(postOwnerId, '💬 댓글', displayName + '님이 내 게시글에 댓글을 달았어요', 'comment', { type: 'comment', postId: postId });
        }
      } else {
        console.log('⚠️ 본인 게시글이라 알림 없음');
      }

      if (comment.replyTo) {
        db.ref('comments/' + postId + '/' + comment.replyTo).once('value').then(cSnap => {
          if (!cSnap.exists()) return;
          const orig = cSnap.val();
          const origOwnerId = orig.authorId || orig.userId;
          // 답글 알림: 원댓글 작성자가 댓글 작성자도 아니고, 게시물 작성자와 다른 경우에만
          // 게시물 작성자와 같으면 이미 위에서 comment 알림을 받았으므로 중복 방지
          if (origOwnerId && origOwnerId !== writerId && origOwnerId !== postOwnerId) {
            console.log('✅ 답글 알림 저장 →', origOwnerId);
            db.ref('notifications/' + origOwnerId).push({
              type: 'reply',
              postId: postId,
              postTitle: (post.content || '').substring(0, 30),
              writerName: displayName,
              createdAt: Date.now(),
              read: false
            });
            // 답글 푸시알림
            if (typeof sendPushToUser === 'function') {
              sendPushToUser(origOwnerId, '💬 답글', displayName + '님이 내 댓글에 답글을 달았어요', 'comment', { type: 'reply', postId: postId });
            }
          } else if (origOwnerId && origOwnerId !== writerId && origOwnerId === postOwnerId) {
            // 게시물 작성자 = 원댓글 작성자인 경우: 게시물 알림 대신 답글 알림으로 저장
            // (이미 위에서 comment 알림이 저장됐으므로 추가 저장 안 함)
            console.log('⚠️ 게시물 작성자 = 원댓글 작성자 중복 방지');
          }
        });
      }
    });
  }

  // 2-0. 삭제된 게시물 알림 정리
  function cleanupOrphanNotifs(userId) {
    db.ref('notifications/' + userId).once('value', snap => {
      const toCheck = [];
      snap.forEach(notifSnap => {
        toCheck.push({ key: notifSnap.key, postId: notifSnap.val().postId });
      });
      toCheck.forEach(item => {
        if (!item.postId) {
          db.ref('notifications/' + userId + '/' + item.key).remove();
          return;
        }
        db.ref('posts/' + item.postId).once('value', postSnap => {
          if (!postSnap.exists()) {
            db.ref('notifications/' + userId + '/' + item.key).remove();
          }
        });
      });
    });
  }

  // 2. 실시간 알림 리스너 시작 (로그인 시 1번만 등록)
  function startNotifListener() {
    const userId = localStorage.getItem('current_user');
    if (!userId || userId === ADMIN_ID) return;

    // 기존 리스너 해제
    if (_notifRef && _notifListener) {
      _notifRef.off('value', _notifListener);
      _notifRef = null;
      _notifListener = null;
    }

    _notifRef = db.ref('notifications/' + userId);
    _notifListener = _notifRef.on('value', snap => {
      try {
        console.log('🔔 알림 리스너 콜백 실행, 개수:', snap.numChildren());
        const notifs = [];
        snap.forEach(child => { notifs.push({ id: child.key, ...child.val() }); });
        notifs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const unread = notifs.filter(n => !n.read);

        // 탭바 배지 업데이트 (항상 실행)
        const badge = document.getElementById('community-badge');
        if (badge) {
          badge.style.display = unread.length > 0 ? 'block' : 'none';
          badge.textContent = unread.length > 9 ? '9+' : String(unread.length);
          console.log('🔔 배지 업데이트:', unread.length);
        } else {
          console.log('🔔 배지 요소 없음');
        }

        // 캐시 저장 (전체 목록 + 팝업용)
        window._cachedAllNotifList = notifs;
        window._cachedUnreadCount = unread.length;

        // 벨 배지 업데이트
        const bellBadge = document.getElementById('bell-badge');
        if (bellBadge) {
          if (unread.length > 0) {
            bellBadge.style.display = 'block';
            bellBadge.textContent = unread.length > 9 ? '9+' : String(unread.length);
          } else {
            bellBadge.style.display = 'none';
          }
        }

        // 팝업이 열려있으면 실시간 업데이트
        const popup = document.getElementById('notif-popup');
        if (popup && popup.style.display !== 'none') {
          _renderNotifPopup();
        }
      } catch(e) {
        console.error('알림 렌더링 오류:', e);
      }
    });
  }

  // 3-0. 내부 DOM 렌더링 (display:none 상태에서도 강제 렌더링)
  function _renderNotifToDOM(showList) {
    const wrap = document.getElementById('home-notifications-wrap');
    const el   = document.getElementById('home-notifications-list');
    if (!wrap || !el) {
      console.log('🔔 wrap/el 요소 자체가 없음');
      return;
    }
    if (!showList || showList.length === 0) {
      wrap.style.display = 'none';
      console.log('🔔 표시할 알림 없음');
      return;
    }
    // display:none이어도 innerHTML은 업데이트 가능
    el.innerHTML = showList.map(n => {
      const isNew  = !n.read;
      const text   = n.type === 'reply' ? '내 댓글에 답글을 달았어요' : n.type === 'like' ? '내 게시글을 좋아합니다 ❤️' : '내 게시글에 댓글을 달았어요';
      const border = isNew ? '#1a6fd4' : 'var(--border)';
      const dot    = isNew ? '#ef4444' : 'transparent';
      const fw     = isNew ? '700' : '500';
      const time   = getTimeAgo(n.createdAt);
      return `<div onclick="goToPost('${n.id}','${n.postId}')"
        style="background:var(--card);border:1px solid ${border};border-radius:var(--radius-sm);padding:9px 12px;margin-bottom:6px;cursor:pointer;display:flex;align-items:center;gap:8px;">
        <div style="width:7px;height:7px;border-radius:50%;background:${dot};flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:${fw};color:var(--text);"><span style="color:var(--blue);">${n.writerName||'회원'}</span>님이 ${text}</div>
          <div style="font-size:11px;color:var(--text-hint);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${n.postTitle||''}...</div>
          <div style="font-size:10px;color:var(--text-hint);margin-top:1px;">${time}</div>
        </div>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`;
    }).join('');
    wrap.style.display = 'block';
    console.log('🔔 알림 카드 렌더링 완료:', showList.length, '개');
  }

  // 3. 알림 카드 렌더링
  function renderNotifCards(list) {
    const wrap = document.getElementById('home-notifications-wrap');
    const el   = document.getElementById('home-notifications-list');
    if (!wrap || !el) return;
    if (!list || list.length === 0) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    el.innerHTML = list.map(n => {
      const isNew  = !n.read;
      const text   = n.type === 'reply' ? '내 댓글에 답글을 달았어요' : n.type === 'like' ? '내 게시글을 좋아합니다 ❤️' : '내 게시글에 댓글을 달았어요';
      const border = isNew ? '#1a6fd4' : 'var(--border)';
      const dot    = isNew ? '#ef4444' : 'transparent';
      const fw     = isNew ? '700' : '500';
      const time   = getTimeAgo(n.createdAt);
      return `<div onclick="goToPost('${n.id}','${n.postId}')"
        style="background:var(--card);border:1px solid ${border};border-radius:var(--radius-sm);padding:9px 12px;margin-bottom:6px;cursor:pointer;display:flex;align-items:center;gap:8px;">
        <div style="width:7px;height:7px;border-radius:50%;background:${dot};flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:${fw};color:var(--text);"><span style="color:var(--blue);">${n.writerName||'회원'}</span>님이 ${text}</div>
          <div style="font-size:11px;color:var(--text-hint);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${n.postTitle||''}...</div>
          <div style="font-size:10px;color:var(--text-hint);margin-top:1px;">${time}</div>
        </div>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`;
    }).join('');
  }

  // 4. 알림 클릭 → 해당 게시글로 이동 + 읽음 처리
  function goToPost(notifId, postId) {
    const userId = localStorage.getItem('current_user');
    // 게시물 존재 여부 먼저 확인
    db.ref('posts/' + postId).once('value', snap => {
      if (!snap.exists()) {
        showToast('삭제된 게시글이에요.', 'info');
        // 알림도 삭제
        if (notifId && userId) {
          db.ref('notifications/' + userId + '/' + notifId).remove();
        }
        return;
      }
      if (notifId && userId) {
        db.ref('notifications/' + userId + '/' + notifId + '/read').set(true);
      }
      closeNotifPopup();
      switchTab('community');
      setTimeout(() => openCommentModal(postId, ''), 600);
    });
  }

  // 5. 모두 읽음
  // 알림 팝업 열기
  function openNotifPopup() {
    const popup = document.getElementById('notif-popup');
    if (!popup) return;
    popup.style.display = 'block';
    // 현재 캐시된 알림 전체 목록 렌더링
    _renderNotifPopup();
  }

  // 알림 팝업 닫기
  function closeNotifPopup() {
    const popup = document.getElementById('notif-popup');
    if (popup) popup.style.display = 'none';
  }

  // 팝업 알림 목록 렌더링
  function _renderNotifPopup() {
    const el = document.getElementById('notif-popup-list');
    if (!el) return;
    const list = window._cachedAllNotifList || [];
    if (list.length === 0) {
      el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-hint);font-size:13px;">새 알림이 없어요</div>';
      return;
    }
    el.innerHTML = list.map(n => {
      const isNew  = !n.read;
      const text   = n.type === 'reply' ? '내 댓글에 답글을 달았어요' : n.type === 'like' ? '내 게시글을 좋아합니다 ❤️' : '내 게시글에 댓글을 달았어요';
      const bg     = isNew ? 'rgba(26,111,212,0.07)' : 'var(--card)';
      const dot    = isNew ? '#ef4444' : 'transparent';
      const fw     = isNew ? '700' : '500';
      const time   = getTimeAgo(n.createdAt);
      return `<div onclick="goToPost('${n.id}','${n.postId}')"
        style="background:${bg};border-radius:var(--radius-sm);padding:11px 12px;margin-bottom:8px;cursor:pointer;display:flex;align-items:center;gap:10px;border:1px solid var(--border);">
        <div style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:${fw};color:var(--text);"><span style="color:var(--blue);">${n.writerName||'회원'}</span>님이 ${text}</div>
          <div style="font-size:11px;color:var(--text-hint);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${n.postTitle||''}</div>
          <div style="font-size:11px;color:var(--text-hint);margin-top:2px;">${time}</div>
        </div>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-hint)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`;
    }).join('');
  }

  function clearAllNotifications() {
    const userId = localStorage.getItem('current_user');
    if (!userId) return;
    db.ref('notifications/' + userId).once('value', snap => {
      const updates = {};
      snap.forEach(child => { updates[child.key + '/read'] = true; });
      if (Object.keys(updates).length > 0) {
        db.ref('notifications/' + userId).update(updates);
      }
    });
  }

  // 6. 하위 호환 - loadNotifications 는 startNotifListener 호출
  function loadNotifications() { startNotifListener(); }

  function loadAdminCommunityFeed(cat) {
    adminCommunityCategory = cat;
    const feedEl = document.getElementById('admin-community-feed');
    if (!feedEl) return;
    feedEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:13px;">⏳ 불러오는 중...</div>';
    // 관리자 커뮤니티 챌린지 핀 로드
    loadAdminCommunityChallengePins();

    // 회원 + 강사 실명 모두 캐싱 후 게시물 로드
    Promise.all([
      db.ref('members').once('value'),
      db.ref('users').once('value')
    ]).then(([memberSnap, userSnap]) => {
      window.memberCache = {};
      // 일반 회원
      memberSnap.forEach(child => {
        window.memberCache[child.key] = child.val().name || '';
        if (child.val().role) localStorage.setItem('role_' + child.key, child.val().role);
      });
      // 강사/매니저 (users DB에서)
      userSnap.forEach(child => {
        const role = child.val().role;
        if ((role === 'trainer' || role === 'manager' || role === 'admin') && !window.memberCache[child.key]) {
          window.memberCache[child.key] = child.val().name || '';
          localStorage.setItem('role_' + child.key, role);
        }
      });

      db.ref('posts').once('value', snap => {
        adminAllPosts = [];
        snap.forEach(child => {
          const val = child.val();
          if (val) adminAllPosts.push({ id: child.key, ...val });
        });
        adminAllPosts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        renderAdminCommunityFeed();
      }, err => {
        feedEl.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;font-size:13px;">불러오기 실패</div>';
      });
    });
  }

  function adminFilterCommunity(cat) {
    adminCommunityCategory = cat;
    document.querySelectorAll('[id^="admin-cat-"]').forEach(b => b.classList.remove('active'));
    const el = document.getElementById('admin-cat-' + cat);
    if (el) el.classList.add('active');
    renderAdminCommunityFeed();
  }

  function adminSearchCommunity(query) {
    adminCommunityQuery = query.trim();
    renderAdminCommunityFeed();
  }

  function renderAdminCommunityFeed() {
    const feedEl = document.getElementById('admin-community-feed');
    if (!feedEl) return;
    let posts = [...adminAllPosts];
    if (adminCommunityCategory !== '전체') posts = posts.filter(p => p.category === adminCommunityCategory);
    if (adminCommunityQuery) {
      const q = adminCommunityQuery.toLowerCase();
      posts = posts.filter(p =>
        (p.nickname||'').toLowerCase().includes(q) ||
        (p.content||'').toLowerCase().includes(q)
      );
    }
    if (posts.length === 0) {
      feedEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-hint);font-size:13px;">게시글이 없어요</div>';
      return;
    }
    feedEl.innerHTML = posts.map(post => buildFeedCard(post, ADMIN_ID, true)).join('');
  }

  // ── 관리자 게시글 목록 ──
  function loadAdminPostList() {
    const listEl = document.getElementById('admin-post-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:13px;">⏳ 불러오는 중...</div>';

    db.ref('posts').once('value', snap => {
      const posts = [];
      snap.forEach(child => {
        const val = child.val();
        if (val) posts.push({ id: child.key, ...val });
      });
      posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      if (posts.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:13px;">게시글이 없어요</div>';
        return;
      }

      listEl.innerHTML = `
        <div style="font-size:12px;color:var(--text-hint);margin-bottom:8px;">총 ${posts.length}개의 게시글</div>
        ` + posts.map(post => `
        <div style="padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
                <span style="font-size:11px;font-weight:700;color:white;background:var(--blue);padding:2px 6px;border-radius:4px;">${post.category||'?'}</span>
                <span style="font-size:12px;font-weight:700;color:var(--text);">${escapeHtml(post.nickname||'회원')}</span>
                <span style="font-size:11px;color:var(--text-hint);">${getTimeAgo(post.createdAt)}</span>
              </div>
              <div style="font-size:13px;color:var(--text-sub);word-break:break-all;">${(post.content||'').substring(0,50)}${(post.content||'').length > 50 ? '...' : ''}</div>
              <div style="font-size:11px;color:var(--text-hint);margin-top:4px;">❤️ ${post.likes ? Object.keys(post.likes).length : 0} · 💬 ${post.commentCount||0}${post.photoURL ? ' · 📷 사진' : ''}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
              <button onclick="adminDeletePost('${post.id}','${post.photoURL||''}')"
                style="background:#fee2e2;color:#ef4444;border:none;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;white-space:nowrap;">
                🗑️ 삭제
              </button>
              <button onclick="adminViewComments('${post.id}')"
                style="background:var(--blue-light);color:var(--blue);border:none;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;white-space:nowrap;">
                💬 댓글
              </button>
            </div>
          </div>
        </div>`).join('');

    }, err => {
      console.error('게시글 로드 오류:', err);
      listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;font-size:13px;">불러오기 실패: ' + (err.message||err) + '</div>';
    });
  }

  function adminDeletePost(postId, photoURL) {
    showConfirm('이 게시글을 삭제할까요?\n댓글도 함께 삭제돼요.', () => {  
      // 오운완이면 포인트 환수 + owunwan 기록 삭제
      const post = adminAllPosts.find(p => p.id === postId);
      if (post && post.category === '오운완' && post.authorId) {
        db.ref('point_settings/owunwan').once('value', snap => {
          const owunwanPts = snap.val() ?? 10;
          db.ref('users/' + post.authorId + '/points').transaction(cur => Math.max(0, (cur || 0) - owunwanPts));
          if (typeof updateStats === 'function') updateStats();
        });
        if (post.owunwanDate) db.ref('users/' + post.authorId + '/owunwan/' + post.owunwanDate).remove();
      }
      db.ref('posts/' + postId).remove();
      db.ref('comments/' + postId).remove();
      if (photoURL) {
        try { storage.refFromURL(photoURL).delete(); } catch(e) {}
      }
      adminAllPosts = adminAllPosts.filter(p => p.id !== postId);
      renderAdminCommunityFeed();
      allCommunityPosts = allCommunityPosts.filter(p => p.id !== postId);
      renderCommunityFeed();
      showToast('게시글이 삭제됐어요.', 'success');
    });
  }

  function adminViewComments(postId) {
    db.ref('comments/' + postId).once('value', snap => {
      const comments = [];
      snap.forEach(child => { comments.push({ id: child.key, ...child.val() }); });
      if (comments.length === 0) { showToast('댓글이 없어요.', 'info'); return; }
      comments.sort((a, b) => (a.createdAt||0) - (b.createdAt||0));
      const msg = comments.map((c,i) => `${i+1}. [${c.nickname}] ${c.content}`).join('\n');
      showInput('삭제할 댓글 번호를 입력하세요:\n' + msg, '번호 입력', '', (delIdx) => {
        if (!delIdx) return;
        const idx = parseInt(delIdx) - 1;
        if (idx < 0 || idx >= comments.length) { showToast('잘못된 번호예요.', 'error'); return; }
        const comment = comments[idx];
        showConfirm('[' + comment.nickname + '] 댓글을 삭제할까요?', () => {
          db.ref('comments/' + postId + '/' + comment.id).remove().then(() => {
            db.ref('posts/' + postId + '/commentCount').transaction(v => Math.max((v||1)-1, 0));
            showToast('댓글이 삭제됐어요.', 'success');
          });
        });
      });
    });
  }

  // ── 관리자 비밀번호 변경 ──
  function changeAdminPw() {
    const curPw = document.getElementById('admin-cur-pw').value.trim();
    const newPw = document.getElementById('admin-new-pw').value.trim();
    if (!curPw || !newPw) { showToast('모두 입력해주세요.', 'error'); return; }
    if (newPw.length < 4) { showToast('새 비밀번호는 4자리 이상이어야 해요.', 'error'); return; }
    db.ref('admin_config/pw').once('value').then(snap => {
      const adminPw = snap.val() || 'admin123';
      if (curPw !== adminPw) { showToast('현재 비밀번호가 틀렸어요.', 'error'); return; }
      db.ref('admin_config/pw').set(newPw).then(() => {
        document.getElementById('admin-cur-pw').value = '';
        document.getElementById('admin-new-pw').value = '';
        showToast('관리자 비밀번호가 변경됐어요!', 'success');
      });
    });
  }

  // ── 관리자 로그아웃 ──
  function adminLogout() {
    localStorage.removeItem('current_user');
    localStorage.removeItem('auto_login_user');
    sessionStorage.removeItem('session_user');
    showScreen('screen-login');
  }

  // ══════════════════════════════
  // ══════════════════════════════
  // 탭 전환
  // ══════════════════════════════
  function switchTab(tab) {
    // 로그인 상태 확인 - 없으면 로그인 화면으로
    const userId = localStorage.getItem('current_user') || sessionStorage.getItem('session_user');
    if (!userId) {
      showScreen('screen-login');
      return;
    }
    if (!localStorage.getItem('current_user')) localStorage.setItem('current_user', userId);
    ['home','attend','workout','community','myinfo'].forEach(t => {
      const el = document.getElementById('tab-' + t);
      if (el) el.classList.toggle('active', t === tab || (t === 'attend' && tab === 'trainer'));
    });
    // 마지막 탭 저장 (새로고침 복원용)
    // 강사/매니저가 'attend'를 직접 호출해도 'trainer'로 저장
    if (userId && userId !== ADMIN_ID) {
      const savedRole = localStorage.getItem('role_' + userId) || 'member';
      const saveTab = (tab === 'attend' && (savedRole === 'trainer' || savedRole === 'manager' || savedRole === 'admin')) ? 'trainer' : tab;
      localStorage.setItem('last_tab_' + userId, saveTab);
    }
    // 커뮤니티 탭 벗어나면 리스너 해제
    if (tab !== 'community') stopCommunityListener();
    if (tab === 'home') {
      showScreen('screen-home');
      const uid = localStorage.getItem('current_user') || sessionStorage.getItem('session_user');
      const role = localStorage.getItem('role_' + uid) || 'member';
      if (role === 'trainer' || role === 'manager' || role === 'admin') {
        const trainerSection = document.getElementById('trainer-home-section');
        const memberSection = document.getElementById('member-home-section');
        if (trainerSection) trainerSection.style.display = 'block';
        if (memberSection) memberSection.style.display = 'none';
        if (typeof loadTrainerHome === 'function') loadTrainerHome();
      } else {
        const trainerSection = document.getElementById('trainer-home-section');
        const memberSection = document.getElementById('member-home-section');
        if (trainerSection) trainerSection.style.display = 'none';
        if (memberSection) memberSection.style.display = 'block';
        updateStats();
        loadHomeNotices();
        loadNotifications();
        loadHomeWeightCard();
      }
      // 캐시된 알림 즉시 렌더링
      if (window._cachedNotifList) {
        setTimeout(() => _renderNotifToDOM(window._cachedNotifList), 50);
      }
      // 홈탭 이동 시 안 읽은 공지 팝업 표시
      const notifUid = localStorage.getItem('current_user');
      if (notifUid && typeof showNoticePopup === 'function') {
        setTimeout(() => showNoticePopup(notifUid), 300);
      }
    } else if (tab === 'attend') {
      openAttendance();
    } else if (tab === 'workout') {
      openWorkoutQr();
    } else if (tab === 'community') {
      showScreen('screen-community');
      loadCommunityFeed('전체');
      loadCommunityChallengePins();
      // 커뮤니티 탭 클릭 시 배지 숨김
      const badge = document.getElementById('community-badge');
      if (badge) badge.style.display = 'none';
    } else if (tab === 'myinfo') {
      showScreen('screen-myinfo');
      loadMyInfo();
    } else if (tab === 'trainer') {
      showScreen('screen-trainer');
      loadTrainerTab();
    }
  }

  // ── 1번: 스와이프 뒤로가기 방지 ──
  // history에 상태를 쌓아서 브라우저 뒤로가기를 앱 내 탐색으로 처리
  window.addEventListener('DOMContentLoaded', () => {
    history.pushState({ page: 'app' }, '', '');
    window.addEventListener('popstate', () => {
      const cur = document.querySelector('.screen.active');
      // 로그인/신체정보 화면에서는 뒤로가기 완전 차단
      if (!cur || cur.id === 'screen-login' || cur.id === 'screen-nickname') {
        history.pushState({ page: 'app' }, '', '');
        return;
      }
      history.pushState({ page: 'app' }, '', '');
      // 관리자 화면에서는 항상 관리자 화면으로
      const userId = localStorage.getItem('current_user');
      if (userId === ADMIN_ID) {
        showScreen('screen-admin');
        return;
      }
      // 홈에서 뒤로가기 → 그냥 유지
      if (cur.id === 'screen-home') return;
      // 그 외 → 홈으로
      switchTab('home');
    });
  });

  // ══════════════════════════════
  // 커뮤니티
  // ══════════════════════════════
  let currentCategory = '전체';
  let currentCommentPostId = null;
  let postPhotoFile = null;
  let communityListener = null;
  let communitySearchQuery = '';
  let communityAuthorFilter = '';
  let allCommunityPosts = []; // 전체 포스트 캐시

  // ── 검색 ──
  function searchCommunity(query) {
    communitySearchQuery = query.trim();
    communityAuthorFilter = '';
    document.getElementById('author-filter-badge').style.display = 'none';
    document.getElementById('community-search-clear').style.display = query ? 'block' : 'none';
    renderCommunityFeed();
  }

  function clearCommunitySearch() {
    document.getElementById('community-search').value = '';
    document.getElementById('community-search-clear').style.display = 'none';
    communitySearchQuery = '';
    renderCommunityFeed();
  }

  // ── 작성자 필터 ──
  function showAuthorInfo(authorId) {
    const realName = localStorage.getItem('name_' + authorId) || authorId;
    const role = localStorage.getItem('role_' + authorId);
    const isStaff = role === 'trainer' || role === 'manager' || role === 'admin';
    showToast((isStaff ? '[직원] ' : '') + realName, 'info');
  }

  function filterByAuthor(authorId, nickname) {
    communityAuthorFilter = authorId;
    communitySearchQuery = '';
    const searchEl = document.getElementById('community-search');
    if (searchEl) searchEl.value = '';
    document.getElementById('community-search-clear').style.display = 'none';
    const badge = document.getElementById('author-filter-badge');
    if (badge) { badge.style.display = 'flex'; }
    const txt = document.getElementById('author-filter-text');
    if (txt) txt.textContent = '👤 ' + nickname + '님의 게시글';
    renderCommunityFeed();
  }

  function clearAuthorFilter() {
    communityAuthorFilter = '';
    const badge = document.getElementById('author-filter-badge');
    if (badge) badge.style.display = 'none';
    renderCommunityFeed();
  }

  // ── 필터/검색 적용 후 렌더링 ──
  function renderCommunityFeed() {
    const feedEl = document.getElementById('community-feed');
    if (!feedEl) return;
    let posts = [...allCommunityPosts];

    // 카테고리 필터
    if (currentCategory !== '전체') posts = posts.filter(p => p.category === currentCategory);

    // 작성자 필터
    if (communityAuthorFilter) posts = posts.filter(p => p.authorId === communityAuthorFilter);

    // 검색 필터 (원본 닉네임으로 비교)
    if (communitySearchQuery) {
      const q = communitySearchQuery.toLowerCase();
      posts = posts.filter(p =>
        (p.nickname || '').toLowerCase().includes(q) ||
        (p.content || '').toLowerCase().includes(q)
      );
    }

    if (posts.length === 0) {
      feedEl.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-hint);font-size:14px;">검색 결과가 없어요</div>';
      return;
    }

    const userId = localStorage.getItem('current_user');
    const isAdmin = userId === ADMIN_ID;
    feedEl.innerHTML = posts.map(post => buildFeedCard(post, userId, isAdmin)).join('');
  }

  function filterCommunity(cat) {
    currentCategory = cat;
    communityAuthorFilter = '';
    communitySearchQuery = '';
    const searchEl = document.getElementById('community-search');
    if (searchEl) searchEl.value = '';
    const badge = document.getElementById('author-filter-badge');
    if (badge) badge.style.display = 'none';
    document.querySelectorAll('.cat-tab-icon').forEach(b => b.classList.remove('active'));
    const el = document.getElementById('cat-' + cat);
    if (el) el.classList.add('active');
    renderCommunityFeed();
  }

  function loadCommunityFeed(cat) {
    currentCategory = cat;
    const feedEl = document.getElementById('community-feed');
    feedEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-hint);font-size:14px;">불러오는 중...</div>';

    if (communityListener) {
      db.ref('posts').off('value', communityListener);
      communityListener = null;
    }

    const userId = localStorage.getItem('current_user');
    const isAdmin = userId === ADMIN_ID;

    const startFeedListener = () => {
      communityListener = db.ref('posts').on('value', snap => {
        allCommunityPosts = [];
        snap.forEach(child => {
          const val = child.val();
          if (val && (val.authorId || val.userId) && (val.nickname || val.name)) {
            allCommunityPosts.push({ id: child.key, ...val });
          }
        });
        allCommunityPosts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        renderCommunityFeed();
      });
    };

    // 관리자/강사일 때 회원 실명 미리 캐싱 완료 후 피드 로드
    const curRole = localStorage.getItem('role_' + userId);
    const isStaff = curRole === 'trainer' || curRole === 'manager' || curRole === 'admin';
    if (isAdmin || isStaff) {
      // memberCache가 이미 있으면 재사용, 없으면 Firebase에서 로드
      if (window.memberCache && Object.keys(window.memberCache).length > 0) {
        startFeedListener();
      } else {
        Promise.all([
          db.ref('members').once('value'),
          db.ref('users').once('value')
        ]).then(([memberSnap, userSnap]) => {
          window.memberCache = {};
          memberSnap.forEach(child => {
            window.memberCache[child.key] = child.val().name || '';
            if (child.val().role) localStorage.setItem('role_' + child.key, child.val().role);
          });
          userSnap.forEach(child => {
            const role = child.val().role;
            if ((role === 'trainer' || role === 'manager' || role === 'admin') && !window.memberCache[child.key]) {
              window.memberCache[child.key] = child.val().name || '';
              localStorage.setItem('role_' + child.key, role);
            }
          });
          startFeedListener();
        });
      }
    } else {
      startFeedListener();
    }
  }

  // ── 피드 카드 빌더 (작성자 클릭 기능 포함) ──
  // ── 이름 마스킹 (가운데 글자 * 처리) ──
  // 예: 최성은(4467) → 최*은(4467)
  function maskName(name, isAdmin) {
    if (isAdmin) return name; // 관리자는 전체 이름
    if (!name) return '회원';
    // 괄호 앞 이름 부분만 마스킹
    const match = name.match(/^(.+?)(\([\d]+\))?$/);
    if (!match) return name;
    const namePart = match[1];
    const numPart  = match[2] || '';
    if (namePart.length <= 1) return name; // 1글자면 그대로
    if (namePart.length === 2) return namePart[0] + '*' + numPart;
    // 3글자 이상: 가운데 글자(들) 마스킹
    const first = namePart[0];
    const last  = namePart[namePart.length - 1];
    const stars = '*'.repeat(namePart.length - 2);
    return first + stars + last + numPart;
  }

  function buildFeedCard(post, userId, isAdmin) {
    const liked = post.likes && post.likes[userId];
    const likeCount = post.likes ? Object.keys(post.likes).length : 0;
    const commentCount = post.commentCount || 0;
    const timeAgo = getTimeAgo(post.createdAt);
    const safeContent = escapeHtml(post.content || '').replace(/\n/g,'<br>');
    const safePreview = escapeHtml((post.content || '').replace(/\n/g,' ')).substring(0,50);
    const canDelete = post.authorId === userId || isAdmin;
    const authorRole = localStorage.getItem('role_' + post.authorId);
    const isAuthorStaff = authorRole === 'trainer' || authorRole === 'manager' || authorRole === 'admin';
    const curRole = localStorage.getItem('role_' + userId);
    const isAdminOrStaff = isAdmin || curRole === 'trainer' || curRole === 'manager' || curRole === 'admin';
    // 관리자 실명 표시 - memberCache 또는 localStorage에서 읽기
    const realNameStr = (window.memberCache && window.memberCache[post.authorId]) || localStorage.getItem('name_' + post.authorId) || '';
    // 강사/관리자: 실명(뒤4자리) 항상 표시
    const last4 = post.authorId ? post.authorId.slice(-4) : '';
    const staffBadge = isAuthorStaff ? ' <span style="font-size:10px;color:var(--blue);">[직원]</span>' : '';
    // 이름에 이미 (XXXX) 형태 포함된 경우 중복 방지
    const hasNum = /\(\d{4}\)$/.test(realNameStr);
    const displayName = realNameStr ? (hasNum ? realNameStr : realNameStr + '(' + last4 + ')') : '(' + last4 + ')';
    const realNameDisplay = isAdminOrStaff
      ? ` <span style="font-size:11px;font-weight:600;color:var(--text-sub);">${escapeHtml(displayName)}${staffBadge}</span>`
      : '';
    return `
      <div class="feed-card">
        <div class="feed-header">
          <div class="feed-avatar">${escapeHtml((post.nickname||'?')[0])}</div>
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span class="feed-nickname" onclick="filterByAuthor('${post.authorId}','${(post.nickname||'').replace(/'/g,"\\'")}')" 
                style="cursor:pointer;text-decoration:underline;text-decoration-color:transparent;transition:text-decoration-color 0.15s;"
                onmouseenter="this.style.textDecorationColor='var(--blue)'"
                onmouseleave="this.style.textDecorationColor='transparent'">${escapeHtml(post.nickname || '회원')}</span>
              ${realNameDisplay}
            </div>
            <div class="feed-meta">${timeAgo}</div>
          </div>
          <span class="feed-cat-badge">${post.category || ''}</span>
        </div>
        ${post.photoURL ? `<img class="feed-photo" src="${post.photoURL}" alt="사진" loading="lazy" onerror="this.style.display='none'" />` : ''}
        <div class="feed-content">${safeContent}</div>
        <div class="feed-actions">
          <button class="feed-btn ${liked ? 'liked' : ''}" id="like-btn-${post.id}"
            ${post.authorId === userId ? 'disabled style="opacity:0.35;cursor:not-allowed;"' : `onclick="toggleLike('${post.id}', this)"`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${liked ? '#ef4444' : 'none'}" stroke="${liked ? '#ef4444' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
            <span id="like-count-${post.id}">${likeCount}</span>
          </button>
          <button class="feed-btn" onclick="openCommentModal('${post.id}',\`${safePreview}\`)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            <span id="comment-count-${post.id}">${commentCount}</span>
          </button>
          ${canDelete ? `
            <button class="feed-btn" onclick="openEditPostModal('${post.id}')" style="margin-left:auto;color:#185FA5;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              수정
            </button>` : ''}
        </div>
      </div>`;
  }

  // 커뮤니티 화면 벗어날 때 리스너 해제
  function stopCommunityListener() {
    if (communityListener) {
      db.ref('posts').off('value', communityListener);
      communityListener = null;
    }
  }

  // ── 좋아요 토글 ──
  function toggleLike(postId, btn) {
    const userId = localStorage.getItem('current_user');
    if (!userId) return;

    // 게시물 작성자 확인 (자작 좋아요 방지)
    const post = allCommunityPosts.find(p => p.id === postId) || adminAllPosts.find(p => p.id === postId);
    if (post && post.authorId === userId) {
      showToast('내 게시물에는 좋아요를 누를 수 없어요 😊', 'info'); return;
    }

    const likeRef = db.ref('posts/' + postId + '/likes/' + userId);
    likeRef.once('value').then(snap => {
      if (snap.exists()) {
        // 좋아요 취소 → 작성자 포인트 -1 + 알림 삭제
        likeRef.remove();
        btn.classList.remove('liked');
        btn.querySelector('svg').setAttribute('fill','none');
        btn.querySelector('svg').setAttribute('stroke','currentColor');
        if (post && post.authorId) {
          db.ref('point_settings/like').once('value', ptSnap => {
            const likePts = ptSnap.val() ?? 1;
            if (likePts > 0) {
              db.ref('users/' + post.authorId + '/points').transaction(cur => Math.max(0, (cur || 0) - likePts));
              if (post.authorId === userId && typeof updateStats === 'function') updateStats();
            }
          });
          // 좋아요 알림 삭제
          db.ref('notifications/' + post.authorId).once('value', notifSnap => {
            notifSnap.forEach(child => {
              const n = child.val();
              if (n.type === 'like' && n.postId === postId && n.likerId === userId) {
                db.ref('notifications/' + post.authorId + '/' + child.key).remove();
              }
            });
          });
        }
      } else {
        // 좋아요 → 작성자 포인트 +1 + 알림 저장
        likeRef.set(true);
        btn.classList.add('liked');
        btn.querySelector('svg').setAttribute('fill','#ef4444');
        btn.querySelector('svg').setAttribute('stroke','#ef4444');
        if (post && post.authorId) {
          db.ref('point_settings/like').once('value', ptSnap => {
            const likePts = ptSnap.val() ?? 1;
            if (likePts > 0) {
              if (typeof addPointWithHistory === 'function') addPointWithHistory(post.authorId, likePts, '좋아요');
              else db.ref('users/' + post.authorId + '/points').transaction(cur => (cur || 0) + likePts);
            }
          });
          // 좋아요 알림 저장
          const likerNick = localStorage.getItem('nickname_' + userId) || localStorage.getItem('name_' + userId) || '회원';
          db.ref('notifications/' + post.authorId).push({
            type: 'like',
            postId: postId,
            postTitle: (post.content || '').substring(0, 30),
            writerName: likerNick,
            likerId: userId,
            createdAt: Date.now(),
            read: false
          });
          // 좋아요 푸시알림
          if (typeof sendPushToUser === 'function') {
            sendPushToUser(post.authorId, '❤️ 좋아요', likerNick + '님이 내 게시글을 좋아합니다', 'like', { type: 'like', postId: postId });
          }
        }
      }
      // 좋아요 수 업데이트
      db.ref('posts/' + postId + '/likes').once('value').then(s => {
        const count = s.val() ? Object.keys(s.val()).length : 0;
        document.getElementById('like-count-' + postId).textContent = count;
      });
    });
  }

  // ── 게시글 삭제 ──

  // ── 게시글 수정 ──
  let editingPostId = null;

  function openEditPostModal(postId) {
    const post = allCommunityPosts.find(p => p.id === postId) || adminAllPosts.find(p => p.id === postId);
    if (!post) return;
    editingPostId = postId;

    // 식단 게시글은 글쓰기 전체 화면으로 오픈
    if (post.category === '식단') {
      openPostModalForEdit(post);
      return;
    }

    const catMap = { '식단':'🥗 식단', '운동팁':'📋 운동팁', '자유':'💬 자유', '오운완':'💪 오운완' };
    document.getElementById('edit-post-category-badge').textContent = catMap[post.category] || post.category || '';
    document.getElementById('edit-post-content').value = post.content || '';
    document.getElementById('edit-post-modal').classList.add('active');
  }

  // 식단 글 수정: 글쓰기 전체 화면으로 기존 내용 불러와서 열기
  function openPostModalForEdit(post) {
    if (!localStorage.getItem('current_user')) return;

    // 수정 모드 플래그 전역 설정
    window._editMode = true;
    window._editPostId = post.id;

    postPhotoFile = null;
    mealPhotos = [null, null, null, null];

    // 기존 내용 불러오기
    document.getElementById('post-content').value = post.content || '';
    ['meal-breakfast','meal-lunch','meal-dinner','meal-snack'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    ['kcal-breakfast','kcal-lunch','kcal-dinner','kcal-snack'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = '';
    });

    // 식단 내용 파싱해서 끼니별로 채우기
    if (post.content) {
      const lines = post.content.split('\n');
      lines.forEach(line => {
        if (line.includes('🌅 아침')) {
          const el = document.getElementById('meal-breakfast');
          if (el) el.value = line.replace(/🌅 아침[:\s]*/, '').trim();
        } else if (line.includes('☀️ 점심')) {
          const el = document.getElementById('meal-lunch');
          if (el) el.value = line.replace(/☀️ 점심[:\s]*/, '').trim();
        } else if (line.includes('🌙 저녁')) {
          const el = document.getElementById('meal-dinner');
          if (el) el.value = line.replace(/🌙 저녁[:\s]*/, '').trim();
        } else if (line.includes('🍎 간식')) {
          const el = document.getElementById('meal-snack');
          if (el) el.value = line.replace(/🍎 간식[:\s]*/, '').trim();
        }
      });
    }

    renderMealPhotoGrid();

    // 카테고리 식단으로 고정
    document.querySelectorAll('.cat-select').forEach((b,i) => b.classList.toggle('active', i===0));
    document.getElementById('post-category').value = '식단';

    // UI 초기화
    document.getElementById('post-photo-preview-wrap').style.display = 'none';
    document.getElementById('post-photo-camera').value = '';
    document.getElementById('post-photo-gallery').value = '';

    // 식단 카테고리 UI 표시
    const pcw = document.getElementById('post-content-wrap'); if (pcw) pcw.style.display = 'none';
    const cw = document.getElementById('calorie-calc-wrap'); if (cw) cw.style.display = 'block';
    const mg = document.getElementById('meal-photo-grid'); if (mg) mg.style.display = 'grid';
    const pb = document.getElementById('post-photo-buttons'); if (pb) pb.style.display = 'none';
    const pl = document.getElementById('photo-label'); if (pl) pl.textContent = '사진 (선택 · 끼니별 최대 4장)';
    const cr = document.getElementById('calorie-result'); if (cr) cr.style.display = 'none';
    const fl = document.getElementById('food-added-list'); if (fl) fl.style.display = 'none';

    // 수정 모드 UI 변경
    const modalTitle = document.querySelector('#post-modal .modal-title span');
    if (modalTitle) modalTitle.textContent = '✏️ 식단 수정';

    const draftBtn = document.getElementById('draft-exit-btn');
    if (draftBtn) draftBtn.textContent = '✏️ 수정 후 나가기';

    const submitBtn = document.getElementById('post-submit-btn');
    if (submitBtn) {
      submitBtn.textContent = '🗑️ 삭제하기';
      submitBtn.style.background = '#fee2e2';
      submitBtn.style.color = '#ef4444';
      submitBtn.onclick = () => deleteDietPostFromModal();
      submitBtn.disabled = false;
    }

    // 임시저장 안내 숨기기 (수정 모드에서는 불필요)
    const draftInfo = document.getElementById('draft-info-box');
    if (draftInfo) draftInfo.style.display = 'none';

    document.getElementById('post-modal').classList.add('active');

    setTimeout(() => calcMealKcal(), 200);
  }

  function closeEditPostModal() {
    document.getElementById('edit-post-modal').classList.remove('active');
    editingPostId = null;
  }

  function saveEditedPost() {
    if (!editingPostId) return;
    const newContent = document.getElementById('edit-post-content').value.trim();
    if (!newContent) { showToast('내용을 입력해주세요.', 'error'); return; }
    db.ref('posts/' + editingPostId).update({ content: newContent }).then(() => {
      // 로컬 캐시 업데이트
      const post = allCommunityPosts.find(p => p.id === editingPostId);
      if (post) post.content = newContent;
      renderCommunityFeed();
      renderAdminCommunityFeed();
      closeEditPostModal();
      showToast('수정됐어요!', 'success');
    });
  }

  function deletePostFromEdit() {
    if (!editingPostId) return;
    const postId = editingPostId;
    const post = allCommunityPosts.find(p => p.id === postId) || adminAllPosts.find(p => p.id === postId);
    closeEditPostModal();
    deletePost(postId, post?.photoURL || '');
  }

  function deletePost(postId, photoURL) {
    showConfirm('게시글을 삭제할까요?', () => {
      const post = allCommunityPosts.find(p => p.id === postId) || adminAllPosts.find(p => p.id === postId);

      // 좋아요 포인트 환수 (게시글 작성자에게 받은 좋아요 수 × 좋아요 포인트)
      if (post && post.authorId && post.likes) {
      const likeCount = Object.keys(post.likes).length;
      if (likeCount > 0) {
        db.ref('point_settings/like').once('value', snap => {
          const likePts = snap.val() ?? 1;
          if (likePts > 0) {
            db.ref('users/' + post.authorId + '/points').transaction(cur => Math.max(0, (cur || 0) - (likeCount * likePts)));
            if (typeof updateStats === 'function') updateStats();
          }
        });
      }
      }

      // 오운완 게시물이면 설정값만큼 포인트 환수 + owunwan 기록 삭제
      if (post && post.category === '오운완' && post.authorId) {
      db.ref('point_settings/owunwan').once('value', snap => {
        const owunwanPts = snap.val() ?? 10;
        db.ref('users/' + post.authorId + '/points').transaction(cur => Math.max(0, (cur || 0) - owunwanPts));
        if (typeof updateStats === 'function') updateStats();
      });
      if (post.owunwanDate) db.ref('users/' + post.authorId + '/owunwan/' + post.owunwanDate).remove();
      }
      // 식단 게시물 포인트 환수 + 날짜 제한 해제
      if (post && post.category === '식단' && post.authorId) {
      const ptKey = post.photoURL ? 'dietPhoto' : 'dietText';
      db.ref('point_settings/' + ptKey).once('value', snap => {
        const dietPts = snap.val() ?? (post.photoURL ? 10 : 5);
        if (dietPts > 0) {
          db.ref('users/' + post.authorId + '/points').transaction(cur => Math.max(0, (cur || 0) - dietPts));
          if (typeof updateStats === 'function') updateStats();
        }
      });
      // 오늘 날짜 제한 해제 (본인이 삭제할 때만)
      const today = new Date();
      const todayStr = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
      db.ref('users/' + post.authorId + '/diet_post_date').once('value', snap => {
        if (snap.val() === todayStr) db.ref('users/' + post.authorId + '/diet_post_date').remove();
      });
      }
      db.ref('posts/' + postId).remove().then(() => {
      if (photoURL) storage.refFromURL(photoURL).delete().catch(() => {});
      // 댓글 데이터 삭제
      db.ref('comments/' + postId).remove().catch(() => {});
      // 모든 회원의 알림 중 이 게시물 관련 알림 삭제
      db.ref('notifications').once('value', snap => {
        const users = [];
        snap.forEach(userSnap => { users.push(userSnap); });
        users.forEach(userSnap => {
          const notifs = [];
          userSnap.forEach(notifSnap => { notifs.push({ key: notifSnap.key, postId: notifSnap.val().postId }); });
          notifs.forEach(item => {
            if (item.postId === postId) {
              db.ref('notifications/' + userSnap.key + '/' + item.key).remove();
            }
          });
        });
      });
      // 즉시 캐시에서 제거
      allCommunityPosts = allCommunityPosts.filter(p => p.id !== postId);
      adminAllPosts = adminAllPosts.filter(p => p.id !== postId);
      // 현재 보이는 피드 즉시 갱신
      renderCommunityFeed();
      renderAdminCommunityFeed();
      });
    });
  }

  // ── 글쓰기 모달 ──
  function openPostModal() {
    if (!localStorage.getItem('current_user')) {
      showToast('로그인이 필요해요.\n다시 로그인해주세요.', 'error');
      showScreen('screen-login');
      return;
    }
    postPhotoFile = null;
    mealPhotos = [null, null, null, null];
    document.getElementById('post-content').value = '';
  ['meal-breakfast','meal-lunch','meal-dinner','meal-snack'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    ['kcal-breakfast','kcal-lunch','kcal-dinner','kcal-snack'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = '';
    });
    renderMealPhotoGrid();
    // 오늘 임시저장 불러오기
    setTimeout(() => loadDietDraft(), 100);
    // 카테고리 초기화 - 식단 기본값
    document.querySelectorAll('.cat-select').forEach((b,i) => b.classList.toggle('active', i===0));
    document.getElementById('post-category').value = '식단';

    // UI 초기화
    document.getElementById('post-photo-preview-wrap').style.display = 'none';
    document.getElementById('post-photo-camera').value = '';
    document.getElementById('post-photo-gallery').value = '';
    document.getElementById('post-submit-btn').textContent = '게시하기 🚀';
    document.getElementById('post-submit-btn').disabled = false;

    // 식단 카테고리 UI 표시
    const pcw = document.getElementById('post-content-wrap'); if (pcw) pcw.style.display = 'none';
    const cw = document.getElementById('calorie-calc-wrap'); if (cw) cw.style.display = 'block';
    const mg = document.getElementById('meal-photo-grid'); if (mg) mg.style.display = 'grid';
    const pb = document.getElementById('post-photo-buttons'); if (pb) pb.style.display = 'none';
    const pl = document.getElementById('photo-label'); if (pl) pl.textContent = '사진 (선택 · 끼니별 최대 4장)';
    const cr = document.getElementById('calorie-result'); if (cr) cr.style.display = 'none';
    const fl = document.getElementById('food-added-list'); if (fl) fl.style.display = 'none';

    // 임시저장 안내/버튼 표시
    const draftWrap = document.getElementById('draft-save-wrap'); if (draftWrap) draftWrap.style.display = 'block';

    document.getElementById('post-modal').classList.add('active');
  }

  function closePostModal() {
    document.getElementById('post-modal').classList.remove('active');
    // 수정 모드 플래그 초기화
    window._editMode = false;
    window._editPostId = null;
    // 타이틀/버튼 원상복구
    const modalTitle = document.querySelector('#post-modal .modal-title span');
    if (modalTitle) modalTitle.textContent = '✍️ 새 게시글';
    const draftBtn = document.getElementById('draft-exit-btn');
    if (draftBtn) draftBtn.textContent = '💾 임시저장 후 나가기';
    const submitBtn = document.getElementById('post-submit-btn');
    if (submitBtn) {
      submitBtn.textContent = '게시하기 🚀';
      submitBtn.style.background = '';
      submitBtn.style.color = '';
      submitBtn.onclick = () => submitPost();
      submitBtn.disabled = false;
    }
    const draftInfo = document.getElementById('draft-info-box');
    if (draftInfo) draftInfo.style.display = '';
  }

  function selectPostCat(btn, cat) {
    document.querySelectorAll('.cat-select').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('post-category').value = cat;
    const contentWrap = document.getElementById('post-content-wrap');
    const calcWrap = document.getElementById('calorie-calc-wrap');
    const calorieResult = document.getElementById('calorie-result');
    const mealGrid = document.getElementById('meal-photo-grid');
    // 임시저장 불러오기 (카테고리 전환 시)
    loadPostDraft(cat);

    const photoLabel = document.getElementById('photo-label');
    const photoButtons = document.getElementById('post-photo-buttons');

    if (cat === '식단') {
      if (contentWrap) contentWrap.style.display = 'none';
      if (calcWrap) calcWrap.style.display = 'block';
      if (mealGrid) mealGrid.style.display = 'grid';
      if (calorieResult) calorieResult.style.display = 'none';
      if (photoLabel) photoLabel.textContent = '사진 (선택 · 끼니별 최대 4장)';
      if (photoButtons) photoButtons.style.display = 'none';
      const draftWrap = document.getElementById('draft-save-wrap'); if (draftWrap) draftWrap.style.display = 'block';
    } else {
      if (contentWrap) contentWrap.style.display = 'block';
      if (calcWrap) calcWrap.style.display = 'none';
      if (mealGrid) mealGrid.style.display = 'none';
      if (calorieResult) calorieResult.style.display = 'none';
      if (photoLabel) photoLabel.textContent = '사진 (선택)';
      if (photoButtons) photoButtons.style.display = 'block';
      const draftWrap = document.getElementById('draft-save-wrap'); if (draftWrap) draftWrap.style.display = 'block';
    }
  }


// ── 커뮤니티 챌린지 고정 핀 로드 ──
function loadCommunityChallengePins() {
  const pinWrap = document.getElementById('community-challenge-pins');
  const pinList = document.getElementById('community-challenge-pin-list');
  if (!pinWrap || !pinList) return;

  db.ref('challenges').orderByChild('status').equalTo('ongoing').once('value', snap => {
    const data = snap.val();
    if (!data) {
      pinWrap.style.display = 'none';
      return;
    }
    const challenges = Object.entries(data).map(([id, c]) => ({ id, ...c }));
    if (challenges.length === 0) {
      pinWrap.style.display = 'none';
      return;
    }
    pinWrap.style.display = 'block';
    pinList.innerHTML = challenges.map(c => {
      const today = new Date().toISOString().slice(0, 10);
      const end = c.endDate || '';
      let dDay = '';
      if (end) {
        const diff = Math.ceil((new Date(end) - new Date(today)) / 86400000);
        dDay = diff > 0 ? 'D-' + diff : diff === 0 ? 'D-Day' : '종료';
      }
      const count = c.participants ? Object.keys(c.participants).length : 0;
      return `<div class="community-pin-card" onclick="openChallengeDetail('${c.id}')">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:20px;">🏆</span>
          <div>
            <div style="font-size:13px;font-weight:700;color:#92400e;">${c.name}</div>
            <div style="font-size:11px;color:#b45309;margin-top:2px;">참여자 ${count}명 · 상위 ${c.rewardRankCount||3}명 보상</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:11px;background:#fef3c7;color:#854d0e;padding:2px 8px;border-radius:4px;font-weight:700;">${dDay}</span>
          <span style="font-size:18px;color:#b45309;">›</span>
        </div>
      </div>`;
    }).join('');
  });
}


// ── 관리자 커뮤니티 챌린지 고정 핀 ──
function loadAdminCommunityChallengePins() {
  const pinWrap = document.getElementById('admin-community-challenge-pins');
  const pinList = document.getElementById('admin-community-challenge-pin-list');
  if (!pinWrap || !pinList) return;

  db.ref('challenges').orderByChild('status').equalTo('ongoing').once('value', snap => {
    const data = snap.val();
    if (!data) { pinWrap.style.display = 'none'; return; }
    const challenges = Object.entries(data).map(([id, c]) => ({ id, ...c }));
    if (challenges.length === 0) { pinWrap.style.display = 'none'; return; }
    pinWrap.style.display = 'block';
    pinList.innerHTML = challenges.map(c => {
      const today = new Date().toISOString().slice(0, 10);
      const end = c.endDate || '';
      let dDay = '';
      if (end) {
        const diff = Math.ceil((new Date(end) - new Date(today)) / 86400000);
        dDay = diff > 0 ? 'D-' + diff : diff === 0 ? 'D-Day' : '종료';
      }
      const count = c.participants ? Object.keys(c.participants).length : 0;
      // 관리자는 관리자 챌린지 탭으로 이동
      return `<div class="community-pin-card" onclick="openAdminChallengeDetailOverlay('${c.id}')">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:20px;">🏆</span>
          <div>
            <div style="font-size:13px;font-weight:700;color:#92400e;">${c.name}</div>
            <div style="font-size:11px;color:#b45309;margin-top:2px;">참여자 ${count}명 · ${c.startDate} ~ ${c.endDate}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:11px;background:#fef3c7;color:#854d0e;padding:2px 8px;border-radius:4px;font-weight:700;">${dDay}</span>
          <span style="font-size:18px;color:#b45309;">›</span>
        </div>
      </div>`;
    }).join('');
  });
}

