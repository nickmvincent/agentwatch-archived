/**
 * Conversation metadata store (persistent conversation names).
 *
 * Stores user-defined conversation names on disk so they survive restarts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import type {
  ConversationMetadata,
  ConversationMetadataInput,
  ConversationMetadataStore
} from "@agentwatch/core";

const STORE_PATH = "~/.agentwatch/conversation-metadata.json";

function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function getConversationMetadataStorePath(): string {
  return expandPath(STORE_PATH);
}

export function loadConversationMetadataStore(): ConversationMetadataStore {
  const path = getConversationMetadataStorePath();
  if (!existsSync(path)) {
    return {
      metadata: {},
      updatedAt: new Date().toISOString(),
      version: 1
    };
  }

  try {
    const data = JSON.parse(readFileSync(path, "utf-8")) as Partial<
      ConversationMetadataStore
    >;
    return {
      metadata: data.metadata ?? {},
      updatedAt: data.updatedAt ?? new Date().toISOString(),
      version: data.version ?? 1
    };
  } catch {
    return {
      metadata: {},
      updatedAt: new Date().toISOString(),
      version: 1
    };
  }
}

export function saveConversationMetadataStore(
  store: ConversationMetadataStore
): void {
  const path = getConversationMetadataStorePath();
  ensureDir(path);
  store.updatedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(store, null, 2));
}

export function getAllConversationMetadata(): Record<
  string,
  ConversationMetadata
> {
  const store = loadConversationMetadataStore();
  return store.metadata;
}

export function getConversationMetadata(
  conversationId: string
): ConversationMetadata | null {
  const store = loadConversationMetadataStore();
  return store.metadata[conversationId] ?? null;
}

export function setConversationMetadata(
  conversationId: string,
  input: ConversationMetadataInput
): ConversationMetadata {
  const store = loadConversationMetadataStore();
  const now = new Date().toISOString();
  const existing = store.metadata[conversationId];

  const metadata: ConversationMetadata = {
    conversationId,
    customName:
      input.customName === null ? undefined : input.customName?.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  store.metadata[conversationId] = metadata;
  saveConversationMetadataStore(store);
  return metadata;
}

export function deleteConversationMetadata(conversationId: string): boolean {
  const store = loadConversationMetadataStore();
  if (!store.metadata[conversationId]) {
    return false;
  }

  delete store.metadata[conversationId];
  saveConversationMetadataStore(store);
  return true;
}
