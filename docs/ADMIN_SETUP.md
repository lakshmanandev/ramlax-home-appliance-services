# Secure administrator setup

## Configure the API

Keep the API environment file local and untracked. Set `MONGODB_URI`, `WEB_ORIGIN`, `JWT_SECRET`, `BUSINESS_TIME_ZONE`, and the optional business contact values in `apps/api/.env`.

Generate a high entropy signing key locally with Node:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Copy the generated value into `JWT_SECRET`. Use the exact browser origin or comma-separated origins in `WEB_ORIGIN`, without trailing paths. Production startup rejects localhost web origins and weak placeholder JWT secrets. Use HTTPS in production; the authentication cookie is then marked Secure.

## Create the first administrator

Set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of at least 12 characters in the local API environment, then run from the repository root:

```powershell
npm run bootstrap:admin --workspace=@ramlax/api
```

The one-time CLI hashes the password with Argon2id, creates an owner account, and refuses to proceed if any administrator already exists. It is not part of API startup and there is no public administrator-creation endpoint. Remove `ADMIN_PASSWORD` from the local environment after provisioning and never commit or log it. Additional administrator accounts must be provisioned through a separately reviewed, authenticated operational process.

## Session behavior

Login issues a 20-minute HttpOnly JWT cookie. The API checks the current account status, role, and session version on protected requests. Logout increments the account's session version and clears the cookie, revoking all previously issued access tokens for that account. The frontend checks the session before rendering admin routes and rechecks it periodically; server authorization remains mandatory.

Review production CORS origins, database access restrictions, backups, TLS termination, and secret rotation with the deployment owner before going live.
