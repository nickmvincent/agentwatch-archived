/**
 * PRINCIPLES.md Parser
 *
 * Finds and parses PRINCIPLES.md files in project directories.
 * Extracts principles that can be injected into agent prompts.
 */

import { existsSync, readFileSync, statSync } from "fs";
import { basename, dirname, join } from "path";
import type { Principle, PrinciplesFile } from "@agentwatch/core";

/** Standard locations to search for PRINCIPLES.md */
const PRINCIPLES_FILE_NAMES = [
  "PRINCIPLES.md",
  "principles.md",
  ".github/PRINCIPLES.md",
  "docs/PRINCIPLES.md"
];

/** Maximum depth to walk up directories looking for PRINCIPLES.md */
const MAX_WALK_UP_DEPTH = 10;

/**
 * Find PRINCIPLES.md file starting from the given directory.
 * Searches standard locations and walks up the directory tree.
 */
export function findPrinciplesFile(cwd: string): string | null {
  // First, check standard locations in the current directory
  for (const name of PRINCIPLES_FILE_NAMES) {
    const path = join(cwd, name);
    if (existsSync(path)) {
      return path;
    }
  }

  // Walk up the directory tree
  let currentDir = cwd;
  let depth = 0;

  while (depth < MAX_WALK_UP_DEPTH) {
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached filesystem root
      break;
    }

    for (const name of PRINCIPLES_FILE_NAMES) {
      const path = join(parentDir, name);
      if (existsSync(path)) {
        return path;
      }
    }

    currentDir = parentDir;
    depth++;
  }

  return null;
}

/**
 * Parse a PRINCIPLES.md file content into structured principles.
 *
 * Supports:
 * - Bullet points (- or *)
 * - Numbered lists
 * - Headers as categories (# or ##)
 */
export function parsePrinciplesContent(content: string): Principle[] {
  const principles: Principle[] = [];
  const lines = content.split("\n");

  let currentCategory: string | undefined;
  let principleCounter = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Detect headers as categories
    const headerMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (headerMatch) {
      currentCategory = headerMatch[1]!.trim();
      continue;
    }

    // Detect bullet points or numbered lists
    const listMatch = trimmed.match(/^(?:[-*•]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const text = listMatch[1]!.trim();

      // Generate a readable ID from the text
      const id = generatePrincipleId(text, principleCounter++);

      principles.push({
        id,
        text,
        category: currentCategory
      });
    }
  }

  return principles;
}

/**
 * Generate a unique ID for a principle based on its text.
 */
function generatePrincipleId(text: string, index: number): string {
  // Take first few words, lowercase, replace spaces with dashes
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .slice(0, 4)
    .join("-");

  // Add index suffix for uniqueness
  return `${words}-${index}`;
}

/**
 * Load and parse a PRINCIPLES.md file.
 */
export function loadPrinciplesFile(path: string): PrinciplesFile | null {
  try {
    if (!existsSync(path)) return null;

    const content = readFileSync(path, "utf-8");
    const stats = statSync(path);
    const principles = parsePrinciplesContent(content);

    return {
      path,
      principles,
      lastModified: stats.mtimeMs
    };
  } catch {
    return null;
  }
}

/**
 * Find and parse PRINCIPLES.md for a directory.
 */
export function getPrinciplesForProject(cwd: string): PrinciplesFile | null {
  const path = findPrinciplesFile(cwd);
  if (!path) return null;

  return loadPrinciplesFile(path);
}

/**
 * Build the principles injection string for a prompt.
 *
 * @param principles - Selected principle IDs
 * @param allPrinciples - All available principles
 */
export function buildPrinciplesInjection(
  selectedIds: string[],
  allPrinciples: Principle[]
): string {
  const selected = allPrinciples.filter((p) => selectedIds.includes(p.id));

  if (selected.length === 0) return "";

  // Group by category
  const byCategory = new Map<string | undefined, Principle[]>();
  for (const p of selected) {
    const cat = p.category;
    const list = byCategory.get(cat) ?? [];
    list.push(p);
    byCategory.set(cat, list);
  }

  const lines: string[] = [];

  for (const [category, principles] of byCategory) {
    if (category) {
      lines.push(`${category}:`);
    }
    for (const p of principles) {
      lines.push(`- ${p.text}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
