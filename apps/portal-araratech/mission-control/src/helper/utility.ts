import { Request, Response, NextFunction } from 'express';

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;

export const use = (fn: AsyncRequestHandler) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const convertToMonthName = (month: number): string => {
  const monthNames: string[] = [
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
};


export const validate = (form: { [key: string]: any }, fields: string[]): void => {
  Object.keys(form).forEach((f) => {
    if (typeof form[f] === "string" && form[f]?.includes("<script>")) {
      form[f] = form[f].replace("<script>", "");
      form[f] = form[f].replace("</script>", "");
    }
  });

  if (fields?.length) {
    fields.forEach((f: string) => {
      if (!form.hasOwnProperty(f) || !form[f]) {
        throw { message: f + " field is required" };
      }
    });
  }
};

export const assert = (data: any, err: string, input: object = {}): boolean => {
  if (!data) throw { message: err, ...(input && { inputError: input }) };

  return true;
};

export const currencySymbol: { [key: string]: string } = {
  usd: "$",
  gbp: "£",
  eur: "€",
  aud: "$",
  cad: "$",
};