import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  DimensionMismatchError,
  dotProduct,
  EmptyVectorError,
  normalizeVector,
  truncateDimensions,
  vectorNorm,
} from "../vector-math";

describe("Vector Math Utilities", () => {
  describe("dotProduct", () => {
    it("calculates standard dot product accurately", () => {
      const vecA = [1, 2, 3];
      const vecB = [4, 5, 6];
      // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
      expect(dotProduct(vecA, vecB)).toBe(32);
    });

    it("throws DimensionMismatchError when dimensions differ", () => {
      const vecA = [1, 2, 3];
      const vecB = [1, 2];
      expect(() => dotProduct(vecA, vecB)).toThrow(DimensionMismatchError);
    });

    it("throws EmptyVectorError when vectors are empty", () => {
      expect(() => dotProduct([], [])).toThrow(EmptyVectorError);
      expect(() => dotProduct([1, 2], [])).toThrow(EmptyVectorError);
    });
  });

  describe("vectorNorm", () => {
    it("computes Euclidean norm correctly", () => {
      expect(vectorNorm([3, 4])).toBe(5);
      expect(vectorNorm([0, 0, 0])).toBe(0);
      expect(vectorNorm([])).toBe(0);
    });
  });

  describe("normalizeVector", () => {
    it("normalizes a non-zero vector to unit length (L2 norm = 1.0)", () => {
      const vec = [3, 4];
      const normalized = normalizeVector(vec);

      expect(normalized[0]).toBeCloseTo(0.6, 6);
      expect(normalized[1]).toBeCloseTo(0.8, 6);
      expect(vectorNorm(normalized)).toBeCloseTo(1.0, 6);
    });

    it("does not mutate original vector", () => {
      const vec = [3, 4];
      normalizeVector(vec);
      expect(vec).toEqual([3, 4]);
    });

    it("handles zero vector safely without NaN", () => {
      const zeroVec = [0, 0, 0];
      const normalized = normalizeVector(zeroVec);
      expect(normalized).toEqual([0, 0, 0]);
      expect(normalized.every((v) => Number.isFinite(v))).toBe(true);
    });

    it("throws EmptyVectorError on empty input", () => {
      expect(() => normalizeVector([])).toThrow(EmptyVectorError);
    });
  });

  describe("cosineSimilarity", () => {
    it("returns 1.0 for identical vectors", () => {
      const vecA = [0.5, 0.5, 0.5, 0.5];
      const vecB = [0.5, 0.5, 0.5, 0.5];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 6);
    });

    it("returns 1.0 for parallel vectors of different scales", () => {
      const vecA = [1, 2, 3];
      const vecB = [2, 4, 6];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 6);
    });

    it("returns 0.0 for orthogonal vectors", () => {
      const vecA = [1, 0, 0];
      const vecB = [0, 1, 0];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0.0, 6);
    });

    it("returns -1.0 for opposite vectors", () => {
      const vecA = [1, 0];
      const vecB = [-1, 0];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(-1.0, 6);
    });

    it("safely handles zero vectors by returning 0.0 without NaN", () => {
      const zero = [0, 0, 0];
      const valid = [1, 2, 3];
      expect(cosineSimilarity(zero, valid)).toBe(0.0);
      expect(cosineSimilarity(valid, zero)).toBe(0.0);
      expect(cosineSimilarity(zero, zero)).toBe(0.0);
    });

    it("throws DimensionMismatchError when dimensions differ", () => {
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(
        DimensionMismatchError
      );
    });

    it("throws EmptyVectorError when either vector is empty", () => {
      expect(() => cosineSimilarity([], [1, 2])).toThrow(EmptyVectorError);
      expect(() => cosineSimilarity([1, 2], [])).toThrow(EmptyVectorError);
    });

    it("clamps floating point values within [-1.0, 1.0]", () => {
      const vec = [0.5773502691896258, 0.5773502691896258, 0.5773502691896258];
      const sim = cosineSimilarity(vec, vec);
      expect(sim).toBeLessThanOrEqual(1.0);
      expect(sim).toBeGreaterThanOrEqual(-1.0);
    });
  });

  describe("truncateDimensions (Matryoshka Scaling)", () => {
    it("slices vector and re-normalizes by default", () => {
      const vec = [1, 2, 3, 4];
      const truncated = truncateDimensions(vec, 2, true);

      expect(truncated.length).toBe(2);
      expect(vectorNorm(truncated)).toBeCloseTo(1.0, 6);
      expect(truncated[0]).toBeCloseTo(1 / Math.sqrt(5), 6);
      expect(truncated[1]).toBeCloseTo(2 / Math.sqrt(5), 6);
    });

    it("slices vector without re-normalizing when renormalize is false", () => {
      const vec = [1, 2, 3, 4];
      const truncated = truncateDimensions(vec, 2, false);

      expect(truncated).toEqual([1, 2]);
    });

    it("throws when target dimension exceeds vector length", () => {
      const vec = [1, 2];
      expect(() => truncateDimensions(vec, 3)).toThrow(
        "exceeds source vector length"
      );
    });

    it("throws when target dimension is non-positive or invalid", () => {
      const vec = [1, 2, 3];
      expect(() => truncateDimensions(vec, 0)).toThrow("positive integer");
      expect(() => truncateDimensions(vec, -1)).toThrow("positive integer");
      expect(() => truncateDimensions(vec, 1.5)).toThrow("positive integer");
    });

    it("throws on empty vector", () => {
      expect(() => truncateDimensions([], 1)).toThrow(EmptyVectorError);
    });
  });
});
