import { defineConfig } from "vite";
import path from "path";
import fs from "fs";

export default defineConfig({
  root: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: {
      input: {
        sidepanel: path.resolve(__dirname, "sidepanel.html"),
        "service-worker": path.resolve(__dirname, "src/background/service-worker.ts"),
        extractor: path.resolve(__dirname, "src/content/extractor.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "service-worker") return "service-worker.js";
          if (chunkInfo.name === "extractor") return "extractor.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  plugins: [
    {
      name: "copy-extension-assets",
      closeBundle() {
        const distDir = path.resolve(__dirname, "dist");
        if (!fs.existsSync(distDir)) {
          fs.mkdirSync(distDir, { recursive: true });
        }

        // Copy manifest.json
        const manifestSrc = path.resolve(__dirname, "manifest.json");
        const manifestDest = path.resolve(distDir, "manifest.json");
        if (fs.existsSync(manifestSrc)) {
          fs.copyFileSync(manifestSrc, manifestDest);
        }

        // Copy icons
        const iconsSrc = path.resolve(__dirname, "icons");
        const iconsDest = path.resolve(distDir, "icons");
        if (fs.existsSync(iconsSrc)) {
          if (!fs.existsSync(iconsDest)) {
            fs.mkdirSync(iconsDest, { recursive: true });
          }
          const iconFiles = fs.readdirSync(iconsSrc);
          for (const file of iconFiles) {
            fs.copyFileSync(path.join(iconsSrc, file), path.join(iconsDest, file));
          }
        }
      },
    },
  ],
});
