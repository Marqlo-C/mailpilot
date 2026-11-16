/**
 * ============================================================================
 * PURE TYPESCRIPT VECTOR MATH UTILITIES
 *
 * Lightweight vector math functions (cosine similarity, normalization,
 * Matryoshka dimension truncation, dot product, L2 norm) with strict dimension
 * mismatch guards and zero native dependencies.
 * ============================================================================
 */

/**
 * Thrown when two vectors of unequal dimensions are evaluated in dot product or cosine similarity.
 */
export class DimensionMismatchError extends Error {
  readonly lengthA: number;
  readonly lengthB: number;

  constructor(lengthA: number, lengthB: number) {
    super(
      `Vector dimension mismatch: vector A has length ${lengthA}, but vector B has length ${lengthB}.`
    );
    this.name = "DimensionMismatchError";
    this.lengthA = lengthA;
    this.lengthB = lengthB;
  }
}

/**
 * Thrown when an operation is requested on an empty vector.
 */
export class EmptyVectorError extends Error {
  constructor(operation: string = "Vector operation") {
    super(`${operation} cannot be performed on an empty vector.`);
    this.name = "EmptyVectorError";
  }
}

/**
 * Computes the dot product of two numeric vectors of identical dimensionality.
 *
 * @param vecA - First vector
 * @param vecB - Second vector
 * @returns Dot product scalar
 * @throws {EmptyVectorError} If either vector is empty
 * @throws {DimensionMismatchError} If vector dimensions differ
 */
export function dotProduct(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecB.length === 0) {
    throw new EmptyVectorError("Dot product");
  }

  if (vecA.length !== vecB.length) {
    throw new DimensionMismatchError(vecA.length, vecB.length);
  }

  let sum = 0;
  for (let i = 0; i < vecA.length; i++) {
    sum += vecA[i] * vecB[i];
  }

  return sum;
}

/**
 * Computes the Euclidean (L2) norm of a numeric vector.
 *
 * @param vec - Input vector
 * @returns L2 magnitude scalar
 */
export function vectorNorm(vec: number[]): number {
  if (vec.length === 0) {
    return 0;
  }

  let sumOfSquares = 0;
  for (let i = 0; i < vec.length; i++) {
    sumOfSquares += vec[i] * vec[i];
  }

  return Math.sqrt(sumOfSquares);
}

/**
 * Normalizes a vector to unit length (L2 norm = 1.0).
 * If the input vector has zero norm (all zeros), a new copy of the zero vector is returned.
 *
 * @param vec - Input vector
 * @returns New normalized unit vector
 * @throws {EmptyVectorError} If the vector is empty
 */
export function normalizeVector(vec: number[]): number[] {
  if (vec.length === 0) {
    throw new EmptyVectorError("Vector normalization");
  }

  const norm = vectorNorm(vec);
  if (norm === 0 || !Number.isFinite(norm)) {
    return new Array(vec.length).fill(0);
  }

  const result = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    result[i] = vec[i] / norm;
  }

  return result;
}

/**
 * Computes the cosine similarity between two numeric vectors.
 * Returns a scalar clamped between -1.0 and 1.0. If either vector has zero magnitude,
 * returns 0.0 to prevent NaN.
 *
 * @param vecA - First vector
 * @param vecB - Second vector
 * @returns Cosine similarity in range [-1.0, 1.0]
 * @throws {EmptyVectorError} If either vector is empty
 * @throws {DimensionMismatchError} If vector lengths differ
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecB.length === 0) {
    throw new EmptyVectorError("Cosine similarity");
  }

  if (vecA.length !== vecB.length) {
    throw new DimensionMismatchError(vecA.length, vecB.length);
  }

  const dot = dotProduct(vecA, vecB);
  const normA = vectorNorm(vecA);
  const normB = vectorNorm(vecB);

  if (normA === 0 || normB === 0 || !Number.isFinite(normA) || !Number.isFinite(normB)) {
    return 0;
  }

  const similarity = dot / (normA * normB);

  // Guard against float precision drift beyond [-1.0, 1.0]
  if (similarity > 1) return 1;
  if (similarity < -1) return -1;
  if (Number.isNaN(similarity)) return 0;

  return similarity;
}

/**
 * Truncates a vector to a lower dimensionality (Matryoshka representation) and optionally
 * re-normalizes the resulting vector to maintain unit length.
 *
 * @param vec - Source vector
 * @param targetDim - Target dimension length
 * @param renormalize - Whether to re-normalize the sliced vector (defaults to true)
 * @returns New sliced and optionally re-normalized vector
 * @throws {EmptyVectorError} If the input vector is empty
 * @throws {Error} If targetDim is non-positive or exceeds vector length
 */
export function truncateDimensions(
  vec: number[],
  targetDim: number,
  renormalize: boolean = true
): number[] {
  if (vec.length === 0) {
    throw new EmptyVectorError("Dimension truncation");
  }

  if (!Number.isInteger(targetDim) || targetDim <= 0) {
    throw new Error(
      `Target dimension must be a positive integer, received: ${targetDim}`
    );
  }

  if (targetDim > vec.length) {
    throw new Error(
      `Target dimension (${targetDim}) exceeds source vector length (${vec.length}).`
    );
  }

  const sliced = vec.slice(0, targetDim);

  if (renormalize) {
    return normalizeVector(sliced);
  }

  return sliced;
}
