#!/bin/bash
set -e

# ===========================================
# SSH Hardening Script
# Run as root on Ubuntu/Debian server
# ===========================================

echo "=== SSH Hardening ==="

if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo)"
    exit 1
fi

SSH_PORT=${SSH_PORT:-22222}
DEPLOY_USER=${DEPLOY_USER:-deploy}

# Backup original config
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup.$(date +%Y%m%d)

# Create hardened SSH config
cat > /etc/ssh/sshd_config.d/hardening.conf << EOF
# SSH Hardening Configuration
# Generated for Telegram Ads Marketplace

# Use non-standard port
Port $SSH_PORT

# Disable root login
PermitRootLogin no

# Disable password authentication (use keys only)
PasswordAuthentication no
PubkeyAuthentication yes

# Limit authentication attempts
MaxAuthTries 3
MaxSessions 2

# Disable empty passwords
PermitEmptyPasswords no

# Disable X11 forwarding
X11Forwarding no

# Disable TCP forwarding (unless needed)
AllowTcpForwarding no

# Set login grace time
LoginGraceTime 30

# Use only Protocol 2
Protocol 2

# Restrict to specific user(s)
AllowUsers $DEPLOY_USER

# Client alive settings
ClientAliveInterval 300
ClientAliveCountMax 2

# Disable agent forwarding
AllowAgentForwarding no

# Log level
LogLevel VERBOSE
EOF

# Test SSH config
echo "Testing SSH configuration..."
sshd -t

if [ $? -eq 0 ]; then
    echo "SSH configuration is valid."
    echo ""
    echo "=== BEFORE RESTARTING SSH ==="
    echo "1. Make sure user '$DEPLOY_USER' exists: id $DEPLOY_USER"
    echo "2. Make sure SSH key is added to /home/$DEPLOY_USER/.ssh/authorized_keys"
    echo "3. Test connection on new port BEFORE closing current session!"
    echo ""
    read -p "Restart SSH service now? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        systemctl restart sshd
        echo "SSH restarted. Test connection on port $SSH_PORT immediately!"
    else
        echo "Run 'systemctl restart sshd' manually when ready."
    fi
else
    echo "SSH configuration test failed! Restoring backup..."
    rm /etc/ssh/sshd_config.d/hardening.conf
    exit 1
fi
