"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  addExcludedTitle,
  removeExcludedTitle,
} from "@/app/actions/settings";
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

type ExcludedTitlesCardProps = {
  accountId: string | null;
  excludedTitles: string[];
};

/**
 * Manage role patterns banned via "Less like this".
 */
export function ExcludedTitlesCard({
  accountId,
  excludedTitles,
}: ExcludedTitlesCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const disabled = !accountId || pending;

  function handleAdd() {
    if (!accountId) return;
    const title = draft.trim();
    if (!title) return;
    startTransition(async () => {
      const result = await addExcludedTitle(accountId, title);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDraft("");
      toast.success(`Excluded “${title}”`);
      router.refresh();
    });
  }

  function handleRemove(title: string) {
    if (!accountId) return;
    startTransition(async () => {
      const result = await removeExcludedTitle(accountId, title);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Removed “${title}”`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Excluded Job Titles</CardTitle>
        <CardDescription>
          Roles flagged with &quot;Less like this&quot; — matching listings score
          low and stay soft-hidden.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!accountId ? (
          <p className="text-sm text-muted-foreground">
            Connect an account to manage excluded titles.
          </p>
        ) : null}

        {excludedTitles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No excluded titles yet. Select &quot;Less like this&quot; from the
            &quot;…&quot; menu on any job card to train the filter.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {excludedTitles.map((title) => (
              <span
                key={title}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-300"
              >
                <span className="truncate">{title}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleRemove(title)}
                  className="rounded-full p-0.5 text-amber-700/80 transition-colors hover:bg-amber-500/20 hover:text-amber-900 disabled:opacity-50 dark:text-amber-300/80 dark:hover:text-amber-200"
                  aria-label={`Remove ${title}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="excluded-title-input">Add a title pattern</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="excluded-title-input"
              value={draft}
              disabled={disabled}
              placeholder='e.g. "Sales Representative"'
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled || !draft.trim()}
              onClick={handleAdd}
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
