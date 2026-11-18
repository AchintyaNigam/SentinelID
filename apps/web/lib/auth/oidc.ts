// Ensures this module can ONLY be imported in server-side code (Next.js security guard)
import 'server-only';

import * as client from 'openid-client';

// Module-level variable to cache the OIDC configuration promise 
// so we only perform the discovery request once during the application's lifecycle.
let configPromise: Promise<client.Configuration> | undefined;

/**
 * Retrieves or initializes the OIDC client configuration for AWS Cognito.
 * Uses lazy loading and caches the result for subsequent calls.
 */
export function getOidcConfig(): Promise<client.Configuration> {
  // If the configuration hasn't been fetched yet, initialize it
  if (!configPromise) {
    // Read required AWS Cognito environment variables
    const issuer = process.env.COGNITO_ISSUER;
    const clientId = process.env.COGNITO_CLIENT_ID;

    // Ensure the environment variables are defined; throw an error early if missing
    if (!issuer || !clientId) {
      throw new Error('Missing Cognito environment configuration.');
    }

    // Perform OIDC discovery to automatically fetch endpoints (JWKS, token endpoint, etc.)
    configPromise = client.discovery(
      new URL(issuer),
      clientId,
      undefined,          // Optional client secret (undefined for public clients)
      client.None(),      // Client authentication method (None = public client, no secret required)
    );
  }

  // Return the cached or newly created configuration promise
  return configPromise;
}

/**
* discovery() retrieves the OpenID Connect metadata from Cognito's issuer.
*
* client.None() explicitly tells the library not to use client-secret authentication.
*
*configPromise caches the discovery operation within the running server process. We don't need to fetch the metadata again for every login request.
*
*server-only prevents this module from accidentally being imported into client-side code.
**/
