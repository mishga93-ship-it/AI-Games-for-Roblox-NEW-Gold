import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { getRobloxOAuthClientId, getRobloxOAuthClientSecret } from './config.js';

const ROBLOX_TOKEN_URL = 'https://apis.roblox.com/oauth/v1/token';
const ROBLOX_USERINFO_URL = 'https://apis.roblox.com/oauth/v1/userinfo';
const TOKEN_REFRESH_BUFFER_MS = 60_000;

interface RobloxTokenDoc {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  robloxUserId: string;
  robloxUsername?: string;
  updatedAt: number;
}

function robloxAuthRef(firebaseUid: string) {
  return getFirestore().collection('users').doc(firebaseUid).collection('private').doc('robloxAuth');
}

export async function exchangeRobloxCode(args: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  firebaseUid: string;
}): Promise<{ connected: boolean; robloxUserId: string; robloxUsername?: string }> {
  const clientId = getRobloxOAuthClientId();
  if (!clientId) throw new Error('ROBLOX_OAUTH_CLIENT_ID is not configured');

  const clientSecret = getRobloxOAuthClientSecret();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: clientId,
    code_verifier: args.codeVerifier,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
  });

  const tokenResponse = await fetch(ROBLOX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    logger.error('[robloxOAuth] Token exchange failed', { status: tokenResponse.status, body: errText });
    throw new Error(`Roblox token exchange failed: ${tokenResponse.status}`);
  }

  const tokens = await tokenResponse.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    id_token?: string;
    scope: string;
  };

  const userInfo = await fetchRobloxUserInfo(tokens.access_token);

  const doc: RobloxTokenDoc = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    robloxUserId: userInfo.sub,
    robloxUsername: userInfo.preferred_username,
    updatedAt: Date.now(),
  };

  await robloxAuthRef(args.firebaseUid).set(doc);

  logger.info('[robloxOAuth] Connected Roblox account', {
    firebaseUid: args.firebaseUid,
    robloxUserId: userInfo.sub,
    robloxUsername: userInfo.preferred_username,
  });

  return {
    connected: true,
    robloxUserId: userInfo.sub,
    robloxUsername: userInfo.preferred_username,
  };
}

export async function disconnectRoblox(firebaseUid: string): Promise<void> {
  await robloxAuthRef(firebaseUid).delete();
  logger.info('[robloxOAuth] Disconnected Roblox account', { firebaseUid });
}

export async function getRobloxUserToken(firebaseUid: string, forceRefresh = false): Promise<{
  accessToken: string;
  robloxUserId: string;
} | null> {
  const snap = await robloxAuthRef(firebaseUid).get();
  if (!snap.exists) {
    logger.info('[robloxOAuth] No auth doc for user', { firebaseUid });
    return null;
  }

  const data = snap.data() as RobloxTokenDoc;
  if (!data.accessToken || !data.refreshToken) {
    logger.warn('[robloxOAuth] Auth doc missing tokens', { firebaseUid });
    return null;
  }

  const now = Date.now();
  const ttlMs = data.expiresAt - now;
  logger.info('[robloxOAuth] Token state', {
    firebaseUid,
    ttlMs,
    expired: ttlMs <= TOKEN_REFRESH_BUFFER_MS,
    forceRefresh,
    robloxUserId: data.robloxUserId,
  });

  if (!forceRefresh && ttlMs > TOKEN_REFRESH_BUFFER_MS) {
    return { accessToken: data.accessToken, robloxUserId: data.robloxUserId };
  }

  logger.info('[robloxOAuth] Refreshing token...', { firebaseUid, forceRefresh, ttlMs });
  const refreshed = await refreshRobloxToken(data.refreshToken, firebaseUid, data.robloxUserId);
  if (!refreshed) {
    logger.warn('[robloxOAuth] Refresh failed, user needs to reconnect', { firebaseUid });
  } else {
    logger.info('[robloxOAuth] Token refreshed successfully', { firebaseUid });
  }
  return refreshed;
}

async function refreshRobloxToken(
  refreshToken: string,
  firebaseUid: string,
  robloxUserId: string,
): Promise<{ accessToken: string; robloxUserId: string } | null> {
  const clientId = getRobloxOAuthClientId();
  if (!clientId) return null;

  try {
    const clientSecret = getRobloxOAuthClientSecret();
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
    });

    const response = await fetch(ROBLOX_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      logger.warn('[robloxOAuth] Token refresh failed', {
        status: response.status,
        body: errBody,
        firebaseUid,
      });
      await robloxAuthRef(firebaseUid).delete();
      return null;
    }

    const tokens = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const doc: Partial<RobloxTokenDoc> = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      updatedAt: Date.now(),
    };

    await robloxAuthRef(firebaseUid).update(doc);

    return { accessToken: tokens.access_token, robloxUserId };
  } catch (err) {
    logger.error('[robloxOAuth] Token refresh error', { error: String(err) });
    return null;
  }
}

async function fetchRobloxUserInfo(accessToken: string): Promise<{
  sub: string;
  name?: string;
  preferred_username?: string;
}> {
  const response = await fetch(ROBLOX_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Roblox userinfo failed: ${response.status}`);
  }

  return await response.json() as { sub: string; name?: string; preferred_username?: string };
}
