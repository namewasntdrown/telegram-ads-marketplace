#!/bin/bash
set -e

# ===========================================
# Complete Security Setup Script
# Telegram Ads Marketplace
# Run as root on Ubuntu/Debian server
# ===========================================

echo "============================================"
echo "  Telegram Ads Marketplace Security Setup"
echo "============================================"
echo ""

if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo)"
    exit 1
fi

# Configuration
SSH_PORT=${SSH_PORT:-22222}
DEPLOY_USER=${DEPLOY_USER:-deploy}
APP_DIR=${APP_DIR:-/opt/telegram-ads-marketplace}

echo "Configuration:"
echo "  SSH Port: $SSH_PORT"
echo "  Deploy User: $DEPLOY_USER"
echo "  App Directory: $APP_DIR"
echo ""
read -p "Continue with these settings? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# ===========================================
# 1. System Updates
# ===========================================
echo ""
echo "=== 1. Updating System ==="
apt-get update
apt-get upgrade -y
apt-get install -y curl wget git unzip

# ===========================================
# 2. Create Deploy User
# ===========================================
echo ""
echo "=== 2. Creating Deploy User ==="
if id "$DEPLOY_USER" &>/dev/null; then
    echo "User $DEPLOY_USER already exists"
else
    useradd -m -s /bin/bash $DEPLOY_USER
    usermod -aG docker $DEPLOY_USER 2>/dev/null || true
    echo "Created user $DEPLOY_USER"
fi

# ===========================================
# 3. Install Docker
# ===========================================
echo ""
echo "=== 3. Installing Docker ==="
if command -v docker &> /dev/null; then
    echo "Docker already installed"
else
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    usermod -aG docker $DEPLOY_USER
fi

# ===========================================
# 4. Setup Firewall (UFW)
# ===========================================
echo ""
echo "=== 4. Setting up Firewall ==="
apt-get install -y ufw

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow $SSH_PORT/tcp comment 'SSH'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

echo "Firewall enabled"
ufw status

# ===========================================
# 5. Harden SSH
# ===========================================
echo ""
echo "=== 5. Hardening SSH ==="

# Backup
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup.$(date +%Y%m%d) 2>/dev/null || true

cat > /etc/ssh/sshd_config.d/hardening.conf << EOF
Port $SSH_PORT
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
MaxSessions 2
PermitEmptyPasswords no
X11Forwarding no
AllowTcpForwarding no
LoginGraceTime 30
AllowUsers $DEPLOY_USER root
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

# ===========================================
# 6. Setup Fail2Ban
# ===========================================
echo ""
echo "=== 6. Setting up Fail2Ban ==="
apt-get install -y fail2ban

cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port = $SSH_PORT
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
action = iptables-multiport[name=nginx, port="http,https"]
logpath = /var/log/nginx/error.log
maxretry = 10
bantime = 600
EOF

cat > /etc/fail2ban/filter.d/nginx-limit-req.conf << 'EOF'
[Definition]
failregex = limiting requests, excess:.* by zone .*, client: <HOST>
ignoreregex =
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# ===========================================
# 7. Setup Application Directory
# ===========================================
echo ""
echo "=== 7. Setting up Application Directory ==="
mkdir -p $APP_DIR
chown -R $DEPLOY_USER:$DEPLOY_USER $APP_DIR

# ===========================================
# 8. Kernel Hardening
# ===========================================
echo ""
echo "=== 8. Kernel Hardening ==="
cat > /etc/sysctl.d/99-security.conf << 'EOF'
# IP Spoofing protection
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Ignore ICMP broadcast requests
net.ipv4.icmp_echo_ignore_broadcasts = 1

# Disable source packet routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0

# Ignore send redirects
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0

# Block SYN attacks
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_synack_retries = 2
net.ipv4.tcp_syn_retries = 5

# Log Martians
net.ipv4.conf.all.log_martians = 1

# Ignore ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0

# Disable IPv6 if not needed
# net.ipv6.conf.all.disable_ipv6 = 1
EOF

sysctl -p /etc/sysctl.d/99-security.conf

# ===========================================
# 9. Automatic Security Updates
# ===========================================
echo ""
echo "=== 9. Enabling Automatic Security Updates ==="
apt-get install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# ===========================================
# Summary
# ===========================================
echo ""
echo "============================================"
echo "  Security Setup Complete!"
echo "============================================"
echo ""
echo "IMPORTANT NEXT STEPS:"
echo ""
echo "1. Add your SSH public key to deploy user:"
echo "   mkdir -p /home/$DEPLOY_USER/.ssh"
echo "   echo 'your-public-key' >> /home/$DEPLOY_USER/.ssh/authorized_keys"
echo "   chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh"
echo "   chmod 700 /home/$DEPLOY_USER/.ssh"
echo "   chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys"
echo ""
echo "2. Test SSH connection on port $SSH_PORT BEFORE restarting SSH!"
echo "   ssh -p $SSH_PORT $DEPLOY_USER@your-server-ip"
echo ""
echo "3. Restart SSH service:"
echo "   systemctl restart sshd"
echo ""
echo "4. Verify firewall status:"
echo "   ufw status"
echo ""
echo "Open ports:"
ufw status | grep -E "^\d+|ALLOW"
echo ""
echo "Closed ports (internal only via Docker network):"
echo "  - PostgreSQL: 5432"
echo "  - Redis: 6379"
echo "  - API: 3000"
echo "  - Bot: 3001"
echo "  - MTProto: 3002"
echo "  - Workers: 3003"
