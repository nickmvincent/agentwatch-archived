/**
 * Research Profile Selector Component
 *
 * Displays research-oriented profiles with:
 * - Research questions each profile enables
 * - What data is shared vs. stripped
 * - Clear UI badges (Recommended, Requires Review)
 *
 * This is modular and easy to edit - profile definitions come from the API.
 */

import { useEffect, useState } from "react";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

// =============================================================================
// TYPES
// =============================================================================

export interface ResearchQuestion {
  question: string;
  context?: string;
}

export interface ResearchProfileData {
  id: string;
  name: string;
  tagline: string;
  description: string;
  enables_research: ResearchQuestion[];
  shared_summary: string[];
  stripped_summary: string[];
  kept_fields: string[];
  redaction_config: {
    redact_secrets: boolean;
    redact_pii: boolean;
    redact_paths: boolean;
    enable_high_entropy: boolean;
  };
  requires_review: boolean;
  ui: {
    badge?: string;
    badgeVariant?: "default" | "success" | "warning" | "danger";
    icon?: string;
  };
}

interface ResearchProfileSelectorProps {
  selectedProfileId: string;
  onSelectProfile: (profileId: string, keptFields: string[]) => void;
  onCustomClick?: () => void;
  compact?: boolean;
}

// =============================================================================
// BADGE COMPONENT
// =============================================================================

