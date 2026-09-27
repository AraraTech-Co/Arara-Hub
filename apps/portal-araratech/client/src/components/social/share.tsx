/***
 *
 *   SOCIAL SHARING BUTTONS
 *   A sharing wiget for Facebook, Twitter, Linkedin and email
 *
 *   PROPS
 *   url: url of page to share
 *   description: text for the socal media post.
 *
 **********/

import { Icon, ClassHelper } from "@/components/lib";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { fab } from "@fortawesome/free-brands-svg-icons";
import Style from "./social.tailwind";

type SocialShareProps = {
  url: string;
  description: string;
  className?: string;
};

export function SocialShare(props: SocialShareProps) {
  library.add(fab);

  const networks = {
    facebook: `http://www.facebook.com/share.php?u=${props.url}`,
    twitter: `http://twitter.com/share?text=${props.description}&url=${props.url}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${props.url}`,
    mail: `mailto:?subject=You must see this!&body=${props.description}%0D%0A%0D%0A${props.url}`,
  };

  const buttonsStyle = ClassHelper(Style, {
    shareButtons: true,
    className: props.className,
  });

  return (
    <div className={buttonsStyle}>
      {Object.keys(networks).map((key: any, i) => {
        const n = networks[key];
        const css = ClassHelper(Style, { [key]: true, shareButton: true });

        return (
          <a className={css} href={n} key={i}>
            {key === "mail" ? (
              <Icon
                color="light"
                image="mail"
                size={20}
                className={Style.icon}
              />
            ) : (
              <FontAwesomeIcon
                icon={["fab", key]}
                size="lg"
                className={Style.icon}
              />
            )}
          </a>
        );
      })}
    </div>
  );
}
