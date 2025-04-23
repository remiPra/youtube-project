import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

import vue from "@vitejs/plugin-vue";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    proxy: {
      "/youtube": "http://localhost:5000",
      "/transcribe": "http://localhost:5000",
      "/process_input": "http://localhost:5000",
      "/start_conversation": "http://localhost:5000",
      "/audio": "http://localhost:5000",
    },
  },
});
