import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createProject,
  deleteProject,
  fetchAnalyticsByProject,
  fetchProjects,
  fetchProjectsConfigPath,
  inferProjects,
  updateProject
} from "../api/client";
import type { Project, ProjectAnalyticsItem, RepoStatus } from "../api/types";
import { useLoading } from "../context/LoadingContext";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";
import type { ComponentId } from "../lib/ui-registry";

// Refresh data if tab has been hidden for more than 5 minutes
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

interface ProjectsPaneProps {
  repos: RepoStatus[];
  isActive?: boolean;
  activatedAt?: number;
  enableAnalytics?: boolean;
  analyticsDays?: number;
  componentId?: ComponentId;
}

interface ProjectWithStats extends Project {
  session_count?: number;
}

export function ProjectsPane({
  repos,
  isActive = true,
  activatedAt = 0,
  enableAnalytics = true,
  analyticsDays = 90,
  componentId = "analyzer.projects.pane"
}: ProjectsPaneProps) {
  const showSelfDocs = useSelfDocumentingVisible();
  const { setLoading: setGlobalLoading } = useLoading();
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const lastLoadedAt = useRef<number>(0);

  // Report loading state to global context
  useEffect(() => {
    setGlobalLoading("projects", loading);
    return () => setGlobalLoading("projects", false);
  }, [loading, setGlobalLoading]);

  // Edit modal state
  const [editingProject, setEditingProject] = useState<ProjectWithStats | null>(
    null
  );
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPaths, setFormPaths] = useState("");
  const [saving, setSaving] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [inferResult, setInferResult] = useState<string | null>(null);

  // Find repos matching project paths
  const getReposForProject = useCallback(
    (project: Project): RepoStatus[] => {
      return repos.filter((repo) =>
        project.paths.some(
          (path) =>
            repo.path === path ||
            repo.path.startsWith(path + "/") ||
            path.startsWith(repo.path + "/")
        )
      );
    },
    [repos]
  );

  // Get repo status for a specific path
  const getRepoForPath = useCallback(
    (path: string): RepoStatus | undefined => {
      return repos.find(
        (repo) =>
          repo.path === path ||
          repo.path.startsWith(path + "/") ||
          path.startsWith(repo.path + "/")
      );
    },
    [repos]
  );

  // Calculate project repo stats
  const projectRepoStats = useMemo(() => {
    const stats = new Map<
      string,
      { total: number; dirty: number; clean: number }
    >();
    for (const project of projects) {
      const projectRepos = getReposForProject(project);
      stats.set(project.id, {
        total: projectRepos.length,
        dirty: projectRepos.filter((r) => r.dirty).length,
        clean: projectRepos.filter((r) => !r.dirty).length
      });
    }
    return stats;
  }, [projects, getReposForProject]);

  // Find unassigned repos (dirty repos not matched to any project)
  const unassignedDirtyRepos = useMemo(() => {
    const assignedPaths = new Set<string>();
    for (const project of projects) {
      for (const path of project.paths) {
        assignedPaths.add(path);
      }
    }
    return repos.filter((repo) => {
      if (!repo.dirty) return false;
      // Check if this repo is matched to any project
      for (const project of projects) {
        if (
          project.paths.some(
            (path) =>
              repo.path === path ||
              repo.path.startsWith(path + "/") ||
              path.startsWith(repo.path + "/")
          )
        ) {
          return false;
        }
      }
      return true;
    });
  }, [repos, projects]);

  // Load projects and analytics
  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const projectsData = await fetchProjects();
      let analyticsData: { breakdown: ProjectAnalyticsItem[] } | null = null;
      if (enableAnalytics) {
        try {
          analyticsData = await fetchAnalyticsByProject(analyticsDays);
        } catch {
          analyticsData = null;
        }
      }

      // Create a map of project stats
      const statsMap = new Map<string, ProjectAnalyticsItem>();
      if (analyticsData?.breakdown) {
        for (const item of analyticsData.breakdown) {
          statsMap.set(item.project_id, item);
        }
      }

      // Merge session counts with projects
      const projectsWithStats: ProjectWithStats[] = projectsData.map((p) => {
        const stats = statsMap.get(p.id);
        return {
          ...p,
          session_count: stats?.session_count
        };
      });

      setProjects(projectsWithStats);
      lastLoadedAt.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [analyticsDays, enableAnalytics]);

  // Initial load
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    fetchProjectsConfigPath()
      .then((path) => setConfigPath(path))
      .catch(() => setConfigPath(null));
  }, []);

  // Auto-refresh when tab becomes active and data is stale
  useEffect(() => {
    if (
      isActive &&
      lastLoadedAt.current > 0 &&
      Date.now() - lastLoadedAt.current > STALE_THRESHOLD_MS
    ) {
      loadProjects();
    }
  }, [isActive, activatedAt, loadProjects]);

  // Open create modal
  const openCreateModal = () => {
    setFormId("");
    setFormName("");
    setFormDescription("");
    setFormPaths("");
    setEditingProject(null);
    setIsCreating(true);
  };

  // Open edit modal
  const openEditModal = (project: ProjectWithStats) => {
    setFormId(project.id);
    setFormName(project.name);
    setFormDescription(project.description || "");
    setFormPaths(project.paths.join("\n"));
    setEditingProject(project);
    setIsCreating(false);
  };

  // Close modal
  const closeModal = () => {
    setEditingProject(null);
    setIsCreating(false);
  };

  // Save project (create or update)
  const handleSave = async () => {
    const paths = formPaths
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (!formName.trim() || paths.length === 0) {
      setError("Name and at least one path are required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isCreating) {
        // Generate ID from name if not provided
        const id =
          formId.trim() ||
          formName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        await createProject({
          id,
          name: formName.trim(),
          paths,
          description: formDescription.trim() || undefined
        });
      } else if (editingProject) {
        await updateProject(editingProject.id, {
          name: formName.trim(),
          paths,
          description: formDescription.trim() || undefined
        });
      }
      closeModal();
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  // Delete project
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this project?")) return;

    try {
      await deleteProject(id);
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project");
    }
  };

  // Discover projects from git repos
  const handleDiscover = async () => {
    setInferring(true);
    setInferResult(null);
    setError(null);

    try {
      const result = await inferProjects();
      if (result.new_projects > 0) {
        setInferResult(
          `Found ${result.new_projects} new project${result.new_projects > 1 ? "s" : ""} from ${result.git_repos_found} git repositories`
        );
        await loadProjects();
      } else if (result.git_repos_found > 0) {
        setInferResult(
          `Scanned ${result.scanned_cwds} locations, found ${result.git_repos_found} git repos (all already tracked)`
        );
      } else {
        setInferResult(
          `Scanned ${result.scanned_cwds} locations, no git repositories found`
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to discover projects"
      );
    } finally {
      setInferring(false);
    }
  };

  return (
    <SelfDocumentingSection
      componentId={componentId}
      visible={showSelfDocs}
    >
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Projects</h2>
            <p className="text-sm text-gray-400 mt-1">
              Manage projects to organize and filter your sessions.
            </p>
            {configPath && (
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                <span>Stored in</span>
                <code className="bg-gray-700 px-1 rounded">{configPath}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(configPath)}
                  className="text-blue-400 hover:text-blue-300"
                  type="button"
                >
                  Copy path
                </button>
              </p>
            )}
            <p className="text-[10px] text-gray-600 mt-1">
              Stats from hook session metadata (token tracking not yet
              implemented)
            </p>
          </div>
          <div className="flex items-center gap-2">
            {repos.length > 0 && (
              <button
                onClick={handleDiscover}
                disabled={inferring}
                className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-sm disabled:opacity-50"
                title="Scan watcher repos and auto-create projects"
              >
                {inferring ? "Discovering..." : "Discover from Git"}
              </button>
            )}
            <button
              onClick={loadProjects}
              disabled={loading}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
            <button
              onClick={openCreateModal}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm"
            >
              New Project
            </button>
          </div>
        </div>

        {inferResult && (
          <div className="mb-4 p-3 bg-green-900/30 border border-green-700/50 rounded text-green-300 text-sm">
            {inferResult}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Projects Grid */}
        {loading && projects.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500 mb-4">
              No projects configured yet.
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleDiscover}
                disabled={inferring}
                className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded disabled:opacity-50"
              >
                {inferring ? "Discovering..." : "Discover from Git"}
              </button>
              <span className="text-gray-500">or</span>
              <button
                onClick={openCreateModal}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded"
              >
                Create Manually
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-gray-900 rounded-lg p-4 border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors"
                onClick={() => openEditModal(project)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium truncate">
                      {project.name}
                    </h3>
                    {project.description && (
                      <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                        {project.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Paths with Git Status */}
                <div className="mt-3 space-y-1.5">
                  {project.paths.slice(0, 3).map((path, i) => {
                    const repo = getRepoForPath(path);
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div
                          className="flex-1 text-xs text-gray-500 truncate font-mono"
                          title={path}
                        >
                          {path}
                        </div>
                        {repo && (
                          <div className="flex items-center gap-1.5 text-[10px] shrink-0">
                            <span className="text-gray-500">{repo.branch}</span>
                            {repo.dirty ? (
                              <span
                                className="text-yellow-400"
                                title={`${repo.staged} staged, ${repo.unstaged} modified, ${repo.untracked} untracked`}
                              >
                                {repo.staged + repo.unstaged + repo.untracked}{" "}
                                changes
                              </span>
                            ) : (
                              <span className="text-green-500">clean</span>
                            )}
                            {(repo.ahead > 0 || repo.behind > 0) && (
                              <span className="text-gray-400">
                                {repo.ahead > 0 && `↑${repo.ahead}`}
                                {repo.behind > 0 && `↓${repo.behind}`}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {project.paths.length > 3 && (
                    <div className="text-xs text-gray-600">
                      +{project.paths.length - 3} more paths
                    </div>
                  )}
                </div>

                {/* Repo Summary */}
                {(() => {
                  const stats = projectRepoStats.get(project.id);
                  if (!stats || stats.total === 0) return null;
                  return (
                    <div className="mt-2 flex items-center gap-2 text-[10px]">
                      {stats.dirty > 0 && (
                        <span className="px-1.5 py-0.5 bg-yellow-900/50 text-yellow-400 rounded">
                          {stats.dirty} dirty
                        </span>
                      )}
                      {stats.clean > 0 && (
                        <span className="px-1.5 py-0.5 bg-green-900/50 text-green-400 rounded">
                          {stats.clean} clean
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Stats - sessions only (token tracking not yet implemented) */}
                {project.session_count !== undefined &&
                  project.session_count > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500">
                      <span title="Hook sessions recorded for this project">
                        {project.session_count} session
                        {project.session_count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}

        {/* Unassigned Dirty Repos */}
        {unassignedDirtyRepos.length > 0 && (
          <div className="mt-6 bg-yellow-900/20 rounded-lg p-4 border border-yellow-700/50">
            <h3 className="text-sm font-medium text-yellow-400 mb-3">
              Unassigned Dirty Repositories ({unassignedDirtyRepos.length})
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              These repos have uncommitted changes but aren't matched to any
              project. Add their paths to a project to track them.
            </p>
            <div className="space-y-2">
              {unassignedDirtyRepos.map((repo) => (
                <div
                  key={repo.repo_id}
                  className="flex items-center gap-3 p-2 bg-gray-800/50 rounded"
                >
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm text-white truncate font-mono"
                      title={repo.path}
                    >
                      {repo.path}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                      <span>{repo.branch}</span>
                      <span className="text-yellow-400">
                        {repo.staged + repo.unstaged + repo.untracked} changes
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setFormPaths(repo.path);
                      setFormName(repo.name);
                      setFormId("");
                      setFormDescription("");
                      setEditingProject(null);
                      setIsCreating(true);
                    }}
                    className="px-2 py-1 text-xs bg-blue-600/50 hover:bg-blue-600 text-blue-200 rounded"
                  >
                    Create Project
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Edit/Create Modal */}
        {(editingProject || isCreating) && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={closeModal}
          >
            <div
              className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-lg w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-white mb-4">
                {isCreating ? "New Project" : "Edit Project"}
              </h2>

              <div className="space-y-4">
                {isCreating && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      ID (optional)
                    </label>
                    <input
                      type="text"
                      value={formId}
                      onChange={(e) => setFormId(e.target.value)}
                      placeholder="auto-generated from name"
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Leave blank to auto-generate from name
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="My Project"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Brief description of this project"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Paths (one per line)
                  </label>
                  <textarea
                    value={formPaths}
                    onChange={(e) => setFormPaths(e.target.value)}
                    placeholder="/Users/you/projects/my-project"
                    rows={4}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Sessions with working directories matching these paths will
                    be assigned to this project
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-6">
                {!isCreating && editingProject && (
                  <button
                    onClick={() => {
                      handleDelete(editingProject.id);
                      closeModal();
                    }}
                    className="px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-300 rounded text-sm"
                  >
                    Delete
                  </button>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </SelfDocumentingSection>
  );
}
