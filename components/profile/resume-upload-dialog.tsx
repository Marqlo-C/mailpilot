"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  extractResumeDraft,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ResumeUploadDialogProps = {
  accountId: string;
  triggerLabel?: string;
};

export function ResumeUploadDialog({
  accountId,
  triggerLabel = "Upload / Re-parse Resume",
}: ResumeUploadDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MasterProfileInput | null>(null);
  const [pending, startTransition] = useTransition();

  function onFileChange(file: File | null) {
    if (!file) return;
    const formData = new FormData();
    formData.set("accountId", accountId);
    formData.set("file", file);

    startTransition(async () => {
      const toastId = toast.loading("Extracting resume…");
      const result = await extractResumeDraft(formData);
      if (!result.ok || !result.data) {
        toast.error(result.ok ? "Empty draft" : result.error, { id: toastId });
        return;
      }
      setDraft(result.data);
      toast.success("Draft ready — review before saving", { id: toastId });
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Upload className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Master Resume Profile</DialogTitle>
          <DialogDescription>
            Upload a PDF or DOCX resume, verify the extracted draft, then save.
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center hover:bg-muted/40">
          <Upload className="h-6 w-6 text-muted-foreground" />
          <span className="text-sm font-medium">Drop PDF / DOCX or click to browse</span>
          <input
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="hidden"
            disabled={pending}
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />
        </label>

        {draft && (
          <Tabs defaultValue="contact" className="mt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="contact">Contact & Skills</TabsTrigger>
              <TabsTrigger value="experience">Work Bullets</TabsTrigger>
              <TabsTrigger value="projects">Projects</TabsTrigger>
            </TabsList>
            <TabsContent value="contact" className="space-y-3 text-sm">
              <p>
                <span className="font-medium">{draft.fullName}</span> · {draft.email}
              </p>
              <p className="text-muted-foreground">
                {[draft.phone, draft.location].filter(Boolean).join(" · ") || "—"}
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
          </Tabs>
        )}

        <DialogFooter>
          <Button
            type="button"
            disabled={!draft || pending}
            onClick={onSave}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Master Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
