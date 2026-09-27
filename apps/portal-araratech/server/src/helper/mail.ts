import config from "config";
import { ServerClient } from "postmark";
import { promises as fs } from "fs";
import chalk from "chalk";
import emails from "../../emails/content.json";
import path from "path";

const domain: string = config.get("domain");
const settings: any = config.get("postmark");

const getPostmarkClientCreator = () => {
  let currentPostmarkClient: string;
  let client: ServerClient;
  return () => {
    const receivedPostmarkClient = process.env.POSTMARK_API_KEY;
    if (currentPostmarkClient !== receivedPostmarkClient) {
      client = new ServerClient(receivedPostmarkClient);
    } else if (!client) {
      client = new ServerClient(receivedPostmarkClient);
    }
    return client;
  };
};

const getPostmarkClient = getPostmarkClientCreator();

interface EmailData {
  to: string;
  template: string;
  content: any;
  custom?: string;
  subject?: string;
}

/*
 * mail.send()
 * send an email using postmark
 * data: to (email address), content (values to inject), custom (optional: custom html template)
 */

export async function send(data: EmailData): Promise<void> {
  // validate email address
  console.log(data.to.toLowerCase());
  const rex: RegExp =
    /^(?:[a-z0-9!#$%&amp;'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&amp;'*+/=?^_`{|}~-]+)*|'(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*')@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/;

  if (rex.test(data.to.toLowerCase())) {
    // get content from json
    const content: any = emails[data.template];
    const html: string = await createEmail(
      data.custom || "template",
      content,
      data.content,
    ); // create html template

    try {
      if (
        process.env.POSTMARK_API_KEY !== "" ||
        process.env.POSTMARK_API_KEY !== null
      ) {
        const client = getPostmarkClient();
        await client.sendEmail({
          From: settings.sender,
          To: data.to,
          Subject: content?.subject || data?.subject,
          HtmlBody: html,
        });
        console.log(chalk.green("Email sent to: ") + data.to);
      }

      console.log("No POSTMARK_API_KEY provided, Email wasn't sent.", {
        From: settings.sender,
        To: data.to,
        Subject: content?.subject || data?.subject,
        HtmlBody: html,
      });
    } catch (e: any) {
      console.error("ERROR: ", e.message);
    }
  } else {
    throw { message: "Invalid email address " };
  }
}

/*
 * createEmail()
 * opens an html email template and injects content into the {}
 * template: name of the html file located in /emails (default: template.html)
 * content: object containing body and button
 * inject: values to inject to content
 */

async function createEmail(
  template: string,
  content: any,
  values: any,
): Promise<string> {
  // get the template
  const templatePath = path.resolve(__dirname, `../../emails/${template}.html`);
  let email: string = await fs.readFile(templatePath, "utf8");
  email = email.replace(/{{domain}}/g, values?.domain || domain);

  // generate dynamic email
  if (content) {
    // set default title if not specified
    content.title = content.title || content.subject;

    // inject domain?
    if (content.button.url?.includes("{{domain}}"))
      content.button.url = content.button.url.replace(
        /{{domain}}/g,
        values?.domain || domain,
      );

    // inject new lines
    content.body = content.body.split("\n");

    if (content.name) content.body.unshift(`Hi ${content.name},`);

    content.body.forEach((line: string, i: number) => {
      content.body[i] =
        `<p style="color: #7e8890; font-family: 'Source Sans Pro', helvetica, sans-serif; font-size: 15px; font-weight: normal; Margin: 0; Margin-bottom: 15px; line-height: 1.6;">${line}</p>`;
    });

    content.body = content.body.join("\n");

    email = email.replace(/{{title}}/g, content.title);
    email = email.replace("{{body}}", content.body);
    email = email.replace("{{buttonURL}}", content.button.url);
    email = email.replace("{{buttonLabel}}", content.button.label);

    // inject content into {{braces}}
    if (values) {
      for (const key in values) {
        const rex = new RegExp(`{{content.${key}}}`, "g");
        email = email.replace(rex, values[key]);
      }
    }
  }

  return email;
}

// import config from "config";
// import { promises as filePromises } from "fs";
// // import axios from "axios"; // FIX: Import when mail is configured
// import FormData from "form-data";
// import emails from "../../emails/content.json";
//
// const domain: string = config.get("domain");
// const settings: any = config.get("mailgun");
// const file: any = filePromises;
//
// interface EmailData {
//   to: string;
//   template: string;
//   custom?: string;
//   content: any;
//   subject?: string;
// }
//
// export const send = async function (data: EmailData) {
//   const rex =
//     /^(?:[a-z0-9!#$%&amp;'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&amp;'*+/=?^_`{|}~-]+)*|'(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*')@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/;
//
//   if (rex.test(data.to.toLowerCase())) {
//     const content = emails[data.template];
//     const html = await createEmail({
//       template: data.custom || "template",
//       content,
//       values: data.content,
//     });
//
//     const form: any = new FormData();
//     form.append("to", data.to);
//     form.append("from", settings.sender);
//     form.append("subject", content?.subject || data?.subject);
//     form.append("html", html);
//
//     // TODO: FIX EMAIL
//     // await axios({
//     //   method: "POST",
//     //   url: `${settings.base_url}/${settings.domain}/messages`,
//     //   headers: {
//     //     "Content-Type": `multipart/form-data; boundary=${form._boundary}`,
//     //   },
//     //   data: form,
//     //   auth: {
//     //     username: "api",
//     //     password: process.env.MAILGUN_API_KEY,
//     //   },
//     // });
//
//     console.log(`✉️  Email sent to: ${data.to}`);
//   } else {
//     throw { message: "Invalid email address " };
//   }
// };
//
// interface CreateEmailData {
//   template: string;
//   content: any;
//   values: any;
// }
//
// async function createEmail({ template, content, values }: CreateEmailData) {
//   let email = await file.readFile(`emails/${template}.html`, "utf8");
//   email = email.replace(/{{domain}}/g, values?.domain || domain);
//
//   if (content) {
//     content.title = content.title || content.subject;
//
//     if (content.button.url?.includes("{{domain}}"))
//       content.button.url = content.button.url.replace(
//         /{{domain}}/g,
//         values?.domain || domain,
//       );
//
//     content.body = content.body.split("\n");
//
//     if (content.name) content.body.unshift(`Hi ${content.name},`);
//
//     content.body.forEach((line: string, i: number) => {
//       content.body[i] =
//         `<p style="color: #7e8890; font-family: 'Source Sans Pro', helvetica, sans-serif; font-size: 15px; font-weight: normal; Margin: 0; Margin-bottom: 15px; line-height: 1.6;">${line}</p>`;
//     });
//
//     content.body = content.body.join("\n");
//
//     email = email.replace(/{{title}}/g, content.title);
//     email = email.replace("{{body}}", content.body);
//     email = email.replace("{{buttonURL}}", content.button.url);
//     email = email.replace("{{buttonLabel}}", content.button.label);
//
//     if (values) {
//       for (const key in values) {
//         const rex = new RegExp(`{{content.${key}}}`, "g");
//         email = email.replace(rex, values[key]);
//       }
//     }
//   }
//
//   return email;
// }
