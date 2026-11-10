import React from "react";
import { Plus, SquareArrowOutUpRight, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BULLET_ROW_CLASSNAME,
  BulletSquircle,
} from "@/components/ui/tactile";
import type { MasterProfileUpdateInput } from "@/lib/validations/profile";
import { CollapsedSection, Field, newId } from "./common";
import { TagListEditor } from "./skills-section";
import { EducationSection } from "./education-section";
import { CredentialsSection } from "./credentials-section";

export function ProjectPointsEditor({
  description,
  bullets,
  onChange,
}: {
  description: string;
  bullets: string[];
  onChange: (next: { description: string; bullets: string[] }) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Bullet points</Label>
      <div className="flex items-center gap-2">
        <Input
          placeholder="Description"
          value={description}
          onChange={(e) => onChange({ description: e.target.value, bullets })}
        />
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => onChange({ description: "", bullets })}
          aria-label="Clear description"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {bullets.map((bullet, bulletIndex) => (
        <div key={bulletIndex} className={BULLET_ROW_CLASSNAME}>
          <BulletSquircle />
          <Input
            value={bullet}
            className="h-auto py-0 text-sm leading-5"
            onChange={(e) =>
              onChange({
                description,
                bullets: bullets.map((item, i) =>
                  i === bulletIndex ? e.target.value : item
                ),
              })
            }
          />
          <button
            type="button"
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() =>
              onChange({
                description,
                bullets: bullets.filter((_, i) => i !== bulletIndex),
              })
            }
            aria-label="Remove bullet"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onChange({ description, bullets: [...bullets, ""] })}
      >
        <Plus className="h-4 w-4" />
        Add bullet
      </Button>
    </div>
  );
}

export function ProjectsSection({
  form,
  setForm,
}: {
  form: MasterProfileUpdateInput;
  setForm: React.Dispatch<React.SetStateAction<MasterProfileUpdateInput>>;
}) {
  return (
    <div className="space-y-6">
      <CollapsedSection title={`Projects (${form.projects.length})`}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Projects</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  projects: [
                    ...f.projects,
                    {
                      id: newId(),
                      name: "",
                      description: "",
                      technologies: [],
                      link: null,
                      bullets: [],
                    },
                  ],
                }))
              }
            >
              <Plus className="h-4 w-4" />
              Add project
            </Button>
          </div>
          {form.projects.map((project, index) => (
            <div
              key={project.id ?? index}
              className="space-y-3 rounded-md border border-border p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 leading-none min-w-0 max-w-full">
                  <h4 className="text-sm font-semibold text-foreground truncate leading-none">
                    Project {index + 1}
                  </h4>
                  {project.link ? (
                    <a
                      href={project.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center self-center text-muted-foreground/60 hover:text-foreground transition-colors shrink-0 p-0.5"
                      title="Open repository"
                    >
                      <SquareArrowOutUpRight className="size-3.5 shrink-0" />
                    </a>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      projects: f.projects.filter((_, i) => i !== index),
                    }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Field
                label="Name"
                value={project.name}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    projects: f.projects.map((p, i) =>
                      i === index ? { ...p, name: v } : p
                    ),
                  }))
                }
              />
              <TagListEditor
                label="Tools & Methods"
                values={project.technologies}
                onChange={(values) =>
                  setForm((f) => ({
                    ...f,
                    projects: f.projects.map((p, i) =>
                      i === index ? { ...p, technologies: values } : p
                    ),
                  }))
                }
              />
              <ProjectPointsEditor
                description={project.description}
                bullets={project.bullets}
                onChange={({ description, bullets }) =>
                  setForm((f) => ({
                    ...f,
                    projects: f.projects.map((p, i) =>
                      i === index ? { ...p, description, bullets } : p
                    ),
                  }))
                }
              />
              <Field
                label="Link"
                type="url"
                value={project.link ?? ""}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    projects: f.projects.map((p, i) =>
                      i === index ? { ...p, link: v || null } : p
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </CollapsedSection>

      <EducationSection form={form} setForm={setForm} />

      <CredentialsSection form={form} setForm={setForm} />
    </div>
  );
}
