
/***
 *
 *   BUTTON
 *   Can be a standard button, icon button or with loading animation
 *
 *   PROPS
 *   text: button label
 *   action: callback function executed on click
 *   params: object passed to the callback function (optional)
 *   color: red/blue (default: green)
 *   icon: icon image (optional)
 *   iconPack: icon pack to use
 *   iconSize: icon size
 *   iconButton: true or false
 *   alignIcon: left or right
 *   small: render a smaller button
 *   textOnly: text only
 *   outline: outline button
 *   rounded: round the corners
 *   className: pass a custom class object
 *   fullWidth: extend to full width of parent container
 *   loading: boolean to toggle loading animation (optional)
 *
 **********/

import { Fragment } from "react";
import { Icon, ClassHelper, useNavigate } from "@/components/lib";

import ButtonStyle from "./button.tailwind";
import IconStyle from "./icon.tailwind";

type ButtonProps = {
  text?: string;
  action?: Function;
  params?: object;
  color?: string;
  icon?: any;
  iconPack?: string;
  iconSize?: any;
  iconButton?: boolean;
  alignIcon?: string;
  small?: boolean;
  textOnly?: boolean;
  outline?: boolean;
  rounded?: boolean;
  className?: string;
  fullWidth?: boolean;
  loading?: boolean;
  position?: string;
  title?: string;
  fillIcon?: boolean;
  alignLeft?: boolean;
  alignRight?: boolean;
  iconColor?: string;
  goto?: string;
  url?: string;
  size?: number;
  big?: boolean;
};

export function Button(props: ButtonProps) {
  const navigate = useNavigate();

  const buttonStyle = ClassHelper(ButtonStyle, {
    ...props,
    ...{
      [props.color]: props.color,
      [props.position || "relative"]: true,
      text: props.textOnly,
      iconButton: props.icon && !props.text,
      iconText: props.icon && props.text,
      iconTextOnly: props.textOnly && props.icon && props.text,
      btn: props.iconButton || (!props.textOnly && !props.icon),
      ...(!props.color &&
        props.text &&
        !props.color &&
        !props.icon &&
        !props.textOnly &&
        !props.outline && {
          // default color
          green: true,
        }),
    },
  });

  const iconStyle = ClassHelper(IconStyle, {
    fill: props.fillIcon,
    alignLeft: props.alignLeft,
    alignRight: props.alignRight,
    insideButton: props.iconButton || (!props.textOnly && !props.icon),
  });

  return (
    <button
      title={props.title}
      className={buttonStyle}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();

        props.action && props.action(props.params);
        props.goto && navigate(props.goto);
        if (props.url) (window as Window).location = props.url;
      }}
    >
      {props.icon ? (
        <Fragment>
          <Icon
            image={props.icon}
            pack={props.iconPack}
            color={props.iconColor || props.color}
            size={props.iconSize || props.size || 18}
            className={iconStyle}
          />
          {props.text && props.text}
        </Fragment>
      ) : (
        props.text
      )}
    </button>
  );
}
