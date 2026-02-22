import { AdminWorkspace } from '../../../../components/admin/AdminWorkspaceClient';

export default async function AdminSeasonDetailPage({ params }: { params: Promise<{ seasonId: string }> }) {
  const resolved = await params;
  const seasonId = Number(resolved.seasonId);
  return <AdminWorkspace page="seasonDetail" seasonId={Number.isNaN(seasonId) ? undefined : seasonId} />;
}
