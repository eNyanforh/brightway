import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createManagementOperations } from "../src/modules/management/management-operations.service.js";
import { createManagementCases } from "../src/modules/management/management-cases.service.js";
import { createSessionService } from "../src/modules/auth/session.service.js";
import { managementStaffFixture,managementSessionFixture,cleanupManagementFixtures } from "../test-support/management-database-fixture.js";
const skip = !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database";
async function fixture() {
  const {PrismaClient}=await import("@prisma/client"),{PrismaPg}=await import("@prisma/adapter-pg");
  const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.TEST_DATABASE_URL}),transactionOptions:{maxWait:10000,timeout:15000}}),tag=randomUUID().slice(0,8),staffIds=[],accounts=[],organizations=[],requests=[];
  const now=()=>new Date(),ops=createManagementOperations({prisma:db,now}),cases=createManagementCases({prisma:db,now});
  async function staff(caps=[],root=false) {const row=await managementStaffFixture(db,{username:`ops_${randomUUID().slice(0,8)}`,email:`${randomUUID()}@management.example.invalid`},caps);staffIds.push(row.id);if(root)await db.managementStaff.update({where:{id:row.id},data:{isSuperAdmin:true}});const session=await managementSessionFixture(db,row);return {staffId:row.id,sessionId:session.id};}
  async function account() {const row=await db.account.create({data:{username:`usr_${randomUUID().slice(0,8)}`,email:`${randomUUID()}@example.invalid`,passwordHash:"scrypt$synthetic-unusable",person:{create:{firstName:"Synthetic",lastName:"Operator",phoneNumber:"+231770000001"}}}});accounts.push(row);return row;}
  async function organization(owner) {const investigator=await staff(["organization-agent"]);const request=await db.organizationRequest.create({data:{applicantId:owner.id,idempotencyKey:randomUUID(),inputHash:"0".repeat(64),fingerprint:randomUUID().replaceAll("-","").padEnd(64,"0"),name:`Synthetic ${tag}`,type:"SCHOOL",representativeRole:"Director",countryCode:"LR",region:"Montserrado",city:"Monrovia",address:"Synthetic location",offersTraining:true,status:"APPROVED",assignedAgentId:investigator.staffId,decidedById:root.staffId,decidedAt:new Date(),decisionReason:"Synthetic completed independent investigation.",targetAt:new Date()}});requests.push(request.id);const row=await db.organization.create({data:{requestId:request.id,name:request.name,type:"SCHOOL",offersTraining:true,verifiedAt:new Date(),username:`org_${tag}`}});organizations.push(row.id);await db.organizationMembership.create({data:{organizationId:row.id,accountId:owner.id,role:"PRIMARY_ADMIN",permissions:[]}});return row;}
  async function personal(account) { const session=await db.session.create({data:{accountId:account.id,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+3600000)}});return {accountId:account.id,sessionId:session.id}; }
  const root=await staff([],true);
  return {db,ops,cases,root,staff,account,organization,personal,
    async close() {try {const rows=await db.managementCase.findMany({where:{OR:[{createdByStaffId:{in:staffIds}},{creatorAccountId:{in:accounts.map(a=>a.id)}}]},select:{id:true}});const ids=rows.map(r=>r.id);await db.managementCaseMessage.deleteMany({where:{caseId:{in:ids}}});await db.managementCase.deleteMany({where:{id:{in:ids}}});await db.managementAction.deleteMany({where:{actorId:{in:staffIds}}});await db.organizationMembership.deleteMany({where:{organizationId:{in:organizations}}});await db.organization.deleteMany({where:{id:{in:organizations}}});await db.organizationRequest.deleteMany({where:{id:{in:requests}}});await cleanupManagementFixtures(db,staffIds);for(const a of accounts){await db.mfaLoginChallenge.deleteMany({where:{accountId:a.id}});await db.passwordResetChallenge.deleteMany({where:{accountId:a.id}});await db.account.delete({where:{id:a.id}});await db.person.delete({where:{id:a.personId}});}}finally{await db.$disconnect();}}
  };
}
const action = (expectedVersion,kind="SUSPEND")=>({expectedVersion,action:kind,reason:"Synthetic documented operational reason.",requestKey:randomUUID()});

test("database operations enforce capabilities, project no private contacts or credentials, and recheck current sessions",{skip},async()=>{
 const f=await fixture();try{const a=await f.account(),limited=await f.staff(["support-agent"]);await assert.rejects(f.ops.directory(limited,"users",{}),{status:403});await assert.rejects(f.ops.control(limited,"users",a.id,action(0)),{status:403});
 const list=await f.ops.directory(f.root,"users",{q:a.username});assert.equal(list.items.length,1);const serialized=JSON.stringify(list);for(const value of [a.email,a.passwordHash,"+231770000001","phoneNumber","birthDate"])assert(!serialized.includes(value));
 await f.db.managementStaff.update({where:{id:f.root.staffId},data:{version:{increment:1}}});await assert.rejects(f.ops.directory(f.root,"users",{}),{status:403});}finally{await f.close();}
});

