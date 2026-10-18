---
status: accepted
---
# A Project's path is a client-normalized string; the server never touches the filesystem

A hosted server can't see the repositories on the user's machine. The CLI and MCP clients therefore resolve symlinks and normalize the repository path and the cwd on the agent's machine. The server only stores the path and matches a cwd by deepest prefix, with no existence check. One repository cloned at different paths on different machines doesn't resolve to one Project. Agents can name the Project explicitly by its Project Key instead. Identifying Projects by git remote URL was rejected for now.
