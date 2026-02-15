#!/bin/bash
set -e

# ===========================================
# Fail2Ban Setup Script
# Run as root on Ubuntu/Debian server
# ===========================================

echo "=== Setting up Fail2Ban ==="

if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo)"
    exit 1
fi

SSH_PORT=${SSH_PORT:-22222}

# Install Fail2Ban
echo "Installing Fail2Ban..."
apt-get update
apt-get install -y fail2ban

# Create local jail configuration
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
# Ban duration (1 hour)
bantime = 3600

# Time window for counting failures
findtime = 600

# Max retries before ban
maxretry = 5

# Ignore local addresses
ignoreip = 127.0.0.1/8 ::1

# Email notifications (configure if needed)
# destemail = admin@example.com
# sender = fail2ban@example.com
# mta = sendmail

# Action: ban IP and log
action = %(action_)s

[sshd]
enabled = true
port = $SSH_PORT
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600

[sshd-ddos]
enabled = true
port = $SSH_PORT
filter = sshd-ddos
logpath = /var/log/auth.log
maxretry = 6
bantime = 3600

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
action = iptables-multiport[name=nginx, port="http,https"]
logpath = /var/log/nginx/error.log
maxretry = 10
bantime = 600
findtime = 60

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 5
bantime = 600

[nginx-botsearch]
enabled = true
filter = nginx-botsearch
port = http,https
logpath = /var/log/nginx/access.log
maxretry = 2
bantime = 86400
EOF

# Create nginx-limit-req filter if not exists
cat > /etc/fail2ban/filter.d/nginx-limit-req.conf << 'EOF'
[Definition]
failregex = limiting requests, excess:.* by zone .*, client: <HOST>
ignoreregex =
EOF

# Restart Fail2Ban
echo "Restarting Fail2Ban..."
systemctl enable fail2ban
systemctl restart fail2ban

# Show status
echo ""
echo "=== Fail2Ban Status ==="
fail2ban-client status

echo ""
echo "=== SSH Jail Status ==="
fail2ban-client status sshd

echo ""
echo "Fail2Ban setup complete!"
echo "View banned IPs: fail2ban-client status sshd"
echo "Unban IP: fail2ban-client set sshd unbanip <IP>"
