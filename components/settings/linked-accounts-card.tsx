"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Briefcase,
  FolderGit2,
  GraduationCap,
  Handshake,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { updateLinkedAccounts } from "@/app/actions/profile";
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
import type { LinkedAccountsInput } from "@/lib/validations/profile";

type LinkedAccountsCardProps = {
  accountId: string | null;
  hasProfile: boolean;
  values: LinkedAccountsInput;
};

const FIELDS: Array<{
  key: keyof LinkedAccountsInput;
  label: string;
  placeholder: string;
  icon: LucideIcon;
}> = [
  {
    key: "linkedLinkedin",
    label: "LinkedIn",
    placeholder: "https://www.linkedin.com/in/your-profile",
    icon: Briefcase,
  },
  {
    key: "linkedGithub",
    label: "GitHub",
    placeholder: "https://github.com/your-username",
    icon: FolderGit2,
  },
  {
    key: "linkedIndeed",
    label: "Indeed",
    placeholder: "https://profile.indeed.com/p/your-profile",
    icon: Building2,
  },
  {
    key: "linkedGlassdoor",
    label: "Glassdoor",
    placeholder: "https://www.glassdoor.com/member/profile/index.htm",
    icon: GraduationCap,
  },
  {
    key: "linkedHandshake",
    label: "Handshake",
    placeholder: "https://app.joinhandshake.com/profiles/your-id",
    icon: Handshake,
  },
];

export function LinkedAccountsCard({
  accountId,
  hasProfile,
  values,
}: LinkedAccountsCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<Record<keyof LinkedAccountsInput, string>>({
    linkedIndeed: values.linkedIndeed ?? "",
    linkedGlassdoor: values.linkedGlassdoor ?? "",
    linkedGithub: values.linkedGithub ?? "",
    linkedLinkedin: values.linkedLinkedin ?? "",
    linkedHandshake: values.linkedHandshake ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  const disabled = !accountId || !hasProfile || pending;

  function save() {
    if (!accountId) return;
    setError(null);
    startTransition(async () => {
      const result = await updateLinkedAccounts(accountId, {
        linkedIndeed: form.linkedIndeed,
        linkedGlassdoor: form.linkedGlassdoor,
        linkedGithub: form.linkedGithub,
        linkedLinkedin: form.linkedLinkedin,
        linkedHandshake: form.linkedHandshake,
      });
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Linked accounts saved");
      router.refresh();
    });
  }

  return (
    <Card className="border-border/80 bg-muted/20 shadow-none">
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-tight text-foreground/90">
          Linked Professional Accounts
        </CardTitle>
        <CardDescription>
          Optional profile URLs used for outreach context and ATS handoff.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!accountId ? (
          <p className="text-sm text-muted-foreground">
            Connect a Gmail account first.
          </p>
        ) : !hasProfile ? (
          <p className="text-sm text-muted-foreground">
            Upload a master resume before linking professional accounts.
          </p>
        ) : null}

        <ul className="space-y-3">
          {FIELDS.map(({ key, label, placeholder, icon: Icon }) => (
            <li
              key={key}
              className="flex items-start gap-3 rounded-md border border-border/70 bg-background/60 px-3 py-2.5"
            >
              <span className="mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label
                  htmlFor={key}
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {label}
                </Label>
                <Input
                  id={key}
                  type="url"
                  inputMode="url"
                  placeholder={placeholder}
                  value={form[key]}
                  disabled={disabled}
                  className="h-9 border-border/80 bg-muted/40 text-sm placeholder:text-muted-foreground/70"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                />
              </div>
            </li>
          ))}
        </ul>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={save}
        >
          Save linked accounts
        </Button>
      </CardContent>
    </Card>
  );
}
