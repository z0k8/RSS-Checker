export interface FeedConfig {
  id: string;
  url: string;
  name?: string; // Optional name for the feed
  lastFetched?: string; // ISO date string
}

export interface WordPressConfig {
  siteUrl: string;
  username: string;
  applicationPassword: string;
}

export interface ArticleItem {
  guid: string; // Unique identifier for the article, often a permalink or specific ID
  title: string;
  link: string;
  pubDate?: string;
  content?: string; // Full content if available
  contentSnippet?: string; // Short snippet
  isoDate?: string;
}

export interface ProcessedArticleLogEntry {
  id: string; // Unique ID for the log entry (e.g., article guid + timestamp)
  articleGuid: string;
  articleTitle: string;
  feedUrl: string;
  timestamp: string; // ISO date string
  status: 'pending' | 'summarized' | 'unsuitable' | 'posted' | 'error';
  summary?: string;
  isSuitable?: boolean;
  postedToWordPress?: boolean;
  wordPressPostUrl?: string;
  errorMessage?: string;
}
