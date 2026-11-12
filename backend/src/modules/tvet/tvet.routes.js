import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth,createSessionCookieConfig,requireTrustedOrigin } from "../auth/session.http.js";
import { fail } from "./tvet.schema.js";
export function createTvetRoutes({tvet,sessions,clientUrl,nodeEnv}){
 const router=Router(),base="/organization-workspace/:organizationId/campus/tvet",auth=createRequireAuth({sessions,cookieName:createSessionCookieConfig(nodeEnv).name});
 const privateResponse=(req,res,next)=>{res.set({"Cache-Control":"no-store","Referrer-Policy":"no-referrer"});next();};
 const limiter=rateLimit({windowMs:60000,limit:90,standardHeaders:"draft-8",legacyHeaders:false,keyGenerator:req=>req.auth.account.id,message:{success:false,message:"Training request limit reached. Retry shortly."}}),read=[privateResponse,auth,limiter],write=[...read,requireTrustedOrigin(clientUrl)];
 const route=(method,path,fn,status=200)=>router[method](base+path,method==="get"?read:write,async(req,res,next)=>{try{res.status(status).json({success:true,data:await fn(req,{accountId:req.auth.account.id,sessionId:req.auth.sessionId})});}catch(e){next(e.status?e:fail(503,"Training operations are temporarily unavailable. Keep your work and retry."));}});
 route("get","",(r,a)=>tvet.setup(a,r.params.organizationId,r.query));
 for(const kind of ["programs","intakes","sections","modules"])route("post","/"+kind,(r,a)=>tvet.configure(a,r.params.organizationId,kind,r.body),201);
 for(const [method,path,fn,status] of [
  ["post","/intakes/:id/start","start"],["post","/assignments","assign",201],["put","/assignments/:id/instructor","reassign"],["get","/assignments/:id","training"],["get","/admissions","admissions"],["get","/enrolments","enrolments"],["post","/enrolments","enrol",201],["get","/enrolments/:id/report","staffReport"],["post","/enrolments/:id/complete","complete"],["post","/enrolments/:id/certificate","issueCertificate",201],["put","/certificates/:id/revoke","revokeCertificate"],["post","/schedules","schedule",201],["delete","/schedules/:id","removeSchedule"],["post","/attendance","createAttendance",201],["put","/attendance/:id","attendance"],["post","/assessments","createAssessment",201],["post","/supporters","linkSupporter",201]
 ])route(method,path,(r,a)=>tvet[fn](a,r.params.organizationId,...(r.params.id?[r.params.id]:[]),method==="get"?r.query:r.body),status||200);
 for(const kind of ["enrolments","learners"])route("put","/"+kind+"/:id/status",(r,a)=>tvet.status(a,r.params.organizationId,kind,r.params.id,r.body));
 route("put","/assessments/:id/results/:enrolmentId",(r,a)=>tvet.result(a,r.params.organizationId,r.params.id,r.params.enrolmentId,r.body));
 route("put","/supporters/:id",(r,a)=>tvet.supporterDecision(a,r.params.id,r.body,r.params.organizationId));
 for(const [method,path,fn] of [["get","/my-campus/tvet/enrolments/:id",(a,r)=>tvet.learnerReport(a,r.params.id)],["get","/my-campus/tvet/supporters/enrolments/:id",(a,r)=>tvet.learnerReport(a,r.params.id,true)],["put","/my-campus/tvet/supporters/:id",(a,r)=>tvet.supporterDecision(a,r.params.id,r.body)]])router[method](path,method==="get"?read:write,async(r,res,next)=>{try{res.json({success:true,data:await fn({accountId:r.auth.account.id,sessionId:r.auth.sessionId},r)});}catch(e){next(e.status?e:fail(503,"Training operations are temporarily unavailable. Keep your work and retry."));}});
 return router;
}
