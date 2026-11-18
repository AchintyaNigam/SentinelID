import { NextResponse } from 'next/server';

import {
  requireAuth,
  UnauthenticatedError,
} from '../../../../lib/auth/require-auth';

export async function GET() {
  try {
    const user = await requireAuth();

    return NextResponse.json({
      authenticated: true,
      user: {
        sub: user.sub,
        email: user.email,
        groups: user.groups,
      },
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 },
      );
    }

    console.error('Identity endpoint failed.');

    return NextResponse.json(
      { error: 'Unable to retrieve user identity.' },
      { status: 500 },
    );
  }
}
