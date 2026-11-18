import * as client from 'openid-client';
import { EncryptJWT } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { getOidcConfig } from '../../../../lib/auth/oidc';

// Name of the final encrypted session cookie stored in the user's browser
const SESSION_COOKIE = 'sentinelid_session';

// Temporary cookies created during login initiation that must now be cleaned up
const TRANSACTION_COOKIES = [
  'sentinelid_pkce_verifier',
  'sentinelid_oauth_state',
  'sentinelid_oidc_nonce',
] as const;

const SESSION_MAX_AGE = 60 * 60 * 24; // Session lasts for 1 day
const MAX_COOKIE_SIZE = 3800; // Safe limit below the standard 4 KB browser cookie cap

/**
 * Helper function to delete temporary verification cookies by expiring them immediately (maxAge: 0)
 */
function clearTransactionCookies(response: NextResponse): void {
  for (const name of TRANSACTION_COOKIES) {
    response.cookies.set(name, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0, // Deletes the cookie
    });
  }
}

/**
 * Helper function to handle failed authentication attempts.
 * Wipes all cookies and redirects the user back to the home page with an error flag.
 */
function authenticationFailure(request: NextRequest): NextResponse {
  const response = NextResponse.redirect(
    new URL('/?auth_error=authentication_failed', request.url),
    303,
  );

  clearTransactionCookies(response);

  // Also clear any existing session cookie
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();

  // Retrieve the temporary security values saved when login was initiated
  const codeVerifier = cookieStore.get(
    'sentinelid_pkce_verifier',
  )?.value;

  const expectedState = cookieStore.get(
    'sentinelid_oauth_state',
  )?.value;

  const expectedNonce = cookieStore.get(
    'sentinelid_oidc_nonce',
  )?.value;

  // 1. Check if Cognito returned an error parameter instead of a login code
  if (request.nextUrl.searchParams.has('error')) {
    console.error(
      'Cognito returned an OAuth error:',
      request.nextUrl.searchParams.get('error'),
    );

    return authenticationFailure(request);
  }

  // 2. Ensure all three transaction validation cookies exist
  if (!codeVerifier || !expectedState || !expectedNonce) {
    console.error('OAuth transaction cookies are missing or expired.');
    return authenticationFailure(request);
  }

  try {
    const config = await getOidcConfig();

    // 3. Exchange the temporary authorization code for real tokens and validate state/nonce/PKCE
    const tokens = await client.authorizationCodeGrant(
      config,
      new URL(request.url),
      {
        pkceCodeVerifier: codeVerifier,
        expectedState,
        expectedNonce,
      },
    );

    // Ensure all mandatory tokens were successfully received
    if (!tokens.access_token || !tokens.id_token) {
      throw new Error('Cognito did not return the required tokens.');
    }

    if (!tokens.refresh_token) {
      throw new Error('Cognito did not return a refresh token.');
    }

    // 4. Validate the server-side encryption key configuration
    const encryptionKey = process.env.SESSION_ENCRYPTION_KEY;

    if (!encryptionKey) {
      throw new Error('Session encryption key is not configured.');
    }

    const key = Buffer.from(encryptionKey, 'base64');

    if (key.length !== 32) {
      throw new Error('Session encryption key must be 32 bytes.');
    }

    const expiresIn =
      typeof tokens.expires_in === 'number'
        ? tokens.expires_in
        : 900;

    // 5. Encrypt all sensitive tokens into a secure JSON Web Encryption (JWE) string
    const session = await new EncryptJWT({
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      refreshToken: tokens.refresh_token,
      accessTokenExpiresAt: Date.now() + expiresIn * 1000,
    })
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }) // Direct encryption using AES-256-GCM
      .setIssuedAt()
      .setExpirationTime('1 day')
      .encrypt(key);

    // 6. Ensure the encrypted session isn't too large for a standard web browser cookie (< 4KB)
    if (Buffer.byteLength(session, 'utf8') > MAX_COOKIE_SIZE) {
      console.error(
        'Encrypted session exceeds the safe cookie-size limit.',
      );

      const response = NextResponse.json(
        {
          error:
            'The authentication session is too large for cookie storage. A server-side session store is required.',
        },
        { status: 500 },
      );

      clearTransactionCookies(response);
      return response;
    }

    // 7. Success! Redirect user to home page, wipe temporary transaction cookies, and set session cookie
    const response = NextResponse.redirect(new URL('/', request.url));

    clearTransactionCookies(response);

    response.cookies.set(SESSION_COOKIE, session, {
      httpOnly: true,                             // Blocks client-side JavaScript access (stops XSS token theft)
      secure: process.env.NODE_ENV === 'production', // Requires HTTPS in production
      sameSite: 'lax',                            // Defends against CSRF attacks
      path: '/',
      maxAge: SESSION_MAX_AGE,                    // Persists for 1 day
    });

    return response;
    
  } catch (error) {
    // Catch any validation, network, or cryptographic errors safely without exposing secrets
    console.error(
      'Cognito callback validation failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );

    return authenticationFailure(request);
  }
}
