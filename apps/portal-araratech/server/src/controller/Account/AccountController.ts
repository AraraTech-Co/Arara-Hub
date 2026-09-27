import config from "config";
import { Request, Response } from "express";
import { AuthRequest } from "types/express";
import StripeService from "@/model/lib/Stripe/stripe";
import {
  validate,
  assert,
  convertToMonthName,
  currencySymbol,
} from "@/helper/utility";
import authController from "@/controller/Auth/AuthController";
import * as mail from "@/helper/mail";
import Database from "@/model/Database";
import planService from "@/model/lib/Plan/planService";
import Controller from "../Controller";
import { IAccountController } from "./IAccountController";

const stripe = new StripeService();
const settings: any = config.get("stripe");

class AccountController extends Controller implements IAccountController {
  public create = async (req: Request, res: Response): Promise<any> => {
    const data = req.body;
    validate(data, ["email", "name", "password"]);

    // confirm_password field is a dummy field to prevent bot signups
    if (data.hasOwnProperty("confirm_password") && data.confirm_password)
      throw { message: "Registration denied" };

    // check if user has already registered an account
    let userData = await Database.User.custom.read.get({ email: data.email });

    if (userData) {
      // check if user already owns an account
      const userAccounts = await Database.User.custom.account.get({
        id: userData.id,
      });
      const ownerAccount = userAccounts.find(
        (x: any) => x.permission === "owner",
      );
      assert(!ownerAccount, "You have already registered an account");

      // user already owns a child account, verify password
      const verified = await Database.User.custom.password.verify({
        id: userData.id,
        account: userData.account_id,
        password: data.password,
      });
      assert(
        verified,
        "You already have an account registered with this email address. Please enter your original password to continue.",
      );

      // flag for authController to notify onboarding ui
      // that the user's existing account was used
      req.body.duplicate_user = true;
      req.body.has_password = userData.has_password;

      // save the new password if it exists and user doesn't have one
      if (!req.body.has_password && req.body.password)
        await Database.User.custom.password.save({
          id: userData.id,
          password: req.body.password,
        });
    }

    console.log(`⏱️  Creating account for: ${data.email}`);

    // create the account
    const accountData = await Database.Account.custom.create.create(data.plan);
    req.body.account_id = accountData.id; // pass to auth controller to select new account

    // create the user and assign to account
    userData = !userData
      ? await Database.User.custom.create.create({
          user: data,
          account: accountData.id,
        })
      : userData;
    await Database.User.custom.account.add({
      id: userData.id,
      account: accountData.id,
      permission: "owner",
    });

    console.log(`✅ Account created for: ${data.email}`);

    // send welcome email
    try {
      await mail.send({
        to: userData.email,
        template:
          req.body.duplicate_user && req.body.has_password
            ? "duplicate-user"
            : "new-account",
        content: { name: userData.name },
      });
    } catch (e) {
      console.error("Failed sending email... Skipping...");
    }

    // authenticate the user
    return await authController.signup(req, res);
  };

  public plan = async (req: AuthRequest, res: Response): Promise<any> => {
    const data = req.body;
    const stripeData: any = {};

    validate(data, ["plan"]);

    const plan = await planService.findById(data.plan);
    assert(plan, `Plan doesn't exist`);

    const accountData = await Database.Account.custom.read.get(req.account);
    assert(accountData, "No account with that ID");

    const isFree = plan.is_free || data.plan === "free";

    // process stripe subscription for non-free accounts
    if (!isFree) {
      if (data.stripe === undefined) {
        assert(data.token?.id, "Please enter your credit card details");

        stripeData.customer = await stripe.createCustomer({
          email: accountData.owner_email,
          token: data.token.id,
        });
        stripeData.subscription = await stripe.subscribeCustomer({
          id: stripeData.customer.id,
          priceId: planService.getStripePriceId(plan) || undefined,
          plan: planService.getStripePriceId(plan) ? undefined : data.plan,
        });

        // check for an incomplete payment that requires 2-factor authentication
        if (
          stripeData.subscription?.latest_invoice?.payment_intent?.status ===
          "requires_action"
        ) {
          console.log("⚠️  Stripe payment requires further action");

          return res.status(200).send({
            requires_payment_action: true,
            customer: { id: stripeData.customer.id },
            subscription: {
              id: stripeData.subscription.id,
              price: stripeData.subscription.price,
            },
            client_secret:
              stripeData.subscription.latest_invoice.payment_intent
                .client_secret,
          });
        }
      }

      // stripe info hasn't been passed back as part of 2-factor
      if (!data.stripe) data.stripe = stripeData;
    } else {
      // nullify stripe data on free accounts
      data.stripe = {
        customer: { id: null },
        subscription: { id: null },
      };
    }

    // update the account with plan details
    await Database.Account.custom.update.update({
      id: req.account,
      data: {
        plan: data.plan,
        stripe_customer_id: data.stripe?.customer?.id,
        stripe_subscription_id: data.stripe?.subscription?.id,
      },
    });

    // send email
    if (!isFree) {
      const emailPlan = planService.formatPlanForEmail(plan);
      await mail.send({
        to: accountData.owner_email,
        template: "new_plan",
        content: {
          name: accountData.owner_name,
          plan: emailPlan.name,
          price: emailPlan.price,
        },
      });
    }

    console.log("✅ Customer added to plan");
    Database.Log.custom.create.new({
      message: "Customer added to plan",
      body: { plan: plan },
      req: req,
    });
    res
      .status(200)
      .send({ plan: data.plan, subscription: "active", onboarded: false });
  };

