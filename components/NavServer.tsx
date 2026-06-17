import { auth } from "@/auth";
import { Nav } from "@/components/Nav";

/**
 * Server wrapper that reads the session and hands the logged-in/out state to the
 * client Nav. `auth()` is cached per request. The Nav state updates on full
 * navigations / the post-auth redirect — the authoritative gate is the DAL.
 */
export async function NavServer() {
  const session = await auth();
  return <Nav authed={Boolean(session?.user)} />;
}
