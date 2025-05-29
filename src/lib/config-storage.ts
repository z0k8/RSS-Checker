import type { FeedConfig, WordPressConfig, ProcessedArticleLogEntry } from '@/types';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'src', 'data');
const FEEDS_FILE = path.join(DATA_DIR, 'feeds.json');
const WORDPRESS_CONFIG_FILE = path.join(DATA_DIR, 'wordpress-config.json');
const PROCESSED_ARTICLE_GUIDS_FILE = path.join(DATA_DIR, 'processed-article-guids.json');
const PROCESSING_LOG_FILE = path.join(DATA_DIR, 'processing-log.json');

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create data directory:', error);
  }
}

async function readFile<T>(filePath: string, defaultValue: T): Promise<T> {
  await ensureDataDir();
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist, create it with default value
      await writeFile(filePath, defaultValue);
      return defaultValue;
    }
    console.error(`Error reading file ${filePath}:`, error);
    return defaultValue; // Or throw, depending on desired error handling
  }
}

async function writeFile<T>(filePath: string, data: T): Promise<void> {
  await ensureDataDir();
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
    // Or throw
  }
}

// Feeds Management
export async function getFeeds(): Promise<FeedConfig[]> {
  return readFile<FeedConfig[]>(FEEDS_FILE, []);
}

export async function addFeed(newFeed: Omit<FeedConfig, 'id' | 'lastFetched'>): Promise<FeedConfig> {
  const feeds = await getFeeds();
  const feedWithId: FeedConfig = { 
    ...newFeed, 
    id: Date.now().toString() + Math.random().toString(36).substring(2, 9) // Simple unique ID
  };
  feeds.push(feedWithId);
  await writeFile(FEEDS_FILE, feeds);
  return feedWithId;
}

export async function removeFeed(feedId: string): Promise<void> {
  let feeds = await getFeeds();
  feeds = feeds.filter(feed => feed.id !== feedId);
  await writeFile(FEEDS_FILE, feeds);
}

export async function updateFeed(updatedFeed: FeedConfig): Promise<void> {
  const feeds = await getFeeds();
  const index = feeds.findIndex(f => f.id === updatedFeed.id);
  if (index !== -1) {
    feeds[index] = updatedFeed;
    await writeFile(FEEDS_FILE, feeds);
  }
}

// WordPress Configuration
export async function getWordPressConfig(): Promise<WordPressConfig | null> {
  return readFile<WordPressConfig | null>(WORDPRESS_CONFIG_FILE, null);
}

export async function saveWordPressConfig(config: WordPressConfig): Promise<void> {
  await writeFile(WORDPRESS_CONFIG_FILE, config);
}

// Processed Article GUIDs
export async function getProcessedArticleGuids(): Promise<Set<string>> {
  const guidsArray = await readFile<string[]>(PROCESSED_ARTICLE_GUIDS_FILE, []);
  return new Set(guidsArray);
}

export async function addProcessedArticleGuid(articleGuid: string): Promise<void> {
  const guidsSet = await getProcessedArticleGuids();
  guidsSet.add(articleGuid);
  await writeFile(PROCESSED_ARTICLE_GUIDS_FILE, Array.from(guidsSet));
}

// Processing Log
export async function getProcessingLog(): Promise<ProcessedArticleLogEntry[]> {
  const logs = await readFile<ProcessedArticleLogEntry[]>(PROCESSING_LOG_FILE, []);
  return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // Newest first
}

export async function addProcessingLogEntry(entry: Omit<ProcessedArticleLogEntry, 'id' | 'timestamp'>): Promise<ProcessedArticleLogEntry> {
  const logs = await getProcessingLog(); // existing logs are already sorted
  const newEntry: ProcessedArticleLogEntry = {
    ...entry,
    id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
  };
  // Add to the beginning to maintain sort order (newest first)
  const updatedLogs = [newEntry, ...logs];
  await writeFile(PROCESSING_LOG_FILE, updatedLogs.slice(0, 100)); // Keep last 100 logs
  return newEntry;
}

// Initialize files if they don't exist with empty defaults
export async function initializeDataFiles() {
  await getFeeds();
  await getWordPressConfig();
  await getProcessedArticleGuids();
  await getProcessingLog();
}
