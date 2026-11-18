
# mfa_configuration = "ON" means MFA is required, not merely offered.
# generate_secret = false is intentional because Next.js is a public OAuth client using PKCE.
# The groups will appear in the cognito:groups JWT claim.
# allow_admin_create_user_only = true prevents public self-registration.

# The below line, dynamically fetches the current AWS region the Terraform provider is targeting so it can be referenced elsewhere if needed.
data "aws_region" "current" {}

resource "aws_cognito_user_pool" "sentinelid" {
  name = "${var.project_name}-${var.environment}-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  deletion_protection = "INACTIVE"

  mfa_configuration = "ON"

  software_token_mfa_configuration {
    enabled = true
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 1
  }

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-users"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.project_name}-web"
  user_pool_id = aws_cognito_user_pool.sentinelid.id

  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]

  allowed_oauth_scopes = [
    "openid",
    "email",
    "profile"
  ]

  supported_identity_providers = ["COGNITO"]

  callback_urls = [
    "http://localhost:3000/api/auth/callback"
  ]

  logout_urls = [
    "http://localhost:3000"
  ]

  enable_token_revocation       = true
  prevent_user_existence_errors = "ENABLED"

  access_token_validity  = 15
  id_token_validity      = 15
  refresh_token_validity = 1

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_pool_domain" "sentinelid" {
  domain                = var.domain_prefix
  user_pool_id          = aws_cognito_user_pool.sentinelid.id
  managed_login_version = 2
}

resource "aws_cognito_user_group" "admin" {
  name         = "Admin"
  user_pool_id = aws_cognito_user_pool.sentinelid.id
  description  = "SentinelID administrators"
  precedence   = 1
}

resource "aws_cognito_user_group" "analyst" {
  name         = "Analyst"
  user_pool_id = aws_cognito_user_pool.sentinelid.id
  description  = "SentinelID security analysts"
  precedence   = 2
}

resource "aws_cognito_user_group" "employee" {
  name         = "Employee"
  user_pool_id = aws_cognito_user_pool.sentinelid.id
  description  = "SentinelID standard employees"
  precedence   = 3
}

# AWS explicitly documents that programmatically created app clients don't automatically receive a Managed Login branding style. A style must be created and assigned to the client. So we must create one ourselves. 
resource "aws_cognito_managed_login_branding" "web" {
  user_pool_id = aws_cognito_user_pool.sentinelid.id
  client_id    = aws_cognito_user_pool_client.web.id

  use_cognito_provided_values = true
}
