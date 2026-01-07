/**
 * Project management routes for watcher.
 *
 * Edits the shared projects configuration used by analyzer.
 */

import type { Hono } from "hono";
import type { DataStore } from "@agentwatch/monitor";
import {
  addProject,
  getProjectsConfigPath,
  loadProjects,
  removeProject,
  updateProject,
  type ProjectConfig
} from "../projects-config";

export function registerProjectRoutes(app: Hono, store?: DataStore): void {
  /**
   * GET /api/projects
   */
  app.get("/api/projects", (c) => {
    const projects = loadProjects();
    return c.json({ projects });
  });

  /**
   * GET /api/projects/config-path
   *
   * Return the config path for UX display.
   */
  app.get("/api/projects/config-path", (c) => {
    return c.json({ path: getProjectsConfigPath() });
  });

  /**
   * GET /api/projects/:id
   */
  app.get("/api/projects/:id", (c) => {
    const id = c.req.param("id");
    const projects = loadProjects();
    const project = projects.find((p) => p.id === id);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }
    return c.json(project);
  });

  /**
   * POST /api/projects
   */
  app.post("/api/projects", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as ProjectConfig;
    if (!body.id || !body.name || !Array.isArray(body.paths)) {
      return c.json({ error: "Missing required fields: id, name, paths" }, 400);
    }

    const projects = loadProjects();
    if (projects.some((p) => p.id === body.id)) {
      return c.json({ error: "Project with this ID already exists" }, 409);
    }

    try {
      addProject({
        id: body.id,
        name: body.name,
        paths: body.paths,
        description: body.description
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: `Failed to save project: ${message}` }, 500);
    }

    return c.json({ success: true, project: body }, 201);
  });

  /**
   * POST /api/projects/infer
   *
   * Create projects from scanned repos (best-effort).
   */
  app.post("/api/projects/infer", (c) => {
    if (!store) {
      return c.json({ error: "Repo scanner not available" }, 501);
    }

    const repos = store.snapshotRepos();
    const existing = loadProjects();
    const existingPaths = new Set(existing.flatMap((project) => project.paths));
    const existingIds = new Set(existing.map((project) => project.id));

    const newProjects: ProjectConfig[] = [];

    for (const repo of repos) {
      if (existingPaths.has(repo.path)) continue;

      const name =
        repo.name || repo.path.split("/").filter(Boolean).pop() || "";
      if (!name) continue;

      let id = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      let suffix = 1;
      while (existingIds.has(id)) {
        id = `${id}-${suffix++}`;
      }
      existingIds.add(id);

      const project: ProjectConfig = {
        id,
        name,
        paths: [repo.path]
      };
      newProjects.push(project);
      existingPaths.add(repo.path);
    }

    if (newProjects.length > 0) {
      for (const project of newProjects) {
        addProject(project);
      }
    }

    return c.json({
      success: true,
      scanned_cwds: repos.length,
      git_repos_found: repos.length,
      new_projects: newProjects.length,
      projects: newProjects
    });
  });

  /**
   * PATCH /api/projects/:id
   */
  app.patch("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req
      .json()
      .catch(() => ({}))) as Partial<ProjectConfig>;

    const success = updateProject(id, body);
    if (!success) {
      return c.json({ error: "Project not found" }, 404);
    }

    const updated = loadProjects().find((p) => p.id === id) || null;
    return c.json({ success: true, project: updated });
  });

  /**
   * DELETE /api/projects/:id
   */
  app.delete("/api/projects/:id", (c) => {
    const id = c.req.param("id");
    const success = removeProject(id);
    if (!success) {
      return c.json({ error: "Project not found" }, 404);
    }
    return c.json({ success: true });
  });
}
