import { parseArgs } from "node:util";
import type { CliIo, GlobalOptions } from "./client.ts";
import { CliDomainError, ServerUnreachable } from "./client.ts";
import { startCommand } from "./commands/start.ts";
import { initCommand } from "./commands/init.ts";
import { projectsCommand } from "./commands/projects.ts";
import { boardCommand } from "./commands/board.ts";
import {
  ticketBlockCommand,
  ticketCommentCommand,
  ticketCreateCommand,
  ticketListCommand,
  ticketMoveCommand,
  ticketShowCommand,
  ticketUnblockCommand,
  ticketUpdateCommand,
  ticketAttentionCommand,
} from "./commands/tickets.ts";
import {
  featureCreateCommand,
  featureListCommand,
  featureShowCommand,
  featureUpdateCommand,
} from "./commands/features.ts";
import { claimCommand } from "./commands/claim.ts";

export type { CliIo } from "./client.ts";

const USAGE = `Usage: awb <command> [options]

Commands:
  start [--host H] [--port N] [--data-dir DIR] [--open]
                 Start the AI Work Board server in the foreground
  init [--key KEY] [--name NAME] [--path DIR]
                 Register a directory as a Project
  projects       List registered Projects
  board          Show the kanban board for a Project
  claim [--feature ID]
                 Claim the next eligible unblocked To Do ticket
  ticket list [--column C] [--feature ID] [--assignee NAME] [--query TEXT]
                 List tickets in a Project
  ticket show <KEY>
                 Show ticket details, blockers, comments, and activity
  ticket create <TITLE> [-d TEXT | --description-file FILE] [--column C] [--priority P] [--feature ID] [--assignee NAME] [--blocked-by KEY ...]
                 Create a new ticket (default column: backlog)
  ticket update <KEY> [--title TITLE] [-d TEXT | --description-file FILE] [--priority P] [--feature ID|none] [--assignee NAME|none]
                 Update ticket fields
  ticket move <KEY> <COLUMN> [--position N]
                 Move a ticket to a column (backlog, todo, in-progress, in-review, done)
  ticket block <KEY> --by <BLOCKER>
                 Block a ticket by another ticket
  ticket unblock <KEY> --by <BLOCKER>
                 Unblock a ticket from another ticket
  ticket comment <KEY> [TEXT] [--file FILE]
                 Add a markdown comment to a ticket
  ticket attention <KEY> [REASON] [--clear]
                 Flag a ticket as needs-attention or clear the flag
  feature list   List features in a Project with progress
  feature show <ID>
                 Show feature details, progress, and tickets
  feature create <NAME> [-d TEXT] [--color HEX] [--tickets-file FILE.json]
                 Create a new feature with optional ordered tickets
  feature update <ID> [--name NAME] [-d TEXT] [--color HEX]
                 Update a feature

Global Options:
  --as <actor>         Actor name (default: AWB_ACTOR or agent; 'you' reserved for UI)
  --project <key>      Project key (resolved from directory if omitted)
  --json               Output JSON
  --url <url>          Server URL (default: http://127.0.0.1:4747 or AWB_URL)
  -h, --help           Show help

Exit Codes:
  0                    Success
  1                    Domain error
  2                    Usage error
  3                    Server not running
`;

