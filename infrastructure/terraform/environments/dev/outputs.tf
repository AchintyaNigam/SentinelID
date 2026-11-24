output "user_pool_id" {
  description = "Cognito User Pool ID"
  value       = module.cognito.user_pool_id
}

output "client_id" {
  description = "Cognito application client ID"
  value       = module.cognito.client_id
}

output "cognito_domain" {
  description = "Cognito Managed Login domain"
  value       = module.cognito.domain
}

output "issuer" {
  description = "Cognito JWT issuer"
  value       = module.cognito.issuer
}

output "session_table_name" {
  description = "DynamoDB session table name"
  value       = module.sessions.table_name
}

output "session_table_arn" {
  description = "DynamoDB session table ARN"
  value       = module.sessions.table_arn
}

output "documents_table_name" {
  value = module.documents.documents_table_name
}

output "documents_table_arn" {
  value = module.documents.documents_table_arn
}

output "documents_table_owner_index_arn" {
  value = module.documents.documents_table_owner_index_arn
}

output "documents_bucket_name" {
  value = module.documents.documents_bucket_name
}

output "documents_bucket_arn" {
  value = module.documents.documents_bucket_arn
}

output "audit_events_table_name" {
  description = "DynamoDB audit events table name"
  value       = module.audit_events.table_name
}

output "audit_events_table_arn" {
  description = "DynamoDB audit events table ARN"
  value       = module.audit_events.table_arn
}

