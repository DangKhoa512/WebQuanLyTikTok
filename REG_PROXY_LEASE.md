# Proxy Reg phone API

Configure the owner-specific pool in Settings > Common > Proxy Reg. Values host:port:user:pass are normalized to user:pass@host:port on read/save and deduplicated. Phone must use SOCKS5.

All requests below use POST, Content-Type: application/json and x-api-key: <username>. Production requires HTTPS.

## Allocate

POST /api/proxy/allocate

Body: {"device_id":"<device-id>"}

Response fields: success, status, proxy, proxy_exit_ip, session_id, session_token, lease_status, expires_at, reused. Authenticated proxies return user:pass@host:port; unauthenticated proxies return host:port. Repeated allocation for an active device returns LEASE_REUSED and the same lease.

Health check uses SOCKS5 (socks5h remote destination DNS), verified HTTPS, validated/pinned public proxy address, no redirects/direct/HTTP fallback. Default: up to two proxies per request, eight seconds each (REG_PROXY_MAX_CHECKS_PER_ALLOCATE / REG_PROXY_CHECK_TIMEOUT_MS). Unavailable pool returns HTTP409 PROXY_UNAVAILABLE with retry_after_seconds=15; keep the task and retry later.

## Report success

POST /api/facebook/reg/report or /api/instagram/reg/report

Body: {"device_id":"<device-id>","text":"<existing account report format>"}

After accepting valid account data, backend releases the current lease by authenticated owner + device_id under transaction/row lock. No proxy_session_id/proxy_session_token needed. Response omits proxy_released/proxy_release_status. Missing lease does not prevent account report.

/api/proxy/heartbeat has been removed. TTL defaults to 30 minutes (REG_PROXY_LEASE_TTL_SECONDS). Complete report before lease expiry and before allocating a new round: delayed/repeated reports affect the current device lease.

## Release on failure/cancellation

POST /api/proxy/release

Body: {"device_id":"<device-id>","session_id":"<session-id>","session_token":"<session-token>","result":"FAILED","reason":"REG_FAILED"}

Explicit release still requires the owner/device-bound token. Repeated valid release returns ALREADY_RELEASED. One active lease per device; proxy and exit IP cannot be shared concurrently within an owner. Transaction/unique guards enforce this. Credentials are not copied into lease/history/log. Expired leases are unlocked on subsequent requests.

## Deployment

Run npm run migrate:reg-proxy-leases --prefix backend before restarting the new backend. No VPS deployment or live SOCKS5 certification yet; automated tests use temporary databases and network stubs.
