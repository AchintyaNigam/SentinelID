output "user_pool_id" {
  value = aws_cognito_user_pool.sentinelid.id
}

output "user_pool_arn" {
  value = aws_cognito_user_pool.sentinelid.arn
}

output "client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "domain" {
  value = "https://${aws_cognito_user_pool_domain.sentinelid.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
}

output "issuer" {
  value = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.sentinelid.id}"
}
