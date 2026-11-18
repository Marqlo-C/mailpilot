"use client";

import Link from "next/link";
import { Activity, Bot, Cpu, Mail, SlidersHorizontal } from "lucide-react";
import { useOptionalSyncStatus } from "@/components/layout/sync-status-provider";
import type { AccountWithSettings } from "@/lib/data";
import { cn } from "@/lib/utils";

interface ConsolePulseCapsulesProps {
  activeAccount: AccountWithSettings | null;
  className?: string;
}

export function ConsolePulseCapsules({
  activeAccount,
  className,
}: ConsolePulseCapsulesProps) {
  const syncStatus = useOptionalSyncStatus();
  const isSyncing = syncStatus?.isSyncing ?? activeAccount?.isSyncing ?? false;
  const isConnected = Boolean(activeAccount);

  const ollamaModel =
    activeAccount?.settings?.ollamaModel?.trim() || "llama3.1:8b";
  const ollamaConnected = activeAccount?.rules?.bridgeConnected ?? false;
  const ollamaConfigured = Boolean(activeAccount?.settings?.localOllamaUrl);

  const scrapersActive = Boolean(
    activeAccount?.rules?.encryptedHasDataApiKey ||
      activeAccount?.rules?.encryptedScrapingAntApiKey ||
      activeAccount?.hasCredentials
  );

  const matchThreshold = activeAccount?.matchThreshold ?? 70;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 pt-1 text-xs sm:gap-2.5",
        className
      )}
      role="region"
      aria-label="System status telemetry"
    >
      {/* 1. Gmail Sync Indicator Capsule */}
      <Link
        href="/settings"
        className="group inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 shadow-2xs backdrop-blur-xs transition-all duration-150 hover:border-primary/40 hover:bg-muted/50 mp-specular-depth active:scale-95"
        title={
          isSyncing
            ? "Syncing inbox right now…"
            : isConnected
            ? `Gmail connected (${activeAccount?.email})`
            : "No Gmail account connected"
        }
      >
        <span className="relative flex size-2 shrink-0">
          {isSyncing ? (
            <>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-sky-500" />
            </>
          ) : isConnected ? (
            <>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 duration-1000" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </>
          ) : (
            <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
          )}
        </span>
        <Mail className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
        <span className="font-medium text-foreground">
          {isSyncing
            ? "Gmail Syncing…"
            : isConnected
            ? "Gmail Sync Active"
            : "Gmail Disconnected"}
        </span>
      </Link>

      {/* 2. Local Ollama Indicator Capsule */}
      <Link
        href="/settings"
        className="group inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 shadow-2xs backdrop-blur-xs transition-all duration-150 hover:border-primary/40 hover:bg-muted/50 mp-specular-depth active:scale-95"
        title={`Local Ollama Engine: ${ollamaModel}`}
      >
        <span className="relative flex size-2 shrink-0">
          {ollamaConnected ? (
            <>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal-400 opacity-60 duration-1000" />
              <span className="relative inline-flex size-2 rounded-full bg-teal-500" />
            </>
          ) : ollamaConfigured ? (
            <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
          ) : (
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          )}
        </span>
        <Bot className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
        <span className="font-medium text-foreground">
          Ollama: <span className="text-muted-foreground">{ollamaModel}</span>
        </span>
      </Link>

      {/* 3. Scrapers Health Capsule */}
      <Link
        href="/settings"
        className="group inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 shadow-2xs backdrop-blur-xs transition-all duration-150 hover:border-primary/40 hover:bg-muted/50 mp-specular-depth active:scale-95"
        title="Web Scraping Engine: HasData & Radar Scrapers"
      >
        <span className="relative flex size-2 shrink-0">
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        <Cpu className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
        <span className="font-medium text-foreground">
          Scrapers:{" "}
          <span className="text-muted-foreground">
            {scrapersActive ? "HasData Active" : "Ready"}
          </span>
        </span>
      </Link>

      {/* 4. Match Threshold Context Capsule */}
      <Link
        href="/settings"
        className="group inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 shadow-2xs backdrop-blur-xs transition-all duration-150 hover:border-primary/40 hover:bg-muted/50 mp-specular-depth active:scale-95"
        title={`Match threshold: minimum ${matchThreshold}% score`}
      >
        <SlidersHorizontal className="size-3 text-muted-foreground group-hover:text-foreground transition-colors" />
        <span className="font-medium text-foreground">
          Threshold:{" "}
          <span className="text-muted-foreground">{matchThreshold}%</span>
        </span>
      </Link>
    </div>
  );
}
