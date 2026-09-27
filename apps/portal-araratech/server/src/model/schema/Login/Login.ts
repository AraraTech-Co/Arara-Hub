import prisma from "../../prisma";
import Model from "../Model";
import { ILogin } from "./ILogin";

export class Login extends Model<ILogin> {
  constructor() {
    super(prisma.login as never);
  }

  public custom = {
    create: {
      create: async ({ user, req }: { user: string; req: any }) => {
        const headers = req.headers as Record<string, string>;
        const ip =
          (headers["x-forwarded-for"] || "").split(",").pop()?.trim() ||
          (req.connection as { remoteAddress?: string })?.remoteAddress ||
          (req.socket as { remoteAddress?: string })?.remoteAddress ||
          (
            req.connection as { socket?: { remoteAddress?: string } }
          )?.socket?.remoteAddress;

        let browser, device;
        if (process.env.NODE_ENV !== "test") {
          const ua = headers["user-agent"];
          device =
            process.env.NODE_ENV === "test"
              ? "Test"
              : ua
                  .substring(ua.indexOf("(") + 1, ua.indexOf(")"))
                  .replace(/_/g, ".");
          const uarr = ua.split(" ");
          browser = uarr[uarr.length - 1];
        } else {
          browser = "Mock";
          device = "Test";
        }

        const newLogin = {
          userId: user,
          ip: ip || "unknown",
          time: new Date(),
          browser,
          device,
        };

        const result = await this.create.new(newLogin as Partial<ILogin>);
        return {
          ...result,
          user_id: user,
        };
      },
    },
    verify: {
      verify: async ({
        user,
        current,
      }: {
        user: string;
        current: ILogin & { id?: string };
      }) => {
        let riskLevel = 0;

        const flag = {
          ip: current.ip,
          device: current.device,
          browser: current.browser?.split("/")[0],
        };

        const history = await prisma.login.findMany({
          where: {
            userId: user,
            ...(current.id && { NOT: { id: current.id } }),
          },
          take: 500,
        });

        if (history.length) {
          if (history.findIndex((x) => x.ip === current.ip) < 0) riskLevel++;
          if (history.findIndex((x) => x.browser === current.browser) < 0) {
            riskLevel++;
          }
          const devices = history.filter(
            (x) => x.device !== current.device,
          )?.length;
          if (devices > 1) riskLevel++;
        }

        let time: Date | string | string[] = new Date(current.time)
          .toISOString()
          .split("T");
        time = `${time[0]} ${time[1].split(".")[0]}`;

        return {
          flag: flag,
          level: riskLevel,
          time: time,
        };
      },
    },
  };
}
