// PM2 Ecosystem Configuration
// Kullanım: pm2 start ecosystem.config.cjs
const path = require("path");

module.exports = {
  apps: [
    // 1. Trading Bot — Daemon
    {
      name: "algo-daemon",
      script: "./node_modules/.bin/tsx",
      args: "src/scripts/daemon-trader.ts",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 10000,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
      error_file: "./logs/daemon-error.log",
      out_file: "./logs/daemon-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_memory_restart: "512M",
    },
    // 2. Dashboard — Next.js Production
    {
      name: "algo-dashboard",
      script: "npm",
      args: "run start -- -p 3000",
      cwd: path.join(__dirname, "dashboard"),
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 5000,
      watch: false,
      env: {
        NODE_ENV: "production",
        HOSTNAME: "0.0.0.0",
      },
      error_file: "./logs/dashboard-error.log",
      out_file: "./logs/dashboard-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_memory_restart: "512M",
    },
  ],
};
