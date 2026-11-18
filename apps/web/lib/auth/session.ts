
import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import { CompactEncrypt, compactDecrypt } from 'jose';

const SESSION_COOKIE_MAX_AGE = 24 * 60 * 60;

const TABLE_NAME = process.env.DYNAMODB_SESSION_TABLE;
const REGION = process.env.AWS_REGION ?? 'eu-west-1';

if (!TABLE_NAME) {
  throw new Error('Missing DYNAMODB_SESSION_TABLE environment variable.');
}

const dynamoClient = new DynamoDBClient({
  region: REGION,
});

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export interface CognitoTokenSet {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
}

interface SessionRecord {
  session_id: string;
  encrypted_tokens: string;
  created_at: number;
  expires_at: number;
}

export interface CreatedSession {
  sessionId: string;
  expiresAt: number;
}

/**
 * Retrieves the 256-bit encryption key from the environment.
 */
function getEncryptionKey(): Uint8Array {
  const encodedKey = process.env.SESSION_ENCRYPTION_KEY;

  if (!encodedKey) {
    throw new Error('Missing SESSION_ENCRYPTION_KEY environment variable.');
  }

  const key = Buffer.from(encodedKey, 'base64');

  if (key.length !== 32) {
    throw new Error('SESSION_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }

  return new Uint8Array(key);
}

/**
 * Generates a cryptographically secure session ID.
 */
function generateSessionId(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hashes a session ID before using it as a DynamoDB partition key.
 */
function hashSessionId(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}

/**
 * Validates the format of a browser-provided session ID.
 */
function isValidSessionId(sessionId: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(sessionId);
}

/**
 * Encrypts the Cognito token bundle using AES-256-GCM.
 */
async function encryptTokens(tokens: CognitoTokenSet): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(tokens));

  return new CompactEncrypt(plaintext)
    .setProtectedHeader({
      alg: 'dir',
      enc: 'A256GCM',
    })
    .encrypt(getEncryptionKey());
}

/**
 * Decrypts and parses the stored Cognito token bundle.
 */
async function decryptTokens(
  encryptedTokens: string,
): Promise<CognitoTokenSet> {
  const { plaintext } = await compactDecrypt(
    encryptedTokens,
    getEncryptionKey(),
  );

  const parsed: unknown = JSON.parse(
    new TextDecoder().decode(plaintext),
  );

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('accessToken' in parsed) ||
    typeof parsed.accessToken !== 'string' ||
    !('idToken' in parsed) ||
    typeof parsed.idToken !== 'string' ||
    !('refreshToken' in parsed) ||
    typeof parsed.refreshToken !== 'string' ||
    !('accessTokenExpiresAt' in parsed) ||
    typeof parsed.accessTokenExpiresAt !== 'number'
  ) {
    throw new Error('Invalid session token payload.');
  }

  return parsed as CognitoTokenSet;
}

/**
 * Creates a server-side session and returns its raw ID.
 *
 * Only the SHA-256 hash is stored in DynamoDB.
 */
export async function createSession(
  tokens: CognitoTokenSet,
): Promise<CreatedSession> {
  const sessionId = generateSessionId();
  const hashedSessionId = hashSessionId(sessionId);

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_COOKIE_MAX_AGE;

  const encryptedTokens = await encryptTokens(tokens);

  const record: SessionRecord = {
    session_id: hashedSessionId,
    encrypted_tokens: encryptedTokens,
    created_at: now,
    expires_at: expiresAt,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: record,
      ConditionExpression: 'attribute_not_exists(session_id)',
    }),
  );

  return {
    sessionId,
    expiresAt,
  };
}

/**
 * Retrieves a session by its raw browser session ID.
 *
 * Returns null when the session is missing, expired or invalid.
 */
export async function getSession(
  sessionId: string,
): Promise<CognitoTokenSet | null> {
  if (!isValidSessionId(sessionId)) {
    return null;
  }

  const hashedSessionId = hashSessionId(sessionId);

  const response = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        session_id: hashedSessionId,
      },
      ConsistentRead: true,
    }),
  );

  const record = response.Item as SessionRecord | undefined;

  if (!record) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);

  // DynamoDB TTL deletion is asynchronous, so enforce expiry ourselves.
  if (
    typeof record.expires_at !== 'number' ||
    record.expires_at <= now
  ) {
    await deleteSession(sessionId);
    return null;
  }

  if (typeof record.encrypted_tokens !== 'string') {
    await deleteSession(sessionId);
    return null;
  }

  try {
    return await decryptTokens(record.encrypted_tokens);
  } catch {
    // A corrupted or undecryptable session must not remain usable.
    await deleteSession(sessionId);
    return null;
  }
}

/**
 * Deletes a server-side session.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  if (!isValidSessionId(sessionId)) {
    return;
  }

  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        session_id: hashSessionId(sessionId),
      },
    }),
  );
}


/**
 * Replaces the encrypted token bundle for an existing session.
 *
 * The original session ID and absolute expiry remain unchanged.
 */
export async function updateSession(
  sessionId: string,
  tokens: CognitoTokenSet,
): Promise<void> {
  if (!isValidSessionId(sessionId)) {
    throw new Error('Invalid session ID.');
  }

  const encryptedTokens = await encryptTokens(tokens);
  const now = Math.floor(Date.now() / 1000);

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        session_id: hashSessionId(sessionId),
      },
      UpdateExpression: 'SET encrypted_tokens = :tokens',
      ConditionExpression:
        'attribute_exists(session_id) AND expires_at > :now',
      ExpressionAttributeValues: {
        ':tokens': encryptedTokens,
        ':now': now,
      },
    }),
  );
}

