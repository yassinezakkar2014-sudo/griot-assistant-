import { defineConfig } from "vite";

// numéro de version visible dans le jeu (menu) : permet de vérifier que Render a bien la dernière mise à jour
const BUILD = new Date().toISOString().slice(0, 16).replace("T", " ");

export default defineConfig({
  define: { __BUILD__: JSON.stringify(BUILD) },
  root: ".",
  base: "./",
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
    rollupOptions: { output: { manualChunks: { three: ["three"] } } }
  }
});
