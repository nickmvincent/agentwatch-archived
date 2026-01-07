import { useEffect, useMemo, useState } from "react";
import {
  fetchEnvVarsReference,
  fetchFormatSchemas,
  fetchMcpConfig,
  fetchPermissionsReference
} from "../api/client";
import type {
  EnvVarsReferenceResult,
  FieldDefinition,
  FormatSchema,
  McpConfigResult,
  McpServerConfig,
  PermissionsReferenceResult
} from "../api/types";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

export function ReferencePane() {
  const showSelfDocs = useSelfDocumentingVisible();

  return (
    <SelfDocumentingSection
      title="Reference"
      componentId="analyzer.settings.reference-pane"
      reads={[
        {
          path: "GET /api/reference/format-schemas",
          description: "Supported and planned transcript schemas"
        },
        { path: "GET /api/reference/mcp-config", description: "MCP servers" },
        {
          path: "GET /api/reference/permissions",
          description: "Claude Code permission modes"
        },
        {
          path: "GET /api/reference/env-vars",
          description: "Environment variables reference"
        }
      ]}
      calculations={["Token cost estimation from model pricing"]}
      notes={[
        "Reference data is read-only and reflects current local settings."
      ]}
      visible={showSelfDocs}
    >
      <div className="space-y-6">
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-white">Reference</h1>
          <p className="text-sm text-gray-400 mt-1">
            Log format schemas, MCP servers, Claude Code permissions,
            environment variables, and token calculator.
          </p>
        </div>

        {/* Log Format Schemas */}
        <FormatSchemasSection />

        {/* MCP Servers */}
        <McpServersSection />

        {/* Claude Code Reference */}
        <ClaudeReferenceSection />

        {/* Cost Calculator */}
        <CostCalculatorSection />
      </div>
    </SelfDocumentingSection>
  );
}

// Field Row for format schemas
interface FieldRowProps {
  field: FieldDefinition;
  depth?: number;
}

function FieldRow({ field, depth = 0 }: FieldRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = field.children && field.children.length > 0;

  return (
    <>
      <tr
        className={`border-b border-gray-700 ${depth > 0 ? "bg-gray-800/30" : ""}`}
      >
        <td className="px-2 py-1.5 font-mono text-xs">
          <span
            style={{ paddingLeft: `${depth * 12}px` }}
            className="flex items-center gap-1"
          >
            {hasChildren && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-gray-500 hover:text-gray-300 w-3"
              >
                {expanded ? "-" : "+"}
              </button>
            )}
            <span className={hasChildren ? "" : "ml-4"}>{field.name}</span>
          </span>
        </td>
        <td className="px-2 py-1.5">
          <span className="text-blue-400 text-xs font-mono">{field.type}</span>
        </td>
        <td className="px-2 py-1.5 text-center">
          {field.required ? (
            <span className="text-green-400 text-xs">*</span>
          ) : (
            <span className="text-gray-600">-</span>
          )}
        </td>
        <td className="px-2 py-1.5 text-xs text-gray-400">
          {field.description}
        </td>
      </tr>
      {expanded &&
        field.children?.map((child, i) => (
          <FieldRow key={i} field={child} depth={depth + 1} />
        ))}
    </>
  );
}

