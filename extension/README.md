# Mail Pilot + Companion (Chrome Extension)

Official Chrome Extension Companion for **MailPilot+**. Seamlessly extracts job posting metadata from any open tab, syncs external opportunities directly to your MailPilot pipeline, and generates tailored 1-page or 2-page resumes with Ace AI inside Chrome's native side panel.

---

## 🌟 Key Features

- **1-Click Tab Import**: Click **Import from Tab** to automatically extract the job title, company name, location, compensation, application URL, and description from any job board.
  - Native schema support for JSON-LD (`JobPosting` microdata).
  - Specialized heuristic extractors for **LinkedIn, Greenhouse, Lever, Ashby, Workday, Indeed, and Glassdoor**.
- **First-Level Settings Design**: Built using MailPilot's tactile UI design system (`SettingsSectionCard`, `SettingsFeatureLogo`, segmented tab rails, and signature toolbar elevation).
- **Interactive Resume Tailoring**: Tailor your resume in real time using Ace AI:
  - Toggle individual experience and project bullets on/off.
  - Reorder bullets with tactile arrow controls.
  - Inline edit any section directly.
  - Refine bullets using custom natural-language Ace AI prompts.
- **AFM Physics Pagination & Budgeting**: Auto-calculates printable page heights in real time, supporting strict **1-page**, **2-page**, or **Auto** budgets.
- **Export Anywhere**: Download publication-grade **PDF** or formatted **DOCX** files directly from the Chrome side panel.
- **Environment Switcher**: Seamless toggle between local development (`http://localhost:3000`) and production (`https://mailpilot-prod.vercel.app`) with automatic cookie session verification.

---

## 🏗️ Architecture & Tech Stack

| Layer | Technology |
|---|---|
| **Platform** | Chrome Extension Manifest V3 (Side Panel API) |
| **UI Framework** | React 19, TypeScript, Tailwind CSS |
| **Icons & Brand** | Lucide React, MailPilot Tactile UI (`components/ui/tactile`) |
| **Bundler** | Vite 8 + `@vitejs/plugin-react` |
| **Extractor** | Isolated Content Script (`extension/src/extractor.ts`) |
| **API Client** | Typed Fetch client with CORS credential headers (`credentials: "include"`) |

---

## 📦 How the Package is Created for Distribution

The distribution package is built using a two-stage compilation and archiving pipeline:

```
extension/src/ (React 19 + TS)
       │
       ▼  `vite build --config extension/vite.config.ts`
extension/dist/ (Compiled bundle + assets + manifest)
       │
       ▼  `node scripts/package-extension.mjs` (JSZip DEFLATE level 9)
├── mailpilot-extension.zip         (Root release asset)
└── public/downloads/mailpilot-extension.zip (Web direct download)
```

### Build Commands

```bash
# 1. Compile the extension to extension/dist
npm run build:extension

# 2. Package into a production ZIP archive
npm run package:extension
```

### Package Outputs & Download Links

When the pipeline runs:
1. **GitHub Release (Direct Download)**:
   - Permanently available without sign-in at:
     ```
     https://github.com/Marqlo-C/MailPilot/releases/download/companion-latest/mailpilot-extension.zip
     ```
2. **Local Release Asset (`mailpilot-extension.zip`)**: Created at repository root for manual developer testing.
3. **Web Direct Download (`/downloads/mailpilot-extension.zip`)**: Placed in Next.js's public static directory.
4. **API Streaming Endpoint (`/api/extension/download`)**: Route handler ([`app/api/extension/download/route.ts`](file:///users/marqlott/desktop/MailPilot/app/api/extension/download/route.ts)) streams `mailpilot-extension.zip`.
5. **Chrome Web Store Ready**: `mailpilot-extension.zip` contains `manifest.json` at root and can be uploaded directly to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

---

## 🚀 How to Install

### Option A: Install from GitHub Release
1. Download [`mailpilot-extension.zip`](https://github.com/Marqlo-C/MailPilot/releases/download/companion-latest/mailpilot-extension.zip) from GitHub Releases.
2. Extract the ZIP file to a folder on your computer.
3. Open Google Chrome and navigate to `chrome://extensions/`.
4. Enable **Developer mode** using the toggle in the top-right corner.
5. Click **Load unpacked** and select the extracted folder (containing `manifest.json`).
6. Click the extension icon in your Chrome toolbar to open the **Mail Pilot + Companion** side panel.

### Option B: Local Development
1. Run `npm run build:extension` or `npm run package:extension`.
2. Navigate to `chrome://extensions/`.
3. Click **Load unpacked** and choose `/path/to/MailPilot/extension/dist`.
4. To see live changes while developing, run `npm run build:extension` and click the reload icon on the extension card in `chrome://extensions`.

---

## 🔐 Authentication & Permissions

- **Permissions**:
  - `sidePanel`: Opens the interactive companion interface in the browser side panel.
  - `activeTab` & `scripting`: Extracts job listing data from the current browser tab when you click "Import from Tab".
  - `cookies`: Reads the `mp_session` cookie for local development and production to authenticate API requests.
  - `downloads`: Saves exported PDF and DOCX files to your browser downloads.
- **Security**: The extension communicates only with your configured MailPilot origin (`localhost:3000` or production). No third-party tracking or telemetry is transmitted.
