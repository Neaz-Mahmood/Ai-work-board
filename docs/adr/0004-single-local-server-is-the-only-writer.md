> Status: amended by ADR 0006. The UI is now a separate app and the bind host is configurable; the rest of this decision stands.

# One local server is the only writer; CLI and MCP are clients of it

A single long-running local server (`awb start`, default port 4747, bound to 127.0.0.1) owns the SQLite database and serves the UI, a REST API, and MCP over Streamable HTTP at `/mcp`. The `awb` CLI is a thin HTTP client. We rejected having the CLI and a stdio MCP server open the database directly through a shared library: that would work while the server is down, but it would spread validation and Activity logging across processes and force the UI to poll the database for live updates. The cost is that agents cannot write unless the server is running, and their calls fail with an error saying to run `awb start`.
