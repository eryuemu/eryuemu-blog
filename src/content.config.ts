import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			category: z.string().optional(),
			type: z.enum(['original', 'ai-organized']).optional().default('ai-organized'),
			hideTime: z.boolean().optional().default(false),
		}),
});

const thoughts = defineCollection({
	// Load Markdown and MDX files in the `src/content/thoughts/` directory.
	loader: glob({ base: './src/content/thoughts', pattern: '**/*.{md,mdx}' }),
	schema: () =>
		z.object({
			pubDate: z.coerce.date(),
			tags: z.array(z.string()).optional().default([]),
			location: z.string().optional(),
			mood: z.string().optional(),
			images: z.array(z.string()).optional().default([]),
			pinned: z.boolean().optional().default(false),
		}),
});

export const collections = { blog, thoughts };

