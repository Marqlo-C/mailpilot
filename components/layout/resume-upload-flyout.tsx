"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CloudUpload,
  FileText,
  FolderGit2,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  applyResumeUpload,
  getDevCachedResumeInfo,
  importGitHubProjects,
} from "@/app/actions/profile";
import { FLYOUT_FIELD_CLASS, FLYOUT_LABEL_CLASS } from "@/components/layout/sidebar-flyout-chrome";
import { getDevOllamaModelOverride } from "@/components/settings/ai-models";
import { WaveToggle } from "@/components/ui/tactile/wave-toggle";
import type { DevCachedResumeMetadata } from "@/lib/profile/dev-resume-cache";
import { cn } from "@/lib/utils";

const FILE_ACCEPT =
  ".pdf,.docx,.txt,.zip,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip,application/x-zip-compressed,text/plain";

const ACTION_BTN_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 text-[12px] font-medium text-[#e4f7f3]/80 transition-colors hover:bg-white/10 hover:text-[#e4f7f3] disabled:pointer-events-none disabled:opacity-40";

const PRIMARY_BTN_CLASS =
  "inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[hsl(var(--sidebar-highlight))] px-3 text-[13px] font-medium text-[#e4f7f3] transition-colors hover:bg-white/15 disabled:pointer-events-none disabled:opacity-40";

/**
 * Compact sidebar flyout — same staging choices as {@link ResumeUploadDialog}.
 */
export function ResumeUploadFlyout({ accountId }: { accountId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDev = process.env.NODE_ENV === "development";
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [githubInput, setGithubInput] = useState("");
  const [overwriteAll, setOverwriteAll] = useState(false);
  const [forceReinfer, setForceReinfer] = useState(false);
  const [cachedResume, setCachedResume] =
    useState<DevCachedResumeMetadata | null>(null);
  const [useCachedResume, setUseCachedResume] = useState(false);
  const [loadingCacheInfo, setLoadingCacheInfo] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!isDev) return;
    let cancelled = false;
    setLoadingCacheInfo(true);
    void getDevCachedResumeInfo(accountId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.data) {
          setCachedResume(res.data);
          if (res.data.githubHandle) {
            setGithubInput((current) => current || res.data!.githubHandle || "");
          }
        } else {
          setCachedResume(null);
        }
      })
      .catch(() => {
        if (!cancelled) setCachedResume(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingCacheInfo(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, isDev]);

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    setSelectedFile(file);
    setUseCachedResume(false);
  }

  function clearStagedFile() {
    setSelectedFile(null);
    setUseCachedResume(false);
    setForceReinfer(false);
  }

  function resetForm() {
    setSelectedFile(null);
    setGithubInput("");
    setOverwriteAll(false);
    setForceReinfer(false);
    setUseCachedResume(false);
  }

  function handleSubmit() {
    if (!selectedFile && !(useCachedResume && cachedResume)) return;

    const formData = new FormData();
    formData.append("accountId", accountId);
    if (selectedFile) {
      formData.append("file", selectedFile);
    } else if (useCachedResume && cachedResume) {
      formData.append("useDevCachedResume", "true");
    }

    const trimmedGithub =
      githubInput.trim() ||
      (useCachedResume && cachedResume?.githubHandle
        ? cachedResume.githubHandle
        : "");
    if (trimmedGithub) {
      formData.append("githubUsername", trimmedGithub);
    }
    if (overwriteAll) {
      formData.append("overwriteAll", "true");
    }
    if (forceReinfer) {
      formData.append("forceReinfer", "true");
    }

    const devModel = getDevOllamaModelOverride();
    if (devModel) {
      formData.append("devModelOverride", devModel);
    }

    const wasForce = forceReinfer;
    const wasOverwrite = overwriteAll;
    resetForm();

    const uploadPromise = applyResumeUpload(formData).then((res) => {
      if (!res.ok) {
        throw new Error(
          res.error || "Failed to parse and consolidate profile"
        );
      }
      router.refresh();
      return res;
    });

    toast.promise(uploadPromise, {
      loading: wasForce
        ? "Running fresh evaluation (bypassing all caches)..."
        : wasOverwrite
          ? "Replacing your profile from this resume..."
          : trimmedGithub
            ? "Ingesting profile and GitHub data. You can navigate freely..."
            : "Parsing and saving your profile...",
      success: "Master profile successfully updated!",
      error: (err) =>
        err instanceof Error ? err.message : "Failed to process profile",
    });
  }

  function onSyncGitHub() {
    const handle = githubInput.trim();
    if (!handle) {
      toast.error("Enter a GitHub username or profile URL");
      return;
    }
    const devModel = getDevOllamaModelOverride();
    startTransition(async () => {
      const toastId = toast.loading("Syncing GitHub repositories…");
      const result = await importGitHubProjects(
        accountId,
        handle,
        devModel || undefined,
        { forceRefresh: forceReinfer }
      );
      if (!result.ok) {
        toast.error(result.error, { id: toastId });
        return;
      }
      toast.success(
        `Imported ${result.data?.imported ?? 0} GitHub project${
          (result.data?.imported ?? 0) === 1 ? "" : "s"
        }`,
        { id: toastId }
      );
      router.refresh();
    });
  }

  const canSubmit = Boolean(
    selectedFile || (useCachedResume && cachedResume)
  );

  return (
    <div className="flex w-72 flex-col gap-3 p-2" data-dnd-ignore="">
      <div className="px-0.5">
        <p className="text-[13px] font-semibold text-[#e4f7f3]">Upload Resume</p>
      </div>

      {!selectedFile && !useCachedResume ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-white/15 px-3 py-4 text-center transition-colors hover:bg-white/5 disabled:opacity-50"
        >
          <FileText className="size-5 text-[#e4f7f3]/55" aria-hidden />
          <span className="text-[12px] font-medium text-[#e4f7f3]/80">
            Choose resume
          </span>
          <span className="text-[10px] text-[#e4f7f3]/45">
            PDF, DOCX, TXT, or ZIP
          </span>
        </button>
      ) : selectedFile ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
          <FileText className="size-4 shrink-0 text-[#1ab5af]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-[#e4f7f3]">
              {selectedFile.name}
            </p>
            <p className="text-[10px] text-[#e4f7f3]/45">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            type="button"
            title="Clear file"
            aria-label="Clear file"
            disabled={pending}
            onClick={clearStagedFile}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-[#e4f7f3]/55 transition-colors hover:bg-white/10 hover:text-[#e4f7f3] disabled:opacity-40"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : useCachedResume && cachedResume ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/10 px-2.5 py-2">
          <FileText
            className="size-4 shrink-0 text-amber-400"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-[#e4f7f3]">
              {cachedResume.fileName}
            </p>
            <p className="text-[10px] text-amber-400/80">
              {(cachedResume.fileSize / 1024).toFixed(1)} KB · Dev cached
            </p>
          </div>
          <button
            type="button"
            title="Clear cached file"
            aria-label="Clear cached file"
            disabled={pending}
            onClick={clearStagedFile}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-[#e4f7f3]/55 transition-colors hover:bg-white/10 hover:text-[#e4f7f3] disabled:opacity-40"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept={FILE_ACCEPT}
        className="hidden"
        onChange={handleFileSelect}
        disabled={pending}
      />

      <div className="space-y-1.5">
        <label htmlFor="sidebar-github-handle" className={FLYOUT_LABEL_CLASS}>
          GitHub (optional)
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id="sidebar-github-handle"
            type="text"
            autoComplete="off"
            value={githubInput}
            disabled={pending}
            placeholder="octocat or profile URL"
            onChange={(event) => setGithubInput(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !selectedFile &&
                !useCachedResume
              ) {
                event.preventDefault();
                onSyncGitHub();
              }
            }}
            className={cn(FLYOUT_FIELD_CLASS, "min-w-0 flex-1")}
          />
          <button
            type="button"
            disabled={pending || !githubInput.trim()}
            onClick={onSyncGitHub}
            title="Sync GitHub only"
            aria-label="Sync GitHub only"
            className={ACTION_BTN_CLASS}
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <FolderGit2 className="size-3.5" aria-hidden />
            )}
            Sync
          </button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-2 rounded-xl border border-white/10 px-2.5 py-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-[12px] font-medium text-[#e4f7f3]/85">
            Replace entire profile
          </p>
          <p className="text-[10px] leading-snug text-[#e4f7f3]/45">
            Overwrite instead of merging. Saves a History backup.
          </p>
        </div>
        <WaveToggle
          id="sidebar-replace-profile"
          checked={overwriteAll}
          disabled={pending}
          variant="dark"
          onCheckedChange={setOverwriteAll}
          aria-label="Replace entire profile with this resume"
        />
      </div>

      {isDev ? (
        <div className="space-y-2 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 px-2.5 py-2 dark:border-amber-500/30">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <p className="text-[12px] font-medium text-[#e4f7f3]/85">
                  Test-run uploaded resume
                </p>
                <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                  Dev
                </span>
              </div>
              <p className="text-[10px] leading-snug text-[#e4f7f3]/45">
                Fresh inference — bypasses caches for evaluation runs.
              </p>
              {cachedResume ? (
                <p className="truncate text-[10px] font-medium text-amber-400/90">
                  Cached: {cachedResume.fileName}
                </p>
              ) : loadingCacheInfo ? (
                <p className="text-[10px] text-[#e4f7f3]/45">
                  Checking dev resume cache…
                </p>
              ) : (
                <p className="text-[10px] italic text-[#e4f7f3]/40">
                  Upload once to cache for one-click re-runs.
                </p>
              )}
            </div>
            <WaveToggle
              id="sidebar-force-reinfer"
              checked={forceReinfer}
              disabled={pending}
              variant="dark"
              aria-label="Test-run uploaded resume"
              onCheckedChange={(checked) => {
                setForceReinfer(checked);
                if (checked) {
                  if (cachedResume && !selectedFile) {
                    setUseCachedResume(true);
                  }
                  if (cachedResume?.githubHandle && !githubInput.trim()) {
                    setGithubInput(cachedResume.githubHandle);
                  }
                } else if (!selectedFile) {
                  setUseCachedResume(false);
                }
              }}
            />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        disabled={!canSubmit || pending}
        onClick={handleSubmit}
        className={PRIMARY_BTN_CLASS}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <CloudUpload className="size-3.5" aria-hidden />
        )}
        {forceReinfer ? "Test Run Ingestion" : "Parse & Ingest"}
      </button>
    </div>
  );
}
