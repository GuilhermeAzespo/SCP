const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const files = await prisma.file.findMany();
  console.log(files);
}
main().finally(() => prisma.$disconnect());
