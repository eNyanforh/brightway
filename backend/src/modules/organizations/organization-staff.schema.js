import { z } from "zod";
export const PERMISSIONS = Object.freeze({
  "organization.members.manage": "Manage staff",
  "organization.posts.publish": "Publish posts",
  "organization.opportunities.manage": "Manage opportunities",
  "organization.programs.manage": "Manage programs",
  "organization.admissions.review": "Review admission applications",
  "organization.credentials.education.review": "Review education credentials",
  "organization.credentials.experience.review": "Review experience credentials",
});
export const permissionKeys = Object.keys(PERMISSIONS);
const permissions = z.array(z.enum(permissionKeys)).max(permissionKeys.length).refine(v => new Set(v).size === v.length).transform(v => [...v].sort());
const version = z.number().int().min(1).max(2147483646);
export const inviteSchema = z.strictObject({ expectedStaffVersion: version, idempotencyKey: z.uuid(), username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/), permissions });
export const changeMemberSchema = z.strictObject({ expectedStaffVersion: version, expectedVersion: version, permissions, enabled: z.boolean() });
export const cancelInviteSchema = z.strictObject({ expectedStaffVersion: version, expectedVersion: version });
export const respondInviteSchema = z.strictObject({ expectedVersion: version, decision: z.enum(["ACCEPT", "DECLINE"]) });

export const listStaffSchema = z.strictObject({ memberCursor: z.uuid().optional(), inviteCursor: z.uuid().optional() });

export const organizationPermissionKeys = organization => permissionKeys.filter(p => organization.offersTraining || !["organization.programs.manage", "organization.admissions.review", "organization.credentials.education.review"].includes(p));
