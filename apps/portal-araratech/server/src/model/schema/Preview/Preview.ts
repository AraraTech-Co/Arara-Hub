import prisma from "../../prisma";
import Model from "../Model";
import { IPreview } from "./IPreview";

export class Preview extends Model<IPreview> {
  constructor() {
    super(prisma.preview as never);
  }

  public custom = {
    create: {},
    read: {},
    update: {},
    delete: {},
  };
}
