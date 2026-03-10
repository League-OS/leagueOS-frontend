import { TournamentVenueDisplayPage } from '../../../../components/tournaments/TournamentVenueDisplayPage';

export default async function TournamentVenueDisplayRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TournamentVenueDisplayPage tournamentId={Number(id)} />;
}
