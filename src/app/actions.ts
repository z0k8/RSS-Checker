
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import Parser from 'rss-parser';
import type { FeedConfig, WordPressConfig, ProcessedArticleLogEntry, ArticleItem } from '@/types';
import {
  addFeed as addFeedToStorage,
  getFeeds,
  removeFeed as removeFeedFromStorage,
  getWordPressConfig,
  saveWordPressConfig as saveWordPressConfigToStorage,
  getProcessedArticleGuids,
  addProcessedArticleGuid,
  addProcessingLogEntry,
  updateFeed,
  getProcessingLog,
} from '@/lib/config-storage';
import { summarizeArticle } from '@/ai/flows/summarize-article';
import { postToWordPress } from '@/lib/wordpress';

const FeedSchema = z.object({
  url: z.string().url({ message: 'Invalid URL format.' }),
  name: z.string().optional(),
});

const WordPressConfigSchema = z.object({
  siteUrl: z.string().url({ message: 'Invalid Site URL format.' }),
  username: z.string().min(1, { message: 'Username is required.' }),
  applicationPassword: z.string().min(1, { message: 'Application Password is required.' }),
});

export async function addFeedAction(prevState: any, formData: FormData) {
  const validatedFields = FeedSchema.safeParse({
    url: formData.get('url'),
    name: formData.get('name') || undefined,
  });

  if (!validatedFields.success) {
    return {
      success: false,
      error: validatedFields.error.flatten().fieldErrors.url?.[0] || 'Invalid input.',
    };
  }

  try {
    await addFeedToStorage(validatedFields.data);
    revalidatePath('/');
    return { success: true, message: 'Feed added successfully.' };
  } catch (error) {
    console.error('Error adding feed:', error);
    return { success: false, error: 'Failed to add feed.' };
  }
}

export async function removeFeedAction(feedId: string) {
  try {
    await removeFeedFromStorage(feedId);
    revalidatePath('/');
    return { success: true, message: 'Feed removed successfully.' };
  } catch (error) {
    console.error('Error removing feed:', error);
    return { success: false, error: 'Failed to remove feed.' };
  }
}

export async function saveWordPressConfigAction(prevState: any, formData: FormData) {
  const validatedFields = WordPressConfigSchema.safeParse({
    siteUrl: formData.get('siteUrl'),
    username: formData.get('username'),
    applicationPassword: formData.get('applicationPassword'),
  });

  if (!validatedFields.success) {
    return {
      success: false,
      error: 'Invalid WordPress configuration.',
      fieldErrors: validatedFields.error.flatten().fieldErrors,
    };
  }

  try {
    await saveWordPressConfigToStorage(validatedFields.data);
    revalidatePath('/');
    return { success: true, message: 'WordPress configuration saved.' };
  } catch (error) {
    console.error('Error saving WordPress config:', error);
    return { success: false, error: 'Failed to save WordPress configuration.' };
  }
}

const parser = new Parser();

