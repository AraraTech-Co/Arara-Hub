import { Express } from "express";
import config from "config";
import limiter from "express-rate-limit";

/**
 * @function bootThrottle
 * @description This function configures rate-limiting for API endpoints to prevent
 *              abuse and ensure fair usage across clients. It uses `express-rate-limit`
 *              and reads configuration from the application settings.
 *
 * @param {Express} app - The Express application instance.
 *
 * @note
 * - This function applies rate limiting to specific routes.
 * - The configuration for each limiter is defined in the application's `config` files.
 * - This middleware is critical for protecting endpoints from brute-force attacks and DoS.
 *
 * Example of configuration:
 * ```json
 * {
 *   "throttle": {
 *     "api": {
 *       "max": 100,
 *       "windowMs": 60000,
 *       "headers": true,
 *       "message": "Too many requests, please try again later."
 *     },
 *     "signin": {
 *       "max": 5,
 *       "windowMs": 30000,
 *       "headers": true,
 *       "message": "Too many sign-in attempts, please try again later."
 *     }
 *   }
 * }
 * ```
 */
export const bootThrottle = (app: Express) => {
  type ThrottleConfig = {
    throttle: {
      api: {
        max: number; // Maximum number of requests allowed in the window.
        windowMs: number; // Time window in milliseconds.
        headers: boolean; // Include rate-limit headers in the response.
        message: string; // Message to display when the limit is exceeded.
      };
      signin: {
        max: number; // Maximum number of requests allowed in the window.
        windowMs: number; // Time window in milliseconds.
        headers: boolean; // Include rate-limit headers in the response.
        message: string; // Message to display when the limit is exceeded.
      };
    };
  };

  // Fetch throttle configurations from the application's settings.
  const throttle = config.get<ThrottleConfig["throttle"]>("throttle");

  // Apply rate limiting to API routes.
  app.use("/api/", limiter(throttle.api));

  /* NOTE:
   * Additional routes such as `/signin` can also be configured for throttling.
   * Uncomment or add other routes as required:
   * app.use("/signin", limiter(throttle.signin));
   */
};
