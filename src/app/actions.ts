
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
  getProcessingLog, // Added import
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

  if (!wpConfig) {
    const log = await addProcessingLogEntry({
      articleGuid: 'system',
      articleTitle: 'Processing Error',
      feedUrl: 'N/A',
      status: 'error',
      errorMessage: 'WordPress configuration not found. Please set it up first.',
    });
    newLogEntries.push(log);
    return { success: false, message: 'WordPress configuration not found.', newLogEntries };
  }

  if (feeds.length === 0) {
     const log = await addProcessingLogEntry({
      articleGuid: 'system',
      articleTitle: 'No Feeds',
      feedUrl: 'N/A',
      status: 'error',
      errorMessage: 'No RSS feeds configured. Please add feeds to process.',
    });
    newLogEntries.push(log);
    return { success: false, message: 'No RSS feeds configured.', newLogEntries };
  }

  let articlesProcessedCount = 0;

  for (const feed of feeds) {
    try {
      const parsedFeed = await parser.parseURL(feed.url);
      await updateFeed({ ...feed, lastFetched: new Date().toISOString() });

      for (const item of (parsedFeed.items as ArticleItem[])) {
        const articleGuid = item.guid || item.link; // Use guid, fallback to link
        if (!articleGuid || processedGuids.has(articleGuid)) {
          continue;
        }

        articlesProcessedCount++;
        const articleContentToSummarize = item.content || item.contentSnippet || item.title || '';
        
        if (articleContentToSummarize.length < 50) { // Too short to summarize
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
        
        const logSummary = await addProcessingLogEntry({
          articleGuid,
          articleTitle: item.title || 'Untitled Article',
          feedUrl: feed.url,
          status: 'summarized',
          summary: aiResponse.summary,
          isSuitable: true,
        });
        newLogEntries.push(logSummary);

        // Post to WordPress
        const postResult = await postToWordPress(wpConfig, {
          title: item.title || 'Summarized Article',
          content: aiResponse.summary,
          status: 'publish',
        });

        if (postResult.success) {
          const logPost = await addProcessingLogEntry({
            articleGuid,
            articleTitle: item.title || 'Untitled Article',
            feedUrl: feed.url,
            status: 'posted',
            summary: aiResponse.summary,
            isSuitable: true,
            postedToWordPress: true,
            wordPressPostUrl: postResult.postUrl,
          });
          newLogEntries.push(logPost);
        } else {
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
          newLogEntries.push(logError);
        }
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
        articleGuid: 'system',
        articleTitle: 'No New Articles',
        feedUrl: 'N/A',
        status: 'unsuitable', // Using 'unsuitable' as a generic "nothing to do"
        errorMessage: 'No new articles found in configured feeds.',
    });
    newLogEntries.push(log);
    return { success: true, message: 'Processing complete. No new articles found.', newLogEntries };
  }

  return { success: true, message: `Processing complete. Checked ${feeds.length} feeds. Processed ${articlesProcessedCount} new articles.`, newLogEntries };
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

