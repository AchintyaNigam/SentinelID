
import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

import { docClient } from '../aws/dynamodb';

import type {
  CreateDocumentInput,
  DocumentRecord,
} from './types';

const TABLE_NAME = process.env.DYNAMODB_DOCUMENTS_TABLE;
const OWNER_INDEX_NAME = 'owner-created-index';

if (!TABLE_NAME) {
  throw new Error(
    'Missing DYNAMODB_DOCUMENTS_TABLE environment variable.',
  );
}

/**
 * Retrieves a document by its primary key.
 *
 * ConsistentRead ensures we read the latest committed metadata.
 */
export async function getDocument(
  documentId: string,
): Promise<DocumentRecord | null> {
  const response = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        document_id: documentId,
      },
      ConsistentRead: true,
    }),
  );

  return (response.Item as DocumentRecord | undefined) ?? null;
}

/**
 * Retrieves documents owned by a particular user.
 *
 * Results are ordered newest first using the owner-created-index GSI.
 */
export async function getDocumentsByOwner(
  ownerId: string,
  options: {
    limit?: number;
    exclusiveStartKey?: Record<string, string | number>;
  } = {},
) {
  const limit = Math.min(
    Math.max(options.limit ?? 20, 1),
    100,
  );

  const response = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: OWNER_INDEX_NAME,
      KeyConditionExpression: 'owner_id = :owner',
      ExpressionAttributeValues: {
        ':owner': ownerId,
      },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: options.exclusiveStartKey,
    }),
  );

  return {
    documents: (response.Items ?? []) as DocumentRecord[],
    lastEvaluatedKey: response.LastEvaluatedKey,
  };
}

/**
 * Creates a document metadata record.
 *
 * ownerId must be obtained from the authenticated server-side user.
 * It must never come from client request data.
 */
export async function createDocument(
  ownerId: string,
  input: CreateDocumentInput,
): Promise<DocumentRecord> {
  const now = Math.floor(Date.now() / 1000);

  const document: DocumentRecord = {
    document_id: randomUUID(),
    owner_id: ownerId,
    file_name: input.file_name,
    s3_key: input.s3_key,
    content_type: input.content_type,
    file_size: input.file_size,
    created_at: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: document,
      ConditionExpression: 'attribute_not_exists(document_id)',
    }),
  );

  return document;
}

/**
 * Deletes a document metadata record.
 *
 * The caller must perform document authorisation before invoking this.
 */
export async function deleteDocumentRecord(
  documentId: string,
): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        document_id: documentId,
      },
      ConditionExpression: 'attribute_exists(document_id)',
    }),
  );
}

