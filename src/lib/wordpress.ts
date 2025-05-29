import type { WordPressConfig } from '@/types';

interface WordPressPostArgs {
  title: string;
  content: string;
  status?: 'publish' | 'pending' | 'draft';
}

interface WordPressPostResponse {
  id: number;
  link: string;
  // ... other fields
}

export async function postToWordPress(
  config: WordPressConfig,
  postData: WordPressPostArgs
): Promise<{ success: boolean; error?: string; postUrl?: string }> {
  const { siteUrl, username, applicationPassword } = config;
  const { title, content, status = 'publish' } = postData;

  if (!siteUrl || !username || !applicationPassword) {
    return { success: false, error: 'WordPress configuration is incomplete.' };
  }

  let apiUrl = siteUrl;
  if (!apiUrl.endsWith('/')) {
    apiUrl += '/';
  }
  apiUrl += 'wp-json/wp/v2/posts';

  const credentials = Buffer.from(`${username}:${applicationPassword}`).toString('base64');

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify({
        title,
        content,
        status,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error format' }));
      console.error('WordPress API Error:', response.status, errorData);
      return {
        success: false,
        error: `Failed to post to WordPress (Status ${response.status}): ${errorData.message || 'Unknown error'}`,
      };
    }

    const responseData = (await response.json()) as WordPressPostResponse;
    return { success: true, postUrl: responseData.link };
  } catch (error) {
    console.error('Error posting to WordPress:', error);
    return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred during WordPress post.' };
  }
}
