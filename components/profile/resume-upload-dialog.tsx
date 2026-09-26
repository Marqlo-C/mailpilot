"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderGit2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  extractResumeDraft,
  importGitHubProjects,
  saveMasterProfile,
} from "@/app/actions/profile";
import type { MasterProfileInput } from "@/lib/validations/profile";
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
  const [githubHandle, setGithubHandle] = useState("");
  const [pending, startTransition] = useTransition();
  const editMode = Boolean(initialProfile);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && initialProfile) {
      setDraft(initialProfile);
    }
    if (!next) {
      setDraft(null);
      setGithubHandle("");
    }
  }

  function onFileChange(file: File | null) {
    if (!file) return;
    const formData = new FormData();
    formData.set("accountId", accountId);
    formData.set("file", file);

    const isZip = file.name.toLowerCase().endsWith(".zip");
    startTransition(async () => {
      const toastId = toast.loading(
        isZip ? "Parsing LinkedIn archive…" : "Extracting resume…"
      );
      const result = await extractResumeDraft(formData);
      if (!result.ok || !result.data) {
        toast.error(result.ok ? "Empty draft" : result.error, { id: toastId });
        return;
      }
      setDraft(result.data);
      toast.success("Draft ready — review before saving", { id: toastId });
    });
  }

  function onSyncGitHub() {
    const handle = githubHandle.trim();
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
              : "Import from a resume, LinkedIn archive, or sync GitHub projects, then review before saving."}
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center hover:bg-muted/40">
          <Upload className="h-6 w-6 text-muted-foreground" />
          <span className="text-sm font-medium">
            Drop a file or click to browse
          </span>
          <span className="max-w-md text-xs text-muted-foreground">
            Upload Resume (PDF/DOCX), LinkedIn Profile PDF, Indeed PDF, or
            LinkedIn Data Archive (.zip)
          </span>
          <input
            type="file"
            accept=".pdf,.docx,.zip,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip,application/x-zip-compressed,text/plain"
            className="hidden"
            disabled={pending}
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />
        </label>

        <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <FolderGit2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              type="text"
              placeholder="GitHub username or URL"
              value={githubHandle}
              disabled={pending}
              onChange={(e) => setGithubHandle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSyncGitHub();
                }
              }}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending || !githubHandle.trim()}
            onClick={onSyncGitHub}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderGit2 className="h-4 w-4" />
            )}
            Sync GitHub Repos
          </Button>
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
                {[
                  ...draft.skills.languages,
                  ...draft.skills.frameworks,
                  ...draft.skills.tools,
                  ...draft.skills.concepts,
                ].map((skill) => (
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
                    <p className="font-medium">
                      {ed.degree}
                      {ed.fieldOfStudy ? ` in ${ed.fieldOfStudy}` : ""}
                    </p>
                    <p className="text-muted-foreground">
                      {ed.institution}
                      {ed.graduationDate ? ` · ${ed.graduationDate}` : ""}
                    </p>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button type="button" disabled={!draft || pending} onClick={onSave}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Master Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
