---
status: accepted
---
# One owner, env-configured auth, and only in hosted mode

The hosted board has exactly one human owner and no user accounts. The browser logs in with a password checked against a hash in env (`AWB_OWNER_PASSWORD_HASH`) and gets a signed, httpOnly, Secure, SameSite=Lax session cookie (`AWB_SESSION_SECRET`, 30 days). Because frontend and backend are same-site (ADR 0006), `fetch` with credentials and `EventSource` with `withCredentials` both send that cookie, and a browser session always acts as Actor `you`. The CLI and MCP clients send `Authorization: Bearer <token>`, where the tokens are static values in env (`AWB_API_TOKENS`). A token only proves the caller is allowed in; it doesn't say which Actor is acting, and agents still name themselves and can't act as `you`. The backend refuses to start in hosted mode (non-loopback bind or `DATABASE_URL` set) unless all of this is configured. Local mode stays open with no login. We rejected GitHub OAuth (a third-party dependency for one person) and tokens managed in the UI (more than a single owner needs). Tokens managed in the UI can be added later without breaking anything.
