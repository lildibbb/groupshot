terraform {
  required_version = ">= 1.6.0"
  required_providers {
    azurerm    = { source = "hashicorp/azurerm", version = "~> 4.0" }
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.0" }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.azure_subscription_id
}
provider "cloudflare" { api_token = var.cloudflare_api_token }

data "cloudflare_zone" "site" {
  filter = { name = var.zone_name }
}

data "cloudflare_ip_ranges" "cf" {}

locals {
  fqdn     = var.subdomain == "" ? var.zone_name : "${var.subdomain}.${var.zone_name}"
  cf_cidrs = concat(data.cloudflare_ip_ranges.cf.ipv4_cidrs, data.cloudflare_ip_ranges.cf.ipv6_cidrs)
  tags     = { app = "groupshot" }
}

resource "azurerm_resource_group" "app" {
  name     = "groupshot"
  location = var.location
  tags     = local.tags
}

resource "azurerm_virtual_network" "app" {
  name                = "groupshot"
  resource_group_name = azurerm_resource_group.app.name
  location            = azurerm_resource_group.app.location
  address_space       = ["10.20.0.0/24"]
  tags                = local.tags
}

resource "azurerm_subnet" "app" {
  name                 = "app"
  resource_group_name  = azurerm_resource_group.app.name
  virtual_network_name = azurerm_virtual_network.app.name
  address_prefixes     = ["10.20.0.0/26"]
}

resource "azurerm_public_ip" "app" {
  name                = "groupshot"
  resource_group_name = azurerm_resource_group.app.name
  location            = azurerm_resource_group.app.location
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.tags
}

resource "azurerm_network_security_group" "app" {
  name                = "groupshot"
  resource_group_name = azurerm_resource_group.app.name
  location            = azurerm_resource_group.app.location
  tags                = local.tags

  security_rule {
    name                       = "ssh"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefixes    = var.ssh_allowed_cidrs
    destination_address_prefix = "*"
  }
  security_rule {
    name                       = "web-from-cloudflare"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_ranges    = ["80", "443"]
    source_address_prefixes    = local.cf_cidrs
    destination_address_prefix = "*"
  }
}

resource "azurerm_network_interface" "app" {
  name                = "groupshot"
  resource_group_name = azurerm_resource_group.app.name
  location            = azurerm_resource_group.app.location
  tags                = local.tags

  ip_configuration {
    name                          = "primary"
    subnet_id                     = azurerm_subnet.app.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.app.id
  }
}

resource "azurerm_network_interface_security_group_association" "app" {
  network_interface_id      = azurerm_network_interface.app.id
  network_security_group_id = azurerm_network_security_group.app.id
}

resource "azurerm_linux_virtual_machine" "app" {
  name                            = "groupshot-app"
  resource_group_name             = azurerm_resource_group.app.name
  location                        = azurerm_resource_group.app.location
  size                            = var.vm_size
  admin_username                  = "groupshot"
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.app.id]
  tags                            = merge(local.tags, { role = "web" })

  admin_ssh_key {
    username   = "groupshot"
    public_key = var.deploy_public_key
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "StandardSSD_LRS"
    disk_size_gb         = var.os_disk_gb
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "ubuntu-24_04-lts"
    sku       = "server"
    version   = "latest"
  }

  custom_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
    domain        = local.fqdn
    deploy_key    = var.deploy_public_key
    caddyfile     = file("${path.module}/Caddyfile")
    service_unit  = file("${path.module}/groupshot.service")
    backup_script = file("${path.module}/groupshot-backup")
  }))

  lifecycle { ignore_changes = [custom_data, admin_ssh_key] }
}

resource "cloudflare_dns_record" "a" {
  zone_id = data.cloudflare_zone.site.zone_id
  name    = local.fqdn
  type    = "A"
  content = azurerm_public_ip.app.ip_address
  ttl     = 1
  proxied = true
}

resource "cloudflare_zone_setting" "ssl" {
  zone_id    = data.cloudflare_zone.site.zone_id
  setting_id = "ssl"
  value      = "full"
}

resource "cloudflare_zone_setting" "https_rewrites" {
  zone_id    = data.cloudflare_zone.site.zone_id
  setting_id = "automatic_https_rewrites"
  value      = "on"
}

resource "cloudflare_zone_setting" "min_tls" {
  zone_id    = data.cloudflare_zone.site.zone_id
  setting_id = "min_tls_version"
  value      = "1.2"
}

resource "cloudflare_ruleset" "cache" {
  zone_id = data.cloudflare_zone.site.zone_id
  name    = "groupshot static cache"
  kind    = "zone"
  phase   = "http_request_cache_settings"
  rules = [{
    action      = "set_cache_settings"
    description = "Cache the app's static files at the edge, honouring the origin's cache-control"
    enabled     = true
    expression  = "(http.host eq \"${local.fqdn}\" and (starts_with(http.request.uri.path, \"/assets/\") or starts_with(http.request.uri.path, \"/models/\") or starts_with(http.request.uri.path, \"/textures/\")))"
    action_parameters = {
      cache       = true
      edge_ttl    = { mode = "respect_origin" }
      browser_ttl = { mode = "respect_origin" }
    }
  }]
}

resource "cloudflare_ruleset" "rate_limit" {
  count   = var.rate_limit_login ? 1 : 0
  zone_id = data.cloudflare_zone.site.zone_id
  name    = "groupshot sensitive endpoints"
  kind    = "zone"
  phase   = "http_ratelimit"
  rules = [{
    action      = "block"
    description = "Admin sign-in and checkout: at most 20 requests a minute per address"
    enabled     = true
    expression  = "(http.host eq \"${local.fqdn}\" and (http.request.uri.path eq \"/api/admin/login\" or http.request.uri.path eq \"/api/billing/checkout\"))"
    ratelimit = {
      characteristics     = ["ip.src", "cf.colo.id"]
      period              = 60
      requests_per_period = 20
      mitigation_timeout  = 600
    }
  }]
}

resource "cloudflare_r2_bucket" "media" {
  account_id = var.cloudflare_account_id
  name       = var.media_bucket
  location   = var.r2_location
}

resource "cloudflare_r2_bucket_lifecycle" "media" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.media.name
  rules = [{
    id         = "expire-media"
    enabled    = true
    conditions = { prefix = "" }
    delete_objects_transition = {
      condition = { max_age = 2678400, type = "Age" }
    }
  }]
}

resource "cloudflare_r2_bucket" "backups" {
  account_id = var.cloudflare_account_id
  name       = var.backup_bucket
  location   = var.r2_location
}

resource "cloudflare_r2_bucket_lifecycle" "backups" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.backups.name
  rules = [{
    id         = "expire-backups"
    enabled    = true
    conditions = { prefix = "" }
    delete_objects_transition = {
      condition = { max_age = 2592000, type = "Age" }
    }
  }]
}
