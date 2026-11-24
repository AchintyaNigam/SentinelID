resource "aws_dynamodb_table" "audit_events" {
  name         = "${var.project_name}-${var.environment}-audit-events"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "event_id"

  attribute {
    name = "event_id"
    type = "S"
  }

  # Audit records should not be automatically deleted.
  # Retention will be managed through an explicit policy.
  deletion_protection_enabled = true

  tags = {
    Name      = "${var.project_name}-${var.environment}-audit-events"
    Component = "Security Auditing"
  }
}

