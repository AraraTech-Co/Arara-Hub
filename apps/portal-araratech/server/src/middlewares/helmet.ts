import { Express } from "express";
import helmet from "helmet";

/**
 * @function bootHelmet
 * @description This function configures the `helmet` middleware to enhance the security
 *              of the application by setting various HTTP headers. The configuration
 *              specifically adjusts policies like `Content Security Policy` to allow
 *              necessary resources while maintaining security.
 *
 * @param {Express} app - The Express application instance.
 *
 * @note
 * - This function is critical for protecting the application from common vulnerabilities
 *   such as XSS and clickjacking.
 * - The Content Security Policy (CSP) is tailored to allow Stripe resources and assets
 *   from an S3 bucket specified in environment variables.
 * - Adjust the CSP directives if new external resources are required.
 *
 * @important
 * - Be cautious when modifying the `scriptSrc` or `styleSrc` directives to avoid exposing
 *   the application to Cross-Site Scripting (XSS) attacks.
 */
export const bootHelmet = (app: Express) => {
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false, // Disables the Cross-Origin Embedder Policy for compatibility with some integrations.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"], // Restrict default sources to the same origin.
          connectSrc: [
            "'self'",
            "https://api.stripe.com",
            `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com`,
          ], // Allows connections to Stripe API and S3 bucket.
          frameSrc: [
            "'self'",
            "https://js.stripe.com",
            "https://hooks.stripe.com",
          ], // Permits embedding Stripe elements.
          childSrc: ["'self'", "https://js.stripe.com"], // Controls frame and iframe sources.
          scriptSrc: ["'self'", "https://js.stripe.com"], // Limits script sources to the same origin and Stripe.
          styleSrc: [
            "'self'",
            "https://fonts.googleapis.com",
            "https://js.stripe.com",
          ], // Restricts styles to self and Google Fonts.
          fontSrc: ["'self'", "https://fonts.gstatic.com"], // Permits fonts from Google Fonts.
          imgSrc: [
            "'self'",
            "https://*.stripe.com",
            `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com`,
            "data:",
            "blob:",
          ], // Allows images from Stripe, S3, and inline or blob sources.
          baseUri: ["'self'"], // Restricts `base` tag sources to the same origin.
        },
      },
    }),
  );
};
