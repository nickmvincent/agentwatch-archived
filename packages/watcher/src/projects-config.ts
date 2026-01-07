/**
 * Project configuration stored in analyzer/shared config TOML.
 *
 * Watcher edits the same projects list as analyzer by updating
 * [[projects]] sections in analyzer.toml or config.toml.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

export interface ProjectConfig {
  id: string;
  name: string;
  paths: string[];
  description?: string;
}

const ANALYZER_PATH = join(homedir(), ".config", "agentwatch", "analyzer.toml");
const SHARED_PATH = join(homedir(), ".config", "agentwatch", "config.toml");

function getConfigPath(): string {
  if (existsSync(ANALYZER_PATH)) return ANALYZER_PATH;
  if (existsSync(SHARED_PATH)) return SHARED_PATH;
  return ANALYZER_PATH;
}

export function getProjectsConfigPath(): string {
  return getConfigPath();
}

function parseProjects(content: string): ProjectConfig[] {
  const projects: ProjectConfig[] = [];

  // Match [[projects]] sections - stop at next section header or end of file
  // Use \n\[ to avoid matching [ inside values like paths = [...]
  const projectsMatch = content.match(
    /\[\[projects(?:\.projects)?\]\][\s\S]*?(?=\n\[(?!\[)|\n\[\[|$)/g
  );

  if (!projectsMatch) return projects;

  for (const section of projectsMatch) {
    const idMatch = section.match(/id\s*=\s*"([^"]+)"/);
    const nameMatch = section.match(/name\s*=\s*"([^"]+)"/);
    const descMatch = section.match(/description\s*=\s*"([^"]+)"/);
    const pathsMatch = section.match(/paths\s*=\s*\[(.*?)\]/s);

    const id = idMatch?.[1];
    const name = nameMatch?.[1];
    const pathsRaw = pathsMatch?.[1];

    if (!id || !name || !pathsRaw) continue;

    const paths = pathsRaw
      .split(",")
      .map((p) => p.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);

    projects.push({
      id,
      name,
      paths,
      description: descMatch?.[1]
    });
  }

  return projects;
}

export function loadProjects(): ProjectConfig[] {
  const path = getConfigPath();
  if (!existsSync(path)) return [];

  try {
    const content = readFileSync(path, "utf-8");
    return parseProjects(content);
  } catch {
    return [];
  }
}

function stripProjects(content: string): string {
  return content.replace(
    /\n?\[\[projects(?:\.projects)?\]\][\s\S]*?(?=\n\[\[|\n\[(?!\[)|$)/g,
    ""
  );
}

export function saveProjects(projects: ProjectConfig[]): void {
  const path = getConfigPath();
  let content = "";

  if (existsSync(path)) {
    content = readFileSync(path, "utf-8");
    content = stripProjects(content).trimEnd();
  }

  const lines: string[] = [];
  if (content) {
    lines.push(content);
  }

  for (const project of projects) {
    lines.push("");
    lines.push("[[projects]]");
    lines.push(`id = "${project.id}"`);
    lines.push(`name = "${project.name}"`);
    lines.push(`paths = [${project.paths.map((p) => `"${p}"`).join(", ")}]`);
    if (project.description) {
      lines.push(`description = "${project.description}"`);
    }
  }

  const out = lines.join("\n").trimStart();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, out ? out + "\n" : "");
}

export function addProject(project: ProjectConfig): void {
  const projects = loadProjects();
  projects.push(project);
  saveProjects(projects);
}

export function updateProject(
  projectId: string,
  updates: Partial<ProjectConfig>
): boolean {
  const projects = loadProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) return false;

  Object.assign(project, updates);
  saveProjects(projects);
  return true;
}

export function removeProject(projectId: string): boolean {
  const projects = loadProjects();
  const index = projects.findIndex((p) => p.id === projectId);
  if (index === -1) return false;

  projects.splice(index, 1);
  saveProjects(projects);
  return true;
}
