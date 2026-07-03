// PM2 Ecosystem Configuration
// Kullanım: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
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
      // Log dosyaları
      error_file: "./logs/daemon-error.log",
      out_file: "./logs/daemon-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // Bellek limiti: 512MB aşarsa yeniden başlat
      max_memory_restart: "512M",
    },
  ],
};
