import { test, expect } from "@playwright/test";
import {
  createProject,
  createTicket,
  createFeature,
  flagNeedsAttention,
  getTicket,
  dragCard,
  cleanupRepoDirs,
} from "./helpers.ts";

test.describe("Board E2E Smoke Suite", () => {
  test.afterAll(() => {
    cleanupRepoDirs();
  });
  test("1. Columns and counts", async ({ page, request }) => {
    const project = await createProject(request);
    const t1 = await createTicket(request, project.key, {
      title: "Backlog 1",
      column: "backlog",
    });
    const t2 = await createTicket(request, project.key, {
      title: "Backlog 2",
      column: "backlog",
    });
    const t3 = await createTicket(request, project.key, {
      title: "Todo 1",
      column: "todo",
    });

    await page.goto(`/projects/${project.key}`);

    const columns = [
      { id: "backlog", name: "BACKLOG", count: "2" },
      { id: "todo", name: "TO DO", count: "1" },
      { id: "in_progress", name: "IN PROGRESS", count: "0" },
      { id: "in_review", name: "IN REVIEW", count: "0" },
      { id: "done", name: "DONE", count: "0" },
    ];

    for (const col of columns) {
      const colLocator = page.locator(`[data-testid="column-${col.id}"]`);
      await expect(colLocator.locator(".column-name")).toHaveText(col.name);
      await expect(colLocator.locator(".column-count")).toHaveText(col.count);
    }

    await expect(page.locator(`[data-ticket-key="${t1.key}"]`)).toBeVisible();
    await expect(
      page.locator(`[data-ticket-key="${t1.key}"] .ticket-card-key`)
    ).toHaveText(t1.key);

    await expect(page.locator(`[data-ticket-key="${t2.key}"]`)).toBeVisible();
    await expect(
      page.locator(`[data-ticket-key="${t2.key}"] .ticket-card-key`)
    ).toHaveText(t2.key);

    await expect(page.locator(`[data-ticket-key="${t3.key}"]`)).toBeVisible();
    await expect(
      page.locator(`[data-ticket-key="${t3.key}"] .ticket-card-key`)
    ).toHaveText(t3.key);
  });

  test("2. Drag across Columns", async ({ page, request }) => {
    const project = await createProject(request);
    const t1 = await createTicket(request, project.key, {
      title: "Move Me",
      column: "backlog",
    });

    await page.goto(`/projects/${project.key}`);

    const card = page.locator(`[data-ticket-key="${t1.key}"]`);
    await expect(card).toBeVisible();

    const inProgressCol = page.locator('[data-testid="column-in_progress"]');
    await dragCard(page, card, inProgressCol);

    // Card should now be in in_progress column
    await expect(
      inProgressCol.locator(`[data-ticket-key="${t1.key}"]`)
    ).toBeVisible();

    // After reload it is still in In Progress
    await page.reload();
    await expect(
      page.locator(
        `[data-testid="column-in_progress"] [data-ticket-key="${t1.key}"]`
      )
    ).toBeVisible();

    // GET /api/tickets/:key Activity has moved by you
    const ticket = await getTicket(request, t1.key);
    expect(ticket.column).toBe("in_progress");
    const moveActivity = ticket.activity.find((a) => a.kind === "moved");
    expect(moveActivity).toBeDefined();
    expect(moveActivity?.actor).toBe("you");
  });

  test("3. Reorder within a Column", async ({ page, request }) => {
    const project = await createProject(request);
    const t1 = await createTicket(request, project.key, {
      title: "Card 1",
      column: "todo",
    });
    const t2 = await createTicket(request, project.key, {
      title: "Card 2",
      column: "todo",
    });
    const t3 = await createTicket(request, project.key, {
      title: "Card 3",
      column: "todo",
    });

    await page.goto(`/projects/${project.key}`);

    const todoCol = page.locator('[data-testid="column-todo"]');
    const card1 = todoCol.locator(`[data-ticket-key="${t1.key}"]`);
    const card3 = todoCol.locator(`[data-ticket-key="${t3.key}"]`);

    await expect(card1).toBeVisible();
    await expect(card3).toBeVisible();

    // Drag the third above the first
    await dragCard(page, card3, card1);

    // Verify order in column is now t3, t1, t2
    const cardsAfterMove = todoCol.locator("[data-ticket-key]");
    await expect(cardsAfterMove.nth(0)).toHaveAttribute(
      "data-ticket-key",
      t3.key
    );
    await expect(cardsAfterMove.nth(1)).toHaveAttribute(
      "data-ticket-key",
      t1.key
    );
    await expect(cardsAfterMove.nth(2)).toHaveAttribute(
      "data-ticket-key",
      t2.key
    );

    // Order persists after reload
    await page.reload();
    const cardsAfterReload = page.locator(
      '[data-testid="column-todo"] [data-ticket-key]'
    );
    await expect(cardsAfterReload.nth(0)).toHaveAttribute(
      "data-ticket-key",
      t3.key
    );
    await expect(cardsAfterReload.nth(1)).toHaveAttribute(
      "data-ticket-key",
      t1.key
    );
    await expect(cardsAfterReload.nth(2)).toHaveAttribute(
      "data-ticket-key",
      t2.key
    );
  });

  test("4. Modal edit and comment", async ({ page, request }) => {
    const project = await createProject(request);
    const t1 = await createTicket(request, project.key, {
      title: "Original Title",
      priority: "low",
      column: "todo",
    });

    await page.goto(`/projects/${project.key}`);

    const card = page.locator(`[data-ticket-key="${t1.key}"]`);
    await expect(card).toBeVisible();

    // Click card -> URL has selectedIssue=<KEY>
    await card.click();
    await expect(page).toHaveURL(new RegExp(`selectedIssue=${t1.key}`));

    // Edit the title
    await page.locator(".ticket-modal-title-display").click();
    const titleInput = page.locator(".ticket-modal-title-input");
    await titleInput.fill("Edited Title");
    await titleInput.press("Enter");
    await expect(page.locator(".ticket-modal-title-text")).toHaveText(
      "Edited Title"
    );

    // Set Priority to High
    await page.getByLabel("Priority").selectOption("high");
    await expect(page.getByLabel("Priority")).toHaveValue("high");

    // Add a comment with **bold**
    const commentComposer = page.getByPlaceholder("Add a comment…");
    await commentComposer.fill("This has **bold** text");
    await page.getByRole("button", { name: "Save" }).click();

    // Verify comment renders bold
    await expect(page.locator(".comment-item-body strong")).toHaveText("bold");

    // Close and reopen via URL
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(page).not.toHaveURL(/selectedIssue=/);

    await page.goto(`/projects/${project.key}?selectedIssue=${t1.key}`);

    // Changes persist
    await expect(page.locator(".ticket-modal-title-text")).toHaveText(
      "Edited Title"
    );
    await expect(page.getByLabel("Priority")).toHaveValue("high");
    await expect(page.locator(".comment-item-body strong")).toHaveText("bold");

    // Activity tab lists the changes
    await page.getByRole("tab", { name: "Activity" }).click();
    const activityList = page.locator(".activity-list");
    await expect(activityList).toBeVisible();
    await expect(activityList).toContainText("Edited Title");
    await expect(activityList).toContainText("high");
    await expect(activityList).toContainText("added a comment");
  });

  test("5. Filters", async ({ page, request }) => {
    const project = await createProject(request);
    const f1 = await createFeature(request, project.key, {
      name: "Feature Alpha",
      color: "#0052CC",
    });
    const f2 = await createFeature(request, project.key, {
      name: "Feature Beta",
      color: "#00875A",
    });

    const t1 = await createTicket(request, project.key, {
      title: "Ticket One",
      description: "Contains sunflower query word",
      featureId: f1.id,
      assignee: "alice",
      column: "todo",
    });
    const t2 = await createTicket(request, project.key, {
      title: "Ticket Two",
      description: "Contains moonbeam query word",
      featureId: f2.id,
      assignee: "bob",
      column: "todo",
    });
    const t3 = await createTicket(request, project.key, {
      title: "Ticket Three",
      description: "Nothing special here",
      featureId: f1.id,
      assignee: "bob",
      column: "todo",
    });

    await page.goto(`/projects/${project.key}`);

    // All 3 visible initially
    await expect(page.locator(`[data-ticket-key="${t1.key}"]`)).toBeVisible();
    await expect(page.locator(`[data-ticket-key="${t2.key}"]`)).toBeVisible();
    await expect(page.locator(`[data-ticket-key="${t3.key}"]`)).toBeVisible();

    // Toggling a Feature chip shows only its cards
    const featureChip = page
      .getByRole("group", { name: "Features" })
      .getByRole("button", { name: "Feature Alpha" });
    await featureChip.click();

    // URL contains filter params
    await expect(page).toHaveURL(new RegExp(`feature=${f1.id}`));

    // Only Feature Alpha cards shown (t1 and t3 visible, t2 hidden)
    await expect(page.locator(`[data-ticket-key="${t1.key}"]`)).toBeVisible();
    await expect(page.locator(`[data-ticket-key="${t3.key}"]`)).toBeVisible();
    await expect(
      page.locator(`[data-ticket-key="${t2.key}"]`)
    ).not.toBeVisible();

    // Search by a word from one Ticket's description narrows to it
    const searchInput = page.getByPlaceholder("Search board");
    await searchInput.fill("sunflower");

    // URL contains search param and feature param
    await expect(page).toHaveURL(/q=sunflower/);
    await expect(page).toHaveURL(new RegExp(`feature=${f1.id}`));

    // Only t1 is visible
    await expect(page.locator(`[data-ticket-key="${t1.key}"]`)).toBeVisible();
    await expect(
      page.locator(`[data-ticket-key="${t2.key}"]`)
    ).not.toBeVisible();
    await expect(
      page.locator(`[data-ticket-key="${t3.key}"]`)
    ).not.toBeVisible();

    // "Clear filters" restores all
    await searchInput.blur();
    const clearBtn = page.getByRole("button", { name: "Clear filters" });
    await clearBtn.click();

    // URL no longer contains filter params
    await expect(page).not.toHaveURL(/[?&](q|feature|assignee)=/);

    // All 3 cards restored
    await expect(page.locator(`[data-ticket-key="${t1.key}"]`)).toBeVisible();
    await expect(page.locator(`[data-ticket-key="${t2.key}"]`)).toBeVisible();
    await expect(page.locator(`[data-ticket-key="${t3.key}"]`)).toBeVisible();

    // Assignee filter: clicking bob shows only tickets assigned to bob
    const bobBtn = page
      .getByRole("group", { name: "Assignees" })
      .getByRole("button", { name: "bob" });
    await bobBtn.click();

    // URL contains assignee param
    await expect(page).toHaveURL(/assignee=bob/);

    // Cards for bob (t2 and t3) are visible, t1 (alice) is hidden
    await expect(page.locator(`[data-ticket-key="${t2.key}"]`)).toBeVisible();
    await expect(page.locator(`[data-ticket-key="${t3.key}"]`)).toBeVisible();
    await expect(
      page.locator(`[data-ticket-key="${t1.key}"]`)
    ).not.toBeVisible();

    // Clear filters again restores all cards
    await clearBtn.click();
    await expect(page).not.toHaveURL(/[?&](q|feature|assignee)=/);
    await expect(page.locator(`[data-ticket-key="${t1.key}"]`)).toBeVisible();
    await expect(page.locator(`[data-ticket-key="${t2.key}"]`)).toBeVisible();
    await expect(page.locator(`[data-ticket-key="${t3.key}"]`)).toBeVisible();
  });

  test("6. Live update", async ({ page, request }) => {
    const project = await createProject(request);

    await page.goto(`/projects/${project.key}`);
    // Ensure board is loaded
    await expect(page.locator('[data-testid="column-backlog"]')).toBeVisible();

    // Create a Ticket through REST with actor agent-x
    const newTicket = await createTicket(
      request,
      project.key,
      { title: "Live Created Ticket", column: "backlog" },
      "agent-x"
    );

    // Card appears without reload within 3 s
    const card = page.locator(`[data-ticket-key="${newTicket.key}"]`);
    await expect(card).toBeVisible({ timeout: 3000 });
    await expect(card.locator(".ticket-card-title")).toHaveText(
      "Live Created Ticket"
    );

    // Flag it Needs Attention through REST
    await flagNeedsAttention(
      request,
      newTicket.key,
      "Please inspect this issue",
      "agent-x"
    );

    // "Needs attention" lozenge appears
    const lozenge = card.locator(".lozenge-attention");
    await expect(lozenge).toBeVisible({ timeout: 3000 });
    await expect(lozenge).toHaveText("Needs attention");
  });
});
