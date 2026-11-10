import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MasterProfileUpdateInput } from "@/lib/validations/profile.schema";
import { CollapsedSection, Field } from "./common";

export function CredentialsSection({
  form,
  setForm,
}: {
  form: MasterProfileUpdateInput;
  setForm: React.Dispatch<React.SetStateAction<MasterProfileUpdateInput>>;
}) {
  return (
    <div className="space-y-6">
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

      <CollapsedSection title={`Activities & Interests (${form.interests.length})`}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Activities & Interests</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  interests: [...f.interests, ""],
                }))
              }
            >
              <Plus className="h-4 w-4" />
              Add activity
            </Button>
          </div>
          {form.interests.length === 0 ? (
            <p className="text-sm text-muted-foreground">None listed.</p>
          ) : null}
          <div className="space-y-2">
            {form.interests.map((interest, index) => (
              <div key={`interest-${index}`} className="flex items-center gap-2">
                <Input
                  value={interest}
                  placeholder="e.g. Open Source, Distance Running, Mentorship"
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      interests: f.interests.map((item, i) =>
                        i === index ? e.target.value : item
                      ),
                    }))
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      interests: f.interests.filter((_, i) => i !== index),
                    }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </CollapsedSection>
    </div>
  );
}
