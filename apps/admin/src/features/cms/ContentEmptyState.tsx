import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';

type ContentEmptyStateProps = {
  readonly onRetry: () => void;
};

export const ContentEmptyState = ({ onRetry }: ContentEmptyStateProps) => (
  <Card className="border-dashed">
    <CardHeader>
      <CardTitle>Nothing to edit yet</CardTitle>
      <CardDescription>Provide a schema and content payload to unlock the editor.</CardDescription>
    </CardHeader>
    <CardContent>
      <Button onClick={onRetry}>Reload content</Button>
    </CardContent>
  </Card>
);

