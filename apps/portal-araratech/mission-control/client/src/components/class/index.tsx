// helper function for constructing tailwind classes
export function ClassHelper(styles, props, debug = false) {
  let str = "";

  if (typeof styles === "object") {
    if (styles.base) str += styles.base; // always apply base styles

    if (Object.keys(props).length) {
      Object.keys(props).forEach((prop) => {
        if (prop === "className" && props[prop]) {
          // always apply className and base
          str = str.trim();
          str += ` ${props[prop]}`;
        } else if (props[prop] && styles.hasOwnProperty(prop)) {
          if (debug) console.log("styles", prop, props[prop], styles[prop]);

          str = str.trim();
          str += ` ${styles[prop]}`;
        }
      });
    }
  }

  if (debug) console.log("final.class", str.trim());

  return str.trim();
}
