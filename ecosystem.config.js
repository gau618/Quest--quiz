// PM2 Configuration for Quest Quiz App
module.exports = {
  apps: [
    {
      name: 'quest-socket-server',
      script: 'tsx',
      args: 'socket-server.ts',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M', // Restart if memory exceeds 500MB
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/socket-error.log',
      out_file: './logs/socket-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Kill timeout for graceful shutdown
      kill_timeout: 5000,
      // Wait time before restart
      restart_delay: 2000,
      // Max restarts within 15 minutes before stopping
      max_restarts: 10,
      min_uptime: '10s',
    },
    {
      name: 'quest-workers',
      script: 'tsx',
      args: 'src/workers/index.ts',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      kill_timeout: 5000,
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: '10s',
    },
    {
      name: 'quest-nextjs',
      script: 'npm',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/nextjs-error.log',
      out_file: './logs/nextjs-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      kill_timeout: 5000,
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: '10s',
    }
  ]
};
