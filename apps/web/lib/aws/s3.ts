
import 'server-only';

import { S3Client } from '@aws-sdk/client-s3';

const REGION = process.env.AWS_REGION ?? 'eu-west-1';

export const s3Client = new S3Client({
  region: REGION,
});

export const DOCUMENTS_BUCKET =
  process.env.S3_DOCUMENTS_BUCKET;

if (!DOCUMENTS_BUCKET) {
  throw new Error(
    'Missing S3_DOCUMENTS_BUCKET environment variable.',
  );
}

