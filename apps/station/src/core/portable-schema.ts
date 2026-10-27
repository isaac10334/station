/** Deliberately bounded JSON-schema subset for authored method and asset contracts. */
import { z } from "zod";
type Schema={type?:"null"|"boolean"|"number"|"integer"|"string"|"array"|"object";properties?:Record<string,Schema>;required?:string[];additionalProperties?:boolean;items?:Schema;enum?:unknown[];description?:string};
const schema:z.ZodType<Schema>=z.lazy(()=>z.object({type:z.enum(['null','boolean','number','integer','string','array','object']).optional(),properties:z.record(z.string().max(80),schema).optional(),required:z.array(z.string().max(80)).max(128).optional(),additionalProperties:z.boolean().optional(),items:schema.optional(),enum:z.array(z.union([z.string().max(4096),z.number().finite(),z.boolean(),z.null()])).max(128).optional(),description:z.string().max(2000).optional()}).strict());
export function portableSchema(value:unknown):Schema {
  if(JSON.stringify(value).length>32768)throw new Error('Schema exceeds budget');
  const visit=(value:any,depth=0)=>{if(depth>12)throw new Error('Schema nesting exceeds limit');if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid schema');for(const [key,child]of Object.entries(value.properties??{})){if(['__proto__','prototype','constructor'].includes(key))throw new Error('Reserved schema property');visit(child,depth+1);}if(value.items)visit(value.items,depth+1);};visit(value);return schema.parse(value);
}
export function validatePortableValue(definition:unknown,value:unknown) {
 const spec=portableSchema(definition);if(JSON.stringify(value??null).length>16384)throw new Error('Value exceeds budget');
 const check=(schema:Schema,input:any,depth:number)=>{if(depth>16)throw new Error('Value nesting exceeds limit');if(schema.enum&&!schema.enum.some(value=>Object.is(value,input)))throw new Error('Value is outside enum');
 if(schema.type){const matches=schema.type==='null'?input===null:schema.type==='array'?Array.isArray(input):schema.type==='object'?input!==null&&typeof input==='object'&&!Array.isArray(input):schema.type==='integer'?Number.isSafeInteger(input):schema.type==='number'?typeof input==='number'&&Number.isFinite(input):typeof input===schema.type;if(!matches)throw new Error(`Expected ${schema.type}`);}
 if(input&&typeof input==='object'&&!Array.isArray(input)){for(const required of schema.required??[])if(!Object.hasOwn(input,required))throw new Error('Missing required field');for(const [key,child]of Object.entries(input)){if(Object.hasOwn(schema.properties??{},key))check(schema.properties![key]!,child,depth+1);else if(schema.additionalProperties===false)throw new Error('Unexpected field');}}
 if(Array.isArray(input)&&schema.items)input.forEach(item=>check(schema.items!,item,depth+1));};check(spec,value,0);return value;
}
