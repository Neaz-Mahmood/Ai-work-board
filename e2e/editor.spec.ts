import { test, expect } from "@playwright/test";
import {
  createProject,
  createTicket,
  getTicket,
  cleanupRepoDirs,
} from "./helpers.ts";

test.describe("Rich text markdown editor", () => {
  test.afterEach(() => {
    cleanupRepoDirs();
  });

  test("1. Toolbar heading, bold, bullet list formatting and save", async ({
    page,
    request,
  }) => {
    const project = await createProject(request);
    const ticket = await createTicket(request, project.key, {
      title: "Ticket with rich description",
      column: "todo",
    });

    await page.goto(`/projects/${project.key}`);
    const card = page.locator(`[data-ticket-key="${ticket.key}"]`);
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.locator(".ticket-modal")).toBeVisible();

    // Click placeholder to start editing
    await page.locator(".description-placeholder").click();
    const editor = page.locator('[data-testid="markdown-editor"]');
    await expect(editor).toBeVisible();

    // Use toolbar: Heading 2
    await page.getByRole("button", { name: "Heading 2" }).click();
    await page.keyboard.type("Heading text");
    await page.keyboard.press("Enter");

    // Use toolbar: Bold
    await page.getByRole("button", { name: "Bold" }).click();
    await page.keyboard.type("Bold text");
    await page.getByRole("button", { name: "Bold" }).click();
    await page.keyboard.press("Enter");

    // Use toolbar: Bullet list
    await page.getByRole("button", { name: "Bullet list" }).click();
    await page.keyboard.type("Bullet item");

    // Save
    await page.getByRole("button", { name: "Save" }).click();
    await expect(editor).not.toBeVisible();

    // Verify markdown via API
    await expect.poll(async () => {
      const updated = await getTicket(request, ticket.key);
      return updated.description ?? "";
    }).toContain("## ");

    const updated = await getTicket(request, ticket.key);
    expect(updated.description).toContain("## Heading text");
    expect(updated.description).toContain("**Bold text**");
    expect(updated.description).toContain("- Bullet item");
  });

  test("2. Input rules for headings and task lists and save", async ({
    page,
    request,
  }) => {
    const project = await createProject(request);
    const ticket = await createTicket(request, project.key, {
      title: "Ticket for input rules",
      column: "todo",
    });

    await page.goto(`/projects/${project.key}`);
    const card = page.locator(`[data-ticket-key="${ticket.key}"]`);
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.locator(".ticket-modal")).toBeVisible();

    await page.locator(".description-placeholder").click();
    const editor = page.locator('[data-testid="markdown-editor"]');
    await expect(editor).toBeVisible();

    // Type ## Title, Enter, - [ ] todo
    await editor.click();
    await page.keyboard.type("## Title");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- [ ] todo");

    // Save
    await page.getByRole("button", { name: "Save" }).click();
    await expect(editor).not.toBeVisible();

    await expect.poll(async () => {
      const updated = await getTicket(request, ticket.key);
      return updated.description ?? "";
    }).toContain("## Title");

    const updated = await getTicket(request, ticket.key);
    expect(updated.description).toContain("## Title");
    expect(updated.description).toContain("- [ ] todo");
  });

  test("3. Open and save without typing leaves description byte-identical without sending PATCH", async ({
    page,
    request,
  }) => {
    const project = await createProject(request);
    const initialMarkdown = `| Col A | Col B |
| --- | --- |
| 1 | 2 |

- [ ] Task 1
- [x] Task 2

\`\`\`ts
const x = 1;
\`\`\``;

    const ticket = await createTicket(request, project.key, {
      title: "Ticket with complex markdown",
      description: initialMarkdown,
      column: "todo",
    });

    await page.goto(`/projects/${project.key}`);
    const card = page.locator(`[data-ticket-key="${ticket.key}"]`);
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.locator(".ticket-modal")).toBeVisible();

    // Open editor via Edit button
    await page.getByRole("button", { name: "Edit" }).click();
    const editor = page.locator('[data-testid="markdown-editor"]');
    await expect(editor).toBeVisible();

    // Watch for PATCH requests to /api/tickets/
    let patchCount = 0;
    page.on("request", (req) => {
      if (req.method() === "PATCH" && req.url().includes("/api/tickets/")) {
        patchCount++;
      }
    });

    // Save without typing
    await page.getByRole("button", { name: "Save" }).click();
    await expect(editor).not.toBeVisible();

    // Wait to ensure no pending PATCH request is dispatched
    await page.waitForTimeout(500);

    expect(patchCount).toBe(0);

    const ticketAfter = await getTicket(request, ticket.key);
    expect(ticketAfter.description).toBe(initialMarkdown);
  });

  test("4. Keyboard shortcuts: Esc cancels, ControlOrMeta+Enter saves", async ({
    page,
    request,
  }) => {
    const project = await createProject(request);
    const initialMarkdown = "Initial description";
    const ticket = await createTicket(request, project.key, {
      title: "Ticket for keyboard shortcuts",
      description: initialMarkdown,
      column: "todo",
    });

    await page.goto(`/projects/${project.key}`);
    const card = page.locator(`[data-ticket-key="${ticket.key}"]`);
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.locator(".ticket-modal")).toBeVisible();

    // 1. Edit, then press Esc -> Nothing is saved, modal remains open
    await page.getByRole("button", { name: "Edit" }).click();
    const editor = page.locator('[data-testid="markdown-editor"]');
    await expect(editor).toBeVisible();

    await editor.click();
    await page.keyboard.type(" edited text");
    await page.keyboard.press("Escape");

    await expect(editor).not.toBeVisible();
    await expect(page.locator(".ticket-modal")).toBeVisible();

    const ticketAfterEsc = await getTicket(request, ticket.key);
    expect(ticketAfterEsc.description).toBe(initialMarkdown);

    // 2. Edit, then press Cmd/Ctrl+Enter -> Saved
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(editor).toBeVisible();

    await editor.click();
    await page.keyboard.type(" updated text");
    await page.keyboard.press("ControlOrMeta+Enter");

    await expect(editor).not.toBeVisible();

    await expect.poll(async () => {
      const updated = await getTicket(request, ticket.key);
      return updated.description ?? "";
    }).toContain("updated text");

    const ticketAfterSave = await getTicket(request, ticket.key);
    expect(ticketAfterSave.description).toContain("updated text");
  });
});
