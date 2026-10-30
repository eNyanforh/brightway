// Legacy direct database grants must not bypass authenticated Super Admin provisioning.
console.error('This unauthenticated grant command has been retired. Use node backend/scripts/superadmin.js staff <username> identity-reviewer grant|revoke --by <superadmin_username> --reason "Operational reason".');
process.exitCode = 1;
