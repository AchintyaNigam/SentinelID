output "table_name" {
  description = "DynamoDB session table name"
  value       = aws_dynamodb_table.sessions.name
}

output "table_arn" {
  description = "DynamoDB session table ARN"
  value       = aws_dynamodb_table.sessions.arn
}
