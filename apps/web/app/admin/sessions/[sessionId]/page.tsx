import { AdminWorkspace } from '../../../../components/admin/AdminWorkspace';

export default async function AdminSessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const resolved = await params;
  const sessionId = Number(resolved.sessionId);
  return <AdminWorkspace page="sessionDetail" sessionId={Number.isNaN(sessionId) ? undefined : sessionId} />;
}
