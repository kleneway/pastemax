#!/usr/bin/env node

/**
 * This script helps fix dependency issues in the packaged Electron app
 * by ensuring all required modules are properly copied to the application directory.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🔧 PasteMax Dependency Fixer");
console.log("============================");

// Define the dependencies we need to ensure are installed
const criticalDependencies = ["ignore", "tiktoken", "gpt-3-encoder"];

// Get the application path (platform-dependent)
function getAppResourcesPath() {
  const platform = process.platform;
  let appPath;

  try {
    if (platform === "darwin") {
      // macOS
      const homeDir = process.env.HOME;
      const appDir =
        "/Applications/PasteMax.app/Contents/Resources/app.asar.unpacked";
      appPath = path.join(appDir, "node_modules");
    } else if (platform === "win32") {
      // Windows
      const programFiles = process.env["ProgramFiles"];
      appPath = path.join(
        programFiles,
        "PasteMax",
        "resources",
        "app.asar.unpacked",
        "node_modules",
      );
    } else {
      // Linux
      appPath = "/usr/lib/pastemax/resources/app.asar.unpacked/node_modules";
    }

    return appPath;
  } catch (err) {
    console.error("❌ Could not determine application path:", err.message);
    return null;
  }
}

// Ensure dependencies are installed properly
function fixDependencies() {
  try {
    // First, check if we're in the right directory
    if (!fs.existsSync("./package.json")) {
      console.error(
        "❌ Error: package.json not found! Please run this script from the PasteMax source directory.",
      );
      process.exit(1);
    }

    // Install required dependencies
    console.log("📦 Installing dependencies locally...");
    execSync("npm install ignore tiktoken gpt-3-encoder --no-save", {
      stdio: "inherit",
    });

    // Build the app with the asar.unpacked option
    console.log("🔄 Updating package.json build configuration...");

    // Read package.json
    const packageJson = JSON.parse(fs.readFileSync("./package.json", "utf8"));

    // Update build configuration
    if (!packageJson.build) {
      packageJson.build = {};
    }

    packageJson.build.asarUnpack = [
      "node_modules/ignore/**",
      "node_modules/tiktoken/**",
      "node_modules/gpt-3-encoder/**",
    ];

    // Write updated package.json
    fs.writeFileSync("./package.json", JSON.stringify(packageJson, null, 2));

    console.log("✅ package.json updated with asarUnpack configuration");
    console.log("");
    console.log("🚀 Build your app with:");
    console.log("npm run build-electron && npm run dist");
    console.log("");
    console.log(
      "This will create a distributable that correctly includes the critical dependencies.",
    );
  } catch (err) {
    console.error("❌ Error fixing dependencies:", err.message);
  }
}

// Run the main function
fixDependencies();
