
import { NextResponse } from 'next/server';

import { requirePermission } from '../../../../lib/auth/require-permission';
import { ForbiddenError } from '../../../../lib/auth/require-role';
import { UnauthenticatedError } from '../../../../lib/auth/require-auth';

export async function GET() {
  try {
    const user = await requirePermission('audit:read');

    return NextResponse.json({
      success: true,
      message: 'You have permission to read audit information.',
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
        { error: 'Insufficient permissions.' },
        { status: 403 },
      );
    }

    console.error('Audit permission check failed.');

    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}

