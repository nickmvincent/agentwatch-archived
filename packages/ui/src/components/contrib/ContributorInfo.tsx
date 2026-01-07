/**
 * ContributorInfo - Contributor metadata and attestations panel.
 */

import { HELP_CONTENT, HelpIcon } from "../HelpText";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "../SelfDocumentingSection";
import { AIPreferenceWizard } from "./AIPreferenceWizard";

export interface ContributorInfoProps {
  contributorId: string;
  license: string;
  aiPreference: string;
  onContributorIdChange: (value: string) => void;
  onLicenseChange: (value: string) => void;
  onAiPreferenceChange: (value: string) => void;
  rightsConfirmed: boolean;
  reviewedConfirmed: boolean;
  onRightsConfirmedChange: (value: boolean) => void;
  onReviewedConfirmedChange: (value: boolean) => void;
}

export function ContributorInfo({
  contributorId,
  license,
  aiPreference,
  onContributorIdChange,
  onLicenseChange,
  onAiPreferenceChange,
  rightsConfirmed,
  reviewedConfirmed,
  onRightsConfirmedChange,
  onReviewedConfirmedChange
}: ContributorInfoProps) {
  const showSelfDocs = useSelfDocumentingVisible();
  const licenseInfo =
    HELP_CONTENT.licenses[license as keyof typeof HELP_CONTENT.licenses];

  return (
    <SelfDocumentingSection
      componentId="static.share.contributor-info"
      visible={showSelfDocs}
    >
      <div className="p-3 bg-gray-700/30 rounded space-y-3">
        <div className="text-sm font-medium text-white">Contributor Info</div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">
              Username (optional)
            </label>
            <input
              type="text"
              placeholder="your-username"
              value={contributorId}
              onChange={(e) => onContributorIdChange(e.target.value)}
              className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-white text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1 flex items-center gap-1">
              License
              {licenseInfo && (
                <HelpIcon
                  tooltip={
                    <>
                      <strong>{licenseInfo.name}</strong>
                      <p className="mt-1">{licenseInfo.description}</p>
                      <a
                        href={licenseInfo.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:underline block mt-1"
                      >
                        Learn more →
                      </a>
                    </>
                  }
                />
              )}
            </label>
            <select
              value={license}
              onChange={(e) => onLicenseChange(e.target.value)}
              className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-white text-xs"
            >
              <option value="CC-BY-4.0">CC-BY-4.0 (Attribution)</option>
              <option value="CC-BY-SA-4.0">CC-BY-SA-4.0 (ShareAlike)</option>
              <option value="CC0-1.0">CC0 (Public Domain)</option>
            </select>
          </div>
        </div>

        {/* AI Preference */}
        <AIPreferenceWizard
          value={aiPreference}
          onChange={onAiPreferenceChange}
        />

        {/* Attestations */}
        <div className="space-y-2 text-xs">
          <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={rightsConfirmed}
              onChange={(e) => onRightsConfirmedChange(e.target.checked)}
              className="rounded"
            />
            <span>I have the rights to share this content</span>
            <HelpIcon tooltip={HELP_CONTENT.attestations.rights} />
          </label>
          <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={reviewedConfirmed}
              onChange={(e) => onReviewedConfirmedChange(e.target.checked)}
              className="rounded"
            />
            <span>I have reviewed the sanitized output</span>
            <HelpIcon tooltip={HELP_CONTENT.attestations.reviewed} />
          </label>
        </div>
      </div>
    </SelfDocumentingSection>
  );
}
