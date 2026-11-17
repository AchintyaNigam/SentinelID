module "cognito" {
  source = "../../modules/cognito"

  project_name  = "sentinelid"
  environment   = "dev"
  domain_prefix = var.domain_prefix
}


