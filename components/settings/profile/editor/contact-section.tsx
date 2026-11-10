import React, { useMemo } from "react";
import { Mail, MapPin, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LINKED_ACCOUNT_FIELDS,
  ICON_SQUIRCLE_CLASSNAME,
  LinkStatusPill,
  PlatformMark,
} from "@/components/settings/profile/platform-mark";
import type { MasterProfileUpdateInput } from "@/lib/validations/profile";
import { Field } from "./common";

export function ContactField({
  icon: Icon,
  label,
  value,
  onChange,
  type = "text",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  const id = useMemo(() => `contact-${label.toLowerCase()}`, [label]);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
      <span className={ICON_SQUIRCLE_CLASSNAME} aria-hidden="true">
        <Icon className="size-[18px] text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label htmlFor={id} className="truncate text-xs font-semibold text-foreground">
          {label}
        </Label>
        <Input
          id={id}
          type={type}
          value={value}
          placeholder="—"
          onChange={(e) => onChange(e.target.value)}
          className="h-auto truncate border-0 bg-transparent px-0 py-0 text-[11px] text-muted-foreground shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}

export function ContactSection({
  form,
  setForm,
}: {
  form: MasterProfileUpdateInput;
  setForm: React.Dispatch<React.SetStateAction<MasterProfileUpdateInput>>;
}) {
  return (
    <div className="space-y-2.5">
      <Field
        label="Full Name"
        value={form.fullName}
        onChange={(v) => setForm((f) => ({ ...f, fullName: v }))}
      />

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
        <ContactField
          icon={Phone}
          label="Phone"
          type="tel"
          value={form.phone ?? ""}
          onChange={(v) => setForm((f) => ({ ...f, phone: v || null }))}
        />
        <ContactField
          icon={Mail}
          label="Email"
          type="email"
          value={form.email}
          onChange={(v) => setForm((f) => ({ ...f, email: v }))}
        />
        <ContactField
          icon={MapPin}
          label="Location"
          value={form.location ?? ""}
          onChange={(v) =>
            setForm((f) => ({ ...f, location: v || null }))
          }
        />
      </div>

      <div className="space-y-1 rounded-xl border border-border/60 bg-muted/20 p-3.5">
        <Label
          htmlFor="summary"
          className="text-[11px] font-semibold text-muted-foreground"
        >
          Summary
        </Label>
        <textarea
          id="summary"
          placeholder="No professional summary added"
          className="min-h-20 w-full resize-y bg-transparent text-xs leading-relaxed text-foreground/85 placeholder:text-xs placeholder:italic placeholder:text-muted-foreground focus-visible:outline-none"
          value={form.summary ?? ""}
          onChange={(e) =>
            setForm((f) => ({ ...f, summary: e.target.value || null }))
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {LINKED_ACCOUNT_FIELDS.map(({ key, label, iconSrc, iconSize }) => {
          const url = form[key] ?? "";
          const linked = url.trim().length > 0;
          return (
            <div
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
                    value={url}
                    placeholder="Not linked"
                    className="h-auto border-0 bg-transparent px-0 py-0 text-[11px] text-muted-foreground shadow-none focus-visible:ring-0"
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        [key]: e.target.value || null,
                      }))
                    }
                  />
                </div>
              </div>
              <LinkStatusPill linked={linked} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
