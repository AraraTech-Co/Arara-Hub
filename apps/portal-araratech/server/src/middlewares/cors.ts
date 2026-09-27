import { Express } from "express";
import cors from "cors";

/**
 * @function bootCors
 * @description Configures Cross-Origin Resource Sharing (CORS) for the Express application,
 *              enabling secure communication between the server and client(s).
 *
 * @param {Express} app - The Express application instance.
 *
 * @note
 * - This function allows requests from a specific set of origins defined in environment variables.
 * - Adjust the `opts.origin` array to include all trusted domains required by your application.
 * - The middleware also supports pre-flight requests by setting up CORS for all routes using `.options("*", cors(opts))`.
 *
 * @important
 * - Avoid using `*` in production unless absolutely necessary, as it weakens security by allowing requests
 *   from any origin.
 *
 * @example Environment Variables:
 * ```env
 * CLIENT_URL=https://client.example.com
 * SERVER_URL=https://server.example.com
 * MISSION_CONTROL_CLIENT=https://missioncontrol.example.com
 * PRODUCTION_DOMAIN=https://production.example.com
 * ```
 *
 * Example Configuration:
 * ```json
 * {
 *   "origin": [
 *     "https://client.example.com",
 *     "https://server.example.com",
 *     "https://missioncontrol.example.com",
 *     "https://production.example.com"
 *   ]
 * }
 * ```
 *
 * @response
 * - Adds `Access-Control-Allow-Origin` headers to responses based on the `opts.origin` configuration.
 * - Handles pre-flight requests with the `.options("*", cors(opts))` configuration.
 */
export const bootCors = (app: Express) => {
  // Define allowed origins based on environment variables
  const opts = {
    origin: [
      process.env.CLIENT_URL,
      process.env.SERVER_URL,
      process.env.MISSION_CONTROL_CLIENT,
      process.env.PRODUCTION_DOMAIN,
    ],
  };

  // Apply CORS middleware for handling cross-origin requests
  app.use(cors());

  // Handle pre-flight requests for all routes
  app.options("*", cors(opts));
};
