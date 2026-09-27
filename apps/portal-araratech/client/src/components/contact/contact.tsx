
import { Fragment, useState } from "react";
import { Form, Message } from "@/components/lib";

export function ContactForm() {
  const [sent, setSent] = useState(false);

  return (
    <Fragment>
      {sent ? (
        <Message
          title="Message Sent"
          type="success"
          text={`Thank you for your message, we'll be in touch as soon as possible.`}
        />
      ) : (
        <Form
          inputs={{
            name: {
              label: "Your name",
              type: "text",
              required: true,
              errorMessage: "Please enter your name",
            },
            email: {
              label: "Your email",
              type: "email",
              required: true,
              errorMessage: "Please enter your email address",
            },
            message: {
              label: "Message",
              type: "textarea",
              required: true,
              errorMessage: "Please enter a message",
            },
          }}
          method="POST"
          url="/api/utility/mail"
          callback={(e) => setSent(true)}
          buttonText="Send Message"
        />
      )}
    </Fragment>
  );
}
