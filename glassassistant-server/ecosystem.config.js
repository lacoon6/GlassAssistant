export default {
  apps: [
    {
      name: 'glassassistant-server',
      script: './dist/app.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 3000,
      time: true,
      env_production: {
        NODE_ENV: 'production',
        TRUST_PROXY: 'true',
      },
    },
  ],
}
