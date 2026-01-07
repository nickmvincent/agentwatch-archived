/**
 * FieldSelector - Field selection panel with category grouping and privacy threat info.
 */

import type { FieldSchema } from "@agentwatch/pre-share";
import { useMemo } from "react";
import type { FieldSchemasResult } from "../../adapters/types";
import { HELP_CONTENT, HelpIcon, Tooltip } from "../HelpText";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "../SelfDocumentingSection";
import { getFieldThreatInfo } from "./utils";

export interface FieldSelectorProps {
  schemas: FieldSchemasResult | null;
  selectedFields: Set<string>;
  fieldsPresent: Set<string>;
  onToggle: (path: string) => void;
}

export function FieldSelector({
  schemas,
  selectedFields,
  fieldsPresent,
  onToggle
}: FieldSelectorProps) {
  if (!schemas) return null;
  const showSelfDocs = useSelfDocumentingVisible();

  const groupedFields = useMemo(() => {
    const groups: Record<string, FieldSchema[]> = {
      essential: [],
      recommended: [],
      optional: []
    };

    for (const field of schemas.fields) {
      const category = field.category || "optional";
      if (groups[category]) {
        // Filter to only show fields that exist in the data
        if (fieldsPresent.size === 0) {
          groups[category].push(field);
        } else {
          const normalizedField = field.path.replace(/\[\]/g, "");
          const exists = Array.from(fieldsPresent).some((presentPath) => {
            const normalizedPresent = presentPath.replace(/\[\]/g, "");
            return (
              normalizedPresent.includes(normalizedField) ||
              normalizedField.includes(normalizedPresent)
            );
          });
          if (exists) groups[category].push(field);
        }
      }
    }

    return groups;
  }, [schemas, fieldsPresent]);

  return (
    <SelfDocumentingSection
      title="Field selector"
      componentId="static.share.field-selector"
      notes={[
        "Groups fields by category and highlights privacy risks.",
        "Essential fields are always included."
      ]}
      visible={showSelfDocs}
    >
      <div className="p-3 bg-gray-900/50 rounded">
        <div className="text-sm font-medium text-gray-300 mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2">
            Fields ({selectedFields.size})
            <HelpIcon tooltip={HELP_CONTENT.fieldCategories} />
          </span>
          {fieldsPresent.size > 0 && (
            <span className="text-xs text-gray-500">
              Showing fields present in data
            </span>
          )}
        </div>
        <div className="space-y-2">
          {(["essential", "recommended", "optional"] as const).map(
            (category) => {
              const fields = groupedFields[category] ?? [];
              if (fields.length === 0) return null;

              return (
                <div key={category}>
                  <span className="text-xs text-gray-500 capitalize">
                    {category}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {fields?.map((field) => {
                      const threatInfo = getFieldThreatInfo(field.path);
                      const button = (
                        <button
                          key={field.path}
                          onClick={() =>
                            category !== "essential" && onToggle(field.path)
                          }
                          disabled={category === "essential"}
                          className={`px-1.5 py-0.5 text-xs rounded flex items-center gap-1 ${
                            selectedFields.has(field.path)
                              ? "bg-blue-600 text-white"
                              : "bg-gray-700 text-gray-400"
                          } ${category === "essential" ? "opacity-60" : "cursor-pointer hover:opacity-80"}`}
                        >
                          {field.label}
                          {threatInfo && (
                            <span
                              className="text-yellow-400 text-[10px]"
                              title="Privacy consideration"
                            >
                              !
                            </span>
                          )}
                        </button>
                      );

                      if (threatInfo) {
                        return (
                          <Tooltip
                            key={field.path}
                            content={
                              <>
                                <strong>{field.label}</strong>
                                <p className="mt-1 text-gray-300">
                                  {field.description}
                                </p>
                                <p className="mt-1 text-yellow-300">
                                  ⚠️ {threatInfo}
                                </p>
                              </>
                            }
                          >
                            {button}
                          </Tooltip>
                        );
                      }

                      return (
                        <Tooltip
                          key={field.path}
                          content={
                            <>
                              <strong>{field.label}</strong>
                              <p className="mt-1 text-gray-300">
                                {field.description}
                              </p>
                            </>
                          }
                        >
                          {button}
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              );
            }
          )}
        </div>
      </div>
    </SelfDocumentingSection>
  );
}
