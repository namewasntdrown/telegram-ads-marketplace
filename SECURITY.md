# Security Configuration

## Overview

This document describes the security measures implemented in the Telegram Ads Marketplace.

## Quick Setup

Run the complete security setup on your production server:

```bash
sudo SSH_PORT=22222 DEPLOY_USER=deploy ./scripts/full-security-setup.sh
```

Then verify:

```bash
sudo ./scripts/verify-security.sh
```

## Firewall Configuration

### Open Ports (External)

| Port | Service | Access |
|------|---------|--------|
| 443 | HTTPS (nginx) | Public |
| 22222 | SSH (customizable) | Admin IP only |

### Closed Ports (Internal Docker Network Only)

| Port | Service | Access |
|------|---------|--------|
| 3000 | API | Internal only |
| 3001 | Bot | Internal only |
| 3002 | MTProto Worker | Internal only |
| 3003 | Workers | Internal only |
| 5432 | PostgreSQL | Internal only |
| 6379 | Redis | Internal only |

### UFW Commands

```bash
# Check status
sudo ufw status verbose

# Allow new port
sudo ufw allow 443/tcp

# Block port
sudo ufw deny 80/tcp

# Delete rule
sudo ufw delete allow 80/tcp
```

## SSH Hardening

Configuration in `/etc/ssh/sshd_config.d/hardening.conf`:

- Non-standard port (default: 22222)
- Root login disabled
- Password authentication disabled (key-only)
- Max 3 auth attempts
- Limited to specific users

### Generate SSH Key

```bash
ssh-keygen -t ed25519 -C "deploy@telegram-ads-marketplace"
```

### Add Key to Server

```bash
ssh-copy-id -p 22222 deploy@your-server
```

## Fail2Ban Protection

Active jails:
- **sshd** - Bans after 3 failed SSH attempts
- **nginx-limit-req** - Bans after 10 rate limit violations
- **nginx-http-auth** - Bans after 5 auth failures

### Fail2Ban Commands

```bash
# Check status
sudo fail2ban-client status

# Check SSH jail
sudo fail2ban-client status sshd

# Unban IP
sudo fail2ban-client set sshd unbanip 192.168.1.100
```

## Docker Network Isolation

Production docker-compose uses two networks:

```yaml
networks:
  internal:
    internal: true  # No external access
  web:
    driver: bridge  # Only nginx exposed
```

Only nginx is connected to both networks.

## Application Security

### API Security Measures

1. **SQL Injection** - Prisma ORM with parameterized queries
2. **XSS Prevention** - DOMPurify sanitization, CSP headers
3. **Rate Limiting** - NestJS Throttler + nginx limit_req
4. **Authentication** - Telegram WebApp HMAC-SHA256 + JWT
5. **Authorization** - Role-based access control
6. **Input Validation** - class-validator on all DTOs

### Nginx Security Headers

```nginx
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000
Content-Security-Policy: default-src 'self'...
```

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| General API | 100 req/min |
| Auth endpoints | 5 req/min |
| Financial operations | 10 req/min |
| nginx (global) | 10 req/sec (burst 20) |

## Encryption

### TON Wallet Keys
- AES-256-GCM encryption with scrypt key derivation
- 16-byte salt, 12-byte IV, 16-byte auth tag

### JWT Tokens
- Access token: 15 minute expiry
- Refresh token: 7 day expiry with rotation
- Stored refresh tokens are hashed with scrypt

## Database Security

PostgreSQL configuration:
```
# Only listen on Docker network
listen_addresses = 'localhost'

# SSL required, reject external connections
hostssl all all 172.16.0.0/12 scram-sha-256
host all all 0.0.0.0/0 reject
```

## Redis Security

```
bind 127.0.0.1
requirepass STRONG_PASSWORD
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG ""
```

## Verification Checklist

Run on production server:

```bash
# 1. Check firewall
sudo ufw status

# 2. Check open ports (from external machine)
nmap -p- your-server-ip

# 3. Check SSH config
sudo sshd -T | grep -E "port|permitroot|password"

# 4. Check fail2ban
sudo fail2ban-client status

# 5. Check Docker networks
docker network ls
docker network inspect tam_internal

# 6. Test rate limiting
for i in {1..15}; do curl -s -o /dev/null -w "%{http_code}\n" https://your-domain/api/v1/health; done
# Should see 429 after ~10 requests
```

## Incident Response

### If Compromised

1. **Isolate**: `sudo ufw deny from any`
2. **Preserve**: Snapshot/backup current state
3. **Investigate**: Check logs in `/var/log/auth.log`, nginx logs
4. **Rotate**: Change all secrets, API keys, JWT secrets
5. **Restore**: From known good backup
6. **Review**: Update security measures

### Log Locations

- Auth attempts: `/var/log/auth.log`
- Fail2ban: `/var/log/fail2ban.log`
- nginx: `/var/log/nginx/access.log`, `/var/log/nginx/error.log`
- Docker: `docker logs <container>`
- App audit: Stored in PostgreSQL `AuditLog` table
