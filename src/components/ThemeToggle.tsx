import React from "react";
import { useTheme } from "../context/ThemeContext";
import { Sun, Moon, Monitor } from "lucide-react";

const ThemeToggle = (): JSX.Element => {
  const { theme, setTheme } = useTheme();
  
  return (
    <div className="theme-segmented-control">
      <button
        className={`theme-segment ${theme === "light" ? "active" : ""}`}
        onClick={() => setTheme("light")}
        title="Light Mode"
      >
        <Sun size={16} />
      </button>
      <button
        className={`theme-segment ${theme === "dark" ? "active" : ""}`}
        onClick={() => setTheme("dark")}
        title="Dark Mode"
      >
        <Moon size={16} />
      </button>
      <button
        className={`theme-segment ${theme === "system" ? "active" : ""}`}
        onClick={() => setTheme("system")}
        title="Use System Settings"
      >
        <span>Auto</span>
      </button>
    </div>
  );
};

export default ThemeToggle; 