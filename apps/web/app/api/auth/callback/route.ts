import * as client from 'openid-client';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { getOidcConfig } from '../../../../lib/auth/oidc';
import { createSession } from '../../../../lib/auth/session';

const SESSION_COOKIE_NAME = 'sentinelid_session';

const TRANSACTION_COOKIE_NAMES = [
  'sentinelid_pkce_verifier',
  'sentinelid_oauth_state',
  'sentinelid_oidc_nonce',
];

const COOKIE_MAX_AGE = 24 * 60 * 60;

function clearTransactionCookies(response: NextResponse): NextResponse {
  for (const name of TRANSACTION_COOKIE_NAMES) {
    response.cookies.set(name, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }

  return response;
}

function authenticationFailure(
  message: string,
  status: number,
): NextResponse {
  const response = NextResponse.json(
    { error: message },
    { status },
  );

  return clearTransactionCookies(response);
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();

    // Handle errors returned by Cognito.
    const oauthError = request.nextUrl.searchParams.get('error');

    if (oauthError) {
      return authenticationFailure(
        'Authentication was not completed.',
        400,
      );
    }

    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');

    const codeVerifier = cookieStore.get(
      'sentinelid_pkce_verifier',
    )?.value;

    const expectedState = cookieStore.get(
      'sentinelid_oauth_state',
    )?.value;

    const expectedNonce = cookieStore.get(
      'sentinelid_oidc_nonce',
    )?.value;

    if (
      !code ||
      !state ||
      !codeVerifier ||
      !expectedState ||
      !expectedNonce
    ) {
      return authenticationFailure(
        'Missing or invalid authentication parameters.',
        400,
      );
    }

    const redirectUri = process.env.COGNITO_REDIRECT_URI;

    if (!redirectUri) {
      throw new Error('Missing Cognito redirect URI.');
    }

    const config = await getOidcConfig();

    // Exchange the authorization code and validate PKCE, state and nonce.
    const tokens = await client.authorizationCodeGrant(
      config,
      new URL(request.url),
      {
        pkceCodeVerifier: codeVerifier,
        expectedState,
        expectedNonce,
      },
    );

    if (
      !tokens.access_token ||
      !tokens.id_token ||
      !tokens.refresh_token ||
      typeof tokens.expires_in !== 'number' ||
      tokens.expires_in <= 0
    ) {
      throw new Error('Incomplete token response from Cognito.');
    }

    // Store the encrypted token bundle in DynamoDB.
    const now = Math.floor(Date.now() / 1000);

    const session = await createSession({
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      refreshToken: tokens.refresh_token,
      accessTokenExpiresAt: now + tokens.expires_in,
    });

    // Give the browser only the opaque session ID.
    const response = NextResponse.redirect(
      new URL('/', request.url),
    );

    response.cookies.set(
      SESSION_COOKIE_NAME,
      session.sessionId,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: Math.min(
          COOKIE_MAX_AGE,
          Math.max(0, session.expiresAt - now),
        ),
      },
    );

    return clearTransactionCookies(response);
  } catch {
    // Do not log authorization codes, tokens, cookies or callback URLs.
    console.error('Authentication callback failed.');

    return authenticationFailure(
      'Unable to complete authentication.',
      500,
    );
  }
}
