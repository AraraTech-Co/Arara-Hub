import React, { useState } from "react";
import { Button, Icon, useNavigate, ClassHelper } from "@/components/lib";
import Style from "./message.tailwind";

interface MessageProps {
  type?: "info" | "success" | "warning" | "error";
  title?: string;
  text?: string;
  closable?: boolean;
  buttonText?: string;
  buttonLink?: string;
  className?: string;
  children?: React.ReactNode;
}

export const Message: React.FC<MessageProps> = ({
  type = "info",
  title,
  text,
  closable = false,
  buttonText,
  buttonLink,
  className,
  children,
}) => {
  const navigate = useNavigate();

  // state
  const [closed, setClosed] = useState(false);

  if (closed) return null;

  const icon = {
    info: "info",
    success: "check",
    warning: "alert-triangle",
    error: "alert-octagon",
  };

  const color = {
    info: "blue",
    success: "green",
    warning: "orange",
    error: "red",
  };

  // style
  const messageStyle = ClassHelper(Style, {
    message: true,
    [`${color[type]}Bg`]: true,
    className,
  });

  const titleStyle = ClassHelper(Style, {
    title: true,
    [`${color[type]}Text`]: true,
  });

  return (
    <div className={messageStyle}>
      <Icon
        className={Style.icon}
        size={30}
        color={color[type]}
        image={icon[type]}
      />

      {closable && (
        <Button
          icon="x"
          position="absolute"
          className={Style.close}
          action={() => setClosed(true)}
        />
      )}

      <section className={Style.content}>
        {title && <h1 className={titleStyle}>{title}</h1>}

        {text && <p>{text}</p>}

        {children}

        {buttonLink && (
          <Button
            className={Style.btn}
            color={color[type]}
            text={buttonText}
            action={() => navigate(buttonLink)}
          />
        )}
      </section>
    </div>
  );
};
