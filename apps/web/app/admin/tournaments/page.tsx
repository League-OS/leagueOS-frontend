import { AdminSidebar, adminMainPanel, adminPageShell } from '../../../components/admin/AdminShellParts';
import { TournamentsWorkspace } from '../../../components/admin/TournamentsWorkspace';

export default function AdminTournamentsPage() {
  return (
    <main style={adminPageShell}>
      <AdminSidebar
        active="tournaments"
        visibleItems={['dashboard', 'clubs', 'users', 'seasons', 'sessions', 'courts', 'tournaments', 'players']}
      />
      <section style={adminMainPanel}>
        <TournamentsWorkspace embedded />
      </section>
    </main>
  );
}
