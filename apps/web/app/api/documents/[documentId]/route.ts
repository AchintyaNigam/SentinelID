import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { UnauthenticatedError } from '@/lib/auth/require-auth';
import { ForbiddenError } from '@/lib/auth/require-role';
import { requirePermission } from '@/lib/auth/require-permission';
import {
  assertDocumentAccess,
  DocumentNotFoundError,
  canListAllDocuments,
} from '@/lib/documents/authorization';
import { getDocument } from '@/lib/documents/repository';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

import { s3Client, DOCUMENTS_BUCKET } from '@/lib/aws/s3';

import { deleteDocumentRecord } from '@/lib/documents/repository';

const documentIdSchema = z.string().uuid();

interface RouteContext {
  params: Promise<{
    documentId: string;
  }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    // 1. Authenticate and check the general permission.
    const user = await requirePermission('documents:read');

    // 2. Retrieve and validate the document ID.
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

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found or not accessible.' },
        { status: 404 },
      );
    }

    // 4. Enforce resource-level authorization.
    assertDocumentAccess(user, document, 'read');

    // 5. Return metadata only. Never expose the S3 key.
    const responseDocument = {
      document_id: document.document_id,
      file_name: document.file_name,
      content_type: document.content_type,
      file_size: document.file_size,
      created_at: document.created_at,
      ...(canListAllDocuments(user)
        ? { owner_id: document.owner_id }
        : {}),
    };

    return NextResponse.json(
      { document: responseDocument },
      { status: 200 },
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

    console.error('Failed to retrieve document:', error);

    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}


export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    // 1. Authenticate and check the general delete permission.
    const user = await requirePermission('documents:delete');

    // 2. Validate the document ID.
    const { documentId } = await context.params;
    const parsedId = documentIdSchema.safeParse(documentId);

    if (!parsedId.success) {
      return NextResponse.json(
        { error: 'Invalid document ID.' },
        { status: 400 },
      );
    }

    // 3. Retrieve the document.
    const document = await getDocument(parsedId.data);

    // 4. Enforce resource-level authorization.
    assertDocumentAccess(user, document, 'delete');

    // 5. Delete the S3 object using the trusted database key.
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: DOCUMENTS_BUCKET,
        Key: document.s3_key,
      }),
    );

    // 6. Delete the DynamoDB record.
    await deleteDocumentRecord(document.document_id);

    return NextResponse.json(
      { message: 'Document deleted successfully.' },
      { status: 200 },
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
        { error: 'Insufficient permissions.' },
        { status: 403 },
      );
    }

    if (error instanceof DocumentNotFoundError) {
      return NextResponse.json(
        { error: 'Document not found or not accessible.' },
        { status: 404 },
      );
    }

    console.error('Failed to delete document:', error);

    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}

