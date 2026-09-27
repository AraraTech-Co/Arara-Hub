
import { Fragment, useState, useContext } from "react";
import { ViewContext, Card, Form, Icon, Button } from "@/components/lib";
import Style from "./feedback.tailwind";

interface ViewContextType {
  notification: {
    show: (
      message: string,
      type: "success" | "error" | "info" | "warning",
      persistent?: boolean,
      style?: string,
      icon?: string,
    ) => void;
  };
}

export function Feedback() {
  // context & state
  const context = useContext<ViewContextType>(ViewContext);
  const [showForm, setShowForm] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [rating, setRating] = useState(null);

  // maps
  const icons = ["smile", "meh", "frown"];
  const ratings = ["positive", "neutral", "negative"];
  const colors = ["green", "orange", "red"];

  function saveRating(rating) {
    setRating(rating);
    setShowComments(true);
  }

  return (
    <section>
      {showForm ? (
        <div className={Style.feedback}>
          <Card title="Enjoying Sample?" className={Style.feedback}>
            <Button
              icon="x"
              color="dark"
              position="absolute"
              className={Style.close}
              size={16}
              action={(e) => setShowForm(false)}
            />

            <Fragment>
              <section className={Style.rating}>
                {icons.map((icon, index) => {
                  return (
                    <div
                      key={index}
                      className={Style.ratingButton}
                      onClick={() => saveRating(index)}
                    >
                      <Icon
                        image={icon}
                        color={index === rating ? colors[index] : "dark"}
                        className={Style.ratingIcon}
                      />
                    </div>
                  );
                })}
              </section>

              {showComments && (
                <Form
                  inputs={{
                    rating: {
                      type: "hidden",
                      value: ratings[rating],
                    },
                    comment: {
                      label: `Tell us about your experience`,
                      type: "textarea",
                    },
                  }}
                  method="POST"
                  url="/api/feedback"
                  updateOnChange
                  buttonText="Send Feedback"
                  onChange={(e) => {
                    return false;
                  }}
                  callback={(e) => {
                    setShowForm(false);
                    context.notification.show(
                      "Thank you, your feedback is most appreciated.",
                      "success",
                      true,
                      "toast",
                      "heart",
                    );
                  }}
                />
              )}
            </Fragment>
          </Card>
        </div>
      ) : (
        <div className={Style.button} onClick={(e) => setShowForm(true)}>
          <Icon image="heart" color="white" className={Style.icon} size={20} />
        </div>
      )}
    </section>
  );
}
