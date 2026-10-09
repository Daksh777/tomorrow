import { redirect } from "next/navigation";

/** Old link: setup lives on the home page now. */
export default function Page() {
  redirect("/");
}
