/***
 *
 *   FEATURES
 *   Feature list for use on home/landing pages
 *
 **********/

import { Grid, Icon, ClassHelper } from "@/components/lib";
import Style from "./features.tailwind";

export function Features() {
  return (
    <Grid cols={"3"}>
      <Feature
        icon="credit-card"
        title="Subscription Payments"
        desc="Enable seamless subscription management and recurring billing with Stripe integration."
      />

      <Feature
        icon="droplet"
        title="React UI"
        desc="Develop modern, responsive interfaces efficiently with a robust React component library."
      />

      <Feature
        icon="unlock"
        title="Users & Authentication"
        desc="Implement secure authentication, including brute-force protection, account lockouts, and two-factor authentication."
      />

      <Feature
        icon="twitter"
        title="Social Logins"
        desc="Allow users to authenticate using popular social media platforms for a streamlined login experience."
      />

      <Feature
        icon="settings"
        title="REST API"
        desc="Provide a high-performance REST API with robust token-based authentication and API key support."
      />

      <Feature
        icon="database"
        title="Choose Your Database"
        desc="Support multiple databases including MySQL, MongoDB, PostgreSQL, and SQLite through flexible adapters."
      />

      <Feature
        icon="users"
        title="Teams"
        desc="Facilitate team collaboration with intuitive user invitations and group management."
      />

      <Feature
        icon="mail"
        title="Email Notifications"
        desc="Automate and customize email notifications with easy-to-use templates and delivery tracking."
      />

      <Feature
        icon="bar-chart"
        title="Mission Control"
        desc="Oversee user activity and system metrics from a centralized, intuitive dashboard."
      />

      <Feature
        icon="box"
        title="Pre-built Components"
        desc="Accelerate development with a comprehensive suite of pre-built UI components and utilities."
      />

      <Feature
        icon="code"
        title="Integration Tests"
        desc="Ensure application reliability with automated integration testing and detailed reporting."
      />

      <Feature
        icon="lock"
        title="Security & Permissions"
        desc="Control access with granular permission settings and role-based authorization."
      />

      <Feature
        icon="heart"
        title="User Feedback"
        desc="Gather actionable user feedback and generate insightful reports directly within the platform."
      />

      <Feature
        icon="heart"
        title="User Onboarding"
        desc="Enhance user engagement and retention with guided onboarding experiences."
      />

      <Feature
        icon="log-in"
        title="User Impersonation"
        desc="Troubleshoot and resolve user issues efficiently with secure account impersonation."
      />

      <Feature
        icon="clipboard"
        title="Error & Event Logging"
        desc="Monitor errors and user events with integrated logging and analytics capabilities."
      />

      <Feature icon="slack" title="Slack Community" desc="Slack Stuff." />

      <Feature icon="github" title="Github" desc="Public Github Repo" />
    </Grid>
  );
}

function Feature(props) {
  const featureStyle = ClassHelper(Style, {
    feature: true,
    className: props.className,
  });

  return (
    <div className={featureStyle}>
      <Icon image={props.icon} size={16} className={Style.icon} />

      <h3 className={Style.title}>{props.title}</h3>

      <p className={Style.description}>{props.desc}</p>
    </div>
  );
}
