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
