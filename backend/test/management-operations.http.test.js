import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { createManagementOperationsRoutes,createSupportRoutes } from "../src/modules/management/management-operations.routes.js";
import { actionSchema,caseActionSchema,caseCreateSchema,messageSchema } from "../src/modules/management/management-operations.schema.js";
test("operations inputs reject injected authority, invalid versions, unsupported actions and inconsistent report targets", () => {
  const base = { expectedVersion:0,action:"SUSPEND",reason:"A documented reason",requestKey:randomUUID() };
  assert(actionSchema.safeParse(base).success); for (const value of [{...base,isSuperAdmin:true},{...base,expectedVersion:-1},{...base,action:"VERIFY"},{...base,requestKey:"replay"}]) assert(!actionSchema.safeParse(value).success);
  assert(!caseCreateSchema.safeParse({kind:"REPORT",subject:"A report",body:"A detailed report body",requestKey:randomUUID()}).success);
  assert(!caseActionSchema.safeParse({...base,expectedVersion:1,action:"STATUS"}).success);
  assert(!messageSchema.safeParse({expectedVersion:1,body:"hello",requestKey:randomUUID(),actorId:randomUUID()}).success);
});
test("operations and support HTTP isolate cookies, require Origin for writes, scope actors server-side and hide unknown failures", async () => {
  const calls=[],app=express(),id=randomUUID(),staffId=`mg_${randomUUID()}`;
  const authentication={ async authenticate(token) { if(token!=="management-token") throw Object.assign(Error("Management sign-in required"),{status:401});return {staff:{id:staffId},sessionId:"synthetic-session"}; } };
  const sessions={async authenticate(token) {if(token!=="personal-token")throw Object.assign(Error("Personal sign-in required"),{status:401});return {account:{id},sessionId:"personal-session"};}};
  const operations={async directory(actor,kind) {calls.push([actor,kind]);return {items:[]};},async control(actor,kind,target,body) {calls.push([actor,kind,target,body]);return {saved:true};},async entity(){throw Error("private SQL detail and secret");}};
  const cases={async list(actor) {calls.push(actor);return {items:[]};},async create(body,actor) {calls.push([body,actor]);return {id};}};
  const postModeration={async list(actor,query) {calls.push(["post-list",actor,{...query}]);return {items:[],nextCursor:null};},async decide(actor,target,body) {calls.push(["post-decision",actor,target,body]);return {id:target,moderationStatus:"PUBLISHED"};}};
  const limiter=(_r,_s,next)=>next();app.use(express.json());app.use(createManagementOperationsRoutes({operations,cases,postModeration,authentication,clientUrl:"https://brightway.test",nodeEnv:"test",limiter}));app.use(createSupportRoutes({cases,sessions,clientUrl:"https://brightway.test",nodeEnv:"test",limiter}));
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({message:error.message}));const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base+"/management/tools/users",{headers:{Cookie:"brightway_session=personal-token"}})).status,401);
    assert.equal((await fetch(base+"/support/cases?kind=SUPPORT",{headers:{Cookie:"brightway-management=management-token"}})).status,401);
    const headers={Cookie:"brightway-management=management-token","Content-Type":"application/json"};
    assert.equal((await fetch(base+`/management/tools/users/${id}/actions`,{method:"POST",headers,body:"{}"})).status,403);
    const directory=await fetch(base+"/management/tools/users",{headers});assert.equal(directory.status,200);assert.equal(directory.headers.get("cache-control"),"no-store");assert.deepEqual(calls[0],[{staffId,sessionId:"synthetic-session"},"users"]);
    const failed=await fetch(base+`/management/tools/users/${id}`,{headers});assert.equal(failed.status,503);assert(!JSON.stringify(await failed.json()).includes("SQL"));
    assert.equal((await fetch(base+`/management/tools/users/${id}/actions?actorId=forged`,{method:"POST",headers:{...headers,Origin:"https://brightway.test"},body:"{}"})).status,400);
    assert.equal((await fetch(base+"/management/tools/post-reviews",{headers:{Cookie:"brightway_session=personal-token"}})).status,401);
    assert.equal((await fetch(base+"/management/tools/post-reviews",{headers})).status,200);
    assert.deepEqual(calls.at(-1),["post-list",{staffId,sessionId:"synthetic-session"},{}]);
    const decisionBody={decision:"PUBLISHED",expectedVersion:1,requestKey:randomUUID(),reason:"A safe educational project post."};
    assert.equal((await fetch(base+`/management/tools/post-reviews/${id}/decision`,{method:"POST",headers,body:JSON.stringify(decisionBody)})).status,403);
    const approved=await fetch(base+`/management/tools/post-reviews/${id}/decision`,{method:"POST",headers:{...headers,Origin:"https://brightway.test"},body:JSON.stringify(decisionBody)});
    assert.equal(approved.status,200);
    assert.deepEqual(calls.at(-1),["post-decision",{staffId,sessionId:"synthetic-session"},id,decisionBody]);
    assert.equal((await fetch(base+"/support/cases?kind=SUPPORT",{headers:{Cookie:"brightway_session=personal-token"}})).status,200);assert.deepEqual(calls.at(-1),{accountId:id,sessionId:"personal-session"});
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
