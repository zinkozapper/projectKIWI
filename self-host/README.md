# Self-hosting Kiwi with Docker Compose

> **Experimental: not production ready.** The Compose stack and migration integration are works in progress and have not been runtime validated. Do not trust it with important or sensitive data until you have independently validated deployment, security, migrations, and recovery.

The intended deployment runs Kiwi, Postgres, Supabase Auth, PostgREST, Kong, and background pricing and metrics jobs on one host. Kong listens only on the host's loopback interface. By default, open Kiwi on that host at `http://localhost:8000` without a proxy. An external HTTPS reverse proxy is needed for access from other LAN devices. Docker Compose and Node.js are needed; the proxy, hostname, and trusted certificate are only needed for LAN access.

## Configure

From the repository's `self-host` directory:

```bash
node setup.mjs
```

This creates `.env` from `.env.example` if needed and fills in the database password, JWT secret, and matching API keys. It will not replace any existing credentials. Keep the generated `.env` private and backed up: changing these values on an existing installation requires a coordinated migration.

Leave `PUBLIC_URL` blank to use `http://localhost:8000` on the Docker host. If you change `KIWI_PORT`, the default URL uses that port automatically. For LAN access, set `PUBLIC_URL` to the HTTPS origin clients will use, without a trailing slash, for example `https://kiwi.example.lan`. LAN clients must resolve this hostname to the proxy and trust its certificate. `KIWI_PORT` defaults to `8000` and is bound to `127.0.0.1` only; localhost is not accessible from other devices.

Keep `.env`, backups, the JWT secret, database password, and service-role key private. The publishable key is intentionally included in the browser build; the service-role key bypasses database row-level security and must never be exposed to clients. Protect the Docker host and Docker socket as administrator access. The generated API keys expire after ten years; credential rotation has not been validated.

For the AI food finder, configure `OPENAI_BASE_URL` and `OPENAI_MODEL` for an OpenAI-compatible provider supporting function tool calls, and `FDC_API_KEY` for USDA FoodData Central. Set `OPENAI_API_KEY` if the provider requires authentication; it may be blank for a local endpoint. The finder is disabled until the URL, model, and USDA key are configured. Optional `KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET` enable Kroger price lookups; without them new foods can be saved unpriced. These integrations need network access to their providers. Provider availability, compatibility, costs, and data handling are your responsibility.

Passkeys default to disabled. Enable `GOTRUE_PASSKEY_ENABLED` only after validating the Auth version and HTTPS origin, and configure `GOTRUE_WEBAUTHN_RP_ID`, `GOTRUE_WEBAUTHN_RP_DISPLAY_NAME`, and `GOTRUE_WEBAUTHN_RP_ORIGINS` for your deployment.

## HTTPS proxy (optional for LAN access)

Configure an external Nginx server to terminate TLS and proxy **all paths** to `http://127.0.0.1:8000` (replace the port if `KIWI_PORT` differs). Kong routes both the application and Supabase endpoints; do not send only the app path to it. For example, adapt the hostname and certificate paths:

```nginx
server {
    listen 443 ssl;
    server_name kiwi.example.lan;
    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Restrict network access to the proxy as appropriate. LAN exposure is not authentication or a security boundary. Keep Postgres and internal services off public interfaces.

## Start and administer

From `self-host`, start or rebuild the stack:

```bash
docker compose up --build -d
```

With the default settings, open `http://localhost:8000` on the Docker host. If you change `PUBLIC_URL`, rebuild the app with the command above because its URL is embedded in the browser build.

The migration service runs before the app and initializes the catalog once. Migration and seed execution have not yet been tested against a running database; validate the complete flow before relying on the instance. After creating an account, promote that existing account from `self-host` with:

```bash
node ../scripts/self-host/admin.mjs
```

Enter the account email at the prompt. This requires a running database and the admin schema to be in place. Admin access is privileged; promote only trusted accounts.

Signup is open to anyone who can reach the instance, and email accounts are automatically confirmed. No SMTP service is configured: email delivery, including password-reset messages, is not available. Restrict access at the network or proxy layer if open registration is unacceptable.

## Data, privacy, and recovery

Compose declares persistent `db-data` and `db-config` volumes. They outlive ordinary container recreation and contain database data and configuration; removing volumes destroys that stored state. Do not use volume-removal commands unless you intend to lose it.

Back up the database and relevant configuration/secrets securely, including what is needed to recreate the deployment. A consistent backup and restore procedure for this stack has **not been verified**; design and test one on a separate instance before storing valuable data. Verify restoration of accounts, application data, and configuration, and protect backups like the live database. Do not assume copying a live database volume is a consistent backup.

This deployment does not configure Kiwi telemetry. It is not an offline or no-egress guarantee: image pulls and configured integrations use external networks. Food searches and candidate information can be sent to USDA and the configured model provider; Kroger lookups can send ZIP codes and food search terms. Review provider policies and disclose this to users before enabling integrations.
