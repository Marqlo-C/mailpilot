"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { updateMasterProfile } from "@/app/actions/profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProfileSnapshotData } from "@/components/settings/master-profile-card";
import {
  masterProfileSchema,
  type ExperienceBullet,
  type MasterProfileUpdateInput,
  type WorkExperienceInput,
} from "@/lib/validations/profile";

type ManualProfileEditorProps = {
  accountId: string;
  profile: ProfileSnapshotData | null;
  triggerLabel?: string;
};

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyForm(emailFallback = ""): MasterProfileUpdateInput {
  return {
    fullName: "",
    email: emailFallback,
    phone: null,
    location: null,
    summary: null,
    links: [],
    skills: { languages: [], frameworks: [], tools: [], concepts: [] },
    experiences: [],
    projects: [],
    education: [],
    linkedWebsite: null,
    linkedIndeed: null,
    linkedGlassdoor: null,
    linkedGithub: null,
    linkedLinkedin: null,
    linkedHandshake: null,
  };
}

function profileToForm(profile: ProfileSnapshotData | null): MasterProfileUpdateInput {
  if (!profile) return emptyForm();
  return {
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone ?? null,
    location: profile.location ?? null,
    summary: profile.summary ?? null,
    links: profile.links ?? [],
    skills: {
      languages: [...profile.skills.languages],
      frameworks: [...profile.skills.frameworks],
      tools: [...profile.skills.tools],
      concepts: [...profile.skills.concepts],
    },
    experiences: profile.experiences.map((exp) => ({
      ...exp,
      id: exp.id ?? newId(),
      bullets: exp.bullets.map((b) => ({ ...b, id: b.id || newId() })),
    })),
    projects: profile.projects.map((p) => ({
      ...p,
      id: p.id ?? newId(),
      bullets: [...p.bullets],
      technologies: [...p.technologies],
    })),
    education: profile.education.map((ed) => ({
      ...ed,
      id: ed.id ?? newId(),
    })),
    linkedWebsite: profile.linkedWebsite ?? null,
    linkedIndeed: profile.linkedIndeed ?? null,
    linkedGlassdoor: profile.linkedGlassdoor ?? null,
    linkedGithub: profile.linkedGithub ?? null,
    linkedLinkedin: profile.linkedLinkedin ?? null,
    linkedHandshake: profile.linkedHandshake ?? null,
  };
}

/**
 * Comprehensive manual editor for the master profile (no document upload required).
 */
