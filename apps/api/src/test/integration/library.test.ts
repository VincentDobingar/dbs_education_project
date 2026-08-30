import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import {
  addMembership,
  createStudent,
  createTenant,
  createUser,
  grantRole,
  uniqueSuffix,
} from "../fixtures.js";

describe("bibliothèque (§29)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.libraryLoan.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.book.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function setUpTenant(): Promise<{
    subdomain: string;
    adminToken: string;
    adminEmployeeId: string;
    teacherToken: string;
    studentId: string;
  }> {
    const { tenant, subdomain } = await createTenant("LibraryTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("lib-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const adminEmployee = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Fatou",
        lastName: "Diallo",
        jobTitle: "Directrice",
        userId: admin.id,
      });

    const teacher = await createUser("lib-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    const student = await createStudent(tenant.id, "LIB");

    return {
      subdomain,
      adminToken,
      adminEmployeeId: (adminEmployee.body as { id: string }).id,
      teacherToken: signAccessToken({ sub: teacher.id }),
      studentId: student.id,
    };
  }

  it("lets a librarian manage the catalogue while a teacher without permission is refused", async () => {
    const { subdomain, adminToken, teacherToken } = await setUpTenant();

    const denied = await request(app)
      .post("/api/v1/library/books")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Le Petit Prince", author: "Antoine de Saint-Exupéry", totalCopies: 1 });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post("/api/v1/library/books")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        title: "Le Petit Prince",
        author: "Antoine de Saint-Exupéry",
        category: "Fiction",
        totalCopies: 1,
      });
    expect(created.status).toBe(201);
    const bookId = (created.body as { id: string }).id;

    const deniedRead = await request(app)
      .get("/api/v1/library/books")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(deniedRead.status).toBe(403);

    const listed = await request(app)
      .get("/api/v1/library/books?search=Petit%20Prince")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as { id: string }[]).some((b) => b.id === bookId)).toBe(true);

    const fetched = await request(app)
      .get(`/api/v1/library/books/${bookId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(fetched.status).toBe(200);
    expect((fetched.body as { title: string }).title).toBe("Le Petit Prince");

    const updated = await request(app)
      .patch(`/api/v1/library/books/${bookId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ category: "Littérature jeunesse" });
    expect(updated.status).toBe(200);
    expect((updated.body as { category: string }).category).toBe("Littérature jeunesse");
  });

  it("enforces copy availability and one active loan per student, then supports return and loss", async () => {
    const { subdomain, adminToken, teacherToken, studentId } = await setUpTenant();

    const book = await request(app)
      .post("/api/v1/library/books")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Une saison au Congo", author: "Aimé Césaire", totalCopies: 2 });
    const bookId = (book.body as { id: string }).id;

    const tenantId = (await testAdminPrisma.tenantDomain.findFirstOrThrow({ where: { subdomain } })).tenantId;
    const secondStudent = await createStudent(tenantId, "LIB2");
    const thirdStudent = await createStudent(tenantId, "LIB3");

    const denied = await request(app)
      .post(`/api/v1/library/books/${bookId}/loans`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, dueAt: "2026-09-15" });
    expect(denied.status).toBe(403);

    const loan = await request(app)
      .post(`/api/v1/library/books/${bookId}/loans`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, dueAt: "2026-09-15" });
    expect(loan.status).toBe(201);
    const loanId = (loan.body as { id: string }).id;

    const duplicateLoan = await request(app)
      .post(`/api/v1/library/books/${bookId}/loans`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, dueAt: "2026-09-15" });
    expect(duplicateLoan.status).toBe(409);
    expect((duplicateLoan.body as { code: string }).code).toBe("LOAN_ALREADY_ACTIVE");

    const secondLoan = await request(app)
      .post(`/api/v1/library/books/${bookId}/loans`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: secondStudent.id, dueAt: "2026-09-15" });
    expect(secondLoan.status).toBe(201);

    const noCopiesLeft = await request(app)
      .post(`/api/v1/library/books/${bookId}/loans`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: thirdStudent.id, dueAt: "2026-09-15" });
    expect(noCopiesLeft.status).toBe(409);
    expect((noCopiesLeft.body as { code: string }).code).toBe("NO_COPIES_AVAILABLE");

    const listedByStudent = await request(app)
      .get(`/api/v1/library/loans?studentId=${studentId}&status=ACTIVE`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listedByStudent.status).toBe(200);
    expect((listedByStudent.body as { id: string }[]).length).toBe(1);

    const returned = await request(app)
      .post(`/api/v1/library/loans/${loanId}/return`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(returned.status).toBe(200);
    expect((returned.body as { status: string }).status).toBe("RETURNED");

    const returnAgain = await request(app)
      .post(`/api/v1/library/loans/${loanId}/return`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(returnAgain.status).toBe(409);
    expect((returnAgain.body as { code: string }).code).toBe("LOAN_NOT_ACTIVE");

    const rebooked = await request(app)
      .post(`/api/v1/library/books/${bookId}/loans`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: thirdStudent.id, dueAt: "2026-09-20" });
    expect(rebooked.status).toBe(201);
    const rebookedLoanId = (rebooked.body as { id: string }).id;

    const lost = await request(app)
      .post(`/api/v1/library/loans/${rebookedLoanId}/lost`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(lost.status).toBe(200);
    expect((lost.body as { status: string }).status).toBe("LOST");
  });

  it("hides an archived book from the catalogue and blocks new loans against it", async () => {
    const { subdomain, adminToken, studentId } = await setUpTenant();

    const book = await request(app)
      .post("/api/v1/library/books")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Une vie de boy", author: "Ferdinand Oyono", totalCopies: 2 });
    const bookId = (book.body as { id: string }).id;

    const archived = await request(app)
      .delete(`/api/v1/library/books/${bookId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(archived.status).toBe(200);
    expect((archived.body as { status: string }).status).toBe("ARCHIVED");

    const listed = await request(app)
      .get("/api/v1/library/books")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((listed.body as { id: string }[]).some((b) => b.id === bookId)).toBe(false);

    // archiveBook soft-deletes the record (deletedAt), so requireBook's 404 check fires
    // before createLoan ever reaches its BOOK_ARCHIVED check on `status`.
    const blockedLoan = await request(app)
      .post(`/api/v1/library/books/${bookId}/loans`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, dueAt: "2026-09-15" });
    expect(blockedLoan.status).toBe(404);
    expect((blockedLoan.body as { code: string }).code).toBe("BOOK_NOT_FOUND");
  });

  // resolveActingEmployeeId (lib/acting-employee.ts) already excluded a terminated
  // employee, but createLoan never checked its result was non-null — the loan went
  // through regardless, just with issuedByEmployeeId silently left unset. Same bug
  // family as the already-fixed cash-payment/cash-session checks, reopened here.
  it("refuses to issue a loan once the issuing staff member has been terminated", async () => {
    const { subdomain, adminToken, adminEmployeeId, studentId } = await setUpTenant();

    const book = await request(app)
      .post("/api/v1/library/books")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Cahier d'un retour au pays natal", author: "Aimé Césaire", totalCopies: 1 });
    const bookId = (book.body as { id: string }).id;

    const patched = await request(app)
      .patch(`/api/v1/employees/${adminEmployeeId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ status: "TERMINATED" });
    expect(patched.status).toBe(200);

    const blockedLoan = await request(app)
      .post(`/api/v1/library/books/${bookId}/loans`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, dueAt: "2026-09-15" });
    expect(blockedLoan.status).toBe(403);
    expect((blockedLoan.body as { code: string }).code).toBe("EMPLOYEE_RECORD_REQUIRED");
  });
});
