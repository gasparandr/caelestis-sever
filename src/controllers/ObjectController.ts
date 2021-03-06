

import { Router, Request, Response, NextFunction } from "express";

import Object from "../models/Object";
import ObjectType from "../models/ObjectType";
import {IObjectType} from "../models/interfaces/IObjectType";
import PropertyDef from "../models/PropertyDef";
import {IPropertyDef} from "../models/interfaces/IPropertyDef";
import {ValidationHelper} from "../helpers/ValidationHelper";
import {ObjectSearchHelper} from "../helpers/ObjectSearchHelper";





class ObjectController {

    router: Router;

    constructor() {
        this.router = Router();
        this.routes();
    }


    public routes() {
        this.router.post( "/search", this.searchForObjectsByConditions );
        this.router.get( "/type/:id", this.getObjectsByType );
        this.router.delete( "/:id", this.deleteObject );
        this.router.get( "/:id", this.getObjectById );
        this.router.post( '/', this.createObject );
        this.router.get( '/', this.getObjects );
        this.router.put( '/', this.editObject );
    }



    public editObject(req: Request, res: Response, next: NextFunction) {

        const user = req.app.get( "user" )._id;

        const { id, properties } = req.body;

        // TODO: get PropertyValue ids and parse them to PropertyDef its

        Object.findOne( { _id: id, user } )
            .populate( "type" )
            .populate("properties.propertyDef" )
            .then( (object) => {

                object = object as any;
                const objectType = object.type as any;

                let objectTypeProperties = [];

                for ( let propId of objectType.properties ) {
                    objectTypeProperties.push( propId.toString() );
                }

                let filteredProperties = [];

                for ( let p of properties ) {
                    if ( objectTypeProperties.indexOf( p.propertyDef ) > -1 ) filteredProperties.push( p );
                }


                let propertyDefinitions = [];

                for ( let prop of object.properties ) {
                    propertyDefinitions.push( prop.propertyDef );
                }


                /** Validating required properties */

                for ( let prop of propertyDefinitions ) {

                    if ( (prop as IPropertyDef).requiredFor.indexOf( objectType._id ) > -1) {

                        for ( let p of filteredProperties ) {

                            if ( p.propertyDef === (prop as IPropertyDef)._id.toString() ) {

                                if ( p.value == null || p.value == "" ) {

                                    res.status( 400 ).json( { success: false, message: (prop as any).name + " is a required property for objects of type " + ( object.type as any).name } );
                                    return;

                                }
                            }
                        }
                    }
                }



                for ( let prop of propertyDefinitions ) {

                    let propVal = filteredProperties.filter( p => p.propertyDef === prop._id.toString() )[0];

                    if ( ! propVal ) propVal = { propertyDef: prop._id.toString(), value: "" };

                    /** Validate property value against the data type */

                    if ( propVal.value !== "" && propVal.value != null ) {

                        if ( ! ValidationHelper.validatePropertyValueForDataType( propVal.value, prop.dataType  ) ) {

                            res.status( 400 ).json( { success: false, message: "Invalid value " + propVal.value + " for property " + prop.name } );
                            return;

                        }
                    }


                    /** Parse data type */

                    const value: any = ValidationHelper.parsePropertyValueBasedOnDataType( propVal.value, prop.dataType );


                    for ( let i = 0; i < object.properties.length; i++ ) {
                        if ( propVal.propertyDef === ( object.properties[i].propertyDef as any )._id.toString() ) {
                            object.properties[i].value = value;
                            break;
                        }
                    }

                }


                return object.save();

            })
            .then( (object) => {

                object
                    .populate( "properties.propertyDef", "requiredFor objectType" )
                    .populate("type", "name nameProperty" )
                    .execPopulate()
                    .then( () => res.status( 200 ).json( { success: true, object, message: "Object successfully updated." } ) );
            })
            .catch( next );

    }



    public getObjects(req: Request, res: Response, next: NextFunction) {

        const user = req.app.get( "user" )._id;

        Object.find( { user } )
            .populate("properties.propertyDef", "requiredFor objectType" )
            .populate("type", "name nameProperty" )
            .then( (objects) => res.status( 200 ).json( { success: true, objects } ) )
            .catch( next );
    }



    public getObjectById(req: Request, res: Response, next: NextFunction) {

        const { id } = req.params;
        const user = req.app.get( "user" )._id;

        Object.findOne( { _id: id, user } )
            .populate("properties.propertyDef", "requiredFor objectType" )
            .populate("type", "name nameProperty" )
            .then( (object) => res.status( 200 ).json( { success: true, object } ) )
            .catch( next );
    }



    public getObjectsByType(req: Request, res: Response, next: NextFunction){

        const type: string = req.params.id;
        const user = req.app.get( "user" )._id;

        Object.find( { user, type })
            .populate("properties.propertyDef", "requiredFor objectType" )
            .populate("type", "name nameProperty" )
            .then( (objects) => res.status( 200 ).json( { success: true, objects } ) )
            .catch( next );
    }



