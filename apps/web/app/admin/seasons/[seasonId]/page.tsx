import { AdminWorkspace } from '../../../../components/admin/AdminWorkspace';

export default async function AdminSeasonDetailPage({ params }: { params: Promise<{ seasonId: string }> }) {
  const resolved = await params;
  const seasonId = Number(resolved.seasonId);
  return <AdminWorkspace page="seasonDetail" seasonId={Number.isNaN(seasonId) ? undefined : seasonId} />;
}