export function ManualProfileEditor({
  accountId,
  profile,
  triggerLabel = "Edit Fields",
}: ManualProfileEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<MasterProfileUpdateInput>(() =>
    profileToForm(profile)
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setForm(profileToForm(profile));
      setError(null);
    }
  }

  function submit() {
    setError(null);
    const parsed = masterProfileSchema.safeParse(form);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      setError(message);
      toast.error(message);
      return;
    }

    startTransition(async () => {
      const result = await updateMasterProfile(accountId, parsed.data);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Master profile updated");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col overflow-hidden p-0">
        <div className="border-b border-border px-6 py-4">
          <DialogHeader>
            <DialogTitle>Edit Master Profile</DialogTitle>
            <DialogDescription>
              Manually adjust contact info, skills, work history, projects, and
              education without re-uploading a resume.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-4">
              <TabsTrigger value="personal">Personal & Contact</TabsTrigger>
              <TabsTrigger value="skills">Skills Matrix</TabsTrigger>
              <TabsTrigger value="experience">Work Experience</TabsTrigger>
              <TabsTrigger value="projects">Projects & Education</TabsTrigger>
            </TabsList>

            <TabsContent value="personal" className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Full Name"
                  value={form.fullName}
                  onChange={(v) => setForm((f) => ({ ...f, fullName: v }))}
                />
                <Field
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                />
                <Field
                  label="Location"
                  value={form.location ?? ""}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, location: v || null }))
                  }
                />
                <Field
                  label="Phone Number"
                  value={form.phone ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, phone: v || null }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="summary">Professional Summary</Label>
                <textarea
                  id="summary"
                  className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.summary ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, summary: e.target.value || null }))
                  }
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Personal Website / Portfolio"
                  type="url"
                  value={form.linkedWebsite ?? ""}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, linkedWebsite: v || null }))
                  }
                />
                <Field
                  label="LinkedIn URL"
                  type="url"
                  value={form.linkedLinkedin ?? ""}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, linkedLinkedin: v || null }))
                  }
                />
                <Field
                  label="GitHub URL"
                  type="url"
                  value={form.linkedGithub ?? ""}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, linkedGithub: v || null }))
                  }
                />
                <Field
                  label="Indeed URL"
                  type="url"
                  value={form.linkedIndeed ?? ""}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, linkedIndeed: v || null }))
                  }
                />
                <Field
                  label="Glassdoor URL"
                  type="url"
                  value={form.linkedGlassdoor ?? ""}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, linkedGlassdoor: v || null }))
                  }
                />
                <Field
                  label="Handshake URL"
                  type="url"
                  value={form.linkedHandshake ?? ""}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, linkedHandshake: v || null }))
                  }
                />
              </div>
            </TabsContent>

            <TabsContent value="skills" className="mt-4 space-y-4">
              {(
                [
                  ["languages", "Languages"],
                  ["frameworks", "Frameworks"],
                  ["tools", "Tools"],
                  ["concepts", "Core Concepts"],
                ] as const
              ).map(([key, label]) => (
                <TagListEditor
                  key={key}
                  label={label}
                  values={form.skills[key]}
                  onChange={(values) =>
                    setForm((f) => ({
                      ...f,
                      skills: { ...f.skills, [key]: values },
                    }))
                  }
                />
              ))}
            </TabsContent>

            <TabsContent value="experience" className="mt-4 space-y-4">
              {form.experiences.map((exp, index) => (
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
              ))}
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
                        company: "",
                        role: "",
                        location: null,
                        startDate: "",
                        endDate: null,
                        bullets: [],
                        displayOrder: f.experiences.length,
                      },
                    ],
                  }))
                }
              >
                <Plus className="h-4 w-4" />
                Add job
              </Button>
            </TabsContent>

            <TabsContent value="projects" className="mt-4 space-y-6">
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
                      <p className="text-sm font-medium">Project {index + 1}</p>
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
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <textarea
                        className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={project.description}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            projects: f.projects.map((p, i) =>
                              i === index
                                ? { ...p, description: e.target.value }
                                : p
                            ),
                          }))
                        }
                      />
                    </div>
                    <TagListEditor
                      label="Technologies"
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
                    <TagListEditor
                      label="Bullets"
                      values={project.bullets}
                      onChange={(values) =>
                        setForm((f) => ({
                          ...f,
                          projects: f.projects.map((p, i) =>
                            i === index ? { ...p, bullets: values } : p
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

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Education</h3>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        education: [
                          ...f.education,
                          {
                            id: newId(),
                            institution: "",
                            degree: "",
                            fieldOfStudy: null,
                            graduationDate: null,
                          },
                        ],
                      }))
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add education
                  </Button>
                </div>
                {form.education.map((ed, index) => (
                  <div
                    key={ed.id ?? index}
                    className="space-y-3 rounded-md border border-border p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">
                        Education {index + 1}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            education: f.education.filter((_, i) => i !== index),
                          }))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        label="Institution"
                        value={ed.institution}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            education: f.education.map((item, i) =>
                              i === index ? { ...item, institution: v } : item
                            ),
                          }))
                        }
                      />
                      <Field
                        label="Degree"
                        value={ed.degree}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            education: f.education.map((item, i) =>
                              i === index ? { ...item, degree: v } : item
                            ),
                          }))
                        }
                      />
                      <Field
                        label="Field of Study"
                        value={ed.fieldOfStudy ?? ""}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            education: f.education.map((item, i) =>
                              i === index
                                ? { ...item, fieldOfStudy: v || null }
                                : item
                            ),
                          }))
                        }
                      />
                      <Field
                        label="Graduation Date"
                        value={ed.graduationDate ?? ""}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            education: f.education.map((item, i) =>
                              i === index
                                ? { ...item, graduationDate: v || null }
                                : item
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4 sm:justify-between">
          {error ? (
            <p className="max-w-sm text-left text-sm text-destructive">{error}</p>
          ) : (
            <span />
          )}
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  const id = useMemo(() => label.toLowerCase().replace(/\s+/g, "-"), [label]);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function TagListEditor({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
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
      <Label>{label}</Label>
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

function ExperienceEditor({
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
              className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/20 p-2"
            >
              <input
                className="mt-1 min-w-0 flex-1 bg-transparent text-sm outline-none"
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
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
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
                className="text-muted-foreground hover:text-foreground"
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
