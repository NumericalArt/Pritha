import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { readBoundedRegularFile } from "../scripts/lib/safe-file-read.mjs";
import { parseBoundedJson } from "../scripts/lib/bounded-json.mjs";

test("actual evidence reader admits the instance agent root while preserving boundary and parsing limits",t=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),"evidence roots тест "));t.after(()=>rmSync(temp,{recursive:true,force:true}));
  const root=path.join(temp,"checkout"),memory=path.join(temp,"state","agents"),outside=path.join(temp,"outside"),sibling=path.join(temp,"state","agents-other");
  for(const dir of [root,memory,outside,sibling])mkdirSync(dir,{recursive:true});
  const source=readFileSync("scripts/agents-mother/index.mjs","utf8");
  const start=source.indexOf("function readEvidenceInput(inputPath) {"),end=source.indexOf("\nfunction externalResearchContract",start);
  assert.ok(start>=0&&end>start);
  const read=vm.runInNewContext(source.slice(start,end)+"\nreadEvidenceInput;",{ROOT:root,AGENT_MEMORY_ROOT:memory,path,readBoundedRegularFile,parseBoundedJson});
  for(const dir of [root,memory,outside,sibling])writeFileSync(path.join(dir,"evidence.json"),'{"items":[]}\n',"utf8");
  for(const dir of [root,memory])assert.equal(read(path.join(dir,"evidence.json")).items.length,0);
  assert.equal(read("evidence.json").items.length,0,"legacy relative checkout input remains accepted");
  for(const dir of [outside,sibling])assert.throws(()=>read(path.join(dir,"evidence.json")),/Evidence input is missing, unsafe, too large or invalid JSON/);
  symlinkSync(path.join(memory,"evidence.json"),path.join(memory,"linked.json"));symlinkSync(outside,path.join(memory,"escape"));
  for(const target of [memory,path.join(memory,"linked.json"),path.join(memory,"escape","evidence.json")])assert.throws(()=>read(target));
  for(const[name,body]of [["large.json"," ".repeat(1_000_001)],["invalid.json","not JSON"],["deep.json","[".repeat(21)+"0"+"]".repeat(21)]]){
    writeFileSync(path.join(memory,name),body,"utf8");assert.throws(()=>read(path.join(memory,name)),/Evidence input is missing, unsafe, too large or invalid JSON/);
  }
});
