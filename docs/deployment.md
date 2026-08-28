# NOVA ORG — Production Deployment & Administration Guide

This document provides complete instructions for deploying NOVA ORG to production servers (VPS) according to Section 25 (AGENT 10) and Section 26 (Phase 5) of `NOVA_ORG_AGENT_PLAN.md`.

---

## 1. Server Prerequisites

- **OS**: Ubuntu 24.04 LTS (recommended) or Debian 12
- **Hardware**: 2 CPU cores, 4 GB RAM, 40 GB SSD minimum
- **Domains**: 3 subdomains pointing to your server's IP address:
  - `app.yourdomain.com` (Telegram Mini App)
  - `api.yourdomain.com` (Fastify API)
  - `admin.yourdomain.com` (Admin Control Panel)

---

## 2. Server Initial Setup

### Step 1: Install Docker & Docker Compose

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw fail2ban

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### Step 2: Configure UFW Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 3. Deployment Setup

### Step 1: Clone Repository & Create `.env`

```bash
git clone https://github.com/your-org/nova-org.git /opt/nova-org
cd /opt/nova-org

cp .env.example .env
nano .env
```

Set production secrets in `.env`:

```env
NODE_ENV=production
TELEGRAM_BOT_TOKEN=123456789:ABCDefghIJKlmnOPQRstuvWXYZ
TELEGRAM_BOT_USERNAME=NovaOrgBot

APP_URL=https://app.yourdomain.com
API_URL=https://api.yourdomain.com
ADMIN_URL=https://admin.yourdomain.com

DATABASE_URL=postgresql://nova:SUPER_STRONG_PASSWORD@postgres:5432/nova_org
POSTGRES_USER=nova
POSTGRES_PASSWORD=SUPER_STRONG_PASSWORD
POSTGRES_DB=nova_org

REDIS_URL=redis://redis:6379

JWT_SECRET=super_secret_jwt_key_32_characters_long
SESSION_SECRET=super_secret_session_key_32_chars
WORK_SIGNING_SECRET=super_secret_work_key_32_chars
INTERNAL_API_SECRET=super_secret_internal_key_32_chars

ADMIN_TELEGRAM_IDS=6536916039
```

### Step 2: SSL Certificate Generation (Let's Encrypt / Certbot)

```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d app.yourdomain.com -d api.yourdomain.com -d admin.yourdomain.com
```

---

## 4. Launching Production Stack

Run the automated deployment script:

```bash
chmod +x infra/scripts/*.sh
./infra/scripts/deploy.sh
```

---

## 5. Automated Backups & Health Checks

Add Cron jobs for daily database backups and uptime monitoring:

```bash
crontab -e
```

Add lines:

```cron
# Daily database backup at 03:00 AM
0 3 * * * /opt/nova-org/infra/scripts/backup-postgres.sh >> /var/log/nova-backup.log 2>&1

# Health check every 5 minutes
*/5 * * * * /opt/nova-org/infra/scripts/health-check.sh >> /var/log/nova-health.log 2>&1
```

---

## 6. Verification

Check running services:

```bash
docker compose -f infra/docker/docker-compose.prod.yml ps
```

All 6 production services (`postgres`, `redis`, `api`, `bot`, `server-worker`, `nginx`) should be running cleanly with zero errors.
