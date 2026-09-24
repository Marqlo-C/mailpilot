"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { pingOllama } from "@/app/actions/accounts";
import {
  updateLlmProvider,
  updateOllamaUrl,
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
import { Switch } from "@/components/ui/switch";

type AiModelsCardProps = {
  accountId: string | null;
  llmProvider: string;
  localOllamaUrl: string;
};

export function AiModelsCard({
  accountId,
  llmProvider,
  localOllamaUrl,
}: AiModelsCardProps) {
  const router = useRouter();
  const [url, setUrl] = useState(localOllamaUrl);
  const [pingMessage, setPingMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const useOllama = llmProvider === "LOCAL_OLLAMA";
  const disabled = !accountId || pending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI & Models</CardTitle>
        <CardDescription>
          Prefer local Ollama when available; otherwise use OpenRouter free-tier
          fallbacks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!accountId && (
          <p className="text-sm text-muted-foreground">
            Connect an account to configure AI routing.
          </p>
        )}

        <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
          <div>
            <p className="text-sm font-medium">Use Local Ollama</p>
            <p className="text-xs text-muted-foreground">
              Falls back to OpenRouter if Ollama is unreachable.
            </p>
          </div>
          <Switch
            checked={useOllama}
            disabled={disabled}
            onCheckedChange={(checked) => {
              if (!accountId) return;
              startTransition(async () => {
                await updateLlmProvider(
                  accountId,
                  checked ? "LOCAL_OLLAMA" : "OPENROUTER"
                );
                router.refresh();
              });
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ollama-url">Ollama endpoint</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="ollama-url"
              value={url}
              disabled={disabled}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:11434"
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                if (!accountId) return;
                startTransition(async () => {
                  await updateOllamaUrl(accountId, url);
                  const result = await pingOllama(accountId, url);
                  setPingMessage(
                    result.ok
                      ? `Connected — ${result.data?.models ?? 0} model(s)`
                      : result.error
                  );
                  router.refresh();
                });
              }}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Ping Connection
            </Button>
          </div>
          {pingMessage && (
            <p className="text-sm text-muted-foreground">{pingMessage}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
