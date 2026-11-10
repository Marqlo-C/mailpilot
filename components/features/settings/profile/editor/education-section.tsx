import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MasterProfileUpdateInput } from "@/lib/validations/profile.schema";
import { CollapsedSection, Field, newId } from "./common";
import { TagListEditor } from "./skills-section";

export function EducationSection({
  form,
  setForm,
}: {
  form: MasterProfileUpdateInput;
  setForm: React.Dispatch<React.SetStateAction<MasterProfileUpdateInput>>;
}) {
  return (
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
                    endDate: null,
                    graduationDate: null,
                    status: "GRADUATED",
                    honors: [],
                    coursework: [],
                  },
                ],
              }))
            }
          >
            <Plus className="h-4 w-4" />
            Add education
          </Button>
        </div>
        {form.education.map((item, index) => (
          <div
            key={item.id ?? index}
            className="space-y-3 rounded-md border border-border p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">Education {index + 1}</p>
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
                value={item.institution}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    education: f.education.map((row, i) =>
                      i === index ? { ...row, institution: v } : row
                    ),
                  }))
                }
              />
              <Field
                label="School / College"
                value={item.subSchool ?? ""}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    education: f.education.map((row, i) =>
                      i === index ? { ...row, subSchool: v || null } : row
                    ),
                  }))
                }
              />
              <Field
                label="Degree"
                value={item.degree ?? ""}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    education: f.education.map((row, i) =>
                      i === index ? { ...row, degree: v || null } : row
                    ),
                  }))
                }
              />
              <Field
                label="Field of Study"
                value={item.fieldOfStudy ?? ""}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    education: f.education.map((row, i) =>
                      i === index ? { ...row, fieldOfStudy: v || null } : row
                    ),
                  }))
                }
              />
              <Field
                label="Start Date"
                value={item.startDate ?? ""}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    education: f.education.map((row, i) =>
                      i === index ? { ...row, startDate: v || null } : row
                    ),
                  }))
                }
              />
              <Field
                label="Graduation Date"
                value={item.graduationDate ?? item.endDate ?? ""}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    education: f.education.map((row, i) =>
                      i === index
                        ? {
                            ...row,
                            graduationDate: v || null,
                            endDate: v || null,
                          }
                        : row
                    ),
                  }))
                }
              />
            </div>
            <TagListEditor
              label="Relevant Coursework"
              values={item.coursework ?? []}
              onChange={(values) =>
                setForm((f) => ({
                  ...f,
                  education: f.education.map((row, i) =>
                    i === index ? { ...row, coursework: values } : row
                  ),
                }))
              }
            />
          </div>
        ))}
      </div>
    </CollapsedSection>
  );
}
