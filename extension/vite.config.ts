import { defineConfig, build } from "vite";
import path from "path";
import fs from "fs";

export default defineConfig({
  root: path.resolve(__dirname),
  esbuild: {
    jsx: "automatic",
    include: /\.[jt]sx?$/,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".."),
    },
  },
  css: {
    postcss: path.resolve(__dirname, "../postcss.config.mjs"),
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: {
      input: {
        sidepanel: path.resolve(__dirname, "sidepanel.html"),
        "service-worker": path.resolve(__dirname, "src/background/service-worker.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "service-worker") return "service-worker.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  plugins: [
    {
      name: "build-content-script-iife",
      async closeBundle() {
        // Content scripts in Manifest V3 do not support ES modules / import statements.
        // They must be bundled as an isolated, self-contained IIFE without code splitting.
        await build({
          configFile: false,
          resolve: {
            alias: {
              "@": path.resolve(__dirname, ".."),
            },
          },
          build: {
            outDir: path.resolve(__dirname, "dist"),
            emptyOutDir: false,
            lib: {
              entry: path.resolve(__dirname, "src/content/extractor.ts"),
              formats: ["iife"],
              name: "MailPilotExtractor",
              fileName: () => "extractor.js",
            },
          },
        });
      },
    },
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

        // Copy fonts
        const fontsSrc = path.resolve(__dirname, "../public/fonts");
        const fontsDest = path.resolve(distDir, "fonts");
        if (fs.existsSync(fontsSrc)) {
          if (!fs.existsSync(fontsDest)) {
            fs.mkdirSync(fontsDest, { recursive: true });
          }
          const fontFiles = fs.readdirSync(fontsSrc);
          for (const file of fontFiles) {
            fs.copyFileSync(path.join(fontsSrc, file), path.join(fontsDest, file));
          }
        }

        // Copy logos
        const logosSrc = path.resolve(__dirname, "../public/logos");
        const logosDest = path.resolve(distDir, "logos");
        if (fs.existsSync(logosSrc)) {
          if (!fs.existsSync(logosDest)) {
            fs.mkdirSync(logosDest, { recursive: true });
          }
          const logoFiles = fs.readdirSync(logosSrc);
          for (const file of logoFiles) {
            fs.copyFileSync(path.join(logosSrc, file), path.join(logosDest, file));
          }
        }
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
