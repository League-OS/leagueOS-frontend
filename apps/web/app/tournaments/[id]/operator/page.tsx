import { TournamentOperatorPage } from '../../../../components/tournaments/TournamentOperatorPage';

export default async function TournamentOperatorRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TournamentOperatorPage tournamentId={Number(id)} />;
}
