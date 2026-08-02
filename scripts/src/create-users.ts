import { readFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: [path.resolve(import.meta.dirname, "../../api/.env"), path.resolve(import.meta.dirname, "../.env")] });

const TEACHER = { email: "teacher@stemri.local", password: "Stemri@2026", name: "Mrs. Kavya (Teacher)", role: "teacher" as const, classSection: null };
const STUDENTS = [
  { name: "Student 1 (Ananya)", email: "s1@stemri.local" },
  { name: "Student 2 (Rahul)", email: "s2@stemri.local" },
  { name: "Student 3 (Meera)", email: "s3@stemri.local" },
  { name: "Student 4 (Arjun)", email: "s4@stemri.local" },
  { name: "Student 5 (Divya)", email: "s5@stemri.local" },
];
const STUDENT_PASSWORD = "Stemri@2026";
const CLASS_SECTION = "10A";

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_KEY missing (api/.env)");
    process.exit(1);
  }
  const admin = createClient(url, serviceKey);

  async function ensureUser(email: string, password: string, name: string, role: "student" | "teacher", classSection: string | null) {
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = existing?.users.find((u) => u.email === email);
    if (found) {
      console.log(`exists:   ${email} (${role})`);
      return;
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, role, class_section: classSection },
    });
    if (error) throw error;
    const { error: profileError } = await admin
      .from("profiles")
      .insert({ id: data.user!.id, full_name: name, role, class_section: classSection });
    if (profileError) throw profileError;
    console.log(`created:  ${email} (${role})`);
  }

  await ensureUser(TEACHER.email, TEACHER.password, TEACHER.name, TEACHER.role, TEACHER.classSection);
  for (const s of STUDENTS) {
    await ensureUser(s.email, STUDENT_PASSWORD, s.name, "student", CLASS_SECTION);
  }

  console.log("\nDemo logins:");
  console.log(`  teacher : ${TEACHER.email} / ${TEACHER.password}`);
  for (const s of STUDENTS) console.log(`  student : ${s.email} / ${STUDENT_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
