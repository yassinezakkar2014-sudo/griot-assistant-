import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  base: "./",
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
    rollupOptions: { output: { manualChunks: { three: ["three"] } } }
  }
});
