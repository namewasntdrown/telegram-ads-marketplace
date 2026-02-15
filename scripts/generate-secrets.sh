#!/bin/bash

# ===========================================
# Generate Strong Secrets for Production
# Telegram Ads Marketplace
# ===========================================

echo "============================================"
echo "  Generating Production Secrets"
echo "============================================"
echo ""

# Generate random password (32 chars, alphanumeric + special)
generate_password() {
    local length=${1:-32}
    openssl rand -base64 48 | tr -dc 'a-zA-Z0-9!@#$%^&*()_+-=' | head -c $length
}

# Generate hex key (for encryption)
generate_hex_key() {
    local bytes=${1:-32}
    openssl rand -hex $bytes
}

# Generate JWT-safe secret (no special chars that might break env vars)
generate_jwt_secret() {
    openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 64
}

echo "# Production Environment Variables"
echo "# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo "# KEEP THIS FILE SECURE!"
echo ""
echo "# Database"
echo "DB_USER=tam_prod"
echo "DB_PASSWORD=$(generate_password 32)"
echo ""
echo "# Redis"
echo "REDIS_PASSWORD=$(generate_password 32)"
echo ""
echo "# JWT Secrets (min 32 chars)"
echo "JWT_SECRET=$(generate_jwt_secret)"
echo "JWT_REFRESH_SECRET=$(generate_jwt_secret)"
echo ""
echo "# Encryption Key (32 bytes hex = 64 chars)"
echo "ENCRYPTION_KEY=$(generate_hex_key 32)"
echo ""
echo "# Telegram (fill in manually)"
echo "BOT_TOKEN=your_bot_token_from_botfather"
echo "TELEGRAM_API_ID=your_api_id"
echo "TELEGRAM_API_HASH=your_api_hash"
echo "TELEGRAM_SESSION="
echo ""
echo "# TON (fill in manually)"
echo "TON_NETWORK=mainnet"
echo "TON_MASTER_WALLET_MNEMONIC="
echo "TON_API_KEY="
echo ""
echo "# App"
echo "NODE_ENV=production"
echo "ALLOWED_ORIGINS=https://web.telegram.org,https://your-domain.com"
echo ""
echo "============================================"
echo ""
echo "To save to .env file:"
echo "  ./scripts/generate-secrets.sh > docker/.env"
echo ""
echo "Password strength check:"

# Check password strength
check_strength() {
    local pass="$1"
    local name="$2"
    local len=${#pass}
    local has_upper=$(echo "$pass" | grep -c '[A-Z]')
    local has_lower=$(echo "$pass" | grep -c '[a-z]')
    local has_digit=$(echo "$pass" | grep -c '[0-9]')
    local has_special=$(echo "$pass" | grep -c '[!@#$%^&*()_+-=]')

    if [ $len -ge 32 ] && [ $has_upper -gt 0 ] && [ $has_lower -gt 0 ] && [ $has_digit -gt 0 ]; then
        echo "  ✅ $name: STRONG ($len chars)"
    elif [ $len -ge 16 ]; then
        echo "  ⚠️  $name: MEDIUM ($len chars)"
    else
        echo "  ❌ $name: WEAK ($len chars)"
    fi
}

DB_PASS=$(generate_password 32)
REDIS_PASS=$(generate_password 32)
JWT=$(generate_jwt_secret)

check_strength "$DB_PASS" "DB_PASSWORD"
check_strength "$REDIS_PASS" "REDIS_PASSWORD"
check_strength "$JWT" "JWT_SECRET"
