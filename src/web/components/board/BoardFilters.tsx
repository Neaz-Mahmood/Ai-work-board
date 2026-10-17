import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { Actor, Feature } from "../../../shared/types.ts";
import { ActorAvatar } from "../ActorAvatar.tsx";
import { FeatureLabel } from "../FeatureLabel.tsx";
import "./BoardFilters.css";

export type BoardFiltersProps = {
  actors: Actor[];
  features: Feature[];
};

function SearchIcon() {
  return (
    <svg
      className="board-filter-search-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function UnassignedIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function BoardFilters({ actors, features }: BoardFiltersProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const qParam = searchParams.get("q") || "";
  const featureParam = searchParams.get("feature") || "";
  const assigneeParam = searchParams.get("assignee") || "";

  const activeFeatures = useMemo(() => {
    if (!featureParam) return new Set<string>();
    return new Set(featureParam.split(",").map((s) => s.trim()).filter(Boolean));
  }, [featureParam]);

  const activeAssignees = useMemo(() => {
    if (!assigneeParam) return new Set<string>();
    return new Set(assigneeParam.split(",").map((s) => s.trim()).filter(Boolean));
  }, [assigneeParam]);

  const isFiltered = Boolean(qParam || activeFeatures.size > 0 || activeAssignees.size > 0);

  const [inputValue, setInputValue] = useState(qParam);

  useEffect(() => {
    setInputValue(qParam);
  }, [qParam]);

  useEffect(() => {
    const handler = setTimeout(() => {
      const trimmed = inputValue.trim();
      if (trimmed !== qParam) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            if (trimmed) {
              next.set("q", trimmed);
            } else {
              next.delete("q");
            }
            return next;
          },
          { replace: true }
        );
      }
    }, 250);

    return () => clearTimeout(handler);
  }, [inputValue, qParam, setSearchParams]);

  const toggleFeature = (featureToken: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const currentParam = next.get("feature") || "";
        const currentSet = new Set(
          currentParam.split(",").map((s) => s.trim()).filter(Boolean)
        );

        if (currentSet.has(featureToken)) {
          currentSet.delete(featureToken);
        } else {
          currentSet.add(featureToken);
        }

        if (currentSet.size > 0) {
          next.set("feature", Array.from(currentSet).join(","));
        } else {
          next.delete("feature");
        }
        return next;
      },
      { replace: true }
    );
  };

  const toggleAssignee = (actorToken: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const currentParam = next.get("assignee") || "";
        const currentSet = new Set(
          currentParam.split(",").map((s) => s.trim()).filter(Boolean)
        );

        if (currentSet.has(actorToken)) {
          currentSet.delete(actorToken);
        } else {
          currentSet.add(actorToken);
        }

        if (currentSet.size > 0) {
          next.set("assignee", Array.from(currentSet).join(","));
        } else {
          next.delete("assignee");
        }
        return next;
      },
      { replace: true }
    );
  };

  const handleClearFilters = () => {
    setInputValue("");
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("q");
        next.delete("feature");
        next.delete("assignee");
        return next;
      },
      { replace: true }
    );
  };

  return (
    <div className="board-filters">
      <div className="board-filter-search">
        <SearchIcon />
        <input
          type="text"
          className="board-filter-search-input"
          placeholder="Search board"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          aria-label="Search board"
        />
      </div>

      <div className="board-filter-assignees" role="group" aria-label="Assignees">
        {actors.map((actor) => {
          const isSelected = activeAssignees.has(actor.name);
          return (
            <button
              key={actor.name}
              type="button"
              className={`filter-avatar-btn ${isSelected ? "selected" : ""}`.trim()}
              onClick={() => toggleAssignee(actor.name)}
              aria-pressed={isSelected}
              title={actor.name}
              aria-label={actor.name}
            >
              <ActorAvatar name={actor.name} actors={actors} />
            </button>
          );
        })}
        <button
          type="button"
          className={`filter-avatar-btn unassigned ${activeAssignees.has("none") ? "selected" : ""}`.trim()}
          onClick={() => toggleAssignee("none")}
          aria-pressed={activeAssignees.has("none")}
          title="Unassigned"
          aria-label="Unassigned"
        >
          <div className="actor-avatar unassigned-avatar" title="Unassigned" aria-label="Unassigned">
            <UnassignedIcon />
          </div>
        </button>
      </div>

      <div className="board-filter-features" role="group" aria-label="Features">
        {features.map((feature) => {
          const isSelected = activeFeatures.has(String(feature.id));
          return (
            <button
              key={feature.id}
              type="button"
              className={`filter-feature-chip ${isSelected ? "selected" : ""}`.trim()}
              onClick={() => toggleFeature(String(feature.id))}
              aria-pressed={isSelected}
            >
              <FeatureLabel feature={feature} />
            </button>
          );
        })}
        <button
          type="button"
          className={`filter-feature-chip ${activeFeatures.has("none") ? "selected" : ""}`.trim()}
          onClick={() => toggleFeature("none")}
          aria-pressed={activeFeatures.has("none")}
        >
          <FeatureLabel name="No feature" color="#626F86" />
        </button>
      </div>

      {isFiltered && (
        <button
          type="button"
          className="board-filters-clear-btn"
          onClick={handleClearFilters}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