  public updatePlan = async (req: AuthRequest, res: Response): Promise<any> => {
    const data = req.body;
    validate(data, ["plan"]);

    const accountID = req.permission === "master" ? data.id : req.account;

    try {
      const result = await planService.assignPlanToAccount(accountID, {
        plan: data.plan,
        active: data.active,
      });

      const plan = await planService.findById(data.plan);

      return res.status(200).send({
        message: `Your account has been updated to the ${plan?.name} plan`,
        data: { plan: result.plan },
      });
    } catch (err: any) {
      const status = err.status || 500;
      return res.status(status).send({
        message: err.message || err,
        ...(status === 402 && { plan: data.plan }),
      });
    }
  };

  public get = async (req: AuthRequest, res: Response) => {
    const data = await Database.Account.custom.read.get(req.account);
    return res.status(200).send({ data: data });
  };

  public subscription = async (
    req: Request | any,
    res: Response,
  ): Promise<any> => {
    const subscription = await Database.Account.custom.read.subscription(
      req.account,
    );

    // format the data
    if (subscription?.data) {
      const start = new Date(subscription.data.current_period_start * 1000)
        .toISOString()
        .split("T")[0]
        .split("-");
      const end = new Date(subscription.data.current_period_end * 1000)
        .toISOString()
        .split("T")[0]
        .split("-");

      subscription.data = {
        current_period_start: `${start[2]} ${convertToMonthName(
          start[1],
        )} ${start[0]}`,
        current_period_end: `${end[2]} ${convertToMonthName(end[1])} ${end[0]}`,
      };
    }

    return res.status(200).send({
      data: {
        status: subscription.status,
        object: subscription.data,
      },
    });
  };

  public upgrade = async (req: AuthRequest, res: Response): Promise<any> => {
    const data = req.body;
    const stripeData: any = {};

    validate(data, ["plan"]);

    const plan = await planService.findById(data.plan);
    assert(plan, "No plan with that ID");

    const newPlanName = plan.name as string;
    const accountData = await Database.Account.custom.read.get(req.account);
    assert(accountData, "Account does not exist");

    if (accountData.stripe_customer_id && accountData.stripe_subscription_id) {
      // check if customer & subscription already exists
      stripeData.customer = await stripe.getCustomer(
        accountData.stripe_customer_id,
      );
      stripeData.subscription = await stripe.getSubscription(
        accountData.stripe_subscription_id,
      );

      if (stripeData.customer || stripeData.stripe_subscription_id) {
        res
          .status(500)
          .send({ message: `Your already on the ${accountData.plan} plan.` });
        return false;
      }
    }

    // if a 2-factor payment isn't required, create the stripe subscription
    if (data.stripe === undefined) {
      assert(data.token?.id, "Please enter your credit card details");

      // create a stripe customer and subscribe them to a plan
      stripeData.customer = await stripe.createCustomer({
        email: accountData.email,
        token: data.token.id,
      });
      stripeData.subscription = await stripe.subscribeCustomer({
        id: stripeData.customer.id,
        priceId: planService.getStripePriceId(plan) || undefined,
        plan: planService.getStripePriceId(plan) ? undefined : data.plan,
      });

      // check for an incomplete payment that requires 2-factor authentication
      if (
        stripeData.subscription?.latest_invoice?.payment_intent?.status ===
        "requires_action"
      ) {
        console.log("⚠️  Stripe payment requires further action");

        res.status(200).send({
          requires_payment_action: true,
          customer: { id: stripeData.customer.id },
          subscription: {
            id: stripeData.subscription.id,
            price: stripeData.subscription.price,
          },
          client_secret:
            stripeData.subscription.latest_invoice.payment_intent.client_secret,
        });

        return false;
      }
    }

    // stripe info hasn't been passed back as part of 2-factor
    if (!data.stripe) data.stripe = stripeData;

    // update account plan
    await Database.Account.custom.update.update({
      id: req.account,
      data: {
        plan: data.plan,
        stripe_customer_id: data.stripe?.customer?.id,
        stripe_subscription_id: data.stripe?.subscription?.id,
      },
    });

    // notify the user
    await mail.send({
      to: accountData.owner_email,
      template: "plan-updated",
      content: {
        name: accountData.owner_name,
        plan: newPlanName,
      },
    });

    // done
    return res.status(200).send({
      message: `Your account has been successfully updated to the ${newPlanName} plan.`,
      data: { plan: data.plan },
    });
  };

