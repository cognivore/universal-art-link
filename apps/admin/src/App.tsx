import { useState } from 'react';
import { AdminShell } from './components/admin/AdminShell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { ContentStudio } from './features/cms/ContentStudio';
import { CommerceSuite } from './features/commerce/CommerceSuite';

type AdminView = 'content' | 'commerce';

export const App = () => {
  const [view, setView] = useState<AdminView>('content');

  return (
    <AdminShell>
      <Tabs value={view} onValueChange={(value) => setView(value as AdminView)} className="flex-1">
        <TabsList className="mb-6 w-full justify-start rounded-2xl bg-white/80 p-1 shadow-sm">
          <TabsTrigger value="content" className="flex-1">
            Content Studio
          </TabsTrigger>
          <TabsTrigger value="commerce" className="flex-1">
            Commerce Suite
          </TabsTrigger>
        </TabsList>
        <TabsContent value="content">
          <ContentStudio />
        </TabsContent>
        <TabsContent value="commerce">
          <CommerceSuite />
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
};

