'use server';

/**
 * @fileOverview Summarizes articles using GenAI, deciding if an article is suitable for summarization.
 *
 * - summarizeArticle - A function that summarizes an article if it is suitable.
 * - SummarizeArticleInput - The input type for the summarizeArticle function.
 * - SummarizeArticleOutput - The return type for the summarizeArticle function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeArticleInputSchema = z.object({
  articleContent: z.string().describe('The content of the article to summarize.'),
});
export type SummarizeArticleInput = z.infer<typeof SummarizeArticleInputSchema>;

const SummarizeArticleOutputSchema = z.object({
  summary: z.string().describe('The summarized content of the article, if applicable.'),
  isSuitable: z.boolean().describe('Whether the article was suitable for summarization.'),
});
export type SummarizeArticleOutput = z.infer<typeof SummarizeArticleOutputSchema>;

export async function summarizeArticle(input: SummarizeArticleInput): Promise<SummarizeArticleOutput> {
  return summarizeArticleFlow(input);
}

const canSummarizeArticle = ai.defineTool(
  {
    name: 'canSummarizeArticle',
    description: 'Determines if an article is suitable for summarization based on length and topic.',
    inputSchema: z.object({
      articleContent: z.string().describe('The content of the article.'),
    }),
    outputSchema: z.boolean(),
  },
  async (input) => {
    // Basic implementation: check if the article length is within a reasonable range.
    // And the the topic is not something unsummzarible
    const length = input.articleContent.length;
    return length > 200 && length < 10000;
  }
);

const summarizeArticlePrompt = ai.definePrompt({
  name: 'summarizeArticlePrompt',
  input: {schema: SummarizeArticleInputSchema},
  output: {schema: SummarizeArticleOutputSchema},
  tools: [canSummarizeArticle],
  prompt: `You are an expert summarizer of online articles.  

  First, use the canSummarizeArticle tool to determine if the article is suitable for summarization.

  If it is, provide a concise summary of the following article:

  {{{articleContent}}}

  If the article is not suitable for summarization, indicate that in the isSuitable field and leave the summary field blank.
  `,
});

const summarizeArticleFlow = ai.defineFlow(
  {
    name: 'summarizeArticleFlow',
    inputSchema: SummarizeArticleInputSchema,
    outputSchema: SummarizeArticleOutputSchema,
  },
  async input => {
    const {
      output,
    } = await summarizeArticlePrompt(input);
    return output!;
  }
);
