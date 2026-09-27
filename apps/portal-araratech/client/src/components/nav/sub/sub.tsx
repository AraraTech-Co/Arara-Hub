/***
 *
 *   SUB NAV
 *   Sub navigation element (located underneath the header).
 *
 **********/

import { useContext } from "react";
import { NavLink } from "react-router-dom";
import { AuthContext } from "@/components/lib";
import "./sub.scss";

export function SubNav(props) {
  const context = useContext<any>(AuthContext); // TODO: Type this
  console.log("SubNav props:", props);
  console.log("AuthContext data:", context);
  console.log("SubNav items:", props.items);

  return (
    <nav className="subnav">
      {props.items?.map((item) => {
        if (item.permission && !context.permission[item.permission])
          return false;

        return (
          <NavLink
            key={item.label}
            to={item.link}
            // TODO: Fix Acitve class namae
            // @ts-ignore
            activeclassname="active"
            className="item"
          >
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