test("database suspension, restoration and concurrent idempotent session revocation preserve records and prevent stale-login races",{skip},async()=>{
 const f=await fixture();try{const a=await f.account();await f.db.session.create({data:{accountId:a.id,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+60000)}});const input=action(0);
 const results=await Promise.all([f.ops.control(f.root,"users",a.id,input),f.ops.control(f.root,"users",a.id,input)]);assert.deepEqual(results[0],results[1]);assert.equal(results[0].sessionsRevoked,1);assert.equal(await f.db.managementAction.count({where:{actorId:f.root.staffId}}),1);assert.equal((await f.db.account.findUnique({where:{id:a.id}})).status,"SUSPENDED");
 await assert.rejects(f.ops.control(f.root,"users",a.id,{...input,reason:"Different retry input must be rejected."}),{status:409});await assert.rejects(f.ops.control(f.root,"users",a.id,action(0,"RESTORE")),{status:409});await f.ops.control(f.root,"users",a.id,action(1,"RESTORE"));
 let started,release;const verifying=new Promise(r=>{started=r;}),wait=new Promise(r=>{release=r;});const sessions=createSessionService({prisma:f.db,verify:async()=>{started();await wait;return true;},mfa:{async challenge(){return null;}}});const login=sessions.login({identifier:a.username,password:"synthetic"});await verifying;await f.ops.control(f.root,"users",a.id,action(2,"SIGN_OUT"));release();await assert.rejects(login,{status:401});assert.equal(await f.db.session.count({where:{accountId:a.id}}),0);
 assert.equal((await f.db.account.findUnique({where:{id:a.id}})).passwordHash,a.passwordHash);
 }finally{await f.close();}
});

test("database audit-write failure rolls an access change and session deletion back; related accounts cannot be acted on",{skip},async()=>{
 const f=await fixture();try{const a=await f.account();await f.db.session.create({data:{accountId:a.id,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+60000)}});
 const failing=new Proxy(f.db,{get(target,key){if(key==="$transaction")return work=>target.$transaction(tx=>work(new Proxy(tx,{get(inner,prop){return prop==="managementAction"?{...inner.managementAction,create:async()=>{throw Error("synthetic audit unavailable");}}:Reflect.get(inner,prop);}})));return Reflect.get(target,key);}});
 await assert.rejects(createManagementOperations({prisma:failing}).control(f.root,"users",a.id,action(0)));assert.equal((await f.db.account.findUnique({where:{id:a.id}})).status,"ACTIVE");assert.equal(await f.db.session.count({where:{accountId:a.id}}),1);
 await f.db.managementConflict.create({data:{staffId:f.root.staffId,accountId:a.id,reason:"Synthetic declared personal ownership."}});await assert.rejects(f.ops.control(f.root,"users",a.id,action(0)),{status:403});
 }finally{await f.close();}
});

test("database organization oversight preserves issuer approval history and memberships and denies conflicted managers",{skip},async()=>{
 const f=await fixture();try{const owner=await f.account(),org=await f.organization(owner);await f.ops.control(f.root,"organizations",org.id,action(0));let current=await f.db.organization.findUnique({where:{id:org.id}});assert.equal(current.status,"SUSPENDED");assert.equal(await f.db.organizationMembership.count({where:{organizationId:org.id,enabled:true}}),1);assert.equal(+current.verifiedAt,+org.verifiedAt);assert.equal((await f.db.organizationRequest.findUnique({where:{id:org.requestId}})).status,"APPROVED");
 await f.ops.control(f.root,"organizations",org.id,action(1,"RESTORE"));await f.db.managementConflict.create({data:{staffId:f.root.staffId,accountId:owner.id,reason:"Related organization applicant."}});await assert.rejects(f.ops.control(f.root,"organizations",org.id,action(2)),{status:403});
 }finally{await f.close();}
});

