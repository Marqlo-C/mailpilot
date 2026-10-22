import { lookup } from "dns/promises";
import { isIP } from "net";

/**
 * Returns true if an IPv4 address is in a dotted-quad CIDR range.
 */
function ipv4InCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  if (!range || Number.isNaN(bits) || bits < 0 || bits > 32) {
    return false;
  }

  const ipNum = ipv4ToInt(ip);
  const rangeNum = ipv4ToInt(range);
  if (ipNum === null || rangeNum === null) {
    return false;
  }

  if (bits === 0) {
    return true;
  }

  const mask = (~0 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }

  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null;
    }
    value = (value << 8) + octet;
  }

  return value >>> 0;
}

function expandIpv6(ip: string): number[] | null {
  const lower = ip.toLowerCase();
  if (lower.includes(".")) {
    // IPv4-mapped IPv6 — handled separately
    return null;
  }

  const halves = lower.split("::");
  if (halves.length > 2) {
    return null;
  }

  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - (head.length + tail.length);
  if (missing < 0) {
    return null;
  }

  const groups = [
    ...head,
    ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => "0"),
    ...tail,
  ];

  if (groups.length !== 8) {
    return null;
  }

  const nums: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) {
      return null;
    }
    nums.push(parseInt(group, 16));
  }

  return nums;
}

function ipv6InCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  if (!range || Number.isNaN(bits) || bits < 0 || bits > 128) {
    return false;
  }

  const ipGroups = expandIpv6(ip);
  const rangeGroups = expandIpv6(range);
  if (!ipGroups || !rangeGroups) {
    return false;
  }

  let remaining = bits;
  for (let i = 0; i < 8; i++) {
    const blockBits = Math.min(remaining, 16);
    if (blockBits <= 0) {
      break;
    }
    const mask = blockBits === 16 ? 0xffff : (~0 << (16 - blockBits)) & 0xffff;
    if ((ipGroups[i] & mask) !== (rangeGroups[i] & mask)) {
      return false;
    }
    remaining -= blockBits;
  }

  return true;
}

/**
 * Extracts an IPv4 address from an IPv4-mapped IPv6 address (::ffff:a.b.c.d).
 */
function extractMappedIpv4(ip: string): string | null {
  const lower = ip.toLowerCase();
  const match = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (match) {
    return match[1];
  }

  const hexMatch = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMatch) {
    const hi = parseInt(hexMatch[1], 16);
    const lo = parseInt(hexMatch[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  return null;
}

const BLOCKED_IPV4_CIDRS = [
  "0.0.0.0/8", // "this" network
  "10.0.0.0/8", // private
  "127.0.0.0/8", // loopback
  "169.254.0.0/16", // link-local (incl. 169.254.169.254 metadata)
  "172.16.0.0/12", // private
  "192.168.0.0/16", // private
  "100.64.0.0/10", // carrier-grade NAT
] as const;

const BLOCKED_IPV6_CIDRS = [
  "::1/128", // loopback
  "::/128", // unspecified
  "fc00::/7", // unique local
  "fe80::/10", // link-local
] as const;

/**
 * Returns true when the IP must not be contacted for outbound unsubscribe fetches.
 */
export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    return BLOCKED_IPV4_CIDRS.some((cidr) => ipv4InCidr(ip, cidr));
  }

  if (version === 6) {
    const mapped = extractMappedIpv4(ip);
    if (mapped) {
      return isBlockedIp(mapped);
    }
    return BLOCKED_IPV6_CIDRS.some((cidr) => ipv6InCidr(ip, cidr));
  }

  return true;
}

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

/**
 * Ensures a URL is https: and resolves to a public, non-reserved IP.
 */
export async function assertSafeHttpsUrl(urlString: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new SsrfError("Invalid URL");
  }

  if (url.protocol !== "https:") {
    throw new SsrfError("Only https: URLs are allowed for outbound requests");
  }

  if (url.username || url.password) {
    throw new SsrfError("URLs with credentials are not allowed");
  }

  const hostname = url.hostname;
  if (!hostname) {
    throw new SsrfError("URL missing hostname");
  }

  // Literal IP in the URL host
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new SsrfError(`Blocked destination IP: ${hostname}`);
    }
    return url;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new SsrfError(`DNS lookup returned no addresses for ${hostname}`);
  }

  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw new SsrfError(
        `Blocked destination IP ${record.address} for host ${hostname}`
      );
    }
  }

  return url;
}

const BROWSER_UA =
  "Mozilla/5.0 (compatible; MailPilot/1.0; +https://mailpilot.local)";

/**
 * Performs an SSRF-validated fetch (https only, no credentials, public IPs).
 */
export async function safeFetch(
  urlString: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = await assertSafeHttpsUrl(urlString);

  const headers = new Headers(init.headers);
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", BROWSER_UA);
  }
  headers.delete("Cookie");
  headers.delete("Authorization");

  return fetch(url.toString(), {
    ...init,
    headers,
    redirect: "manual",
    credentials: "omit",
  });
}
