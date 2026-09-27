import React from "react";
import { Badge } from "components/lib";
import TableActions from "./actions";
import Style from "./table.tailwind";

export function Body(props) {
  if (props.data?.length) {
    return (
      <tbody className={Style.body}>
        {props.data.map((row, index) => {
          return <Row {...props} data={row} key={index} />;
        })}
      </tbody>
    );
  }

  return (
    <tbody className={Style.body}>
      <tr>
        <td colSpan={10} className={Style.empty}>
          No results found
        </td>
      </tr>
    </tbody>
  );
}

export function Row(props) {
  let row = { ...props.data };
  row.actions = row.actions || props.actions;
  const hasActions = Object.values(row.actions).some((x) => x !== undefined);

  return (
    <tr data-id={props.data.id}>
      {Object.keys(row).map((cell, index) => {
        // actions
        if (cell === "actions")
          return hasActions ? (
            <TableActions
              row={row}
              index={index}
              key={index}
              callback={props.callback}
            />
          ) : (
            false
          );

        // hide
        if (props.hide?.includes(cell)) return false;

        // show
        if (props.show && !props.show.includes(cell)) return false;

        let value = row[cell];

        // is date/time
        if (/([12]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))/.test(value)) {
          const date = new Date(value).toISOString().split("T");
          value = `${date[0]} ${date[1].split(".")[0]}`;
        }

        // has badge
        if (value !== undefined && props.badge && cell === props.badge.col) {
          // default color
          let color = props.badge.color;

          // check each condition
          if (props.badge.condition) {
            props.badge.condition.forEach((cond) => {
              typeof cond.value === "string" && typeof value === "string"
                ? (color =
                    cond.value.toLowerCase() === value.toLowerCase()
                      ? cond.color
                      : color)
                : (color = cond.value === value ? cond.color : color);
            });
          }

          return (
            <td key={index} className={Style.cell}>
              <Badge
                text={value === true ? "Yes" : value === false ? "No" : value}
                color={color}
                className={Style.badge}
              />
            </td>
          );
        }

        // standard cell
        return (
          <td key={index} className={Style.cell}>
            {value === true ? "Yes" : value === false ? "No" : value}
          </td>
        );
      })}
    </tr>
  );
}
