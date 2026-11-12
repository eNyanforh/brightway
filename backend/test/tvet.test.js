import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import express from "express";
import * as s from "../src/modules/tvet/tvet.schema.js";
import {createTvetRoutes} from "../src/modules/tvet/tvet.routes.js";
import {createSessionCookieConfig} from "../src/modules/auth/session.http.js";
test("TVET strict inputs reject tenant overrides, invalid calendar dates, fractional fees and wrong assessment shapes",()=>{
 const assignmentId=randomUUID(),programId=randomUUID(),intakeId=randomUUID(),sectionId=randomUUID();
 for(const data of [{name:"Trade",feeMinor:1.5,currency:"USD"},{name:"Trade",feeMinor:0,currency:"USD",campusId:randomUUID()}])assert.throws(()=>s.parse(s.program,data),{status:400});
 assert.throws(()=>s.parse(s.intake,{programId,name:"Intake",startsOn:"2030-02-30",endsOn:"2030-03-31"}),{status:400});
 assert.throws(()=>s.parse(s.enrolment,{username:"learner",intakeId,sectionId,source:"ADMISSION"}),{status:400});
 assert.throws(()=>s.parse(s.assessment,{assignmentId,title:"Practical",kind:"PRACTICAL",heldOn:"2030-01-01",maxScore:100,passingMark:50}),{status:400});
 assert.throws(()=>s.parse(s.assessment,{assignmentId,title:"Written",kind:"SCORE",heldOn:"2030-01-01"}),{status:400});
 assert.equal(s.parse(s.result,{attempt:1,expectedVersion:0,heldOn:"2030-01-01",finalize:false,outcome:"COMPETENT"}).expectedVersion,0);
});
test("TVET derives numeric outcomes and rejects forged or mixed competency scores",()=>{
 const a={kind:"SCORE",maxScore:50,passingMark:60};assert.equal(s.outcomeFor(a,{score:30,outcome:null}),"COMPETENT");assert.equal(s.outcomeFor(a,{score:29,outcome:null}),"NOT_YET_COMPETENT");assert.throws(()=>s.outcomeFor(a,{score:51,outcome:null}),{status:400});assert.throws(()=>s.outcomeFor(a,{score:10,outcome:"COMPETENT"}),{status:400});assert.throws(()=>s.outcomeFor({kind:"PRACTICAL"},{score:10,outcome:"COMPETENT"}),{status:400});
});
test("completion excludes drafts, requires every module and never rounds up attendance eligibility",()=>{
 const input={assessments:[{id:"a",title:"Safety",required:true,assignment:{moduleId:"m"}}],results:[],modules:[{id:"m",name:"Safety",required:true}],attendance:[{status:"PRESENT"},{status:"LATE"},{status:"ABSENT"}],minimumAttendance:66.67};
 assert.equal(s.progress(input).eligible,false);assert.equal(s.progress({...input,results:[{assessmentId:"a",attempt:1,status:"DRAFT",outcome:"COMPETENT"}],minimumAttendance:50}).eligible,false);
 assert.equal(s.progress({...input,results:[{assessmentId:"a",attempt:1,status:"FINAL",outcome:"COMPETENT"}]}).eligible,false);
 assert.equal(s.progress({...input,results:[{assessmentId:"a",attempt:1,status:"FINAL",outcome:"COMPETENT"}],minimumAttendance:50}).eligible,true);
 assert.equal(s.progress({...input,modules:[...input.modules,{id:"missing",name:"Workshop",required:true}]}).blockers.some(b=>b.includes("Workshop")),true);
});
test("final TVET attendance requires one complete assigned roster",()=>{const a=randomUUID(),b=randomUUID();s.checkRoster([{id:a},{id:b}],[{enrolmentId:a}],false);assert.throws(()=>s.checkRoster([{id:a},{id:b}],[{enrolmentId:a}],true),{status:400});assert.throws(()=>s.checkRoster([],[],true),{status:400});assert.throws(()=>s.checkRoster([{id:a}],[{enrolmentId:b}],false),{status:400});assert.throws(()=>s.parse(s.attendanceSubmission,{expectedVersion:1,finalize:true,records:[{enrolmentId:a,status:"ABSENT"},{enrolmentId:a,status:"PRESENT"}]}),{status:400});});
test("TVET routes enforce session/Origin and mask internal failures",async t=>{let called=0;const sessions={authenticate:async token=>{if(token!=="valid")throw s.fail(401,"Sign in");return {account:{id:randomUUID()},sessionId:randomUUID()};}},tvet={setup:async()=>({}),configure:async()=>{called++;throw Error("Private database details");}};
 const app=express();app.use(express.json());app.use(createTvetRoutes({tvet,sessions,clientUrl:"http://localhost:5173",nodeEnv:"test"}));app.use((e,req,res,next)=>res.status(e.status||500).json({message:e.message}));const server=app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}/organization-workspace/${randomUUID()}/campus/tvet`,cookie=createSessionCookieConfig("test").name+"=valid";
 assert.equal((await fetch(base)).status,401);assert.equal((await fetch(base,{headers:{cookie}})).headers.get("cache-control"),"no-store");assert.equal((await fetch(base+"/programs",{method:"POST",headers:{cookie}})).status,403);assert.equal(called,0);const failed=await fetch(base+"/programs",{method:"POST",headers:{cookie,Origin:"http://localhost:5173"}});assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/database details/);
});
