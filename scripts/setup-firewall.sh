#!/bin/bash
set -e

# ===========================================
# UFW Firewall Setup for Telegram Ads Marketplace
# Run as root on Ubuntu/Debian server
# ===========================================

echo "=== Setting up UFW Firewall ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo)"
    exit 1
fi

# Install UFW if not present
if ! command -v ufw &> /dev/null; then
    echo "Installing UFW..."
    apt-get update
    apt-get install -y ufw
fi

# Reset UFW to default state
echo "Resetting UFW rules..."
ufw --force reset

# Default policies - deny all incoming, allow outgoing
echo "Setting default policies..."
ufw default deny incoming
ufw default allow outgoing

# SSH on non-standard port (change 22222 to your preferred port)
SSH_PORT=${SSH_PORT:-22222}
echo "Allowing SSH on port $SSH_PORT..."
ufw allow $SSH_PORT/tcp comment 'SSH non-standard port'

# HTTPS only (no HTTP - redirect handled by nginx)
echo "Allowing HTTPS (443)..."
ufw allow 443/tcp comment 'HTTPS'

# Optional: Allow HTTP for Let's Encrypt initial setup
# Uncomment if needed, then disable after certificate is obtained
# ufw allow 80/tcp comment 'HTTP for ACME challenge'

# Enable UFW
echo "Enabling UFW..."
ufw --force enable

# Show status
echo ""
echo "=== Firewall Status ==="
ufw status verbose

echo ""
echo "=== IMPORTANT ==="
echo "1. Make sure you can SSH on port $SSH_PORT before disconnecting!"
echo "2. Update /etc/ssh/sshd_config to use port $SSH_PORT"
echo "3. Restart SSH: systemctl restart sshd"
echo ""
echo "Internal ports (PostgreSQL 5432, Redis 6379, API 3000, etc.)"
echo "are NOT exposed - they are only accessible within Docker network."
