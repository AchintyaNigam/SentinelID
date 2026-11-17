variable "domain_prefix" {
  description = "Unique Cognito domain prefix in eu-west-1"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]{1,63}$", var.domain_prefix))
    error_message = "Use 1-63 lowercase letters, numbers or hyphens."
  }
}
