declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    BUCKET?: R2Bucket;
    DASHBOARD_PASSWORD_HASH: string;
    SESSION_SECRET: string;
    ENROLLMENT_CODE_HASH: string;
  }
}
