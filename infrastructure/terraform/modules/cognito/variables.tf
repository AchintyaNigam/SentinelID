variable "project_name" {
  description = "Project name"
  type        = string
  default     = "sentinelid"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "domain_prefix" {
  description = "Unique Cognito domain prefix"
  type        = string

  validation {
    condition = (
      length(var.domain_prefix) >= 1 &&
      length(var.domain_prefix) <= 63 &&
      can(regex("^[a-z0-9-]+$", var.domain_prefix))
    )

    error_message = "The domain prefix must contain 1-63 lowercase letters, numbers or hyphens."
  }
}
