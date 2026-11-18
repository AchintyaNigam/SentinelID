
import 'server-only';

import * as client from 'openid-client';

import { getOidcConfig } from './oidc';
import {
  updateSession,
  type CognitoTokenSet,
} from './session';

export async function refreshSessionTokens(
  sessionId: string,
  currentTokens: CognitoTokenSet,
): Promise<CognitoTokenSet> {
  const config = await getOidcConfig();

  // Use the existing Cognito refresh token to obtain new tokens.
  const refreshed = await client.refreshTokenGrant(
    config,
    currentTokens.refreshToken,
  );

  if (
    !refreshed.access_token ||
    !refreshed.id_token ||
    typeof refreshed.expires_in !== 'number' ||
    refreshed.expires_in <= 0
  ) {
    throw new Error('Cognito returned an incomplete refresh response.');
  }

  const now = Math.floor(Date.now() / 1000);

  const updatedTokens: CognitoTokenSet = {
    accessToken: refreshed.access_token,
    idToken: refreshed.id_token,

    // Cognito may return a replacement refresh token if rotation is enabled.
    // Otherwise, retain the existing refresh token.
    refreshToken:
      refreshed.refresh_token ?? currentTokens.refreshToken,

    accessTokenExpiresAt: now + refreshed.expires_in,
  };

  // Persist the new encrypted tokens before returning them.
  await updateSession(sessionId, updatedTokens);

  return updatedTokens;
}

