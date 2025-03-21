// Check for required dependencies
try {
  // Test loading key dependencies
  require("ignore");
  require("tiktoken");
  require("gpt-3-encoder");
} catch (err) {
  console.error(`\n❌ Missing dependency: ${err.message}`);
  console.error("Please run: npm install\n");
  process.exit(1);
}

const { spawn } = require("child_process");
const { platform } = require("os");

console.log("🚀 Starting development environment...");

// Set environment variable for development mode
process.env.NODE_ENV = "development";

// Default port
let vitePort = 3000;

// Start Vite dev server
console.log("📦 Starting Vite dev server...");
const viteProcess = spawn("npm", ["run", "dev"], {
  stdio: ["inherit", "pipe", "inherit"], // Pipe stdout to capture the port
  shell: platform() === "win32", // Use shell on Windows
});

// Flag to track if Vite has started
let viteStarted = false;

// Listen for Vite server ready message
viteProcess.stdout?.on("data", (data) => {
  const output = data.toString();
  console.log(output); // Echo output to console

  // Extract port from the output (e.g., "Local: http://localhost:3001/")
  const portMatch = output.match(/Local:\s+http:\/\/localhost:(\d+)/);
  if (portMatch && portMatch[1]) {
    vitePort = parseInt(portMatch[1], 10);
    console.log(`🔍 Detected Vite server running on port ${vitePort}`);
  }

  if (output.includes("Local:") && !viteStarted) {
    viteStarted = true;
    startElectron();
  }
});

// Listen for errors that might indicate port conflicts
viteProcess.stderr?.on("data", (data) => {
  const output = data.toString();
  console.error(output); // Echo error output to console

  if (output.includes("Port 3000 is already in use")) {
    console.error(
      "\n❌ Port 3000 is already in use. Try one of the following:",
    );
    console.error(
      "  1. Kill the process using port 3000: 'lsof -i :3000 | grep LISTEN' then 'kill -9 [PID]'",
    );
    console.error("  2. Change the Vite port in vite.config.ts");
    console.error("  3. Restart your computer if the issue persists\n");
  }
});

// Start Electron after a delay if Vite hasn't reported ready
setTimeout(() => {
  if (!viteStarted) {
    console.log(
      "⚠️ Vite server might not be ready yet, but starting Electron anyway...",
    );
    startElectron();
  }
}, 5000); // Wait 5 seconds before attempting to start Electron

function startElectron() {
  console.log(
    `🔌 Starting Electron app with Vite server at port ${vitePort}...`,
  );
  const electronProcess = spawn("npm", ["start"], {
    stdio: "inherit",
    shell: platform() === "win32", // Use shell on Windows
    env: {
      ...process.env,
      NODE_ENV: "development",
      ELECTRON_START_URL: `http://localhost:${vitePort}`,
    },
  });

  electronProcess.on("close", (code) => {
    console.log(`Electron process exited with code ${code}`);
    viteProcess.kill();
    process.exit(code);
  });
}

// Handle process termination
process.on("SIGINT", () => {
  viteProcess.kill();
  process.exit(0);
});

viteProcess.on("close", (code) => {
  console.log(`Vite process exited with code ${code}`);
  process.exit(code);
});
