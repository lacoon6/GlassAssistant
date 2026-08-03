module.exports = {
  apps: [
    {
      name: 'glassassistant-server',
      script: './dist/app.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 3000,
      time: true,
      env: {
        NODE_ENV: 'production',
        TRUST_PROXY: 'true',
        PORT: '3100',
      },
    },
  ],
}
