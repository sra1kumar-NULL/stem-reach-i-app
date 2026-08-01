import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export function makeDb(connectionString: string) {
  return drizzle(new Pool({ connectionString }));
}

export type Db = ReturnType<typeof makeDb>;