    public createObject(req: Request, res: Response, next: NextFunction) {

        /** PROTOCOL EXAMPLE
         * {
                "type":"5bc346320faf484be056fb90",
                "properties":[
                    {
                        "propertyDef":"5bc346320faf484be056fb8d",
                        "value":"John"
                    },
                    {
                        "propertyDef":"5bc346320faf484be056fb8e",
                        "value":"Doe"
                    },
                    {
                        "propertyDef":"5bc346320faf484be056fb8f",
                        "value":"Director"
                    }
                ]
            }
         *
         * type: id of ObjectType
         * propertyDef: id of PropertyDef
         *
         * */


        const { type, properties } = req.body;
        const user = req.app.get( "user" )._id.toString();

        let ot = null;
        let nameProperty = null;

        ObjectType.findOne( { user, _id: type } )
            .then( (objectType): any => {

                objectType = objectType as IObjectType;

                if ( ! objectType ) {
                    res.status( 400 ).json( { success: false, message: "Invalid object type specified at object creation" } );
                    return;
                }

                ot = objectType;
                nameProperty = objectType.nameProperty;


                return PropertyDef.find( { _id: { $in: objectType.properties } } );
            })
            .then( (objectTypeProps) => {

                objectTypeProps = objectTypeProps as [ IPropertyDef ];


                console.log( "objectTypeProps");
                console.log( objectTypeProps);

                /** Validate required properties */

                for ( let prop of objectTypeProps ) {

                    if ( prop.requiredFor.indexOf( type ) > -1 ) { //TODO: Validation bug - should be debugged

                        for ( let p of properties ) {

                            if ( p.propertyDef === prop._id ) {

                                if ( p.value == null || p.value == "" ) {

                                    res.status( 400 ).json( { success: false, message: prop.name + " is a required property for objects of type " + ot.name } );
                                    return;
                                }
                            }
                        }
                    }
                }

                /** Create object */

                let object = new Object( { user, type, nameProperty } );
                let propertyValues = [];


                /** Populate properties */

                for ( let prop of objectTypeProps ) {

                    let propVal = properties.filter( p => p.propertyDef === prop._id.toString() )[0];

                    // console.log( propVal );


                    if ( ! propVal ) propVal = { propertyDef: prop._id, value: "" };

                    /** Validate property value against the data type */

                    if ( propVal.value !== "" && propVal.value != null ) {

                        if ( ! ValidationHelper.validatePropertyValueForDataType( propVal.value, prop.dataType  ) ) {

                            res.status( 400 ).json( { success: false, message: "Invalid value " + propVal.value + " for property " + prop.name } );
                            return;

                        }
                    }

                    /** Parse data type */

                    const value: any = ValidationHelper.parsePropertyValueBasedOnDataType( propVal.value, prop.dataType );

                    propertyValues.push({
                        name: prop.name,
                        dataType: prop.dataType,
                        propertyDef: prop._id,
                        value: value
                    });
                }


                object.properties = propertyValues;


                object.save()
                    .then( (object) => {

                        object
                            .populate( "properties.propertyDef", "requiredFor" )
                            .populate("type", "name nameProperty" )
                            .execPopulate()
                            .then( () => res.status( 200 ).json( { success: true, object, message: "" } ) );

                    })
                    .catch( next );


            })
            .catch( next );


    }



    public deleteObject(req: Request, res: Response, next: NextFunction) {
        const objectId: string = req.params.id;
        const user = req.app.get( "user" )._id;


        Object.findOneAndRemove( { user, _id: objectId } )
            .then( () => {

                res.status( 200 ).json( { success: true, message: "Object successfully deleted." } );

            })
            .catch( next );
    }



    public searchForObjectsByConditions(req: Request, res: Response, next: NextFunction) {
        /**
         *  PROTOCOL:
         *
         * {
                "types": [ "5bc5cde95db4d10498eda24f" ],
                "conditions": [
                    {
                        "propertyDef": "5bc5cdd75db4d10498eda24e",
                        "operator": 1,
                        "dataType": 4,
                        "value": "2018-10-16T00:00:00.000Z"
                    }
                ]
            }
         *
         * types: array of Object Type Id's
         * operator: SearchConditionType ( e.g. EQUAL, NOT EQUAL, CONTAINS, LESS THAN ... )
         * dataType: DataType ( e.g. TEXT, NUMBER, DATE, BOOLEAN ... )
         * value: value to compare against, can be of type any ***BUT*** it works in conjunction with the data type
         *
         * */

        const user = req.app.get( "user" )._id;

        Object.find( ObjectSearchHelper.generateQueryFromSearchConditions( user, req.body ) )
            .populate("properties.propertyDef", "requiredFor objectType" )
            .populate("type", "name nameProperty" )
            .then( (objects) => res.status( 200 ).json( { success: true, objects } ) )
            .catch( next );
    }

}



export default new ObjectController().router;