"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  FolderGit2,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  applyResumeUpload,
  importGitHubProjects,
  saveMasterProfile,
} from "@/app/actions/profile";
import { formatEducationTitle, formatSchoolName } from "@/lib/utils/format";
import type { MasterProfileInput } from "@/lib/validations/profile";
import { flattenSkillItems } from "@/lib/skill-groups";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ResumeUploadDialogProps = {
  accountId: string;
  triggerLabel?: string;
  /** When set, opening the dialog loads this profile into the review editor. */
  initialProfile?: MasterProfileInput | null;
  triggerVariant?: "outline" | "secondary" | "default";
};

export function ResumeUploadDialog({
  accountId,
  triggerLabel = "Upload / Re-parse Resume",
  initialProfile = null,
  triggerVariant = "outline",
}: ResumeUploadDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MasterProfileInput | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [githubInput, setGithubInput] = useState("");
  const [overwriteAll, setOverwriteAll] = useState(false);
  const [pending, startTransition] = useTransition();
  const editMode = Boolean(initialProfile);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && initialProfile) {
      setDraft(initialProfile);
    }
    if (!next) {
      setDraft(null);
      setSelectedFile(null);
      setGithubInput("");
      setOverwriteAll(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (file) {
      setSelectedFile(file);
    }
  }

  function handleSubmit() {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append("accountId", accountId);
    formData.append("file", selectedFile);

    const trimmedGithub = githubInput.trim();
    if (trimmedGithub) {
      formData.append("githubUsername", trimmedGithub);
    }
    if (overwriteAll) {
      formData.append("overwriteAll", "true");
    }

    setSelectedFile(null);
    setGithubInput("");
    setOverwriteAll(false);
    setOpen(false);

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
      loading: overwriteAll
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

    startTransition(async () => {
      const toastId = toast.loading("Syncing GitHub repositories…");
      const result = await importGitHubProjects(accountId, handle);
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

  function onSave() {
    if (!draft) return;
    startTransition(async () => {
      const toastId = toast.loading("Saving master profile…");
      const result = await saveMasterProfile(accountId, draft);
      if (!result.ok) {
        toast.error(result.error, { id: toastId });
        return;
      }
      toast.success("Master profile saved", { id: toastId });
      setOpen(false);
      setDraft(null);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant} size="sm">
          {editMode ? null : <Upload className="h-4 w-4" />}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editMode ? "Edit Master Profile" : "Master Resume Profile"}
          </DialogTitle>
          <DialogDescription>
            {editMode
              ? "Review the structured profile for accuracy, then save or re-upload a source file."
              : "Stage a resume and optional GitHub handle, then ingest in the background — you can keep navigating."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!selectedFile ? (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-10 text-center transition hover:bg-muted/50">
              <FileText className="mb-1 h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">
                Choose a Resume (PDF, DOCX, or ZIP)
              </span>
              <span className="text-xs text-muted-foreground">
                Click to browse — file is staged until you submit
              </span>
              <input
                type="file"
                accept=".pdf,.docx,.txt,.zip,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip,application/x-zip-compressed,text/plain"
                className="hidden"
                onChange={handleFileSelect}
                disabled={pending}
              />
            </label>
          ) : (
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
              <div className="flex min-w-0 items-center gap-2.5 overflow-hidden">
                <FileText className="h-5 w-5 shrink-0 text-primary" />
                <span className="truncate text-sm font-medium">
                  {selectedFile.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedFile(null)}
                disabled={pending}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label
              htmlFor="github-handle"
              className="flex items-center gap-1.5 text-xs font-medium"
            >
              <FolderGit2 className="h-3.5 w-3.5" />
              GitHub Username or Profile URL (Optional)
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                id="github-handle"
                type="text"
                name="githubUsername"
                placeholder="e.g. octocat or https://github.com/octocat"
                value={githubInput}
                disabled={pending}
                onChange={(e) => setGithubInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !selectedFile) {
                    e.preventDefault();
                    onSyncGitHub();
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending || !githubInput.trim()}
                onClick={onSyncGitHub}
                className="shrink-0"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderGit2 className="h-4 w-4" />
                )}
                Sync only
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              A GitHub URL printed in the resume is used when this field is
              empty. Replacing the profile syncs GitHub only when that URL is
              in the new document.
            </p>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="replace-profile" className="text-sm font-medium">
                Replace entire profile with this resume
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Overwrites current experience, skills, and contact details
                instead of merging additively. A revision backup will be saved
                in History.
              </p>
            </div>
            <Switch
              id="replace-profile"
              checked={overwriteAll}
              disabled={pending}
              onCheckedChange={setOverwriteAll}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!selectedFile || pending}
              onClick={handleSubmit}
            >
              Parse & Ingest Profile
            </Button>
          </div>
        </div>

        {draft && (
          <Tabs defaultValue="contact" className="mt-2">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="contact">Contact & Skills</TabsTrigger>
              <TabsTrigger value="experience">Work Bullets</TabsTrigger>
              <TabsTrigger value="projects">Projects</TabsTrigger>
              <TabsTrigger value="education">Education</TabsTrigger>
            </TabsList>
            <TabsContent value="contact" className="space-y-3 text-sm">
              <p>
                <span className="font-medium">{draft.fullName}</span> ·{" "}
                {draft.email}
              </p>
              <p className="text-muted-foreground">
                {[draft.phone, draft.location].filter(Boolean).join(" · ") ||
                  "—"}
              </p>
              {draft.summary && <p>{draft.summary}</p>}
              <div className="flex flex-wrap gap-1.5">
                {flattenSkillItems(draft.skills).map((skill) => (
                  <Badge key={skill} variant="secondary">
                    {skill}
                  </Badge>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="experience" className="space-y-4 text-sm">
              {draft.experiences.map((exp) => (
                <div key={`${exp.company}-${exp.role}`} className="space-y-2">
                  <p className="font-medium">
                    {exp.role} · {exp.company}
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    {exp.bullets.map((b) => (
                      <li key={b.id}>
                        {b.rawText}
                        {b.hasMetric ? (
                          <Badge variant="outline" className="ml-2">
                            metric
                          </Badge>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </TabsContent>
            <TabsContent value="projects" className="space-y-3 text-sm">
              {draft.projects.length === 0 ? (
                <p className="text-muted-foreground">No projects extracted.</p>
              ) : (
                draft.projects.map((p) => (
                  <div key={p.name}>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-muted-foreground">{p.description}</p>
                  </div>
                ))
              )}
            </TabsContent>
            <TabsContent value="education" className="space-y-3 text-sm">
              {draft.education.length === 0 ? (
                <p className="text-muted-foreground">No education extracted.</p>
              ) : (
                draft.education.map((ed) => (
                  <div key={`${ed.institution}-${ed.degree}`}>
                    {formatEducationTitle(ed.degree, ed.fieldOfStudy) ? (
                      <p className="font-medium">
                        {formatEducationTitle(ed.degree, ed.fieldOfStudy)}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground">
                      {formatSchoolName(ed.institution, ed.subSchool)}
                      {ed.graduationDate ? ` · ${ed.graduationDate}` : ""}
                    </p>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}

        {editMode && (
          <DialogFooter>
            <Button type="button" disabled={!draft || pending} onClick={onSave}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Master Profile
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
