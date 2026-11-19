
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';

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
  DOCUMENTS_BUCKET,
  s3Client,
} from '@/lib/aws/s3';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const UPLOAD_URL_EXPIRY = 300;

const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
] as const;

const uploadSchema = z.object({
  file_name: z.string().trim().min(1).max(255),
  content_type: z.enum(ALLOWED_CONTENT_TYPES),
  file_size: z.number().int().positive().max(MAX_FILE_SIZE),
});
export async function POST(request: Request) {
  try {
    // 1. Authenticate and verify upload permission.
    const user = await requirePermission('documents:upload');

    // 2. Parse and validate the request body.
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body.' },
        { status: 400 },
      );
    }

    const validation = uploadSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid upload request.',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { file_name, content_type, file_size } = validation.data;

    // 3. Sanitize the filename. It is metadata, not an S3 key.
    const safeFileName = file_name
      .replace(/[\/\\\u0000-\u001F\u007F]/g, '_')
      .trim();

    if (!safeFileName) {
      return NextResponse.json(
        { error: 'Invalid filename.' },
        { status: 400 },
      );
    }

    // 4. Generate the document ID and S3 key on the server.
    const documentId = randomUUID();
    const s3Key = `documents/${documentId}`;

    const uploadExpiresAt =
      Math.floor(Date.now() / 1000) + UPLOAD_URL_EXPIRY;

    // 5. Create a presigned S3 PUT operation.
    const command = new PutObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: s3Key,
      ContentType: content_type,
      Metadata: {
        'document-id': documentId,
        'owner-id': user.sub,
        'file-size': String(file_size),
        'file-name-b64': Buffer.from(safeFileName, 'utf8').toString('base64url'),
        'upload-expires-at': String(uploadExpiresAt),
      },
      IfNoneMatch: '*',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: UPLOAD_URL_EXPIRY,
    
      // Keep these x-amz metadata headers in the signed request.
      unhoistableHeaders: new Set([
        'x-amz-meta-document-id',
        'x-amz-meta-owner-id',
        'x-amz-meta-file-size',
        'x-amz-meta-file-name-b64',
        'x-amz-meta-upload-expires-at',
      ]),
    
      // Require the browser to send these headers as signed.
      signableHeaders: new Set([
        'content-type',
        'if-none-match',
      ]),
    });

    // 6. Return only the information needed by the client.
    return NextResponse.json(
      {
        document_id: documentId,
        upload_url: uploadUrl,
        expires_in: UPLOAD_URL_EXPIRY,
        required_headers: {
          'Content-Type': content_type,
          'x-amz-meta-document-id': documentId,
          'x-amz-meta-owner-id': user.sub,
          'x-amz-meta-file-size': String(file_size),
          'x-amz-meta-upload-expires-at': String(uploadExpiresAt),
          'x-amz-meta-file-name-b64': Buffer.from(
            safeFileName,
            'utf8',
          ).toString('base64url'),
          'If-None-Match': '*',
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 },
      );
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { error: 'You do not have permission to upload documents.' },
        { status: 403 },
      );
    }

    console.error('Failed to create upload URL:', error);

    return NextResponse.json(
      { error: 'Unable to initiate document upload.' },
      { status: 500 },
    );
  }
}

