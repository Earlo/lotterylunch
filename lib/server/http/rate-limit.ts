type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
  maxClients: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export class SlidingWindowRateLimiter {
  private readonly options: RateLimitOptions;
  private readonly buckets = new Map<string, number[]>();
  private readonly overflow: number[] = [];
  private nextCleanupAt = 0;

  constructor(options: RateLimitOptions) {
    for (const value of Object.values(options)) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError('Rate limit settings must be positive integers');
      }
    }
    this.options = options;
  }

  check(client: string, now = Date.now()): RateLimitResult {
    const { windowMs, maxRequests, maxClients } = this.options;
    const cutoff = now - windowMs;

    if (now >= this.nextCleanupAt) {
      for (const [key, timestamps] of this.buckets) {
        const latest = timestamps.at(-1);
        if (latest === undefined || latest <= cutoff) this.buckets.delete(key);
      }
      this.nextCleanupAt = now + windowMs;
    }

    let timestamps = this.buckets.get(client);
    if (!timestamps) {
      if (this.buckets.size < maxClients) {
        timestamps = [];
        this.buckets.set(client, timestamps);
      } else {
        // New addresses share one bounded bucket when the client ceiling is
        // reached, so rotating addresses cannot keep growing this process.
        timestamps = this.overflow;
      }
    }

    while (timestamps[0] !== undefined && timestamps[0] <= cutoff) {
      timestamps.shift();
    }

    const oldest = timestamps[0];
    if (oldest !== undefined && timestamps.length >= maxRequests) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      };
    }

    timestamps.push(now);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
