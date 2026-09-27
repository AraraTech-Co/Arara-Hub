/***
 *
 *   HOME LAYOUT
 *   Main website layout
 *
 **********/

import { Fragment } from "react";
import { HomeNav, Footer, useLocation } from "@/components/lib";

export function HomeLayout(props) {
  const location = useLocation();
  const transparent = location?.pathname === "/" ? true : false;

  return (
    <Fragment>
      <main className="home">
        <HomeNav transparent={transparent} />
        {<props.children {...props.data} />}
      </main>
      <Footer />
    </Fragment>
  );
}