// Format Schemas Section
function FormatSchemasSection() {
  const [schemas, setSchemas] = useState<{
    supported: FormatSchema[];
    planned: FormatSchema[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSchema, setExpandedSchema] = useState<string | null>(null);
  const [expandedMessageType, setExpandedMessageType] = useState<string | null>(
    null
  );
  const [filter, setFilter] = useState<"all" | "supported" | "planned">("all");

  useEffect(() => {
    fetchFormatSchemas()
      .then((data) =>
        setSchemas({ supported: data.supported, planned: data.planned })
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-4">
          Log Format Schemas
        </h2>
        <div className="text-center py-4 text-gray-500">
          Loading format schemas...
        </div>
      </div>
    );
  }

  if (!schemas) return null;

  const displaySchemas =
    filter === "all"
      ? [...schemas.supported, ...schemas.planned]
      : filter === "supported"
        ? schemas.supported
        : schemas.planned;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Log Format Schemas
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Data dictionaries for AI coding assistant transcript files
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setFilter("all")}
            className={`px-2 py-1 text-xs rounded ${filter === "all" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}
          >
            All ({schemas.supported.length + schemas.planned.length})
          </button>
          <button
            onClick={() => setFilter("supported")}
            className={`px-2 py-1 text-xs rounded ${filter === "supported" ? "bg-green-600 text-white" : "bg-gray-700 text-gray-300"}`}
          >
            Supported ({schemas.supported.length})
          </button>
          <button
            onClick={() => setFilter("planned")}
            className={`px-2 py-1 text-xs rounded ${filter === "planned" ? "bg-yellow-600 text-white" : "bg-gray-700 text-gray-300"}`}
          >
            Planned ({schemas.planned.length})
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {displaySchemas.map((schema) => {
          const isPlanned = schemas.planned.some(
            (p) => p.agent === schema.agent
          );
          const isExpanded = expandedSchema === schema.agent;

          return (
            <div
              key={schema.agent}
              className={`border rounded ${isPlanned ? "border-gray-700 opacity-80" : "border-gray-600"}`}
            >
              <button
                onClick={() =>
                  setExpandedSchema(isExpanded ? null : schema.agent)
                }
                className="w-full px-3 py-2 bg-gray-700/50 hover:bg-gray-700 flex items-center justify-between text-left rounded-t"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">
                    {schema.displayName}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${isPlanned ? "bg-yellow-900/50 text-yellow-400" : "bg-green-900/50 text-green-400"}`}
                  >
                    {isPlanned ? "Planned" : "Supported"}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-600 text-gray-300">
                    {schema.fileFormat.toUpperCase()}
                  </span>
                </div>
                <span className="text-gray-500 text-sm">
                  {isExpanded ? "▼" : "▶"}
                </span>
              </button>

              {isExpanded && (
                <div className="p-3 space-y-3 border-t border-gray-700">
                  <p className="text-sm text-gray-400">{schema.description}</p>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-700/50 rounded p-2">
                      <span className="text-gray-500">Location: </span>
                      <code className="text-gray-300">
                        {schema.fileLocation}
                      </code>
                    </div>
                    <div className="bg-gray-700/50 rounded p-2">
                      <span className="text-gray-500">Pattern: </span>
                      <code className="text-gray-300">
                        {schema.filePattern}
                      </code>
                    </div>
                  </div>

                  {/* Message Types */}
                  <div>
                    <h4 className="text-xs font-medium text-gray-300 mb-2">
                      Message Types
                    </h4>
                    <div className="space-y-1">
                      {schema.messageTypes.map((mt) => {
                        const mtKey = `${schema.agent}:${mt.name}`;
                        const mtExpanded = expandedMessageType === mtKey;
                        return (
                          <div
                            key={mtKey}
                            className="border border-gray-700 rounded"
                          >
                            <button
                              onClick={() =>
                                setExpandedMessageType(
                                  mtExpanded ? null : mtKey
                                )
                              }
                              className="w-full px-2 py-1.5 bg-gray-800 hover:bg-gray-750 flex items-center justify-between text-left text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <code className="text-blue-400">{mt.name}</code>
                                <span className="text-gray-500">
                                  {mt.description}
                                </span>
                              </div>
                              <span className="text-gray-600">
                                {mtExpanded ? "-" : "+"}
                              </span>
                            </button>
                            {mtExpanded && (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-gray-800/50 text-gray-500 uppercase text-[10px]">
                                      <th className="px-2 py-1 text-left w-28">
                                        Field
                                      </th>
                                      <th className="px-2 py-1 text-left w-20">
                                        Type
                                      </th>
                                      <th className="px-2 py-1 text-center w-8">
                                        Req
                                      </th>
                                      <th className="px-2 py-1 text-left">
                                        Description
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {mt.fields.map((field, i) => (
                                      <FieldRow key={i} field={field} />
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Notes */}
                  {schema.notes.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-300 mb-1">
                        Notes
                      </h4>
                      <ul className="list-disc list-inside text-xs text-gray-500 space-y-0.5">
                        {schema.notes.map((note, i) => (
                          <li key={i}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Sample Entry */}
                  {schema.sampleEntry && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-300 mb-1">
                        Sample Entry
                      </h4>
                      <pre className="bg-gray-900 p-2 rounded text-[10px] text-gray-400 overflow-x-auto">
                        {JSON.stringify(
                          JSON.parse(schema.sampleEntry),
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500">
        <span className="text-green-400">*</span> = Required field |{" "}
        <span className="text-blue-400">+</span> = Has nested fields (click to
        expand)
      </div>
    </div>
  );
}

// MCP Servers Section
function McpServersSection() {
  const [data, setData] = useState<McpConfigResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    loadMcpConfig();
  }, []);

  const loadMcpConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMcpConfig();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load MCP config");
    } finally {
      setLoading(false);
    }
  };

  const toggleServer = (key: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderServer = (
    name: string,
    server: McpServerConfig,
    scope: string
  ) => {
    const key = `${scope}:${name}`;
    const isExpanded = expandedServers.has(key);

    return (
      <div key={key} className="bg-gray-700/50 rounded">
        <button
          onClick={() => toggleServer(key)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-700/70 rounded"
        >
          <div className="flex items-center gap-2">
            <span className="text-gray-200">{name}</span>
            <span
              className={`px-1.5 py-0.5 text-xs rounded ${scope === "user" ? "bg-blue-700 text-blue-200" : "bg-green-700 text-green-200"}`}
            >
              {scope}
            </span>
            {server.type && (
              <span className="px-1.5 py-0.5 text-xs bg-gray-600 rounded text-gray-300">
                {server.type}
              </span>
            )}
          </div>
          <span className="text-gray-500">{isExpanded ? "▼" : "▶"}</span>
        </button>

        {isExpanded && (
          <div className="px-3 pb-3 space-y-2">
            {server.command && (
              <div className="text-xs">
                <span className="text-gray-500">Command: </span>
                <span className="font-mono text-gray-300">
                  {server.command}
                </span>
              </div>
            )}
            {server.args && server.args.length > 0 && (
              <div className="text-xs">
                <span className="text-gray-500">Args: </span>
                <span className="font-mono text-gray-300">
                  {server.args.join(" ")}
                </span>
              </div>
            )}
            {server.url && (
              <div className="text-xs">
                <span className="text-gray-500">URL: </span>
                <span className="font-mono text-gray-300">{server.url}</span>
              </div>
            )}
            {server.env && Object.keys(server.env).length > 0 && (
              <div className="text-xs">
                <span className="text-gray-500">Environment: </span>
                <div className="mt-1 space-y-1">
                  {Object.entries(server.env).map(([k, v]) => (
                    <div key={k} className="font-mono text-gray-400 pl-2">
                      {k}={v.length > 30 ? v.slice(0, 30) + "..." : v}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-4">MCP Servers</h2>
        <div className="text-center py-4 text-gray-500">
          Loading MCP configuration...
        </div>
      </div>
    );
  }

  const userServers = data?.user.servers ?? {};
  const userServerCount = Object.keys(userServers).length;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">MCP Servers</h2>
            <span className="px-2 py-0.5 text-xs bg-gray-600 rounded text-gray-400">
              Read-only
            </span>
          </div>
          <p className="text-xs text-gray-500 font-mono mt-1">
            {data?.user.path}
          </p>
        </div>
        <button
          onClick={loadMcpConfig}
          className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      {!data?.user.exists && (
        <div className="p-4 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-400 text-sm mb-4">
          <p className="text-xs">
            No MCP servers configured. Run{" "}
            <code className="bg-gray-700 px-1 rounded">claude mcp add</code> to
            add servers.
          </p>
        </div>
      )}

      {userServerCount === 0 ? (
        <p className="text-gray-500 text-sm">No MCP servers found</p>
      ) : (
        <div className="space-y-2">
          {Object.entries(userServers).map(([name, server]) =>
            renderServer(name, server, "user")
          )}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-700">
        <p className="text-xs text-gray-500">
          Source:{" "}
          <a
            href="https://code.claude.com/docs/en/mcp.md"
            className="text-blue-400 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            MCP Documentation
          </a>
        </p>
      </div>
    </div>
  );
}

// Claude Code Reference Section (Permissions, Env Vars, OTel)
function ClaudeReferenceSection() {
  const [envVars, setEnvVars] = useState<EnvVarsReferenceResult | null>(null);
  const [permissions, setPermissions] =
    useState<PermissionsReferenceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "permissions" | "envvars" | "otel"
  >("permissions");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  useEffect(() => {
    loadReference();
  }, []);

  const loadReference = async () => {
    setLoading(true);
    try {
      const [envResult, permResult] = await Promise.all([
        fetchEnvVarsReference(),
        fetchPermissionsReference()
      ]);
      setEnvVars(envResult);
      setPermissions(permResult);
    } catch {
      // Silent fail for reference data
    } finally {
      setLoading(false);
    }
  };

  const filteredEnvVars = useMemo(() => {
    if (!envVars) return [];
    if (selectedCategory === "all") return envVars.env_vars;
    return envVars.env_vars.filter((v) => v.category === selectedCategory);
  }, [envVars, selectedCategory]);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-4">
          Claude Code Reference
        </h2>
        <div className="text-center py-4 text-gray-500">
          Loading reference data...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">
              Claude Code Reference
            </h2>
            <span className="px-2 py-0.5 text-xs bg-gray-600 rounded text-gray-400">
              Reference
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Official Claude Code settings reference: permission patterns,
            environment variables, and OpenTelemetry metrics for monitoring
            usage.
          </p>
        </div>
        <span className="text-gray-500 ml-4">{expanded ? "▼" : "▶"}</span>
      </button>

      {!expanded ? null : (
        <>
          {/* Tab Navigation */}
          <div className="flex gap-1 mb-4 mt-4 bg-gray-700 rounded p-1">
            <button
              onClick={() => setActiveTab("permissions")}
              className={`flex-1 px-3 py-1.5 text-xs rounded ${activeTab === "permissions" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-600"}`}
            >
              Permissions
            </button>
            <button
              onClick={() => setActiveTab("envvars")}
              className={`flex-1 px-3 py-1.5 text-xs rounded ${activeTab === "envvars" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-600"}`}
            >
              Environment Vars
            </button>
            <button
              onClick={() => setActiveTab("otel")}
              className={`flex-1 px-3 py-1.5 text-xs rounded ${activeTab === "otel" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-600"}`}
            >
              OpenTelemetry
            </button>
          </div>

          {activeTab === "permissions" && permissions && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-white mb-2">
                  Permission Patterns
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {permissions.patterns.map((p, i) => (
                    <div key={i} className="bg-gray-700/50 rounded p-2">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-xs font-mono text-blue-300 bg-gray-800 px-1.5 py-0.5 rounded">
                          {p.pattern}
                        </code>
                      </div>
                      <p className="text-xs text-gray-400">{p.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-white mb-2">
                  Path Types
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {permissions.path_types.map((p, i) => (
                    <div key={i} className="bg-gray-700/50 rounded p-2">
                      <code className="text-xs font-mono text-green-300">
                        {p.prefix || "(none)"}
                      </code>
                      <p className="text-xs text-gray-400 mt-1">
                        {p.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-blue-900/30 border border-blue-700 rounded">
                <p className="text-xs text-blue-300 font-medium mb-1">
                  Priority Order:
                </p>
                <p className="text-xs text-gray-400">
                  Deny (highest) → Ask → Allow (lowest)
                </p>
              </div>

              <p className="text-xs text-gray-500">
                Source:{" "}
                <a
                  href={permissions.source}
                  className="text-blue-400 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {permissions.source}
                </a>
              </p>
            </div>
          )}

          {activeTab === "envvars" && envVars && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedCategory("all")}
                  className={`px-2 py-1 text-xs rounded ${selectedCategory === "all" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}
                >
                  All
                </button>
                {envVars.categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-1 text-xs rounded ${selectedCategory === cat ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredEnvVars.map((v, i) => (
                  <div key={i} className="bg-gray-700/50 rounded p-2">
                    <div className="flex items-center justify-between mb-1">
                      <code className="text-xs font-mono text-yellow-300">
                        {v.name}
                      </code>
                      <span className="text-xs text-gray-500">
                        {v.category}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{v.description}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Example:{" "}
                      <code className="text-gray-400">{v.example}</code>
                    </p>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-500">
                Source:{" "}
                <a
                  href={envVars.source}
                  className="text-blue-400 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {envVars.source}
                </a>
              </p>
            </div>
          )}

          {activeTab === "otel" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Claude Code supports OpenTelemetry for monitoring usage and
                costs.
              </p>

              <div>
                <h3 className="text-sm font-medium text-white mb-2">
                  Quick Setup
                </h3>
                <div className="bg-gray-900 rounded p-3 font-mono text-xs text-gray-300 overflow-x-auto">
                  <pre>{`export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317`}</pre>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-white mb-2">
                  Available Metrics
                </h3>
                <div className="space-y-1">
                  {[
                    {
                      name: "claude_code.session.count",
                      desc: "Sessions started"
                    },
                    {
                      name: "claude_code.cost.usage",
                      desc: "USD estimate of token usage (rough)"
                    },
                    {
                      name: "claude_code.token.usage",
                      desc: "Tokens used (by type)"
                    },
                    {
                      name: "claude_code.lines_of_code.count",
                      desc: "Code lines modified"
                    },
                    {
                      name: "claude_code.commit.count",
                      desc: "Commits created"
                    },
                    {
                      name: "claude_code.pull_request.count",
                      desc: "PRs created"
                    }
                  ].map((m) => (
                    <div
                      key={m.name}
                      className="flex justify-between text-xs bg-gray-700/50 rounded px-2 py-1"
                    >
                      <code className="text-green-300">{m.name}</code>
                      <span className="text-gray-400">{m.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-white mb-2">
                  Available Events
                </h3>
                <div className="space-y-1">
                  {[
                    {
                      name: "claude_code.user_prompt",
                      desc: "User submits prompt"
                    },
                    { name: "claude_code.tool_result", desc: "Tool completes" },
                    { name: "claude_code.api_request", desc: "API call made" },
                    { name: "claude_code.api_error", desc: "API failure" }
                  ].map((e) => (
                    <div
                      key={e.name}
                      className="flex justify-between text-xs bg-gray-700/50 rounded px-2 py-1"
                    >
                      <code className="text-purple-300">{e.name}</code>
                      <span className="text-gray-400">{e.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-gray-500">
                Source:{" "}
                <a
                  href="https://code.claude.com/docs/en/monitoring-usage.md"
                  className="text-blue-400 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Monitoring Usage Documentation
                </a>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Model pricing (per 1M tokens) - updated Dec 2024
const MODEL_PRICING: Record<
  string,
  { input: number; output: number; provider: string }
> = {
  "claude-opus-4": { input: 15.0, output: 75.0, provider: "Anthropic" },
  "claude-sonnet-4": { input: 3.0, output: 15.0, provider: "Anthropic" },
  "claude-3.5-sonnet": { input: 3.0, output: 15.0, provider: "Anthropic" },
  "claude-3.5-haiku": { input: 0.8, output: 4.0, provider: "Anthropic" },
  "gpt-4o": { input: 2.5, output: 10.0, provider: "OpenAI" },
  "gpt-4o-mini": { input: 0.15, output: 0.6, provider: "OpenAI" },
  "gpt-4-turbo": { input: 10.0, output: 30.0, provider: "OpenAI" },
  o1: { input: 15.0, output: 60.0, provider: "OpenAI" },
  "o1-mini": { input: 3.0, output: 12.0, provider: "OpenAI" },
  "gemini-2.0-flash": { input: 0.1, output: 0.4, provider: "Google" },
  "gemini-1.5-pro": { input: 1.25, output: 5.0, provider: "Google" },
  "gemini-1.5-flash": { input: 0.075, output: 0.3, provider: "Google" }
};

// Cost Calculator Section
function CostCalculatorSection() {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"calculator" | "pricing">(
    "calculator"
  );
  const [calcModel, setCalcModel] = useState("claude-opus-4");
  const [calcInputTokens, setCalcInputTokens] = useState(100000);
  const [calcOutputTokens, setCalcOutputTokens] = useState(50000);
  const [calcSessions, setCalcSessions] = useState(10);

  const formatCost = (usd: number) =>
    usd < 0.01 ? `${(usd * 100).toFixed(2)}c` : `$${usd.toFixed(2)}`;
  const formatTokens = (count: number) => {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  };

  const calculateCost = () => {
    const p = MODEL_PRICING[calcModel];
    if (!p) return 0;
    return (
      ((calcInputTokens / 1_000_000) * p.input +
        (calcOutputTokens / 1_000_000) * p.output) *
      calcSessions
    );
  };
  const totalTokens = (calcInputTokens + calcOutputTokens) * calcSessions;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">
              Token Cost Calculator
            </h2>
            <span className="px-2 py-0.5 text-xs bg-gray-600 rounded text-gray-400">
              Tool
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Estimate token usage and a rough USD equivalent based on model
            pricing. This is a planning tool for budgeting—USD values shown
            elsewhere are estimates reported by Claude Code.
          </p>
        </div>
        <span className="text-gray-500 ml-4">{expanded ? "▼" : "▶"}</span>
      </button>

      {!expanded ? null : (
        <>
          {/* Tab Navigation */}
          <div className="flex gap-1 mb-4 mt-4 bg-gray-700 rounded p-1">
            <button
              onClick={() => setActiveTab("calculator")}
              className={`flex-1 px-3 py-1.5 text-xs rounded ${activeTab === "calculator" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-600"}`}
            >
              Calculator
            </button>
            <button
              onClick={() => setActiveTab("pricing")}
              className={`flex-1 px-3 py-1.5 text-xs rounded ${activeTab === "pricing" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-600"}`}
            >
              Model Pricing
            </button>
          </div>

          {activeTab === "calculator" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">Model</label>
                  <select
                    value={calcModel}
                    onChange={(e) => setCalcModel(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                  >
                    <optgroup label="Anthropic">
                      <option value="claude-opus-4">Claude Opus 4</option>
                      <option value="claude-sonnet-4">Claude Sonnet 4</option>
                      <option value="claude-3.5-haiku">Claude 3.5 Haiku</option>
                    </optgroup>
                    <optgroup label="OpenAI">
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="o1">o1</option>
                    </optgroup>
                    <optgroup label="Google">
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Sessions</label>
                  <input
                    type="number"
                    value={calcSessions}
                    onChange={(e) =>
                      setCalcSessions(
                        Math.max(1, Number.parseInt(e.target.value) || 1)
                      )
                    }
                    className="w-full mt-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">
                    Input tokens/session
                  </label>
                  <input
                    type="number"
                    value={calcInputTokens}
                    onChange={(e) =>
                      setCalcInputTokens(Number.parseInt(e.target.value) || 0)
                    }
                    className="w-full mt-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">
                    Output tokens/session
                  </label>
                  <input
                    type="number"
                    value={calcOutputTokens}
                    onChange={(e) =>
                      setCalcOutputTokens(Number.parseInt(e.target.value) || 0)
                    }
                    className="w-full mt-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                  />
                </div>
              </div>
              <div className="p-4 bg-gray-700/50 rounded text-center">
                <div className="text-xs text-gray-400">Estimated Tokens</div>
                <div className="text-2xl font-bold text-green-400">
                  {formatTokens(totalTokens)} tok{" "}
                  <span className="text-[10px] text-gray-500">
                    (~{formatCost(calculateCost())})
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === "pricing" && (
            <div className="space-y-3">
              {["Anthropic", "OpenAI", "Google"].map((provider) => (
                <div key={provider} className="p-3 bg-gray-700/50 rounded">
                  <div className="text-sm text-gray-300 mb-2">{provider}</div>
                  {Object.entries(MODEL_PRICING)
                    .filter(([, p]) => p.provider === provider)
                    .map(([model, p]) => (
                      <div
                        key={model}
                        className="flex justify-between text-xs py-0.5"
                      >
                        <span className="text-gray-400 font-mono">{model}</span>
                        <span>
                          <span className="text-blue-400">1M tok</span>{" "}
                          <span className="text-[10px] text-gray-500">
                            (~${p.input})
                          </span>{" "}
                          / <span className="text-purple-400">1M tok</span>{" "}
                          <span className="text-[10px] text-gray-500">
                            (~${p.output})
                          </span>
                        </span>
                      </div>
                    ))}
                </div>
              ))}
              <div className="p-3 bg-gray-700/50 rounded text-xs text-gray-400">
                <div className="font-medium mb-1">Sources</div>
                <a
                  href="https://www.anthropic.com/pricing"
                  className="text-blue-400 hover:underline block"
                >
                  anthropic.com/pricing
                </a>
                <a
                  href="https://openai.com/api/pricing/"
                  className="text-blue-400 hover:underline block"
                >
                  openai.com/api/pricing
                </a>
                <a
                  href="https://ai.google.dev/pricing"
                  className="text-blue-400 hover:underline block"
                >
                  ai.google.dev/pricing
                </a>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
