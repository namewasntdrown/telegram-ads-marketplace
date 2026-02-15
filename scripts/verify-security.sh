#!/bin/bash

# ===========================================
# Security Verification Script
# Telegram Ads Marketplace
# ===========================================

echo "============================================"
echo "  Security Verification"
echo "============================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# ===========================================
# 1. Firewall Check
# ===========================================
echo "=== 1. Firewall Status ==="

if command -v ufw &> /dev/null; then
    if ufw status | grep -q "Status: active"; then
        pass "UFW is active"

        # Check open ports
        echo ""
        echo "Open ports:"
        ufw status | grep ALLOW

        # Check that internal ports are NOT exposed
        if ufw status | grep -qE "5432|6379|3000|3001|3002|3003"; then
            fail "Internal ports appear to be exposed!"
        else
            pass "Internal ports (5432, 6379, 3000-3003) are NOT exposed"
        fi
    else
        fail "UFW is not active!"
    fi
else
    fail "UFW is not installed"
fi

# ===========================================
# 2. SSH Configuration
# ===========================================
echo ""
echo "=== 2. SSH Configuration ==="

SSH_PORT=$(grep "^Port" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | tail -1 | awk '{print $2}')
if [ -n "$SSH_PORT" ] && [ "$SSH_PORT" != "22" ]; then
    pass "SSH using non-standard port: $SSH_PORT"
else
    warn "SSH using standard port 22"
fi

if grep -qE "^PermitRootLogin no" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null; then
    pass "Root login is disabled"
else
    fail "Root login may be enabled"
fi

if grep -qE "^PasswordAuthentication no" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null; then
    pass "Password authentication is disabled"
else
    warn "Password authentication may be enabled"
fi

# ===========================================
# 3. Fail2Ban
# ===========================================
echo ""
echo "=== 3. Fail2Ban Status ==="

if command -v fail2ban-client &> /dev/null; then
    if systemctl is-active --quiet fail2ban; then
        pass "Fail2Ban is running"

        JAILS=$(fail2ban-client status 2>/dev/null | grep "Jail list" | cut -d: -f2)
        echo "Active jails: $JAILS"

        # Check sshd jail
        if echo "$JAILS" | grep -q "sshd"; then
            pass "SSH jail is active"
            BANNED=$(fail2ban-client status sshd 2>/dev/null | grep "Currently banned" | awk '{print $NF}')
            echo "Currently banned IPs: $BANNED"
        else
            warn "SSH jail not active"
        fi
    else
        fail "Fail2Ban is not running"
    fi
else
    fail "Fail2Ban is not installed"
fi

# ===========================================
# 4. Docker Network Isolation
# ===========================================
echo ""
echo "=== 4. Docker Network Check ==="

if command -v docker &> /dev/null; then
    pass "Docker is installed"

    # Check if internal network exists
    if docker network ls | grep -q "internal"; then
        pass "Internal Docker network exists"
    else
        warn "Internal Docker network not found (created on docker-compose up)"
    fi

    # Check listening ports on host
    echo ""
    echo "Ports exposed on host (0.0.0.0):"
    ss -tlnp 2>/dev/null | grep "0.0.0.0" | awk '{print $4}' | cut -d: -f2 | sort -u
else
    warn "Docker not installed yet"
fi

# ===========================================
# 5. Port Scan (localhost)
# ===========================================
echo ""
echo "=== 5. Internal Port Check ==="

check_port() {
    if timeout 1 bash -c "echo >/dev/tcp/localhost/$1" 2>/dev/null; then
        echo "  Port $1: OPEN (internal)"
    else
        echo "  Port $1: CLOSED"
    fi
}

echo "Checking internal ports (should be closed externally):"
check_port 5432  # PostgreSQL
check_port 6379  # Redis
check_port 3000  # API
check_port 3001  # Bot
check_port 3002  # MTProto
check_port 3003  # Workers

# ===========================================
# 6. External Port Scan Suggestion
# ===========================================
echo ""
echo "=== 6. External Verification ==="
echo ""
echo "To verify from external host, run:"
echo "  nmap -p- $(hostname -I | awk '{print $1}')"
echo ""
echo "Expected open ports:"
echo "  - 443 (HTTPS)"
echo "  - SSH port (if configured)"
echo ""
echo "All other ports should be closed/filtered."

# ===========================================
# Summary
# ===========================================
echo ""
echo "============================================"
echo "  Verification Complete"
echo "============================================"
