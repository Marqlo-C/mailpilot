"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateContactInfo } from "@/app/actions/profile";
import { ResumeUploadDialog } from "@/components/profile/resume-upload-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { contactInfoSchema, type MfaPreferredChannel } from "@/lib/validations/profile";
import type { ProfileSnapshotData } from "@/components/settings/professional-profile-snapshot";

type MasterResumeCardProps = {
  accountId: string | null;
  profile: ProfileSnapshotData | null;
};

/**
 * Formats digits into a US-style masked phone display while typing.
 */
function maskPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 15);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function MasterResumeCard({
  accountId,
  profile,
}: MasterResumeCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Master Resume Profile</CardTitle>
        <CardDescription>
          Upload or re-parse your resume, and manage Contact & MFA recovery
          fields. Use the snapshot below automation rules to audit full details.
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
              {profile.updatedAt
                ? new Date(profile.updatedAt).toLocaleString()
                : "—"}
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

        {accountId && profile ? (
          <ContactMfaSection
            accountId={accountId}
            initialPhone={profile.mfaPhoneNumber ?? ""}
            initialEmail={profile.mfaReserveEmail ?? ""}
            initialEnabled={profile.mfaEnabled ?? false}
            initialChannel={profile.mfaPreferredChannel ?? "EMAIL"}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ContactMfaSection({
  accountId,
  initialPhone,
  initialEmail,
  initialEnabled,
  initialChannel,
}: {
  accountId: string;
  initialPhone: string;
  initialEmail: string;
  initialEnabled: boolean;
  initialChannel: MfaPreferredChannel;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState(initialPhone);
  const [reserveEmail, setReserveEmail] = useState(initialEmail);
  const [mfaEnabled, setMfaEnabled] = useState(initialEnabled);
  const [preferredChannel, setPreferredChannel] =
    useState<MfaPreferredChannel>(initialChannel);
  const [error, setError] = useState<string | null>(null);

  const hasPhone = Boolean(phone.trim());
  const hasEmail = Boolean(reserveEmail.trim());
  const canEnable = hasPhone || hasEmail;
  const showChannelPicker = hasPhone && hasEmail;

  function save(nextEnabled = mfaEnabled, nextChannel = preferredChannel) {
    setError(null);
    const parsed = contactInfoSchema.safeParse({
      mfaPhoneNumber: phone || null,
      mfaReserveEmail: reserveEmail || null,
      mfaEnabled: nextEnabled,
      mfaPreferredChannel: nextChannel,
    });

    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      setError(message);
      toast.error(message);
      return;
    }

    startTransition(async () => {
      const result = await updateContactInfo(accountId, {
        mfaPhoneNumber: parsed.data.mfaPhoneNumber ?? null,
        mfaReserveEmail: parsed.data.mfaReserveEmail ?? null,
        mfaEnabled: parsed.data.mfaEnabled,
        mfaPreferredChannel: parsed.data.mfaPreferredChannel,
      });
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Contact & MFA settings saved");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">Contact & MFA</h3>
        <p className="text-xs text-muted-foreground">
          Provide at least a cell phone or reserve email to enable MFA.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mfa-phone">Cell Phone Number</Label>
        <Input
          id="mfa-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(555) 123-4567"
          value={phone}
          disabled={pending}
          onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mfa-email">Reserve Email</Label>
        <Input
          id="mfa-email"
          type="email"
          autoComplete="email"
          placeholder="backup@example.com"
          value={reserveEmail}
          disabled={pending}
          onChange={(e) => setReserveEmail(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
        <div>
          <p className="text-sm font-medium">Enable MFA</p>
          <p className="text-xs text-muted-foreground">
            {canEnable
              ? "Uses your cell phone and/or reserve email for recovery."
              : "Add a cell phone or reserve email to activate MFA."}
          </p>
        </div>
        <Switch
          checked={mfaEnabled && canEnable}
          disabled={pending || !canEnable}
          onCheckedChange={(checked) => {
            if (!canEnable) return;
            const parsed = contactInfoSchema.safeParse({
              mfaPhoneNumber: phone || null,
              mfaReserveEmail: reserveEmail || null,
              mfaEnabled: checked,
              mfaPreferredChannel: preferredChannel,
            });
            if (!parsed.success) {
              const message = parsed.error.issues
                .map((i) => i.message)
                .join("; ");
              setError(message);
              toast.error(message);
              return;
            }
            setMfaEnabled(checked);
            save(checked);
          }}
        />
      </div>

      {showChannelPicker ? (
        <div className="space-y-2">
          <Label>Preferred MFA Channel</Label>
          <div className="grid grid-cols-3 gap-1 rounded-md border border-border p-1">
            {(
              [
                { value: "SMS", label: "SMS" },
                { value: "EMAIL", label: "Email" },
                { value: "BOTH", label: "Both" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={pending}
                className={`rounded-sm px-2 py-1.5 text-xs font-medium transition-colors ${
                  preferredChannel === option.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => {
                  setPreferredChannel(option.value);
                  save(mfaEnabled, option.value);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => save()}
      >
        Save contact info
      </Button>
    </div>
  );
}
