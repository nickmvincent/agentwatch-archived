/**
 * Enhanced markdown renderer for documentation display.
 * Handles common markdown elements plus HTML details/summary tags.
 */

import { useMemo } from "react";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({
  content,
  className = ""
}: MarkdownRendererProps) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  const showSelfDocs = useSelfDocumentingVisible();

  return (
    <SelfDocumentingSection
      title="Markdown rendering"
      componentId="analyzer.docs.markdown-renderer"
      calculations={[
        "Custom markdown parsing with code block preservation",
        "HTML tag escaping for safety"
      ]}
      notes={[
        "Uses dangerouslySetInnerHTML after sanitizing unsupported tags."
      ]}
      visible={showSelfDocs}
    >
      <div
        className={`markdown-content ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </SelfDocumentingSection>
  );
}

function renderMarkdown(markdown: string): string {
  let html = markdown;

  // Store code blocks to prevent them from being processed
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const langLabel = lang
      ? `<span class="absolute top-2 right-3 text-xs text-gray-500 font-mono">${lang}</span>`
      : "";
    const escapedCode = code
      .trim()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const block = `<div class="relative"><pre class="bg-gray-900 rounded-lg p-4 overflow-x-auto my-4">${langLabel}<code class="text-sm font-mono text-gray-300">${escapedCode}</code></pre></div>`;
    codeBlocks.push(block);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // Store inline code to prevent processing
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const escapedCode = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    inlineCodes.push(
      `<code class="bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono text-yellow-300">${escapedCode}</code>`
    );
    return `__INLINE_CODE_${inlineCodes.length - 1}__`;
  });

  // Handle <details> and <summary> tags - convert to styled collapsible sections
  // Process content inside details blocks with basic markdown
  html = html.replace(
    /<details>\s*\n?\s*<summary>([^<]*(?:<[^>]+>[^<]*)*)<\/summary>\s*\n?([\s\S]*?)<\/details>/gi,
    (_, summary, content) => {
      // Process the content inside details with basic markdown
      let processedContent = content.trim();

      // Process lists inside details
      processedContent = processedContent.replace(
        /^- (.+)$/gm,
        '<li class="flex items-start gap-2 py-0.5"><span class="text-blue-400 mt-1">•</span><span class="flex-1">$1</span></li>'
      );
      processedContent = processedContent.replace(
        /(<li class="flex[\s\S]*?<\/li>\s*)+/g,
        (match: string) => {
          return `<ul class="space-y-0.5 my-2 text-gray-300">${match}</ul>`;
        }
      );

      // Process inline code (restore any that were placeholders)
      processedContent = processedContent.replace(
        /`([^`]+)`/g,
        (_: string, code: string) => {
          const escapedCode = code
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          return `<code class="bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono text-yellow-300">${escapedCode}</code>`;
        }
      );

      // Convert plain text lines to paragraphs (but skip if already HTML)
      processedContent = processedContent
        .split("\n\n")
        .map((block: string) => {
          const trimmed = block.trim();
          if (!trimmed) return "";
          if (/^<[a-z]/i.test(trimmed)) return block;
          return `<p class="my-2">${trimmed.replace(/\n/g, "<br />")}</p>`;
        })
        .join("\n");

      return `<details class="my-4 border border-gray-700 rounded-lg overflow-hidden">
      <summary class="bg-gray-750 px-4 py-3 cursor-pointer hover:bg-gray-700 transition-colors font-medium text-gray-200 flex items-center gap-2">
        <svg class="w-4 h-4 transition-transform details-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
        <span>${summary.replace(/<\/?strong>/gi, "")}</span>
      </summary>
      <div class="px-4 py-3 bg-gray-800/50 text-gray-300 text-sm leading-relaxed">
${processedContent}
      </div>
    </details>`;
    }
  );

  // Escape remaining HTML (after handling allowed tags)
  // But preserve our details/summary that we just created
  const detailsBlocks: string[] = [];
  html = html.replace(/<details class="my-4[\s\S]*?<\/details>/g, (match) => {
    detailsBlocks.push(match);
    return `__DETAILS_BLOCK_${detailsBlocks.length - 1}__`;
  });

  // Now escape any remaining raw HTML tags (security)
  html = html.replace(
    /<(?!\/?(details|summary|div|span|strong|em|br|hr|a|code|pre|table|thead|tbody|tr|th|td|ul|ol|li|blockquote|h[1-6]|p|svg|path)\b)[^>]*>/gi,
    (match) => {
      return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
  );

  // Restore details blocks
  detailsBlocks.forEach((block, i) => {
    html = html.replace(`__DETAILS_BLOCK_${i}__`, block);
  });

  // Headers (order matters: h6 -> h1)
  html = html.replace(
    /^###### (.+)$/gm,
    '<h6 class="text-sm font-semibold text-gray-300 mt-4 mb-2">$1</h6>'
  );
  html = html.replace(
    /^##### (.+)$/gm,
    '<h5 class="text-sm font-semibold text-gray-200 mt-4 mb-2">$1</h5>'
  );
  html = html.replace(
    /^#### (.+)$/gm,
    '<h4 class="text-base font-semibold text-white mt-5 mb-2">$1</h4>'
  );
  html = html.replace(
    /^### (.+)$/gm,
    '<h3 class="text-lg font-semibold text-white mt-6 mb-3">$1</h3>'
  );
  html = html.replace(
    /^## (.+)$/gm,
    '<h2 class="text-xl font-semibold text-white mt-8 mb-4 pb-2 border-b border-gray-700">$1</h2>'
  );
  html = html.replace(
    /^# (.+)$/gm,
    '<h1 class="text-2xl font-bold text-white mb-6">$1</h1>'
  );

  // Bold and italic (handle **bold** and *italic*, avoid conflicts)
  html = html.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="font-semibold text-white">$1</strong>'
  );
  html = html.replace(
    /(?<!\*)\*([^*]+)\*(?!\*)/g,
    '<em class="italic text-gray-300">$1</em>'
  );

  // Links - handle both internal (.md) and external links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    // For .md links, they won't work in this context, so make them visually distinct
    const isInternal = url.endsWith(".md") || url.includes(".md#");
    const linkClass = isInternal
      ? "text-blue-400 hover:underline cursor-pointer"
      : "text-blue-400 hover:underline";
    const target = isInternal ? "" : ' target="_blank" rel="noreferrer"';
    return `<a href="${url}" class="${linkClass}"${target}>${text}</a>`;
  });

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="border-gray-700 my-6" />');

  // Tables - improved handling
  const tableRegex = /(?:^\|.+\|$\n?)+/gm;
  html = html.replace(tableRegex, (tableBlock) => {
    const rows = tableBlock.trim().split("\n");
    if (rows.length < 2) return tableBlock;

    const headerCells = rows[0]
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    // Check if second row is separator
    const isSeparator =
      rows[1] &&
      rows[1]
        .split("|")
        .slice(1, -1)
        .every((c) => /^[-:]+$/.test(c.trim()));

    if (!isSeparator) return tableBlock;

    const headerHtml = headerCells
      .map(
        (cell) =>
          `<th class="px-4 py-3 text-left text-sm font-semibold text-gray-200 bg-gray-750 border-b border-gray-600">${cell}</th>`
      )
      .join("");

    const bodyRows = rows.slice(2);
    const bodyHtml = bodyRows
      .map((row) => {
        const cells = row
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());
        const cellsHtml = cells
          .map(
            (cell) =>
              `<td class="px-4 py-3 text-sm text-gray-300 border-b border-gray-700">${cell}</td>`
          )
          .join("");
        return `<tr class="hover:bg-gray-750/50">${cellsHtml}</tr>`;
      })
      .join("\n");

    return `<div class="overflow-x-auto my-4"><table class="w-full border-collapse border border-gray-700 rounded-lg overflow-hidden">
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table></div>`;
  });

  // Blockquotes - handle multi-line
  html = html.replace(
    /^> (.+)$/gm,
    '<blockquote class="border-l-4 border-blue-500 pl-4 py-1 my-3 text-gray-400 italic bg-gray-800/30 rounded-r">$1</blockquote>'
  );
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote class="[^"]*">/g, "<br />");

  // Unordered lists
  html = html.replace(/^(\s*)[-*] (.+)$/gm, (_, indent, item) => {
    const level = Math.floor(indent.length / 2);
    const marginClass = level > 0 ? `ml-${level * 6}` : "";
    return `<li class="flex items-start gap-2 py-0.5 ${marginClass}"><span class="text-blue-400 mt-1">•</span><span class="flex-1">${item}</span></li>`;
  });

  // Ordered lists
  html = html.replace(
    /^(\d+)\. (.+)$/gm,
    '<li class="flex items-start gap-2 py-0.5"><span class="text-blue-400 font-mono text-sm min-w-[1.5rem]">$1.</span><span class="flex-1">$2</span></li>'
  );

  // Wrap consecutive list items in ul
  html = html.replace(/(<li class="flex[\s\S]*?<\/li>\s*)+/g, (match) => {
    return `<ul class="space-y-0.5 my-3 text-gray-300">${match}</ul>`;
  });

  // Paragraphs - smarter handling
  const blocks = html.split("\n\n");
  html = blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      // Skip if already wrapped in HTML
      if (
        /^<(?:h[1-6]|p|ul|ol|table|div|pre|blockquote|hr|details)/i.test(
          trimmed
        )
      )
        return block;
      // Skip placeholders
      if (/^__(?:CODE_BLOCK|INLINE_CODE|DETAILS_BLOCK)_\d+__$/.test(trimmed))
        return block;
      // Wrap in paragraph
      return `<p class="text-gray-300 my-3 leading-relaxed">${trimmed.replace(/\n/g, "<br />")}</p>`;
    })
    .join("\n\n");

  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    html = html.replace(`__CODE_BLOCK_${i}__`, block);
  });

  // Restore inline code
  inlineCodes.forEach((code, i) => {
    html = html.replace(`__INLINE_CODE_${i}__`, code);
  });

  // Clean up empty paragraphs
  html = html.replace(/<p class="[^"]*">\s*<\/p>/g, "");
  html = html.replace(/<p class="[^"]*"><br \/><\/p>/g, "");

  return html;
}

// CSS for markdown content
export const markdownStyles = `
.markdown-content h1:first-child { margin-top: 0; }
.markdown-content pre { white-space: pre-wrap; word-break: break-word; }
.markdown-content table { border: 1px solid #374151; }
.markdown-content th { background: #1f2937; font-weight: 600; text-align: left; }
.markdown-content details[open] .details-arrow { transform: rotate(90deg); }
.markdown-content details summary::-webkit-details-marker { display: none; }
.markdown-content details summary::marker { display: none; }
.markdown-content details summary { list-style: none; }
`;
