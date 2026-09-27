import config from "config";
import passport from "passport";
import facebookstrategy from "passport-facebook";
import twitterstrategy from "@passport-js/passport-twitter";
import { FacebookConfig, TwitterConfig } from "types/config";
import Database from "@/model/Database";
import { AuthRequest } from "types/express";
import { Response } from "express";
import Controller from "../Controller";

const facebook: FacebookConfig = config.get("facebook");
const twitter: TwitterConfig = config.get("twitter");

// config passport
const FacebookStrategy = facebookstrategy.Strategy;
const TwitterStrategy = twitterstrategy.Strategy;

passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((obj, done) => {
  done(null, obj);
});

if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: facebook.callback_url,
        profileFields: ["id", "name", "email"],
        enableProof: true,
        passReqToCallback: true,
      },
      async function (
        req: AuthRequest,
        accessToken: string,
        refreshToken: string,
        profile: any,
        done: (err: any, user?: any) => void,
      ) {
        await SocialController.handleCallback(
          req,
          profile,
          { access: accessToken, refresh: refreshToken },
          done,
        );
      },
    ),
  );
}

if (process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET) {
  passport.use(
    new TwitterStrategy(
      {
        consumerKey: process.env.TWITTER_API_KEY,
        consumerSecret: process.env.TWITTER_API_SECRET,
        callbackURL: twitter.callback_url,
        userProfileURL:
          "https://api.twitter.com/1.1/account/verify_credentials.json?include_email=true",
        passReqToCallback: true,
      },
      async function (
        req: AuthRequest,
        accessToken: string,
        refreshToken: string,
        profile: any,
        done: (err: any, user?: any) => void,
      ) {
        await SocialController.handleCallback(
          req,
          profile,
          { access: accessToken, refresh: refreshToken },
          done,
        );
      },
    ),
  );
}

class SocialController extends Controller {
  constructor() {
    super();
  }
  public static async handleCallback(
    req: AuthRequest,
    profile: any,
    tokens: { access: string; refresh: string },
    done: (err: any, user?: any) => void,
  ) {
    try {
      if (!profile) return done({ message: "Error getting profile." });

      const provider = profile.provider;
      const email = profile.emails?.[0]?.value;
      const data = {
        name: profile?.name?.givenName || profile.username,
        email: email,
        ...(provider === "facebook" && { facebook_id: profile.id }),
        ...(provider === "twitter" && { twitter_id: profile.id }),
      };

      // get the user
      let userData = await Database.User.custom.read.get({
        email: email,
        social: { provider: provider, id: profile.id },
      });

      // user came from signup page and already has an account
      // if they don't have an owner account then create a new one
      // otherwise this user is a child user
      if (req.session?.signup && !req.session.invite && userData) {
        userData.accounts = await Database.User.custom.account.get({
          id: userData.id,
        });

        // does the user have a parent account?
        if (!userData.accounts.find((x: any) => x.permission === "owner")) {
          const accountData = await Database.Account.custom.create.create();
          await Database.User.custom.account.add({
            id: userData.id,
            account: accountData.id,
            permission: "owner",
          });

          await Database.User.custom.update.update({
            id: userData.id,
            account: accountData.id,
            data: { default_account: accountData.id },
          });
        }
      }

      // this is an invite to a child account
      if (req.session?.invite) {
        const inviteData: any = await Database.Invite.custom.read.get({
          id: req.session.invite,
        });
        if (!inviteData)
          return done({
            message: "Invalid invite. Please contact the account holder",
          });

        // update user existing user
        if (userData) {
          const social: any = { default_account: inviteData.account_id };
          social[`${provider}_id`] = profile.id;
          await Database.User.custom.update.update({
            id: userData.id,
            account: userData.account_id,
            data: social,
          });
        } else {
          // create a new user
          userData = await Database.User.custom.create.create({
            user: data,
            account: inviteData.account_id,
          });
        }

        // assign the user to the parent account and close the invite
        await Database.User.custom.account.add({
          id: userData.id,
          account: inviteData.account_id,
          permission: inviteData.permission,
        });
        await Database.Invite.custom.update.update({
          id: req.session.invite,
          data: { used: true },
        });
      } else if (userData) {
        // user exists, authenticate them and add additional social if necessary
        if (!userData[`${provider}_id`]) {
          const social: any = {};
          social[`${provider}_id`] = profile.id;
          await Database.User.custom.update.update({
            id: userData.id,
            account: userData.account_id,
            data: social,
          });
        }

        // done, pass execution to authController
        await Database.Token.custom.save.save({
          provider: provider,
          data: tokens,
          user: userData.id,
        });
        return done(null, profile);
      } else {
        // user doesn't exist and wasn't invited - create user & account
        const accountData = await Database.Account.custom.create.create();
        userData = await Database.User.custom.create.create({
          user: data,
          account: accountData.id,
        });
        await Database.User.custom.account.add({
          id: userData.id,
          account: accountData.id,
          permission: "owner",
        });
      }

      // done - save token and pass to authController
      await Database.Token.custom.save.save({
        provider: provider,
        data: tokens,
        user: userData.id,
      });
      done(null, profile);
    } catch (error) {
      done(error);
    }
  }

  public socialCallback = async (req: AuthRequest, res: Response) => {
    try {
      return this.sendSuccess(res, { message: "Social login successful" });
    } catch (error) {
      return this.sendError(res, error);
    }
  };
}

export default new SocialController();
