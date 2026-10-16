/**
 * Cross-evaluates detected package manifests and subdirectories to deduce verified
 * architectural topologies (e.g., Python FastAPI paired with TypeScript Next.js).
 */
export function deduceArchitecturalTopology(
  manifestTechnologies: string[],
  manifestPaths: string[] = []
): string | null {
  const pkgs = new Set(manifestTechnologies.map((p) => p.toLowerCase()));
  const paths = manifestPaths.map((p) => p.toLowerCase());

  // Web & UI Frontends
  const hasNext = pkgs.has("next");
  const hasReact = pkgs.has("react") || pkgs.has("react-dom") || hasNext;
  const hasVue = pkgs.has("vue") || pkgs.has("nuxt");
  const hasSvelte = pkgs.has("svelte") || pkgs.has("@sveltejs/kit");
  const hasAngular = pkgs.has("@angular/core");
  const hasFrontend = hasNext || hasReact || hasVue || hasSvelte || hasAngular;

  // Backends
  const hasFastAPI = pkgs.has("fastapi");
  const hasPythonBackend =
    hasFastAPI ||
    pkgs.has("flask") ||
    pkgs.has("django") ||
    pkgs.has("tornado") ||
    pkgs.has("starlette") ||
    pkgs.has("sanic");

  const hasGoBackend =
    pkgs.has("gin") ||
    pkgs.has("echo") ||
    pkgs.has("fiber") ||
    pkgs.has("chi") ||
    pkgs.has("gorilla/mux");

  const hasRustBackend =
    pkgs.has("actix-web") ||
    pkgs.has("axum") ||
    pkgs.has("rocket") ||
    pkgs.has("warp");

  const hasNodeBackend =
    pkgs.has("express") ||
    pkgs.has("nest") ||
    pkgs.has("@nestjs/core") ||
    pkgs.has("fastify") ||
    pkgs.has("koa") ||
    pkgs.has("hono");

  // Real-time protocols
  const hasWebSockets =
    pkgs.has("ws") ||
    pkgs.has("socket.io") ||
    pkgs.has("socket.io-client") ||
    pkgs.has("websockets");

  // Distributed Cache / Broker
  const hasRedis =
    pkgs.has("redis") ||
    pkgs.has("ioredis") ||
    pkgs.has("aioredis");

  // Queues & Message Streaming
  const hasQueue =
    pkgs.has("kafkajs") ||
    pkgs.has("confluent-kafka") ||
    pkgs.has("kafka") ||
    pkgs.has("bull") ||
    pkgs.has("bullmq") ||
    pkgs.has("celery") ||
    pkgs.has("amqplib") ||
    pkgs.has("rabbitmq") ||
    pkgs.has("nats");

  const hasMonorepo =
    paths.some(
      (p) =>
        p.startsWith("apps/") ||
        p.startsWith("services/") ||
        p.startsWith("packages/") ||
        p.startsWith("backend/") ||
        p.startsWith("frontend/")
    );

  const parts: string[] = [];

  // Primary decoupled topology deduction
  if (hasPythonBackend && hasFrontend) {
    parts.push(
      "Decoupled service layer pairing an asynchronous Python backend with a TypeScript web frontend"
    );
  } else if (hasGoBackend && hasFrontend) {
    parts.push(
      "Decoupled architecture pairing a high-concurrency Go backend service with a reactive TypeScript web frontend"
    );
  } else if (hasRustBackend && hasFrontend) {
    parts.push(
      "High-performance architecture pairing a low-latency Rust backend engine with a TypeScript web frontend"
    );
  } else if (hasNodeBackend && hasFrontend && (hasMonorepo || paths.length >= 2)) {
    parts.push(
      "Decoupled full-stack TypeScript architecture pairing a Node.js API service layer with a reactive web client"
    );
  }

  // Real-time & messaging topology deduction
  if (hasWebSockets && hasRedis) {
    parts.push(
      "Distributed real-time messaging pipeline coordinating WebSocket gateways through Redis pub/sub state synchronization"
    );
  } else if (hasQueue) {
    parts.push(
      "Event-driven asynchronous processing pipeline orchestrating background job queues through message broker streaming"
    );
  } else if (hasRedis && !parts.some((p) => p.includes("Redis"))) {
    parts.push(
      "High-throughput caching and state coordination layer backed by Redis"
    );
  }

  if (parts.length === 0) {
    if (hasMonorepo) {
      return "Decoupled monorepo architecture coordinating multi-service application modules across segregated packages.";
    }
    return null;
  }

  if (parts.length === 1) {
    return `${parts[0]}.`;
  }

  return `${parts[0]}, integrated with a ${parts[1].charAt(0).toLowerCase() + parts[1].slice(1)}.`;
}
