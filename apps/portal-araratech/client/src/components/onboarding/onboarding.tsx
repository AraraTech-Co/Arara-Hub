/***
 *
 *   ONBOARDING
 *   Flow to help users set up the app, accepts multiple views/steps
 *   On finish/cancel, the user will be marked as onboarded
 *
 *   PROPS
 *   views: array of views to render containing keys:
 *     name, description and component to render
 *
 **********/

import { useState } from "react";
import Axios from "axios";
import {
  Animate,
  CheckList,
  Button,
  Logo,
  useNavigate,
  Event,
} from "@/components/lib";
import Style from "./onboarding.tailwind";

type OnboardingProps = {
  views: any[];
  save?: boolean;
  onFinish?: string;
};

export function Onboarding(props: OnboardingProps) {
  const navigate = useNavigate();
  const hash = window.location.hash;

  const [activeView, setActiveView] = useState<number>(
    hash ? parseInt(hash.substring(1), 10) - 1 : 0,
  );

  if (!props?.views?.length) return null;

  const view = props.views[activeView];

  async function goTo(view) {
    window.location.hash = view + 1;
    setActiveView(view);
  }

  async function finish() {
    if (props.save) await Axios.patch("/api/user", { onboarded: true });

    navigate(props.onFinish || "/dashboard");
  }

  return (
    <Animate type="pop-center">
      <div className={Style.onboarding}>
        <Button
          color="light"
          icon="arrow-right-circle"
          text="Skip Intro"
          position="absolute"
          alignRight
          className={Style.skip}
          size={16}
          action={() => {
            Event("cancelled_onboarding");
            finish();
          }}
        />

        <section className={Style.sidebar}>
          <Logo className={Style.logo} />

          <CheckList
            color="white"
            className={Style.checklist}
            hideCross
            interactive
            items={props.views.map((view, i) => {
              return {
                name: view.name,
                checked: i <= activeView ? true : false,
                onClick: () => goTo(i),
              };
            })}
          />
        </section>

        <section className={Style.main}>
          <header className={Style.header}>
            <h2 className={Style.name}>{view.name}</h2>

            {view.description && (
              <span className={Style.description}>{view.description}</span>
            )}
          </header>

          <article className={Style.article}>{view.component}</article>
        </section>

        <nav className={Style.nav}>
          {activeView > 0 && (
            <Button
              icon="chevron-left"
              alignLeft
              color="dark"
              size={16}
              text="Prev"
              className={Style.prev}
              action={() => goTo(activeView - 1)}
            />
          )}

          {activeView < props.views.length - 1 && (
            <Button
              icon="chevron-right"
              alignRight
              color="dark"
              size={16}
              text="Next"
              className={Style.next}
              action={() => {
                goTo(activeView + 1);
              }}
            />
          )}

          {activeView === props.views.length - 1 && (
            <Button
              icon="check-circle"
              alignRight
              color="dark"
              size={16}
              text="Finish"
              className={Style.next}
              action={() => {
                Event("completed_onboarding");
                finish();
              }}
            />
          )}
        </nav>
      </div>
    </Animate>
  );
}
