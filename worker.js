// Cloudflare Worker
// - 정적 파일 서빙 (기존 기능 유지)
// - /api/notify : FCM 푸시알림 발송 API 추가
// - scheduled : Cron 자동 챌린지 종료+보상 지급

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS 프리플라이트 처리
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    // 버전 확인 API
    if (url.pathname === '/api/version') {
      return new Response(JSON.stringify({ version: '1.3.1' }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }

    // 푸시알림 발송 API
    if (url.pathname === '/api/notify' && request.method === 'POST') {
      return handleNotify(request, env);
    }

    // 민감한 파일 접근 차단
    if (url.pathname.includes('adminsdk') ||
        url.pathname.includes('service-account') ||
        (url.pathname.endsWith('.json') && url.pathname !== '/manifest.json')) {
      return new Response('Not Found', { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },

  // ── Cron Trigger: 매일 한국시간 자정(UTC 15:00) 실행 ──
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleCronAutoClose(env));
  }
};

// ── 푸시알림 발송 처리 ──
async function handleNotify(request, env) {
  let step = 'init';
  try {
    step = 'parse_body';
    const { tokens, title, body, data } = await request.json();

    if (!tokens || tokens.length === 0) {
      return jsonRes({ success: false, error: 'No tokens' }, 400);
    }

    // 시크릿 확인
    step = 'check_secrets';
    if (!env.FCM_PRIVATE_KEY) return jsonRes({ success: false, error: 'FCM_PRIVATE_KEY 없음' }, 500);
    if (!env.FCM_CLIENT_EMAIL) return jsonRes({ success: false, error: 'FCM_CLIENT_EMAIL 없음' }, 500);

    // FCM v1 API 액세스 토큰 발급
    step = 'get_access_token';
    const accessToken = await getFCMAccessToken(env.FCM_PRIVATE_KEY, env.FCM_CLIENT_EMAIL);
    const projectId = 'pungsan-fitness';

    // 토큰별 발송 (병렬)
    step = 'send_messages';
    const results = await Promise.allSettled(
      tokens.map(token => sendFCMMessage(accessToken, projectId, token, title, body, data))
    );

    const sent   = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return jsonRes({ success: true, sent, failed });

  } catch (err) {
    console.error('알림 발송 오류 [' + step + ']:', err);
    return jsonRes({ success: false, error: '[' + step + '] ' + err.message }, 500);
  }
}

// ── Google OAuth2 액세스 토큰 발급 (JWT RS256) ──
async function getFCMAccessToken(privateKey, clientEmail) {
  const now = Math.floor(Date.now() / 1000);

  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss:   clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now
  }));

  const signingInput = `${header}.${payload}`;

  // PEM 개인키 파싱
  // 터미널 붙여넣기 시 발생할 수 있는 모든 경우 처리:
  // - 리터럴 \n (백슬래시+n) → 실제 줄바꿈으로 변환 후 제거
  // - JSON 따옴표 포함 여부 무관
  // - 최종적으로 base64 문자(A-Z a-z 0-9 + / =)만 남김
  const pemStripped = privateKey
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/[^A-Za-z0-9+\/=]/g, '');
  const keyBytes = Uint8Array.from(atob(pemStripped), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const sigBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${b64url(sigBuffer)}`;

  // JWT → 액세스 토큰 교환
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  const tokenData = await res.json();
  if (!tokenData.access_token) {
    throw new Error('토큰 발급 실패: ' + JSON.stringify(tokenData));
  }
  return tokenData.access_token;
}

// ── FCM v1 API 메시지 발송 ──
async function sendFCMMessage(accessToken, projectId, token, title, body, data) {
  // data 값은 모두 문자열이어야 함
  const safeData = {};
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      safeData[k] = String(v);
    }
  }

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          token,
          // notification 필드 제거: Firebase SDK가 자동표시 + showNotification 중복 원인
          // webpush.notification만 사용: Chrome/iOS가 네이티브로 1번만 표시
          // data에 notifType 포함: notificationclick 핸들러에서 사용
          webpush: {
            notification: {
              title,
              body,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              data: { notifType: (data && data.type) || 'notice' }
            },
            fcm_options: {
              link: 'https://pungsan-fitness.juyoun79.workers.dev'
            }
          },
          // data 필드: 서비스워커에서 중복 방지용 식별자 포함
          data: { ...safeData, _title: title, _body: body, _fromNotification: 'true' }
        }
      })
    }
  );

  const result = await res.json();
  if (result.error) throw new Error(JSON.stringify(result.error));
  return result;
}

// ── 유틸리티 ──
function b64url(input) {
  let binary;
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    binary = Array.from(bytes, b => String.fromCharCode(b)).join('');
  } else {
    // JSON 문자열 → UTF-8 바이트 → base64
    const encoded = new TextEncoder().encode(input);
    binary = Array.from(encoded, b => String.fromCharCode(b)).join('');
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// ── Cron: 종료일 지난 챌린지 자동 종료 + 보상 자동 지급 ──
async function handleCronAutoClose(env) {
  // Firebase REST API로 챌린지 데이터 조회
  const FIREBASE_DB = 'https://pungsan-fitness-default-rtdb.asia-southeast1.firebasedatabase.app';
  const today = new Date().toISOString().slice(0, 10);

  try {
    // 진행중 챌린지 전체 조회
    const res = await fetch(`${FIREBASE_DB}/challenges.json?orderBy="status"&equalTo="ongoing"`, {
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) { console.error('Cron: Firebase 조회 실패'); return; }
    const challenges = await res.json();
    if (!challenges) { console.log('Cron: 진행중 챌린지 없음'); return; }

    for (const [challengeId, c] of Object.entries(challenges)) {
      // 1) 점수 먼저 갱신 (종료 여부 무관하게 진행중 챌린지 전체)
      if (c.participants) {
        await _cronRefreshScores(env, challengeId, c, FIREBASE_DB);
      }
    }
    console.log('Cron: 점수 갱신 완료');

    // 갱신된 데이터로 다시 조회
    const res2 = await fetch(`${FIREBASE_DB}/challenges.json?orderBy="status"&equalTo="ongoing"`, {
      headers: { 'Content-Type': 'application/json' }
    });
    const challenges2 = res2.ok ? await res2.json() : challenges;

    for (const [challengeId, c] of Object.entries(challenges2 || challenges)) {
      // 2) 종료일이 오늘 이하면 자동 종료
      if (c.endDate <= today && c.status === 'ongoing') {
        console.log('Cron: 자동 종료 처리 -', c.name);

        await fetch(`${FIREBASE_DB}/challenges/${challengeId}/status.json`, {
          method: 'PUT',
          body: JSON.stringify('ended')
        });

        // 3) 보상 미지급이면 자동 지급
        if (!c.rewardPaid && c.participants) {
          await _cronPayReward(env, challengeId, c, FIREBASE_DB, today);
        }
      }
    }
    console.log('Cron: 자동 종료 처리 완료');
  } catch(err) {
    console.error('Cron 오류:', err.message);
  }
}

async function _cronRefreshScores(env, challengeId, c, FIREBASE_DB) {
  const participants = c.participants || {};
  const startDate = c.startDate || '';
  const endDate = c.endDate || new Date().toISOString().slice(0, 10);
  const INBODY_TYPES = ['fat_loss','muscle_gain','weight_loss','fitness_score','fat_rate'];

  for (const [uid] of Object.entries(participants)) {
    try {
      let score = 0;
      if (INBODY_TYPES.includes(c.type)) {
        const snap = await fetch(`${FIREBASE_DB}/users/${uid}/inbody.json?orderByKey()&startAt="${startDate}"&endAt="${endDate}"`);
        const inbodyData = snap.ok ? await snap.json() : null;
        if (inbodyData) {
          const entries = Object.entries(inbodyData).filter(([d]) => d >= startDate && d <= endDate).sort((a,b) => a[0].localeCompare(b[0]));
          if (entries.length >= 2) {
            const first = entries[0][1], last = entries[entries.length-1][1];
            if (c.type === 'fat_loss')      score = Math.max(0, parseFloat(((first.fat||0)-(last.fat||0)).toFixed(1)));
            else if (c.type === 'muscle_gain')   score = Math.max(0, parseFloat(((last.muscle||0)-(first.muscle||0)).toFixed(1)));
            else if (c.type === 'weight_loss')   score = Math.max(0, parseFloat(((first.weight||0)-(last.weight||0)).toFixed(1)));
            else if (c.type === 'fitness_score') score = Math.max(0, (last.fitnessScore||0)-(first.fitnessScore||0));
            else if (c.type === 'fat_rate')      score = Math.max(0, parseFloat(((first.fatRate||0)-(last.fatRate||0)).toFixed(1)));
          }
        }
      } else {
        if (c.type === 'attendance') {
          const snap = await fetch(`${FIREBASE_DB}/users/${uid}/attendance.json`);
          const data = snap.ok ? await snap.json() : null;
          if (data) score = Object.keys(data).filter(d => d >= startDate && d <= endDate).length;
        } else if (c.type === 'workout') {
          const snap = await fetch(`${FIREBASE_DB}/workouts/${uid}.json`);
          const data = snap.ok ? await snap.json() : null;
          if (data) score = Object.keys(data).filter(d => d >= startDate && d <= endDate).length;
        } else if (c.type === 'diet') {
          const snap = await fetch(`${FIREBASE_DB}/users/${uid}/diet.json`);
          const data = snap.ok ? await snap.json() : null;
          if (data) score = Object.keys(data).filter(d => d >= startDate && d <= endDate).length;
        } else if (c.type === 'owunwan') {
          const snap = await fetch(`${FIREBASE_DB}/users/${uid}/owunwan.json`);
          const data = snap.ok ? await snap.json() : null;
          if (data) score = Object.keys(data).filter(d => d >= startDate && d <= endDate).length;
        } else if (c.type === 'points') {
          const snap = await fetch(`${FIREBASE_DB}/users/${uid}/pointHistory.json`);
          const data = snap.ok ? await snap.json() : null;
          if (data) score = Object.values(data).filter(v => v && v.date >= startDate && v.date <= endDate && v.amount > 0).reduce((s,v) => s + v.amount, 0);
        }
      }
      await fetch(`${FIREBASE_DB}/challenges/${challengeId}/participants/${uid}/score.json`, {
        method: 'PUT', body: JSON.stringify(score)
      });
    } catch(e) {
      console.error('Cron 점수 갱신 오류 uid:', uid, e.message);
    }
  }
  console.log('Cron: 점수 갱신 완료 -', c.name);
}

async function _cronPayReward(env, challengeId, c, FIREBASE_DB, today) {
  const rankCount  = c.rewardRankCount || 3;
  const participants = c.participants || {};
  const expEnd = c.couponExpireEnd || new Date(Date.now() + 30*86400000).toISOString().slice(0,10);
  const expStart = c.couponExpireStart || today;

  // 점수 순 정렬 + 동점자 순위 부여
  const sorted = Object.entries(participants)
    .map(([uid, data]) => ({ uid, ...data }))
    .sort((a, b) => (b.score||0) - (a.score||0));

  let currentRank = 1;
  sorted.forEach((entry, i) => {
    if (i > 0 && (entry.score||0) < (sorted[i-1].score||0)) {
      currentRank = i + 1;
    }
    entry.rank = currentRank;
  });

  // FCM 액세스 토큰 (푸시 발송용)
  let accessToken = null;
  try {
    accessToken = await getFCMAccessToken(env.FCM_PRIVATE_KEY, env.FCM_CLIENT_EMAIL);
  } catch(e) {
    console.error('Cron: FCM 토큰 발급 실패', e.message);
  }

  for (let i = 0; i < sorted.length; i++) {
    const { uid } = sorted[i];
    const rankNum  = sorted[i].rank;
    const isRanked = rankNum <= rankCount;

    // FCM 토큰 조회
    let fcmToken = null;
    if (accessToken) {
      const tokenRes = await fetch(`${FIREBASE_DB}/fcm_tokens/${uid}.json`);
      if (tokenRes.ok) fcmToken = await tokenRes.json();
    }

    if (c.rewardType === 'point') {
      const pts    = c.rewardPoints || {};
      const ranked = isRanked ? (pts['rank' + rankNum] || 0) : 0;
      // 전원 보상은 순위 밖 참여자에게만 지급
      const allPts = !isRanked ? (pts.all || 0) : 0;
      const total  = ranked + allPts;
      if (total > 0) {
        // 현재 포인트 조회 후 합산
        const ptRes = await fetch(`${FIREBASE_DB}/users/${uid}/points.json`);
        const curPts = ptRes.ok ? (await ptRes.json() || 0) : 0;
        await fetch(`${FIREBASE_DB}/users/${uid}/points.json`, {
          method: 'PUT', body: JSON.stringify(curPts + total)
        });
        // 포인트 히스토리 기록
        const histKey = '-' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
        await fetch(`${FIREBASE_DB}/users/${uid}/pointHistory/${histKey}.json`, {
          method: 'PUT', body: JSON.stringify({ amount: total, date: today, label: '챌린지 보상' })
        });
        // 푸시 알림 발송
        if (fcmToken && accessToken) {
          const rankLabel = isRanked ? `${rankNum}위 달성! ` : '';
          await sendFCMMessage(accessToken, 'pungsan-fitness', fcmToken,
            '🏆 챌린지 보상 도착!',
            `"${c.name}" ${rankLabel}${total}P가 적립됐어요! 🎉`,
            { type: 'challenge_reward' }
          ).catch(() => {});
        }
      }
    } else {
      const coupons    = c.rewardCoupons || {};
      const couponName = isRanked ? (coupons['rank' + rankNum] || '') : '';
      // 전원 쿠폰도 순위 밖 참여자에게만 지급
      const allCoupon  = !isRanked ? (coupons.all || '') : '';
      const issuedAt   = today;

      if (couponName) {
        const couponKey = '-' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
        await fetch(`${FIREBASE_DB}/users/${uid}/coupons/${couponKey}.json`, {
          method: 'PUT',
          body: JSON.stringify({ name: couponName, type: 'challenge', issuedAt, expireAt: expEnd, startAt: expStart, used: false })
        });
        if (fcmToken && accessToken) {
          await sendFCMMessage(accessToken, 'pungsan-fitness', fcmToken,
            '🏆 챌린지 보상 도착!',
            `"${c.name}" ${rankNum}위 보상 쿠폰이 도착했어요! 🎉`,
            { type: 'challenge_reward' }
          ).catch(() => {});
        }
      }
      if (allCoupon) {
        const couponKey2 = '-' + (Date.now()+1).toString(36) + Math.random().toString(36).slice(2,7);
        await fetch(`${FIREBASE_DB}/users/${uid}/coupons/${couponKey2}.json`, {
          method: 'PUT',
          body: JSON.stringify({ name: allCoupon, type: 'challenge', issuedAt, expireAt: expEnd, startAt: expStart, used: false })
        });
      }
    }
  }

  // rewardPaid 플래그 세팅
  await fetch(`${FIREBASE_DB}/challenges/${challengeId}/rewardPaid.json`, {
    method: 'PUT', body: JSON.stringify(true)
  });
  console.log('Cron: 보상 지급 완료 -', c.name);
}
