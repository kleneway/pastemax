import React from "react";
import { FileTreeMode } from "../types/FileTypes";

interface FileTreeToggleProps {
  currentMode: FileTreeMode;
  onChange: (mode: FileTreeMode) => void;
}

const fileTreeOptions = [
  { value: "none" as FileTreeMode, label: "No File Tree" },
  { value: "selected" as FileTreeMode, label: "Selected Files Only" },
  { value: "selected-with-roots" as FileTreeMode, label: "Selected + Folders" },
  { value: "complete" as FileTreeMode, label: "Complete File Tree" },
];

const FileTreeToggle = ({ currentMode, onChange }: FileTreeToggleProps): JSX.Element => {
  return (
    <div className="theme-segmented-control">
      {fileTreeOptions.map((option) => (
        <button
          key={option.value}
          className={`theme-segment ${currentMode === option.value ? "active" : ""}`}
          onClick={() => onChange(option.value)}
          title={getTooltipText(option.value)}
        >
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
};

function getTooltipText(mode: FileTreeMode): string {
  switch (mode) {
    case "none":
      return "No file tree included";
    case "selected":
      return "Include tree structure for selected files only";
    case "selected-with-roots":
      return "Include all top-level folders and selected files";
    case "complete":
      return "Include the complete file tree";
    default:
      return "";
  }
}

export default FileTreeToggle;