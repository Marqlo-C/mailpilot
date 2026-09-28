"use client";

import { ResumeUploadDialog } from "@/components/profile/resume-upload-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ProfileSnapshotData } from "@/components/settings/professional-profile-snapshot";

type MasterResumeCardProps = {
  accountId: string | null;
  profile: ProfileSnapshotData | null;
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
          Upload or re-parse your resume. Contact phone and email live on the
          master profile for resume generation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
              <span suppressHydrationWarning>
                {profile.updatedAt
                  ? `${new Date(profile.updatedAt).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "UTC",
                    })} UTC`
                  : "—"}
              </span>
              {" · "}
              {profile.experiences.length} roles · {profile.projects.length}{" "}
              projects · {profile.education.length} education
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No master profile yet. Upload a resume to get started.
          </p>
        )}

        {accountId && (
          <div className="flex flex-wrap gap-2">
            <ResumeUploadDialog
              accountId={accountId}
              triggerLabel={
                profile ? "Upload / Re-parse Resume" : "Upload Resume"
              }
            />
            {profile ? (
              <ResumeUploadDialog
                accountId={accountId}
                initialProfile={profile}
                triggerLabel="Manually Edit Profile"
                triggerVariant="secondary"
              />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
