import express from "express";
import config from "config";
import * as auth from "@/model/lib/Auth/Auth";
import userController from "@/controller/User/UserController";
import limiter from "express-rate-limit";
import track from "../helper/track";
import { ThrottleConfig } from "types/config";
import { z } from "zod";
import { validate } from "@/middlewares/zod";

const throttle: ThrottleConfig = config.get("throttle");
const api = express.Router();
import { use } from "../helper/utility";

api.post(
  "/api/user",
  limiter(throttle.signup),
  validate(
    "body",
    z.object({
      invite_id: z.string().uuid("Invalid UUID"),
      name: z.string(),
      email: z.string().email("Invalid Email"),
      password: z.string().min(6, "Password lenght must be at least 6"),
    }),
  ),
  track,
  use(userController.create),
);

api.get(
  "/api/user",
  auth.verify("user", "user.read"),
  track,
  use(userController.get),
);

api.get(
  "/api/user/account",
  auth.verify("user"),
  track,
  use(userController.userAccount),
);

api.get(
  "/api/user/permissions",
  auth.verify("user", "user.read"),
  track,
  use(userController.userPermissions),
);

api.get(
  "/api/user/:id",
  validate(
    "params",
    z.object({
      id: z.string().uuid("Invalid UUID"),
    }),
  ),
  auth.verify("admin", "user.read"),
  track,
  use(userController.get),
);

api.patch(
  "/api/user",
  validate(
    "body",
    z.object({
      name: z.string().optional(),
      email: z.string().optional(),
      last_active: z.string().optional(),
      support_enabled: z.string().optional(),
      default_account: z.string().optional(),
      permission: z.string().optional(),
    }),
  ),
  auth.verify("user", "user.update"),
  track,
  use(userController.update),
);

api.put(
  "/api/user/password",
  validate(
    "body",
    z.object({
      oldpassword: z.string().min(6, "Password lenght should be at least 6"),
      newpassword: z.string().min(6, "Password lenght should be at least 6"),
    }),
  ),
  auth.verify("user"),
  track,
  use(userController.password),
);

api.put(
  "/api/user/2fa",
  validate(
    "body",
    z.object({
      "2fa_enabled": z.boolean(),
    }),
  ),
  auth.verify("user"),
  use(userController.twoFa),
);

api.post(
  "/api/user/2fa/verify",
  validate(
    "body",
    z.object({
      code: z.string(),
    }),
  ),
  auth.verify("user"),
  track,
  use(userController.verifyTwoFa),
);

api.delete(
  "/api/user",
  auth.verify("user", "user.delete"),
  track,
  use(userController.deleteUser),
);

api.delete(
  "/api/user/:id",
  validate(
    "params",
    z.object({
      id: z.string().uuid("Invalid UUID format"),
    }),
  ),
  auth.verify("user", "user.delete"),
  track,
  use(userController.deleteUser),
);

const user = api;
export default user;
