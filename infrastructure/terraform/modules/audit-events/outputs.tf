output "table_name" {
  description = "DynamoDB audit events table name"
  value       = aws_dynamodb_table.audit_events.name
}

output "table_arn" {
  description = "DynamoDB audit events table ARN"
  value       = aws_dynamodb_table.audit_events.arn
}

