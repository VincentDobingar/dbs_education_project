import type { StudentStatus, StudentUserLink } from "@prisma/client";

import { rawPrisma, withTenantSession } from "../../lib/prisma.js";

export interface LinkedStudent {
  link: StudentUserLink;
  student: {
    id: string;
    tenantId: string;
    matricule: string;
    firstName: string;
    lastName: string;
    status: StudentStatus;
  };
}

/**
 * Symétrique à listVerifiedChildrenForParent (§8, §9) : un même User peut avoir
 * plusieurs StudentUserLink au fil des transferts d'établissement (§10). Student
 * garde sa RLS, donc chaque lecture passe par withTenantSession(link.tenantId, …),
 * pas par une dérogation RLS supplémentaire.
 */
export async function listLinkedStudentsForUser(userId: string): Promise<LinkedStudent[]> {
  const links = await rawPrisma.studentUserLink.findMany({
    where: { userId },
    orderBy: { linkedAt: "desc" },
  });

  const students = await Promise.all(
    links.map(async (link) => {
      const student = await withTenantSession(link.tenantId, (tx) =>
        tx.student.findUnique({
          where: { id: link.studentId },
          select: {
            id: true,
            tenantId: true,
            matricule: true,
            firstName: true,
            lastName: true,
            status: true,
          },
        }),
      );
      return student ? { link, student } : null;
    }),
  );

  return students.filter((entry): entry is LinkedStudent => entry !== null);
}
