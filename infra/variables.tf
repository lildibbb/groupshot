variable "azure_subscription_id" {
  type        = string
  description = "Subscription the VM is billed to."
}
variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  description = "Zone:DNS:Edit, Zone:Zone Settings:Edit, Zone:Cache Rules:Edit on the zone, and Workers R2 Storage:Edit on the account."
}
variable "cloudflare_account_id" { type = string }
variable "zone_name" {
  type        = string
  description = "Cloudflare zone the site lives in, e.g. example.com."
}
variable "subdomain" {
  type    = string
  default = ""
}
variable "deploy_public_key" {
  type        = string
  description = "Public half of the key CI deploys with. It is also the VM's only login."
}
variable "ssh_allowed_cidrs" {
  type        = list(string)
  default     = ["*"]
  description = "GitHub-hosted runners have no fixed range, so SSH is open by default. Key-only login, root disabled. Narrow it to your own IP and use a self-hosted runner if you prefer."
}
variable "location" {
  type        = string
  default     = "southeastasia"
  description = "Singapore, the nearest Azure region to Malaysia."
}
variable "vm_size" {
  type        = string
  default     = "Standard_B2ats_v2"
  description = "2 vCPU burstable, 1 GiB. Enough for one Bun process; check it is offered in your region and subscription."
}
variable "os_disk_gb" {
  type    = number
  default = 30
}
variable "media_bucket" {
  type    = string
  default = "groupshot-media"
}
variable "backup_bucket" {
  type    = string
  default = "groupshot-backups"
}
variable "r2_location" {
  type    = string
  default = "apac"
}
variable "rate_limit_login" {
  type        = bool
  default     = true
  description = "Cloudflare edge rate limit on /api/admin/login and /api/billing/checkout, on top of the app's own limiter."
}