  public card = async (req: Request | any, res: Response): Promise<any> => {
    const accountData = await Database.Account.custom.read.get(req.account);
    assert(accountData, "Account does not exist");

    if (accountData.stripe_customer_id) {
      const customer: any = await stripe.getCustomer(
        accountData.stripe_customer_id,
      );
      const card = customer.sources?.data?.[0];

      if (card) {
        return res.status(200).send({
          data: {
            brand: card.brand,
            last4: card.last4,
            exp_month: card.exp_month,
            exp_year: card.exp_year,
          },
        });
      } else {
        return res.status(200).send({ data: null });
      }
    }

    return res.status(200).send({ data: null });
  };

  public updateCard = async (req: AuthRequest, res: Response) => {
    assert(req.body.token, "Please enter a valid credit card", "token");
    validate(req.body);

    const accountData = await Database.Account.custom.read.get(req.account);
    assert(accountData, "Account does not exist");

    const customer = await stripe.updateCustomer({
      id: accountData.stripe_customer_id,
      token: req.body.token.id,
    });

    // notify the user
    await mail.send({
      to: accountData.owner_email,
      template: "card-updated",
      content: { name: accountData.owner_name },
    });

    return res.status(200).send({
      data: customer?.sources?.data?.[0],
      message: "Your card details have been updated",
    });
  };

  public invoice = async (req: AuthRequest, res: Response) => {
    let invoices = null;

    const accountData = await Database.Account.custom.read.get(req.account);
    assert(accountData, "Account does not exist");

    // get the invoices
    if (accountData.stripe_customer_id) {
      invoices = await stripe.listInvoices({
        id: accountData.stripe_customer_id,
        limit: 30,
      });

      // format the invoices
      if (invoices?.data?.length) {
        invoices.data = invoices.data.map((invoice: any) => {
          const total = invoice.total;

          return {
            number: invoice.number,
            date: new Date(invoice.created * 1000),
            status: invoice.status,
            invoice_pdf: invoice.invoice_pdf,
            total: `${currencySymbol[invoice.currency]}${(total / 100).toFixed(
              2,
            )}`,
          };
        });
      }
    }

    return res.status(200).send({ data: invoices?.data });
  };

  public users = async (req: AuthRequest, res: Response) => {
    return res.status(200).send({
      data: {
        users: await Database.User.custom.read.get({ account: req.account }),
        invites: await Database.Invite.custom.read.get({
          account: req.account,
          returnArray: true,
        }),
      },
    });
  };

  public close = async (req: AuthRequest, res: Response) => {
    // allow master to close account
    const accountId = req.permission === "master" ? req.params.id : req.account;
    const accountData = await Database.Account.custom.read.get(accountId);
    assert(accountData, "Account does not exist");

    if (accountData?.plan !== "free" && accountData?.stripe_customer_id)
      await stripe.deleteCustomer(accountData?.stripe_customer_id);

    // get a list of users on this account
    const accountUsers = await Database.User.custom.read.get({
      account: accountData.id,
    });

    if (accountUsers.length) {
      for (const u of accountUsers) {
        // get the other accounts this user is attached to
        const userAccounts = await Database.User.custom.account.get({
          id: u.id,
        });
        await Database.Token.custom.delete.token({ user: u.id });

        // user is on multiple accounts
        if (userAccounts.length > 1) {
          // un-assign user from this account
          await Database.User.custom.account.delete({
            id: u.id,
            account: accountData.id,
          });

          // if this account is the user's default account
          // update to prevent a redundant default
          if (u.default_account === accountData.id) {
            userAccounts.splice(
              userAccounts.findIndex((x: any) => x.id === accountId),
              1,
            );
            await Database.User.custom.update.update({
              id: u.id,
              account: accountId,
              data: { default_account: userAccounts[0].id },
            });
          }
        } else {
          // delete the user entirely
          await Database.User.custom.deleteUser.deleteUser({
            id: u.id,
            account: accountData.id,
          });
        }
      }
    }

    // delete the account
    await Database.Account.custom.delete.deleteAccount(accountData.id);

    await mail.send({
      to: accountData?.owner_email,
      template: "account-closed",
      content: { name: accountData?.owner_name },
    });

    console.log(`🗑️  Account closed: ${accountData.owner_email}`);
    await Database.Log.custom.create.new({
      message: "Account closed",
      req: req,
    });
    return res.status(200).send({ message: "Account closed" });
  };

  public plans = async (req: AuthRequest, res: Response) => {
    const accountData = req.account
      ? await Database.Account.custom.read.get(req.account)
      : null;

    const plans = await planService.listPublic();

    return res.status(200).send({
      data: {
        plans,
        active: accountData ? accountData.plan : null,
      },
    });
  };
}

export default new AccountController();
