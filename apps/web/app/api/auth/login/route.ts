import * as client from 'openid-client';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Import the OIDC configuration helper
import { getOidcConfig } from '../../../../lib/auth/oidc';

// Temporary cookies expire after 10 minutes (gives the user time to log in)
const COOKIE_MAX_AGE = 10 * 60;

export async function GET() {
  try {
    // 1. Fetch the OIDC configuration (discovers Cognito endpoints)
    const config = await getOidcConfig();

    // Read the redirect URI (where Cognito should send the user back after login)
    const redirectUri = process.env.COGNITO_REDIRECT_URI;

    if (!redirectUri) {
      throw new Error('Missing Cognito redirect URI.');
    }

    // 2. Generate unique cryptographic values for this specific login attempt (PKCE & Security)
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge =
      await client.calculatePKCECodeChallenge(codeVerifier);

    const state = client.randomState();
    const nonce = client.randomNonce();

    // 3. Build the secure login URL for AWS Cognito
    const authorizationUrl = client.buildAuthorizationUrl(config, {
      response_type: 'code',          // We want an authorization code back
      redirect_uri: redirectUri,      // Where to send the user after successful login
      scope: 'openid email profile',  // What user info we are requesting access to
      code_challenge: codeChallenge,  // PKCE challenge to prevent interception attacks
      code_challenge_method: 'S256',  // Algorithm used for the PKCE challenge
      state,                          // Random string to prevent CSRF attacks
      nonce,                          // Random string to prevent ID token replay attacks
    });

    // 4. Access Next.js cookie store to save temporary validation tokens
    const cookieStore = await cookies();

    // Define strict security options for the temporary cookies
    const cookieOptions = {
      httpOnly: true,                               // Inaccessible to JavaScript (prevents XSS theft)
      secure: process.env.NODE_ENV === 'production', // Only sent over HTTPS in production
      sameSite: 'lax' as const,                     // Protects against cross-site request forgery
      path: '/',                                    // Available across the entire site
      maxAge: COOKIE_MAX_AGE,                       // Deletes automatically after 10 minutes
    };

    // Store the PKCE verifier (needed later to prove our app initiated the request)
    cookieStore.set(
      'sentinelid_pkce_verifier',
      codeVerifier,
      cookieOptions,
    );

    // Store state (verified on return to ensure the response belongs to this request)
    cookieStore.set(
      'sentinelid_oauth_state',
      state,
      cookieOptions,
    );

    // Store nonce (verified inside the ID token to ensure it wasn't replayed)
    cookieStore.set(
      'sentinelid_oidc_nonce',
      nonce,
      cookieOptions,
    );

    // 5. Redirect the user's browser over to the AWS Cognito hosted login page
    return NextResponse.redirect(authorizationUrl);
    
  } catch (error) {
    console.error('Authentication initiation failed:', error);

    // Fallback response if configuration or environment variables fail
    return NextResponse.json(
      { error: 'Unable to initiate authentication.' },
      { status: 500 },
    );
  }
}
