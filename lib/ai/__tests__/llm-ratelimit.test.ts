import { describe, expect, it, vi, beforeEach } from "vitest";
import { CloudLlmRateLimitError } from "../client";
import { classifyJobEmail } from "../classification";
import * as dispatcher from "../dispatcher";

describe("LLM Engine Model Priority & Rate Limit Fallback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("CloudLlmRateLimitError", () => {
    it("instantiates with provider and model", () => {
      const err = new CloudLlmRateLimitError("OPENROUTER", "meta-llama/llama-3.1-8b-instruct");
      expect(err.name).toBe("CloudLlmRateLimitError");
      expect(err.message).toContain("Rate limit reached for OPENROUTER (meta-llama/llama-3.1-8b-instruct)");
    });
  });

  describe("classifyJobEmail Rate Limit Fallback", () => {
    it("gracefully catches CloudLlmRateLimitError and returns null to park as PENDING_AI", async () => {
      vi.spyOn(dispatcher, "callLLMWithFallback").mockRejectedValue(
        new CloudLlmRateLimitError("OPENROUTER", "qwen/qwen3.8-27b:free")
      );

      const result = await classifyJobEmail({
        subject: "Thank you for applying to Stripe",
        body: "We received your application for the Software Engineer role. Our team will review your profile shortly.",
        fromEmail: "jobs@stripe.com",
        cloudModel: "custom/model-v1",
      });

      expect(result).toBeNull();
    });

    it("passes custom cloudModel directly to callLLMWithFallback without candidate arrays", async () => {
      const callSpy = vi
        .spyOn(dispatcher, "callLLMWithFallback")
        .mockResolvedValue({
          is_job_related: true,
          email_category: "JOB_BOARD_DIGEST",
          jobs: [],
        });

      await classifyJobEmail({
        subject: "New Job Alert: Technical Architect",
        body: "Here are new job listings for your review today.",
        fromEmail: "alerts@linkedin.com",
        cloudModel: "anthropic/claude-3.5-sonnet",
      });

      expect(callSpy).toHaveBeenCalledTimes(1);
      const callArgs = callSpy.mock.calls[0][0];
      expect(callArgs.cloudModel).toBe("anthropic/claude-3.5-sonnet");
      expect(callArgs.openRouterModels).toBeUndefined();
    });
  });

  describe("callCloudLlmJson strict model targeting", () => {
    it("attempts only the user-specified model exactly once without candidate rotation on 429", async () => {
      const { callCloudLlmJson } = await import("../client");

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        status: 429,
        ok: false,
        text: async () => "Rate limit exceeded",
      } as unknown as Response);

      await expect(
        callCloudLlmJson({
          provider: "OPENROUTER",
          apiKey: "test-key",
          model: "openai/gpt-4o",
          systemPrompt: "sys",
          userPrompt: "user",
        })
      ).rejects.toThrow(CloudLlmRateLimitError);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const fetchBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(fetchBody.model).toBe("openai/gpt-4o");
    });
  });
});
