import { describe, it, expect } from "bun:test";
import {
  loadBuiltInPrompt,
  loadRolePrompt,
  hasBuiltInPrompt,
  listBuiltInPrompts,
  buildAgentPrompt,
} from "./index.js";

describe("Prompt Loading", () => {
  describe("hasBuiltInPrompt", () => {
    it("returns true for director", () => {
      expect(hasBuiltInPrompt("director")).toBe(true);
    });

    it("returns true for worker", () => {
      expect(hasBuiltInPrompt("worker")).toBe(true);
    });

    it("returns true for steward base", () => {
      expect(hasBuiltInPrompt("steward")).toBe(true);
    });

    it("returns true for steward with focus", () => {
      expect(hasBuiltInPrompt("steward", "merge")).toBe(true);
      expect(hasBuiltInPrompt("steward", "health")).toBe(true);
      expect(hasBuiltInPrompt("steward", "ops")).toBe(true);
      expect(hasBuiltInPrompt("steward", "reminder")).toBe(true);
    });
  });

  describe("listBuiltInPrompts", () => {
    it("returns all prompt file names", () => {
      const files = listBuiltInPrompts();
      expect(files).toContain("director.md");
      expect(files).toContain("worker.md");
      expect(files).toContain("steward-base.md");
      expect(files).toContain("steward-merge.md");
      expect(files).toContain("steward-health.md");
      expect(files).toContain("steward-ops.md");
      expect(files).toContain("steward-reminder.md");
    });
  });

  describe("loadBuiltInPrompt", () => {
    it("loads director prompt", () => {
      const prompt = loadBuiltInPrompt("director");
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are the **Director**");
    });

    it("loads worker prompt", () => {
      const prompt = loadBuiltInPrompt("worker");
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are an **Ephemeral Worker**");
    });

    it("loads steward base prompt", () => {
      const prompt = loadBuiltInPrompt("steward");
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are a **Steward**");
    });

    it("combines steward base with focus", () => {
      const prompt = loadBuiltInPrompt("steward", "merge");
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are a **Steward**"); // Base
      expect(prompt).toContain("You are a **Merge Steward**"); // Focus
    });
  });

  describe("loadRolePrompt", () => {
    it("loads director with source info", () => {
      const result = loadRolePrompt("director");
      expect(result).toBeDefined();
      expect(result!.source).toBe("built-in");
      expect(result!.prompt).toContain("You are the **Director**");
    });

    it("loads worker with source info", () => {
      const result = loadRolePrompt("worker");
      expect(result).toBeDefined();
      expect(result!.source).toBe("built-in");
      expect(result!.prompt).toContain("You are an **Ephemeral Worker**");
    });

    it("loads steward with source info for base and focus", () => {
      const result = loadRolePrompt("steward", "health");
      expect(result).toBeDefined();
      expect(result!.source).toBe("built-in");
      expect(result!.baseSource).toBe("built-in");
      expect(result!.focusSource).toBe("built-in");
      expect(result!.prompt).toContain("You are a **Steward**");
      expect(result!.prompt).toContain("You are a **Health Steward**");
    });
  });

  describe("buildAgentPrompt", () => {
    it("builds director prompt without task context", () => {
      const prompt = buildAgentPrompt({ role: "director" });
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are the **Director**");
      expect(prompt).not.toContain("# Current Task");
    });

    it("builds worker prompt with task context", () => {
      const prompt = buildAgentPrompt({
        role: "worker",
        taskContext: "Implement user authentication with OAuth2.",
      });
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are an **Ephemeral Worker**");
      expect(prompt).toContain("# Current Task");
      expect(prompt).toContain("OAuth2");
    });

    it("builds steward prompt with focus", () => {
      const prompt = buildAgentPrompt({
        role: "steward",
        stewardFocus: "ops",
      });
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are a **Steward**");
      expect(prompt).toContain("You are an **Ops Steward**");
    });

    it("adds additional instructions", () => {
      const prompt = buildAgentPrompt({
        role: "worker",
        additionalInstructions: "Remember to write tests for all new code.",
      });
      expect(prompt).toBeDefined();
      expect(prompt).toContain("Remember to write tests");
    });
  });
});

describe("Prompt Content", () => {
  describe("Director prompt", () => {
    it("includes inbox check workflow", () => {
      const prompt = loadBuiltInPrompt("director");
      expect(prompt).toContain("el inbox <Director ID>");
      expect(prompt).toContain("Always check your inbox");
    });

    it("includes task sizing guidance", () => {
      const prompt = loadBuiltInPrompt("director");
      expect(prompt).toContain("small, focused tasks");
    });

    it("includes judgment scenarios", () => {
      const prompt = loadBuiltInPrompt("director");
      expect(prompt).toContain("Judgment Scenarios");
    });
  });

  describe("Worker prompt", () => {
    it("includes handoff guidance", () => {
      const prompt = loadBuiltInPrompt("worker");
      expect(prompt).toContain("el task handoff");
      expect(prompt).toContain("Handoff");
    });

    it("includes nudge response guidance", () => {
      const prompt = loadBuiltInPrompt("worker");
      expect(prompt).toContain("nudge");
      expect(prompt).toContain("continue or handoff");
    });

    it("includes task creation guidance", () => {
      const prompt = loadBuiltInPrompt("worker");
      expect(prompt).toContain("el task create");
      expect(prompt).toContain("Discovering Additional Work");
    });

    it("includes director lookup command", () => {
      const prompt = loadBuiltInPrompt("worker");
      expect(prompt).toContain("el agent list --role director");
    });
  });

  describe("Steward prompts", () => {
    it("base includes escalation guidance", () => {
      const prompt = loadBuiltInPrompt("steward");
      expect(prompt).toContain("--to <Director ID>");
      expect(prompt).toContain("escalation");
    });

    it("merge focus includes test workflow", () => {
      const prompt = loadBuiltInPrompt("steward", "merge");
      expect(prompt).toContain("Tests pass");
      expect(prompt).toContain("Tests fail");
    });

    it("health focus includes nudge guidance", () => {
      const prompt = loadBuiltInPrompt("steward", "health");
      expect(prompt).toContain("nudge");
      expect(prompt).toContain("stuck");
    });
  });
});
