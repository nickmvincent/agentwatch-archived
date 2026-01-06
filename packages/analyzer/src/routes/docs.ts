/**
 * Documentation routes.
 *
 * Serves markdown docs from the repo docs/ directory.
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { Hono } from "hono";

export function registerDocsRoutes(app: Hono): void {
  /**
   * GET /api/docs
   *
   * List available docs.
   */
  app.get("/api/docs", (c) => {
    const docsDir = join(import.meta.dir, "..", "..", "..", "docs");
    try {
      if (!existsSync(docsDir)) {
        return c.json({ docs: [], error: "Docs directory not found" });
      }
      const files = readdirSync(docsDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => ({
          id: f.replace(".md", ""),
          filename: f,
          title: f
            .replace(".md", "")
            .replace(/-/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
        }));
      return c.json({ docs: files });
    } catch (e) {
      return c.json({
        docs: [],
        error: e instanceof Error ? e.message : "Unknown error"
      });
    }
  });

  /**
   * GET /api/docs/:id
   *
   * Return doc content by ID.
   */
  app.get("/api/docs/:id", (c) => {
    const id = c.req.param("id");
    const docsDir = join(import.meta.dir, "..", "..", "..", "docs");
    const filePath = join(docsDir, `${id}.md`);

    try {
      if (!existsSync(filePath)) {
        return c.json({ error: "Document not found" }, 404);
      }
      const content = readFileSync(filePath, "utf-8");
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : id.replace(/-/g, " ");
      return c.json({ id, title, content });
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : "Unknown error" },
        500
      );
    }
  });
}
