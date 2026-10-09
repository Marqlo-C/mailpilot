"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { resetMasterProfile, updateMasterProfile } from "@/app/actions/profile";
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
import { extractPlatformLinks } from "@/lib/profile-consolidation";
import { skillGroupsFromUnknown } from "@/lib/skill-groups";
import {
  getEmptyMasterProfileData,
  isWorkExperienceCategory,
  masterProfileSchema,
  STANDARD_EXPERIENCE_CATEGORIES,
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
    ...getEmptyMasterProfileData(),
    email: emailFallback,
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
    skills: skillGroupsFromUnknown(profile.skills),
    experiences: profile.experiences.map((exp) => ({
      ...exp,
      id: exp.id ?? newId(),
      bullets: exp.bullets.map((b) => ({ ...b, id: b.id || newId() })),
    })),
    certifications: profile.certifications ?? [],
    awards: profile.awards ?? [],
    interests: profile.interests ?? [],
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
    ...(() => {
      const detected = extractPlatformLinks(profile.links ?? []);
      return {
        linkedWebsite: profile.linkedWebsite || detected.linkedWebsite,
        linkedIndeed: profile.linkedIndeed || detected.linkedIndeed,
        linkedGlassdoor: profile.linkedGlassdoor || detected.linkedGlassdoor,
        linkedGithub: profile.linkedGithub || detected.linkedGithub,
        linkedLinkedin: profile.linkedLinkedin || detected.linkedLinkedin,
        linkedHandshake: profile.linkedHandshake || detected.linkedHandshake,
      };
    })(),
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
  const [confirmReset, setConfirmReset] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setForm(profileToForm(profile));
      setError(null);
      setConfirmReset(false);
    }
  }

  function submit() {
    setError(null);
    const parsed = masterProfileSchema.safeParse({
      ...form,
      certifications: form.certifications.filter((item) => item.name.trim()),
      awards: form.awards.filter((item) => item.title.trim()),
      interests: form.interests.map((item) => item.trim()).filter(Boolean),
    });
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

  function clearProfile() {
    startTransition(async () => {
      const result = await resetMasterProfile(accountId);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setForm(emptyForm());
      setConfirmReset(false);
      toast.success("Profile cleared. Restore it from Revisions if needed.");
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
              Manually adjust contact info, skills, work history, projects,
              education, certifications, honors, and interests without
              re-uploading a resume.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5">
              <TabsTrigger value="personal">Personal & Contact</TabsTrigger>
              <TabsTrigger value="skills">Skills</TabsTrigger>
              <TabsTrigger value="experience">Work Experience</TabsTrigger>
              <TabsTrigger value="projects">Projects & Education</TabsTrigger>
              <TabsTrigger value="credentials">Credentials</TabsTrigger>
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
              {form.skills.map((group, index) => (
                <div
                  key={`${group.label}-${index}`}
                  className="space-y-3 rounded-md border border-border p-3"
                >
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
                  <TagListEditor
                    label="skill"
                    hideHeading
                    values={group.items}
                    onChange={(values) =>
                      setForm((f) => ({
                        ...f,
                        skills: f.skills.map((item, i) =>
                          i === index ? { ...item, items: values } : item
                        ),
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
                    skills: [...f.skills, { label: "", items: [] }],
                  }))
                }
              >
                <Plus className="h-4 w-4" />
                Add skill group
              </Button>
            </TabsContent>

            <TabsContent value="experience" className="mt-4 space-y-4">
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
                        category: "Work",
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
              </CollapsedSection>
              <CollapsedSection title={`Activities & Leadership (${form.experiences.filter((exp) => !isWorkExperienceCategory(exp.category)).length})`}>
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
                        category: "Activity",
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
                Add activity
              </Button>
              </CollapsedSection>
            </TabsContent>

            <TabsContent value="projects" className="mt-4 space-y-6">
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

              <CollapsedSection title={`Education (${form.education.length})`}>
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
                            subSchool: null,
                            degree: null,
                            fieldOfStudy: null,
                            startDate: null,
                            graduationDate: null,
                            gpa: null,
                            honors: [],
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
                        label="School"
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
                        label="College or division"
                        value={ed.subSchool ?? ""}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            education: f.education.map((item, i) =>
                              i === index ? { ...item, subSchool: v || null } : item
                            ),
                          }))
                        }
                      />
                      <Field
                        label="Degree"
                        value={ed.degree ?? ""}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            education: f.education.map((item, i) =>
                              i === index ? { ...item, degree: v || null } : item
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
                        label="Start Date"
                        value={ed.startDate ?? ""}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            education: f.education.map((item, i) =>
                              i === index ? { ...item, startDate: v || null } : item
                            ),
                          }))
                        }
                      />
                      <Field
                        label="End Date"
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
                      <Field
                        label="GPA"
                        value={ed.gpa ?? ""}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            education: f.education.map((item, i) =>
                              i === index ? { ...item, gpa: v || null } : item
                            ),
                          }))
                        }
                      />
                      <Field
                        label="Honors"
                        value={(ed.honors ?? []).join(", ")}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            education: f.education.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    honors: v
                                      .split(",")
                                      .map((part) => part.trim())
                                      .filter(Boolean),
                                  }
                                : item
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
              </CollapsedSection>
            </TabsContent>

            <TabsContent value="credentials" className="mt-4 space-y-6">
              <CollapsedSection
                title={`Certifications & Licenses (${form.certifications.length})`}
              >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Certifications & Licenses</h3>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        certifications: [
                          ...f.certifications,
                          { name: "", issuer: null, date: null, url: null },
                        ],
                      }))
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add certification
                  </Button>
                </div>
                {form.certifications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None listed.</p>
                ) : null}
                {form.certifications.map((item, index) => (
                  <div
                    key={`cert-${index}`}
                    className="space-y-3 rounded-md border border-border p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">Certification {index + 1}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label="Remove certification"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            certifications: f.certifications.filter(
                              (_, i) => i !== index
                            ),
                          }))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        label="Name"
                        value={item.name}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            certifications: f.certifications.map((row, i) =>
                              i === index ? { ...row, name: v } : row
                            ),
                          }))
                        }
                      />
                      <Field
                        label="Issuer"
                        value={item.issuer ?? ""}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            certifications: f.certifications.map((row, i) =>
                              i === index ? { ...row, issuer: v || null } : row
                            ),
                          }))
                        }
                      />
                      <Field
                        label="Date"
                        value={item.date ?? ""}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            certifications: f.certifications.map((row, i) =>
                              i === index ? { ...row, date: v || null } : row
                            ),
                          }))
                        }
                      />
                      <Field
                        label="URL"
                        type="url"
                        value={item.url ?? ""}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            certifications: f.certifications.map((row, i) =>
                              i === index ? { ...row, url: v || null } : row
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
              </CollapsedSection>

              <CollapsedSection title={`Honors & Awards (${form.awards.length})`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Honors & Awards</h3>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        awards: [
                          ...f.awards,
                          {
                            title: "",
                            issuer: null,
                            date: null,
                            description: null,
                          },
                        ],
                      }))
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add honor
                  </Button>
                </div>
                {form.awards.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None listed.</p>
                ) : null}
                {form.awards.map((item, index) => (
                  <div
                    key={`award-${index}`}
                    className="space-y-3 rounded-md border border-border p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">Honor {index + 1}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label="Remove honor"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            awards: f.awards.filter((_, i) => i !== index),
                          }))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        label="Title"
                        value={item.title}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            awards: f.awards.map((row, i) =>
                              i === index ? { ...row, title: v } : row
                            ),
                          }))
                        }
                      />
                      <Field
                        label="Issuer"
                        value={item.issuer ?? ""}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            awards: f.awards.map((row, i) =>
                              i === index ? { ...row, issuer: v || null } : row
                            ),
                          }))
                        }
                      />
                      <Field
                        label="Date"
                        value={item.date ?? ""}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            awards: f.awards.map((row, i) =>
                              i === index ? { ...row, date: v || null } : row
                            ),
                          }))
                        }
                      />
                      <Field
                        label="Description"
                        value={item.description ?? ""}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            awards: f.awards.map((row, i) =>
                              i === index ? { ...row, description: v || null } : row
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
              </CollapsedSection>

              <CollapsedSection title={`Interests (${form.interests.length})`}>
              <TagListEditor
                label="Interests"
                values={form.interests}
                onChange={(values) =>
                  setForm((f) => ({ ...f, interests: values }))
                }
              />
              </CollapsedSection>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4 sm:justify-between">
          {confirmReset ? (
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-left text-sm text-muted-foreground">
                This will reset your profile. A backup revision is saved so you
                can restore your data from History at any time.
              </p>
              <div className="flex shrink-0 justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setConfirmReset(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={clearProfile}
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Clear profile
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={pending || !profile}
                onClick={() => setConfirmReset(true)}
              >
                Clear profile
              </Button>
              <div className="flex items-center gap-3">
                {error ? (
                  <p className="max-w-sm text-left text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button type="button" disabled={pending} onClick={submit}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save profile
                </Button>
              </div>
            </>
          )}
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

function CollapsedSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-md border border-border">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
        {title}
      </summary>
      <div className="space-y-3 border-t border-border px-3 py-3">{children}</div>
    </details>
  );
}

function categoryOptions(current: string | null | undefined): string[] {
  const value = current?.trim() || "Work";
  if (
    (STANDARD_EXPERIENCE_CATEGORIES as readonly string[]).includes(value)
  ) {
    return [...STANDARD_EXPERIENCE_CATEGORIES];
  }
  return [value, ...STANDARD_EXPERIENCE_CATEGORIES];
}

function ProjectPointsEditor({
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
        <div key={bulletIndex} className="flex items-center gap-2">
          <Input
            value={bullet}
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
            className="text-muted-foreground hover:text-foreground"
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
        <div className="space-y-2">
          <Label>Category</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={experience.category || "Work"}
            onChange={(e) =>
              onChange({ ...experience, category: e.target.value || "Work" })
            }
          >
            {categoryOptions(experience.category).map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
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
