import express, { NextFunction, Request, Response } from "express";
import limiter from "express-rate-limit";
import passport from "passport";
import config from "config";
import path from "path";
import fs from "fs";

import session from "cookie-session";
session({
  name: "session",
  secret: process.env.SESSION_SECRET,
});

import authController from "./controller/Auth/AuthController";
const router = express.Router();
const throttle: any = config.get("throttle");

/*
 * caller function for global error handling
 * route all calls through this to try and handle errors
 */

const use = (fn: any) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// sign in with social provider
router.get(
  "/auth/:provider",
  limiter(throttle.signin),
  session,
  (req: any, res, next) => {
    // store the invite id (if present) is so this can be
    // used to attach a child user to its parent via the invite
    req.session.invite = req.query.invite;
    req.session.signup = parseInt(req.query.signup);

    // store the deep linking urls passed from the app
    req.session.deep_signin_url = req.query.signin_url;
    req.session.deep_social_url = req.query.social_url;

    // authenticate the user for the provider network
    passport.authenticate(req.params.provider, {
      // @ts-expect-error No need to worry about this ts error, config is dynamic
      scope: config.get(req.params.provider).scope,
    })(req, res, next);
  },
);

try {
  const imagesDir = path.join(__dirname, "../res");

  fs.readdir(imagesDir, (err, files) => {
    if (err) {
      console.error("Error reading images directory:", err);
      return;
    }

    const imageFiles = files.filter((file) =>
      /\.(jpg|jpeg|png|gif)$/i.test(file),
    );

    imageFiles.forEach((file) => {
      const routePath = `/api/images/${file}`;
      const filePath = path.join(imagesDir, file);

      router.get(routePath, (req, res) => {
        res.sendFile(filePath);
      });

      console.log(`Route created: ${routePath}`);
    });
  });
} catch (e) {
  console.log("Failed to Host File System, will not be avaiable");
}

router.get("/auth/:provider/callback", session, use(authController.social));

export default router;
