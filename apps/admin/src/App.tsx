import { AdminShell } from './components/admin/AdminShell';
import { ContentStudio } from './features/cms/ContentStudio';

export const App = () => {
  return (
    <AdminShell>
      <ContentStudio />
    </AdminShell>
  );
};

