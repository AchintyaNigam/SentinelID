import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';

import { UnauthenticatedError } from '@/lib/auth/require-auth';
import { ForbiddenError } from '@/lib/auth/require-role';
import { requirePermission } from '@/lib/auth/require-permission';

import {
  assertDocumentAccess,
  DocumentNotFoundError,
} from '@/lib/documents/authorization';

import { getDocument } from '@/lib/documents/repository';
import { DOCUMENTS_BUCKET, s3Client } from '@/lib/aws/s3';

const DOWNLOAD_URL_EXPIRY_SECONDS = 60;

const documentIdSchema = z.string().uuid();

interface RouteContext {
  params: Promise<{
    documentId: string;
  }>;
}

/**
 * Encodes a filename for use in an HTTP Content-Disposition header.
 */
function createContentDisposition(fileName: string): string {
  const safeFileName = fileName
    .replace(/[\r\n\0]/g, '_');

  const encodedFileName = encodeURIComponent(safeFileName)
    .replace(/['()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );

  return `attachment; filename*=UTF-8''${encodedFileName}`;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    // 1. Authenticate the user and check general read permission.
    const user = await requirePermission('documents:read');

    // 2. Validate the requested document ID.
    const { documentId } = await context.params;

    const parsedId = documentIdSchema.safeParse(documentId);

    if (!parsedId.success) {
      return NextResponse.json(
        { error: 'Invalid document ID.' },
        { status: 400 },
      );
    }

    // 3. Retrieve the document from DynamoDB.
    const document = await getDocument(parsedId.data);

    // 4. Enforce resource-level authorization.
    assertDocumentAccess(user, document, 'read');

    // 5. Generate a short-lived S3 download URL.
    const command = new GetObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: document.s3_key,
      ResponseContentType: document.content_type,
      ResponseContentDisposition: createContentDisposition(
        document.file_name,
      ),
    });

    const downloadUrl = await getSignedUrl(
      s3Client,
      command,
      {
        expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS,
      },
    );

    // 6. Return the temporary URL.
    return NextResponse.json(
      {
        download_url: downloadUrl,
        expires_in: DOWNLOAD_URL_EXPIRY_SECONDS,
        file_name: document.file_name,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 },
      );
    }

    if (
      error instanceof ForbiddenError ||
      error instanceof DocumentNotFoundError
    ) {
      return NextResponse.json(
        { error: 'Document not found or not accessible.' },
        { status: 404 },
      );
    }

    console.error('Failed to generate document download URL:', error);

    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}

