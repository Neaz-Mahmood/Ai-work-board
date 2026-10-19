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

  test("5. Feature description rich text formatting and untouched description preservation", async ({
    page,
    request,
  }) => {
    const project = await createProject(request);

    await page.goto(`/projects/${project.key}`);

    // Open the panel with the "Features" button on the Board page, then "Create feature"
    await page.getByRole("button", { name: "Features" }).click();
    await expect(page.locator(".features-drawer")).toBeVisible();

    await page.getByRole("button", { name: "Create feature" }).click();
    await expect(page.locator(".feature-form-panel")).toBeVisible();

    // Type a name
    await page.getByPlaceholder("Feature name").fill("Test Feature");

    // Type and format in [aria-label="Feature description"] using toolbar buttons ("Bold", "Bullet list")
    const editor = page.locator('[aria-label="Feature description"]');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.getByRole("button", { name: "Bold" }).click();
    await page.keyboard.type("Bold text");
    await page.getByRole("button", { name: "Bold" }).click();
    await page.keyboard.press("Enter");

    await page.getByRole("button", { name: "Bullet list" }).click();
    await page.keyboard.type("Bullet item");

    // Click "Create"
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.locator(".feature-form-panel")).not.toBeVisible();

    // Find the id via GET /api/projects/<key>/features
    await expect.poll(async () => {
      const res = await request.get(`/api/projects/${project.key}/features`);
      if (!res.ok()) return 0;
      const list = await res.json();
      return list.length;
    }).toBe(1);

    const featuresRes = await request.get(`/api/projects/${project.key}/features`);
    const features = await featuresRes.json();
    const featureId = features[0].id;

    // Read back with request.get("/api/features/<id>"). The description contains ** and - .
    const featureRes = await request.get(`/api/features/${featureId}`);
    expect(featureRes.ok()).toBeTruthy();
    const featureData = await featureRes.json();
    expect(featureData.description).toContain("**");
    expect(featureData.description).toContain("- ");
    expect(featureData.description).toContain("**Bold text**");
    expect(featureData.description).toContain("- Bullet item");

    // Capture PATCH request body
    let patchBody: Record<string, unknown> | null = null;
    page.on("request", (req) => {
      if (req.method() === "PATCH" && req.url().includes(`/api/features/${featureId}`)) {
        patchBody = req.postDataJSON();
      }
    });

    // Open that Feature's edit form
    await page.getByRole("button", { name: /Edit feature/i }).click();
    await expect(page.locator(".feature-form-panel")).toBeVisible();

    // Change only the name, and Save
    await page.getByPlaceholder("Feature name").fill("Renamed Feature");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".feature-form-panel")).not.toBeVisible();

    // Check that the PATCH request body has no description key
    await expect.poll(() => patchBody).not.toBeNull();
    expect("description" in (patchBody ?? {})).toBe(false);

    // The stored description is byte-identical to before
    const updatedRes = await request.get(`/api/features/${featureId}`);
    expect(updatedRes.ok()).toBeTruthy();
    const updatedData = await updatedRes.json();
    expect(updatedData.name).toBe("Renamed Feature");
    expect(updatedData.description).toBe(featureData.description);
  });
});