test("database case workflow isolates internal notes, ownership and scope while assignments, stale actions and retries remain atomic",{skip},async()=>{
 const f=await fixture();try{const owner=await f.account(),other=await f.account(),input={kind:"SUPPORT",subject:"Synthetic login support",body:"Synthetic case details for the owner.",requestKey:randomUUID()};const creator=await f.personal(owner);
 const [a,b]=await Promise.all([f.cases.create(input,creator),f.cases.create(input,creator)]);assert.equal(a.id,b.id);await assert.rejects(f.cases.detail(await f.personal(other),a.id),{status:404});const limited=await f.staff(["moderation-agent"]);await assert.rejects(f.cases.detail(limited,a.id),{status:403});
 await assert.rejects(f.cases.message(f.root,a.id,{expectedVersion:1,body:"Unassigned reply",requestKey:randomUUID()}),{status:403});await f.cases.action(f.root,a.id,{...action(1),action:"ASSIGN_SELF"});
 await f.cases.message(f.root,a.id,{expectedVersion:2,body:"Private internal note secret",internal:true,requestKey:randomUUID()});let own=await f.cases.detail(creator,a.id);assert(!JSON.stringify(own).includes("Private internal"));assert(!JSON.stringify(own).includes(f.root.staffId));assert.equal(own.messages.length,1);
 const reply={expectedVersion:3,body:"Public reply for the owner",internal:false,requestKey:randomUUID()};await f.cases.message(f.root,a.id,reply);await f.cases.message(f.root,a.id,reply);own=await f.cases.detail(creator,a.id);assert.equal(own.messages.length,2);
 const next=action(4);const raced=await Promise.allSettled([f.cases.action(f.root,a.id,{...next,action:"STATUS",status:"WAITING_FOR_USER"}),f.cases.message(creator,a.id,{expectedVersion:4,body:"Owner concurrent response",requestKey:randomUUID()})]);assert.equal(raced.filter(r=>r.status==="fulfilled").length,1);assert.equal(raced.find(r=>r.status==="rejected").reason.status,409);
 await assert.rejects(f.cases.create({...input,body:"Changed retry must not overwrite message"},creator),{status:409});await assert.rejects(f.cases.message(creator,a.id,{expectedVersion:5,body:"Forged internal note",internal:true,requestKey:randomUUID()}),{status:400});
 await f.db.session.delete({where:{id:creator.sessionId}});await assert.rejects(f.cases.detail(creator,a.id),{status:403});
 }finally{await f.close();}
});

test("database reports resolve public usernames, enforce conflicts, and operations/audit preserve historical actor attribution",{skip},async()=>{
 const f=await fixture();try{const owner=await f.account(),target=await f.account();const result=await f.cases.create({kind:"REPORT",subject:"Synthetic account report",body:"Synthetic documented report details",targetType:"ACCOUNT",targetUsername:target.username,requestKey:randomUUID()},await f.personal(owner));assert.equal((await f.cases.detail(f.root,result.id)).targetId,target.id);
 await f.db.managementConflict.create({data:{staffId:f.root.staffId,accountId:target.id,reason:"Related target must not be moderated."}});await assert.rejects(f.cases.action(f.root,result.id,{...action(1),action:"ASSIGN_SELF"}),{status:403});
 await f.db.managementStaffAudit.create({data:{actorId:f.root.staffId,targetStaffId:f.root.staffId,action:"SYNTHETIC_HISTORICAL",reason:"Historical actor remains intact."}});const audit=await f.ops.audit(f.root,{q:"SYNTHETIC_HISTORICAL"});assert.equal(audit.items[0].actorId,f.root.staffId);assert.equal(audit.items[0].targetType,"STAFF");assert(!JSON.stringify(audit).includes("encryptedSecret"));
 const marker=`SYNTHETIC_PAGE_${randomUUID().slice(0,8)}`,instant=new Date(),eventIds=Array.from({length:25},()=>randomUUID());await f.db.managementStaffAudit.createMany({data:eventIds.map(id=>({id,actorId:f.root.staffId,targetStaffId:f.root.staffId,action:marker,reason:"Synthetic cursor continuity test.",createdAt:instant}))});await f.db.managementAction.create({data:{id:eventIds[0],actorId:f.root.staffId,requestKey:randomUUID(),requestHash:"f".repeat(64),action:marker,targetType:"STAFF",targetId:f.root.staffId,reason:"Synthetic cross-source ID collision.",result:{},createdAt:instant}});const first=await f.ops.audit(f.root,{q:marker}),second=await f.ops.audit(f.root,{q:marker,cursor:first.nextCursor});assert.equal(first.items.length,20);assert.equal(second.items.length,6);assert.equal(new Set([...first.items,...second.items].map(r=>`${r.source}:${r.id}`)).size,26);
 const ops=await f.ops.operations(f.root);assert(ops.counts.openCases>=1);assert(Object.values(ops.counts).every(n=>Number.isInteger(n)&&n>=0));const limited=await f.staff([]);await assert.rejects(f.ops.operations(limited),{status:403});await assert.rejects(f.ops.audit(limited,{}),{status:403});
 }finally{await f.close();}
});
