import React, { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MasterProfileUpdateInput } from "@/lib/validations/profile";

export function TagListEditor({
  label,
  values,
  onChange,
  hideHeading = false,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  hideHeading?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function addTag() {
    const next = draft.trim();
    if (!next) return;
    if (values.includes(next)) {
      setDraft("");
      return;
    }
    onChange([...values, next]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      {hideHeading ? null : <Label>{label}</Label>}
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <Badge key={value} variant="secondary" className="gap-1 pr-1">
            {value}
            <button
              type="button"
              className="rounded-sm p-0.5 hover:bg-muted"
              onClick={() => onChange(values.filter((v) => v !== value))}
              aria-label={`Remove ${value}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        placeholder={`Add ${label.toLowerCase()} and press Enter`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTag();
          }
        }}
      />
    </div>
  );
}

export function SkillsSection({
  form,
  setForm,
}: {
  form: MasterProfileUpdateInput;
  setForm: React.Dispatch<React.SetStateAction<MasterProfileUpdateInput>>;
}) {
  return (
    <div className="space-y-4">
      {form.skills.map((group, index) => (
        <div
          key={`${group.label}-${index}`}
          className="space-y-3 rounded-md border border-border p-3"
        >
          <div className="space-y-2">
            <Input
              value={group.parentCategory ?? ""}
              placeholder="Parent section"
              aria-label="Parent skill section"
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  skills: f.skills.map((item, i) =>
                    i === index
                      ? { ...item, parentCategory: e.target.value || null }
                      : item
                  ),
                }))
              }
            />
            <div className="flex items-center gap-2">
              <Input
                value={group.label}
                placeholder="Category name"
                aria-label="Skill category"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    skills: f.skills.map((item, i) =>
                      i === index
                        ? { ...item, label: e.target.value }
                        : item
                    ),
                  }))
                }
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Remove skill group"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    skills: f.skills.filter((_, i) => i !== index),
                  }))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <TagListEditor
            label="skill"
            hideHeading
            values={group.items.map((item) => item.name)}
            onChange={(values) =>
              setForm((f) => ({
                ...f,
                skills: f.skills.map((item, i) => {
                  if (i !== index) return item;
                  const known = new Map(
                    item.items.map((skill) => [
                      skill.name.toLowerCase(),
                      skill.proficiency,
                    ])
                  );
                  return {
                    ...item,
                    items: values.map((name) => ({
                      name,
                      proficiency: known.get(name.toLowerCase()) ?? null,
                    })),
                  };
                }),
              }))
            }
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          setForm((f) => ({
            ...f,
            skills: [...f.skills, { label: "", parentCategory: null, items: [] }],
          }))
        }
      >
        <Plus className="h-4 w-4" />
        Add skill group
      </Button>
    </div>
  );
}