function getHelpText(cmd?: string, sub?: string): string {
  if (!cmd) {
    return USAGE;
  }

  switch (cmd) {
    case "start":
      return `Usage: awb start [--host H] [--port N] [--data-dir DIR] [--open]

Start the AI Work Board server in the foreground.

Options:
  --host <H>           Interface to bind (default: 127.0.0.1 or AWB_HOST)
  --port <N>           Port to listen on (default: 4747 or AWB_PORT)
  --data-dir <DIR>     Directory for board database (default: ~/.ai-work-board or AWB_HOME)
  --open               Open the board in the default browser on start
  -h, --help           Show help
`;

    case "init":
      return `Usage: awb init [--key KEY] [--name NAME] [--path DIR]

Register a repository directory as a Project.

Options:
  --key <KEY>          Optional project key (2-5 uppercase letters)
  --name <NAME>        Optional project display name
  --path <DIR>         Repository path (defaults to current directory)
  --as <actor>         Actor name
  --json               Output JSON
  --url <url>          Server URL
  -h, --help           Show help
`;

    case "projects":
      return `Usage: awb projects

List all registered Projects.

Global Options:
  --json               Output JSON
  --url <url>          Server URL
  -h, --help           Show help
`;

    case "board":
      return `Usage: awb board

Show the kanban board for a Project.

Options:
  --project <key>      Project key (resolved from directory if omitted)
  --json               Output JSON
  --url <url>          Server URL
  -h, --help           Show help
`;

    case "claim":
      return `Usage: awb claim [--feature ID]

Claim the next eligible unblocked To Do ticket and move it to In Progress.

Options:
  --feature <ID>       Limit claim to tickets within this feature ID
  --project <key>      Project key (resolved from directory if omitted)
  --as <actor>         Actor claiming the ticket
  --json               Output JSON
  --url <url>          Server URL
  -h, --help           Show help
`;

    case "ticket":
      if (!sub) {
        return `Usage: awb ticket <subcommand> [options]

Subcommands:
  list [--column C] [--feature ID] [--assignee NAME] [--query TEXT]
      List tickets on the project board
  show <KEY>
      Show full ticket details, blockers, comments, and activity
  create <TITLE> [-d TEXT | --description-file FILE] [--column C] [--priority P] [--feature ID] [--assignee NAME] [--blocked-by KEY ...]
      Create a new ticket (default column: backlog)
  update <KEY> [--title TITLE] [-d TEXT | --description-file FILE] [--priority P] [--feature ID|none] [--assignee NAME|none]
      Update ticket fields
  move <KEY> <COLUMN> [--position N]
      Move a ticket to a column (backlog, todo, in-progress, in-review, done)
  block <KEY> --by <BLOCKER>
      Block a ticket by another ticket
  unblock <KEY> --by <BLOCKER>
      Unblock a ticket from another ticket
  comment <KEY> [TEXT] [--file FILE]
      Add a markdown comment to a ticket
  attention <KEY> [REASON] [--clear]
      Flag a ticket as needs-attention or clear the flag

Global Options:
  --as <actor>         Actor name
  --project <key>      Project key
  --json               Output JSON
  --url <url>          Server URL
  -h, --help           Show help
`;
      }
      switch (sub) {
        case "list":
          return `Usage: awb ticket list [--column C] [--feature ID] [--assignee NAME] [--query TEXT]

List tickets in a Project.

Options:
  --column <C>         Filter by column: backlog, todo, in-progress, in-review, done
  --feature <ID>       Filter by feature ID
  --assignee <NAME>    Filter by assignee actor name
  --query <TEXT>       Search key, title, or description
  --project <key>      Project key (resolved from directory if omitted)
  --json               Output JSON
  --url <url>          Server URL
  -h, --help           Show help
`;
        case "show":
          return `Usage: awb ticket show <KEY>

Show full ticket details, blockers, comments, and activity log.

Options:
  --json               Output JSON
  --url <url>          Server URL
  -h, --help           Show help
`;
        case "create":
          return `Usage: awb ticket create <TITLE> [-d TEXT | --description-file FILE] [--column C] [--priority P] [--feature ID] [--assignee NAME] [--blocked-by KEY ...]

Create a new ticket on a project board (default column: backlog).

Options:
  -d, --description <TEXT>        Markdown description
  --description-file <FILE>      Read markdown description from file
  --column <C>                   Target column (backlog, todo, in-progress, in-review, done)
  --priority <P>                 Priority (highest, high, medium, low, lowest)
  --feature <ID>                 Feature ID to attach ticket to
  --assignee <NAME>              Assignee actor name
  --blocked-by <KEY>             Blocker ticket key (repeatable)
  --project <key>                Project key (resolved from directory if omitted)
  --as <actor>                   Actor creating the ticket
  --json                         Output JSON
  --url <url>                    Server URL
  -h, --help                     Show help
`;
        case "update":
          return `Usage: awb ticket update <KEY> [--title TITLE] [-d TEXT | --description-file FILE] [--priority P] [--feature ID|none] [--assignee NAME|none]

Update ticket fields.

Options:
  --title <TITLE>                New ticket title
  -d, --description <TEXT>        New markdown description
  --description-file <FILE>      Read new description from file
  --priority <P>                 New priority (highest, high, medium, low, lowest)
  --feature <ID|none>            Feature ID to link, or 'none' to unlink
  --assignee <NAME|none>         Assignee name, or 'none' to unassign
  --as <actor>                   Actor updating the ticket
  --json                         Output JSON
  --url <url>                    Server URL
  -h, --help                     Show help
`;
        case "move":
          return `Usage: awb ticket move <KEY> <COLUMN> [--position N]

Move a ticket to a column (backlog, todo, in-progress, in-review, done) and optional position.

Options:
  --position <N>       0-based position in the target column
  --as <actor>         Actor moving the ticket
  --json               Output JSON
  --url <url>          Server URL
  -h, --help           Show help
`;
        case "block":
          return `Usage: awb ticket block <KEY> --by <BLOCKER>

Block a ticket by another ticket in the same project.

Options:
  --by <BLOCKER>       Blocker ticket key (required)
  --as <actor>         Actor adding the blocker
  --json               Output JSON
  --url <url>          Server URL
  -h, --help           Show help
`;
        case "unblock":
          return `Usage: awb ticket unblock <KEY> --by <BLOCKER>

Unblock a ticket from another ticket.

Options:
  --by <BLOCKER>       Blocker ticket key to remove (required)
  --as <actor>         Actor removing the blocker
  --json               Output JSON
  --url <url>          Server URL
  -h, --help           Show help
`;
        case "comment":
          return `Usage: awb ticket comment <KEY> [TEXT] [--file FILE]

Add a markdown comment to a ticket.

Options:
  --file <FILE>        Read comment body from file
  --as <actor>         Actor commenting
  --json               Output JSON
  --url <url>          Server URL
  -h, --help           Show help
`;
        case "attention":
          return `Usage: awb ticket attention <KEY> [REASON] [--clear]

Flag a ticket as needs-attention with a reason, or clear the flag with --clear.

Options:
  --clear              Clear the needs-attention flag
  --as <actor>         Actor flagging or clearing
  --json               Output JSON
  --url <url>          Server URL
  -h, --help           Show help
`;
        default:
          return USAGE;
      }

    case "feature":
      if (!sub) {
        return `Usage: awb feature <subcommand> [options]

Subcommands:
  list
      List all features in a Project with progress
  show <ID>
      Show feature details and associated tickets
  create <NAME> [-d TEXT] [--color HEX] [--tickets-file FILE.json]
      Create a new feature with optional ordered tickets
  update <ID> [--name NAME] [-d TEXT] [--color HEX]
      Update a feature

Global Options:
  --as <actor>         Actor name
  --project <key>      Project key
  --json               Output JSON
  --url <url>          Server URL
  -h, --help           Show help
`;
      }
      switch (sub) {
        case "list":
          return `Usage: awb feature list

List all features in a Project with completion progress metrics.

Options:
  --project <key>      Project key (resolved from directory if omitted)
  --json               Output JSON
  --url <url>          Server URL
  -h, --help           Show help
`;
        case "show":
          return `Usage: awb feature show <ID>

Show feature details, description, and associated tickets.

Options:
  --json               Output JSON
  --url <url>          Server URL
  -h, --help           Show help
`;
        case "create":
          return `Usage: awb feature create <NAME> [-d TEXT] [--color HEX] [--tickets-file FILE.json]

Create a new feature with optional ordered tickets in one transaction.

Options:
  -d, --description <TEXT>        Markdown description
  --color <HEX>                  Badge hex color code (#RRGGBB)
  --tickets-file <FILE.json>     JSON file with tickets array
  --project <key>                Project key (resolved from directory if omitted)
  --as <actor>                   Actor creating the feature
  --json                         Output JSON
  --url <url>                    Server URL
  -h, --help                     Show help
`;
        case "update":
          return `Usage: awb feature update <ID> [--name NAME] [-d TEXT] [--color HEX]

Update a feature's name, description, or badge color.

Options:
  --name <NAME>                  New feature name
  -d, --description <TEXT>        New markdown description
  --color <HEX>                  New hex color code (#RRGGBB)
  --as <actor>                   Actor updating the feature
  --json                         Output JSON
  --url <url>                    Server URL
  -h, --help                     Show help
`;
        default:
          return USAGE;
      }

    default:
      return USAGE;
  }
}

