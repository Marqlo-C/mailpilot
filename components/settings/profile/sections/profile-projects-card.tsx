import React from "react";
import { FolderGit2, SquareArrowOutUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import {
  ENTRY_CHIP_CLASSNAME,
  EntryBulletList,
  EntryChip,
  SLIDABLE_BADGE_ROW_LEADING_OFFSET_PX,
  SettingsEntryCard,
  SettingsFeatureCard,
  SlidableBadgeRow,
} from "@/components/ui/tactile";
import { detectMetric, type ProjectInput } from "@/lib/validations/profile";
import { FormattedBulletText, SectionCountPill } from "./profile-common";

export function ProfileProjectsCard({
  projects,
  totalProjectBullets,
  isExpanded,
  onToggle,
  openItems,
  toggleItem,
  expandedVariants,
  toggleVariant,
}: {
  projects: ProjectInput[];
  totalProjectBullets: number;
  isExpanded: boolean;
  onToggle: () => void;
  openItems: Record<string, boolean>;
  toggleItem: (key: string) => void;
  expandedVariants: Record<string, boolean>;
  toggleVariant: (key: string) => void;
}) {
  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={FolderGit2} />}
      title="Projects & Practical Work"
      subtitle="Key practical initiatives, technical deliverables, descriptions, and technology stacks."
      statusBadge={
        projects.length > 0 ? (
          <SectionCountPill count={projects.length}>
            <span>
              {projects.length}{" "}
              {projects.length === 1 ? "Project" : "Projects"}
            </span>
            {totalProjectBullets > 0 ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-2.5 w-px shrink-0 bg-border/90"
                />
                <span>
                  {totalProjectBullets}{" "}
                  {totalProjectBullets === 1 ? "Bullet" : "Bullets"}
                </span>
              </>
            ) : null}
          </SectionCountPill>
        ) : null
      }
      isExpanded={isExpanded}
      onToggle={onToggle}
      curvedDivider
    >
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects saved.</p>
      ) : (
        <div className="space-y-3">
          {[...projects]
            .sort((a, b) =>
              (a.name || "").localeCompare(b.name || "", undefined, {
                sensitivity: "base",
              })
            )
            .map((project, pIndex) => {
              const itemKey = `project-${project.id ?? project.name ?? pIndex}`;
              const isItemExpanded = openItems[itemKey] ?? true;
              const hasTools = project.technologies.length > 0;
              const toolLabel = hasTools
                ? `${project.technologies.length} ${project.technologies.length === 1 ? "Tool" : "Tools"}`
                : null;

              return (
                <SettingsEntryCard
                  key={itemKey}
                  index={pIndex + 1}
                  title={
                    <div className="inline-flex items-center gap-1.5 leading-none max-w-full">
                      <h4 className="text-sm font-semibold text-foreground truncate leading-none">
                        {project.name}
                      </h4>
                      {project.link ? (
                        <a
                          href={project.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center justify-center self-center text-muted-foreground/60 hover:text-foreground transition-colors shrink-0 p-0.5"
                          title="Open repository"
                        >
                          <SquareArrowOutUpRight className="size-3.5 shrink-0" />
                        </a>
                      ) : null}
                    </div>
                  }
                  subtitle={project.description || undefined}
                  trailing={
                    toolLabel ? (
                      <EntryChip>
                        {toolLabel}
                      </EntryChip>
                    ) : null
                  }
                  isExpanded={isItemExpanded}
                  onToggle={() => toggleItem(itemKey)}
                  curvedDivider
                >
                  {project.technologies.length > 0 && (
                    <SlidableBadgeRow>
                      {project.technologies.map((tech) => (
                        <Badge key={tech} variant="outline" className={ENTRY_CHIP_CLASSNAME}>
                          {tech}
                        </Badge>
                      ))}
                    </SlidableBadgeRow>
                  )}
                  {project.bullets.length > 0 ? (() => {
                    const renderBulletItem = (bullet: string, bIdx: number, sourceKey = "bullet") => {
                      const bulletVariants = (project.variants || []).filter(
                        (v) => v.shadowOf === bullet || v.shadowOf === String(bIdx)
                      );
                      const variantKey = `${itemKey}-${sourceKey}-${bIdx}-variants`;
                      const isVariantExpanded = expandedVariants[variantKey] ?? false;

                      return {
                        key: `proj-${sourceKey}-${bIdx}`,
                        content: (
                          <div className="space-y-1 w-full">
                            <div className="text-xs leading-relaxed text-foreground/90">
                              <FormattedBulletText
                                text={bullet}
                                hasMetric={detectMetric(bullet)}
                                variantsCount={bulletVariants.length}
                                onToggleVariants={() => toggleVariant(variantKey)}
                              />
                            </div>
                            {bulletVariants.length > 0 && isVariantExpanded ? (
                              <div className="mt-1.5 ml-1 border-l-2 border-border/60 pl-2.5 py-1 space-y-1.5 animate-in fade-in-50 duration-150">
                                {bulletVariants.map((v, vIdx) => (
                                  <div
                                    key={`v-${vIdx}`}
                                    className="rounded bg-muted/30 p-2 text-[11px] leading-relaxed text-muted-foreground border border-border/40"
                                  >
                                    <div className="flex items-center gap-1.5 mb-1 text-[10px] font-medium text-foreground/80">
                                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                                        {v.origin === "HUMAN_VERIFIED"
                                          ? "Prior Revision"
                                          : v.origin === "GITHUB_INFERRED"
                                          ? "Inferred Variant"
                                          : "Variant"}
                                      </Badge>
                                      {v.confidenceScore ? (
                                        <span className="text-muted-foreground">
                                          {Math.round(v.confidenceScore * 100)}% match
                                        </span>
                                      ) : null}
                                    </div>
                                    <p>{v.text}</p>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ),
                      };
                    };

                    const isHumanBullet = (bullet: string, idx: number) => {
                      const origin =
                        project.bulletOrigins?.[bullet] ??
                        project.bulletOrigins?.[String(idx)] ??
                        project.origin;
                      return origin === "HUMAN_VERIFIED" || origin === undefined;
                    };

                    const resumeBullets = project.bullets
                      .map((b, idx) => ({ b, idx }))
                      .filter(({ b, idx }) => isHumanBullet(b, idx));

                    const inferredBullets = project.bullets
                      .map((b, idx) => ({ b, idx }))
                      .filter(({ b, idx }) => !isHumanBullet(b, idx));

                    const hasSplit = resumeBullets.length > 0 && inferredBullets.length > 0;

                    if (hasSplit) {
                      return (
                        <div className="space-y-3.5 pt-1">
                          <div className="space-y-2">
                            <div
                              className="flex items-center"
                              style={{
                                marginInline: `${SLIDABLE_BADGE_ROW_LEADING_OFFSET_PX}px`,
                              }}
                            >
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                User-Verified
                              </span>
                            </div>
                            <EntryBulletList
                              items={resumeBullets.map(({ b, idx }) =>
                                renderBulletItem(b, idx, "resume")
                              )}
                            />
                          </div>

                          <div className="space-y-2">
                            <div
                              className="relative py-2 my-1"
                              style={{
                                marginInline: `${SLIDABLE_BADGE_ROW_LEADING_OFFSET_PX}px`,
                              }}
                            >
                              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="w-full border-t border-border/60" />
                              </div>
                              <div className="relative flex items-center justify-start">
                                <span className="bg-card pr-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Externally-Sourced
                                </span>
                              </div>
                            </div>
                            <EntryBulletList
                              items={inferredBullets.map(({ b, idx }) =>
                                renderBulletItem(b, idx, "inferred")
                              )}
                            />
                          </div>
                        </div>
                      );
                    }

                    if (project.origin === "GITHUB_INFERRED" || inferredBullets.length === project.bullets.length) {
                      return (
                        <div className="space-y-2 pt-1">
                          <div
                            className="flex items-center"
                            style={{
                              marginInline: `${SLIDABLE_BADGE_ROW_LEADING_OFFSET_PX}px`,
                            }}
                          >
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Externally-Sourced
                            </span>
                          </div>
                          <EntryBulletList
                            items={project.bullets.map((b, idx) =>
                              renderBulletItem(b, idx, "inferred")
                            )}
                          />
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2 pt-1">
                        <div
                          className="flex items-center"
                          style={{
                            marginInline: `${SLIDABLE_BADGE_ROW_LEADING_OFFSET_PX}px`,
                          }}
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            User-Verified
                          </span>
                        </div>
                        <EntryBulletList
                          items={project.bullets.map((b, idx) =>
                            renderBulletItem(b, idx, "resume")
                          )}
                        />
                      </div>
                    );
                  })() : null}
                  {project.technologies.length === 0 && project.bullets.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No additional details recorded.</p>
                  ) : null}
                </SettingsEntryCard>
              );
            })}
        </div>
      )}
    </SettingsFeatureCard>
  );
}
