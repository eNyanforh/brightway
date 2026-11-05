import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createFollowingService } from "../src/modules/network/network-follow.service.js";
import { createNetworkService } from "../src/modules/network/network.service.js";
import { followRef } from "../src/modules/network/network-follow.schema.js";
const skip = !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database";
async function fixture() {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 }, log: [{ emit: "event", level: "query" }] });
  const accounts = [], organizations = [], requests = [], queries = []; db.$on("query", e => queries.push(e.query)); const now = () => new Date(), service = createFollowingService({ prisma: db, now }), network = createNetworkService({ prisma: db, now });
  async function account() { const row = await db.account.create({ data: { username: `fl_${randomUUID().slice(0,8)}`, email: `${randomUUID()}@example.invalid`, passwordHash: "synthetic-unusable", person: { create: { firstName: "Synthetic", lastName: "Follower", phoneNumber: "+231770000000" } } } }); accounts.push(row); const s = await db.session.create({ data: { accountId: row.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000) } }); return { ...row, actor: { accountId: row.id, sessionId: s.id } }; }
  const a = await account(), b = await account(), c = await account();
  async function organization(status = "APPROVED") { const r = await db.organizationRequest.create({ data: { applicantId: a.id, idempotencyKey: randomUUID(), inputHash: "a".repeat(64), fingerprint: randomUUID().replaceAll("-", "").padEnd(64,"0"), name: "Synthetic School", type: "SCHOOL", offersTraining: true, representativeRole: "Director", countryCode: "LR", region: "Montserrado", city: "Monrovia", address: "Synthetic address", status, targetAt: now() } }); requests.push(r.id); const row = await db.organization.create({ data: { requestId: r.id, username: `school_${randomUUID().slice(0,8)}`, name: r.name, type: "SCHOOL", offersTraining: true, verifiedAt: now() } }); organizations.push(row.id); return row; }
  const act = (who, target, action = "FOLLOW", version = 0, requestKey = randomUUID(), kind = "PERSON") => service.action(who.actor, kind, target.username, { action, expectedVersion: version, requestKey, targetRef: followRef(kind, target.id) });
  return { db, a, b, c, account, organization, act, service, network, queries,
    async close() { try { const ids = accounts.map(a => a.id); await db.networkFollowEvent.deleteMany({ where: { actorId: { in: ids } } }); await db.networkFollow.deleteMany({ where: { followerId: { in: ids } } }); await db.networkEvent.deleteMany({ where: { actorId: { in: ids } } }); await db.networkPair.deleteMany({ where: { OR: [{ leftAccountId: { in: ids } }, { rightAccountId: { in: ids } }] } }); await db.organization.deleteMany({ where: { id: { in: organizations } } }); await db.organizationRequest.deleteMany({ where: { id: { in: requests } } }); for (const row of accounts) { await db.profile.deleteMany({ where: { personId: row.personId } }); await db.session.deleteMany({ where: { accountId: row.id } }); await db.mfaFactor.deleteMany({ where: { accountId: row.id } }); await db.account.delete({ where: { id: row.id } }); await db.person.delete({ where: { id: row.personId } }); } } finally { await db.$disconnect(); } },
  };
}
const command = (target, kind, action, version, key = randomUUID()) => ({ action, expectedVersion: version, requestKey: key, targetRef: followRef(kind, target.id) });
test("database follows are unilateral, idempotent and independent from connection consent and contact privacy", { skip }, async () => {
  const f = await fixture(); try {
    const { a, b, c, service, db, network } = f, key = randomUUID();
    const result = await Promise.all([f.act(a,b,"FOLLOW",0,key),f.act(a,b,"FOLLOW",0,key)]); assert.deepEqual(result[0],result[1]); assert.equal(await db.networkFollowEvent.count({ where: { actorId:a.id } }),1);
    assert.equal((await service.list(a.actor,{view:"following"})).items[0].person.username,b.username); assert.equal((await service.list(b.actor,{view:"followers"})).items[0].person.username,a.username); assert.equal((await service.list(c.actor,{view:"followers"})).items.length,0);
    assert.equal((await network.person(a.actor,b.username)).relationship.state,"NONE"); assert.equal((await network.person(a.actor,b.username)).follow.active,true);
    await db.profile.create({data:{personId:b.personId,phoneVisibility:"CONNECTIONS"}}); assert.deepEqual(await network.visibleContact(b.username,a.personId),{});
    await network.action(a.actor,b.username,{action:"REQUEST",expectedVersion:0,requestKey:randomUUID()}); await network.action(b.actor,a.username,{action:"ACCEPT",expectedVersion:1,requestKey:randomUUID()});
    assert.equal((await network.visibleContact(b.username,a.personId)).phoneNumber,"+231770000000"); await f.act(a,b,"UNFOLLOW",1);
    assert.equal((await network.person(a.actor,b.username)).relationship.state,"CONNECTED"); assert.equal((await network.visibleContact(b.username,a.personId)).phoneNumber,"+231770000000");
    await assert.rejects(f.act(a,b,"FOLLOW",0),{status:409}); await assert.rejects(f.act(a,b,"UNFOLLOW",0,key),{status:409}); await assert.rejects(f.act(a,a),{status:400}); await assert.rejects(f.act(c,b,"UNFOLLOW",0),{status:409});
    await f.act(a,b,"FOLLOW",2); await network.action(a.actor,b.username,{action:"REMOVE",expectedVersion:2,requestKey:randomUUID()}); assert.equal((await service.target(a.actor,"PERSON",b.username)).follow.active,true);
    const json=JSON.stringify(await service.list(b.actor,{view:"followers"})); for(const secret of [a.email,a.passwordHash,a.id,a.personId,"phoneNumber"])assert(!json.includes(secret));
    f.queries.length=0; await service.list(a.actor,{view:"following"}); assert.equal(f.queries.length,3); assert(!f.queries.some(q=>/FOR UPDATE|^BEGIN|^COMMIT/i.test(q))); // Two session checks plus one bounded list query.
  } finally { await f.close(); }
});
test("database blocking atomically removes bilateral follows, defeats stale/racing refollows, and audit failure rolls everything back", { skip }, async () => {
  const f=await fixture();try{const{a,b,db,service,network}=f,key=randomUUID();await f.act(a,b,"FOLLOW",0,key);await f.act(b,a);
    const broken=createNetworkService({prisma:new Proxy(db,{get(target,prop){if(prop==="$transaction")return work=>target.$transaction(tx=>work(new Proxy(tx,{get(t,p){if(p==="networkEvent")return{...t.networkEvent,create:async()=>{throw Error("Injected block audit failure");}};return t[p];}})));return Reflect.get(target,prop);}})});
    await assert.rejects(broken.action(a.actor,b.username,{action:"BLOCK",expectedVersion:0,requestKey:randomUUID()}));assert.equal(await db.networkFollow.count({where:{active:true,followerId:{in:[a.id,b.id]}}}),2);
    await network.action(a.actor,b.username,{action:"BLOCK",expectedVersion:0,requestKey:randomUUID()});assert.equal(await db.networkFollow.count({where:{active:true,followerId:{in:[a.id,b.id]}}}),0);
    await f.act(a,b,"FOLLOW",0,key);assert.equal(await db.networkFollow.count({where:{active:true,followerId:a.id}}),0);await assert.rejects(f.act(b,a,"FOLLOW",2),{status:404});
    await network.action(a.actor,b.username,{action:"UNBLOCK",expectedVersion:1,requestKey:randomUUID()});assert.equal((await service.list(a.actor,{view:"following"})).items.length,0);await assert.rejects(f.act(a,b,"FOLLOW",1),{status:409});
    await Promise.allSettled([f.act(a,b,"FOLLOW",2),network.action(b.actor,a.username,{action:"BLOCK",expectedVersion:2,requestKey:randomUUID()})]);assert.equal(await db.networkFollow.count({where:{active:true,followerId:{in:[a.id,b.id]}}}),0);assert.equal((await service.list(b.actor,{view:"followers"})).items.length,0);
  }finally{await f.close();}
});
test("database organization follows require approved active targets, grant no authority and bind renamed/reused usernames", { skip }, async()=>{
  const f=await fixture();try{const{a,b,db,service}=f,o=await f.organization(),pending=await f.organization("SUBMITTED");await f.act(a,o,"FOLLOW",0,randomUUID(),"ORGANIZATION");assert.equal(await db.organizationMembership.count({where:{organizationId:o.id}}),0);
    await assert.rejects(f.act(b,pending,"FOLLOW",0,randomUUID(),"ORGANIZATION"),{status:404});assert.equal((await service.target(a.actor,"ORGANIZATION",o.username)).publicUrl,`/organizations/${o.id}`);
    await db.organization.update({where:{id:o.id},data:{status:"SUSPENDED"}});await assert.rejects(f.act(b,o,"FOLLOW",0,randomUUID(),"ORGANIZATION"),{status:404});const old=await service.target(a.actor,"ORGANIZATION",o.username);assert.equal(old.available,false);assert.equal(old.person.fullName,"Unavailable organization");assert(!old.publicUrl);await f.act(a,o,"UNFOLLOW",1,randomUUID(),"ORGANIZATION");
    await db.organization.update({where:{id:o.id},data:{status:"ACTIVE"}});const other=await f.organization();await db.organization.update({where:{id:o.id},data:{username:`new_${randomUUID().slice(0,8)}`}});await db.organization.update({where:{id:other.id},data:{username:o.username}});
    await assert.rejects(service.action(a.actor,"ORGANIZATION",o.username,command(o,"ORGANIZATION","FOLLOW",2)),{status:409});assert.equal(await db.networkFollow.count({where:{targetOrganizationId:other.id}}),0);
    await f.act(a,b);await db.account.update({where:{id:b.id},data:{status:"SUSPENDED"}});assert.equal((await service.target(a.actor,"PERSON",b.username)).available,false);assert.equal((await service.target(a.actor,"PERSON",b.username)).person.fullName,"Unavailable account");await f.act(a,b,"UNFOLLOW",1);
  }finally{await f.close();}
});
test("database follow audits roll back writes and current session, MFA-version and realm checks cannot be bypassed",{skip},async()=>{
  const f=await fixture();try{const{a,b,c,db,service}=f;const broken=createFollowingService({prisma:new Proxy(db,{get(target,prop){if(prop==="$transaction")return work=>target.$transaction(tx=>work(new Proxy(tx,{get(t,p){if(p==="networkFollowEvent")return{...t.networkFollowEvent,create:async()=>{throw Error("Injected follow audit failure");}};return t[p];}})));return Reflect.get(target,prop);}})});
    await assert.rejects(broken.action(a.actor,"PERSON",b.username,command(b,"PERSON","FOLLOW",0)));assert.equal(await db.networkFollow.count({where:{followerId:a.id}}),0);
    await assert.rejects(service.target({staffId:"mg_fixture",sessionId:a.actor.sessionId},"PERSON",b.username),{status:401});await assert.rejects(service.action(a.actor,"PERSON",b.username,{...command(b,"PERSON","FOLLOW",0),followerId:c.id}),{status:400});
    await db.session.delete({where:{id:a.actor.sessionId}});await assert.rejects(f.act(a,b),{status:401});await db.mfaFactor.create({data:{accountId:b.id,encryptedSecret:"synthetic",enabled:true,version:2,windowStart:new Date()}});await assert.rejects(service.list(b.actor,{view:"following"}),{status:401});await db.account.update({where:{id:c.id},data:{status:"SUSPENDED"}});await assert.rejects(service.target(c.actor,"PERSON",b.username),{status:401});
  }finally{await f.close();}
});
test("database following pages are private and typed, and concurrent last-slot follows obey persistent per-actor budgets",{skip},async()=>{
  const f=await fixture();try{const{a,b,c,db,service}=f;for(let i=0;i<21;i++)await f.act(a,await f.account());const o=await f.organization();await f.act(a,o,"FOLLOW",0,randomUUID(),"ORGANIZATION");
    const first=await service.list(a.actor,{view:"following"});assert.equal(first.items.length,20);const next=await service.list(a.actor,{view:"following",cursor:first.nextCursor});assert.equal(next.items.length,2);assert(!next.items.some(x=>first.items.some(y=>x.person.username===y.person.username)));
    assert([...first.items,...next.items].some(x=>x.kind==="ORGANIZATION"));await assert.rejects(service.list(b.actor,{view:"following",cursor:first.nextCursor}),{status:400});await assert.rejects(service.list(a.actor,{view:"followers",cursor:first.nextCursor}),{status:400});await assert.rejects(service.list(a.actor,{view:"following",owner:b.id}),{status:400});
    const row=await db.networkFollow.findFirst({where:{followerId:a.id}});await db.networkFollowEvent.createMany({data:Array.from({length:77},()=>({id:randomUUID(),followId:row.id,actorId:a.id,action:"FOLLOW",requestKey:randomUUID(),requestHash:"a".repeat(64),resultVersion:1}))});
    const race=await Promise.allSettled([f.act(a,b),f.act(a,c)]);assert.equal(race.filter(r=>r.status==="fulfilled").length,1);assert.equal(race.find(r=>r.status==="rejected").reason.status,429);await f.act(b,c);assert.equal((await service.list(b.actor,{view:"following"})).items.length,1);
  }finally{await f.close();}
});
