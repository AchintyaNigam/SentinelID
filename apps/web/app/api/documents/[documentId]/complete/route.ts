import { NextResponse } from 'next/server';
import { HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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

import {
  createDocument,
  getDocument,
} from '@/lib/documents/repository';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
] as const;

const paramsSchema = z.object({
  documentId: z.string().uuid(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  let s3Key: string | undefined;
  let shouldDeleteObject = false;
  let documentId: string | undefined;
  try {
    // 1. Authenticate and check upload permission.
    const user = await requirePermission('documents:upload');

    // 2. Validate the document ID.
    const params = await context.params;
    const parsedParams = paramsSchema.safeParse(params);

    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid document ID.' },
        { status: 400 },
      );
    }

    documentId = parsedParams.data.documentId;
    s3Key = `documents/${documentId}`;
    // 3. Check whether the uploaded object exists.
    const head = await s3Client.send(
      new HeadObjectCommand({
        Bucket: DOCUMENTS_BUCKET,
        Key: s3Key,
      }),
    );

    const metadata = head.Metadata ?? {};

    // 4. Verify that the object belongs to this upload and user.
    if (
      metadata['document-id'] !== documentId ||
      metadata['owner-id'] !== user.sub
    ) {
      return NextResponse.json(
        { error: 'Upload not found or not accessible.' },
        { status: 404 },
      );
    }

    // We own this pending object, so it can be cleaned up
    // if subsequent validation fails.
    shouldDeleteObject = true;

    const fileSize = Number(metadata['file-size']);
    const uploadExpiresAt = Number(metadata['upload-expires-at']);

    const fileNameEncoded = metadata['file-name-b64'];

    const fileName = fileNameEncoded
      ? Buffer.from(fileNameEncoded, 'base64url').toString('utf8')
      : '';

    const contentType = head.ContentType;
    const actualSize = head.ContentLength;

    // 5. Validate all stored upload metadata.
    if (
      !fileName ||
      fileName.length > 255 ||
      !Number.isSafeInteger(fileSize) ||
      fileSize <= 0 ||
      fileSize > MAX_FILE_SIZE ||
      !Number.isSafeInteger(uploadExpiresAt) ||
      !Number.isSafeInteger(actualSize) ||
      actualSize !== fileSize ||
      !contentType ||
      !ALLOWED_CONTENT_TYPES.includes(
        contentType as (typeof ALLOWED_CONTENT_TYPES)[number],
      ) ||
      Math.floor(Date.now() / 1000) > uploadExpiresAt
    ) {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: DOCUMENTS_BUCKET,
          Key: s3Key,
        }),
      );

      shouldDeleteObject = false;

      return NextResponse.json(
        { error: 'Uploaded file failed validation.' },
        { status: 400 },
      );
    }

    const existingDocument = await getDocument(documentId);

    if (existingDocument) {
      if (existingDocument.owner_id !== user.sub) {
        return NextResponse.json(
          { error: 'Upload not found or not accessible.' },
          { status: 404 },
        );
      }
    
      shouldDeleteObject = false;
    
      return NextResponse.json(
        {
          message: 'Document upload already completed.',
          document: {
            document_id: existingDocument.document_id,
            file_name: existingDocument.file_name,
            content_type: existingDocument.content_type,
            file_size: existingDocument.file_size,
            created_at: existingDocument.created_at,
          },
        },
        { status: 200 },
      );
    }
    // 6. Create the database record using the authenticated owner.
    const document = await createDocument(user.sub, {
      document_id: documentId,
      file_name: fileName,
      s3_key: s3Key,
      content_type: contentType,
      file_size: fileSize,
    });

    shouldDeleteObject = false;

    return NextResponse.json(
      {
        message: 'Document uploaded successfully.',
        document: {
          document_id: document.document_id,
          file_name: document.file_name,
          content_type: document.content_type,
          file_size: document.file_size,
          created_at: document.created_at,
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

    // Clean up an object that we verified belongs to this user
    // if metadata registration failed.
    if (shouldDeleteObject && s3Key && documentId) {
     try {
       const existingDocument = await getDocument(documentId);

       // Never delete an S3 object that has a registered document record.
       if (!existingDocument) {
         await s3Client.send(
           new DeleteObjectCommand({
             Bucket: DOCUMENTS_BUCKET,
             Key: s3Key,
           }),
         );
       }
     } catch (cleanupError) {
       console.error(
         'Failed to check or clean up uploaded object:',
         cleanupError,
       );
      }
    }   
    console.error('Failed to complete document upload:', error);

    return NextResponse.json(
      { error: 'Unable to complete document upload.' },
      { status: 500 },
    );
  }
}

