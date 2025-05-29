import { AppLogo } from '@/components/AppLogo';
import { DashboardClient } from '@/components/DashboardClient';
import { getInitialDashboardData } from '@/app/actions';
import { initializeDataFiles } from '@/lib/config-storage';
import { Separator } from '@/components/ui/separator';

export const dynamic = 'force-dynamic'; // Ensure data is fetched on every request

export default async function HomePage() {
  // Ensure data files are created if they don't exist
  // This is a one-time check, ideally done at app startup
  // For serverless, it might run per invocation if cold start
  await initializeDataFiles();
  
  const { feeds, wordpressConfig, processingLog } = await getInitialDashboardData();

  return (
    <div className="flex flex-col flex-grow">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 md:px-8 py-4 flex justify-between items-center">
          <AppLogo />
          {/* Future: User profile / settings icon */}
        </div>
      </header>
      <main className="flex-grow bg-background">
        <DashboardClient
          initialFeeds={feeds}
          initialWordPressConfig={wordpressConfig}
          initialProcessingLog={processingLog}
        />
      </main>
      <footer className="bg-card border-t py-4 text-center text-muted-foreground text-sm">
        <div className="container mx-auto px-4 md:px-8">
          <p>&copy; {new Date().getFullYear()} RSSage. Your AI-Powered RSS Aggregator.</p>
        </div>
      </footer>
    </div>
  );
}