export async function main(argv: string[], io: CliIo): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        // Global options
        as: { type: "string" },
        project: { type: "string" },
        json: { type: "boolean" },
        url: { type: "string" },
        help: { type: "boolean", short: "h" },

        // start options
        host: { type: "string" },
        port: { type: "string" },
        "data-dir": { type: "string" },
        open: { type: "boolean" },

        // init options
        key: { type: "string" },
        name: { type: "string" },
        path: { type: "string" },

        // ticket and feature options
        title: { type: "string" },
        column: { type: "string" },
        position: { type: "string" },
        assignee: { type: "string" },
        query: { type: "string" },
        description: { type: "string", short: "d" },
        "description-file": { type: "string" },
        priority: { type: "string" },
        file: { type: "string" },
        "blocked-by": { type: "string", multiple: true },
        by: { type: "string" },
        clear: { type: "boolean" },
        color: { type: "string" },
        "tickets-file": { type: "string" },
        feature: { type: "string" },
      },
      allowPositionals: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    io.stderr(`Error: ${message}\n${USAGE}`);
    return 2;
  }

  if (parsed.positionals[0] === "help") {
    const helpCmd = parsed.positionals[1];
    const helpSub = parsed.positionals[2];
    io.stdout(getHelpText(helpCmd, helpSub));
    return 0;
  }

  if (parsed.values.help) {
    const helpCmd = parsed.positionals[0];
    const helpSub = parsed.positionals[1];
    io.stdout(getHelpText(helpCmd, helpSub));
    return 0;
  }

  const actor = (parsed.values.as as string | undefined) ?? io.env.AWB_ACTOR;
  if (actor === "you") {
    io.stderr("The actor name 'you' is reserved for the board UI.\n");
    return 2;
  }

  const command = parsed.positionals[0];
  if (!command) {
    io.stderr(`No command specified.\n${USAGE}`);
    return 2;
  }

  const globalOpts: GlobalOptions = {
    as: parsed.values.as as string | undefined,
    project: parsed.values.project as string | undefined,
    json: parsed.values.json as boolean | undefined,
    url: parsed.values.url as string | undefined,
  };

  try {
    switch (command) {
      case "start":
        return await startCommand(io, {
          host: parsed.values.host as string | undefined,
          port: parsed.values.port as string | undefined,
          "data-dir": parsed.values["data-dir"] as string | undefined,
          open: parsed.values.open as boolean | undefined,
        });
      case "init":
        return await initCommand(io, globalOpts, {
          key: parsed.values.key as string | undefined,
          name: parsed.values.name as string | undefined,
          path: parsed.values.path as string | undefined,
        });
      case "projects":
        return await projectsCommand(io, globalOpts);
      case "board":
        return await boardCommand(io, globalOpts);
      case "claim":
        return await claimCommand(io, globalOpts, {
          feature: parsed.values.feature as string | undefined,
        });
      case "feature": {
        const sub = parsed.positionals[1];
        if (sub === "list") {
          return await featureListCommand(io, globalOpts);
        }
        if (sub === "show") {
          const id = parsed.positionals[2];
          return await featureShowCommand(io, globalOpts, id);
        }
        if (sub === "create") {
          const name = parsed.positionals.slice(2).join(" ");
          return await featureCreateCommand(io, globalOpts, name, {
            description: parsed.values.description as string | undefined,
            color: parsed.values.color as string | undefined,
            "tickets-file": parsed.values["tickets-file"] as string | undefined,
          });
        }
        if (sub === "update") {
          const id = parsed.positionals[2];
          return await featureUpdateCommand(io, globalOpts, id, {
            name: parsed.values.name as string | undefined,
            description: parsed.values.description as string | undefined,
            color: parsed.values.color as string | undefined,
          });
        }
        io.stderr(`Unknown feature subcommand: ${sub || ""}\n${USAGE}`);
        return 2;
      }
      case "ticket": {
        const sub = parsed.positionals[1];
        if (sub === "claim") {
          return await claimCommand(io, globalOpts, {
            feature: parsed.values.feature as string | undefined,
          });
        }
        if (sub === "list") {
          return await ticketListCommand(io, globalOpts, {
            column: parsed.values.column as string | undefined,
            assignee: parsed.values.assignee as string | undefined,
            query: parsed.values.query as string | undefined,
            feature: parsed.values.feature as string | undefined,
          });
        }
        if (sub === "show") {
          const key = parsed.positionals[2];
          return await ticketShowCommand(io, globalOpts, key);
        }
        if (sub === "create") {
          const title = parsed.positionals.slice(2).join(" ");
          return await ticketCreateCommand(io, globalOpts, {
            title,
            description: parsed.values.description as string | undefined,
            "description-file": parsed.values["description-file"] as string | undefined,
            column: parsed.values.column as string | undefined,
            priority: parsed.values.priority as string | undefined,
            assignee: parsed.values.assignee as string | undefined,
            "blocked-by": parsed.values["blocked-by"] as string[] | undefined,
            feature: parsed.values.feature as string | undefined,
          });
        }
        if (sub === "update") {
          const key = parsed.positionals[2];
          return await ticketUpdateCommand(io, globalOpts, key, {
            title: parsed.values.title as string | undefined,
            description: parsed.values.description as string | undefined,
            "description-file": parsed.values["description-file"] as string | undefined,
            priority: parsed.values.priority as string | undefined,
            assignee: parsed.values.assignee as string | undefined,
            feature: parsed.values.feature as string | undefined,
          });
        }
        if (sub === "move") {
          const key = parsed.positionals[2];
          const column = parsed.positionals[3];
          return await ticketMoveCommand(io, globalOpts, key, column, {
            position: parsed.values.position as string | undefined,
          });
        }
        if (sub === "block") {
          const key = parsed.positionals[2];
          return await ticketBlockCommand(io, globalOpts, key, {
            by: parsed.values.by as string | undefined,
          });
        }
        if (sub === "unblock") {
          const key = parsed.positionals[2];
          return await ticketUnblockCommand(io, globalOpts, key, {
            by: parsed.values.by as string | undefined,
          });
        }
        if (sub === "comment") {
          const key = parsed.positionals[2];
          const text =
            parsed.positionals.length >= 4
              ? parsed.positionals.slice(3).join(" ")
              : undefined;
          return await ticketCommentCommand(io, globalOpts, key, text, {
            file: parsed.values.file as string | undefined,
          });
        }
        if (sub === "attention") {
          const key = parsed.positionals[2];
          const reason =
            parsed.positionals.length >= 4
              ? parsed.positionals.slice(3).join(" ")
              : undefined;
          return await ticketAttentionCommand(io, globalOpts, key, reason, {
            clear: parsed.values.clear as boolean | undefined,
          });
        }
        io.stderr(`Unknown ticket subcommand: ${sub || ""}\n${USAGE}`);
        return 2;
      }
      default:
        io.stderr(`Unknown command: ${command}\n${USAGE}`);
        return 2;
    }
  } catch (err: unknown) {
    if (err instanceof CliDomainError) {
      io.stderr(`error: ${err.message}\n`);
      return 1;
    }
    if (err instanceof ServerUnreachable) {
      io.stderr(`AI Work Board server is not running at ${err.url}. Run \`awb start\`.\n`);
      return 3;
    }
    const message = err instanceof Error ? err.message : String(err);
    io.stderr(`error: ${message}\n`);
    return 1;
  }
}
