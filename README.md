# eryuemu-blog (二月木的个人博客)

基于 [Astro](https://astro.build/) 构建的个人极客博客，使用物理隔离的 WSL2 (Ubuntu) 环境开发，并实现与本地 Obsidian 知识库的自动化同步与渲染。

## 🚀 项目架构与特点

- **零污染物理隔离**：所有的 Node.js 环境（由 NVM 管理）、开发包及项目仓库全部锁在 WSL2 (Ubuntu) 虚拟磁盘中，完美保持 Windows 主机环境的赛博洁癖。
- **Obsidian 自动化同步**：通过自定义 Node 脚本，直接读取 Windows 宿主机下的本地 Obsidian 知识库，完成 Frontmatter 转换、内部 WikiLinks 解析以及 `![[vault/image.png]]` 图片链接路径重写。
- **极速与 SEO**：基于 Astro 纯静态生成，首屏加载极快，配备 Sitemap、RSS 订阅支持。
- **互动服务**：集成 Waline 评论系统（后端基于 Supabase）及 Vercount 流量计数。

---

## 🛠️ 本地开发指南

### 1. 启动本地开发服务

项目使用自定义 Astro 后台常驻服务管理，请在 WSL2 中执行以下指令：

```bash
# 后台运行 Dev Server
npx astro dev --background

# 查看运行状态
npx astro dev status

# 查看实时日志
npx astro dev logs

# 关闭服务
npx astro dev stop
```

本地预览地址为：[http://localhost:4321](http://localhost:4321)

### 2. 静态生成与构建

```bash
npm run build
```

构建好的静态资源会生成在 `dist/` 文件夹中。

---

## 🔄 Obsidian 笔记同步方案

本项目配备了 `migrate.cjs` 迁移同步脚本，可在发布新文章时随时运行。

### 使用方法

在 WSL2 终端中直接运行：

```bash
node migrate.cjs
```

### 同步机制介绍
1. **源路径**：从 `/mnt/c/MyKnowledgeBase/开发` 读取已整理的公开技术文档。
2. **清洗过滤**：自动排除敏感/草稿性质的文档（配置在 `migrate.cjs` 中的 `skipFiles`）。
3. **内容转化**：
   - 提取原本的创建时间 `created: YYYY-MM-DD` 作为 `pubDate`。
   - 解析 Obsidian 语法图片引用 `![[vault/image.png]]` 并转换为相对路径。
   - 将 Obsidian 的 `[[WikiLinks]]` 按预设映射表转换为 Astro 可读的 URL Slugs。
   - 移除不必要的 Markdown 题头及一级大标题，重构符合 Astro 标准的 Frontmatter 描述。
