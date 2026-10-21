output "server_ipv4" { value = azurerm_public_ip.app.ip_address }
output "ssh" { value = "ssh groupshot@${azurerm_public_ip.app.ip_address}" }
output "url" { value = "https://${local.fqdn}" }
output "r2_endpoint" { value = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com" }
