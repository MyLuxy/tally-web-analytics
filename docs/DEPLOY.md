# Deploying Tally

Tally runs as a single Docker container. The only real choice is how it's put
behind HTTPS:

- **Option A — you already run a web server (nginx/apache + certbot).** Tally
  binds to localhost and your existing proxy serves the subdomain and the
  certificate. No port conflicts. This is the safest path if the box already
  hosts another site.
- **Option B — fresh server, nothing on ports 80/443 yet.** Use the bundled
  Caddy container for automatic HTTPS.

The shared setup is the same; pick the option that matches your box at step 4.

## 1. Get a hostname (DuckDNS)

You don't need to buy a domain.

1. Go to <https://www.duckdns.org> and sign in (GitHub/Google).
2. Pick a subdomain, e.g. `mysite`, and create it.
3. Set its IP to your VPS's public IP address and save.

Confirm it resolves to your server:

```bash
ping mysite.duckdns.org
```

## 2. Install Docker (if it isn't already)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in so the group change takes effect
docker compose version
```

## 3. Get the code and configure it

```bash
git clone https://github.com/MyLuxy/tally-web-analytics.git
cd tally-web-analytics

cp .env.example .env
nano .env
```

In `.env`:

- `TALLY_TOKEN` — a long random string to lock the dashboard, or leave empty to
  keep it open. A quick one: `openssl rand -hex 24`.
- `TALLY_HOST_PORT` — the localhost port the container is published on. The
  default is `3000`; **change it if 3000 is already used** on the box.
- `TALLY_DOMAIN` — only matters for Option B (Caddy). Set it to your DuckDNS
  hostname there; ignore it for Option A.

---

## Option A — behind your existing nginx/apache

This keeps your current site untouched: Tally listens only on
`127.0.0.1:<TALLY_HOST_PORT>`, and your proxy forwards the subdomain to it.

**1. Start Tally** (no Caddy, just the app):

```bash
docker compose up -d --build
```

Check it's up locally:

```bash
curl http://127.0.0.1:3000/health   # -> {"ok":true}
```

**2a. nginx** — create `/etc/nginx/sites-available/tally`:

```nginx
server {
    listen 80;
    server_name mysite.duckdns.org;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it and reload, then let certbot add HTTPS:

```bash
sudo ln -s /etc/nginx/sites-available/tally /etc/nginx/sites-enabled/tally
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d mysite.duckdns.org
```

**2b. apache** — make sure the proxy modules are on, then add a vhost:

```bash
sudo a2enmod proxy proxy_http headers
```

`/etc/apache2/sites-available/tally.conf`:

```apache
<VirtualHost *:80>
    ServerName mysite.duckdns.org
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
    RequestHeader set X-Forwarded-Proto "http"
</VirtualHost>
```

```bash
sudo a2ensite tally
sudo apache2ctl configtest && sudo systemctl reload apache2
sudo certbot --apache -d mysite.duckdns.org
```

certbot reuses the same setup as your existing site, so nothing there changes.
Open `https://mysite.duckdns.org` and you should see the dashboard.

---

## Option B — fresh server with bundled Caddy

Only if nothing else is using ports 80 and 443.

```bash
sudo ufw allow 80
sudo ufw allow 443
docker compose --profile caddy up -d --build
```

Caddy fetches a Let's Encrypt certificate for `TALLY_DOMAIN` and proxies to
Tally. First start takes a minute or two; watch with `docker compose logs -f`.
Open `https://your-subdomain.duckdns.org`.

---

## Country breakdown (nginx + GeoIP2)

By design Tally never geolocates the IP itself — it reads the country from an
edge header (`cf-ipcountry` and friends) so it never has to store the address.
Behind Cloudflare/Vercel/Fastly that header is already there. On a plain nginx
box it isn't, so the Countries panel stays empty until you add it.

The fix is to let nginx resolve the country from the client IP and pass it on as
`X-Country-Code` (which Tally already reads). The lookup happens in the proxy;
the IP is still never stored.

**1. Install the GeoIP2 module**

```bash
sudo apt install -y libnginx-mod-http-geoip2
```

**2. Grab a free country database** (db-ip's lite DB — no account needed,
refreshed monthly):

```bash
sudo mkdir -p /etc/nginx/geoip
month=$(date +%Y-%m)
sudo curl -fL -o /etc/nginx/geoip/dbip-country-lite.mmdb.gz \
  "https://download.db-ip.com/free/dbip-country-lite-$month.mmdb.gz"
sudo gunzip -f /etc/nginx/geoip/dbip-country-lite.mmdb.gz
```

**3. Define the lookup** — create `/etc/nginx/conf.d/geoip2.conf`:

```nginx
geoip2 /etc/nginx/geoip/dbip-country-lite.mmdb {
    auto_reload 60m;
    $geoip2_country_code country iso_code;
}
```

**4. Pass the header to Tally** — add one line inside the `location /` block of
your Tally site (`/etc/nginx/sites-available/tally`):

```nginx
    proxy_set_header X-Country-Code $geoip2_country_code;
```

**5. Reload:**

```bash
sudo nginx -t && sudo systemctl reload nginx
```

No Tally restart needed — the header is read per request. New pageviews start
carrying a country; already-stored events keep whatever they had. Visitors on a
private/LAN IP (or some VPNs) resolve to nothing and simply don't count toward
the breakdown. Re-run step 2 now and then to refresh the database.

---

## Start collecting

On any site you want to track, add the tracker pointing at your server:

```html
<script
  defer
  data-site="my-site"
  src="https://mysite.duckdns.org/tracker.js"
></script>
```

Reload that page a few times, then refresh the dashboard. The site appears in the
picker on its first event — no setup, no registration.

## Updating

```bash
git pull
docker compose up -d --build              # Option A
# docker compose --profile caddy up -d --build   # Option B
```

The SQLite database lives on a Docker volume (`tally-data`), so it survives
rebuilds and updates.

## Notes

- The country breakdown relies on an edge header (`cf-ipcountry` and friends),
  so behind a plain proxy it's empty until you set that header yourself — see
  [Country breakdown](#country-breakdown-nginx--geoip2) above for the nginx
  GeoIP2 setup. Everything else works as is.
- Back up the database any time by copying the file out of the volume:
  `docker compose cp tally:/data/tally.sqlite ./backup.sqlite`
