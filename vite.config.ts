import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
    rollupOptions: { output: { manualChunks: { three: ["three"] } } }
  }
});
