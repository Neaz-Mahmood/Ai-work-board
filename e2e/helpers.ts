import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { APIRequestContext, Page, Locator } from "@playwright/test";
import type { Project, Ticket, Feature } from "@awb/shared/types.ts";

let projectSequence = 0;

const createdRepoDirs: string[] = [];

export function cleanupRepoDirs(): void {
  while (createdRepoDirs.length > 0) {
    const dir = createdRepoDirs.pop();
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore error removing directory
      }
    }
  }
}

process.on("exit", () => {
  cleanupRepoDirs();
});

export function generateProjectKey(): string {
  projectSequence++;
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const p1 = letters[Math.floor(Math.random() * 26)];
  const p2 = letters[Math.floor(Math.random() * 26)];
  const p3 = letters[projectSequence % 26];
  return `P${p1}${p2}${p3}`;
}

export async function createProject(
  request: APIRequestContext,
  options?: { key?: string; name?: string; path?: string }
): Promise<Project> {
  const repoDir =
    options?.path ?? fs.mkdtempSync(path.join(os.tmpdir(), "awb-e2e-repo-"));
  if (!options?.path) {
    createdRepoDirs.push(repoDir);
  }
  const key = options?.key ?? generateProjectKey();
  const name = options?.name ?? `Project ${key}`;

  const res = await request.post("/api/projects", {
    data: { path: repoDir, key, name },
  });
  if (!res.ok()) {
    throw new Error(`Failed to create project: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function createTicket(
  request: APIRequestContext,
  projectKey: string,
  body: {
    title: string;
    description?: string;
    column?: string;
    priority?: string;
    assignee?: string | null;
    featureId?: number | null;
    blockedBy?: string[];
  },
  actor?: string
): Promise<Ticket> {
  const headers: Record<string, string> = {};
  if (actor) {
    headers["X-AWB-Actor"] = actor;
  }
  const res = await request.post(`/api/projects/${projectKey}/tickets`, {
    data: body,
    headers,
  });
  if (!res.ok()) {
    throw new Error(`Failed to create ticket: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function createFeature(
  request: APIRequestContext,
  projectKey: string,
  body: {
    name: string;
    description?: string;
    color?: string;
    tickets?: string[];
  },
  actor?: string
): Promise<Feature> {
  const headers: Record<string, string> = {};
  if (actor) {
    headers["X-AWB-Actor"] = actor;
  }
  const res = await request.post(`/api/projects/${projectKey}/features`, {
    data: body,
    headers,
  });
  if (!res.ok()) {
    throw new Error(`Failed to create feature: ${res.status()} ${await res.text()}`);
  }
  const data = await res.json();
  return data.feature ?? data;
}

export async function flagNeedsAttention(
  request: APIRequestContext,
  ticketKey: string,
  reason: string,
  actor?: string
): Promise<Ticket> {
  const headers: Record<string, string> = {};
  if (actor) {
    headers["X-AWB-Actor"] = actor;
  }
  const res = await request.put(`/api/tickets/${ticketKey}/attention`, {
    data: { reason },
    headers,
  });
  if (!res.ok()) {
    throw new Error(`Failed to flag needs attention: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function getTicket(
  request: APIRequestContext,
  ticketKey: string
): Promise<Ticket> {
  const res = await request.get(`/api/tickets/${ticketKey}`);
  if (!res.ok()) {
    throw new Error(`Failed to get ticket: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function dragCard(
  _page: Page,
  source: Locator,
  target: Locator,
  opts?: { edge?: "top" | "bottom" }
) {
  const targetBox = await target.boundingBox();
  if (!targetBox) {
    throw new Error("Could not find bounding box for drag");
  }

  let targetPosition: { x: number; y: number };
  if (opts?.edge === "top") {
    targetPosition = { x: targetBox.width / 2, y: 4 };
  } else if (opts?.edge === "bottom") {
    targetPosition = { x: targetBox.width / 2, y: targetBox.height - 4 };
  } else {
    targetPosition = { x: targetBox.width / 2, y: targetBox.height / 2 };
  }

  await source.dragTo(target, { targetPosition });
}
