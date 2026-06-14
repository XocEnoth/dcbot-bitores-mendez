/**
 * A simple in-memory rate limiter for user requests.
 */
class RateLimiter {
    constructor(limit, windowMs) {
        this.limit = limit;
        this.windowMs = windowMs;
        this.users = new Map();

        // Periodically clean up expired entries to prevent memory leaks
        setInterval(() => this.cleanup(), windowMs * 2).unref();
    }

    /**
     * Check if a user is rate limited.
     * @param {string} userId - The Discord user ID.
     * @returns {{ limited: boolean, timeRemainingMs: number }} Object containing status and remaining wait time.
     */
    check(userId) {
        const now = Date.now();
        const userData = this.users.get(userId);

        if (!userData || now >= userData.resetTime) {
            // New user or window expired
            this.users.set(userId, {
                count: 1,
                resetTime: now + this.windowMs
            });
            return { limited: false, timeRemainingMs: 0 };
        }

        if (userData.count < this.limit) {
            // Within limits
            userData.count++;
            return { limited: false, timeRemainingMs: 0 };
        }

        // Rate limited
        return {
            limited: true,
            timeRemainingMs: userData.resetTime - now
        };
    }

    cleanup() {
        const now = Date.now();
        for (const [userId, data] of this.users.entries()) {
            if (now >= data.resetTime) {
                this.users.delete(userId);
            }
        }
    }
}

// Global instance for the chat command: 5 requests per 1 minute (60,000 ms)
export const chatRateLimiter = new RateLimiter(5, 60000);
