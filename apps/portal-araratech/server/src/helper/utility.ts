export const use = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function convertToMonthName(month: any): string {
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return monthNames[month - 1];
}

export function validate(form: any, fields?: any[]): void {
  Object.keys(form).forEach((f) => {
    if (typeof form[f] === "string" && form[f]?.includes("<script>")) {
      form[f] = form[f].replace("<script>", "");
      form[f] = form[f].replace("</script>", "");
    }
  });

  if (fields?.length) {
    fields.forEach((f) => {
      if (!form.hasOwnProperty(f) || !form[f]) {
        throw { message: f + " field is required" };
      }
    });
  }
}

export function assert(data: any, err: string, input?: any): boolean {
  if (!data) throw new Error(`${err}${input ? ": " + input : ""}`);
  return true;
}

export const base64 = {
  encode: (data: any): any => Buffer.from(data).toString("base64"),
  decode: (data: any): any => Buffer.from(data, "base64").toString("utf-8"),
};

export function dedupeArray(arr: any[]): any[] {
  return arr.filter((elem, index, self) => index === self.indexOf(elem));
}

export const currencySymbol = {
  usd: "$",
  gbp: "£",
  eur: "€",
  aud: "$",
  cad: "$",
  brl: "R$",
};

export function mask(s: any): string {
  return `${s.slice(0, 3)}...${s.slice(s.length - 3, s.length)}`;
}

export function validateNativeURL(url: any, scheme: any = null): any {
  return url && (url.includes("exp://") || url.includes(`${scheme}://`))
    ? url
    : false;
}
