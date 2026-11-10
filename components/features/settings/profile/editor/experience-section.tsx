import React, { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { AppMenuSelect } from "@/components/ui/app-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BULLET_ROW_CLASSNAME,
  BulletSquircle,
} from "@/components/ui/tactile";
import {
  isWorkExperienceCategory,
  type ExperienceBullet,
  type MasterProfileUpdateInput,
  type WorkExperienceInput,
} from "@/lib/validations/profile.schema";
import { cn } from "@/lib/utils";
import { CollapsedSection, Field, categoryOptions, newId } from "./common";

export function ExperienceEditor({
  experience,
  onChange,
  onRemove,
}: {
  experience: WorkExperienceInput;
  onChange: (next: WorkExperienceInput) => void;
  onRemove: () => void;
}) {
  const [bulletDraft, setBulletDraft] = useState("");

  function addBullet() {
    const text = bulletDraft.trim();
    if (!text) return;
    const bullet: ExperienceBullet = {
      id: newId(),
      rawText: text,
      technologies: [],
      hasMetric: false,
    };
    onChange({ ...experience, bullets: [...experience.bullets, bullet] });
    setBulletDraft("");
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">
          {experience.role || experience.company || "New role"}
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Role"
          value={experience.role}
          onChange={(v) => onChange({ ...experience, role: v })}
        />
        <Field
          label="Company"
          value={experience.company}
          onChange={(v) => onChange({ ...experience, company: v })}
        />
        <Field
          label="Location"
          value={experience.location ?? ""}
          onChange={(v) => onChange({ ...experience, location: v || null })}
        />
        <div className="space-y-2">
          <Label>Category</Label>
          <AppMenuSelect
            surface="light"
            value={experience.category || "Work"}
            options={categoryOptions(experience.category).map((category) => ({
              value: category,
              label: category,
            }))}
            onChange={(next) =>
              onChange({ ...experience, category: next || "Work" })
            }
          />
        </div>
        <Field
          label="Start Date"
          value={experience.startDate}
          onChange={(v) => onChange({ ...experience, startDate: v })}
        />
        <Field
          label="End Date"
          value={experience.endDate ?? ""}
          onChange={(v) => onChange({ ...experience, endDate: v || null })}
        />
      </div>

      <div className="space-y-2">
        <Label>Bullet points</Label>
        <ul className="space-y-2">
          {experience.bullets.map((bullet) => (
            <li
              key={bullet.id}
              className={cn(
                BULLET_ROW_CLASSNAME,
                "rounded-md border border-border/70 bg-muted/20 p-2"
              )}
            >
              <BulletSquircle />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm leading-5 outline-none"
                value={bullet.rawText}
                onChange={(e) =>
                  onChange({
                    ...experience,
                    bullets: experience.bullets.map((b) =>
                      b.id === bullet.id
                        ? { ...b, rawText: e.target.value }
                        : b
                    ),
                  })
                }
              />
              <label className="mt-0.5 flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={bullet.hasMetric}
                  onChange={(e) =>
                    onChange({
                      ...experience,
                      bullets: experience.bullets.map((b) =>
                        b.id === bullet.id
                          ? { ...b, hasMetric: e.target.checked }
                          : b
                      ),
                    })
                  }
                />
                metric
              </label>
              <button
                type="button"
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() =>
                  onChange({
                    ...experience,
                    bullets: experience.bullets.filter((b) => b.id !== bullet.id),
                  })
                }
                aria-label="Remove bullet"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <Input
          placeholder="Add bullet and press Enter"
          value={bulletDraft}
          onChange={(e) => setBulletDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addBullet();
            }
          }}
        />
      </div>
    </div>
  );
}

export function ExperienceSection({
  form,
  setForm,
}: {
  form: MasterProfileUpdateInput;
  setForm: React.Dispatch<React.SetStateAction<MasterProfileUpdateInput>>;
}) {
  return (
    <div className="space-y-4">
      <CollapsedSection title={`Work History (${form.experiences.filter((exp) => isWorkExperienceCategory(exp.category)).length})`}>
        {form.experiences.map((exp, index) =>
          isWorkExperienceCategory(exp.category) ? (
            <ExperienceEditor
              key={exp.id ?? index}
              experience={exp}
              onChange={(next) =>
                setForm((f) => ({
                  ...f,
                  experiences: f.experiences.map((e, i) =>
                    i === index ? next : e
                  ),
                }))
              }
              onRemove={() =>
                setForm((f) => ({
                  ...f,
                  experiences: f.experiences.filter((_, i) => i !== index),
                }))
              }
            />
          ) : null
        )}
      </CollapsedSection>

      <CollapsedSection title={`Other Roles (${form.experiences.filter((exp) => !isWorkExperienceCategory(exp.category)).length})`}>
        {form.experiences.map((exp, index) =>
          !isWorkExperienceCategory(exp.category) ? (
            <ExperienceEditor
              key={exp.id ?? index}
              experience={exp}
              onChange={(next) =>
                setForm((f) => ({
                  ...f,
                  experiences: f.experiences.map((e, i) =>
                    i === index ? next : e
                  ),
                }))
              }
              onRemove={() =>
                setForm((f) => ({
                  ...f,
                  experiences: f.experiences.filter((_, i) => i !== index),
                }))
              }
            />
          ) : null
        )}
      </CollapsedSection>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          setForm((f) => ({
            ...f,
            experiences: [
              ...f.experiences,
              {
                id: newId(),
                role: "",
                company: "",
                startDate: "",
                endDate: null,
                location: null,
                bullets: [],
                category: "Work",
                displayOrder: 0,
              },
            ],
          }))
        }
      >
        <Plus className="h-4 w-4" />
        Add experience
      </Button>
    </div>
  );
}
