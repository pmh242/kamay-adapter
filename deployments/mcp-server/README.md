# MCP server placeholder

The MCP deployment is deferred to Phase 7 of the Kamay build plan. v0.1.0 exposes the repository cognition substrate over HTTP first so AI clients can use stable `web_fetch` calls without depending on a vendor-specific connector.

When implemented, this directory should contain:

- `server.js`
- `package.json`
- `README.md`

The tool surface should mirror the HTTP API:

- `repo.health`
- `repo.capabilities`
- `repo.getFile`
- `repo.getFiles`
- `repo.getBlob`
- `repo.getTree`
- `repo.getCommits`
- `repo.getDiff`

Runtime target:

- Node
- `@modelcontextprotocol/sdk`

Supported transports:

- `stdio` for Claude Desktop
- `streamable-http` for remote clients
