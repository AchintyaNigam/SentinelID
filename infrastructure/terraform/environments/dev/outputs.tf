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
