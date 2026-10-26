"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateLinkedAccounts } from "@/app/actions/profile";
import {
  LINKED_ACCOUNT_FIELDS,
  LinkStatusPill,
  PlatformMark,
} from "@/components/settings/profile/platform-mark";
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

export function LinkedAccountsCard({
  accountId,
  hasProfile,
  values,
}: LinkedAccountsCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<Record<keyof LinkedAccountsInput, string>>({
    linkedWebsite: values.linkedWebsite ?? "",
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
        linkedWebsite: form.linkedWebsite,
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

        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {LINKED_ACCOUNT_FIELDS.map(({ key, label, iconSrc, iconSize }) => {
            const url = form[key];
            const linked = url.trim().length > 0;
            return (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <PlatformMark name={label} src={iconSrc} iconSize={iconSize} />
                  <div className="min-w-0 flex-1">
                    <h5 className="truncate text-xs font-semibold text-foreground">
                      <Label
                        htmlFor={key}
                        className="text-xs font-semibold text-foreground"
                      >
                        {label}
                      </Label>
                    </h5>
                    <Input
                      id={key}
                      type="url"
                      inputMode="url"
                      placeholder="Not linked"
                      value={url}
                      disabled={disabled}
                      className="h-auto border-0 bg-transparent px-0 py-0 text-[11px] text-muted-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <LinkStatusPill linked={linked} />
              </li>
            );
          })}
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
