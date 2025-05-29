'use client';

import type { FeedConfig, WordPressConfig, ProcessedArticleLogEntry } from '@/types';
import React, { useState, useTransition, useEffect } from 'react';
import { useFormState } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Rss, WordPress, Settings, Play, Trash2, Save, ListChecks, AlertTriangle, CheckCircle, Info, Send, Brain } from 'lucide-react';
import {
  addFeedAction,
  removeFeedAction,
  saveWordPressConfigAction,
  triggerProcessingAction,
} from '@/app/actions';
import { formatDistanceToNow } from 'date-fns';


interface DashboardClientProps {
  initialFeeds: FeedConfig[];
  initialWordPressConfig: WordPressConfig | null;
  initialProcessingLog: ProcessedArticleLogEntry[];
}

const iconMap = {
  pending: <Info className="h-4 w-4 text-blue-500" />,
  summarized: <Brain className="h-4 w-4 text-purple-500" />,
  unsuitable: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  posted: <Send className="h-4 w-4 text-green-500" />,
  error: <AlertTriangle className="h-4 w-4 text-red-500" />,
};

export function DashboardClient({ initialFeeds, initialWordPressConfig, initialProcessingLog }: DashboardClientProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [feeds, setFeeds] = useState<FeedConfig[]>(initialFeeds);
  const [wordPressConfig, setWordPressConfig] = useState<WordPressConfig | null>(initialWordPressConfig);
  const [processingLog, setProcessingLog] = useState<ProcessedArticleLogEntry[]>(initialProcessingLog);
  
  // Effect to update local state when props change (e.g. after revalidation)
  useEffect(() => {
    setFeeds(initialFeeds);
  }, [initialFeeds]);

  useEffect(() => {
    setWordPressConfig(initialWordPressConfig);
  }, [initialWordPressConfig]);
  
  useEffect(() => {
    setProcessingLog(initialProcessingLog);
  }, [initialProcessingLog]);


  const [addFeedState, addFeedFormAction] = useFormState(addFeedAction, { success: false });
  const [saveWpConfigState, saveWpConfigFormAction] = useFormState(saveWordPressConfigAction, { success: false });

  useEffect(() => {
    if (addFeedState?.message) {
      toast({
        title: addFeedState.success ? 'Success' : 'Error',
        description: addFeedState.message || addFeedState.error,
        variant: addFeedState.success ? 'default' : 'destructive',
      });
      if (addFeedState.success) {
        // Clear form, though revalidatePath should update list
        const form = document.getElementById('addFeedForm') as HTMLFormElement;
        form?.reset();
      }
    }
  }, [addFeedState, toast]);

  useEffect(() => {
    if (saveWpConfigState?.message) {
      toast({
        title: saveWpConfigState.success ? 'Success' : 'Error',
        description: saveWpConfigState.message || saveWpConfigState.error,
        variant: saveWpConfigState.success ? 'default' : 'destructive',
      });
    }
  }, [saveWpConfigState, toast]);

  const handleRemoveFeed = async (feedId: string) => {
    startTransition(async () => {
      const result = await removeFeedAction(feedId);
      toast({
        title: result.success ? 'Success' : 'Error',
        description: result.message || result.error,
        variant: result.success ? 'default' : 'destructive',
      });
    });
  };

  const handleTriggerProcessing = () => {
    startTransition(async () => {
      const result = await triggerProcessingAction();
      toast({
        title: result.success ? 'Processing Started' : 'Error',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
      if (result.newLogEntries) {
        setProcessingLog(prevLogs => [...result.newLogEntries!, ...prevLogs].slice(0,100));
      }
    });
  };


  return (
    <div className="container mx-auto p-4 md:p-8 space-y-8">
      {/* Feed Management Card */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Rss className="text-primary" /> RSS Feed Management</CardTitle>
          <CardDescription>Add, view, and remove RSS feeds to be processed.</CardDescription>
        </CardHeader>
        <CardContent>
          <form id="addFeedForm" action={addFeedFormAction} className="space-y-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="feedUrl">Feed URL</Label>
                <Input id="feedUrl" name="url" placeholder="https://example.com/feed.xml" required />
                {addFeedState?.error && <p className="text-sm text-destructive mt-1">{addFeedState.error}</p>}
              </div>
              <div>
                <Label htmlFor="feedName">Feed Name (Optional)</Label>
                <Input id="feedName" name="name" placeholder="My Favorite Blog" />
              </div>
            </div>
            <Button type="submit" disabled={isPending} className="w-full md:w-auto">
              <Save className="mr-2 h-4 w-4" /> Add Feed
            </Button>
          </form>
          <Separator className="my-6" />
          <h3 className="text-lg font-semibold mb-2">Current Feeds</h3>
          {feeds.length === 0 ? (
            <p className="text-muted-foreground">No feeds added yet.</p>
          ) : (
            <ScrollArea className="h-48">
              <ul className="space-y-2">
                {feeds.map((feed) => (
                  <li key={feed.id} className="flex justify-between items-center p-2 border rounded-md">
                    <div>
                      <p className="font-medium">{feed.name || feed.url}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-xs md:max-w-md">{feed.url}</p>
                      {feed.lastFetched && <p className="text-xs text-muted-foreground">Last checked: {formatDistanceToNow(new Date(feed.lastFetched), { addSuffix: true })}</p>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveFeed(feed.id)} disabled={isPending} aria-label="Remove feed">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* WordPress Configuration Card */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><WordPress size={24} className="text-primary" /> WordPress Configuration</CardTitle>
          <CardDescription>Configure your WordPress site details for posting summaries. Application Passwords are recommended.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveWpConfigFormAction} className="space-y-4">
            <div>
              <Label htmlFor="siteUrl">Site URL</Label>
              <Input id="siteUrl" name="siteUrl" placeholder="https://yourblog.com" defaultValue={wordPressConfig?.siteUrl} required />
              {saveWpConfigState?.fieldErrors?.siteUrl && <p className="text-sm text-destructive mt-1">{saveWpConfigState.fieldErrors.siteUrl[0]}</p>}
            </div>
            <div>
              <Label htmlFor="username">Username</Label>
              <Input id="username" name="username" placeholder="your_wp_username" defaultValue={wordPressConfig?.username} required />
              {saveWpConfigState?.fieldErrors?.username && <p className="text-sm text-destructive mt-1">{saveWpConfigState.fieldErrors.username[0]}</p>}
            </div>
            <div>
              <Label htmlFor="applicationPassword">Application Password</Label>
              <Input id="applicationPassword" name="applicationPassword" type="password" placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" defaultValue={wordPressConfig?.applicationPassword} required />
              {saveWpConfigState?.fieldErrors?.applicationPassword && <p className="text-sm text-destructive mt-1">{saveWpConfigState.fieldErrors.applicationPassword[0]}</p>}
            </div>
            <Button type="submit" disabled={isPending} className="w-full md:w-auto">
              <Save className="mr-2 h-4 w-4" /> Save Configuration
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Actions Card */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings className="text-primary" /> Actions</CardTitle>
          <CardDescription>Manually trigger the process to fetch, summarize, and post new articles.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleTriggerProcessing} disabled={isPending} className="w-full md:w-auto bg-accent hover:bg-accent/90 text-accent-foreground">
            <Play className="mr-2 h-4 w-4" /> Fetch, Summarize & Post New Articles
          </Button>
        </CardContent>
      </Card>

      {/* Processing Log Card */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ListChecks className="text-primary" /> Processing Log</CardTitle>
          <CardDescription>View the status of recently processed articles.</CardDescription>
        </CardHeader>
        <CardContent>
          {processingLog.length === 0 ? (
            <p className="text-muted-foreground">No processing activity yet. Trigger an action to see logs.</p>
          ) : (
            <ScrollArea className="h-96">
              <ul className="space-y-3">
                {processingLog.map((log) => (
                  <li key={log.id} className="p-3 border rounded-md bg-card hover:bg-muted/50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" title={log.articleTitle}>
                           {iconMap[log.status] || <Info className="h-4 w-4" />} {log.articleTitle}
                        </p>
                        <p className="text-xs text-muted-foreground truncate" title={log.feedUrl}>
                          Feed: {log.feedUrl}
                        </p>
                        {log.summary && (
                          <p className="text-xs mt-1 italic text-muted-foreground line-clamp-2">Summary: {log.summary}</p>
                        )}
                         {log.status === 'posted' && log.wordPressPostUrl && (
                          <a href={log.wordPressPostUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                            View Post
                          </a>
                        )}
                        {log.errorMessage && (
                          <p className="text-xs mt-1 text-destructive">Error: {log.errorMessage}</p>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground ml-2 shrink-0 pt-1">
                        {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
