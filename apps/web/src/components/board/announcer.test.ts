import { describe, expect, test } from "vitest";
import {
  announce,
  getAnnouncement,
  resetAnnouncement,
} from "./announcer.ts";

describe("announcer", () => {
  test("updates message and notifies listeners", () => {
    resetAnnouncement();
    expect(getAnnouncement()).toBe("");

    announce("AWB-1 moved to Done, position 1 of 1.");
    expect(getAnnouncement()).toBe("AWB-1 moved to Done, position 1 of 1.");

    resetAnnouncement();
    expect(getAnnouncement()).toBe("");
  });
});
