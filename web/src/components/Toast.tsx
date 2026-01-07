import { useEffect, useState } from "react";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
  duration?: number;
  type?: "success" | "error" | "info";
}

export function Toast({
  message,
  onDismiss,
  duration = 3000,
  type = "success"
}: ToastProps) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const showSelfDocs = useSelfDocumentingVisible();

  useEffect(() => {
    if (message) {
      setVisible(true);
      setExiting(false);

      const timer = setTimeout(() => {
        setExiting(true);
        setTimeout(() => {
          setVisible(false);
          onDismiss();
        }, 200);
      }, duration);

      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [message, duration, onDismiss]);

  if (!visible || !message) return null;

  const colors = {
    success: "bg-green-900/90 border-green-700 text-green-300",
    error: "bg-red-900/90 border-red-700 text-red-300",
    info: "bg-blue-900/90 border-blue-700 text-blue-300"
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <SelfDocumentingSection
        componentId="analyzer.settings.toast"
        visible={showSelfDocs}
        compact
      >
        <div
          className={`
            px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm
            ${colors[type]}
            transition-all duration-200
            ${exiting ? "opacity-0 translate-x-2" : "opacity-100 translate-x-0"}
          `}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm">{message}</span>
            <button
              onClick={() => {
                setExiting(true);
                setTimeout(() => {
                  setVisible(false);
                  onDismiss();
                }, 200);
              }}
              className="text-current opacity-60 hover:opacity-100 transition-opacity"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      </SelfDocumentingSection>
    </div>
  );
}
