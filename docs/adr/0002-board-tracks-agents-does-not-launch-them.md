# The board tracks agents; it does not launch them

The board is a passive tracker: agents are started elsewhere (e.g. by the grill-and-build parent) and report to the board. Having the board spawn executor processes when a Ticket reaches To Do was considered and rejected for v1, because it drags in process management, timeouts, permission-skipping flags and concurrency that the existing orchestrator already owns.
