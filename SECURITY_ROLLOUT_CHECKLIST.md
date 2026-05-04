# Security Rollout Checklist

## 1. Secrets and environment

- Set `JWT_SECRET` to a random value of at least 32 characters
- Set `BRIDGE_TOKEN_SHARED_SECRET` to a different random value of at least 32 characters
- Set `NEXTAUTH_SECRET` to a third random value of at least 32 characters
- Set `NODE_ENV=production` in production
- Set `ENABLE_PUBLIC_REGISTRATION=false`
- Set `FRONTEND_URL` to the exact production frontend origin
- Set `JWT_ISSUER` and `JWT_AUDIENCE`
- Set `MAX_FAILED_LOGIN_ATTEMPTS` and `ACCOUNT_LOCKOUT_MINUTES` to the desired policy

## 2. Database rollout

- Run `npm run db:migrate`
- Verify new `users` columns exist:
  - `failed_login_attempts`
  - `locked_until`
  - `password_changed_at`
  - `mfa_enabled`
  - `mfa_secret`
- Verify `knex_migrations` contains the new migration batch

## 3. Authentication verification

- Login with a valid password and confirm access works
- Try 5 invalid passwords and confirm the account becomes locked
- Confirm locked accounts return a blocked response
- Reset the user password and confirm the lock is cleared
- Confirm `/api/auth/bridge-token` fails without the shared secret
- Confirm protected API routes reject requests without a valid bearer token

## 4. MFA verification

- Open `/security`
- Start MFA setup with the current password
- Add the generated secret to an authenticator app
- Verify with a valid 6-digit code and confirm MFA becomes enabled
- Log out and log back in
- Confirm the login flow now requires a second factor
- Enter an invalid MFA code and confirm access is denied
- Disable MFA only with both current password and valid MFA code

## 5. Authorization verification

- Confirm a regular user cannot access admin routes
- Confirm user APIs do not return `password_hash`
- Confirm a grade coordinator cannot access another grade's data
- Confirm WebSocket connections fail without a valid token

## 6. Audit verification

- Confirm `audit_logs` records:
  - login success
  - login failure / lockout
  - logout
  - user creation
  - user update
  - password reset
  - MFA setup / enable / disable

## 7. Operational controls

- Enforce HTTPS in production
- Store secrets only in environment or secret manager
- Back up the database and test restore
- Review logs retention and access permissions
- Run dependency review before release
- Document incident response contacts and recovery steps
