import { test, expect } from "@playwright/test";
import {
  createProject,
  createTicket,
  dragCard,
  cleanupRepoDirs,
} from "./helpers.ts";

test.describe("Keyboard moves and announcements", () => {
  test.afterAll(() => {
    cleanupRepoDirs();
  });

  test("Alt+ArrowUp and Alt+ArrowDown reorder cards and update announcer", async ({
    page,
    request,
  }) => {
    const project = await createProject(request);
    const t1 = await createTicket(request, project.key, {
      title: "Card One",
      column: "todo",
    });
    const t2 = await createTicket(request, project.key, {
      title: "Card Two",
      column: "todo",
    });
    const t3 = await createTicket(request, project.key, {
      title: "Card Three",
      column: "todo",
    });

    await page.goto(`/projects/${project.key}`);

    const todoCol = page.locator('[data-testid="column-todo"]');
    const card1 = todoCol.locator(`[data-ticket-key="${t1.key}"]`);
    const card2 = todoCol.locator(`[data-ticket-key="${t2.key}"]`);
    const card3 = todoCol.locator(`[data-ticket-key="${t3.key}"]`);

    await expect(card1).toBeVisible();
    await expect(card2).toBeVisible();
    await expect(card3).toBeVisible();

    const announcer = page.getByTestId("board-announcer");
    await expect(announcer).toBeAttached();

    // 1. Focus the second card in a Column, press Alt+ArrowUp.
    await card2.focus();
    await page.keyboard.press("Alt+ArrowUp");

    // The announcer text contains "moved to" and "position 1"
    await expect(announcer).toContainText("moved to");
    await expect(announcer).toContainText("position 1");

    // It becomes first (checked via GET /api/projects/:key/board)
    await expect.poll(async () => {
      const res = await request.get(`/api/projects/${project.key}/board`);
      if (!res.ok()) return [];
      const data = await res.json();
      const col = data.columns.find((c: { id: string }) => c.id === "todo");
      return col?.tickets.map((t: { key: string }) => t.key);
    }).toEqual([t2.key, t1.key, t3.key]);

    // Keep focus on the moved card
    await expect(card2).toBeFocused();

    // 2. Alt+ArrowDown moves it back.
    await page.keyboard.press("Alt+ArrowDown");

    // Announcer text updates
    await expect(announcer).toContainText("moved to");
    await expect(announcer).toContainText("position 2");

    // Order restored
    await expect.poll(async () => {
      const res = await request.get(`/api/projects/${project.key}/board`);
      if (!res.ok()) return [];
      const data = await res.json();
      const col = data.columns.find((c: { id: string }) => c.id === "todo");
      return col?.tickets.map((t: { key: string }) => t.key);
    }).toEqual([t1.key, t2.key, t3.key]);

    // Keep focus on the moved card
    await expect(card2).toBeFocused();
  });

  test("Move to In Progress from the card menu moves card and records Activity by you", async ({
    page,
    request,
  }) => {
    const project = await createProject(request);
    const t1 = await createTicket(request, project.key, {
      title: "Menu Target Card",
      column: "todo",
    });

    await page.goto(`/projects/${project.key}`);

    const card = page.locator(`[data-ticket-key="${t1.key}"]`);
    await expect(card).toBeVisible();

    const announcer = page.getByTestId("board-announcer");
    await expect(announcer).toBeAttached();

    // Open card actions menu
    const actionsButton = card.getByTestId("card-actions");
    await actionsButton.click();

    // Modal should not open
    const modal = page.locator('[role="dialog"]');
    await expect(modal).not.toBeVisible();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    // "Move to In Progress" from the card menu moves it to the bottom of In Progress
    const moveToInProgress = page.getByRole("menuitem", {
      name: "Move to In Progress",
    });
    await expect(moveToInProgress).toBeVisible();
    await moveToInProgress.click();

    // Menu closes
    await expect(menu).not.toBeVisible();

    // Card is in In Progress column
    const inProgressCol = page.locator('[data-testid="column-in_progress"]');
    await expect(
      inProgressCol.locator(`[data-ticket-key="${t1.key}"]`)
    ).toBeVisible();

    // Announcer updated
    await expect(announcer).toContainText(`${t1.key} moved to In Progress`);

    // GET /api/tickets/:key Activity shows a moved entry by you
    await expect.poll(async () => {
      const res = await request.get(`/api/tickets/${t1.key}`);
      if (!res.ok()) return [];
      const ticket = await res.json();
      return ticket.activity ?? [];
    }).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "moved",
          actor: "you",
        }),
      ])
    );
  });

  test("Pointer drop also updates the announcer", async ({ page, request }) => {
    const project = await createProject(request);
    const t1 = await createTicket(request, project.key, {
      title: "Pointer Drop Card",
      column: "todo",
    });

    await page.goto(`/projects/${project.key}`);

    const card = page.locator(`[data-ticket-key="${t1.key}"]`);
    await expect(card).toBeVisible();

    const emptyColBody = page.locator(
      '[data-testid="column-in_progress"] .column-body'
    );
    await expect(emptyColBody).toBeVisible();

    const announcer = page.getByTestId("board-announcer");
    await expect(announcer).toBeAttached();

    await dragCard(page, card, emptyColBody);

    const inProgressCol = page.locator('[data-testid="column-in_progress"]');
    await expect(
      inProgressCol.locator(`[data-ticket-key="${t1.key}"]`)
    ).toBeVisible();

    await expect(announcer).toContainText(`${t1.key} moved to In Progress`);
    await expect(announcer).toContainText("position 1 of 1.");
  });

  test("Esc closes card menu and returns focus to actions button", async ({
    page,
    request,
  }) => {
    const project = await createProject(request);
    const t1 = await createTicket(request, project.key, {
      title: "Esc Key Card",
      column: "todo",
    });

    await page.goto(`/projects/${project.key}`);

    const card = page.locator(`[data-ticket-key="${t1.key}"]`);
    const actionsButton = card.getByTestId("card-actions");
    await actionsButton.click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(actionsButton).toBeFocused();
  });
});
