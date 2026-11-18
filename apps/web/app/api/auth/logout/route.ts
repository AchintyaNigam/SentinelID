
import * as client from 'openid-client';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { getOidcConfig } from '../../../../lib/auth/oidc';
import {
  deleteSession,
  getSession,
} from '../../../../lib/auth/session';

const SESSION_COOKIE_NAME = 'sentinelid_session';

function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}

export async function POST(request: NextRequest) {
  // Require a same-origin browser request to protect this state-changing route.
const origin = request.headers.get('origin');

if (!origin) {
  return NextResponse.json(
    { error: 'Invalid request origin.' },
    { status: 403 },
  );
}

  const cognitoDomain = process.env.COGNITO_DOMAIN;
  const clientId = process.env.COGNITO_CLIENT_ID;
  const logoutUri = process.env.COGNITO_LOGOUT_URI;

  if (!cognitoDomain || !clientId || !logoutUri) {
    console.error('Cognito logout configuration is incomplete.');

    return NextResponse.json(
      { error: 'Logout is temporarily unavailable.' },
      { status: 500 },
    );
  }

  const cognitoLogoutUrl = new URL('/logout', cognitoDomain);

  cognitoLogoutUrl.searchParams.set('client_id', clientId);
  cognitoLogoutUrl.searchParams.set('logout_uri', logoutUri);

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  let revocationFailed = false;

  if (sessionId) {
    try {
      const session = await getSession(sessionId);

      if (session) {
        const config = await getOidcConfig();

        await client.tokenRevocation(
          config,
          session.refreshToken,
          {
            revoke_associated_sessions: 'LINKED',
          },
        );
      }
    } catch {
      // Continue with local logout even if Cognito revocation fails.
      revocationFailed = true;
      console.error('Cognito token revocation failed during logout.');
    }

    try {
      // Remove the server-side session regardless of revocation outcome.
      await deleteSession(sessionId);
    } catch {
      console.error('DynamoDB session deletion failed during logout.');

      const response = NextResponse.json(
        { error: 'Unable to fully terminate the application session.' },
        { status: 500 },
      );

      return clearSessionCookie(response);
    }
  }

  if (revocationFailed) {
    // The local session is removed, but remote token revocation
    // could not be confirmed. Do not log or expose token values.
    console.warn('Logout completed locally; Cognito revocation needs investigation.');
  }

  const response = NextResponse.redirect(cognitoLogoutUrl);

  return clearSessionCookie(response);
}

