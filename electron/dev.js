// Check for required dependencies
try {
  // Test loading key dependencies
  require('ignore');
  require('tiktoken');
} catch (err) {
  console.error(`\n❌ Missing dependency: ${err.message}`);
  console.error('Please run: npm install\n');
  process.exit(1);
}

const { spawn } = require('child_process');
const { platform } = require('os');

console.log('🚀 Starting development environment...');

// Set environment variable for development mode
process.env.NODE_ENV = 'development';

// Default port (Vite's default)
let vitePort = 5173;

// Start Vite dev server
console.log('📦 Starting Vite dev server...');
const viteProcess = spawn('npm', ['run', 'dev'], {
  stdio: ['inherit', 'pipe', 'inherit'], // Pipe stdout to capture the port
  shell: platform() === 'win32', // Use shell on Windows
});

// Flag to track if Vite has started
let viteStarted = false;

// Listen for Vite server ready message
viteProcess.stdout?.on('data', (data) => {
  const output = data.toString();
  console.log(output); // Echo output to console

  // Extract port from Vite output - improved regex to handle Unicode characters
  const portMatch = output.match(/Local.*?http:\/\/localhost:(\d+)/);
  if (portMatch && portMatch[1]) {
    vitePort = parseInt(portMatch[1], 10);
    console.log(`🔍 Detected Vite server running on port ${vitePort}`);
  }
  
  // Alternative extraction method if main regex fails
  if (output.includes('localhost:') && !portMatch) {
    const simpleMatch = output.match(/localhost:(\d+)/);
    if (simpleMatch && simpleMatch[1]) {
      vitePort = parseInt(simpleMatch[1], 10);
      console.log(`🔍 Detected Vite server running on port ${vitePort} (alternative method)`);
    }
  }

  // Check for Vite ready indicators (more robust)
  if ((output.includes('Local:') || output.includes('ready in') || output.includes('localhost:')) && !viteStarted) {
    viteStarted = true;
    console.log('🎯 Vite server detected as ready, starting Electron...');
    startElectron(vitePort);
  }
});

// Listen for errors that might indicate port conflicts
viteProcess.stderr?.on('data', (data) => {
  const output = data.toString();
  console.error(output); // Echo error output to console

  if (output.includes('Port 5173 is already in use') || output.includes('already in use')) {
    console.error('\n❌ Vite port is already in use. Try one of the following:');
    console.error(
      "  1. Kill the process using the port: 'lsof -i :5173 | grep LISTEN' then 'kill -9 [PID]'"
    );
    console.error('  2. Change the Vite port in vite.config.ts');
    console.error('  3. Restart your computer if the issue persists\n');
  }
});

// Start Electron after a delay if Vite hasn't reported ready
setTimeout(() => {
  if (!viteStarted) {
    console.log('⚠️ Vite server might not be ready yet, but starting Electron anyway...');
    startElectron(vitePort);
  }
}, 5000); // Wait 5 seconds before attempting to start Electron

function startElectron(port = vitePort) {
  console.log(`🔌 Starting Electron app with Vite server at port ${port}...`);
  const electronProcess = spawn('npm', ['start'], {
    stdio: 'inherit',
    shell: platform() === 'win32', // Use shell on Windows
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ELECTRON_START_URL: `http://localhost:${port}`,
    },
  });

  electronProcess.on('close', (code) => {
    console.log(`Electron process exited with code ${code}`);
    viteProcess.kill();
    process.exit(code);
  });
}

// Handle process termination
process.on('SIGINT', () => {
  viteProcess.kill();
  process.exit(0);
});

viteProcess.on('close', (code) => {
  console.log(`Vite process exited with code ${code}`);
  process.exit(code);
});
