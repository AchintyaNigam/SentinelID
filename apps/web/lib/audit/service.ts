import 'server-only';

import { randomUUID } from 'node:crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';

import { docClient } from '@/lib/aws/dynamodb';

import {
  AUDIT_ACTIONS,
  AUDIT_OUTCOMES,
  AUDIT_RESOURCE_TYPES,
  type AuditEvent,
  type CreateAuditEventInput,
} from './types';

const TABLE_NAME = process.env.DYNAMODB_AUDIT_EVENTS_TABLE;

if (!TABLE_NAME) {
  throw new Error(
    'Missing DYNAMODB_AUDIT_EVENTS_TABLE environment variable.',
  );
}

const auditEventSchema = z.object({
  actor_id: z.string().min(1).max(128).optional(),

  actor_roles: z.array(
    z.string().min(1).max(64),
  ).max(10),

  action: z.enum(AUDIT_ACTIONS),

  resource_type: z.enum(AUDIT_RESOURCE_TYPES),

  resource_id: z.string().min(1).max(128).optional(),

  outcome: z.enum(AUDIT_OUTCOMES),

  details: z.object({
    content_type: z.string().max(128).optional(),
    file_size: z.number().int().nonnegative().optional(),
    reason_code: z.string().max(128).optional(),
  }).optional(),
});

/**
 * Creates and persists a security audit event.
 *
 * Event IDs and timestamps are generated server-side.
 * Events are inserted conditionally to prevent overwriting.
 *
 * Errors are deliberately propagated to the caller.
 */
export async function recordAuditEvent(
  input: CreateAuditEventInput,
): Promise<AuditEvent> {
  const validatedInput = auditEventSchema.parse(input);

  const event: AuditEvent = {
    ...validatedInput,
    event_id: randomUUID(),
    timestamp: Math.floor(Date.now() / 1000),
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: event,
      ConditionExpression: 'attribute_not_exists(event_id)',
    }),
  );

  return event;
}

