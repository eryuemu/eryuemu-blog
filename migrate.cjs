const fs = require('fs');
const path = require('path');

// WSL2 Paths (adjust if paths change)
const srcDir = '/mnt/c/MyKnowledgeBase/开发';
const destDir = path.join(__dirname, 'src/content/blog');

// Files to skip as per request or meta files
const skipFiles = [
  'eryuemu-blog 部署与评论系统搭建全复盘.md',
  '工具.md'
];

// Mapping from original Obsidian filename to url slug
const slugMap = {
  "Claude Code 安装与配置完全指南": "claude-code-installation-guide",
  "HBU-Wiki 开发环境搭建：从fnm到项目级Node.js隔离": "hbu-wiki-dev-env-setup",
  "Python-Windows下Errno22排查实录": "python-windows-errno22-troubleshooting",
  "WSL2 实战手册：空间账单、symlink 陷阱与 cc-switch 四连坑": "wsl2-practical-guide",
  "Windows 开发环境大扫除：从C盘灾难到WSL2物理隔离": "windows-dev-env-cleanup",
  "本地知识库与博客搭建思路": "knowledge-base-and-blog-setup",
  "社交媒体数据采集-隔离环境搭建": "social-media-data-scraping-isolation"
};

console.log('--- Starting Blog Migration ---');

// 1. Clean up destination directory
if (fs.existsSync(destDir)) {
  const files = fs.readdirSync(destDir);
  for (const file of files) {
    fs.unlinkSync(path.join(destDir, file));
    console.log(`Cleared placeholder/old post: ${file}`);
  }
} else {
  fs.mkdirSync(destDir, { recursive: true });
}

// 2. Read and process files from Obsidian folder
if (!fs.existsSync(srcDir)) {
  console.error(`Error: Source directory "${srcDir}" does not exist!`);
  process.exit(1);
}

const files = fs.readdirSync(srcDir);
let successCount = 0;

for (const file of files) {
  if (skipFiles.includes(file) || !file.endsWith('.md')) {
    console.log(`Skipping file: ${file}`);
    continue;
  }

  const filePath = path.join(srcDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  // A. Extract publication date from original frontmatter
  let pubDate = '2026-07-18'; // Default fallback
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (frontmatterMatch) {
    const yaml = frontmatterMatch[1];
    const createdMatch = yaml.match(/(?:created|date):\s*([\d-]+)/);
    if (createdMatch) {
      pubDate = createdMatch[1];
    }
  }

  // B. Remove the original frontmatter block
  let body = content.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').trim();

  // C. Parse the title (first H1 heading `# ...`)
  let title = path.basename(file, '.md'); // fallback
  const titleMatch = body.match(/^#\s+(.+)/);
  if (titleMatch) {
    title = titleMatch[1].trim();
    body = body.replace(/^#\s+.*/, '').trim();
  }

  // D. Parse the description (first blockquote `> ...`)
  let description = '';
  const descMatch = body.match(/^>\s+(.+)/);
  if (descMatch) {
    description = descMatch[1].trim();
    body = body.replace(/^>\s+.*/, '').trim();
  } else {
    // Fallback description from first paragraph of text
    const textMatch = body.match(/^([^#\s>].+)/);
    if (textMatch) {
      description = textMatch[1].trim().substring(0, 120) + '...';
    } else {
      description = title;
    }
  }

  // E. Remove leading horizontal divider or newlines if any
  body = body.replace(/^---/, '').trim();

  // F. Replace Obsidian Image links FIRST: ![[vault/img.png]] -> ![img](../../assets/img.png)
  body = body.replace(/!\[\[(?:vault\/)?([^\]]+)\]\]/g, (match, imageName) => {
    return `![${imageName}](../../assets/${imageName})`;
  });

  // G. Replace Obsidian WikiLinks: [[Path/To/Page|Display Text]] -> [Display Text](/blog/slug)
  body = body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, linkPath, displayText) => {
    let cleanPath = linkPath.replace(/^开发\//, '').trim();
    const slug = slugMap[cleanPath];
    const text = displayText ? displayText.trim() : cleanPath;

    if (slug) {
      return `[${text}](/blog/${slug})`;
    } else if (cleanPath === 'eryuemu-blog 部署与评论系统搭建全复盘') {
      return `**${text}**`;
    } else {
      // Default fallback for any other wiki links
      return `**${text}**`;
    }
  });

  // H. Construct the clean Astro frontmatter
  const cleanFrontmatter = [
    '---',
    `title: '${title.replace(/'/g, "''")}'`,
    `description: '${description.replace(/'/g, "''")}'`,
    `pubDate: '${pubDate}'`,
    '---',
    '',
    body
  ].join('\n');

  // I. Write to destination file
  const baseName = path.basename(file, '.md');
  const destSlug = slugMap[baseName] || baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const destPath = path.join(destDir, `${destSlug}.md`);

  fs.writeFileSync(destPath, cleanFrontmatter, 'utf-8');
  console.log(`Successfully migrated: "${file}" -> "${destSlug}.md"`);
  successCount++;
}

console.log(`--- Migration complete. Successfully processed ${successCount} articles. ---`);
