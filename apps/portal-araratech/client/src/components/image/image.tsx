/***
 *
 *   IMAGE
 *   Import the image before passing it to this component
 *
 *   PROPS
 *   source: imported source
 *   alt: alt description
 *   title: description
 *   className: inject a custom class object
 *
 **********/

import { ClassHelper } from "@/components/lib";
import Style from "./image.tailwind";

type ImageProps = {
  source: any;
  alt: string;
  title?: string;
  className?: any;
};

export function Image(props: ImageProps) {
  const imageStyle = ClassHelper(Style, props);

  return (
    <img
      src={props.source}
      alt={props.alt}
      title={props.title}
      className={imageStyle}
    />
  );
}
