import type { Ctx } from "../../../server/src/domain/context.ts";
import { createProject, listProjects } from "../../../server/src/domain/projects.ts";
import { createFeature } from "../../../server/src/domain/features.ts";
import { createTicket, moveTicket } from "../../../server/src/domain/tickets.ts";
import { addComment } from "../../../server/src/domain/comments.ts";
import { setNeedsAttention } from "../../../server/src/domain/attention.ts";

const CLAUDE = "claude-code";
const CODEX = "codex";

// Fills an empty board with one sample project so first-time visitors have something to explore.
export async function seedDemo(ctx: Ctx): Promise<void> {
  if ((await listProjects(ctx)).length > 0) {
    return;
  }

  const { key } = await createProject(
    ctx,
    { path: "/home/demo/acme-storefront", name: "Acme Storefront", key: "SHOP" },
    "you"
  );

  const { tickets: checkout } = await createFeature(ctx, "you", key, {
    name: "Guest checkout",
    description: "Let shoppers buy without creating an account.",
    tickets: [
      {
        title: "Add guest checkout API endpoint",
        description: "POST `/api/checkout/guest` that takes an email plus the cart and returns an order id.",
        priority: "high",
        column: "done",
        assignee: CLAUDE,
      },
      {
        title: "Guest checkout form",
        description: "## Acceptance\n\n- [x] Email field with validation\n- [ ] Shipping address\n- [ ] Order summary",
        priority: "high",
        column: "in_progress",
        assignee: CLAUDE,
        blockedByIndexes: [0],
      },
      {
        title: "Send order confirmation email to guests",
        priority: "medium",
        column: "todo",
        blockedByIndexes: [1],
      },
    ],
  });

  await addComment(ctx, CLAUDE, checkout[0].key, "Endpoint is in, with tests for invalid carts and duplicate emails.");
  await addComment(ctx, CLAUDE, checkout[1].key, "Email validation is done. Working on the address step next.");

  const review = await createTicket(ctx, CODEX, key, {
    title: "Cache product listing responses",
    description: "Put a 60s cache on `GET /api/products` and invalidate it when a product is edited.",
    priority: "medium",
    column: "in_review",
    assignee: CODEX,
  });
  await addComment(ctx, CODEX, review.key, "Ready for review. p95 on the listing page dropped from 420ms to 90ms.");
  await addComment(ctx, "you", review.key, "Looks good. Can you add a test for the invalidation path?");

  const flaky = await createTicket(ctx, CODEX, key, {
    title: "Fix flaky cart total test",
    description: "`cart.test.ts > applies discount` fails about 1 in 20 runs.",
    priority: "high",
    column: "in_progress",
    assignee: CODEX,
  });
  await setNeedsAttention(
    ctx,
    CODEX,
    flaky.key,
    "The failure depends on the test database timezone. Should totals use UTC or the store's timezone?"
  );

  await createTicket(ctx, "you", key, {
    title: "Upgrade payment SDK to v5",
    priority: "highest",
    column: "todo",
  });
  await createTicket(ctx, "you", key, {
    title: "Write README section on local setup",
    priority: "low",
    column: "todo",
  });
  await createTicket(ctx, "you", key, {
    title: "Dark mode for the storefront",
    description: "Follow the system setting by default, with a manual toggle in the footer.",
    priority: "lowest",
    column: "backlog",
  });
  await createTicket(ctx, "you", key, {
    title: "Product reviews with star ratings",
    priority: "medium",
    column: "backlog",
  });

  const done = await createTicket(ctx, CLAUDE, key, {
    title: "Set up CI to run tests on every PR",
    priority: "medium",
    column: "in_review",
    assignee: CLAUDE,
  });
  await moveTicket(ctx, "you", done.key, { column: "done" });
}
