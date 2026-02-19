import dns from 'node:dns/promises';

export type ValidationError = {
  field: string;
  message: string;
};

const NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,29}$/;
const RESERVED_NAMES = ['arena'];

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  'metadata.google.internal',
  '169.254.169.254',
];

function stripBrackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '');
}

function isPrivateIp(ip: string): boolean {
  const stripped = stripBrackets(ip);

  // IPv4 private ranges
  if (PRIVATE_IP_RANGES.some((re) => re.test(stripped))) return true;

  // IPv6 loopback and private ranges
  if (stripped === '::1') return true;
  if (stripped.startsWith('fc00:') || stripped.startsWith('fd00:')) return true;
  if (stripped.startsWith('fe80:')) return true;

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const mappedMatch = stripped.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mappedMatch && PRIVATE_IP_RANGES.some((re) => re.test(mappedMatch[1]))) return true;

  if (stripped === '::ffff:127.0.0.1') return true;

  return false;
}

export function validateMcpServerConfig(input: {
  name?: unknown;
  url?: unknown;
  headers?: unknown;
}): ValidationError[] {
  const errors: ValidationError[] = [];

  // Name validation
  if (typeof input.name !== 'string' || !NAME_REGEX.test(input.name)) {
    errors.push({
      field: 'name',
      message: 'Name must be 1-30 lowercase alphanumeric characters or hyphens, starting with a letter or digit',
    });
  } else if (RESERVED_NAMES.includes(input.name)) {
    errors.push({
      field: 'name',
      message: `Name "${input.name}" is reserved and cannot be used`,
    });
  }

  // URL validation
  if (typeof input.url !== 'string') {
    errors.push({ field: 'url', message: 'URL is required' });
  } else {
    if (input.url.length > 512) {
      errors.push({ field: 'url', message: 'URL must be 512 characters or fewer' });
    }

    let parsed: URL | null = null;
    try {
      parsed = new URL(input.url);
    } catch {
      errors.push({ field: 'url', message: 'URL is not valid' });
    }

    if (parsed) {
      if (parsed.protocol !== 'https:') {
        errors.push({ field: 'url', message: 'URL must use HTTPS' });
      }
      if (parsed.username || parsed.password) {
        errors.push({ field: 'url', message: 'URL must not contain credentials' });
      }

      const hostname = stripBrackets(parsed.hostname);
      if (BLOCKED_HOSTNAMES.includes(hostname)) {
        errors.push({ field: 'url', message: 'URL must not point to a blocked host' });
      } else if (isPrivateIp(hostname)) {
        errors.push({ field: 'url', message: 'URL must not point to a private IP address' });
      }
    }
  }

  // Headers validation (optional)
  if (input.headers !== undefined && input.headers !== null) {
    if (typeof input.headers !== 'object' || Array.isArray(input.headers)) {
      errors.push({ field: 'headers', message: 'Headers must be a flat key-value object' });
    } else {
      for (const [k, v] of Object.entries(input.headers as Record<string, unknown>)) {
        if (typeof k !== 'string' || typeof v !== 'string') {
          errors.push({ field: 'headers', message: `Header "${k}" must have a string value` });
          break;
        }
      }
    }
  }

  return errors;
}

/**
 * Async DNS resolution check: resolves hostname and validates all IPs.
 * Call after validateMcpServerConfig passes synchronous checks.
 */
export async function validateMcpServerDns(url: string): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [{ field: 'url', message: 'URL is not valid' }];
  }

  const hostname = stripBrackets(parsed.hostname);

  // Skip DNS check for IP literals (already checked synchronously)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':')) return [];

  try {
    const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    const allAddresses = [...addresses, ...addresses6];

    for (const addr of allAddresses) {
      if (isPrivateIp(addr)) {
        errors.push({ field: 'url', message: 'URL hostname resolves to a private IP address' });
        break;
      }
    }
  } catch {
    // DNS resolution failed — allow (the connection will fail later anyway)
  }

  return errors;
}

/** Validate only the fields being updated (partial). */
export function validateMcpServerUpdate(input: {
  name?: unknown;
  url?: unknown;
  headers?: unknown;
  enabled?: unknown;
}): ValidationError[] {
  const errors: ValidationError[] = [];

  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || !NAME_REGEX.test(input.name)) {
      errors.push({
        field: 'name',
        message: 'Name must be 1-30 lowercase alphanumeric characters or hyphens, starting with a letter or digit',
      });
    } else if (RESERVED_NAMES.includes(input.name)) {
      errors.push({ field: 'name', message: `Name "${input.name}" is reserved` });
    }
  }

  if (input.url !== undefined) {
    const full = validateMcpServerConfig({ name: 'temp', url: input.url });
    errors.push(...full.filter((e) => e.field === 'url'));
  }

  if (input.headers !== undefined) {
    const full = validateMcpServerConfig({ name: 'temp', url: 'https://x.com', headers: input.headers });
    errors.push(...full.filter((e) => e.field === 'headers'));
  }

  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    errors.push({ field: 'enabled', message: 'Enabled must be a boolean' });
  }

  return errors;
}
