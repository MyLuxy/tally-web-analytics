# Deploying Tally

This walks through running Tally on a plain Ubuntu/Debian VPS with Docker, and
serving it over HTTPS on a free DuckDNS subdomain. End result: the dashboard and
the tracker live at `https://your-subdomain.duckdns.org`.

Everything runs as two containers: Tally itself, and Caddy in front of it for
automatic HTTPS (see `docker-compose.yml`).

## 1. Get a hostname (DuckDNS)

You don't need to buy a domain.

1. Go to <https://www.duckdns.org> and sign in (GitHub/Google).
2. Pick a subdomain, e.g. `mysite`, and create it.
3. Set its IP to your VPS's public IP address and save.

You now have `mysite.duckdns.org` pointing at the server. Confirm it resolves:

```bash
ping mysite.duckdns.org
```

## 2. Open the firewall

HTTPS issuance and traffic need ports 80 and 443 reachable.

```bash
sudo ufw allow 80
sudo ufw allow 443
```

(If you use a cloud provider's security groups, allow 80/443 there too.)

## 3. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in so the group change takes effect
```

Check it:

```bash
docker compose version
```

## 4. Get the code and configure it

```bash
git clone https://github.com/MyLuxy/tally-web-analytics.git
cd tally-web-analytics

cp .env.example .env
nano .env
```

In `.env` set:

- `TALLY_DOMAIN` to your DuckDNS hostname, e.g. `mysite.duckdns.org`
- `TALLY_TOKEN` to a long random string if you want the dashboard locked
  (leave it empty to keep it open). A quick one: `openssl rand -hex 24`

## 5. Build and run

```bash
docker compose up -d --build
```

The first start takes a minute or two: it builds the image and Caddy fetches the
certificate. Watch the logs if you like:

```bash
docker compose logs -f
```

Then open `https://your-subdomain.duckdns.org` — you should see the dashboard
(empty until events arrive).

## 6. Start collecting

On any site you want to track, add the tracker and point it at your server:

```html
<script
  defer
  data-site="my-site"
  src="https://your-subdomain.duckdns.org/tracker.js"
></script>
```

Reload that page a few times, then refresh the dashboard.

## Updating

```bash
git pull
docker compose up -d --build
```

The SQLite database lives on a Docker volume (`tally-data`), so it survives
rebuilds and updates.

## Notes

- The country breakdown relies on an edge header (`cf-ipcountry` and friends).
  Behind plain Caddy that header isn't set, so country stays empty unless you
  also front the site with something like Cloudflare. Everything else works as is.
- Backups are just the SQLite file. Copy it out of the volume any time:
  `docker compose cp tally:/data/tally.sqlite ./backup.sqlite`
