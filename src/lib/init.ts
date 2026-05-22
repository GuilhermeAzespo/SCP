import { db } from "./db";
import { hashPassword } from "./auth-utils";

export async function initDatabase() {
  try {
    const userCount = await db.user.count();
    if (userCount === 0) {
      const defaultUsername = process.env.ADMIN_USERNAME || "admin";
      const defaultPassword = process.env.ADMIN_PASSWORD || "admin";
      
      console.log(`[Database Init] Seeding default admin user: ${defaultUsername}`);
      
      const passwordHash = await hashPassword(defaultPassword);
      await db.user.create({
        data: {
          username: defaultUsername,
          passwordHash,
        },
      });
      
      console.log("[Database Init] Default admin user created successfully.");
    }
  } catch (error) {
    console.error("[Database Init] Error seeding database:", error);
  }
}
