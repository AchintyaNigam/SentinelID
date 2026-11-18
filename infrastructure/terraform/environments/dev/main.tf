module "cognito" {
  source = "../../modules/cognito"

  project_name  = "sentinelid"
  environment   = "dev"
  domain_prefix = var.domain_prefix
}

module "sessions" {
  source = "../../modules/sessions"

  project_name = "sentinelid"
  environment  = "dev"
}
