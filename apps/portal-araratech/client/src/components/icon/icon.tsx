/***
 *
 *   ICON
 *   Render an icon from feather icons
 *
 *   PROPS
 *   color: dark/light/grey/green/orange/blue or hex code
 *   pack: icon pack to use, default is feathericons
 *   image: image to use (see: https://feathericons.com)
 *   className: inject a parent class object
 *
 **********/

import FeatherIcon from "feather-icons-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { fab } from "@fortawesome/free-brands-svg-icons";
import { library } from "@fortawesome/fontawesome-svg-core";

type IconProps = {
  color?: string;
  pack?: string;
  image: string;
  className?: string;
  size?: number | string;
}

export function Icon(props: IconProps) {
  let color;

  const packs = {
    fontawesome: FontAwesomeIcon,
    feather: FeatherIcon,
  };

  switch (props.color) {
    case "light":
      color = "#FFFFFF";
      break;

    case "dark":
      color = "#758197";
      break;

    case "grey":
      color = "#ccc";
      break;

    case "green":
      color = "#8CC57D";
      break;

    case "blue":
      color = "#73B0F4";
      break;

    case "orange":
      color = "#F0AA61";
      break;

    case "red":
      color = "#d95565";
      break;

    case "purple":
      color = "#6363AC";
      break;

    default:
      color = props.color;
      break;
  }

  if (props.pack === "fontawesome") library.add(fab);

  const Icon = packs[props.pack || "feather"];

  return (
    <Icon
      color={color}
      icon={props.image}
      size={props.size || 16}
      className={props.className}
    />
  );
}