export async function triggerProcessingAction(): Promise<{ success: boolean; message: string; newLogEntries?: ProcessedArticleLogEntry[] }> {
  const feeds = await getFeeds();
  const wpConfig = await getWordPressConfig();
  const processedGuids = await getProcessedArticleGuids();
  const newLogEntries: ProcessedArticleLogEntry[] = [];
  let processingMessageSuffix = '';

  if (!wpConfig) {
    const log = await addProcessingLogEntry({
      articleGuid: 'system-wp-config',
      articleTitle: 'WordPress Configuration Info',
      feedUrl: 'N/A',
      status: 'pending', // Using 'pending' for informational, maps to Info icon
      errorMessage: 'WordPress configuration not found. Articles will be summarized but not posted to WordPress.',
    });
    newLogEntries.push(log);
    processingMessageSuffix = " WordPress posting was skipped due to missing configuration.";
    // Continue processing even if WordPress config is missing
  }

  if (feeds.length === 0) {
     const log = await addProcessingLogEntry({
      articleGuid: 'system-no-feeds',
      articleTitle: 'No Feeds',
      feedUrl: 'N/A',
      status: 'error',
      errorMessage: 'No RSS feeds configured. Please add feeds to process.',
    });
    newLogEntries.push(log);
    return { success: false, message: 'No RSS feeds configured.' + processingMessageSuffix, newLogEntries };
  }

  let articlesProcessedCount = 0;

  for (const feed of feeds) {
    try {
      const parsedFeed = await parser.parseURL(feed.url);
      await updateFeed({ ...feed, lastFetched: new Date().toISOString() });

      for (const item of (parsedFeed.items as ArticleItem[])) {
        const articleGuid = item.guid || item.link;
        if (!articleGuid || processedGuids.has(articleGuid)) {
          continue;
        }

        articlesProcessedCount++;
        const articleContentToSummarize = item.content || item.contentSnippet || item.title || '';
        
        if (articleContentToSummarize.length < 50) {
          const log = await addProcessingLogEntry({
            articleGuid,
            articleTitle: item.title || 'Untitled Article',
            feedUrl: feed.url,
            status: 'unsuitable',
            isSuitable: false,
            errorMessage: 'Article content too short for summarization.',
          });
          newLogEntries.push(log);
          await addProcessedArticleGuid(articleGuid);
          continue;
        }
        
        const aiResponse = await summarizeArticle({ articleContent: articleContentToSummarize });

        if (!aiResponse.isSuitable || !aiResponse.summary) {
          const log = await addProcessingLogEntry({
            articleGuid,
            articleTitle: item.title || 'Untitled Article',
            feedUrl: feed.url,
            status: 'unsuitable',
            isSuitable: aiResponse.isSuitable,
            summary: aiResponse.summary,
            errorMessage: aiResponse.isSuitable ? 'AI deemed content suitable but failed to produce summary.' : 'AI deemed content unsuitable for summarization.',
          });
          newLogEntries.push(log);
          await addProcessedArticleGuid(articleGuid);
          continue;
        }
        
        // Log summary success first
        const logSummary = await addProcessingLogEntry({
          articleGuid,
          articleTitle: item.title || 'Untitled Article',
          feedUrl: feed.url,
          status: 'summarized',
          summary: aiResponse.summary,
          isSuitable: true,
          // postedToWordPress will be updated if posting is successful
        });
        newLogEntries.push(logSummary);

        // Attempt to post to WordPress only if config is available
        if (wpConfig) {
          const postResult = await postToWordPress(wpConfig, {
            title: item.title || 'Summarized Article',
            content: aiResponse.summary,
            status: 'publish',
          });

          if (postResult.success) {
            // Update the existing log entry or add a new 'posted' one.
            // For simplicity, let's add a new 'posted' log entry if it's a distinct step.
            // Or, update the 'summarized' log. Let's add a 'posted' entry.
             const logPost = await addProcessingLogEntry({
              articleGuid, // Same GUID
              articleTitle: item.title || 'Untitled Article',
              feedUrl: feed.url,
              status: 'posted',
              summary: aiResponse.summary, // Keep summary for context
              isSuitable: true,
              postedToWordPress: true,
              wordPressPostUrl: postResult.postUrl,
            });
            // Remove the previous 'summarized' log for this article to avoid duplicate-like entries
            const index = newLogEntries.findIndex(l => l.id === logSummary.id);
            if (index > -1) newLogEntries.splice(index, 1);
            newLogEntries.push(logPost);

          } else {
            // Posting failed, log error for this article
            const logError = await addProcessingLogEntry({
              articleGuid,
              articleTitle: item.title || 'Untitled Article',
              feedUrl: feed.url,
              status: 'error',
              summary: aiResponse.summary,
              isSuitable: true,
              postedToWordPress: false,
              errorMessage: `WordPress posting failed: ${postResult.error}`,
            });
             // Remove the previous 'summarized' log for this article
            const index = newLogEntries.findIndex(l => l.id === logSummary.id);
            if (index > -1) newLogEntries.splice(index, 1);
            newLogEntries.push(logError);
          }
        }
        // If wpConfig is not present, the article remains 'summarized' and not posted.
        // The `postedToWordPress` field on the 'summarized' log will be false/undefined by default.
        
        await addProcessedArticleGuid(articleGuid);
      }
    } catch (error) {
      console.error(`Error processing feed ${feed.url}:`, error);
      const log = await addProcessingLogEntry({
        articleGuid: `feed-error-${feed.id}`,
        articleTitle: `Error processing feed: ${feed.name || feed.url}`,
        feedUrl: feed.url,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error processing feed.',
      });
      newLogEntries.push(log);
    }
  }
  
  revalidatePath('/');

  if (articlesProcessedCount === 0 && feeds.length > 0) {
    const log = await addProcessingLogEntry({
        articleGuid: 'system-no-new-articles',
        articleTitle: 'No New Articles',
        feedUrl: 'N/A',
        status: 'pending', 
        errorMessage: 'No new articles found in configured feeds.',
    });
    newLogEntries.push(log);
    return { success: true, message: 'Processing complete. No new articles found.' + processingMessageSuffix, newLogEntries };
  }

  return { success: true, message: `Processing complete. Checked ${feeds.length} feeds. Processed ${articlesProcessedCount} new articles.` + processingMessageSuffix, newLogEntries };
}

// Action to get initial data for the client component
export async function getInitialDashboardData() {
  const feeds = await getFeeds();
  const wordpressConfig = await getWordPressConfig();
  const processingLog = await getProcessingLog();
  return {
    feeds,
    wordpressConfig,
    processingLog,
  };
}

