import Database from "@/model/Database";
import { Express, NextFunction, Request, Response } from "express";

/**
 * @function bootErrorHandler
 * @description Configures a global error-handling middleware for the Express application.
 *              This middleware captures unhandled errors, logs them, and provides a
 *              standardized response to the client.
 *
 * @param {Express} app - The Express application instance.
 *
 * @note
 * - This function logs errors using a custom logger (`Model.Log.custom.create.new`) and
 *   ensures sensitive information is not leaked in the response.
 * - Logs include the error message, the error object, and the request details for debugging purposes.
 * - Ensure the `Model.Log.custom.create.new` method is properly implemented and can handle the
 *   provided arguments.
 *
 * @response
 * - Status: `500 Internal Server Error`
 * - Body: `{ message: <error message> }`
 *
 * @important
 * - Avoid exposing detailed stack traces or internal server information in production.
 * - This middleware assumes a logging mechanism through `Database.Log.custom.create.new` that must be
 *   implemented separately.
 *
 * Example Response:
 * ```json
 * {
 *   "message": "An unexpected error occurred."
 * }
 * ```
 */
export const bootErrorHandler = (app: Express) => {
  app.use(function (err, req: Request, res: Response, next: NextFunction) {
    // Extract the most relevant error message available
    console.log("-----------------------------");
    const message = err.raw?.message || err.message || err.sqlMessage || null;

    // Log the full error object and request for debugging purposes
    Database.Log.custom.create.new({
      message: message,
      body: err, // Full error object
      req: req, // Request details
    });

    return res.status(500).send({ message });
  });
};
