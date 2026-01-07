/**
 * Agent metadata routes for watcher.
 *
 * Provides endpoints for persistent agent naming/annotations.
 */

import type { Hono } from "hono";
import type { DataStore } from "@agentwatch/monitor";
import {
  type AgentMetadataInput,
  deleteAgentMetadata,
  getAgentMetadata,
  getAgentMetadataById,
  getAgentRenameHistory,
  getAllAgentMetadata,
  searchAgentMetadata,
  setAgentMetadata,
  setAgentMetadataById
} from "@agentwatch/core";

export function registerAgentMetadataRoutes(app: Hono, store: DataStore): void {
  app.get("/api/agent-metadata", (c) => {
    return c.json(getAllAgentMetadata());
  });

  app.get("/api/agent-metadata/search", (c) => {
    const query = c.req.query("q") ?? "";
    return c.json(searchAgentMetadata(query));
  });

  app.get("/api/agent-metadata/history", (c) => {
    return c.json(getAgentRenameHistory());
  });

  app.get("/api/agent-metadata/:agentId/history", (c) => {
    const agentId = c.req.param("agentId");
    return c.json(getAgentRenameHistory(agentId));
  });

  app.get("/api/agent-metadata/:agentId", (c) => {
    const agentId = c.req.param("agentId");
    const metadata = getAgentMetadataById(agentId);
    if (!metadata) {
      return c.json({ error: "Agent metadata not found" }, 404);
    }
    return c.json(metadata);
  });

  app.post("/api/agent-metadata", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      label?: string;
      exe?: string;
    } & AgentMetadataInput;

    if (!body.label || !body.exe) {
      return c.json({ error: "Missing label or exe" }, 400);
    }

    const metadata = setAgentMetadata(body.label, body.exe, {
      customName: body.customName,
      aliases: body.aliases,
      notes: body.notes,
      tags: body.tags,
      color: body.color
    });

    return c.json(metadata);
  });

  app.patch("/api/agent-metadata/:agentId", async (c) => {
    const agentId = c.req.param("agentId");
    const body = (await c.req.json().catch(() => ({}))) as AgentMetadataInput;
    const metadata = setAgentMetadataById(agentId, body);
    return c.json(metadata);
  });

  app.delete("/api/agent-metadata/:agentId", (c) => {
    const agentId = c.req.param("agentId");
    const deleted = deleteAgentMetadata(agentId);
    if (!deleted) {
      return c.json({ error: "Agent metadata not found" }, 404);
    }
    return c.json({ success: true });
  });

  app.post("/api/agents/:pid/metadata", async (c) => {
    const pid = Number.parseInt(c.req.param("pid"), 10);
    const agent = store.getAgent(pid);
    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    const body = (await c.req.json().catch(() => ({}))) as AgentMetadataInput;
    const metadata = setAgentMetadata(agent.label, agent.exe, {
      customName: body.customName,
      aliases: body.aliases,
      notes: body.notes,
      tags: body.tags,
      color: body.color
    });

    return c.json(metadata);
  });

  app.get("/api/agents/:pid/metadata", (c) => {
    const pid = Number.parseInt(c.req.param("pid"), 10);
    const agent = store.getAgent(pid);
    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    const metadata = getAgentMetadata(agent.label, agent.exe);
    return c.json(metadata || { agentId: null });
  });
}
