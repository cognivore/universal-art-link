import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

type StrapiCardProps = {
  readonly strapiUrl: string;
};

export const StrapiCard = ({ strapiUrl }: StrapiCardProps) => {
  const normalizedUrl = strapiUrl.replace(/\/$/, '');
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardDescription className="uppercase tracking-[0.3em] text-xs">CMS</CardDescription>
        <CardTitle>Strapi workspace</CardTitle>
        <CardDescription>
          Each tenant gets a Strapi entry with Google SSO. Invite teammates by granting them the <code>editor</code> role.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          Default instance:{' '}
          <a href={normalizedUrl} target="_blank" rel="noreferrer" className="text-foreground underline">
            {normalizedUrl}
          </a>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.open(`${normalizedUrl}/admin`, '_blank')}>
            Open /admin
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              navigator.clipboard
                .writeText(`npx strapi console --url ${normalizedUrl}`)
                .catch(() => undefined);
            }}
          >
            Copy CLI
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

