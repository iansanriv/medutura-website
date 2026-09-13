import { requireChatGPTUser, chatGPTSignOutPath } from "@/app/chatgpt-auth";
import AdminDashboard from "@/components/admin-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireChatGPTUser("/admin");
  return <AdminDashboard displayName={user.displayName} signOutPath={chatGPTSignOutPath("/")} />;
}

