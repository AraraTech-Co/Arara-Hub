/* NOTE:
 * Checks environment variables and if they are set.
 * The "required" env breaks the process if they are missing,
 * the "optional" env just warns the user it's lacking.
 */

/* NOTE:
 * Each sub array is configured as:
 * [(Variable Name), (Variable itself), (Enumeration of possibilities (optional))]
 */
const required = [
  ["NODE_ENV", process.env.NODE_ENV, ["dev", "staging", "production"]],
  ["SESSION_SECRET", process.env.SESSION_SECRET, []],
  ["TOKEN_SECRET", process.env.TOKEN_SECRET, []],
  ["CRYPTO_SECRET", process.env.CRYPTO_SECRET, []],
  ["DATABASE_URL", process.env.DATABASE_URL, []],
  ["DB_PROVIDER", process.env.DB_PROVIDER, ["postgresql"]],
];

const optional = [
  ["APP_NAME", process.env.APP_NAME, []],
  ["PORT", process.env.PORT, []],
  ["CLIENT_URL", process.env.CLIENT_URL, []],
  ["MISSION_CONTROL_CLIENT", process.env.MISSION_CONTROL_CLIENT, []],
  ["PRODUCTION_DOMAIN", process.env.PRODUCTION_DOMAIN, []],
  ["STAGING_DOMAIN", process.env.STAGING_DOMAIN, []],
  ["ADMIN_DOMAIN", process.env.ADMIN_DOMAIN, []],
  ["STAGING_ADMIN_DOMAIN", process.env.STAGING_ADMIN_DOMAIN, []],
  ["SLACK_ERRORS_WEBHOOK", process.env.SLACK_ERRORS_WEBHOOK, []],
  ["POSTMARK_API_KEY", process.env.POSTMARK_API_KEY, []],
  ["SUPPORT_EMAIL", process.env.SUPPORT_EMAIL, []],
  ["STRIPE_SECRET_API_KEY", process.env.STRIPE_SECRET_API_KEY, []],
  ["AWS_ACCESS_KEY", process.env.AWS_ACCESS_KEY, []],
  ["AWS_SECRET_ACCESS_KEY", process.env.AWS_SECRET_ACCESS_KEY, []],
  ["AWS_REGION", process.env.AWS_REGION, []],
  ["AWS_BUCKET", process.env.AWS_BUCKET, []],
];

function validateRequired() {
  const missing = [];

  required.forEach((item) => {
    const [name, value, validOptions] = item;
    if (Array.isArray(validOptions) && validOptions.length > 0) {
      if (!value || !validOptions.includes(value as string)) {
        missing.push(
          `Environment variable "${name}" should be one of [${validOptions.join(", ")}] but got "${value || "undefined"}"`,
        );
      }
    } else if (!value) {
      missing.push(`Missing required environment variable "${name}"`);
    }
  });

  if (missing.length > 0) {
    console.error("Required environment variables missing:");
    missing.forEach((msg) => console.error(`  - ${msg}`));
    process.exit(1);
  }
}

function validateOptional() {
  optional.forEach((item) => {
    const [name, value] = item;
    if (!value) {
      console.warn(`Optional environment variable "${name}" is not set.`);
    }
  });
}

console.log("Validating environment variables...");
validateRequired();
validateOptional();
console.log("All required environment variables are set.");