function ProfileBadge({
  badge,
  variant = "default"
}: {
  badge: string;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const variantClasses = {
    default: "bg-gray-600 text-gray-200",
    success: "bg-green-600/80 text-green-100",
    warning: "bg-amber-600/80 text-amber-100",
    danger: "bg-red-600/80 text-red-100"
  };

  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full ${variantClasses[variant]}`}
    >
      {badge}
    </span>
  );
}

// =============================================================================
// PROFILE CARD COMPONENT
// =============================================================================

function ProfileCard({
  profile,
  isSelected,
  onSelect,
  expanded,
  onToggleExpand
}: {
  profile: ResearchProfileData;
  isSelected: boolean;
  onSelect: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  return (
    <div
      className={`border rounded-lg p-3 cursor-pointer transition-all ${
        isSelected
          ? "border-blue-500 bg-blue-500/10"
          : "border-gray-600 hover:border-gray-500 bg-gray-700/30"
      }`}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-white">{profile.name}</span>
            {profile.ui?.badge && (
              <ProfileBadge
                badge={profile.ui.badge}
                variant={profile.ui.badgeVariant}
              />
            )}
          </div>
          <p className="text-sm text-gray-400 mt-0.5">{profile.tagline}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="radio"
            checked={isSelected}
            onChange={onSelect}
            className="text-blue-500"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      {/* Expandable details */}
      <button
        className="text-xs text-blue-400 hover:text-blue-300 mt-2"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
      >
        {expanded ? "Hide details" : "Show what this enables"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 text-sm">
          {/* Research questions */}
          <div>
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
              Helps researchers answer:
            </div>
            <ul className="space-y-1">
              {profile.enables_research.map((q, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span className="text-gray-300">{q.question}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* What's shared / stripped */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                Shared:
              </div>
              <ul className="text-xs text-gray-400 space-y-0.5">
                {profile.shared_summary.map((item, i) => (
                  <li key={i}>• {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                NOT shared:
              </div>
              <ul className="text-xs text-gray-400 space-y-0.5">
                {profile.stripped_summary.map((item, i) => (
                  <li key={i}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Review warning */}
          {profile.requires_review && (
            <div className="p-2 bg-amber-900/30 border border-amber-700/50 rounded text-xs text-amber-200">
              ⚠️ This profile includes content. Please review carefully before
              sharing.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ResearchProfileSelector({
  selectedProfileId,
  onSelectProfile,
  onCustomClick,
  compact: _compact = false
}: ResearchProfileSelectorProps) {
  const [profiles, setProfiles] = useState<ResearchProfileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const showSelfDocs = useSelfDocumentingVisible();

  // Fetch research profiles from API
  useEffect(() => {
    fetch("/api/contrib/research-profiles")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load research profiles");
        return res.json();
      })
      .then((data) => {
        setProfiles(data.profiles);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load research profiles:", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <SelfDocumentingSection
        componentId="analyzer.share.research-profile-selector"
        visible={showSelfDocs}
      >
        <div className="text-gray-400 text-sm p-4">Loading profiles...</div>
      </SelfDocumentingSection>
    );
  }

  if (error) {
    return (
      <SelfDocumentingSection
        componentId="analyzer.share.research-profile-selector"
        visible={showSelfDocs}
      >
        <div className="text-red-400 text-sm p-4">
          Failed to load profiles: {error}
        </div>
      </SelfDocumentingSection>
    );
  }

  return (
    <SelfDocumentingSection
      componentId="analyzer.share.research-profile-selector"
      visible={showSelfDocs}
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="text-sm text-gray-400">
          <strong className="text-white">
            What research will your contribution enable?
          </strong>
          <p className="mt-1 text-xs">
            Select a profile to see what data is shared and what research
            questions it helps answer.
          </p>
        </div>

        {/* Profile cards */}
        <div className="space-y-2">
          {profiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              isSelected={selectedProfileId === profile.id}
              onSelect={() => onSelectProfile(profile.id, profile.kept_fields)}
              expanded={expandedId === profile.id}
              onToggleExpand={() =>
                setExpandedId(expandedId === profile.id ? null : profile.id)
              }
            />
          ))}
        </div>

        {/* Custom option */}
        {onCustomClick && (
          <button
            className={`w-full border border-dashed rounded-lg p-3 text-left transition-all ${
              selectedProfileId === "custom"
                ? "border-blue-500 bg-blue-500/10"
                : "border-gray-600 hover:border-gray-500"
            }`}
            onClick={onCustomClick}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-white">Custom</span>
                <p className="text-sm text-gray-400 mt-0.5">
                  Select specific fields manually
                </p>
              </div>
              <input
                type="radio"
                checked={selectedProfileId === "custom"}
                onChange={onCustomClick}
                className="text-blue-500"
              />
            </div>
          </button>
        )}
      </div>
    </SelfDocumentingSection>
  );
}

// =============================================================================
// COMPACT VERSION (for sidebar/settings)
// =============================================================================

export function ResearchProfileSelectorCompact({
  selectedProfileId,
  onSelectProfile
}: Omit<ResearchProfileSelectorProps, "compact" | "onCustomClick">) {
  const [profiles, setProfiles] = useState<ResearchProfileData[]>([]);
  const [loading, setLoading] = useState(true);
  const showSelfDocs = useSelfDocumentingVisible();

  useEffect(() => {
    fetch("/api/contrib/research-profiles")
      .then((res) => res.json())
      .then((data) => {
        setProfiles(data.profiles);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <SelfDocumentingSection
        componentId="analyzer.share.research-profile-selector"
        visible={showSelfDocs}
        compact
        inline
      >
        <div className="text-gray-400 text-xs">Loading...</div>
      </SelfDocumentingSection>
    );
  }

  return (
    <SelfDocumentingSection
      componentId="analyzer.share.research-profile-selector"
      visible={showSelfDocs}
      compact
      inline
    >
      <div className="flex flex-wrap gap-2">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            className={`px-3 py-1.5 rounded text-sm transition-all ${
              selectedProfileId === profile.id
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
            onClick={() => onSelectProfile(profile.id, profile.kept_fields)}
            title={profile.description}
          >
            {profile.name}
            {profile.ui?.badge === "Recommended" && (
              <span className="ml-1 text-xs opacity-70">★</span>
            )}
          </button>
        ))}
      </div>
    </SelfDocumentingSection>
  );
}

export default ResearchProfileSelector;
