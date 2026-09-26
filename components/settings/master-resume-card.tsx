import { ResumeUploadDialog } from "@/components/profile/resume-upload-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MasterProfileInput } from "@/lib/validations/profile";

type MasterResumeCardProps = {
  accountId: string | null;
  profile: (MasterProfileInput & { updatedAt?: string }) | null;
};

export function MasterResumeCard({
  accountId,
  profile,
}: MasterResumeCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Master Resume Profile</CardTitle>
        <CardDescription>
          Structured source of truth for matching, tailoring, and dispatch.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!accountId ? (
          <p className="text-sm text-muted-foreground">
            Connect an account to upload a master resume.
          </p>
        ) : profile ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium">{profile.fullName}</p>
            <p className="text-muted-foreground">{profile.email}</p>
            <p className="text-xs text-muted-foreground">
              Last updated{" "}
              {profile.updatedAt
                ? new Date(profile.updatedAt).toLocaleString()
                : "—"}
              {" · "}
              {profile.experiences.length} roles · {profile.projects.length}{" "}
              projects
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No master profile yet. Upload a resume to get started.
          </p>
        )}

        {accountId && (
          <ResumeUploadDialog
            accountId={accountId}
            triggerLabel={
              profile ? "Upload / Re-parse Resume" : "Upload Resume"
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
