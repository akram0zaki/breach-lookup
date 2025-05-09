module.exports = {
  apps: [
    {
      name: 'breach-lookup',
      script: 'server.js',
      interpreter: 'bash',
      interpreter_args: '-c "nice -n 10 ionice -c2 -n7 node server.js"',
      autorestart: true,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm Z'
    }
  ]
};
