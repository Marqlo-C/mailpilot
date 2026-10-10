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
    it("gracefully catches CloudLlmRateLimitError and falls back to deterministic heuristic classification for application confirmation", async () => {
      vi.spyOn(dispatcher, "callLLMWithFallback").mockRejectedValue(
        new CloudLlmRateLimitError("OPENROUTER", "qwen/qwen3.8-27b:free")
      );

      const result = await classifyJobEmail({
        subject: "Thank you for applying to Stripe",
        body: "We received your application for the Software Engineer role. Our team will review your profile shortly.",
        fromEmail: "jobs@stripe.com",
        cloudModel: "custom/model-v1",
      });

      expect(result).not.toBeNull();
      expect(result?.is_job_related).toBe(true);
      expect(result?.email_category).toBe("APPLICATION_STATUS");
      expect(result?.company_name).toBe("Stripe");
      expect(result?.status).toBe("APPLIED");
      expect(result?.jobs?.[0]?.isAlreadyApplied).toBe(true);
    });

    it("passes custom cloudModel and prioritizes it in candidateModels to callLLMWithFallback", async () => {
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
      expect(callArgs.openRouterModels).toEqual(["anthropic/claude-3.5-sonnet"]);
    });
  });
});
