import { redirect } from "next/navigation";
import { getUser, homeFor } from "@/lib/auth";
import LoginPage from "./login/page";

export default async function Home() {
  const user = await getUser();
  if (user) redirect(homeFor(user.role));
  return <LoginPage params={Promise.resolve({})} searchParams={Promise.resolve({})} />;
}
