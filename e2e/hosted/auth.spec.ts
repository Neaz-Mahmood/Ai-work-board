import { test, expect, type APIRequestContext, request as playwrightRequest } from "@playwright/test";
import { createProject, createTicket } from "../helpers.ts";

test.describe("Hosted Auth and Cross-Origin SSE", () => {
  let apiContext: APIRequestContext;

  test.beforeAll(async () => {
    apiContext = await playwrightRequest.newContext({
      baseURL: "http://localhost:4801",
      extraHTTPHeaders: {
        Authorization: "Bearer e2e-token",
        "X-AWB-Actor": "e2e-agent",
      },
    });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test("hosted login, cross-origin SSE live updates, and sign-out", async ({ page }) => {
    // 1. Visiting / shows the login screen
    await page.goto("/");
    const passwordInput = page.locator('[data-testid="login-password"]');
    const submitButton = page.locator('[data-testid="login-submit"]');
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();

    // 2. A wrong password shows the error
    await passwordInput.fill("wrong-password");
    await submitButton.click();
    await expect(page.getByText("Wrong password")).toBeVisible();

    // Create a project via Playwright request against hosted API
    const project = await createProject(apiContext, { name: "Hosted E2E Project" });

    // 3. The right password shows the projects UI
    await passwordInput.fill("e2e-password");
    await submitButton.click();

    // Board / projects UI is shown
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(`text=${project.key} board`)).toBeVisible();
    await expect(page.locator('[data-testid="column-backlog"]')).toBeVisible();

    // 4. A Ticket created via Playwright request appears on the open Board without a reload (cross-origin SSE)
    const ticket = await createTicket(apiContext, project.key, {
      title: "Cross-Origin SSE Ticket",
      column: "backlog",
    });

    const card = page.locator(`[data-ticket-key="${ticket.key}"]`);
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(card.locator(".ticket-card-title")).toHaveText("Cross-Origin SSE Ticket");

    // 5. "Sign out" returns to the login screen
    const signOutButton = page.locator('[data-testid="sign-out"]');
    await expect(signOutButton).toBeVisible();
    await signOutButton.click();

    await expect(page.locator('[data-testid="login-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-submit"]')).toBeVisible();
  });
});
