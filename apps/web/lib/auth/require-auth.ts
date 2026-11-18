
import 'server-only';

import { cookies } from 'next/headers';
import {
  createRemoteJWKSet,
  jwtVerify,
} from 'jose';

import { getSession } from './session';
import { refreshSessionTokens } from './refresh';

const SESSION_COOKIE_NAME = 'sentinelid_session';
const REFRESH_THRESHOLD_SECONDS = 60;

const issuer = process.env.COGNITO_ISSUER;
const clientId = process.env.COGNITO_CLIENT_ID;

if (!issuer || !clientId) {
  throw new Error('Missing Cognito environment configuration.');
}

const jwks = createRemoteJWKSet(
  new URL(`${issuer}/.well-known/jwks.json`),
);

export class UnauthenticatedError extends Error {
  constructor(message = 'Authentication required.') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

export interface AuthenticatedUser {
  sub: string;
  email?: string;
  groups: string[];
}

export async function requireAuth(): Promise<AuthenticatedUser> {
  const cookieStore = await cookies();

  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    throw new UnauthenticatedError();
  }

  let session = await getSession(sessionId);

  if (!session) {
    throw new UnauthenticatedError('Session is invalid or expired.');
  }

  const now = Math.floor(Date.now() / 1000);

  // Refresh before the access token expires.
  if (
    session.accessTokenExpiresAt <=
    now + REFRESH_THRESHOLD_SECONDS
  ) {
    try {
      session = await refreshSessionTokens(sessionId, session);
    } catch {
      // Never expose OAuth errors or token values to the caller.
      throw new UnauthenticatedError(
        'Session expired or could not be refreshed. Please sign in again.',
      );
    }
  }

  try {
    const { payload } = await jwtVerify(
      session.idToken,
      jwks,
      {
        issuer,
        audience: clientId,
      },
    );

    if (
      payload.token_use !== 'id' ||
      typeof payload.sub !== 'string'
    ) {
      throw new UnauthenticatedError('Invalid identity token.');
    }

    const rawGroups = payload['cognito:groups'];

    const groups = Array.isArray(rawGroups)
      ? rawGroups.filter(
          (group): group is string => typeof group === 'string',
        )
      : [];

    return {
      sub: payload.sub,
      ...(typeof payload.email === 'string'
        ? { email: payload.email }
        : {}),
      groups,
    };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      throw error;
    }

    throw new UnauthenticatedError(
      'Identity token validation failed.',
    );
  }
}
