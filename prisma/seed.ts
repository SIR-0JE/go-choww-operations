import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Database initialized in clean production state. Ready for CSV uploads!');
}

main()
  .catch((e) => {
    console.error('Error during init:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
