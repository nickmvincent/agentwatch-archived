/**
 * Project management routes.
 *
 * Provides CRUD operations for projects:
 * - List projects
 * - Get project details
 * - Create new projects
 * - Update project settings
 * - Delete projects
 *
 * @module routes/projects
 */

import type { Hono } from "hono";
import {
  loadAnalyzerConfig,
  addProject,
  updateProject,
  removeProject,
  getConfigPath,
  type ProjectConfig
} from "../config";

/**
 * Register project routes.
 *
 * @param app - The Hono app instance
 */
export function registerProjectRoutes(app: Hono): void {
  /**
   * GET /api/projects
   *
   * List all configured projects.
   *
   * @returns { projects: Array<ProjectConfig> }
   */
  app.get("/api/projects", (c) => {
    const config = loadAnalyzerConfig();
    return c.json({
      projects: config.projects.map((p) => ({
        id: p.id,
        name: p.name,
        paths: p.paths,
        description: p.description
      }))
    });
  });

  /**
   * GET /api/projects/config-path
   *
   * Return the config path for display.
   */
  app.get("/api/projects/config-path", (c) => {
    return c.json({ path: getConfigPath() });
  });

  /**
   * GET /api/projects/:id
   *
   * Get a specific project by ID.
   *
   * @param id - Project ID
   * @returns ProjectConfig or 404
   */
  app.get("/api/projects/:id", (c) => {
    const id = c.req.param("id");
    const config = loadAnalyzerConfig();
    const project = config.projects.find((p) => p.id === id);

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    return c.json({
      id: project.id,
      name: project.name,
      paths: project.paths,
      description: project.description
    });
  });

  /**
   * POST /api/projects
   *
   * Create a new project.
   *
   * @body id - Unique project ID
   * @body name - Display name
   * @body paths - Array of directory paths
   * @body description - Optional description
   * @returns { success: boolean, project: ProjectConfig }
   */
  app.post("/api/projects", async (c) => {
    const body = (await c.req.json()) as {
      id: string;
      name: string;
      paths: string[];
      description?: string;
    };

    // Validate required fields
    if (
      !body.id ||
      !body.name ||
      !Array.isArray(body.paths) ||
      body.paths.length === 0
    ) {
      return c.json(
        { error: "Missing required fields: id, name, paths (non-empty array)" },
        400
      );
    }

    // Check for duplicate ID
    const config = loadAnalyzerConfig();
    if (config.projects.some((p) => p.id === body.id)) {
      return c.json({ error: "Project with this ID already exists" }, 409);
    }

    const project: ProjectConfig = {
      id: body.id,
      name: body.name,
      paths: body.paths,
      description: body.description
    };

    addProject(project);

    return c.json({ success: true, project }, 201);
  });

  /**
   * PATCH /api/projects/:id
   *
   * Update an existing project.
   *
   * @param id - Project ID
   * @body name - New display name (optional)
   * @body paths - New paths array (optional)
   * @body description - New description (optional)
   * @returns { success: boolean, project: ProjectConfig }
   */
  app.patch("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json()) as Partial<{
      name: string;
      paths: string[];
      description: string;
    }>;

    const config = loadAnalyzerConfig();
    const project = config.projects.find((p) => p.id === id);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const updates: Partial<ProjectConfig> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.paths !== undefined) updates.paths = body.paths;
    if (body.description !== undefined) updates.description = body.description;

    const success = updateProject(id, updates);
    if (!success) {
      return c.json({ error: "Failed to update project" }, 500);
    }

    // Reload to get updated project
    const updatedConfig = loadAnalyzerConfig();
    const updatedProject = updatedConfig.projects.find((p) => p.id === id);

    return c.json({
      success: true,
      project: updatedProject
        ? {
            id: updatedProject.id,
            name: updatedProject.name,
            paths: updatedProject.paths,
            description: updatedProject.description
          }
        : null
    });
  });

  /**
   * DELETE /api/projects/:id
   *
   * Delete a project.
   *
   * @param id - Project ID
   * @returns { success: boolean } or 404
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
