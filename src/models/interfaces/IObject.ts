

import { Document, Schema } from "mongoose";
import { IPropertyValue } from "./IPropertyValue";





export interface IObject extends Document {
    user: Schema.Types.ObjectId,
    type: Schema.Types.ObjectId,
    properties: IPropertyValue[]
}