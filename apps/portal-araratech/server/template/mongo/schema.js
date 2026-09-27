import BaseModel from "../BaseModel";
import {I{{capitalisedName}}Document} from "./I{{capitalisedName}}";

export class {{capitalisedName}} extends BaseModel<I{{capitalisedName}}Document> {
  constructor() {
    super(
      {
        id: {type:String, required: true, unique: true},
        account_id: {type: String, required: true}
      },
      "{{capitalisedName}}",
      false 
    )
  }

  public custom = {
    create: {},
    read: {},
    update: {},
    delete: {}
  }
}
