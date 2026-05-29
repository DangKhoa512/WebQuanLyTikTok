module.exports = {
  apps: [
    {
      name:        'tiktok-backend',
      script:      'src/server.js',
      instances:   'max',        // use all CPU cores
      exec_mode:   'cluster',
      watch:       false,

      // Environment
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },

      // Logging
      log_date_format:  'YYYY-MM-DD HH:mm:ss Z',
      error_file:       'logs/pm2-error.log',
      out_file:         'logs/pm2-out.log',
      merge_logs:       true,
      log_type:         'json',

      // Auto-restart on crash
      autorestart:      true,
      max_restarts:     10,
      min_uptime:       '5s',
      restart_delay:    3000,

      // Memory limit — restart if exceeds 500MB
      max_memory_restart: '500M',
    },
  ],
};
