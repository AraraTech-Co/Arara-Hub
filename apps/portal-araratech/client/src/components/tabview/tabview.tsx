/***
 *
 *   TAB VIEW
 *   Create a tabbed view by wrapping each view element in a <TabView> component.
 *
 *   PROPS
 *   name: specify a name if you want to persist the active tab state
 *   labels: array of strings for the tab labels
 *
 **********/

import { useState, cloneElement } from "react";
import { ClassHelper } from "@/components/lib";
import Style from "./tabview.tailwind";

type TabViewProps = {
  name?: string;
  labels?: string[];
  initialView?: number;
  children: any[];
};

export function TabView(props: TabViewProps) {
  // init
  const init = new Array(props.children.length).fill(false);
  let activeStates = [...init];

  // is there a view saved in storage?
  const savedViewIndex = localStorage.getItem(props.name + "Tabs");

  // loaded the saved view, or the initial view
  if (savedViewIndex) {
    activeStates[savedViewIndex] = true;
  } else if (props.initialView) {
    activeStates[props.initialView] = true;
  } else {
    activeStates[0] = true;
  }

  // state
  const [activeState, setActiveState] = useState(activeStates);

  function switchTab(index) {
    let states = [...init];
    states[index] = true;
    setActiveState(states);

    // save the tab
    if (props.name) localStorage.setItem(props.name + "Tabs", index);
  }

  return (
    <div>
      <nav className={Style.tabs}>
        {props.labels?.map((label, index) => {
          if (label) {
            return (
              <Tab
                key={label}
                active={activeState[index]}
                click={(e) => switchTab(index)}
              >
                {label}
              </Tab>
            );
          }

          return false;
        })}
      </nav>

      {props.children?.map((view, index) => {
        if (view) {
          let visible = "hide";
          if (activeStates[index]) visible = "show";
          let newView = cloneElement(view, { className: visible, key: index });
          return newView;
        }

        return false;
      })}
    </div>
  );
}

function Tab(props) {
  const buttonStyle = ClassHelper(Style, {
    button: true,
    buttonInActive: !props.active,
    buttonActive: props.active,
    className: props.className,
  });

  return (
    <button className={buttonStyle} onClick={props.click}>
      {props.children}
    </button>
  );
}
