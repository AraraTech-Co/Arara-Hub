import { Request, Response } from "express";
import Controller from "../Controller";
import { PortalSuporteService } from "@/model/lib/PortalSuporte";
import { PortalSuporteError } from "@/model/lib/PortalSuporte/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return !Number.isNaN(n) && n > 0 ? n : undefined;
}

class TicketController extends Controller {
  private service = new PortalSuporteService();

  public list = async (req: Request, res: Response) => {
    try {
      const result = await this.service.list({
        status: req.query.status as string | undefined,
        priority: req.query.priority as string | undefined,
        severity: req.query.severity as string | undefined,
        created_after: req.query.created_after as string | undefined,
        created_before: req.query.created_before as string | undefined,
        page: parsePositiveInt(req.query.page),
        page_size: parsePositiveInt(req.query.page_size),
      });

      return this.sendSuccess(res, result);
    } catch (error) {
      return this.handlePortalSuporteError(res, error);
    }
  };

  public getById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!UUID_REGEX.test(id)) {
        return this.sendError(res, "id inválido", 400);
      }

      const ticket = await this.service.getById(id);
      return this.sendSuccess(res, ticket);
    } catch (error) {
      return this.handlePortalSuporteError(res, error);
    }
  };

  public getMessages = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!UUID_REGEX.test(id)) {
        return this.sendError(res, "id inválido", 400);
      }

      const after = req.query.after as string | undefined;
      const messages = await this.service.getMessages(id, after);
      return this.sendSuccess(res, messages);
    } catch (error) {
      return this.handlePortalSuporteError(res, error);
    }
  };

  public getAttachments = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!UUID_REGEX.test(id)) {
        return this.sendError(res, "id inválido", 400);
      }

      const attachments = await this.service.getAttachments(id);
      return this.sendSuccess(res, attachments);
    } catch (error) {
      return this.handlePortalSuporteError(res, error);
    }
  };

  private handlePortalSuporteError(res: Response, error: unknown) {
    if (error instanceof PortalSuporteError) {
      return this.sendError(res, error.message, error.status);
    }
    return this.sendError(res, "Erro ao consultar chamados", 500);
  }
}

export default new TicketController();
