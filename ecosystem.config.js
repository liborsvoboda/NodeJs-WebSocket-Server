module.exports = {
  apps: [
      {
          name: "COMMUNICATOR",
          cwd: "/root/komunikator/",
          script: "./server.js",
          "interpreter_args": "--max_old_space_size=16384",
          "node_args": "--expose-gc --always-compact",
          watch: ["./server.js"],
          ignore_watch: ["node_modules"],
          watch_options: {
              "followSymlinks": false
          },
          env: {
              "NODE_ENV": "development"
          },
          env_production: {
              "NODE_ENV": "production"
          }
      }
  ]
}
