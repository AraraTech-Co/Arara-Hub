import config from "config";
import * as auth from "@/model/lib/Auth/Auth";
import * as mail from "@/helper/mail";
import speakeasy from "speakeasy";
import randomstring from "randomstring";

import qrcode from "qrcode";
import Cryptr from "cryptr";
const crypto = new Cryptr(process.env.CRYPTO_SECRET);
import * as utility from "@/helper/utility";
import authController from "@/controller/Auth/AuthController";
import { AuthRequest } from "types/express";
import { Response } from "express";
import { Domain, PermissionsConfig } from "types/config";
import Database from "@/model/Database";
import Controller from "../Controller";
import { IUserController } from "./IUserController";

const domain: Domain = config.get("domain");
const permissions: PermissionsConfig = config.get("permissions");

class UserController extends Controller implements IUserController {
  public create = async (req: AuthRequest, res: Response) => {
    try {
      const data = req.body;
      utility.validate(data, ["name", "email", "password"]);

      // confirm_password field is a dummy field to prevent bot signups
      if (
        req.body.hasOwnProperty("confirm_password") &&
        req.body.confirm_password
      )
        throw { message: "Registration denied" };

      // check the invite is valid
      const inviteData: any = await Database.Invite.custom.read.get({
        id: data.invite_id,
        email: data.email,
      });
      utility.assert(
        inviteData,
        "Invalid invite. Please contact the account holder",
      );

      // check if the user already exists
      let userData = await Database.User.custom.read.get({ email: data.email });

      if (userData) {
        // user is already on this account
        const userAccounts = await Database.User.custom.account.get({
          id: userData.id,
        });
        const registered = userAccounts.find(
          (x) => x.id === inviteData.account_id,
        );
        utility.assert(!registered, `You're already registered`);

        if (userData.account_id === inviteData.account_id)
          throw { message: "You're already registered" };

        // user already owns a child account, verify password
        const verified = await Database.User.custom.password.verify({
          id: userData.id,
          account: userData.account_id,
          password: data.password,
        });
        utility.assert(
          verified,
          "You already have an account registered with this email address. Please enter your original password to continue.",
        );

        // flag for authController to notify onboarding ui
        // that the users existing account was used
        req.body.duplicate_user = true;
        req.body.account_id = inviteData.account_id;
        req.body.has_password = userData.has_password;

        // save the new password if it exists and user doesn't have one
        if (!req.body.has_password && req.body.password)
          await Database.User.custom.password.save({
            id: userData.id,
            password: req.body.password,
          });
      } else
        userData = await Database.User.custom.create.create({
          user: data,
          account: inviteData.account_id,
        });

      // add user to account and close invite
      const accountData = await Database.Account.custom.read.get(
        inviteData.account_id,
      );
      await Database.User.custom.account.add({
        id: userData.id,
        account: inviteData.account_id,
        permission: inviteData.permission,
      });
      await Database.Invite.custom.update.update({
        id: data.invite_id,
        data: { used: true },
      });

      // send welcome email to user
      await mail.send({
        to: userData.email,
        template:
          req.body.duplicate_user && req.body.has_password
            ? "duplicate-user"
            : "new-user",
        content: { name: userData.name },
      });

      // notify account owner
      await mail.send({
        to: accountData.owner_email,
        template: "invite-accepted",
        content: {
          name: accountData.owner_name,
          friend: userData.name,
        },
      });

      // authenticate the user
      console.log(`✅ User created: ${userData.email}`);
      return authController.signup(req, res);
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public get = async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id || req.user;
      utility.assert(id, "Please log in or specify a user ID");

      const userData = await Database.User.custom.read.get({
        id: id,
        account: req.account,
      });
      userData.accounts = await Database.User.custom.account.get({ id: id });

      if (req.permission === "owner") {
        const accountData = await Database.Account.custom.read.get(req.account);
        userData.account_name = accountData.name;
      }

      return this.sendSuccess(res, { data: userData });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public update = async (req: AuthRequest, res: Response) => {
    let data = req.body,
      accountName;
    let msg = req.body.id ? "User updated" : "Profile updated";
    const authError = {
      message:
        "You do not have permission to perform this action. Please contact the account owner",
    };

    try {
      const userId = req.body.id || req.user;
      utility.assert(userId, "Please provide a user ID");

      const userData = await Database.User.custom.read.get({
        id: userId,
        account: req.account,
      });
      utility.assert(userData, "Profile does not exist");

      // if changing email - check if it's already used
      if (data.hasOwnProperty("email") && data.email !== userData.email) {
        const exists = await Database.User.custom.read.get({
          email: data.email,
        });
        if (exists)
          throw {
            inputError: "email",
            message: "This email address is already registered",
          };
      }

      // prevent permission injections
      if (
        data.hasOwnProperty("permission") &&
        data.permission !== userData.permission
      ) {
        // account owners can not adjust their own permission level
        if (userData.permission === "owner" && req.permission === "owner")
          throw { message: "You can not change your own permission level" };

        // master accounts can not be downgraded
        if (userData.permission === "master" && req.permission === "master")
          throw { message: "You can not change your own permission level" };

        // prevent escalating to owner/master
        if (data.permission === "owner" || data.permission === "master")
          throw authError;

        // admins can not downgrade another admin account
        if (
          req.permission === "admin" &&
          userData.permission === "admin" &&
          data.permission !== "admin"
        )
          throw authError;

        // users can not edit their own permission
        if (data.permission !== "user" && req.permission === "user")
          throw authError;
      }

      // only account owners can edit their own account
      if (userData.permission === "owner" && req.permission !== "owner")
        throw authError;

      if (data.support_enabled) {
        msg = "Support access updated";
        data.support_enabled = data.support_enabled === "Yes" ? true : false;
      }

      // only owner can update account name
      if (data.account_name && req.permission === "owner") {
        accountName = data.account_name;
        await Database.Account.custom.update.update({
          id: req.account,
          data: { name: data.account_name },
        });
        delete data.account_name;
      }

      // update the user
      data = await Database.User.custom.update.update({
        id: userId,
        account: req.account,
        data: data,
      });

      // format data for client
      if (accountName) data.account_name = accountName;
      return this.sendSuccess(res, { message: msg, data: data });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public password = async (req: AuthRequest, res: Response) => {
    const data = req.body;
    let userData;
    try {
      // update an existing password
      if (data.has_password) {
        // verify old password
        utility.validate(data, ["oldpassword"]);
        userData = await Database.User.custom.password.verify({
          id: req.user,
          account: req.account,
          password: req.body.oldpassword,
        });
        utility.assert(
          userData,
          "Please enter the correct password",
          "oldpassword",
        );
      } else {
        userData = await Database.User.custom.read.get({ id: req.user });
      }

      utility.validate(data, ["newpassword"]);

      // all ok - save the password
      await Database.User.custom.password.save({
        id: req.user,
        password: data.newpassword,
      });

      // notify user
      await mail.send({
        to: userData.email,
        template: "password-updated",
        content: { name: userData.name },
      });

      return this.sendSuccess(res, {
        message: "Your new password has been saved",
      });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public resetPassword = async (req: AuthRequest, res: Response) => {
    const data = req.body;
    try {
      utility.validate(data, ["email", "jwt", "password"]);

      // verify the user exists
      const userData = await Database.User.custom.read.get({
        email: data.email,
      });

      if (userData) {
        // verify the token
        const hash = await Database.User.custom.password.password({
          id: userData.id,
          account: userData.account_id,
        });
        const token = auth.verifyToken({
          token: req.body.jwt,
          secret: hash.password,
        });

        // check ids match
        if (token.user_id !== userData.id)
          throw { message: "Please enter the correct email address" };

        if (token) {
          // save new password and notify the user
          await Database.User.custom.password.save({
            id: userData.id,
            password: data.password,
          });
          await mail.send({
            to: userData.email,
            template: "password-updated",
            content: {
              token: token,
            },
          });

          // authenticate user
          return authController.signin(req, res);
        }
      }

      return res
        .status(401)
        .send({ message: "Your password reset request has been denied" });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public passwordResetRequest = async (req: AuthRequest, res: Response) => {
    const data = req.body;
    try {
      utility.validate(data, ["email"]);

      // check the user exists
      const userData = await Database.User.custom.read.get({
        email: data.email,
      });

      if (userData) {
        // generate a JWT and sign it with the current
        // hashed password set to expire in 5 minutes
        const hash = await Database.User.custom.password.password({
          id: userData.id,
          account: userData.account_id,
        });
        const token = auth.token({
          data: { timestamp: Date.now(), user_id: userData.id },
          secret: hash.password,
          duration: 300,
        });

        // trigger a reset password email
        await mail.send({
          to: data.email,
          template: "password-reset",
          content: {
            token: token,
            domain:
              utility.validateNativeURL(data.resetpassword_view_url) ||
              `${domain}/resetpassword`,
          },
        });
      }

      // don't return any indication if the account exists or not
      return this.sendSuccess(res, {
        message: "Please check your email for further instructions",
      });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public twoFa = async (req: AuthRequest, res: Response) => {
    const data = req.body;
    try {
      utility.validate(data);

      // user enabled 2fa
      if (data["2fa_enabled"]) {
        // generate a secret and qr code
        const secret = speakeasy.generateSecret({
          length: 32,
          name: process.env.APP_NAME,
        });
        await Database.User.custom.update.update({
          id: req.user,
          account: req.account,
          data: { "2fa_secret": crypto.encrypt(secret.base32) },
        });
        data.qr_code = await qrcode.toDataURL(secret.otpauth_url);
        data.otpauth = secret.otpauth_url;
      } else {
        // disable it
        await Database.User.custom.update.update({
          id: req.user,
          account: req.account,
          data: {
            "2fa_enabled": false,
            "2fa_secret": null,
            "2fa_backup_code": null,
          },
        });
      }

      return this.sendSuccess(res, { data: data });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public verifyTwoFa = async (req: AuthRequest, res: Response) => {
    const data = req.body;
    try {
      utility.validate(data, ["code"]);

      const secret = await Database.User["2fa"].secret({ id: req.user });

      // verify the secret
      const verified = speakeasy.totp.verify({
        secret: secret,
        encoding: "base32",
        token: req.body.code.replace(/\s+/g, ""),
      });
      utility.assert(verified, "Invalid verification code. Please try again");

      // secret was ok, enable 2fa and return backup code
      const backupCode = randomstring.generate({ length: 12 });
      await Database.User.custom.update.update({
        id: req.user,
        account: req.account,
        data: { "2fa_enabled": true },
      });
      await Database.User["2fa"].backup.save({
        id: req.user,
        code: backupCode,
      });

      return this.sendSuccess(res, { data: { backup_code: backupCode } });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public deleteUser = async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id || req.user;
      utility.assert(id, "Please provide a user ID");

      const userData = await Database.User.custom.read.get({
        id: id,
        account: req.account,
      });
      utility.assert(userData, "User does not exist");

      // owner is attempting to delete their own account
      if (req.permission === "owner" && req.user === userData.id)
        throw {
          message: "Please close your own account using the profile page.",
        };

      if (req.permission === "admin" && req.user === userData.id && req.body.id)
        throw {
          message:
            "You can not delete yourself, please contact the account owner.",
        };

      if (userData.permission === "owner")
        return res
          .status(403)
          .send({ message: "Account owners cannot be deleted." });

      // user is closing their own account - force delete
      if (userData.id === req.user) {
        await Database.User.custom.deleteUser.deleteUser({
          id: userData.id,
          account: req.account,
        });
        await Database.User.custom.account.delete({
          id: userData.id,
          account: req.account,
        });
        return res.status(200).send();
      }

      // owner/admin is deleting a user
      // un-assign user if attached multiple accounts, delete if only on one account
      const userAccounts = await Database.User.custom.account.get({
        id: userData.id,
      });
      await Database.Token.custom.delete.token({ user: userData.id });

      // user is on multiple accounts
      if (userAccounts.length > 1) {
        // if this account is the user's default account
        // update to prevent a redundant default
        if (userData.default_account === req.account) {
          userAccounts.splice(
            userAccounts.findIndex((x) => x.id === req.account),
            1,
          );
          await Database.User.custom.update.update({
            id: userData.id,
            account: req.account,
            data: { default_account: userAccounts[0].id },
          });
        }
      } else {
        // delete the user entirely
        await Database.User.custom.deleteUser.deleteUser({
          id: userData.id,
          account: req.account,
        });
      }

      await Database.User.custom.account.delete({
        id: userData.id,
        account: req.account,
      }); // un-assign user from this account
      return this.sendSuccess(res, { message: "User deleted" });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public userPermissions = async (req: AuthRequest, res: Response) => {
    try {
      const perms = { ...permissions };

      Object.keys(perms).map((perm) => {
        if (perm === "master") delete perms[perm];
      });

      return this.sendSuccess(res, { data: perms });
    } catch (error) {
      return this.sendError(res, error);
    }
  };

  public userAccount = async (req: AuthRequest, res: Response) => {
    try {
      const data = await Database.User.custom.account.get({ id: req.user });
      return this.sendSuccess(res, { data: data });
    } catch (error) {
      return this.sendError(res, error);
    }
  };
}

export default new UserController();
