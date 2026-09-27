import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

/**
 * @function validate
 * @description Middleware for validating Express request data (`body`, `query`, or `params`) using a Zod schema.
 *
 * @param {("body" | "query" | "params")} target - The part of the request to validate.
 * @param {ZodSchema} schema - The Zod schema used to validate the request data.
 *
 * @returns {Function} Express middleware that validates the specified target of the request.
 *
 * @throws {Response} Sends a 400 HTTP status code with a validation error message and details if validation fails.
 *
 * @example Usage:
 * ```typescript
 * import express from "express";
 * import { z } from "zod";
 * import { validate } from "./middlewares/validate";
 *
 * const app = express();
 *
 * // Define a Zod schema for request body validation
 * const userSchema = z.object({
 *   name: z.string().min(1, "Name is required"),
 *   email: z.string().email("Invalid email format"),
 * });
 *
 * // Route with validation middleware
 * app.post(
 *   "/users",
 *   validate("body", userSchema),
 *   (req, res) => {
 *     res.send({ message: "User created successfully" });
 *   }
 * );
 * ```
 *
 * @note
 * - Use this middleware to enforce strict validation rules on incoming requests.
 * - The `target` parameter specifies which part of the request to validate:
 *   - `"body"`: For request payload (e.g., POST or PUT).
 *   - `"query"`: For URL query parameters.
 *   - `"params"`: For route parameters.
 *
 * @error
 * - If validation fails, the middleware:
 *   - Stops further processing of the request.
 *   - Responds with a `400 Bad Request` status.
 *   - Sends a detailed error response, including a `message` and `errors` array.
 *
 * Example Error Response:
 * ```json
 * {
 *   "message": "Validation Error in body",
 *   "errors": [
 *     {
 *       "path": ["email"],
 *       "message": "Invalid email format"
 *     }
 *   ]
 * }
 * ```
 */
export const validate =
  (target: "body" | "query" | "params", schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate the specified part of the request
      schema.parse(req[target]);
      next(); // Proceed to the next middleware if validation passes
    } catch (err: any) {
      // Send a 400 response with validation error details
      res.status(400).send({
        message: `Validation Error in ${target}`,
        errors: err.errors,
      });
    }
  };
