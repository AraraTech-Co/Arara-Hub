import { Button } from "@/components/lib";
import Style from "./table.tailwind";

type TableActionsProps = {
  row: any;
  index: number;
  callback: any;
}

export default function TableActions(props: TableActionsProps) {
  const row = props.row;

  return (
    <td key={props.index} className={Style.actions}>
      {row.actions?.custom?.map((action, i) => {
        if (action.condition) {
          return row[action.condition.col] === action.condition.value ? (
            <Button
              key={i}
              icon={action.icon}
              action={() => action.action(row)}
              className={Style.actionButton}
            />
          ) : (
            false
          );
        }

        return (
          <Button
            key={i}
            icon={action.icon}
            action={() => action.action(row)}
            className={Style.actionButton}
          />
        );
      })}

      {row.actions.edit && (
        <Button
          icon="edit"
          action={() =>
            row.actions.edit(row, (res) => props.callback.edit(res, row))
          }
          className={Style.actionButton}
        />
      )}

      {row.actions.download && (
        <Button
          icon="download"
          url={row.actions.download}
          className={Style.actionButton}
        />
      )}

      {row.actions.view && (
        <Button
          icon="eye"
          url={`${row.actions.view.url}/${row[row.actions.view.col]}`}
          className={Style.actionButton}
        />
      )}

      {row.actions.email && (
        <Button
          icon="mail"
          action={() => ((window.location as any) = `mailto:${row.email}`)}
          className={Style.actionButton}
        />
      )}

      {row.actions.invite && (
        <Button
          icon="mail"
          action={(e) => row.actions.invite(row)}
          className={Style.actionButton}
        />
      )}

      {row.actions.delete && (
        <Button
          icon="trash"
          action={() =>
            row.actions.delete(row, (res) => props.callback.delete(res, row))
          }
          className={Style.actionButton}
        />
      )}
    </td>
  );
}
