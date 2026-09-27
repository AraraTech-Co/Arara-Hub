import { Signup } from "@/views/auth/signup/account";
import { SignupPlan } from "@/views/auth/signup/plan";
import { SignupUser } from "@/views/auth/signup/user";
import { Signin } from "@/views/auth/signin";
import { SigninOTP } from "@/views/auth/signin/otp";
import { SocialSignin } from "@/views/auth/signin/social";
import { ForgotPassword } from "@/views/auth/signin/forgotpassword";
import { ResetPassword } from "@/views/auth/signin/resetpassword";
import { MagicSignin } from "@/views/auth/signin/magic";

interface AuthRoute {
  path: string;
  view: React.ComponentType;
  layout: string;
  title: string;
}

const Routes: AuthRoute[] = [
  {
    path: "/signup",
    view: Signup,
    layout: "auth",
    title: "Sign Up",
  },
  {
    path: "/signup/plan",
    view: SignupPlan,
    layout: "auth",
    title: "Select Plan",
  },
  {
    path: "/signup/user",
    view: SignupUser,
    layout: "auth",
    title: "Create Account",
  },
  {
    path: "/signin",
    view: Signin,
    layout: "auth",
    title: "Sign In",
  },
  {
    path: "/signin/otp",
    view: SigninOTP,
    layout: "auth",
    title: "Sign In with OTP",
  },
  {
    path: "/signin/social",
    view: SocialSignin,
    layout: "auth",
    title: "Social Sign In",
  },
  {
    path: "/forgot-password",
    view: ForgotPassword,
    layout: "auth",
    title: "Forgot Password",
  },
  {
    path: "/reset-password",
    view: ResetPassword,
    layout: "auth",
    title: "Reset Password",
  },
  {
    path: "/magic-signin",
    view: MagicSignin,
    layout: "auth",
    title: "Magic Link Sign In",
  },
];

export default Routes;
