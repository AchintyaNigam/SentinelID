import { NextResponse } from 'next/server';

import {
  UnauthenticatedError,
} from '@/lib/auth/require-auth';

import {
  ForbiddenError,
} from '@/lib/auth/require-role';

import {
  requirePermission,
} from '@/lib/auth/require-permission';

import {
  canListAllDocuments,
} from '@/lib/documents/authorization';

import {
  getAllDocuments,
  getDocumentsByOwner,
  type DocumentCursor,
} from '@/lib/documents/repository';

type CursorMode = 'all' | 'owner';

function encodeCursor(
  mode: CursorMode,
  key: DocumentCursor,
): string {
  return Buffer.from(
    JSON.stringify({ mode, key }),
  ).toString('base64url');
}

function decodeCursor(
  value: string,
  expectedMode: CursorMode,
): DocumentCursor | undefined {
  try {
    if (value.length > 2048) {
      throw new Error('Cursor is too large.');
    }

    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('mode' in parsed) ||
      !('key' in parsed) ||
      parsed.mode !== expectedMode ||
      typeof parsed.key !== 'object' ||
      parsed.key === null ||
      Array.isArray(parsed.key)
    ) {
      throw new Error('Invalid cursor.');
    }

    const key = parsed.key as Record<string, unknown>;
    const entries = Object.entries(key);

    // A Scan uses the table's document_id partition key.
    // A Query on the owner-created-index uses all three keys.
    const expectedKeys =
      expectedMode === 'all'
        ? ['document_id']
        : ['created_at', 'document_id', 'owner_id'];

    const actualKeys = entries
      .map(([name]) => name)
      .sort();

    if (
      JSON.stringify(actualKeys) !==
      JSON.stringify(expectedKeys)
    ) {
      throw new Error('Invalid cursor key.');
    }

    if (
      typeof key.document_id !== 'string' ||
      (
        expectedMode === 'owner' &&
        (
          typeof key.owner_id !== 'string' ||
          typeof key.created_at !== 'number'
        )
      )
    ) {
      throw new Error('Invalid cursor values.');
    }

    return key as DocumentCursor;
  } catch {
    return undefined;
  }
}

export async function GET(request: Request) {
  try {
    // 1. Authenticate and check the documents:read permission.
    const user = await requirePermission('documents:read');

    // 2. Determine the listing scope from the authenticated user.
    const canViewAll = canListAllDocuments(user);
    const mode: CursorMode = canViewAll ? 'all' : 'owner';

    // 3. Parse and validate pagination parameters.
    const url = new URL(request.url);

    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit === null ? 20 : Number(rawLimit);

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return NextResponse.json(
        { error: 'Limit must be an integer between 1 and 100.' },
        { status: 400 },
      );
    }

    const rawCursor = url.searchParams.get('cursor');
    let exclusiveStartKey: DocumentCursor | undefined;

    if (rawCursor !== null) {
      exclusiveStartKey = decodeCursor(rawCursor, mode);

      if (!exclusiveStartKey) {
        return NextResponse.json(
          { error: 'Invalid pagination cursor.' },
          { status: 400 },
        );
      }
    }

    // 4. Retrieve only the documents this user is permitted to see.
    const result = canViewAll
      ? await getAllDocuments({
          limit,
          exclusiveStartKey,
        })
      : await getDocumentsByOwner(user.sub, {
          limit,
          exclusiveStartKey,
        });

    // 5. Expose metadata only. Never return internal S3 keys.
    const documents = result.documents.map((document) => ({
      document_id: document.document_id,
      file_name: document.file_name,
      content_type: document.content_type,
      file_size: document.file_size,
      created_at: document.created_at,
      ...(canViewAll
        ? { owner_id: document.owner_id }
        : {}),
    }));

    const nextCursor = result.lastEvaluatedKey
      ? encodeCursor(mode, result.lastEvaluatedKey)
      : null;

    return NextResponse.json({
      documents,
      pagination: {
        limit,
        nextCursor,
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
        { error: 'You do not have permission to view documents.' },
        { status: 403 },
      );
    }

    console.error('Failed to list documents:', error);

    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 },
    );
  }
}

