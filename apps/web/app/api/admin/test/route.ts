
import { NextResponse } from 'next/server';

import {
  ForbiddenError,
  requireRole,
} from '../../../../lib/auth/require-role';
import { UnauthenticatedError } from '../../../../lib/auth/require-auth';

export async function GET() {
  try {
    const user = await requireRole(['Admin']);

    return NextResponse.json({
      success: true,
      message: 'You have access to the Admin endpoint.',
      user: {
        sub: user.sub,
        email: user.email,
        groups: user.groups,
      },
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 },
      );
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { error: 'You do not have permission to access this resource.' },
        { status: 403 },
      );
    }

    console.error('Admin endpoint failed.');

    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}

