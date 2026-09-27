/***
 *
 *   APP NAV
 *   Primary navigation used inside the main app component
 *
 *   PROPS
 *   type: fixed or popup (style of nav on mobile)
 *   items: array of objects containing label, link and icon (optional)
 *
 **********/

import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Logo, Button, Icon } from "@/components/lib";
import "./app.scss";

export function AppNav(props) {
  // state
  const [open, setOpen] = useState(false); // mobile is open
  const [expanded, setExpanded] = useState(false); // desktop is expanded

  return (
    <nav
      className={`sidebar popup ${open && "open"} ${expanded && "expanded"}`}
      onMouseEnter={(e) => setExpanded(true)}
      onMouseLeave={(e) => setExpanded(false)}
    >
      <Button
        icon={open ? "x" : "menu"}
        color={"dark"}
        size={12}
        className="btn-togglenav"
        action={(e) => setOpen(!open)}
      />

      <Logo mark />
      <section className="nav-links">
        {props.items?.map((item) => {
          if (item.link) {
            return (
              <NavLink
                key={item.label}
                to={item.link}
                style={{ width: 100 / props.items.length + "%" }}
              >
                {item.icon && (
                  <Icon
                    className="icon"
                    image={item.icon}
                    size={open ? 15 : 18}
                    color={open ? "dark" : "light"}
                  />
                )}
                {item.label && <span className="label">{item.label}</span>}
              </NavLink>
            );
          }

          return (
            <div key={item.label} onClick={item.action}>
              {item.icon && (
                <Icon
                  className="icon"
                  image={item.icon}
                  size={open ? 15 : 18}
                  color={open ? "dark" : "light"}
                />
              )}
              {item.label && <span className="label">{item.label}</span>}
            </div>
          );
        })}
      </section>
    </nav>
  );
}
