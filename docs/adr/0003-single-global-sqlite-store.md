# One global SQLite database, outside the tracked repos

All Projects live in a single SQLite database at `~/.ai-work-board/board.db` (WAL mode), not in per-repo files. This keeps concurrent writes from several agents safe, shows every Project in one place, and puts no board files into the repos being worked on; the cost is that board data is not versioned with the code.
