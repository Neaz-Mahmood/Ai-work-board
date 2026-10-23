import React, { useState } from "react";
import "./DemoBanner.css";

const REPO_URL = "https://github.com/Neaz-Mahmood/Ai-work-board";

export function DemoBanner() {
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      const { resetDemo } = await import("../demo/backend.ts");
      await resetDemo();
    } catch (err) {
      console.error("Demo reset failed:", err);
      setIsResetting(false);
    }
  };

  return (
    <div className="demo-banner" role="status">
      <span>
        Demo: everything runs and stays in your browser.{" "}
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          Run it with your agents
        </a>
      </span>
      <button
        type="button"
        className="demo-banner-reset"
        onClick={handleReset}
        disabled={isResetting}
      >
        {isResetting ? "Resetting..." : "Reset demo"}
      </button>
    </div>
  );
}
