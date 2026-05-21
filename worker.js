// Cloudflare Worker
// - 정적 파일 서빙 (기존 기능 유지)
// - /api/notify : FCM 푸시알림 발송 API 추가

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

    // 푸시알림 발송 API
    if (url.pathname === '/api/notify' && request.method === 'POST') {
      return handleNotify(request, env);
    }

    // 그 외 모든 요청: 정적 파일 서빙
    return env.ASSETS.fetch(request);
  }
};

// ── 푸시알림 발송 처리 ──
async function handleNotify(request, env) {
  try {
    const { tokens, title, body, data } = await request.json();

    if (!tokens || tokens.length === 0) {
      return jsonRes({ success: false, error: 'No tokens' }, 400);
    }

    // FCM v1 API 액세스 토큰 발급
    const accessToken = await getFCMAccessToken(env.FCM_PRIVATE_KEY, env.FCM_CLIENT_EMAIL);
    const projectId = 'pungsan-fitness';

    // 토큰별 발송 (병렬)
    const results = await Promise.allSettled(
      tokens.map(token => sendFCMMessage(accessToken, projectId, token, title, body, data))
    );

    const sent   = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return jsonRes({ success: true, sent, failed });

  } catch (err) {
    console.error('알림 발송 오류:', err);
    return jsonRes({ success: false, error: err.message }, 500);
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
  const pemStripped = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----\n?/g, '')
    .replace(/-----END PRIVATE KEY-----\n?/g, '')
    .replace(/\n/g, '');
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
          notification: { title, body },
          webpush: {
            notification: {
              title,
              body,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              requireInteraction: false,
              vibrate: [200, 100, 200]
            },
            fcm_options: {
              link: 'https://pungsan-fitness.juyoun79.workers.dev'
            }
          },
          data: safeData
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
