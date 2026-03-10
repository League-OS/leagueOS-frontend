import { TournamentMobileOperatorPage } from '../../../../components/tournaments/TournamentMobileOperatorPage';

export default async function TournamentMobileOperatorRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TournamentMobileOperatorPage tournamentId={Number(id)} />;
}
