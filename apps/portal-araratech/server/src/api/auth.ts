import express from "express";
import config from "config";
import limiter from "express-rate-limit";
import track from "../helper/track";
import * as auth from "../model/lib/Auth/Auth";
import authController from "../controller/Auth/AuthController";
import userController from "@/controller/User/UserController";
import { ThrottleConfig } from "types/config";

const throttle: ThrottleConfig = config.get("throttle");
const api = express.Router();
import { use } from "../helper/utility";
import { validate } from "@/middlewares/zod";
import { z } from "zod";

api.post(
  "/api/auth",
  validate(
    "body",
    z.object({
      email: z.string().email("Invalid Email Address"),
      password: z
        .string()
        .min(6, "Password must be at least 6 characters long"),
    }),
  ),
  limiter(throttle.signin),
  track,
  use(authController.signin),
);

api.post(
  "/api/auth/otp",
  limiter(throttle.signin),
  validate(
    "body",
    z.object({
      code: z.string(),
      jwt: z.string(),
    }),
  ),
  track,
  use(authController.signinOtp),
);

api.get("/api/auth", auth.verify("user"), track, use(authController.get));

api.post(
  "/api/auth/magic",
  limiter(throttle.signin),
  validate(
    "body",
    z.object({
      email: z.string().email("Invalid Email Address"),
    }),
  ),
  track,
  use(authController.magic),
);

api.post(
  "/api/auth/magic/verify",
  limiter(throttle.signin),
  validate(
    "body",
    z.object({
      token: z.string(),
    }),
  ),
  track,
  use(authController.verifyMagic),
);

api.post(
  "/api/auth/password/reset/request",
  limiter(throttle.password_reset),
  validate(
    "body",
    z.object({
      email: z.string().email("Invalid Email Address"),
    }),
  ),
  track,
  use(userController.passwordResetRequest),
);

api.post(
  "/api/auth/password/reset",
  limiter(throttle.password_reset),
  validate(
    "body",
    z.object({
      email: z.string().email("Invalid Email Address"),
      jwt: z.string(),
      password: z.string(),
    }),
  ),
  track,
  use(userController.resetPassword),
);

api.post(
  "/api/auth/switch",
  validate(
    "body",
    z.object({
      account: z.string(),
    }),
  ),
  auth.verify("user"),
  track,
  use(authController.authSwitch),
);

api.post(
  "/api/auth/impersonate",

  validate(
    "body",
    z.object({
      token: z.string(),
      user_id: z.string().uuid("Invalid UUID"),
    }),
  ),
  track,
  use(authController.impersonate),
);

api.delete(
  "/api/auth",
  auth.verify("user"),
  track,
  use(authController.signout),
);

const authApi = api;

export default authApi;
