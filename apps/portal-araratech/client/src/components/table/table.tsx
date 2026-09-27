// TODO: This file has lots of any types, needs to be properly addressed

/***
 *
 *   TABLE
 *   Please view the full documentation: https://docs.Sample.app/ui/table
 *
 *   PROPS
 *   data: array of objects for body and header (optional)
 *   search: bool to show the search field
 *   sort: allow the table columns to be sorted
 *   loading: bool to toggle loading spinner
 *   badge - object containing column name and color to add badges to column
 *   show - array of columns (object key names) to show (shows all if not provided)
 *   hide - array of columns (object key names) to hide
 *   actions: object with edit/delete keys set to callback functions (optional)
 *
 **********/

import { Fragment, useState, useEffect } from "react";
import { Loader, Search, ClassHelper } from "@/components/lib";
import { Header } from "./header";
import { Body } from "./body";
import Style from "./table.tailwind";

type TableProps = {
  data: any;
  search?: boolean;
  sort?: boolean;
  loading?: boolean;
  badge?: {
    col: string;
    color: string;
    condition?: Array<{
      value: any;
      color: string;
    }>;
  };
  show?: Array<string>;
  hide?: Array<string>;
  actions?: {
    edit?: Function;
    view?: Function;
    delete?: Function;
    email?: boolean;
    custom?: Array<{
      icon: string;
      action: Function;
      condition?: {
        col: string;
        value: any;
      };
    }>;
  };
  throttle?: number;
  naked?: boolean;
  className?: string;
}

export function Table(props: TableProps) {
  // state
  const [header, setHeader] = useState(null);
  const [body, setBody] = useState(null);
  const [filter, setFilter] = useState<any>(false);

  useEffect(() => {
    if (props.data) {
      // create the headers
      let header = props.data.header || [];

      if (!header.length) {
        for (let key in props.data[0]) {
          header.push({
            name: key,
            title: key.replace("_", " "),
            sort: key === "actions" ? false : true,
          });
        }
      }

      setBody(props.data);
      setHeader(header);
    }
  }, [props.data]);

  // loading
  if (props.loading) {
    return (
      <div className={Style.loading}>
        <Loader />
      </div>
    );
  }

  // no data
  if (!header && !body) return null;

  function sort(column, direction) {
    const rows: any = filter.length ? [...filter] : [...body];

    rows.sort(function (a, b) {
      if (a[column] != null && b[column] != null) {
        a[column].badge ? (a = a[column].label) : (a = a[column]);

        b[column].badge ? (b = b[column].label) : (b = b[column]);

        if (direction === "desc") {
          if (a > b) return -1;
          if (a < b) return 1;
          else return 0;
        } else {
          if (a < b) return -1;
          if (a > b) return 1;
          else return 0;
        }
      } else {
        return false;
      }
    });

    filter ? setFilter(rows) : setBody(rows);
  }

  function search(term) {
    // search each cell in each row &
    // update state to show only filtered rows
    let rowsToShow: any = [];

    body.forEach((row) => {
      for (let cell in row) {
        if (row[cell]?.toString().toLowerCase().includes(term.toLowerCase())) {
          if (!rowsToShow.includes(row)) rowsToShow.push(row);
        }
      }
    });

    setFilter(rowsToShow);
  }

  function editRowCallback(res, row) {
    let state = [...body];
    let stateRow = state[state.findIndex((x) => x.id === row.id)];
    Object.keys(res).map((key) => (stateRow[key] = res[key].value));
    setBody(state);
  }

  function deleteRowCallback(res, row) {
    let state = [...body];
    state.splice(
      state.findIndex((x) => x.id === row.id),
      1,
    );
    setBody(state);
  }

  const tableStyle = ClassHelper(Style, {
    table: true,
  });

  return (
    <Fragment>
      {props.search && (
        <Search
          className={Style.search}
          callback={search}
          throttle={props.throttle}
        />
      )}

      <table className={!props.naked && tableStyle}>
        {header && (
          <Header
            data={header}
            callback={sort}
            show={props.show}
            hide={props.hide}
            actions={props.actions}
          />
        )}
        {body && (
          <Body
            data={filter ? filter : body}
            show={props.show}
            hide={props.hide}
            badge={props.badge}
            actions={{
              edit: props.actions?.edit,
              view: props.actions?.view,
              delete: props.actions?.delete,
              email: props.actions?.email,
              custom: props.actions?.custom,
            }}
            callback={{
              edit: editRowCallback,
              delete: deleteRowCallback,
            }}
          />
        )}
      </table>
    </Fragment>
  );
}
