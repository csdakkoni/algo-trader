// PM2 Ecosystem Configuration
// Dashboard → Vercel'de çalışıyor
// Kullanım: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    // 1. BIST Trading Bot
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
    // 2. Crypto Trading Bot — 7/24
    {
      name: "crypto-daemon",
      script: "./node_modules/.bin/tsx",
      args: "src/scripts/crypto-daemon.ts",
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
      error_file: "./logs/crypto-error.log",
      out_file: "./logs/crypto-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_memory_restart: "512M",
    },
  ],
};
