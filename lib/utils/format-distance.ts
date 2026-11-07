/**
 * Tiny relative-time formatter (no date-fns dependency).
 * Short units: s, m, h, d, w, mo, y.
 */
export function formatDistanceToNow(
  date: Date,
  options?: { addSuffix?: boolean }
): string {
  const ms = Date.now() - date.getTime();
  const seconds = Math.round(Math.abs(ms) / 1000);
  const addSuffix = options?.addSuffix === true;
  const future = ms < 0;

  const format = (value: number, unit: string) => {
    const label = `${value}${unit}`;
    if (!addSuffix) return label;
    return future ? `in ${label}` : `${label} ago`;
  };

  if (seconds < 45) return format(Math.max(1, seconds), "s");
  if (seconds < 90) return format(1, "m");
  const minutes = Math.round(seconds / 60);
  if (minutes < 45) return format(minutes, "m");
  if (minutes < 90) return format(1, "h");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return format(hours, "h");
  if (hours < 42) return format(1, "d");
  const days = Math.round(hours / 24);
  if (days < 7) return format(days, "d");
  const weeks = Math.round(days / 7);
  if (days < 30) return format(Math.max(1, weeks), "w");
  const months = Math.round(days / 30);
  if (months < 12) return format(Math.max(1, months), "mo");
  const years = Math.round(days / 365);
  return format(Math.max(1, years), "y");
}

/**
 * Normalizes any date input (Date object, ISO string, relative text like "3 days ago", "2w", "today")
 * into consistent short unit format:
 * - With addSuffix: false (standard for Posted): "#<unit>" e.g. "3d", "2w", "5h", "1mo"
 * - With addSuffix: true (standard for Received): "#<unit> ago" e.g. "3d ago", "2w ago", "5h ago"
 *
 * When referenceDate is provided (e.g. email receivedAt timestamp), relative expressions
 * ("5d", "3 days ago", "today") are anchored to that reference time rather than Date.now(),
 * preventing posted dates from appearing more recent than the date the email was received.
 */
export function formatRelativeTime(
  input: Date | string | null | undefined,
  options?: {
    addSuffix?: boolean;
    referenceDate?: Date | string | null;
  }
): string | null {
  if (!input) return null;
  const addSuffix = options?.addSuffix === true;

  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    return formatDistanceToNow(input, { addSuffix });
  }

  const raw = String(input).trim();
  if (
    !raw ||
    /^(?:unspecified|not\s+specified|n\/?a|unknown|none)$/i.test(raw)
  ) {
    return null;
  }

  // 1. ISO dates (YYYY-MM-DD...) or standard date strings (e.g. "October 24, 2026")
  const parsedDate = Date.parse(raw);
  if (
    !isNaN(parsedDate) &&
    (/^\d{4}-\d{2}-\d{2}/.test(raw) ||
      /^[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}/.test(raw))
  ) {
    return formatDistanceToNow(new Date(parsedDate), { addSuffix });
  }

  // 2. Relative date expression handling (e.g. "5d", "5 days ago", "yesterday", "today")
  let cleaned = raw
    .replace(/^(?:reposted|posted)\s*[:\s-]*\s*/i, "")
    .replace(/\s*ago\s*$/i, "")
    .trim();

  // Determine reference timestamp (when was this relative string stated?)
  let refTime = Date.now();
  let hasExplicitRef = false;
  if (options?.referenceDate) {
    const parsedRef =
      options.referenceDate instanceof Date
        ? options.referenceDate.getTime()
        : Date.parse(String(options.referenceDate));
    if (!isNaN(parsedRef)) {
      refTime = parsedRef;
      hasExplicitRef = true;
    }
  }

  let offsetMs: number | null = null;

  if (/^yesterday$/i.test(cleaned)) {
    offsetMs = 24 * 60 * 60 * 1000;
  } else if (/^(?:today|just\s+posted|just\s+now|moments?\s+ago)$/i.test(cleaned)) {
    offsetMs = 0;
  } else {
    // Check quantity + unit (e.g. "3 days", "3d", "2 weeks", "2w", "5 hours", "5h", "1 month", "1mo")
    const relMatch =
      cleaned.match(
        /^(\d+)\+?\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|wk|wks|weeks?|mo|mos|months?|y|yr|yrs|years?)$/i
      ) || cleaned.match(/^(\d+)\s*(s|m|h|d|w|mo|y)$/i);

    if (relMatch) {
      const qty = parseInt(relMatch[1], 10);
      const u = relMatch[2].toLowerCase();
      if (/^s/i.test(u)) offsetMs = qty * 1000;
      else if (/^(?:mo|month)/i.test(u)) offsetMs = qty * 30 * 24 * 60 * 60 * 1000;
      else if (/^m/i.test(u)) offsetMs = qty * 60 * 1000;
      else if (/^h/i.test(u)) offsetMs = qty * 60 * 60 * 1000;
      else if (/^d/i.test(u)) offsetMs = qty * 24 * 60 * 60 * 1000;
      else if (/^w/i.test(u)) offsetMs = qty * 7 * 24 * 60 * 60 * 1000;
      else if (/^y/i.test(u)) offsetMs = qty * 365 * 24 * 60 * 60 * 1000;
    }
  }

  if (offsetMs !== null) {
    if (hasExplicitRef) {
      // Anchored to reference date (e.g. email received date):
      // postedTimestamp = refTime - offsetMs
      const postedTimestamp = Math.min(refTime - offsetMs, Date.now());
      return formatDistanceToNow(new Date(postedTimestamp), { addSuffix });
    }

    // Default when no explicit referenceDate is provided:
    if (/^yesterday$/i.test(cleaned)) {
      return addSuffix ? "1d ago" : "1d";
    }
    if (/^(?:today|just\s+posted|just\s+now|moments?\s+ago)$/i.test(cleaned)) {
      return addSuffix ? "0d ago" : "0d";
    }

    const targetDate = new Date(Date.now() - offsetMs);
    return formatDistanceToNow(targetDate, { addSuffix });
  }

  // 3. Final fallback to Date parser if it resolves to a valid epoch
  if (!isNaN(parsedDate) && parsedDate > 0) {
    return formatDistanceToNow(new Date(parsedDate), { addSuffix });
  }

  return addSuffix ? `${cleaned} ago` : cleaned;
}
