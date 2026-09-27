/***
 *
 *   LOADER
 *   Infinite spinning animation for loading states
 *
 **********/

// TODO: Adjust Orbit import
import Orbit from "./images/orbit.svg";
import { ClassHelper } from "@/components/lib";
import Style from "./loader.tailwind";

type LoaderProps = {
  className?: string;
  fullScreen?: boolean;
};

export function Loader(props: LoaderProps) {
  const loaderStyle = ClassHelper(Style, props);

  return (
    <div className={loaderStyle}>
      <img src={Orbit} className={Style.orbit} alt="Orbit Spinner" />
    </div>
  );
}
