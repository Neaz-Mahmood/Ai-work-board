import { test, expect } from "@playwright/test";
import {
  createProject,
  createTicket,
  dragCard,
  cleanupRepoDirs,
} from "./helpers.ts";

test.describe("Pragmatic Drag and Drop Suite", () => {
  test.afterAll(() => {
    cleanupRepoDirs();
  });

  test("Dropping on top edge places directly above, bottom edge places directly below", async ({
    page,
    request,
  }) => {
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
    const card2 = todoCol.locator(`[data-ticket-key="${t2.key}"]`);
    const card3 = todoCol.locator(`[data-ticket-key="${t3.key}"]`);

    await expect(card1).toBeVisible();
    await expect(card2).toBeVisible();
    await expect(card3).toBeVisible();

    // 1. Drag card 3 onto top edge of card 1 -> order becomes [t3, t1, t2]
    await dragCard(page, card3, card1, { edge: "top" });

    const cardsAfterTop = todoCol.locator("[data-ticket-key]");
    await expect(cardsAfterTop.nth(0)).toHaveAttribute("data-ticket-key", t3.key);
    await expect(cardsAfterTop.nth(1)).toHaveAttribute("data-ticket-key", t1.key);
    await expect(cardsAfterTop.nth(2)).toHaveAttribute("data-ticket-key", t2.key);

    // Survives reload
    await page.reload();
    const cardsAfterReload1 = page.locator(
      '[data-testid="column-todo"] [data-ticket-key]'
    );
    await expect(cardsAfterReload1.nth(0)).toHaveAttribute("data-ticket-key", t3.key);
    await expect(cardsAfterReload1.nth(1)).toHaveAttribute("data-ticket-key", t1.key);
    await expect(cardsAfterReload1.nth(2)).toHaveAttribute("data-ticket-key", t2.key);

    // Verify Rank order via GET /api/projects/:key/board
    let boardRes = await request.get(`/api/projects/${project.key}/board`);
    expect(boardRes.ok()).toBe(true);
    let boardData = await boardRes.json();
    let col = boardData.columns.find((c: { id: string }) => c.id === "todo");
    expect(col.tickets.map((t: { key: string }) => t.key)).toEqual([
      t3.key,
      t1.key,
      t2.key,
    ]);

    // 2. Drag card 3 onto bottom edge of card 1 -> order becomes [t1, t3, t2]
    const card3Current = page.locator(`[data-ticket-key="${t3.key}"]`);
    const card1Current = page.locator(`[data-ticket-key="${t1.key}"]`);
    await dragCard(page, card3Current, card1Current, { edge: "bottom" });

    const cardsAfterBottom = page.locator(
      '[data-testid="column-todo"] [data-ticket-key]'
    );
    await expect(cardsAfterBottom.nth(0)).toHaveAttribute("data-ticket-key", t1.key);
    await expect(cardsAfterBottom.nth(1)).toHaveAttribute("data-ticket-key", t3.key);
    await expect(cardsAfterBottom.nth(2)).toHaveAttribute("data-ticket-key", t2.key);

    // Survives reload
    await page.reload();
    const cardsAfterReload2 = page.locator(
      '[data-testid="column-todo"] [data-ticket-key]'
    );
    await expect(cardsAfterReload2.nth(0)).toHaveAttribute("data-ticket-key", t1.key);
    await expect(cardsAfterReload2.nth(1)).toHaveAttribute("data-ticket-key", t3.key);
    await expect(cardsAfterReload2.nth(2)).toHaveAttribute("data-ticket-key", t2.key);

    // Verify Rank order via GET /api/projects/:key/board
    boardRes = await request.get(`/api/projects/${project.key}/board`);
    expect(boardRes.ok()).toBe(true);
    boardData = await boardRes.json();
    col = boardData.columns.find((c: { id: string }) => c.id === "todo");
    expect(col.tickets.map((t: { key: string }) => t.key)).toEqual([
      t1.key,
      t3.key,
      t2.key,
    ]);
  });

  test("Dropping on an empty Column body moves the card there", async ({
    page,
    request,
  }) => {
    const project = await createProject(request);
    const t1 = await createTicket(request, project.key, {
      title: "Card to Move",
      column: "todo",
    });

    await page.goto(`/projects/${project.key}`);

    const card = page.locator(`[data-ticket-key="${t1.key}"]`);
    await expect(card).toBeVisible();

    const emptyColBody = page.locator(
      '[data-testid="column-in_progress"] .column-body'
    );
    await dragCard(page, card, emptyColBody);

    // Card moves to in_progress
    const inProgressCol = page.locator('[data-testid="column-in_progress"]');
    await expect(
      inProgressCol.locator(`[data-ticket-key="${t1.key}"]`)
    ).toBeVisible();

    // Survives reload
    await page.reload();
    await expect(
      page.locator(
        `[data-testid="column-in_progress"] [data-ticket-key="${t1.key}"]`
      )
    ).toBeVisible();

    // Checked via GET /api/projects/:key/board
    const boardRes = await request.get(`/api/projects/${project.key}/board`);
    expect(boardRes.ok()).toBe(true);
    const boardData = await boardRes.json();
    const targetCol = boardData.columns.find(
      (c: { id: string }) => c.id === "in_progress"
    );
    expect(targetCol.tickets.map((t: { key: string }) => t.key)).toEqual([t1.key]);
  });

  test("With a search filter active, dropping relative to a visible card lands at the right full-Column Rank", async ({
    page,
    request,
  }) => {
    const project = await createProject(request);
    // Initial order in todo: [t1, t2, t3, t4]
    const t1 = await createTicket(request, project.key, {
      title: "Apple One",
      column: "todo",
    });
    const t2 = await createTicket(request, project.key, {
      title: "Banana Hidden",
      column: "todo",
    });
    const t3 = await createTicket(request, project.key, {
      title: "Apple Two",
      column: "todo",
    });
    const t4 = await createTicket(request, project.key, {
      title: "Orange Hidden",
      column: "todo",
    });

    await page.goto(`/projects/${project.key}`);

    // Verify all 4 are visible before filtering
    await expect(page.locator(`[data-ticket-key="${t1.key}"]`)).toBeVisible();
    await expect(page.locator(`[data-ticket-key="${t2.key}"]`)).toBeVisible();
    await expect(page.locator(`[data-ticket-key="${t3.key}"]`)).toBeVisible();
    await expect(page.locator(`[data-ticket-key="${t4.key}"]`)).toBeVisible();

    // Search filter for "Apple"
    const searchInput = page.getByPlaceholder("Search board");
    await searchInput.fill("Apple");
    await expect(page).toHaveURL(/q=Apple/);

    // Only t1 and t3 visible
    await expect(page.locator(`[data-ticket-key="${t1.key}"]`)).toBeVisible();
    await expect(page.locator(`[data-ticket-key="${t3.key}"]`)).toBeVisible();
    await expect(page.locator(`[data-ticket-key="${t2.key}"]`)).not.toBeVisible();
    await expect(page.locator(`[data-ticket-key="${t4.key}"]`)).not.toBeVisible();

    const card1 = page.locator(`[data-ticket-key="${t1.key}"]`);
    const card3 = page.locator(`[data-ticket-key="${t3.key}"]`);

    // Drag t1 (rank 0) onto bottom edge of t3 (rank 2)
    // Server move: t1 inserted after t3 -> full column becomes [t2, t3, t1, t4]
    await dragCard(page, card1, card3, { edge: "bottom" });

    // Under the active filter, visible order in UI is [t3, t1]
    const filteredCards = page.locator(
      '[data-testid="column-todo"] [data-ticket-key]'
    );
    await expect(filteredCards.nth(0)).toHaveAttribute("data-ticket-key", t3.key);
    await expect(filteredCards.nth(1)).toHaveAttribute("data-ticket-key", t1.key);

    // Verify full column Rank order via API with filter cleared (GET /api/projects/:key/board)
    const boardRes = await request.get(`/api/projects/${project.key}/board`);
    expect(boardRes.ok()).toBe(true);
    const boardData = await boardRes.json();
    const todoCol = boardData.columns.find((c: { id: string }) => c.id === "todo");
    expect(todoCol.tickets.map((t: { key: string }) => t.key)).toEqual([
      t2.key,
      t3.key,
      t1.key,
      t4.key,
    ]);

    // Clear filter on UI and verify full column order
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/q=/);

    const allCards = page.locator(
      '[data-testid="column-todo"] [data-ticket-key]'
    );
    await expect(allCards.nth(0)).toHaveAttribute("data-ticket-key", t2.key);
    await expect(allCards.nth(1)).toHaveAttribute("data-ticket-key", t3.key);
    await expect(allCards.nth(2)).toHaveAttribute("data-ticket-key", t1.key);
    await expect(allCards.nth(3)).toHaveAttribute("data-ticket-key", t4.key);
  });

  test("One fetch per drop", async ({ page, request }) => {
    const project = await createProject(request);
    const t1 = await createTicket(request, project.key, {
      title: "Card to Move",
      column: "todo",
    });

    await page.goto(`/projects/${project.key}`);

    const card = page.locator(`[data-ticket-key="${t1.key}"]`);
    await expect(card).toBeVisible();

    const emptyColBody = page.locator(
      '[data-testid="column-in_progress"] .column-body'
    );
    await expect(emptyColBody).toBeVisible();

    let count = 0;
    const countListener = (req: import("@playwright/test").Request) => {
      if (req.url().includes(`/api/projects/${project.key}/board`)) {
        count++;
      }
    };
    page.on("request", countListener);

    try {
      await dragCard(page, card, emptyColBody);

      const inProgressCol = page.locator('[data-testid="column-in_progress"]');
      await expect(
        inProgressCol.locator(`[data-ticket-key="${t1.key}"]`)
      ).toBeVisible();

      await expect.poll(() => count, { timeout: 1500 }).toBe(1);
      await page.waitForTimeout(1500);
      expect(count).toBe(1);
    } finally {
      page.off("request", countListener);
    }
  });

  test("Mid-drag live update", async ({ page, request }) => {
    const project = await createProject(request);
    const t1 = await createTicket(request, project.key, {
      title: "Card to Drag",
      column: "todo",
    });

    await page.goto(`/projects/${project.key}`);

    const card = page.locator(`[data-ticket-key="${t1.key}"]`);
    await expect(card).toBeVisible();

    const box = await card.boundingBox();
    if (!box) {
      throw new Error("Could not find bounding box for card");
    }

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    // 1. Press on a card with page.mouse (move to the card centre, down, then move by about 20px in a few steps so Chromium starts a native drag).
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY + 20, { steps: 5 });

    // 2. While it's held, count board requests and create a Ticket through the request fixture (createTicket). Assert that no board request happens within 1s.
    let boardRequestsDuringDrag = 0;
    const dragRequestListener = (req: import("@playwright/test").Request) => {
      if (req.url().includes(`/api/projects/${project.key}/board`)) {
        boardRequestsDuringDrag++;
      }
    };
    page.on("request", dragRequestListener);

    let newTicketKey = "";
    try {
      const newTicket = await createTicket(request, project.key, {
        title: "Mid-Drag Created Ticket",
        column: "todo",
      });
      newTicketKey = newTicket.key;

      await page.waitForTimeout(1000);
      expect(boardRequestsDuringDrag).toBe(0);

      // 3. Then move to another Column and up.
      const targetCol = page.locator(
        '[data-testid="column-in_progress"] .column-body'
      );
      const targetBox = await targetCol.boundingBox();
      if (!targetBox) {
        throw new Error("Could not find bounding box for target column");
      }

      await page.mouse.move(
        targetBox.x + targetBox.width / 2,
        targetBox.y + targetBox.height / 2,
        { steps: 5 }
      );
      await page.mouse.up();

      // 4. Assert the new Ticket's card becomes visible.
      const newCard = page.locator(`[data-ticket-key="${newTicketKey}"]`);
      await expect(newCard).toBeVisible();
    } finally {
      page.off("request", dragRequestListener);
    }
  });
});
