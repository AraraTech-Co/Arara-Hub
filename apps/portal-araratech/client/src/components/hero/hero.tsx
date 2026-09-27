/***
 *
 *   HERO
 *   Hero section on landing page
 *
 *   PROPS
 *   title: h1 title
 *   tagline: h2 tagline
 *   image: source object
 *   alt: img alt tag
 *
 **********/

import { Animate, Content, Button, Image, ClassHelper } from "@/components/lib";
import Style from "./hero.tailwind";

type HeroProps = {
  title: string;
  tagline: string;
  image: any;
  alt?: string;
  className?: string;
};

export function Hero(props: HeroProps) {
  const heroStyle = ClassHelper(Style, {
    hero: true,
    className: props.className,
  });

  return (
    <section className={heroStyle}>
      <Content>
        <Animate type="pop">
          <section className={Style.blurb}>
            <h1 className={Style.title}>{props.title}</h1>
            <h2 className={Style.tagline}>{props.tagline}</h2>
            <Button
              goto="/signup"
              text="Sign Up Now"
              big
              className={Style.button}
            />
          </section>
        </Animate>

        <Animate>
          <Image className={Style.image} source={props.image} alt={props.alt} />
        </Animate>
      </Content>
    </section>
  );
}
