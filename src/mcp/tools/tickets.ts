import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Ctx } from "../../domain/context.ts";
import type { ColumnId, Priority } from "../../shared/types.ts";
import { resolveProject } from "../../domain/projects.ts";
import {
  createTicket,
  getBoard,
  getTicket,
  listTickets,
  moveTicket,
  updateTicket,
} from "../../domain/tickets.ts";
import { addComment } from "../../domain/comments.ts";
import { addBlocker, removeBlocker } from "../../domain/blockers.ts";
import { setNeedsAttention, clearNeedsAttention } from "../../domain/attention.ts";
import { claimNextTicket } from "../../domain/claim.ts";
import { actorFor, withToolResult } from "../result.ts";

export function registerTicketTools(
  server: McpServer,
  ctx: Ctx,
  urlActor: string | undefined
): void {
  server.tool(
    "get_board",
    "Retrieve the complete kanban board for a project, including all five workflow columns, ticket cards, features, and actors.",
    {
      project: z.string().optional().describe("Optional project key. If omitted, the project is resolved from cwd or the nearest registered parent directory"),
      cwd: z.string().optional().describe("Optional absolute, symlink-resolved path of the repository on the agent's machine used to resolve the project when project key is omitted (deepest match wins)"),
    },
    async (args) => {
      return withToolResult(async () => {
        const project = await resolveProject(ctx, { key: args.project, cwd: args.cwd });
        return await getBoard(ctx, project.key);
      });
    }
  );

  server.tool(
    "list_tickets",
    "Query and filter ticket cards on a project board by column (backlog, todo, in_progress, in_review, done), assignee, search text, or feature.",
    {
      project: z.string().optional().describe("Optional project key. If omitted, the project is resolved from cwd or the nearest registered parent directory"),
      cwd: z.string().optional().describe("Optional absolute, symlink-resolved path of the repository on the agent's machine used to resolve the project when project key is omitted (deepest match wins)"),
      column: z.string().optional().describe("Optional column filter: 'backlog', 'todo', 'in_progress', 'in_review', or 'done'"),
      assignee: z.string().optional().describe("Optional assignee actor name to filter tickets by ownership"),
      query: z.string().optional().describe("Optional search query matching against ticket key, title, or description"),
      featureId: z.number().int().optional().describe("Optional feature ID to filter tickets belonging to a specific feature"),
    },
    async (args) => {
      return withToolResult(async () => {
        const project = await resolveProject(ctx, { key: args.project, cwd: args.cwd });
        return await listTickets(ctx, project.key, {
          column: args.column as ColumnId | undefined,
          assignee: args.assignee,
          q: args.query,
          feature: args.featureId,
        });
      });
    }
  );

  server.tool(
    "get_ticket",
    "Fetch full details of a ticket by key, including markdown description, blockers, reverse blocks, comments, and activity audit log.",
    {
      ticketKey: z.string().describe("Ticket key identifier (e.g. AWB-1)"),
    },
    async (args) => {
      return withToolResult(async () => {
        return await getTicket(ctx, args.ticketKey);
      });
    }
  );

  server.tool(
    "create_ticket",
    "Create a new ticket on a project board. Tickets land in Backlog by default for the user to review and move to To Do.",
    {
      project: z.string().optional().describe("Optional project key. If omitted, the project is resolved from cwd or the nearest registered parent directory"),
      cwd: z.string().optional().describe("Optional absolute, symlink-resolved path of the repository on the agent's machine used to resolve the project when project key is omitted (deepest match wins)"),
      title: z.string().describe("Ticket title summary (1-200 characters)"),
      description: z.string().optional().describe("Optional markdown description detailing requirements, implementation steps, or acceptance criteria"),
      column: z.string().optional().describe("Optional target column (default: 'backlog'). The user moves approved tickets to 'todo'"),
      priority: z.string().optional().describe("Optional priority level ('highest', 'high', 'medium', 'low', 'lowest'; default: 'medium')"),
      assignee: z.string().optional().describe("Optional assignee actor name (leave unassigned so working agents can claim it)"),
      blockedBy: z.array(z.string()).optional().describe("Optional array of existing ticket keys in the same project that block this ticket"),
      featureId: z.number().int().nullable().optional().describe("Optional feature ID to attach this ticket to"),
      actor: z.string().optional().describe("Optional actor name creating the ticket (e.g. agent name; 'you' is reserved for UI)"),
    },
    async (args) => {
      return withToolResult(async () => {
        const actor = actorFor(args.actor, urlActor);
        const project = await resolveProject(ctx, { key: args.project, cwd: args.cwd });
        return await createTicket(ctx, actor, project.key, {
          title: args.title,
          description: args.description,
          column: args.column as ColumnId | undefined,
          priority: args.priority as Priority | undefined,
          assignee: args.assignee,
          blockedBy: args.blockedBy,
          featureId: args.featureId,
        });
      });
    }
  );

  server.tool(
    "update_ticket",
    "Update fields on an existing ticket such as title, description, priority, assignee, or associated feature.",
    {
      ticketKey: z.string().describe("Ticket key identifier (e.g. AWB-1)"),
      title: z.string().optional().describe("Optional updated title (1-200 characters)"),
      description: z.string().optional().describe("Optional updated markdown description"),
      priority: z.string().optional().describe("Optional updated priority level ('highest', 'high', 'medium', 'low', 'lowest')"),
      assignee: z.string().nullable().optional().describe("Optional updated assignee actor name, or null to unassign"),
      featureId: z.number().int().nullable().optional().describe("Optional updated feature ID, or null to unlink from a feature"),
      actor: z.string().optional().describe("Optional actor name performing the update (e.g. agent name; 'you' is reserved for UI)"),
    },
    async (args) => {
      return withToolResult(async () => {
        const actor = actorFor(args.actor, urlActor);
        const patch: Record<string, unknown> = {};
        if (args.title !== undefined) patch.title = args.title;
        if (args.description !== undefined) patch.description = args.description;
        if (args.priority !== undefined) patch.priority = args.priority as Priority;
        if (args.assignee !== undefined) patch.assignee = args.assignee;
        if (args.featureId !== undefined) patch.featureId = args.featureId;
        return await updateTicket(ctx, actor, args.ticketKey, patch);
      });
    }
  );

  server.tool(
    "move_ticket",
    "Workflow step: move a ticket to a column and optional rank position. When done with work, move the ticket to In Review (never to Done; the user moves it to Done).",
    {
      ticketKey: z.string().describe("Ticket key identifier (e.g. AWB-1)"),
      column: z.string().describe("Target column: 'backlog', 'todo', 'in_progress', 'in_review', or 'done'. Move to 'in_review' when work is completed"),
      position: z.number().optional().describe("Optional 0-based rank position within the target column (omitted places at bottom)"),
      actor: z.string().optional().describe("Optional actor name moving the ticket (e.g. agent name; 'you' is reserved for UI)"),
    },
    async (args) => {
      return withToolResult(async () => {
        const actor = actorFor(args.actor, urlActor);
        return await moveTicket(ctx, actor, args.ticketKey, {
          column: args.column as ColumnId,
          position: args.position,
        });
      });
    }
  );

  server.tool(
    "add_comment",
    "Progress reporting: add a markdown comment to a ticket to record progress, implementation findings, decisions, or handoff notes.",
    {
      ticketKey: z.string().describe("Ticket key identifier (e.g. AWB-1)"),
      body: z.string().describe("Markdown comment content (1-20000 characters) documenting progress or notes"),
      actor: z.string().optional().describe("Optional actor name adding the comment (e.g. agent name; 'you' is reserved for UI)"),
    },
    async (args) => {
      return withToolResult(async () => {
        const actor = actorFor(args.actor, urlActor);
        return await addComment(ctx, actor, args.ticketKey, args.body);
      });
    }
  );

  server.tool(
    "add_blocker",
    "Dependency tracking: declare that a ticket is blocked by another ticket in the same project. Blocked tickets cannot be claimed until blockers reach Done.",
    {
      ticketKey: z.string().describe("Key of the blocked ticket (e.g. AWB-1)"),
      blockerKey: z.string().describe("Key of the prerequisite ticket that blocks it (e.g. AWB-2). Must belong to the same project"),
      actor: z.string().optional().describe("Optional actor name adding the blocker (e.g. agent name; 'you' is reserved for UI)"),
    },
    async (args) => {
      return withToolResult(async () => {
        const actor = actorFor(args.actor, urlActor);
        return await addBlocker(ctx, actor, args.ticketKey, args.blockerKey);
      });
    }
  );

  server.tool(
    "remove_blocker",
    "Dependency tracking: remove a blocker relationship from a ticket when a dependency is resolved or no longer required.",
    {
      ticketKey: z.string().describe("Key of the blocked ticket (e.g. AWB-1)"),
      blockerKey: z.string().describe("Key of the blocker ticket to remove (e.g. AWB-2)"),
      actor: z.string().optional().describe("Optional actor name removing the blocker (e.g. agent name; 'you' is reserved for UI)"),
    },
    async (args) => {
      return withToolResult(async () => {
        const actor = actorFor(args.actor, urlActor);
        return await removeBlocker(ctx, actor, args.ticketKey, args.blockerKey);
      });
    }
  );

  server.tool(
    "set_needs_attention",
    "Use when you are stuck and need the user. Flags the ticket with an explanation while keeping it in its current column.",
    {
      ticketKey: z.string().describe("Ticket key identifier (e.g. AWB-1)"),
      reason: z.string().describe("Explanation of why you are stuck and what assistance, clarification, or decision is needed (1-500 characters)"),
      actor: z.string().optional().describe("Optional actor name flagging the ticket (e.g. agent name; 'you' is reserved for UI)"),
    },
    async (args) => {
      return withToolResult(async () => {
        const actor = actorFor(args.actor, urlActor);
        return await setNeedsAttention(ctx, actor, args.ticketKey, args.reason);
      });
    }
  );

  server.tool(
    "clear_needs_attention",
    "Clear the needs-attention flag on a ticket once the user has answered questions or resolved the blocking issue.",
    {
      ticketKey: z.string().describe("Ticket key identifier (e.g. AWB-1)"),
      actor: z.string().optional().describe("Optional actor name clearing the flag (e.g. agent name; 'you' is reserved for UI)"),
    },
    async (args) => {
      return withToolResult(async () => {
        const actor = actorFor(args.actor, urlActor);
        return await clearNeedsAttention(ctx, actor, args.ticketKey);
      });
    }
  );

  server.tool(
    "claim_next_ticket",
    "Start work: atomically takes the top-ranked unblocked, unassigned To Do Ticket, assigns it to you and moves it to In Progress. Returns {ticket: null} when nothing is available.",
    {
      project: z.string().optional().describe("Optional project key. If omitted, the project is resolved from cwd or the nearest registered parent directory"),
      cwd: z.string().optional().describe("Optional absolute, symlink-resolved path of the repository on the agent's machine used to resolve the project when project key is omitted (deepest match wins)"),
      featureId: z.number().int().optional().describe("Optional feature ID to restrict claims to tickets under a specific feature"),
      actor: z.string().optional().describe("Optional actor name claiming the ticket (e.g. agent name; 'you' is reserved for UI)"),
    },
    async (args) => {
      return withToolResult(async () => {
        const actor = actorFor(args.actor, urlActor);
        const project = await resolveProject(ctx, { key: args.project, cwd: args.cwd });
        const ticket = await claimNextTicket(ctx, actor, project.key, {
          featureId: args.featureId,
        });
        return { ticket };
      });
    }
  );
}
