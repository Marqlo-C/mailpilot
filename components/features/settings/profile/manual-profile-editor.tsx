"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { resetMasterProfile, updateMasterProfile } from "@/app/actions/profile";
import { ExportMasterProfileButton } from "@/components/features/profile/export-master-profile-button";
import { Button } from "@/components/ui/button";
import { ActionDialogShell } from "@/components/ui/composites/action-dialog-shell";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProfileSnapshotData } from "@/components/features/settings/profile";
import { cn } from "@/lib/utils";
import {
  masterProfileSchema,
  type MasterProfileUpdateInput,
} from "@/lib/validations/profile.schema";
import {
  ContactSection,
  CredentialsSection,
  emptyForm,
  ExperienceSection,
  profileToForm,
  ProjectsSection,
  SkillsSection,
} from "./editor";

type ManualProfileEditorProps = {
  accountId: string;
  profile: ProfileSnapshotData | null;
  triggerLabel?: string;
};

export function ManualProfileEditor({
  accountId,
  profile,
  triggerLabel = "Edit Master Profile",
}: ManualProfileEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [form, setForm] = useState<MasterProfileUpdateInput>(() =>
    profileToForm(profile)
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setForm(profileToForm(profile));
      setError(null);
      setConfirmReset(false);
    }
    setOpen(next);
  }

  function clearProfile() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await resetMasterProfile(accountId);
        if (!res.ok) {
          setError(res.error ?? "Failed to clear profile");
          return;
        }
        toast.success("Master profile cleared");
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to clear profile");
      }
    });
  }

  function submit() {
    setError(null);
    const parsed = masterProfileSchema.safeParse(form);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((issue) => issue.message)
        .join("; ");
      setError(message);
      return;
    }

    startTransition(async () => {
      try {
        const res = await updateMasterProfile(accountId, parsed.data);
        if (!res.ok) {
          setError(res.error ?? "Failed to save profile");
          return;
        }
        toast.success("Master profile saved");
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save profile");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-3 text-xs font-medium [&_svg]:!size-3.5"
        onClick={() => handleOpenChange(true)}
      >
        <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
        <span>{triggerLabel}</span>
      </Button>
      <ActionDialogShell
        open={open}
        onOpenChange={handleOpenChange}
        pending={pending}
        size="lg"
        identity={{
          title: "Editing master profile:",
          primary: form.fullName.trim() || "Master Profile",
          emphasize: "primary",
          logo: <LogoFrameIcon icon={Pencil} size="lg" />,
        }}
        showCancel
        cancelLabel="Cancel"
        onCancel={
          confirmReset
            ? () => setConfirmReset(false)
            : undefined
        }
        secondaryAction={
          confirmReset ? undefined : (
            <>
              <Button
                type="button"
                variant="ghost"
                className="h-9 text-destructive"
                disabled={pending || !profile}
                onClick={() => setConfirmReset(true)}
              >
                Clear profile
              </Button>
              {profile ? (
                <ExportMasterProfileButton
                  accountId={accountId}
                  variant="outline"
                />
              ) : null}
            </>
          )
        }
        primaryAction={
          confirmReset ? (
            <Button
              type="button"
              variant="destructive"
              className="h-9"
              disabled={pending}
              onClick={clearProfile}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Clear profile
            </Button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={submit}
              className={cn(PRIMARY_ACTION_BTN_CLASSNAME, "h-9 px-3.5")}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              <span>Save profile</span>
            </button>
          )
        }
      >
        <div className="space-y-4">
          <p className="text-xs leading-normal text-muted-foreground">
            Manually adjust contact info, skills, work history, projects,
            education, certifications, honors, and interests without
            re-uploading a resume.
          </p>
          {confirmReset ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              This will reset your profile. A backup revision is saved so you
              can restore your data from History at any time.
            </p>
          ) : null}
          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5">
              <TabsTrigger value="personal">Personal & Contact</TabsTrigger>
              <TabsTrigger value="skills">Skills</TabsTrigger>
              <TabsTrigger value="experience">Work Experience</TabsTrigger>
              <TabsTrigger value="projects">Projects & Education</TabsTrigger>
              <TabsTrigger value="credentials">Credentials</TabsTrigger>
            </TabsList>

            <TabsContent value="personal" className="mt-4 space-y-2.5">
              <ContactSection form={form} setForm={setForm} />
            </TabsContent>

            <TabsContent value="skills" className="mt-4 space-y-4">
              <SkillsSection form={form} setForm={setForm} />
            </TabsContent>

            <TabsContent value="experience" className="mt-4 space-y-4">
              <ExperienceSection form={form} setForm={setForm} />
            </TabsContent>

            <TabsContent value="projects" className="mt-4 space-y-6">
              <ProjectsSection form={form} setForm={setForm} />
            </TabsContent>

            <TabsContent value="credentials" className="mt-4 space-y-6">
              <CredentialsSection form={form} setForm={setForm} />
            </TabsContent>
          </Tabs>
        </div>
      </ActionDialogShell>
    </>
  );
}
