
export interface DocumentRecord {
  document_id: string;
  owner_id: string;
  file_name: string;
  s3_key: string;
  content_type: string;
  file_size: number;
  created_at: number;
}

/**
 * Metadata supplied when creating a document record.
 *
 * owner_id must come from the authenticated user's Cognito sub,
 * never from request data supplied by the client.
 */
export interface CreateDocumentInput {
  document_id?: string;
  file_name: string;
  s3_key: string;
  content_type: string;
  file_size: number;
}

export type DocumentAction = 'read' | 'delete';

