import {coverageId} from './outcome-spec.mjs';
import {validateProductTrial,PRODUCT_MODEL_ERRORS} from './factory-product-trial.mjs';
import {apiProcessPortConfiguration} from './scaffold/api-process.mjs';
import {parseBoundedJson} from '../lib/bounded-json.mjs';
import {supportsLocalApiContinuation} from './factory-continuation.mjs';

const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
export class FactoryProductProposalError extends Error {
  constructor(field,message){super(message);this.code='factory_product_proposal_invalid';this.field=field;}
}
const fail=(field,message)=>{throw new FactoryProductProposalError(field,message);};
const fields=['functions','expected_json','model_output','model_error'];
const hostChecks=['model_connection','managed_start','managed_stop'];

/** Product examples refer to the brief's numbered functions. File names, ports,
 * coverage IDs, verifier bytes and approval hashes belong to the host. */
export function validateProductProposal(product,coreFunctions){
  if(!Array.isArray(coreFunctions) || !coreFunctions.length || coreFunctions.length>32)fail('brief.coreFunctions','List one to 32 product functions in brief.coreFunctions; successCriteria is a separate field and does not supply this list.');
  try{parseBoundedJson(JSON.stringify(product),{maxBytes:12000,maxDepth:8,maxNodes:500});}catch{fail('product','Use a bounded JSON product proposal.');}
  if(!object(product) || Object.keys(product).some(key=>!['http','cli','host_checks'].includes(key)) || !Array.isArray(product.http))fail('product.http','Supply HTTP examples for this API process product.');
  const functions=(values,field)=>{
    if(!Array.isArray(values) || !values.length || values.length>32 || values.some(n=>!Number.isSafeInteger(n) || n<1 || n>coreFunctions.length))fail(field,'Use one-based indexes into brief.coreFunctions.');
  };
  for(const kind of ['http','cli']){
    const cases=product[kind];if(cases===undefined)continue;
    if(!Array.isArray(cases) || cases.length<1 || cases.length>8)fail('product.'+kind,'Supply one to eight examples for each selected interface.');
    for(const [i,check] of cases.entries()){
      const allowed=[...fields,...(kind==='http'?['path','input_json','expected_status']:['arguments','expected_exit'])];
      if(!object(check) || Object.keys(check).some(key=>!allowed.includes(key)))fail('product.'+kind+'.'+i,'Use declarative product input and expected JSON, not commands or paths to verifiers.');
      functions(check.functions,'product.'+kind+'.'+i+'.functions');
      if(kind==='cli' && (!Array.isArray(check.arguments) || check.arguments.some(value=>typeof value!=='string')))fail('product.cli.'+i+'.arguments','Supply the CLI arguments after the host-selected entrypoint.');
    }
  }
  if(product.host_checks!==undefined){
    if(!object(product.host_checks) || Object.keys(product.host_checks).some(key=>!hostChecks.includes(key)))fail('product.host_checks','Use the declared host check names.');
    for(const [kind,values] of Object.entries(product.host_checks))functions(values,'product.host_checks.'+kind);
  }
}

export function compileProductProposal(product,data){
  if(!supportsLocalApiContinuation(data))throw Object.assign(new Error('Use the custom draft workflow for this runtime, model connection or repository adoption profile.'),{code:'factory_proposal_profile_unsupported'});
  validateProductProposal(product,data.coreFunctions || []);
  const id=n=>coverageId('core',data.coreFunctions[n-1],n-1);
  const port=apiProcessPortConfiguration(data).variable;
  const trial={};
  for(const kind of ['http','cli'])if(product[kind])trial[kind]=product[kind].map(({functions,arguments:args,...check})=>({
    ...check,argv:kind==='http'?['node','scripts/server.mjs']:['node',data.cliEntrypoint || 'scripts/agent-cli.mjs',...args],
    ...(kind==='http'?{port_variable:port}:{}),covers:[...new Set(functions.map(id))],
  }));
  if(product.host_checks)trial.host_checks=Object.fromEntries(Object.entries(product.host_checks).map(([key,values])=>[key,[...new Set(values.map(id))]]));
  for(const [index,statement] of data.coreFunctions.entries()){
    // Exact standard lifecycle statements have known host proofs. A broader
    // promise still needs an explicit mapping and normal Outcome review.
    const checks=/^Health and Stop work without a model connection\.?$/i.test(statement)?['model_connection','managed_stop']
      :/^(?:A )?missing (?:model )?connection produces an explicit service error\.?$/i.test(statement)?['model_connection']
      :/^Managed Start preserves (?:PRITHA_CHILD_MODEL_URL and PRITHA_CHILD_MODEL_TOKEN in (?:the )?server environment|the model URL, token and port) without logging (?:either|the connection)\.?$/i.test(statement)?['managed_start']:[];
    for(const name of checks){trial.host_checks ||= {};trial.host_checks[name]=[...new Set([...(trial.host_checks[name] || []),id(index+1)])];}
  }
  const covered=new Set([...Object.values(trial).filter(Array.isArray).flatMap(cases=>cases.flatMap(c=>c.covers)),...Object.values(trial.host_checks || {}).flat()]);
  if(data.outcomeApprovalPolicy!=="request-delegated-local-v1" && data.coreFunctions.some((_,i)=>!covered.has(id(i+1))))fail('product.functions','Every product function needs a behavioral example or a supported host check before Contract approval.');
  // The implementation deliverable is demonstrated by the approved product
  // examples; the prepared verifier separately binds the user guide and Stop.
  trial.http[0].covers.push(coverageId('deliverable','Working implementation of the approved V1 core functions',0));
  validateProductTrial(trial,data);
  return trial;
}

const jsonObject={type:'object',additionalProperties:true};
const functions={type:'array',minItems:1,maxItems:32,items:{type:'integer',minimum:1,maximum:32},description:'One-based indexes of brief.coreFunctions exercised by this example. No hashes or generated coverage IDs.'};
const common={functions,expected_json:jsonObject,
  model_output:{anyOf:[{type:'string'},jsonObject],description:'The simulated answer of the child model for this example: text or a JSON object. Required for every successful example of a model-connected product.'},
  model_error:{type:'string',enum:[...PRODUCT_MODEL_ERRORS],description:'Only for an error example (expected_status 400–599) of a model-connected product: the simulated failure of its model connection. Omit model_output in that example.'}};
export const PRODUCT_PROPOSAL_SCHEMA={type:'object',additionalProperties:false,required:['http'],properties:{
  http:{type:'array',minItems:1,maxItems:8,items:{type:'object',additionalProperties:false,required:['functions','path','input_json','expected_json'],properties:{...common,path:{type:'string'},input_json:jsonObject,expected_status:{type:'integer',minimum:200,maximum:599}}}},
  cli:{type:'array',minItems:1,maxItems:8,items:{type:'object',additionalProperties:false,required:['functions','arguments','expected_json'],properties:{...common,arguments:{type:'array',items:{type:'string'}},expected_exit:{type:'integer',minimum:0,maximum:125}}}},
  host_checks:{type:'object',additionalProperties:false,properties:Object.fromEntries(hostChecks.map(name=>[name,functions]))},
},description:'Product examples only. Choose examples that demonstrate the intended behavior, including relevant invalid inputs. Model-led local creation accepts one or more successful examples and enum-only model output. Include model_output for each successful LLM case; __PRITHA_MODEL_TEXT__ is optional randomized proof where the product supports free text. Legacy workflows retain their two-variant nonce proof. The host supplies commands, the selected port, coverage IDs and protected verifiers. Lifecycle requirements may use host_checks with coreFunctions indexes.'};
