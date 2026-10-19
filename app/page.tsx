import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import LoginPage from "./login/page";

export default async function Home() {
  const user = await getUser();
  if (user) redirect(user.role === "teacher" ? "/teacher" : "/today");
  return <LoginPage params={Promise.resolve({})} searchParams={Promise.resolve({})} />;
}
